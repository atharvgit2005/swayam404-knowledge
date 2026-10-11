/**
 * Typed Validation Layer for Swayam404 Shared Knowledge Base
 */

import {
  KnowledgeManifest,
  KnowledgeManifestCourseEntry,
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeResourceType,
  KnowledgeReviewRecord,
  KnowledgeReviewVerificationStatus,
  KnowledgeCoursePack,
  KnowledgeValidationResult,
  KnowledgeValidationError,
  CourseUnitMetadata,
} from '@/types/knowledge';
import { validateRelativeRepoPath, parseSemver } from './security';
import { isValidSha256 } from './hasher';

export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0'];

const VALID_RESOURCE_TYPES: Set<KnowledgeResourceType> = new Set([
  'concept-summary',
  'lecture-notes',
  'transcript-excerpt',
  'official-reference',
  'learning-objective',
  'worked-example',
  'practice-explanation',
]);

const VALID_VERIFICATION_STATUSES: Set<KnowledgeReviewVerificationStatus> = new Set([
  'portal-confirmed',
  'instructor-provided',
  'source-supported',
  'needs-review',
]);

function isValidIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  const timestamp = Date.parse(dateStr);
  if (isNaN(timestamp)) return false;
  // Basic ISO 8601 sanity: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
    dateStr.trim()
  );
}

function isValidId(idStr: unknown): boolean {
  if (typeof idStr !== 'string' || !idStr.trim()) return false;
  return /^[a-z0-9_-]+$/i.test(idStr.trim());
}

