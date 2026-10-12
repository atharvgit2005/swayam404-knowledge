/**
 * Safe Local Caching Service for Swayam404 Knowledge Base
 *
 * Implements atomic update commit, version change detection, offline-first fallback,
 * and strict failure preservation (failed sync preserves previous valid cache intact).
 *
 * Phase 4 Enhancements:
 * - Concurrent sync protection (single-flight deduplication).
 * - Course-selective updates (cache only selected courses).
 * - Partial course failure resilience (one failing pack does not destroy other valid courses).
 * - Conditional request ETag/304 tracking.
 */

import {
  KnowledgeManifest,
  KnowledgeCoursePack,
  KnowledgeCacheMetadata,
  KnowledgeSyncResult,
  KnowledgeSyncOptions,
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeUpdateState,
  KnowledgeUpdateCheckResult,
} from '@/types/knowledge';
import { StorageService } from '@/lib/storage';
import { IKnowledgeLoader } from './client';
import { KnowledgeValidator } from './validator';

export class KnowledgeCacheService {
  // Concurrency guard: prevents multiple overlapping sync operations
  private static activeSyncPromise: Promise<KnowledgeSyncResult> | null = null;

  /**
   * Retrieves the currently cached manifest, or null if no cache exists.
   */
  static async getCachedManifest(): Promise<KnowledgeManifest | null> {
    return await StorageService.getKnowledgeManifest();
  }

  /**
   * Retrieves all cached course packs keyed by courseId.
   */
  static async getCachedCoursePacks(): Promise<Record<string, KnowledgeCoursePack>> {
    return await StorageService.getKnowledgeCoursePacks();
  }

  /**
   * Retrieves a single cached course pack by courseId.
   */
  static async getCachedCoursePack(courseId: string): Promise<KnowledgeCoursePack | null> {
    const packs = await this.getCachedCoursePacks();
    return packs[courseId] || null;
  }

  /**
   * Retrieves cached resources for a specific courseId.
   */
  static async getCachedResources(courseId: string): Promise<KnowledgeResource[]> {
    const pack = await this.getCachedCoursePack(courseId);
    return pack ? pack.resources : [];
  }

  /**
   * Retrieves cached released review records for a specific courseId.
   */
  static async getCachedReviewRecords(courseId: string): Promise<KnowledgeReviewRecord[]> {
    const pack = await this.getCachedCoursePack(courseId);
    return pack ? pack.reviewRecords : [];
  }

  /**
   * Retrieves cache synchronization metadata.
   */
  static async getCachedMetadata(): Promise<KnowledgeCacheMetadata | null> {
    return await StorageService.getKnowledgeMetadata();
  }

  /**
   * Clears all cached knowledge packs and metadata.
   */
  static async clearCache(): Promise<void> {
    await StorageService.clearKnowledgeCache();
  }

