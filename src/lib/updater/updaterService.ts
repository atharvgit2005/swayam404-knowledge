/**
 * Swayam404 Local Extension Updater Service
 *
 * Handles end-to-end local update checking, semantic version evaluation,
 * package download, and SHA-256 integrity verification.
 *
 * Strictly adheres to Manifest V3 security:
 * - Never executes downloaded code
 * - Never attempts self-replacement of unpacked files
 * - Preserves existing extension storage on failure
 */

import {
  ExtensionUpdateState,
  ExtensionUpdateStatus,
  LocalReleaseMetadata,
  LocalUpdaterConfig,
  DEFAULT_LOCAL_UPDATER_CONFIG,
} from './types';
import { compareSemVer, isValidSemVer } from './semver';
import { computeBufferSha256 } from './hasher';
import { StorageService } from '@/lib/storage';

export class LocalUpdaterService {
  private static instance: LocalUpdaterService;
  private activeCheckPromise: Promise<ExtensionUpdateState> | null = null;
  private activeDownloadPromise: Promise<{ success: boolean; state: ExtensionUpdateState; blob?: Blob }> | null = null;

  public static getInstance(): LocalUpdaterService {
    if (!LocalUpdaterService.instance) {
      LocalUpdaterService.instance = new LocalUpdaterService();
    }
    return LocalUpdaterService.instance;
  }

