/**
 * Swayam404 Knowledge Base Types — Phase 1 Shared Knowledge Base Foundation
 */

export type KnowledgeResourceType =
  | 'concept-summary'
  | 'lecture-notes'
  | 'transcript-excerpt'
  | 'official-reference'
  | 'learning-objective'
  | 'worked-example'
  | 'practice-explanation';

export type KnowledgeReviewVerificationStatus =
  | 'portal-confirmed'
  | 'instructor-provided'
  | 'source-supported'
  | 'needs-review';

export interface KnowledgeProvenance {
  sourceTitle: string;
  sourceUrl?: string;
  authorOrPublisher?: string;
  license: string;
  attribution?: string;
  retrievalDate: string;
  lectureNumber?: string;
  lectureTimestamp?: string;
}

export interface KnowledgeResourceChunk {
  chunkId: string;
  resourceId: string;
  courseId: string;
  chunkIndex: number;
  totalChunks: number;
  content: string;
  contentHash: string;
  topics: string[];
  unitOrWeek?: string;
  lectureId?: string;
  lectureNumber?: string;
  lectureTimestamp?: string;
  provenance: KnowledgeProvenance;
  version: string;
}

export interface KnowledgeResource {
  resourceId: string;
  courseId: string;
  title: string;
  resourceType: KnowledgeResourceType;
  content: string;
  topics: string[];
  provenance: KnowledgeProvenance;
  version: string;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
  unitOrWeek?: string;
  lectureId?: string;
  lectureNumber?: string;
  chunks?: KnowledgeResourceChunk[];
}

export interface KnowledgeReviewRecord {
  recordId: string;
  courseId: string;
  assignmentId: string;
  questionFingerprint: string;
  normalizedQuestionText: string;
  options?: string[];
  explanation: string;
  verificationStatus: KnowledgeReviewVerificationStatus;
  verificationSource: string;
  releaseTimestamp: string;
  redistributionPermission: string;
  recordVersion: string;
  isReleased: boolean;
  provenance: KnowledgeProvenance;
}

export interface KnowledgeCourse {
  courseId: string;
  courseTitle: string;
  externalCourseId?: string;
  provider?: string;
  institution?: string;
  language: string;
  description: string;
  coursePackVersion: string;
  publishedAt: string;
  updatedAt: string;
  topics: string[];
  learningObjectives?: string[];
  units?: CourseUnitMetadata[];
}


export interface KnowledgeManifestCourseEntry {
  courseId: string;
  courseTitle: string;
  provider?: string;
  institution?: string;
  language: string;
  coursePackVersion: string;
  lastUpdated: string;
  metadataPath: string;
  resourcesPath: string;
  reviewRecordsPath?: string;
  contentHash: string;
  resourceCount: number;
  reviewRecordCount: number;
}

export interface KnowledgeManifest {
  schemaVersion: string;
  datasetVersion: string;
  name: string;
  description: string;
  publishedAt: string;
  minExtensionVersion?: string;
  courses: KnowledgeManifestCourseEntry[];
}

export interface KnowledgeCoursePack {
  course: KnowledgeCourse;
  resources: KnowledgeResource[];
  reviewRecords: KnowledgeReviewRecord[];
  contentHash?: string;
}

export interface KnowledgeValidationError {
  path: string;
  message: string;
  code: string;
}

export interface KnowledgeValidationResult<T = unknown> {
  isValid: boolean;
  data?: T;
  errors: KnowledgeValidationError[];
  warnings: string[];
  datasetVersion?: string;
  acceptedResourcesCount: number;
  acceptedCoursesCount: number;
}

export interface KnowledgeCacheMetadata {
  datasetVersion: string;
  schemaVersion: string;
  lastSuccessfulSync: string;
  repoUrl: string;
  courseIds: string[];
  totalResources: number;
  totalReviewRecords: number;
  etags?: Record<string, string>;
  lastModified?: Record<string, string>;
  courseVersions?: Record<string, string>;
  courseSyncStatus?: Record<string, 'synced' | 'failed' | 'partial'>;
}

