import {
  QuestionRecord,
  ScannedQuestion,
  QuestionMatchResult,
  MatchStatus,
  ScannedOption,
} from '@/types';
import {
  normalizeQuestionText,
  normalizeOptionText,
  detectCriticalTokenConflict,
  calculateTextSimilarity,
} from './normalizer';

/**
 * Finds the matching scanned option based on saved correct option text
 */
export function findMatchingScannedOption(
  correctOptionText: string,
  scannedOptions: ScannedOption[]
): ScannedOption | undefined {
  const normTarget = normalizeOptionText(correctOptionText);

  // 1. Exact normalized match
  for (const opt of scannedOptions) {
    if (normalizeOptionText(opt.text) === normTarget) {
      return opt;
    }
  }

  // 2. High-confidence similarity match for slight typo or punctuation
  for (const opt of scannedOptions) {
    const normOpt = normalizeOptionText(opt.text);
    const sim = calculateTextSimilarity(normOpt, normTarget);
    if (sim >= 0.92) {
      return opt;
    }
  }

  return undefined;
}

/**
 * Matches a single scanned question against a course answer bank
 */
export function matchQuestion(
  scanned: ScannedQuestion,
  answerBank: QuestionRecord[]
): QuestionMatchResult {
  // If the question form type is unknown or invalid
  if (scanned.formType === 'unknown') {
    return {
      scannedQuestion: scanned,
      status: 'unsupported-type',
      confidence: 0,
      reasons: ['No recognizable form controls (radio, checkbox, text) found for this question.'],
      proposedAnswers: [],
      isApproved: false,
      requiresReview: false,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  const normScanned = normalizeQuestionText(scanned.questionText);
  if (!normScanned) {
    return {
      scannedQuestion: scanned,
      status: 'no-match',
      confidence: 0,
      reasons: ['Extracted question text was empty.'],
      proposedAnswers: [],
      isApproved: false,
      requiresReview: false,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  // Filter bank candidates of compatible question types (if known)
  const candidateRecords = answerBank.filter((r) => {
    if (scanned.questionType === 'short-text') {
      return r.questionType === 'short-text';
    }
    // Radio / Single-choice & True/False are compatible
    if (scanned.questionType === 'single-choice' || scanned.questionType === 'true-false') {
      return r.questionType === 'single-choice' || r.questionType === 'true-false';
    }
    if (scanned.questionType === 'multiple-choice') {
      return r.questionType === 'multiple-choice';
    }
    return true;
  });

  // Level 1: Check for Exact Normalized Match
  for (const record of candidateRecords) {
    const normBank = normalizeQuestionText(record.questionText);
    if (normScanned === normBank) {
      // Check critical tokens (numbers, negations)
      const conflict = detectCriticalTokenConflict(scanned.questionText, record.questionText);
      if (conflict.hasConflict) {
        return {
          scannedQuestion: scanned,
          matchedRecord: record,
          status: 'ambiguous-match',
          confidence: 0.6,
          reasons: [conflict.reason || 'Critical token conflict detected despite identical structure.'],
          proposedAnswers: [],
          isApproved: false,
          requiresReview: true,
          candidateOptions: scanned.options.map((o) => o.text),
        };
      }

      // Verify answer option alignment
      if (scanned.questionType === 'short-text') {
        const proposed = record.answerText ? [record.answerText] : [];
        return {
          scannedQuestion: scanned,
          matchedRecord: record,
          status: 'exact-match',
          confidence: 1.0,
          reasons: ['Exact normalized question match verified.'],
          proposedAnswers: proposed,
          isApproved: proposed.length > 0,
          requiresReview: false,
          candidateOptions: [],
        };
      }

      // Choice-based questions: verify correct options exist in current rendered choices
      const correctTargets = record.correctOptions || [];
      if (correctTargets.length === 0 && record.answerText) {
        correctTargets.push(record.answerText);
      }

      const matchedCurrentOptions: string[] = [];
      const missingTargets: string[] = [];

      for (const target of correctTargets) {
        const found = findMatchingScannedOption(target, scanned.options);
        if (found) {
          matchedCurrentOptions.push(found.text);
        } else {
          missingTargets.push(target);
        }
      }

      if (missingTargets.length > 0) {
        return {
          scannedQuestion: scanned,
          matchedRecord: record,
          status: 'ambiguous-match',
          confidence: 0.65,
          reasons: [
            `Saved answer '${missingTargets.join(', ')}' does not appear among the current visible options.`,
          ],
          proposedAnswers: [],
          isApproved: false,
          requiresReview: true,
          candidateOptions: scanned.options.map((o) => o.text),
        };
      }

      return {
        scannedQuestion: scanned,
        matchedRecord: record,
        status: 'exact-match',
        confidence: 1.0,
        reasons: [
          'Exact normalized question match.',
          `Verified option match: ${matchedCurrentOptions.map((o) => `"${o}"`).join(', ')}.`,
        ],
        proposedAnswers: matchedCurrentOptions,
        isApproved: true,
        requiresReview: false,
        candidateOptions: scanned.options.map((o) => o.text),
      };
    }
  }

  // Level 2 & 3: Similarity and Ambiguity Scoring
  interface ScoredCandidate {
    record: QuestionRecord;
    score: number;
    conflict: { hasConflict: boolean; reason?: string };
  }

  const scored: ScoredCandidate[] = [];

  for (const record of candidateRecords) {
    const normBank = normalizeQuestionText(record.questionText);
    const score = calculateTextSimilarity(normScanned, normBank);
    const conflict = detectCriticalTokenConflict(scanned.questionText, record.questionText);
    scored.push({ record, score, conflict });
  }

  // Sort descending by similarity score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score < 0.68) {
    return {
      scannedQuestion: scanned,
      status: 'no-match',
      confidence: 0,
      reasons: ['No matching question found in this course answer bank.'],
      proposedAnswers: [],
      isApproved: false,
      requiresReview: false,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  // Ambiguity check: If top 2 are very close in score
  if (second && best.score - second.score < 0.06 && second.score >= 0.75) {
    return {
      scannedQuestion: scanned,
      matchedRecord: best.record,
      status: 'ambiguous-match',
      confidence: Math.round(best.score * 100) / 100,
      reasons: [
        `Ambiguous match: Multiple saved questions match closely (${Math.round(best.score * 100)}% vs ${Math.round(second.score * 100)}%).`,
      ],
      proposedAnswers: [],
      isApproved: false,
      requiresReview: true,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  // Critical conflict check on best candidate
  if (best.conflict.hasConflict) {
    return {
      scannedQuestion: scanned,
      matchedRecord: best.record,
      status: 'ambiguous-match',
      confidence: Math.round(best.score * 100) / 100,
      reasons: [
        `Near match (${Math.round(best.score * 100)}%), but: ${best.conflict.reason}. Not safe to populate.`,
      ],
      proposedAnswers: [],
      isApproved: false,
      requiresReview: true,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  // Check if options match for probable match
  const correctTargets = best.record.correctOptions || [];
  const matchedOptions: string[] = [];
  for (const target of correctTargets) {
    const found = findMatchingScannedOption(target, scanned.options);
    if (found) {
      matchedOptions.push(found.text);
    }
  }

  if (best.score >= 0.82) {
    const status: MatchStatus = 'probable-match';
    return {
      scannedQuestion: scanned,
      matchedRecord: best.record,
      status,
      confidence: Math.round(best.score * 100) / 100,
      reasons: [
        `Probable text similarity (${Math.round(best.score * 100)}%). Review required before population.`,
        matchedOptions.length > 0
          ? `Candidate option: ${matchedOptions.join(', ')}`
          : 'Warning: Could not clearly map saved option to visible choices.',
      ],
      proposedAnswers: matchedOptions,
      isApproved: false, // Mandatory review!
      requiresReview: true,
      candidateOptions: scanned.options.map((o) => o.text),
    };
  }

  return {
    scannedQuestion: scanned,
    status: 'no-match',
    confidence: Math.round(best.score * 100) / 100,
    reasons: [`Low confidence match (${Math.round(best.score * 100)}%) below safety threshold.`],
    proposedAnswers: [],
    isApproved: false,
    requiresReview: false,
    candidateOptions: scanned.options.map((o) => o.text),
  };
}

/**
 * Matches an entire scanned assignment against the selected course's answer bank
 */
export function matchAssignment(
  scannedQuestions: ScannedQuestion[],
  answerBank: QuestionRecord[]
): QuestionMatchResult[] {
  return scannedQuestions.map((q) => matchQuestion(q, answerBank));
}