  /**
   * Non-destructive preflight check for newer manifest / course packs.
   * Avoids downloading full packs. Only fetches remote manifest.
   */
  static async checkForUpdates(
    loader: IKnowledgeLoader,
    repoUrl: string,
    signal?: AbortSignal
  ): Promise<KnowledgeUpdateCheckResult> {
    if (!loader.isConfigured() || !repoUrl.trim()) {
      return {
        updateAvailable: false,
        state: 'unconfigured',
        changedCourses: [],
        newCourses: [],
      };
    }

    const existingManifest = await this.getCachedManifest();
    const existingPacks = await this.getCachedCoursePacks();
    const existingMeta = await this.getCachedMetadata();

    let remoteManifest: KnowledgeManifest | null = null;
    let notModified = false;

    try {
      if (typeof loader.fetchManifestConditional === 'function') {
        const cond = await loader.fetchManifestConditional({
          etag: existingMeta?.etags?.['manifest.json'],
          lastModified: existingMeta?.lastModified?.['manifest.json'],
          signal,
        });
        notModified = cond.notModified;
        remoteManifest = cond.data || (notModified ? existingManifest : null);
      } else {
        remoteManifest = await loader.fetchManifest(signal);
      }
    } catch (err: unknown) {
      const e = err as Error;
      const isOffline =
        (err as { isNetworkError?: boolean })?.isNetworkError ||
        (err as { isTimeout?: boolean })?.isTimeout ||
        e.message.toLowerCase().includes('fetch') ||
        e.message.toLowerCase().includes('network') ||
        e.message.toLowerCase().includes('econnrefused');

      const offlineState: KnowledgeUpdateState = isOffline ? 'offline' : 'update-failed';
      await StorageService.saveKnowledgeUpdateState({
        status: offlineState,
        lastError: e.message,
        lastChecked: new Date().toISOString(),
      });

      return {
        updateAvailable: false,
        state: offlineState,
        currentVersion: existingManifest?.datasetVersion,
        changedCourses: [],
        newCourses: [],
        error: e.message,
        isOffline,
      };
    }

    if (notModified && existingManifest) {
      await StorageService.saveKnowledgeUpdateState({
        status: 'up-to-date',
        remoteDatasetVersion: existingManifest.datasetVersion,
        lastChecked: new Date().toISOString(),
      });
      return {
        updateAvailable: false,
        state: 'up-to-date',
        currentVersion: existingManifest.datasetVersion,
        latestVersion: existingManifest.datasetVersion,
        changedCourses: [],
        newCourses: [],
      };
    }

    if (!remoteManifest) {
      await StorageService.saveKnowledgeUpdateState({
        status: 'update-failed',
        lastError: 'Could not fetch remote manifest',
        lastChecked: new Date().toISOString(),
      });
      return {
        updateAvailable: false,
        state: 'update-failed',
        currentVersion: existingManifest?.datasetVersion,
        changedCourses: [],
        newCourses: [],
        error: 'Could not fetch remote manifest',
      };
    }

    const val = KnowledgeValidator.validateManifest(remoteManifest);
    if (!val.isValid || !val.data) {
      await StorageService.saveKnowledgeUpdateState({
        status: 'update-failed',
        lastError: 'Remote manifest failed validation',
        lastChecked: new Date().toISOString(),
      });
      return {
        updateAvailable: false,
        state: 'update-failed',
        currentVersion: existingManifest?.datasetVersion,
        changedCourses: [],
        newCourses: [],
        error: 'Remote manifest failed validation',
      };
    }

    const validatedRemote = val.data;
    const currentVersion = existingManifest?.datasetVersion;
    const latestVersion = validatedRemote.datasetVersion;

    const changedCourses: string[] = [];
    const newCourses: string[] = [];

    for (const c of validatedRemote.courses) {
      const existingPack = existingPacks[c.courseId];
      if (!existingPack) {
        newCourses.push(c.courseId);
      } else {
        const hashDiffers =
          Boolean(c.contentHash) &&
          Boolean(existingPack.contentHash) &&
          c.contentHash.toLowerCase() !== existingPack.contentHash!.toLowerCase();
        const verDiffers = c.coursePackVersion !== existingPack.course.coursePackVersion;
        if (hashDiffers || verDiffers) {
          changedCourses.push(c.courseId);
        }
      }
    }

    const versionDiffers = Boolean(currentVersion && latestVersion && currentVersion !== latestVersion);
    const updateAvailable = !currentVersion || versionDiffers || newCourses.length > 0 || changedCourses.length > 0;
    const state: KnowledgeUpdateState = updateAvailable ? 'update-available' : 'up-to-date';

    await StorageService.saveKnowledgeUpdateState({
      status: state,
      remoteDatasetVersion: latestVersion,
      lastChecked: new Date().toISOString(),
    });

    return {
      updateAvailable,
      state,
      currentVersion,
      latestVersion,
      changedCourses,
      newCourses,
    };
  }