export interface KnowledgeSyncOptions {
  selectedCourseIds?: string[];
  forceRefresh?: boolean;
  signal?: AbortSignal;
  customUrl?: string;
}

export type KnowledgeUpdateState =
  | 'unconfigured'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'updated'
  | 'offline'
  | 'update-failed'
  | 'syncing'
  | 'synced'
  | 'out-of-sync'
  | 'error';

export interface KnowledgeUpdateCheckResult {
  updateAvailable: boolean;
  state: KnowledgeUpdateState;
  currentVersion?: string;
  latestVersion?: string;
  changedCourses: string[];
  newCourses: string[];
  error?: string;
  isOffline?: boolean;
}

export interface KnowledgeSyncStatus {
  configured: boolean;
  repoUrl: string;
  lastSyncTimestamp?: string;
  datasetVersion?: string;
  remoteDatasetVersion?: string;
  coursesCount: number;
  resourcesCount: number;
  reviewRecordsCount: number;
  status: KnowledgeUpdateState;
  updateState?: KnowledgeUpdateState;
  updateAvailable?: boolean;
  lastError?: string;
  courseSyncStatus?: Record<string, 'synced' | 'failed' | 'partial'>;
}

export interface KnowledgeSyncResult {
  success: boolean;
  message: string;
  downloadedCourses: number;
  downloadedResources: number;
  downloadedReviewRecords: number;
  datasetVersion?: string;
  error?: string;
  courseErrors?: Record<string, string>;
  isOffline?: boolean;
}

export type RetrievalSourceType = 'local-course-material' | 'shared-knowledge-base';

export interface KnowledgeSearchFilters {
  topic?: string;
  unitOrWeek?: string;
  lectureId?: string;
}

export interface KnowledgeSearchOptions extends KnowledgeSearchFilters {
  courseId: string;
  query: string;
  limit?: number;
}

export interface RetrievedExcerpt {
  // Base backwards-compatible properties
  materialId: string;
  materialTitle: string;
  unitTitle?: string;
  excerpt: string;
  snippet?: string;
  relevanceScore: number;

  // Unified Evidence-Aware properties (Phase 2 & Phase 4)
  resourceId?: string;
  courseId?: string;
  resourceType?: KnowledgeResourceType | string;
  title?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  lectureId?: string;
  timestamp?: string;
  license?: string;
  verificationStatus?: KnowledgeReviewVerificationStatus | string;
  retrievalSource?: RetrievalSourceType;
  contentHash?: string;
  topics?: string[];
  authorOrPublisher?: string;
  chunkId?: string;
  chunkIndex?: number;
  totalChunks?: number;
}


// ============================================================================
// Phase 3: Community Contribution Lifecycle, Provenance & Course Metadata
// ============================================================================

export type ContributionState =
  | 'draft'
  | 'pending-validation'
  | 'validation-failed'
  | 'ready-for-review'
  | 'rejected'
  | 'approved'
  | 'exported'
  | 'published';

export type ContributionPermission =
  | 'public-open-educational'
  | 'cc-by'
  | 'cc-by-sa'
  | 'cc0-public-domain'
  | 'local-only'
  | 'unverified'
  | 'restricted';

export type ContributionConflictType =
  | 'exact-duplicate'
  | 'id-collision'
  | 'content-conflict'
  | 'contradictory-verification'
  | 'similarity-warning';

export interface ContributionConflictItem {
  type: ContributionConflictType;
  message: string;
  existingId: string;
  proposedId: string;
  resourceType?: string;
  similarityScore?: number;
  existingDetails?: string;
  proposedDetails?: string;
  resolutionDecision?: 'update' | 'keep-separate' | 'reject';
}

export interface ContributionProposalProvenance {
  contributorName?: string;
  sourceSummary: string;
  license: string;
  permission: ContributionPermission;
  isPermissionConfirmed: boolean;
}

