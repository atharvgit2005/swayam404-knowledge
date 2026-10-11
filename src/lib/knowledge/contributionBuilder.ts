/**
 * Swayam404 Knowledge Base — Reusable Contribution Builder
 *
 * Assembles locally authored resources and eligible released feedback
 * into typed, validated contribution proposals with strict privacy,
 * provenance, and redistribution checks.
 */

import {
  KnowledgeResource,
  KnowledgeReviewRecord,
  KnowledgeResourceType,
  KnowledgeValidationResult,
  ContributionProposal,
  ContributionState,
  ContributionPermission,
  ContributionProposalProvenance,
} from '@/types/knowledge';
import { CourseMaterial, CapturedQuestionRecord } from '@/types';
import { computeSha256 } from '@/lib/knowledge/hasher';
import { KnowledgeValidator } from '@/lib/knowledge/validator';
import { ConflictService } from '@/lib/knowledge/conflictService';
import { normalizeQuestionText } from '@/lib/matching/normalizer';

export class ContributionBuilder {
  /**
   * Builds a proposal from local course materials / student notes
   */
  static async buildLearningResourceProposal(params: {
    courseId: string;
    title: string;
    materials: CourseMaterial[];
    resourceType: KnowledgeResourceType;
    provenance: {
      contributorName?: string;
      sourceTitle: string;
      sourceUrl?: string;
      license: string;
      permission: ContributionPermission;
      isPermissionConfirmed: boolean;
      lectureNumber?: string;
    };
    topics: string[];
    existingCourseResources?: KnowledgeResource[];
  }): Promise<ContributionProposal> {
    const {
      courseId,
      title,
      materials,
      resourceType,
      provenance,
      topics,
      existingCourseResources = [],
    } = params;

    const timestamp = new Date().toISOString();
    const proposalId = `contrib-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const resources: KnowledgeResource[] = [];
    const validationErrors: Array<{ path: string; message: string; code: string }> = [];
    const validationWarnings: string[] = [];

    // 1. Process materials into KnowledgeResources
    for (const mat of materials) {
      const resourceId = `res-${courseId}-${mat.id || Date.now()}`.replace(/[^a-z0-9-_]/gi, '-');
      const content = mat.content || '';

      // Check for sensitive leakage
      const sensitiveLeak = this.detectSensitiveData(content);
      if (sensitiveLeak) {
        validationErrors.push({
          path: `resources[${resourceId}].content`,
          message: `Contains sensitive data (${sensitiveLeak.type}). Cannot export.`,
          code: 'SENSITIVE_DATA_DETECTED',
        });
      }

      const contentHash = await computeSha256(content);

      const resource: KnowledgeResource = {
        resourceId,
        courseId,
        title: mat.title || title,
        resourceType,
        content,
        topics: topics.length > 0 ? topics : [title],
        provenance: {
          sourceTitle: provenance.sourceTitle,
          sourceUrl: provenance.sourceUrl,
          authorOrPublisher: provenance.contributorName,
          license: provenance.license,
          retrievalDate: timestamp.slice(0, 10),
          lectureNumber: provenance.lectureNumber,
        },
        version: '1.0.0',
        contentHash,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // Formal schema validation
      const val = KnowledgeValidator.validateResources([resource], courseId);
      if (!val.isValid) {
        validationErrors.push(...val.errors);
      }
      validationWarnings.push(...val.warnings);

      resources.push(resource);
    }

    // 2. Permission and Redistribution verification
    if (provenance.permission === 'restricted') {
      validationErrors.push({
        path: 'provenance.permission',
        message: 'Resource permission is restricted. Public distribution is prohibited.',
        code: 'PERMISSION_RESTRICTED',
      });
    } else if (!provenance.isPermissionConfirmed || provenance.permission === 'unverified') {
      validationWarnings.push('Redistribution permission is unconfirmed. Proposal can only be saved locally, not exported for publication.');
    }

    // 3. Conflict detection
    const conflicts = ConflictService.detectResourceConflicts({
      proposedResources: resources,
      existingResources: existingCourseResources,
    });

    const hasErrors = validationErrors.length > 0 || resources.length === 0;
    const state: ContributionState = hasErrors ? 'validation-failed' : 'ready-for-review';

    const validationResult: KnowledgeValidationResult = {
      isValid: !hasErrors,
      errors: validationErrors,
      warnings: validationWarnings,
      acceptedResourcesCount: hasErrors ? 0 : resources.length,
      acceptedCoursesCount: hasErrors ? 0 : 1,
    };

    const provenanceSummary: ContributionProposalProvenance = {
      contributorName: provenance.contributorName,
      sourceSummary: provenance.sourceTitle,
      license: provenance.license,
      permission: provenance.permission,
      isPermissionConfirmed: provenance.isPermissionConfirmed,
    };

    return {
      proposalId,
      courseId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      state,
      resources,
      reviewRecords: [],
      conflicts,
      validationResult,
      provenanceSummary,
      targetPaths: {
        coursePath: `courses/${courseId}/course.json`,
        resourcesPath: `courses/${courseId}/resources.json`,
        reviewRecordsPath: `courses/${courseId}/review-records.json`,
      },
    };
  }

  /**
   * Builds an eligible released-review proposal from captured assignment feedback
   */
  static async buildReleasedFeedbackProposal(params: {
    courseId: string;
    assignmentId: string;
    title: string;
    capturedRecords: CapturedQuestionRecord[];
    license?: string;
    permission?: ContributionPermission;
    existingReviewRecords?: KnowledgeReviewRecord[];
  }): Promise<ContributionProposal> {
    const {
      courseId,
      assignmentId,
      title,
      capturedRecords,
      license = 'CC-BY-NC-4.0',
      permission = 'public-open-educational',
      existingReviewRecords = [],
    } = params;

    const timestamp = new Date().toISOString();
    const proposalId = `contrib-review-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const reviewRecords: KnowledgeReviewRecord[] = [];
    const validationErrors: Array<{ path: string; message: string; code: string }> = [];
    const validationWarnings: string[] = [];

    for (const rec of capturedRecords) {
      // Rule 1: A student's previously selected answer is NOT verified feedback
      if (rec.verificationStatus !== 'portal-confirmed' || !rec.hasExplicitFeedback) {
        validationErrors.push({
          path: `records[${rec.id}].verificationStatus`,
          message: `Record "${rec.id}" lacks explicit portal-confirmed feedback. Student selections cannot be published as verified answers.`,
          code: 'UNVERIFIED_STUDENT_SELECTION',
        });
        continue;
      }

      // Rule 2: Active or ongoing assessments without explicit release cannot be shared
      if (rec.acceptedAnswers.length === 0) {
        validationErrors.push({
          path: `records[${rec.id}].acceptedAnswers`,
          message: `Record "${rec.id}" has no accepted answers identified.`,
          code: 'MISSING_ACCEPTED_ANSWERS',
        });
        continue;
      }

      const normQuestion = normalizeQuestionText(rec.questionText);
      const questionHash = await computeSha256(normQuestion);
      const fingerprint = questionHash.slice(0, 32);
      const recordId = `rev-${courseId}-${assignmentId}-${rec.questionIndex || fingerprint.slice(0, 8)}`;

      // Check for sensitive leakage
      const sensitiveLeak = this.detectSensitiveData(rec.questionText + ' ' + (rec.explanation || ''));
      if (sensitiveLeak) {
        validationErrors.push({
          path: `records[${recordId}].content`,
          message: `Contains sensitive data (${sensitiveLeak.type}). Cannot export.`,
          code: 'SENSITIVE_DATA_DETECTED',
        });
      }

      const reviewRecord: KnowledgeReviewRecord = {
        recordId,
        courseId,
        assignmentId,
        questionFingerprint: fingerprint,
        normalizedQuestionText: normQuestion,
        options: rec.acceptedAnswers,
        explanation: rec.explanation || 'Verified from released assessment feedback.',
        verificationStatus: 'portal-confirmed',
        verificationSource: rec.verificationSource || 'portal-feedback',
        releaseTimestamp: timestamp,
        redistributionPermission: permission,
        recordVersion: '1.0.0',
        isReleased: true, // Released feedback from submitted assessment
        provenance: {
          sourceTitle: `${title} (${assignmentId})`,
          license,
          retrievalDate: timestamp.slice(0, 10),
        },
      };

      const val = KnowledgeValidator.validateReviewRecords([reviewRecord], courseId);
      if (!val.isValid) {
        validationErrors.push(...val.errors);
      }
      validationWarnings.push(...val.warnings);

      reviewRecords.push(reviewRecord);
    }

    const conflicts = ConflictService.detectReviewRecordConflicts({
      proposedRecords: reviewRecords,
      existingRecords: existingReviewRecords,
    });

    const hasErrors = validationErrors.length > 0 || reviewRecords.length === 0;
    const state: ContributionState = hasErrors ? 'validation-failed' : 'ready-for-review';

    const validationResult: KnowledgeValidationResult = {
      isValid: !hasErrors,
      errors: validationErrors,
      warnings: validationWarnings,
      acceptedResourcesCount: 0,
      acceptedCoursesCount: hasErrors ? 0 : 1,
    };

    const provenanceSummary: ContributionProposalProvenance = {
      sourceSummary: title,
      license,
      permission,
      isPermissionConfirmed: permission !== 'unverified' && permission !== 'restricted',
    };

    return {
      proposalId,
      courseId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      state,
      resources: [],
      reviewRecords,
      conflicts,
      validationResult,
      provenanceSummary,
      targetPaths: {
        coursePath: `courses/${courseId}/course.json`,
        resourcesPath: `courses/${courseId}/resources.json`,
        reviewRecordsPath: `courses/${courseId}/review-records.json`,
      },
    };
  }

  /**
   * Scans string for privacy or authentication tokens
   */
  static detectSensitiveData(text: string): { type: string } | null {
    if (!text) return null;

    // Google API key pattern
    if (/AIza[0-9A-Za-z-_]{35}/.test(text)) {
      return { type: 'API Key (Google)' };
    }
    // OpenAI / xAI key pattern
    if (/sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}/.test(text)) {
      return { type: 'API Key (OpenAI/xAI)' };
    }
    // Bearer token
    if (/Bearer\s+[a-zA-Z0-9_.-]{20,}/i.test(text)) {
      return { type: 'Bearer Token' };
    }
    // Session cookies
    if (/(?:sessionid|connect\.sid|PHPSESSID)=/i.test(text)) {
      return { type: 'Session Cookie' };
    }
    // Raw script tags
    if (/<script\b[^>]*>([\s\S]*?)<\/script>/i.test(text)) {
      return { type: 'Raw Script Tag' };
    }
    // Roll number or student roll identifier
    if (/\b(?:roll\s*no|student\s*id)\s*[:=]\s*[a-zA-Z0-9_-]{4,}\b/i.test(text)) {
      return { type: 'Student Identifier' };
    }

    return null;
  }
}