  /**
   * Returns current extension version from manifest.json or fallback.
   */
  public getInstalledVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      try {
        const manifest = chrome.runtime.getManifest();
        if (manifest?.version) {
          return manifest.version;
        }
      } catch {
        // Fallback for non-extension environment
      }
    }
    return '1.0.0';
  }

  /**
   * Retrieves current updater state from storage.
   */
  public async getState(): Promise<ExtensionUpdateState> {
    const stored = await StorageService.getExtensionUpdaterState();
    if (stored) {
      return stored;
    }
    return {
      status: 'up-to-date',
      installedVersion: this.getInstalledVersion(),
    };
  }

  /**
   * Retrieves updater configuration.
   */
  public async getConfig(): Promise<LocalUpdaterConfig> {
    return await StorageService.getLocalUpdaterConfig();
  }

  /**
   * Saves updated configuration.
   */
  public async saveConfig(config: Partial<LocalUpdaterConfig>): Promise<void> {
    await StorageService.saveLocalUpdaterConfig(config);
  }

  /**
   * Validates structure and fields of release metadata.
   */
  public validateMetadata(data: any): { valid: boolean; error?: string; metadata?: LocalReleaseMetadata } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Metadata is empty or not an object.' };
    }

    if (!data.version || typeof data.version !== 'string' || !isValidSemVer(data.version)) {
      return { valid: false, error: `Invalid or missing SemVer version: "${data.version}".` };
    }

    if (!data.packageFilename || typeof data.packageFilename !== 'string') {
      return { valid: false, error: 'Missing packageFilename.' };
    }

    // Security check: package filename must be a simple filename without path traversal
    const safeFilename = data.packageFilename.trim();
    if (
      safeFilename.includes('..') ||
      safeFilename.includes('/') ||
      safeFilename.includes('\\') ||
      !safeFilename.endsWith('.zip')
    ) {
      return { valid: false, error: `Illegal or unsafe package filename: "${data.packageFilename}".` };
    }

    if (typeof data.fileSize !== 'number' || data.fileSize <= 0) {
      return { valid: false, error: 'Invalid or missing fileSize.' };
    }

    if (!data.sha256 || typeof data.sha256 !== 'string' || data.sha256.trim().length !== 64) {
      return { valid: false, error: 'Missing or invalid 64-character SHA-256 checksum.' };
    }

    if (!data.downloadUrl || typeof data.downloadUrl !== 'string') {
      return { valid: false, error: 'Missing downloadUrl.' };
    }

    const metadata: LocalReleaseMetadata = {
      version: data.version.trim(),
      packageFilename: safeFilename,
      fileSize: data.fileSize,
      sha256: data.sha256.trim().toLowerCase(),
      releasedAt: data.releasedAt || new Date().toISOString(),
      releaseNotes: data.releaseNotes || '',
      downloadUrl: data.downloadUrl.trim(),
      minBrowserVersion: data.minBrowserVersion,
      isCorruptFixture: Boolean(data.isCorruptFixture),
    };

    return { valid: true, metadata };
  }

  /**
   * Checks local update server for new releases.
   */
  public async checkForUpdates(customServerUrl?: string): Promise<ExtensionUpdateState> {
    if (this.activeCheckPromise) {
      return this.activeCheckPromise;
    }

    const checkPromise = (async () => {
      const installedVersion = this.getInstalledVersion();
      const config = await this.getConfig();
      const serverUrl = (customServerUrl || config.serverUrl || DEFAULT_LOCAL_UPDATER_CONFIG.serverUrl).replace(/\/+$/, '');

      // Temporary checking state
      const checkingState: ExtensionUpdateState = {
        status: 'checking',
        installedVersion,
      };
      await StorageService.saveExtensionUpdaterState(checkingState);

      let response: Response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        response = await fetch(`${serverUrl}/latest.json`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);
      } catch (networkErr: any) {
        const errorState: ExtensionUpdateState = {
          status: 'server-unavailable',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: `Cannot reach local update server at ${serverUrl}. Ensure "npm run server:local" is running.`,
        };
        await StorageService.saveExtensionUpdaterState(errorState);
        return errorState;
      }

      if (response.status === 404) {
        const notFoundState: ExtensionUpdateState = {
          status: 'server-unavailable',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: `No local releases found on server (${serverUrl}/latest.json). Run "npm run release:local" to generate one.`,
        };
        await StorageService.saveExtensionUpdaterState(notFoundState);
        return notFoundState;
      }

      if (!response.ok) {
        const failedState: ExtensionUpdateState = {
          status: 'check-failed',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: `Update server returned HTTP ${response.status}: ${response.statusText}`,
        };
        await StorageService.saveExtensionUpdaterState(failedState);
        return failedState;
      }

      let json: any;
      try {
        json = await response.json();
      } catch (parseErr: any) {
        const invalidJsonState: ExtensionUpdateState = {
          status: 'invalid-metadata',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: `Failed to parse release JSON: ${parseErr.message}`,
        };
        await StorageService.saveExtensionUpdaterState(invalidJsonState);
        return invalidJsonState;
      }

      const validation = this.validateMetadata(json);
      if (!validation.valid || !validation.metadata) {
        const invalidMetaState: ExtensionUpdateState = {
          status: 'invalid-metadata',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: validation.error || 'Invalid metadata schema.',
        };
        await StorageService.saveExtensionUpdaterState(invalidMetaState);
        return invalidMetaState;
      }

      const remoteMeta = validation.metadata;
      let status: ExtensionUpdateStatus;

      try {
        const cmp = compareSemVer(remoteMeta.version, installedVersion);
        if (cmp === 1) {
          status = 'update-available';
        } else {
          status = 'up-to-date';
        }
      } catch (cmpErr: any) {
        const errorState: ExtensionUpdateState = {
          status: 'invalid-metadata',
          installedVersion,
          lastChecked: new Date().toISOString(),
          errorMessage: `Version comparison error: ${cmpErr.message}`,
        };
        await StorageService.saveExtensionUpdaterState(errorState);
        return errorState;
      }

      const resultState: ExtensionUpdateState = {
        status,
        installedVersion,
        latestVersion: remoteMeta.version,
        metadata: remoteMeta,
        lastChecked: new Date().toISOString(),
      };

      await StorageService.saveExtensionUpdaterState(resultState);
      return resultState;
    })();

    this.activeCheckPromise = checkPromise;
    try {
      return await checkPromise;
    } finally {
      this.activeCheckPromise = null;
    }
  }

  /**
   * Downloads the package from the local update server and verifies SHA-256 integrity.
   */
  public async downloadAndVerifyPackage(
    metadata: LocalReleaseMetadata,
    customServerUrl?: string
  ): Promise<{ success: boolean; state: ExtensionUpdateState; blob?: Blob }> {
    if (this.activeDownloadPromise) {
      return this.activeDownloadPromise;
    }

    const downloadPromise = (async () => {
      const installedVersion = this.getInstalledVersion();
      const config = await this.getConfig();
      const serverUrl = (customServerUrl || config.serverUrl || DEFAULT_LOCAL_UPDATER_CONFIG.serverUrl).replace(/\/+$/, '');

      // Transition to downloading state
      const downloadingState: ExtensionUpdateState = {
        status: 'downloading',
        installedVersion,
        latestVersion: metadata.version,
        metadata,
      };
      await StorageService.saveExtensionUpdaterState(downloadingState);

      const downloadPath = metadata.downloadUrl.startsWith('/') ? metadata.downloadUrl : `/${metadata.downloadUrl}`;
      const packageUrl = `${serverUrl}${downloadPath}`;

      let response: Response;
      try {
        response = await fetch(packageUrl);
      } catch (err: any) {
        const errState: ExtensionUpdateState = {
          status: 'server-unavailable',
          installedVersion,
          latestVersion: metadata.version,
          metadata,
          errorMessage: `Failed to download update package: ${err.message}`,
        };
        await StorageService.saveExtensionUpdaterState(errState);
        return { success: false, state: errState };
      }

      if (!response.ok) {
        const errState: ExtensionUpdateState = {
          status: 'check-failed',
          installedVersion,
          latestVersion: metadata.version,
          metadata,
          errorMessage: `Package download failed with HTTP ${response.status}`,
        };
        await StorageService.saveExtensionUpdaterState(errState);
        return { success: false, state: errState };
      }

      const arrayBuffer = await response.arrayBuffer();

      // Stage 4 (Verify): Size check
      if (metadata.fileSize && arrayBuffer.byteLength !== metadata.fileSize) {
        const sizeMismatchState: ExtensionUpdateState = {
          status: 'failed',
          currentStage: 'verify',
          installedVersion,
          latestVersion: metadata.version,
          metadata,
          errorMessage: `Download truncated or corrupted: Expected ${metadata.fileSize} bytes, but received ${arrayBuffer.byteLength} bytes.`,
        };
        await StorageService.saveExtensionUpdaterState(sizeMismatchState);
        return { success: false, state: sizeMismatchState };
      }

      // Stage 4 (Verify): SHA-256 Checksum check
      const computedSha256 = await computeBufferSha256(arrayBuffer);
      if (computedSha256.toLowerCase() !== metadata.sha256.toLowerCase()) {
        const mismatchState: ExtensionUpdateState = {
          status: 'checksum-mismatch',
          currentStage: 'verify',
          installedVersion,
          latestVersion: metadata.version,
          metadata,
          errorMessage: `Security Warning: Checksum mismatch! Expected ${metadata.sha256}, but received ${computedSha256}. Package was rejected.`,
        };
        await StorageService.saveExtensionUpdaterState(mismatchState);
        return { success: false, state: mismatchState };
      }

      // Stage 4 (Verify): Internal ZIP bundle structure and safety check
      const { validateZipPackage } = await import('./zipValidator');
      const zipValidation = validateZipPackage(arrayBuffer, {
        requireAssets: true,
        expectedVersion: metadata.version,
      });

      if (!zipValidation.valid) {
        const zipInvalidState: ExtensionUpdateState = {
          status: 'failed',
          currentStage: 'verify',
          installedVersion,
          latestVersion: metadata.version,
          metadata,
          errorMessage: `Package bundle audit failed: ${zipValidation.errors.join('; ')}`,
        };
        await StorageService.saveExtensionUpdaterState(zipInvalidState);
        return { success: false, state: zipInvalidState };
      }

      // Checksum & Package verified!
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const verifiedState: ExtensionUpdateState = {
        status: 'download-verified',
        currentStage: 'verify',
        installedVersion,
        latestVersion: metadata.version,
        metadata,
        verifiedChecksum: computedSha256,
        downloadedFilename: metadata.packageFilename,
        downloadedSize: arrayBuffer.byteLength,
      };

      await StorageService.saveExtensionUpdaterState(verifiedState);
      return { success: true, state: verifiedState, blob };
    })();

    this.activeDownloadPromise = downloadPromise;
    try {
      return await downloadPromise;
    } finally {
      this.activeDownloadPromise = null;
    }
  }

  /**
   * Stage 8: Confirms whether the running extension has loaded the updated version.
   */
  public async confirmRunningVersion(): Promise<ExtensionUpdateState> {
    const currentVersion = this.getInstalledVersion();
    const currentState = await this.getState();

    if (currentState.latestVersion && currentVersion === currentState.latestVersion) {
      const confirmedState: ExtensionUpdateState = {
        status: 'confirmed',
        currentStage: 'confirm',
        installedVersion: currentVersion,
        latestVersion: currentVersion,
        lastChecked: new Date().toISOString(),
      };
      await StorageService.saveExtensionUpdaterState(confirmedState);
      return confirmedState;
    }

    const awaitingReloadState: ExtensionUpdateState = {
      ...currentState,
      status: 'reload-required',
      currentStage: 'reload',
      installedVersion: currentVersion,
      errorMessage: `Extension is still running v${currentVersion}. To complete update: navigate to chrome://extensions and click Reload (↻).`,
    };
    await StorageService.saveExtensionUpdaterState(awaitingReloadState);
    return awaitingReloadState;
  }

  /**
   * Triggers native browser download for the verified ZIP blob.
   */
  public triggerBrowserDownload(blob: Blob, filename: string): void {
    if (typeof window === 'undefined' || !window.URL) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  }

  /**
   * Resets local updater state to default.
   */
  public async resetState(): Promise<ExtensionUpdateState> {
    const state: ExtensionUpdateState = {
      status: 'up-to-date',
      installedVersion: this.getInstalledVersion(),
    };
    await StorageService.saveExtensionUpdaterState(state);
    return state;
  }
}

export const localUpdaterService = LocalUpdaterService.getInstance();