export interface ContributionProposal {
  proposalId: string;
  courseId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: ContributionState;
  resources: KnowledgeResource[];
  reviewRecords: KnowledgeReviewRecord[];
  conflicts: ContributionConflictItem[];
  validationResult: KnowledgeValidationResult;
  provenanceSummary: ContributionProposalProvenance;
  targetPaths: {
    coursePath: string;
    resourcesPath: string;
    reviewRecordsPath: string;
  };
  exportedAt?: string;
  publishedAt?: string;
  rejectionReason?: string;
  contributorNotes?: string;
}

export interface ContributionManifest {
  schemaVersion: string;
  packageVersion: string;
  exportTimestamp: string;
  courseId: string;
  courseTitle?: string;
  resourceCount: number;
  reviewRecordCount: number;
  resourceIds: string[];
  reviewRecordIds: string[];
  contentHashes: Record<string, string>;
  validationSummary: {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    errors: string[];
    warnings: string[];
  };
  requiresMaintainerApproval: boolean;
  repositoryDestination: {
    basePath: string;
    resourcesFile: string;
    reviewRecordsFile: string;
    courseFile: string;
  };
  contributorNotes?: string;
}

export interface ContributionExportPackage {
  manifest: ContributionManifest;
  resources: KnowledgeResource[];
  reviewRecords: KnowledgeReviewRecord[];
  course?: KnowledgeCourse;
}

// Course Structure & Syllabus Hierarchy Metadata
export interface CourseLectureMetadata {
  lectureId: string;
  lectureNumber?: string;
  title: string;
  videoUrl?: string;
  topics: string[];
  sourcePageReference?: string;
}

export interface CourseUnitMetadata {
  unitId: string;
  unitNumber?: string;
  title: string;
  lectures: CourseLectureMetadata[];
  topics: string[];
}

export interface CourseMetadataProposal {
  courseId: string;
  courseTitle: string;
  units: CourseUnitMetadata[];
  topics: string[];
  extractedFromUrl?: string;
  sourcePageReference?: string;
  extractedAt: string;
}

// ============================================================================
// Phase 4: Production Course Packs & Resource Ingestion Pipeline
// ============================================================================

export type IngestionSourceFormat =
  | 'markdown-notes'
  | 'study-guide'
  | 'transcript-excerpt'
  | 'instructor-notes'
  | 'worked-example'
  | 'official-reference'
  | 'structured-metadata'
  | 'contribution-package';

export interface IngestionInputProvenance {
  sourceTitle: string;
  sourceUrl?: string;
  authorOrPublisher?: string;
  license: string;
  attribution?: string;
  retrievalDate?: string;
  permission: ContributionPermission;
  lectureNumber?: string;
  lectureTimestamp?: string;
}

export interface IngestionInput {
  sourceFormat: IngestionSourceFormat;
  rawContent: string;
  courseId: string;
  title: string;
  resourceType?: KnowledgeResourceType;
  topics?: string[];
  unitOrWeek?: string;
  lectureId?: string;
  lectureNumber?: string;
  lectureTimestamp?: string;
  provenance: IngestionInputProvenance;
  version?: string;
}

export interface IngestionPreviewItem {
  resource: KnowledgeResource;
  chunks: KnowledgeResourceChunk[];
  isDuplicate: boolean;
  hasConflict: boolean;
  conflictReason?: string;
  warnings: string[];
  isAuthorizedForPublicPack: boolean;
}

export interface IngestionSummary {
  totalInputs: number;
  acceptedResources: number;
  generatedChunks: number;
  duplicatesSkipped: number;
  conflictsFlagged: number;
  localOnlyCount: number;
  warnings: string[];
}

export interface IngestionResult {
  success: boolean;
  summary: IngestionSummary;
  items: IngestionPreviewItem[];
  exportedPack?: Partial<KnowledgeCoursePack>;
}

export interface CoursePackValidationReport {
  isValid: boolean;
  timestamp: string;
  courseId: string;
  courseTitle: string;
  version: string;
  contentHash: string;
  resourceCount: number;
  reviewRecordCount: number;
  chunkCount: number;
  errors: string[];
  warnings: string[];
  changedFiles: string[];
}


