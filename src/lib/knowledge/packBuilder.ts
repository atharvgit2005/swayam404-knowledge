/**
 * Swayam404 Knowledge Base — Course Pack Builder & Validator
 *
 * Compiles, validates, and hashes production-grade course packs into versioned
 * manifests and course catalogs. Ensures complete data integrity and provenance safety.
 */

import {
  KnowledgeCourse,
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeCoursePack,
  KnowledgeManifest,
  KnowledgeManifestCourseEntry,
  CoursePackValidationReport,
} from '@/types/knowledge';
import { computeSha256 } from './hasher';
import { KnowledgeValidator } from './validator';
import { validateRelativeRepoPath } from './security';

export interface BuiltCoursePackResult {
  entry: KnowledgeManifestCourseEntry;
  coursePack: KnowledgeCoursePack;
  report: CoursePackValidationReport;
}

export interface BuildCatalogResult {
  isValid: boolean;
  manifest: KnowledgeManifest;
  catalog: Array<{
    courseId: string;
    courseTitle: string;
    coursePackVersion: string;
    resourceCount: number;
    reviewRecordCount: number;
    lastUpdated: string;
    contentHash: string;
  }>;
  packReports: CoursePackValidationReport[];
  errors: string[];
  warnings: string[];
  changedFiles: string[];
}

export class CoursePackBuilder {
  /**
   * Computes the deterministic canonical pack hash for a course pack.
   */
  static async computePackHash(
    courseId: string,
    coursePackVersion: string,
    course: KnowledgeCourse,
    resources: KnowledgeResource[],
    reviewRecords: KnowledgeReviewRecord[] = []
  ): Promise<string> {
    const packPayload = {
      courseId,
      coursePackVersion,
      course,
      resources,
      reviewRecords,
    };
    return await computeSha256(packPayload);
  }

  /**
   * Validates and prepares a single course pack for publication.
   */
  static async buildAndValidateCoursePack(params: {
    course: KnowledgeCourse;
    resources: KnowledgeResource[];
    reviewRecords?: KnowledgeReviewRecord[];
    previousHash?: string;
  }): Promise<BuiltCoursePackResult> {
    const { course, resources, reviewRecords = [], previousHash } = params;
    const errors: string[] = [];
    const warnings: string[] = [];
    const changedFiles: string[] = [];

    const courseId = course.courseId;
    const version = course.coursePackVersion || '1.0.0';

    // 1. Validate course metadata
    const courseVal = KnowledgeValidator.validateCourse(course);
    if (!courseVal.isValid) {
      errors.push(...courseVal.errors.map((e) => `Course metadata (${e.path}): ${e.message}`));
    }
    warnings.push(...courseVal.warnings);

    // 2. Validate resources
    const resVal = KnowledgeValidator.validateResources(resources, courseId);
    if (!resVal.isValid) {
      errors.push(...resVal.errors.map((e) => `Resource (${e.path}): ${e.message}`));
    }
    warnings.push(...resVal.warnings);

    // Check unique resource IDs
    const seenResIds = new Set<string>();
    for (const r of resources) {
      if (seenResIds.has(r.resourceId)) {
        errors.push(`Duplicate resourceId '${r.resourceId}' found in course '${courseId}'.`);
      }
      seenResIds.add(r.resourceId);

      // Check redistribution permission
      if (r.provenance && r.provenance.license.toLowerCase() === 'restricted') {
        errors.push(`Resource '${r.resourceId}' has restricted redistribution license; cannot be included in public pack.`);
      }
    }

    // 3. Validate review records
    let rrVal: ReturnType<typeof KnowledgeValidator.validateReviewRecords> | undefined;
    if (reviewRecords.length > 0) {
      rrVal = KnowledgeValidator.validateReviewRecords(reviewRecords, courseId);
      if (!rrVal.isValid) {
        errors.push(...rrVal.errors.map((e) => `Review Record (${e.path}): ${e.message}`));
      }
      warnings.push(...rrVal.warnings);

      // Enforce released state
      for (const rec of reviewRecords) {
        if (!rec.isReleased) {
          errors.push(`Review record '${rec.recordId}' is not marked isReleased=true; unreleased records are prohibited.`);
        }
      }
    }

    // 4. Verify relative paths
    const metadataPath = `courses/${courseId}/course.json`;
    const resourcesPath = `courses/${courseId}/resources.json`;
    const reviewRecordsPath = `courses/${courseId}/review-records.json`;

    for (const p of [metadataPath, resourcesPath, reviewRecordsPath]) {
      const pathCheck = validateRelativeRepoPath(p);
      if (!pathCheck.isValid) {
        errors.push(`Invalid relative path '${p}': ${pathCheck.error}`);
      }
    }

    // 5. Calculate deterministic hash
    const courseToUse = courseVal.data || course;
    const resourcesToUse = resVal.data || resources;
    const reviewRecordsToUse = rrVal?.data || reviewRecords;
    const contentHash = await this.computePackHash(courseId, version, courseToUse, resourcesToUse, reviewRecordsToUse);

    if (previousHash && previousHash.toLowerCase() !== contentHash.toLowerCase()) {
      changedFiles.push(resourcesPath, metadataPath);
      if (reviewRecords.length > 0) changedFiles.push(reviewRecordsPath);
    }

    // Calculate total chunk count across resources
    const chunkCount = resources.reduce((sum, r) => sum + (r.chunks ? r.chunks.length : 1), 0);

    const now = new Date().toISOString();
    const entry: KnowledgeManifestCourseEntry = {
      courseId,
      courseTitle: course.courseTitle,
      provider: course.provider || 'SWAYAM',
      institution: course.institution,
      language: course.language || 'en',
      coursePackVersion: version,
      lastUpdated: course.updatedAt || now,
      metadataPath,
      resourcesPath,
      reviewRecordsPath: reviewRecords.length > 0 ? reviewRecordsPath : undefined,
      contentHash,
      resourceCount: resources.length,
      reviewRecordCount: reviewRecords.length,
    };

    const coursePack: KnowledgeCoursePack = {
      course: courseToUse,
      resources: resourcesToUse,
      reviewRecords: reviewRecordsToUse,
      contentHash,
    };

    const report: CoursePackValidationReport = {
      isValid: errors.length === 0,
      timestamp: now,
      courseId,
      courseTitle: course.courseTitle,
      version,
      contentHash,
      resourceCount: resources.length,
      reviewRecordCount: reviewRecords.length,
      chunkCount,
      errors,
      warnings,
      changedFiles,
    };

    return { entry, coursePack, report };
  }