  /**
   * Public entrypoint for atomic synchronization from remote knowledge repository.
   * Prevents concurrent sync collisions by sharing an active in-flight Promise.
   */
  static async syncFromRemote(
    loader: IKnowledgeLoader,
    repoUrl: string,
    optionsOrSignal?: KnowledgeSyncOptions | AbortSignal
  ): Promise<KnowledgeSyncResult> {
    if (this.activeSyncPromise) {
      return await this.activeSyncPromise;
    }

    const promise = this.executeSync(loader, repoUrl, optionsOrSignal);
    this.activeSyncPromise = promise;

    // Set downloading state asynchronously without blocking mutex
    StorageService.saveKnowledgeUpdateState({
      status: 'downloading',
      lastChecked: new Date().toISOString(),
    }).catch(() => {});
    try {
      const res = await promise;
      if (res.success) {
        await StorageService.saveKnowledgeUpdateState({
          status: 'updated',
          remoteDatasetVersion: res.datasetVersion,
          lastChecked: new Date().toISOString(),
        });
      }
      return res;
    } catch (syncErr: unknown) {
      const e = syncErr as Error;
      const isOffline =
        (syncErr as { isNetworkError?: boolean })?.isNetworkError ||
        (syncErr as { isTimeout?: boolean })?.isTimeout ||
        e.message.toLowerCase().includes('fetch') ||
        e.message.toLowerCase().includes('network') ||
        e.message.toLowerCase().includes('econnrefused');

      await StorageService.saveKnowledgeUpdateState({
        status: isOffline ? 'offline' : 'update-failed',
        lastError: e.message,
        lastChecked: new Date().toISOString(),
      });
      throw syncErr;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  /**
   * Internal execution of atomic sync.
   */
  private static async executeSync(
    loader: IKnowledgeLoader,
    repoUrl: string,
    optionsOrSignal?: KnowledgeSyncOptions | AbortSignal
  ): Promise<KnowledgeSyncResult> {
    if (!loader.isConfigured()) {
      return {
        success: false,
        message: 'Knowledge repository URL is not configured.',
        downloadedCourses: 0,
        downloadedResources: 0,
        downloadedReviewRecords: 0,
      };
    }

    // Normalize options or AbortSignal
    const options: KnowledgeSyncOptions =
      optionsOrSignal instanceof AbortSignal ||
      (optionsOrSignal && typeof (optionsOrSignal as AbortSignal).aborted === 'boolean')
        ? { signal: optionsOrSignal as AbortSignal }
        : (optionsOrSignal as KnowledgeSyncOptions) || {};

    const signal = options.signal;
    const existingManifest = await this.getCachedManifest();
    const existingPacks = await this.getCachedCoursePacks();
    const existingMeta = await this.getCachedMetadata();

    // 1. Fetch remote manifest with conditional headers if available
    let remoteManifest: KnowledgeManifest | null = null;
    let manifestNotModified = false;
    let manifestEtag: string | undefined;
    let manifestLastMod: string | undefined;

    const cachedManifestEtag = existingMeta?.etags?.['manifest.json'];
    const cachedManifestLastMod = existingMeta?.lastModified?.['manifest.json'];

    if (typeof loader.fetchManifestConditional === 'function') {
      const condResult = await loader.fetchManifestConditional({
        etag: cachedManifestEtag,
        lastModified: cachedManifestLastMod,
        signal,
      });
      manifestNotModified = condResult.notModified;
      manifestEtag = condResult.etag;
      manifestLastMod = condResult.lastModified;
      remoteManifest = condResult.data;
    } else {
      remoteManifest = await loader.fetchManifest(signal);
    }

    // If HTTP 304 received on manifest and existing manifest is valid, reuse it
    if (manifestNotModified && existingManifest) {
      remoteManifest = existingManifest;
    }

    if (!remoteManifest) {
      return {
        success: false,
        message: 'Could not fetch remote manifest.',
        downloadedCourses: 0,
        downloadedResources: 0,
        downloadedReviewRecords: 0,
      };
    }

    // Validate remote manifest defensively
    const manifestVal = KnowledgeValidator.validateManifest(remoteManifest);
    if (!manifestVal.isValid || !manifestVal.data) {
      const errs = manifestVal.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
      throw new Error(`Remote manifest failed validation: ${errs}`);
    }

    const validatedRemoteManifest = manifestVal.data;

    // 2. Determine target courses to sync (course-selective support)
    const targetEntries =
      options.selectedCourseIds && options.selectedCourseIds.length > 0
        ? validatedRemoteManifest.courses.filter((c) =>
            options.selectedCourseIds!.includes(c.courseId)
          )
        : validatedRemoteManifest.courses;

    // Staging dictionary initialized with existing packs to preserve previously cached courses
    const stagedPacks: Record<string, KnowledgeCoursePack> = { ...existingPacks };
    const etags: Record<string, string> = { ...existingMeta?.etags };
    const lastModifiedHeaders: Record<string, string> = { ...existingMeta?.lastModified };
    const courseVersions: Record<string, string> = { ...existingMeta?.courseVersions };
    const courseSyncStatus: Record<string, 'synced' | 'failed' | 'partial'> = {
      ...existingMeta?.courseSyncStatus,
    };
    const courseErrors: Record<string, string> = {};

    if (manifestEtag) etags['manifest.json'] = manifestEtag;
    if (manifestLastMod) lastModifiedHeaders['manifest.json'] = manifestLastMod;

    let newlyDownloadedCourses = 0;
    let newlyDownloadedResources = 0;
    let newlyDownloadedReviewRecords = 0;
    let needsUpdate = false;

    if (
      !existingManifest ||
      existingManifest.datasetVersion !== validatedRemoteManifest.datasetVersion ||
      options.forceRefresh
    ) {
      needsUpdate = true;
    }

    let successfulCoursesInBatch = 0;
    let failedCoursesInBatch = 0;

    // 3. Process target course packs
    for (const courseEntry of targetEntries) {
      const existingPack = existingPacks[courseEntry.courseId];
      const isPackUnchanged =
        !options.forceRefresh &&
        existingPack &&
        existingPack.contentHash &&
        courseEntry.contentHash &&
        existingPack.contentHash.toLowerCase() === courseEntry.contentHash.toLowerCase();

      if (isPackUnchanged && existingPack) {
        // Reuse cached pack directly without re-downloading
        stagedPacks[courseEntry.courseId] = existingPack;
        courseSyncStatus[courseEntry.courseId] = 'synced';
        courseVersions[courseEntry.courseId] = courseEntry.coursePackVersion;
        successfulCoursesInBatch++;
        continue;
      }

      // Changed, new, or force-refreshed pack: fetch with partial failure resilience
      needsUpdate = true;
      try {
        let downloadedPack: KnowledgeCoursePack | null = null;
        let packNotModified = false;
        const cachedPackEtag = etags[courseEntry.resourcesPath];
        const cachedPackLastMod = lastModifiedHeaders[courseEntry.resourcesPath];

        if (typeof loader.fetchCoursePackConditional === 'function') {
          const condPack = await loader.fetchCoursePackConditional(courseEntry, {
            etag: cachedPackEtag,
            lastModified: cachedPackLastMod,
            signal,
          });
          packNotModified = condPack.notModified;
          if (condPack.etag) etags[courseEntry.resourcesPath] = condPack.etag;
          if (condPack.lastModified) lastModifiedHeaders[courseEntry.resourcesPath] = condPack.lastModified;
          downloadedPack = condPack.data;
        } else {
          downloadedPack = await loader.fetchCoursePack(courseEntry, signal);
        }

        if (packNotModified && existingPack) {
          stagedPacks[courseEntry.courseId] = existingPack;
          courseSyncStatus[courseEntry.courseId] = 'synced';
          courseVersions[courseEntry.courseId] = courseEntry.coursePackVersion;
          successfulCoursesInBatch++;
          continue;
        }

        if (!downloadedPack) {
          throw new Error(`Empty pack returned for course '${courseEntry.courseId}'`);
        }

        // Validate the downloaded pack
        const packVal = KnowledgeValidator.validateCoursePack(downloadedPack);
        if (!packVal.isValid || !packVal.data) {
          const errs = packVal.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
          throw new Error(
            `Validation failed for newly downloaded course pack '${courseEntry.courseId}': ${errs}`
          );
        }

        stagedPacks[courseEntry.courseId] = packVal.data;
        courseSyncStatus[courseEntry.courseId] = 'synced';
        courseVersions[courseEntry.courseId] = courseEntry.coursePackVersion;
        newlyDownloadedCourses++;
        newlyDownloadedResources += packVal.data.resources.length;
        newlyDownloadedReviewRecords += packVal.data.reviewRecords.length;
        successfulCoursesInBatch++;
      } catch (err: unknown) {
        failedCoursesInBatch++;
        const errMsg = (err as Error).message || 'Unknown course pack fetch error';
        courseErrors[courseEntry.courseId] = errMsg;
        courseSyncStatus[courseEntry.courseId] = 'failed';

        // Partial course failure resilience:
        // If course was already validly cached previously, keep previous valid cache intact!
        if (existingPack) {
          stagedPacks[courseEntry.courseId] = existingPack;
        }
      }
    }

    // If ALL target courses failed and zero courses were successful or preserved:
    if (targetEntries.length > 0 && successfulCoursesInBatch === 0 && failedCoursesInBatch > 0) {
      const firstErr = Object.values(courseErrors)[0] || 'All course downloads failed';
      throw new Error(firstErr);
    }

    // If nothing changed remotely and we didn't download new packs
    if (!needsUpdate && existingManifest && newlyDownloadedCourses === 0) {
      return {
        success: true,
        message: `Knowledge base is already up to date (version ${existingManifest.datasetVersion}).`,
        downloadedCourses: 0,
        downloadedResources: 0,
        downloadedReviewRecords: 0,
        datasetVersion: existingManifest.datasetVersion,
      };
    }

    // 4. Atomic Commit: Write staged packs, manifest, and metadata to storage
    const totalRes = Object.values(stagedPacks).reduce((sum, p) => sum + p.resources.length, 0);
    const totalRR = Object.values(stagedPacks).reduce((sum, p) => sum + p.reviewRecords.length, 0);

    const metadata: KnowledgeCacheMetadata = {
      datasetVersion: validatedRemoteManifest.datasetVersion,
      schemaVersion: validatedRemoteManifest.schemaVersion,
      lastSuccessfulSync: new Date().toISOString(),
      repoUrl,
      courseIds: Object.keys(stagedPacks),
      totalResources: totalRes,
      totalReviewRecords: totalRR,
      etags,
      lastModified: lastModifiedHeaders,
      courseVersions,
      courseSyncStatus,
    };

    await StorageService.saveKnowledgeCoursePacks(stagedPacks);
    await StorageService.saveKnowledgeManifest(validatedRemoteManifest);
    await StorageService.saveKnowledgeMetadata(metadata);

    // Auto-register any newly added course entries from the validated remote manifest into StorageService courses
    try {
      const currentCourses = await StorageService.getCourses();
      for (const courseEntry of validatedRemoteManifest.courses) {
        if (!currentCourses.some((c) => c.id === courseEntry.courseId)) {
          await StorageService.saveCourse({
            id: courseEntry.courseId,
            name: courseEntry.courseTitle,
            code: courseEntry.courseId.toUpperCase(),
            externalCourseId: courseEntry.courseId,
            description: `${courseEntry.institution || 'SWAYAM'} · ${courseEntry.provider || 'SWAYAM'} · ${courseEntry.language}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (regErr) {
      console.warn('[KnowledgeCacheService] Could not auto-register new course:', regErr);
    }

    const hasPartialErrors = Object.keys(courseErrors).length > 0;
    const statusMsg = hasPartialErrors
      ? `Partially synchronized: ${newlyDownloadedCourses} course(s) updated, ${failedCoursesInBatch} course(s) preserved from previous cache.`
      : `Successfully synchronized ${newlyDownloadedCourses} course pack(s), ${newlyDownloadedResources} resource(s), ${newlyDownloadedReviewRecords} review record(s).`;

    return {
      success: true,
      message: statusMsg,
      downloadedCourses: newlyDownloadedCourses,
      downloadedResources: newlyDownloadedResources,
      downloadedReviewRecords: newlyDownloadedReviewRecords,
      datasetVersion: validatedRemoteManifest.datasetVersion,
      courseErrors: hasPartialErrors ? courseErrors : undefined,
    };
  }
}
