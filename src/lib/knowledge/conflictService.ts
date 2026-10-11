/**
 * Swayam404 Knowledge Base — Conflict & Duplicate Detection Service
 *
 * Identifies exact duplicates, ID collisions, conflicting content, and
 * contradictory verification metadata across proposed and existing resources.
 */

import {
  KnowledgeResource,
  KnowledgeReviewRecord,
  ContributionConflictItem,
} from '@/types/knowledge';
import { normalizeQuestionText, normalizeOptionText } from '@/lib/matching/normalizer';

export class ConflictService {
  /**
   * Detects conflicts and duplicates between proposed resources and existing resources
   */
  static detectResourceConflicts(params: {
    proposedResources: KnowledgeResource[];
    existingResources: KnowledgeResource[];
  }): ContributionConflictItem[] {
    const { proposedResources, existingResources } = params;
    const conflicts: ContributionConflictItem[] = [];

    // 1. Check collisions within proposed resources itself
    for (let i = 0; i < proposedResources.length; i++) {
      for (let j = i + 1; j < proposedResources.length; j++) {
        const a = proposedResources[i];
        const b = proposedResources[j];

        if (a.resourceId === b.resourceId) {
          conflicts.push({
            type: 'id-collision',
            message: `Duplicate resourceId "${a.resourceId}" within proposed resources.`,
            existingId: a.resourceId,
            proposedId: b.resourceId,
            resourceType: a.resourceType,
          });
        } else if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) {
          conflicts.push({
            type: 'exact-duplicate',
            message: `Identical contentHash "${a.contentHash}" between "${a.resourceId}" and "${b.resourceId}".`,
            existingId: a.resourceId,
            proposedId: b.resourceId,
            resourceType: a.resourceType,
          });
        }
      }
    }

    // 2. Check proposed resources against existing resources
    for (const proposed of proposedResources) {
      for (const existing of existingResources) {
        // Enforce course isolation: only compare within the same course
        if (proposed.courseId !== existing.courseId) {
          continue;
        }

        // Case A: ID collision
        if (proposed.resourceId === existing.resourceId) {
          if (
            proposed.contentHash &&
            existing.contentHash &&
            proposed.contentHash === existing.contentHash
          ) {
            conflicts.push({
              type: 'exact-duplicate',
              message: `Resource "${proposed.resourceId}" is an exact duplicate of an existing resource.`,
              existingId: existing.resourceId,
              proposedId: proposed.resourceId,
              resourceType: proposed.resourceType,
              existingDetails: existing.title,
              proposedDetails: proposed.title,
            });
          } else {
            conflicts.push({
              type: 'id-collision',
              message: `Resource ID "${proposed.resourceId}" already exists with different content.`,
              existingId: existing.resourceId,
              proposedId: proposed.resourceId,
              resourceType: proposed.resourceType,
              existingDetails: existing.title,
              proposedDetails: proposed.title,
            });
          }
          continue;
        }

        // Case B: Same content hash under different ID
        if (
          proposed.contentHash &&
          existing.contentHash &&
          proposed.contentHash === existing.contentHash
        ) {
          conflicts.push({
            type: 'exact-duplicate',
            message: `Resource "${proposed.resourceId}" has identical content hash to existing "${existing.resourceId}".`,
            existingId: existing.resourceId,
            proposedId: proposed.resourceId,
            resourceType: proposed.resourceType,
            existingDetails: existing.title,
            proposedDetails: proposed.title,
          });
          continue;
        }

        // Case C: High text similarity (> 85% overlap) without exact hash match
        const sim = this.computeStringSimilarity(proposed.content, existing.content);
        if (sim > 0.85) {
          conflicts.push({
            type: 'similarity-warning',
            message: `Resource "${proposed.resourceId}" has ${Math.round(sim * 100)}% content similarity to existing "${existing.resourceId}". Review manually.`,
            existingId: existing.resourceId,
            proposedId: proposed.resourceId,
            resourceType: proposed.resourceType,
            similarityScore: sim,
            existingDetails: existing.title,
            proposedDetails: proposed.title,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Detects conflicts and duplicates for released review records
   */
  static detectReviewRecordConflicts(params: {
    proposedRecords: KnowledgeReviewRecord[];
    existingRecords: KnowledgeReviewRecord[];
  }): ContributionConflictItem[] {
    const { proposedRecords, existingRecords } = params;
    const conflicts: ContributionConflictItem[] = [];

    // Internal proposal checks
    for (let i = 0; i < proposedRecords.length; i++) {
      for (let j = i + 1; j < proposedRecords.length; j++) {
        const a = proposedRecords[i];
        const b = proposedRecords[j];

        if (a.recordId === b.recordId) {
          conflicts.push({
            type: 'id-collision',
            message: `Duplicate recordId "${a.recordId}" within proposed records.`,
            existingId: a.recordId,
            proposedId: b.recordId,
          });
        }
      }
    }

    // Cross-checks with existing records
    for (const proposed of proposedRecords) {
      for (const existing of existingRecords) {
        if (proposed.courseId !== existing.courseId) {
          continue;
        }

        // 1. Record ID Collision
        if (proposed.recordId === existing.recordId) {
          conflicts.push({
            type: 'id-collision',
            message: `Record ID "${proposed.recordId}" already exists.`,
            existingId: existing.recordId,
            proposedId: proposed.recordId,
          });
        }

        // 2. Question Fingerprint Match & Verification Contradiction
        const proposedNorm = normalizeQuestionText(proposed.normalizedQuestionText);
        const existingNorm = normalizeQuestionText(existing.normalizedQuestionText);

        const isSameQuestion =
          (proposed.questionFingerprint &&
            existing.questionFingerprint &&
            proposed.questionFingerprint === existing.questionFingerprint) ||
          (proposedNorm && existingNorm && proposedNorm === existingNorm);

        if (isSameQuestion) {
          // Compare explanations or answer options
          const proposedAnswers = proposed.options || [];
          const existingAnswers = existing.options || [];

          const normPropAnswers = proposedAnswers.map(normalizeOptionText).sort();
          const normExistAnswers = existingAnswers.map(normalizeOptionText).sort();

          const answersContradict =
            normPropAnswers.length > 0 &&
            normExistAnswers.length > 0 &&
            JSON.stringify(normPropAnswers) !== JSON.stringify(normExistAnswers);

          if (answersContradict) {
            conflicts.push({
              type: 'contradictory-verification',
              message: `Conflicting answer options for question "${proposed.recordId}" against existing "${existing.recordId}".`,
              existingId: existing.recordId,
              proposedId: proposed.recordId,
              existingDetails: `Existing: ${existingAnswers.join(', ')} (${existing.verificationStatus})`,
              proposedDetails: `Proposed: ${proposedAnswers.join(', ')} (${proposed.verificationStatus})`,
            });
          } else {
            conflicts.push({
              type: 'exact-duplicate',
              message: `Record for question "${proposed.recordId}" already exists in course pack as "${existing.recordId}".`,
              existingId: existing.recordId,
              proposedId: proposed.recordId,
              existingDetails: existing.recordId,
              proposedDetails: proposed.recordId,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Fast Jaccard token similarity for duplicate suggestion
   */
  private static computeStringSimilarity(strA: string, strB: string): number {
    if (!strA || !strB) return 0;
    if (strA === strB) return 1.0;

    const tokensA = new Set(strA.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
    const tokensB = new Set(strB.toLowerCase().split(/\s+/).filter((t) => t.length > 3));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) {
        intersection++;
      }
    }

    const union = tokensA.size + tokensB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
