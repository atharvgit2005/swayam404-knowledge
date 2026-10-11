/**
 * Unified Knowledge Base Service for Swayam404
 *
 * Exposes a clean, read-only consumer interface for extension UI and future retrieval integration.
 * All queries are strictly course-scoped. Released review records are strictly isolated.
 */

import {
  KnowledgeManifestCourseEntry,
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeSyncStatus,
  KnowledgeSyncResult,
  KnowledgeSyncOptions,
  KnowledgeSearchFilters,
  KnowledgeSearchOptions,
} from '@/types/knowledge';

import { StorageService } from '@/lib/storage';
import { KnowledgeBaseClient, KnowledgeClientError } from './client';
import { KnowledgeCacheService } from './cache';

export class KnowledgeBaseService {
  /**
   * Returns current sync telemetry and status.
   */
  static async getStatus(): Promise<KnowledgeSyncStatus> {
    const settings = await StorageService.getSettings();
    const repoUrl = settings.knowledgeBaseRepoUrl?.trim() || '';
    const configured = Boolean(settings.knowledgeBaseEnabled && repoUrl.length > 0);

    const meta = await KnowledgeCacheService.getCachedMetadata();
    const manifest = await KnowledgeCacheService.getCachedManifest();
    const packs = await KnowledgeCacheService.getCachedCoursePacks();

    const courseIds = Object.keys(packs);
    const totalResources = Object.values(packs).reduce((sum, p) => sum + p.resources.length, 0);
    const totalRR = Object.values(packs).reduce((sum, p) => sum + p.reviewRecords.length, 0);

    let status: KnowledgeSyncStatus['status'] = 'unconfigured';
    if (!configured) {
      status = 'unconfigured';
    } else if (meta && meta.lastSuccessfulSync) {
      status = 'synced';
    } else {
      status = 'out-of-sync';
    }

    return {
      configured,
      repoUrl,
      lastSyncTimestamp: meta?.lastSuccessfulSync,
      datasetVersion: meta?.datasetVersion || manifest?.datasetVersion,
      coursesCount: courseIds.length,
      resourcesCount: totalResources,
      reviewRecordsCount: totalRR,
      status,
      courseSyncStatus: meta?.courseSyncStatus,
    };
  }

  /**
   * Triggers an explicit knowledge base sync against the configured repository URL.
   */
  static async syncNow(
    optionsOrUrl?: string | KnowledgeSyncOptions
  ): Promise<KnowledgeSyncResult> {
    const isUrl = typeof optionsOrUrl === 'string';
    const settings = await StorageService.getSettings();
    const repoUrl = isUrl
      ? optionsOrUrl.trim()
      : ((optionsOrUrl as KnowledgeSyncOptions)?.customUrl?.trim() || settings.knowledgeBaseRepoUrl?.trim() || '');

    const syncOptions: KnowledgeSyncOptions = isUrl ? {} : (optionsOrUrl as KnowledgeSyncOptions) || {};

    if (!repoUrl) {
      return {
        success: false,
        message: 'No repository URL configured. Please specify a knowledge base repository URL in Settings.',
        downloadedCourses: 0,
        downloadedResources: 0,
        downloadedReviewRecords: 0,
        error: 'UNCONFIGURED_URL',
      };
    }

    const client = new KnowledgeBaseClient({ baseUrl: repoUrl });
    try {
      const result = await KnowledgeCacheService.syncFromRemote(client, repoUrl, syncOptions);
      return result;
    } catch (err: unknown) {
      const error = err as Error;
      const isClientErr = err instanceof KnowledgeClientError;
      const errorMsg = isClientErr
        ? error.message
        : `Knowledge sync failed: ${error.message || 'Unknown network or validation error'}`;

      return {
        success: false,
        message: errorMsg,
        downloadedCourses: 0,
        downloadedResources: 0,
        downloadedReviewRecords: 0,
        error: error.message,
      };
    }
  }


  /**
   * Retrieves the course catalog from the cached manifest.
   */
  static async getCatalog(): Promise<KnowledgeManifestCourseEntry[]> {
    const manifest = await KnowledgeCacheService.getCachedManifest();
    return manifest?.courses || [];
  }

  /**
   * Retrieves metadata for a specific course.
   */
  static async getCourse(courseId: string): Promise<KnowledgeCourse | null> {
    if (!courseId) return null;
    const pack = await KnowledgeCacheService.getCachedCoursePack(courseId);
    return pack ? pack.course : null;
  }