  /**
   * Compiles root manifest.json and course catalog index.json from built course packs.
   */
  static compileManifestAndCatalog(params: {
    existingManifest?: Partial<KnowledgeManifest>;
    builtPacks: BuiltCoursePackResult[];
  }): BuildCatalogResult {
    const { existingManifest, builtPacks } = params;
    const errors: string[] = [];
    const warnings: string[] = [];
    const changedFiles: string[] = [];
    const packReports: CoursePackValidationReport[] = [];

    const courseEntries: KnowledgeManifestCourseEntry[] = [];
    const catalog: BuildCatalogResult['catalog'] = [];

    // Collect and check for cross-pack courseId uniqueness
    const seenCourseIds = new Set<string>();

    for (const built of builtPacks) {
      packReports.push(built.report);
      errors.push(...built.report.errors);
      warnings.push(...built.report.warnings);
      changedFiles.push(...built.report.changedFiles);

      if (seenCourseIds.has(built.entry.courseId)) {
        errors.push(`Duplicate courseId '${built.entry.courseId}' found across course packs.`);
      }
      seenCourseIds.add(built.entry.courseId);

      courseEntries.push(built.entry);
      catalog.push({
        courseId: built.entry.courseId,
        courseTitle: built.entry.courseTitle,
        coursePackVersion: built.entry.coursePackVersion,
        resourceCount: built.entry.resourceCount,
        reviewRecordCount: built.entry.reviewRecordCount,
        lastUpdated: built.entry.lastUpdated,
        contentHash: built.entry.contentHash,
      });
    }

    const now = new Date().toISOString();
    const manifest: KnowledgeManifest = {
      schemaVersion: '1.0.0',
      datasetVersion: existingManifest?.datasetVersion || '1.0.0',
      name: existingManifest?.name || 'swayam404-knowledge',
      description:
        existingManifest?.description ||
        'Shared open learning knowledge base and course packs for Swayam404.',
      publishedAt: existingManifest?.publishedAt || now,
      minExtensionVersion: existingManifest?.minExtensionVersion || '1.0.0',
      courses: courseEntries,
    };

    // Validate manifest structure
    const manifestVal = KnowledgeValidator.validateManifest(manifest);
    if (!manifestVal.isValid) {
      errors.push(...manifestVal.errors.map((e) => `Manifest (${e.path}): ${e.message}`));
    }
    warnings.push(...manifestVal.warnings);

    return {
      isValid: errors.length === 0,
      manifest,
      catalog,
      packReports,
      errors,
      warnings,
      changedFiles: Array.from(new Set(changedFiles)),
    };
  }
}