export class KnowledgeValidator {
  /**
   * Validates the root repository manifest.json
   */
  static validateManifest(raw: unknown): KnowledgeValidationResult<KnowledgeManifest> {
    const errors: KnowledgeValidationError[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        isValid: false,
        errors: [{ path: 'manifest', message: 'Manifest must be a non-null JSON object.', code: 'INVALID_TYPE' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const m = raw as Record<string, unknown>;

    // 1. Schema version check
    if (typeof m.schemaVersion !== 'string' || !m.schemaVersion.trim()) {
      errors.push({ path: 'schemaVersion', message: 'Missing schemaVersion string.', code: 'REQUIRED_FIELD' });
    } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(m.schemaVersion.trim())) {
      errors.push({
        path: 'schemaVersion',
        message: `Unsupported schemaVersion '${m.schemaVersion}'. Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
        code: 'UNSUPPORTED_SCHEMA',
      });
    }

    // 2. Dataset version check
    if (typeof m.datasetVersion !== 'string' || !m.datasetVersion.trim()) {
      errors.push({ path: 'datasetVersion', message: 'Missing datasetVersion string.', code: 'REQUIRED_FIELD' });
    } else if (!parseSemver(m.datasetVersion.trim())) {
      errors.push({
        path: 'datasetVersion',
        message: `datasetVersion '${m.datasetVersion}' is not a valid semantic version (must be X.Y.Z).`,
        code: 'INVALID_VERSION_FORMAT',
      });
    }

    // 3. Name & Description
    if (typeof m.name !== 'string' || !m.name.trim()) {
      errors.push({ path: 'name', message: 'Manifest must contain a non-empty name.', code: 'REQUIRED_FIELD' });
    }
    if (typeof m.description !== 'string' || !m.description.trim()) {
      warnings.push('Manifest description is empty or missing.');
    }

    // 4. Publication timestamp
    if (!isValidIsoDate(m.publishedAt)) {
      errors.push({
        path: 'publishedAt',
        message: 'publishedAt must be a valid ISO 8601 timestamp string.',
        code: 'INVALID_DATE',
      });
    }

    // 5. Courses catalog
    if (!Array.isArray(m.courses)) {
      errors.push({ path: 'courses', message: 'Manifest courses field must be an array.', code: 'REQUIRED_FIELD' });
      return {
        isValid: false,
        errors,
        warnings,
        datasetVersion: typeof m.datasetVersion === 'string' ? m.datasetVersion : undefined,
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const validatedEntries: KnowledgeManifestCourseEntry[] = [];
    const seenCourseIds = new Set<string>();
    let totalResourcesCount = 0;

    for (let i = 0; i < m.courses.length; i++) {
      const entryRaw = m.courses[i];
      const entryPath = `courses[${i}]`;

      if (!entryRaw || typeof entryRaw !== 'object') {
        errors.push({ path: entryPath, message: 'Course catalog entry must be an object.', code: 'INVALID_ENTRY' });
        continue;
      }

      const e = entryRaw as Record<string, unknown>;

      // Course ID
      if (!isValidId(e.courseId)) {
        errors.push({
          path: `${entryPath}.courseId`,
          message: `Invalid or missing courseId '${String(e.courseId)}'. Must be alphanumeric with hyphens/underscores.`,
          code: 'INVALID_COURSE_ID',
        });
      } else {
        const cId = String(e.courseId).trim();
        if (seenCourseIds.has(cId)) {
          errors.push({
            path: `${entryPath}.courseId`,
            message: `Duplicate courseId '${cId}' detected in manifest catalog.`,
            code: 'DUPLICATE_COURSE_ID',
          });
        } else {
          seenCourseIds.add(cId);
        }
      }

      // Course Title
      if (typeof e.courseTitle !== 'string' || !e.courseTitle.trim()) {
        errors.push({
          path: `${entryPath}.courseTitle`,
          message: 'Missing or empty courseTitle.',
          code: 'REQUIRED_FIELD',
        });
      }

      // Course Pack Version
      if (typeof e.coursePackVersion !== 'string' || !parseSemver(e.coursePackVersion)) {
        errors.push({
          path: `${entryPath}.coursePackVersion`,
          message: `Invalid coursePackVersion '${String(e.coursePackVersion)}'. Must be valid semver.`,
          code: 'INVALID_VERSION_FORMAT',
        });
      }

      // Last Updated Date
      if (!isValidIsoDate(e.lastUpdated)) {
        errors.push({
          path: `${entryPath}.lastUpdated`,
          message: 'lastUpdated must be a valid ISO 8601 timestamp.',
          code: 'INVALID_DATE',
        });
      }

      // Path validation: metadataPath
      if (typeof e.metadataPath !== 'string') {
        errors.push({ path: `${entryPath}.metadataPath`, message: 'Missing metadataPath.', code: 'REQUIRED_FIELD' });
      } else {
        const pathCheck = validateRelativeRepoPath(e.metadataPath);
        if (!pathCheck.isValid) {
          errors.push({
            path: `${entryPath}.metadataPath`,
            message: `Invalid metadataPath: ${pathCheck.error}`,
            code: 'PATH_TRAVERSAL_REJECTED',
          });
        }
      }

      // Path validation: resourcesPath
      if (typeof e.resourcesPath !== 'string') {
        errors.push({ path: `${entryPath}.resourcesPath`, message: 'Missing resourcesPath.', code: 'REQUIRED_FIELD' });
      } else {
        const pathCheck = validateRelativeRepoPath(e.resourcesPath);
        if (!pathCheck.isValid) {
          errors.push({
            path: `${entryPath}.resourcesPath`,
            message: `Invalid resourcesPath: ${pathCheck.error}`,
            code: 'PATH_TRAVERSAL_REJECTED',
          });
        }
      }

      // Path validation: reviewRecordsPath (optional)
      if (e.reviewRecordsPath !== undefined) {
        if (typeof e.reviewRecordsPath !== 'string') {
          errors.push({
            path: `${entryPath}.reviewRecordsPath`,
            message: 'reviewRecordsPath must be a string if provided.',
            code: 'INVALID_TYPE',
          });
        } else {
          const pathCheck = validateRelativeRepoPath(e.reviewRecordsPath);
          if (!pathCheck.isValid) {
            errors.push({
              path: `${entryPath}.reviewRecordsPath`,
              message: `Invalid reviewRecordsPath: ${pathCheck.error}`,
              code: 'PATH_TRAVERSAL_REJECTED',
            });
          }
        }
      }

      // Content Hash
      if (typeof e.contentHash !== 'string' || !isValidSha256(e.contentHash)) {
        errors.push({
          path: `${entryPath}.contentHash`,
          message: `Malformed or missing contentHash '${String(e.contentHash)}'. Must be a 64-character SHA-256 hex string.`,
          code: 'MALFORMED_HASH',
        });
      }

      // Resource Count
      const rCount = typeof e.resourceCount === 'number' && e.resourceCount >= 0 ? e.resourceCount : 0;
      totalResourcesCount += rCount;

      const rrCount = typeof e.reviewRecordCount === 'number' && e.reviewRecordCount >= 0 ? e.reviewRecordCount : 0;

      validatedEntries.push({
        courseId: String(e.courseId),
        courseTitle: String(e.courseTitle),
        provider: typeof e.provider === 'string' ? e.provider : undefined,
        institution: typeof e.institution === 'string' ? e.institution : undefined,
        language: typeof e.language === 'string' ? e.language : 'en',
        coursePackVersion: String(e.coursePackVersion),
        lastUpdated: String(e.lastUpdated),
        metadataPath: String(e.metadataPath),
        resourcesPath: String(e.resourcesPath),
        reviewRecordsPath: typeof e.reviewRecordsPath === 'string' ? e.reviewRecordsPath : undefined,
        contentHash: String(e.contentHash),
        resourceCount: rCount,
        reviewRecordCount: rrCount,
      });
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      data: isValid
        ? {
            schemaVersion: String(m.schemaVersion),
            datasetVersion: String(m.datasetVersion),
            name: String(m.name),
            description: String(m.description || ''),
            publishedAt: String(m.publishedAt),
            minExtensionVersion: typeof m.minExtensionVersion === 'string' ? m.minExtensionVersion : undefined,
            courses: validatedEntries,
          }
        : undefined,
      errors,
      warnings,
      datasetVersion: typeof m.datasetVersion === 'string' ? m.datasetVersion : undefined,
      acceptedResourcesCount: totalResourcesCount,
      acceptedCoursesCount: validatedEntries.length,
    };
  }

  /**
   * Validates individual course metadata (course.json)
   */
  static validateCourse(raw: unknown): KnowledgeValidationResult<KnowledgeCourse> {
    const errors: KnowledgeValidationError[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        isValid: false,
        errors: [{ path: 'course', message: 'Course must be an object.', code: 'INVALID_TYPE' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const c = raw as Record<string, unknown>;

    if (!isValidId(c.courseId)) {
      errors.push({ path: 'courseId', message: 'Invalid or missing courseId.', code: 'INVALID_COURSE_ID' });
    }
    if (typeof c.courseTitle !== 'string' || !c.courseTitle.trim()) {
      errors.push({ path: 'courseTitle', message: 'courseTitle must be a non-empty string.', code: 'REQUIRED_FIELD' });
    }
    if (typeof c.coursePackVersion !== 'string' || !parseSemver(c.coursePackVersion)) {
      errors.push({ path: 'coursePackVersion', message: 'coursePackVersion must be valid semver.', code: 'INVALID_VERSION_FORMAT' });
    }
    if (!isValidIsoDate(c.publishedAt)) {
      errors.push({ path: 'publishedAt', message: 'publishedAt must be an ISO 8601 date string.', code: 'INVALID_DATE' });
    }
    if (!isValidIsoDate(c.updatedAt)) {
      errors.push({ path: 'updatedAt', message: 'updatedAt must be an ISO 8601 date string.', code: 'INVALID_DATE' });
    }

    const topics: string[] = [];
    if (Array.isArray(c.topics)) {
      for (const t of c.topics) {
        if (typeof t === 'string' && t.trim()) topics.push(t.trim());
      }
    } else {
      warnings.push('Course topics list is empty or omitted.');
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      data: isValid
        ? {
            courseId: String(c.courseId),
            courseTitle: String(c.courseTitle),
            externalCourseId: typeof c.externalCourseId === 'string' ? c.externalCourseId : undefined,
            provider: typeof c.provider === 'string' ? c.provider : undefined,
            institution: typeof c.institution === 'string' ? c.institution : undefined,
            language: typeof c.language === 'string' ? c.language : 'en',
            description: typeof c.description === 'string' ? c.description : '',
            coursePackVersion: String(c.coursePackVersion),
            publishedAt: String(c.publishedAt),
            updatedAt: String(c.updatedAt),
            topics,
            learningObjectives: Array.isArray(c.learningObjectives)
              ? c.learningObjectives.filter((lo) => typeof lo === 'string')
              : undefined,
            units: Array.isArray(c.units)
              ? (c.units as CourseUnitMetadata[])
              : undefined,
          }
        : undefined,
      errors,
      warnings,
      acceptedResourcesCount: 0,
      acceptedCoursesCount: isValid ? 1 : 0,
    };
  }

  /**
   * Validates array of learning resources (resources.json)
   */
  static validateResources(
    raw: unknown,
    expectedCourseId?: string
  ): KnowledgeValidationResult<KnowledgeResource[]> {
    const errors: KnowledgeValidationError[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(raw)) {
      return {
        isValid: false,
        errors: [{ path: 'resources', message: 'Resources file must contain an array.', code: 'INVALID_TYPE' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const validated: KnowledgeResource[] = [];
    const seenResourceIds = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      const itemPath = `resources[${i}]`;

      if (!item || typeof item !== 'object') {
        errors.push({ path: itemPath, message: 'Resource must be an object.', code: 'INVALID_TYPE' });
        continue;
      }

      const r = item as Record<string, unknown>;

      // resourceId
      if (!isValidId(r.resourceId)) {
        errors.push({
          path: `${itemPath}.resourceId`,
          message: `Invalid or missing resourceId '${String(r.resourceId)}'.`,
          code: 'INVALID_RESOURCE_ID',
        });
      } else {
        const id = String(r.resourceId).trim();
        if (seenResourceIds.has(id)) {
          errors.push({
            path: `${itemPath}.resourceId`,
            message: `Duplicate resourceId '${id}' within course resources pack.`,
            code: 'DUPLICATE_RESOURCE_ID',
          });
        } else {
          seenResourceIds.add(id);
        }
      }

      // courseId
      if (!isValidId(r.courseId)) {
        errors.push({ path: `${itemPath}.courseId`, message: 'Missing courseId.', code: 'INVALID_COURSE_ID' });
      } else if (expectedCourseId && String(r.courseId) !== expectedCourseId) {
        errors.push({
          path: `${itemPath}.courseId`,
          message: `Resource courseId '${String(r.courseId)}' does not match expected pack courseId '${expectedCourseId}'.`,
          code: 'COURSE_ID_MISMATCH',
        });
      }

      // title
      if (typeof r.title !== 'string' || !r.title.trim()) {
        errors.push({ path: `${itemPath}.title`, message: 'Resource title is required.', code: 'REQUIRED_FIELD' });
      }

      // resourceType
      if (typeof r.resourceType !== 'string' || !VALID_RESOURCE_TYPES.has(r.resourceType as KnowledgeResourceType)) {
        errors.push({
          path: `${itemPath}.resourceType`,
          message: `Invalid resourceType '${String(r.resourceType)}'. Valid types: ${Array.from(VALID_RESOURCE_TYPES).join(', ')}`,
          code: 'INVALID_ENUM',
        });
      }

      // content
      if (typeof r.content !== 'string' || !r.content.trim()) {
        errors.push({ path: `${itemPath}.content`, message: 'Resource content must be non-empty text.', code: 'REQUIRED_FIELD' });
      }

      // provenance
      if (!r.provenance || typeof r.provenance !== 'object') {
        errors.push({ path: `${itemPath}.provenance`, message: 'Resource provenance is required.', code: 'REQUIRED_FIELD' });
      } else {
        const p = r.provenance as Record<string, unknown>;
        if (typeof p.sourceTitle !== 'string' || !p.sourceTitle.trim()) {
          errors.push({ path: `${itemPath}.provenance.sourceTitle`, message: 'provenance.sourceTitle is required.', code: 'REQUIRED_FIELD' });
        }
        if (typeof p.license !== 'string' || !p.license.trim()) {
          errors.push({ path: `${itemPath}.provenance.license`, message: 'provenance.license is required.', code: 'REQUIRED_FIELD' });
        }
        if (!isValidIsoDate(p.retrievalDate)) {
          errors.push({ path: `${itemPath}.provenance.retrievalDate`, message: 'provenance.retrievalDate must be an ISO date.', code: 'INVALID_DATE' });
        }
      }

      // contentHash if provided
      if (r.contentHash !== undefined && (typeof r.contentHash !== 'string' || !isValidSha256(r.contentHash))) {
        errors.push({ path: `${itemPath}.contentHash`, message: 'Malformed resource contentHash.', code: 'MALFORMED_HASH' });
      }

      const topics = Array.isArray(r.topics)
        ? r.topics.filter((t) => typeof t === 'string' && t.trim()).map(String)
        : [];

      validated.push({
        resourceId: String(r.resourceId),
        courseId: String(r.courseId),
        title: String(r.title),
        resourceType: r.resourceType as KnowledgeResourceType,
        content: String(r.content),
        topics,
        provenance: {
          sourceTitle: String((r.provenance as Record<string, unknown>).sourceTitle),
          sourceUrl: typeof (r.provenance as Record<string, unknown>).sourceUrl === 'string'
            ? String((r.provenance as Record<string, unknown>).sourceUrl)
            : undefined,
          authorOrPublisher: typeof (r.provenance as Record<string, unknown>).authorOrPublisher === 'string'
            ? String((r.provenance as Record<string, unknown>).authorOrPublisher)
            : undefined,
          license: String((r.provenance as Record<string, unknown>).license),
          attribution: typeof (r.provenance as Record<string, unknown>).attribution === 'string'
            ? String((r.provenance as Record<string, unknown>).attribution)
            : undefined,
          retrievalDate: String((r.provenance as Record<string, unknown>).retrievalDate),
          lectureNumber: typeof (r.provenance as Record<string, unknown>).lectureNumber === 'string'
            ? String((r.provenance as Record<string, unknown>).lectureNumber)
            : undefined,
          lectureTimestamp: typeof (r.provenance as Record<string, unknown>).lectureTimestamp === 'string'
            ? String((r.provenance as Record<string, unknown>).lectureTimestamp)
            : undefined,
        },
        version: typeof r.version === 'string' ? r.version : '1.0.0',
        contentHash: typeof r.contentHash === 'string' ? r.contentHash : undefined,
        createdAt: isValidIsoDate(r.createdAt) ? String(r.createdAt) : new Date().toISOString(),
        updatedAt: isValidIsoDate(r.updatedAt) ? String(r.updatedAt) : new Date().toISOString(),
      });
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      data: isValid ? validated : undefined,
      errors,
      warnings,
      acceptedResourcesCount: isValid ? validated.length : 0,
      acceptedCoursesCount: expectedCourseId ? 1 : 0,
    };
  }

  /**
   * Validates released-assessment review records (review-records.json)
   * Strictly enforces that records are already released, verified, and not active assignment keys.
   */
  static validateReviewRecords(
    raw: unknown,
    expectedCourseId?: string
  ): KnowledgeValidationResult<KnowledgeReviewRecord[]> {
    const errors: KnowledgeValidationError[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(raw)) {
      return {
        isValid: false,
        errors: [{ path: 'reviewRecords', message: 'Review records file must contain an array.', code: 'INVALID_TYPE' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const validated: KnowledgeReviewRecord[] = [];
    const seenRecordIds = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      const itemPath = `reviewRecords[${i}]`;

      if (!item || typeof item !== 'object') {
        errors.push({ path: itemPath, message: 'Review record must be an object.', code: 'INVALID_TYPE' });
        continue;
      }

      const rr = item as Record<string, unknown>;

      // recordId
      if (!isValidId(rr.recordId)) {
        errors.push({ path: `${itemPath}.recordId`, message: 'Invalid or missing recordId.', code: 'INVALID_RECORD_ID' });
      } else {
        const id = String(rr.recordId).trim();
        if (seenRecordIds.has(id)) {
          errors.push({
            path: `${itemPath}.recordId`,
            message: `Duplicate recordId '${id}' in review records.`,
            code: 'DUPLICATE_RECORD_ID',
          });
        } else {
          seenRecordIds.add(id);
        }
      }

      // courseId
      if (!isValidId(rr.courseId)) {
        errors.push({ path: `${itemPath}.courseId`, message: 'Missing courseId.', code: 'INVALID_COURSE_ID' });
      } else if (expectedCourseId && String(rr.courseId) !== expectedCourseId) {
        errors.push({
          path: `${itemPath}.courseId`,
          message: `Record courseId '${String(rr.courseId)}' does not match pack courseId '${expectedCourseId}'.`,
          code: 'COURSE_ID_MISMATCH',
        });
      }

      // assignmentId
      if (typeof rr.assignmentId !== 'string' || !rr.assignmentId.trim()) {
        errors.push({ path: `${itemPath}.assignmentId`, message: 'assignmentId is required.', code: 'REQUIRED_FIELD' });
      }

      // questionFingerprint
      if (typeof rr.questionFingerprint !== 'string' || !rr.questionFingerprint.trim()) {
        errors.push({ path: `${itemPath}.questionFingerprint`, message: 'questionFingerprint is required.', code: 'REQUIRED_FIELD' });
      }

      // normalizedQuestionText
      if (typeof rr.normalizedQuestionText !== 'string' || !rr.normalizedQuestionText.trim()) {
        errors.push({ path: `${itemPath}.normalizedQuestionText`, message: 'normalizedQuestionText is required.', code: 'REQUIRED_FIELD' });
      }

      // explanation
      if (typeof rr.explanation !== 'string' || !rr.explanation.trim()) {
        errors.push({ path: `${itemPath}.explanation`, message: 'explanation is required.', code: 'REQUIRED_FIELD' });
      }

      // verificationStatus
      if (
        typeof rr.verificationStatus !== 'string' ||
        !VALID_VERIFICATION_STATUSES.has(rr.verificationStatus as KnowledgeReviewVerificationStatus)
      ) {
        errors.push({
          path: `${itemPath}.verificationStatus`,
          message: `Invalid verificationStatus '${String(rr.verificationStatus)}'. Must be one of: ${Array.from(VALID_VERIFICATION_STATUSES).join(', ')}`,
          code: 'INVALID_ENUM',
        });
      }

      // isReleased: MUST BE EXPLICIT TRUE
      if (rr.isReleased !== true) {
        errors.push({
          path: `${itemPath}.isReleased`,
          message: 'Review record must have isReleased explicitly set to true. Unreleased assessments cannot be shared.',
          code: 'UNRELEASED_ASSESSMENT_REJECTED',
        });
      }

      // redistributionPermission
      if (typeof rr.redistributionPermission !== 'string' || !rr.redistributionPermission.trim()) {
        errors.push({
          path: `${itemPath}.redistributionPermission`,
          message: 'Explicit redistributionPermission notice is required for review records.',
          code: 'REQUIRED_FIELD',
        });
      }

      // releaseTimestamp
      if (!isValidIsoDate(rr.releaseTimestamp)) {
        errors.push({
          path: `${itemPath}.releaseTimestamp`,
          message: 'releaseTimestamp must be a valid ISO 8601 date string.',
          code: 'INVALID_DATE',
        });
      }

      // provenance
      if (!rr.provenance || typeof rr.provenance !== 'object') {
        errors.push({ path: `${itemPath}.provenance`, message: 'Provenance is required.', code: 'REQUIRED_FIELD' });
      }

      const prov = (rr.provenance as Record<string, unknown>) || {};
      const options = Array.isArray(rr.options) ? rr.options.filter((o) => typeof o === 'string').map(String) : undefined;

      validated.push({
        recordId: String(rr.recordId),
        courseId: String(rr.courseId),
        assignmentId: String(rr.assignmentId),
        questionFingerprint: String(rr.questionFingerprint),
        normalizedQuestionText: String(rr.normalizedQuestionText),
        options,
        explanation: String(rr.explanation),
        verificationStatus: rr.verificationStatus as KnowledgeReviewVerificationStatus,
        verificationSource: typeof rr.verificationSource === 'string' ? rr.verificationSource : 'portal_graded_feedback',
        releaseTimestamp: String(rr.releaseTimestamp),
        redistributionPermission: String(rr.redistributionPermission),
        recordVersion: typeof rr.recordVersion === 'string' ? rr.recordVersion : '1.0.0',
        isReleased: true,
        provenance: {
          sourceTitle: String(prov.sourceTitle || 'Past Graded Feedback'),
          sourceUrl: typeof prov.sourceUrl === 'string' ? prov.sourceUrl : undefined,
          license: String(prov.license || 'Educational Review'),
          retrievalDate: isValidIsoDate(prov.retrievalDate) ? String(prov.retrievalDate) : new Date().toISOString(),
        },
      });
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      data: isValid ? validated : undefined,
      errors,
      warnings,
      acceptedResourcesCount: 0,
      acceptedCoursesCount: expectedCourseId ? 1 : 0,
    };
  }

  /**
   * Validates a complete course pack before caching
   */
  static validateCoursePack(pack: unknown): KnowledgeValidationResult<KnowledgeCoursePack> {
    if (!pack || typeof pack !== 'object') {
      return {
        isValid: false,
        errors: [{ path: 'pack', message: 'Course pack must be an object.', code: 'INVALID_TYPE' }],
        warnings: [],
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const p = pack as Record<string, unknown>;
    const courseRes = this.validateCourse(p.course);
    if (!courseRes.isValid || !courseRes.data) {
      return {
        isValid: false,
        errors: courseRes.errors,
        warnings: courseRes.warnings,
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 0,
      };
    }

    const courseId = courseRes.data.courseId;
    const resourcesRes = this.validateResources(p.resources, courseId);
    if (!resourcesRes.isValid || !resourcesRes.data) {
      return {
        isValid: false,
        errors: resourcesRes.errors,
        warnings: resourcesRes.warnings,
        acceptedResourcesCount: 0,
        acceptedCoursesCount: 1,
      };
    }

    let reviewRecords: KnowledgeReviewRecord[] = [];
    if (p.reviewRecords !== undefined) {
      const reviewRes = this.validateReviewRecords(p.reviewRecords, courseId);
      if (!reviewRes.isValid || !reviewRes.data) {
        return {
          isValid: false,
          errors: reviewRes.errors,
          warnings: reviewRes.warnings,
          acceptedResourcesCount: resourcesRes.data.length,
          acceptedCoursesCount: 1,
        };
      }
      reviewRecords = reviewRes.data;
    }

    return {
      isValid: true,
      data: {
        course: courseRes.data,
        resources: resourcesRes.data,
        reviewRecords,
        contentHash: typeof p.contentHash === 'string' ? p.contentHash : undefined,
      },
      errors: [],
      warnings: [...courseRes.warnings, ...resourcesRes.warnings],
      acceptedResourcesCount: resourcesRes.data.length,
      acceptedCoursesCount: 1,
    };
  }
}