  /**
   * Retrieves all learning resources for a specific course.
   * Enforces course isolation.
   */
  static async getCourseResources(courseId: string): Promise<KnowledgeResource[]> {
    if (!courseId) return [];
    return await KnowledgeCacheService.getCachedResources(courseId);
  }

  /**
   * Searches resources within a specific course by keyword query and optional metadata filters.
   * Performs course-isolated deterministic keyword matching with deterministic tie-breaking.
   */
  static async searchResources(
    courseId: string,
    query: string,
    limit = 5,
    filters?: KnowledgeSearchFilters
  ): Promise<KnowledgeResource[]> {
    if (!courseId || !query || !query.trim()) return [];

    const resources = await this.getCourseResources(courseId);
    if (!resources || resources.length === 0) return [];

    const cleanTokens = query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length > 2);

    interface ScoredResource {
      resource: KnowledgeResource;
      score: number;
    }

    const scored: ScoredResource[] = [];

    const filterTopic = filters?.topic?.toLowerCase().trim();
    const filterUnitOrWeek = filters?.unitOrWeek?.toLowerCase().trim();
    const filterLectureId = filters?.lectureId?.toLowerCase().trim();

    for (const r of resources) {
      // Must match course ID strictly
      if (r.courseId !== courseId) continue;

      let score = 0;
      const lowerTitle = r.title.toLowerCase();
      const lowerContent = r.content.toLowerCase();
      const lowerTopics = (r.topics || []).map((t) => t.toLowerCase());
      const lectureNum = r.provenance?.lectureNumber?.toLowerCase();

      // Metadata filter boosts
      if (filterLectureId && lectureNum) {
        if (lectureNum === filterLectureId || lectureNum.includes(filterLectureId)) {
          score += 15;
        }
      }

      if (filterTopic) {
        if (lowerTopics.some((t) => t.includes(filterTopic)) || lowerTitle.includes(filterTopic)) {
          score += 10;
        }
      }

      if (filterUnitOrWeek) {
        // Document: week/unit is matched against topic tags or title without guessing from file paths
        if (lowerTopics.some((t) => t.includes(filterUnitOrWeek)) || lowerTitle.includes(filterUnitOrWeek)) {
          score += 8;
        }
      }

      // Keyword token scoring
      if (cleanTokens.length > 0) {
        for (const token of cleanTokens) {
          if (lowerTitle.includes(token)) score += 10;
          if (lowerTopics.some((t) => t.includes(token))) score += 5;
          if (lowerContent.includes(token)) score += 2;
        }
      } else {
        // Default base score if tokens empty but filters present
        if (score > 0) score += 1;
      }

      // Resource type quality weighting
      if (score > 0) {
        if (r.resourceType === 'worked-example') score += 3;
        else if (r.resourceType === 'concept-summary') score += 2.5;
        else if (r.resourceType === 'lecture-notes' || r.resourceType === 'official-reference') score += 2;
        else if (r.resourceType === 'practice-explanation') score += 1.5;

        scored.push({ resource: r, score });
      }
    }

    // Deterministic tie-breaking: higher score first; if tied, sort by resourceId ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.resource.resourceId.localeCompare(b.resource.resourceId);
    });

    // Deduplicate by contentHash if duplicate resources exist
    const seenHashes = new Set<string>();
    const deduplicated: KnowledgeResource[] = [];
    for (const item of scored) {
      const hash = item.resource.contentHash;
      if (hash) {
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
      }
      deduplicated.push(item.resource);
      if (deduplicated.length >= limit) break;
    }

    return deduplicated;
  }

  /**
   * Course/unit-scoped search API using a structured options object.
   */
  static async searchCourseResources(
    options: KnowledgeSearchOptions
  ): Promise<KnowledgeResource[]> {
    const { courseId, query, limit = 5, ...filters } = options;
    return this.searchResources(courseId, query, limit, filters);
  }

  /**
   * Retrieves released review records for post-assessment study.
   * IMPORTANT: These records are strictly separated from active assignment auto-fill!
   */
  static async getReleasedReviewRecords(
    courseId: string,
    filter?: { fingerprint?: string }
  ): Promise<KnowledgeReviewRecord[]> {
    if (!courseId) return [];
    const records = await KnowledgeCacheService.getCachedReviewRecords(courseId);

    // Filter to ensure records are released and match criteria
    return records.filter((r) => {
      if (!r.isReleased) return false;
      if (filter?.fingerprint && r.questionFingerprint !== filter.fingerprint) {
        return false;
      }
      return true;
    });
  }
}
