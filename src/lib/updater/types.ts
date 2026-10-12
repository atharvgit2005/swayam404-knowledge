/**
 * Swayam404 Local Updater Types & 9-Stage Lifecycle Definitions
 *
 * 9 Distinct Stages:
 * 1. Check: Retrieve and validate local release metadata
 * 2. Compare: Compare installed version with release version
 * 3. Download: Download release package into temporary location
 * 4. Verify: Validate package format, expected size, checksum, and supported version
 * 5. Stage: Prepare verified release separately from currently installed extension
 * 6. Apply: Require user-approved, locally executed installation/file replacement
 * 7. Reload: Tell user when browser reload or extension reload is required
 * 8. Confirm: Verify version reported by running extension
 * 9. Recover: Preserve usable backup and provide clear recovery instructions
 */

export type ExtensionUpdateStage =
  | 'check'
  | 'compare'
  | 'download'
  | 'verify'
  | 'stage'
  | 'apply'
  | 'reload'
  | 'confirm'
  | 'recover';

export type ExtensionUpdateStatus =
  | 'up-to-date'
  | 'checking'
  | 'update-available'
  | 'downloading'
  | 'verified'
  | 'download-verified' // alias for backwards compatibility
  | 'staged'
  | 'awaiting-application'
  | 'manual-install-required' // alias
  | 'reload-required'
  | 'confirmed'
  | 'check-failed'
  | 'invalid-metadata'
  | 'checksum-mismatch'
  | 'server-unavailable'
  | 'failed'
  | 'recovery-required';

export interface LocalReleaseMetadata {
  version: string;
  packageFilename: string;
  fileSize: number;
  sha256: string;
  releasedAt: string;
  releaseNotes: string;
  downloadUrl: string;
  minBrowserVersion?: string;
  isCorruptFixture?: boolean;
}

export interface ExtensionUpdateState {
  status: ExtensionUpdateStatus;
  currentStage?: ExtensionUpdateStage;
  installedVersion: string;
  latestVersion?: string;
  metadata?: LocalReleaseMetadata;
  lastChecked?: string;
  errorMessage?: string;
  recoveryGuidance?: string;
  verifiedChecksum?: string;
  downloadedFilename?: string;
  downloadedSize?: number;
  downloadedBlobUrl?: string;
  stagedPath?: string;
  backupPath?: string;
}

export interface LocalUpdaterConfig {
  enabled: boolean;
  serverUrl: string; // Default: 'http://127.0.0.1:52404'
}

export const DEFAULT_LOCAL_UPDATER_CONFIG: LocalUpdaterConfig = {
  enabled: true,
  serverUrl: 'http://127.0.0.1:52404',
};
