import {
  ScannedQuestion,
  QuestionRecord,
  CourseMaterial,
  ExtensionSettings,
  Course,
  QuestionMatchResult,
  ResolutionState,
  LlmProviderType,
} from '@/types';
import { KnowledgeResource } from '@/types/knowledge';
import { GraphRetrievalEngine } from '@/lib/retrieval';
import { getLlmProvider } from '@/lib/ai';
import { normalizeQuestionText, normalizeOptionText, detectCriticalTokenConflict } from '@/lib/matching/normalizer';
import { courseRetrievalService } from '@/lib/context/retrievalService';
import { KnowledgeBaseService } from '@/lib/knowledge/service';
import { PipelineDiagnosticsTracer, pipelineTracer } from './pipelineDiagnostics';

export interface ResolveAssignmentOptions {
  questions: ScannedQuestion[];
  selectedCourse: Course;
  answerBank: QuestionRecord[];
  materials?: CourseMaterial[];
  sharedResources?: KnowledgeResource[];
  settings: ExtensionSettings;
  tracer?: PipelineDiagnosticsTracer;
  skipLlm?: boolean;
}

export interface AssignmentResolutionResult {
  results: QuestionMatchResult[];
  summary: {
    totalScanned: number;
    portalConfirmed: number;
    studentReviewed: number;
    aiSuggested: number;
    ambiguous: number;
    unresolved: number;
    providerErrors: number;
    eligibleForAutoPopulate: number;
  };
  tracerReport: ReturnType<PipelineDiagnosticsTracer['generateReport']>;
}

/**
 * Validates whether an error is retryable (rate limits, timeouts, temporary 5xx).
 * Non-retryable: 401/403 auth errors, invalid credentials.
 */
function isRetryableProviderError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('rate') ||
    lower.includes('quota') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('temporarily') ||
    lower.includes('fetch failed')
  );
}

/**
 * Resolves API key, model, and display name for a given provider
 */
function getProviderCredentials(
  type: LlmProviderType,
  settings: ExtensionSettings
): { key: string; model: string; name: string } {
  switch (type) {
    case 'grok':
      return {
        key: settings.grokApiKey || '',
        model: settings.grokModel || 'grok-2-latest',
        name: 'xAI Grok',
      };
    case 'openai':
      return {
        key: settings.openaiApiKey || '',
        model: settings.openaiModel || 'gpt-4o-mini',
        name: 'OpenAI',
      };
    case 'gemini':
    default:
      return {
        key: settings.aiApiKey || '',
        model: settings.aiModel || 'gemini-1.5-flash',
        name: 'Google Gemini',
      };
  }
}

/**
 * Standardizes accepted answers from a QuestionRecord
 */
function getRecordAcceptedAnswers(record: QuestionRecord): string[] {
  if (record.acceptedAnswers && record.acceptedAnswers.length > 0) return record.acceptedAnswers;
  if (record.correctOptions && record.correctOptions.length > 0) return record.correctOptions;
  if (record.answerText) return [record.answerText];
  return [];
}

/**
 * Central Answer Resolution Pipeline
 * Resolves questions across Stages A, B, C, D, and E with full diagnostics.
 */
export class AnswerResolutionPipeline {
  static async resolveAssignment(
    options: ResolveAssignmentOptions
  ): Promise<AssignmentResolutionResult> {
    const {
      questions,
      selectedCourse,
      answerBank,
      materials = [],
      sharedResources: explicitShared,
      settings,
      tracer = pipelineTracer,
      skipLlm = false,
    } = options;

    let sharedResources = explicitShared || [];
    if (!explicitShared && settings.knowledgeBaseEnabled) {
      try {
        sharedResources = await KnowledgeBaseService.getCourseResources(selectedCourse.id);
      } catch {
        sharedResources = [];
      }
    }

    tracer.startSession(selectedCourse.id, selectedCourse.name);

    // Stage 1-4: Session & Course Context
    tracer.recordGlobalStep(1, 'Active Tab Identified', true, 'Target assignment tab active.');
    tracer.recordGlobalStep(
      2,
      'Current Page and Course Detected',
      true,
      `Detected portal context for course "${selectedCourse.name}".`
    );
    tracer.recordGlobalStep(
      3,
      'Questions Extracted',
      questions.length > 0,
      `Extracted ${questions.length} question containers from page DOM.`,
      { inputCount: questions.length, outputCount: questions.length }
    );
    tracer.recordGlobalStep(
      4,
      'Answer Bank Record Count Obtained',
      true,
      answerBank.length > 0
        ? `Loaded ${answerBank.length} stored records for ${selectedCourse.name}.`
        : 'Answer bank has 0 records. Pipeline will use course materials and configured AI provider.',
      { outputCount: answerBank.length }
    );

    // Build retrieval engine structures
    const graphEngine = new GraphRetrievalEngine(answerBank, materials);
    const resolvedResults: QuestionMatchResult[] = [];

    // Process each question individually
    for (const q of questions) {
      tracer.initQuestionTrace(q.id, q.index, q.questionText);
      const res = await this.resolveSingleQuestion({
        question: q,
        selectedCourse,
        answerBank,
        materials,
        sharedResources,
        settings,
        graphEngine,
        tracer,
        skipLlm,
      });
      resolvedResults.push(res);
    }

    // Summary calculation
    const summary = {
      totalScanned: resolvedResults.length,
      portalConfirmed: resolvedResults.filter((r) => r.resolutionState === 'portal-confirmed').length,
      studentReviewed: resolvedResults.filter((r) => r.resolutionState === 'student-reviewed').length,
      aiSuggested: resolvedResults.filter((r) => r.resolutionState === 'ai-suggested' || r.resolutionState === 'chatgpt-suggested').length,
      ambiguous: resolvedResults.filter((r) => r.resolutionState === 'ambiguous').length,
      unresolved: resolvedResults.filter((r) => r.resolutionState === 'unresolved').length,
      providerErrors: resolvedResults.filter((r) => r.resolutionState === 'provider-error').length,
      eligibleForAutoPopulate: resolvedResults.filter((r) => {
        const isVerifiedExact =
          r.status === 'exact-match' &&
          (r.resolutionState === 'portal-confirmed' || r.resolutionState === 'student-reviewed');
        const isHighConfidenceAi =
          settings.autoApplyHighConfidence &&
          r.resolutionState === 'ai-suggested' &&
          !r.requiresReview &&
          r.proposedAnswers.length > 0;
        return (isVerifiedExact || isHighConfidenceAi) && r.proposedAnswers.length > 0;
      }).length,
    };

    const tracerReport = tracer.generateReport(summary);

    return {
      results: resolvedResults,
      summary,
      tracerReport,
    };
  }

  static async resolveSingleQuestion(opts: {
    question: ScannedQuestion;
    selectedCourse: Course;
    answerBank: QuestionRecord[];
    materials: CourseMaterial[];
    sharedResources?: KnowledgeResource[];
    settings: ExtensionSettings;
    graphEngine?: GraphRetrievalEngine;
    tracer?: PipelineDiagnosticsTracer;
    skipLlm?: boolean;
  }): Promise<QuestionMatchResult> {
    const {
      question: q,
      selectedCourse,
      answerBank,
      materials: _materials,
      sharedResources = [],
      settings,
      graphEngine: customGraphEngine,
      tracer: customTracer,
      skipLlm = false,
    } = opts;

    const tracer = customTracer || pipelineTracer;
    const engine = customGraphEngine || new GraphRetrievalEngine(answerBank, _materials || []);
    const normQ = normalizeQuestionText(q.questionText);

    // ==========================================
    // STAGE A — Historical Evidence
    // ==========================================
    tracer.recordQuestionStep(
      q.id,
      5,
      'Historical Retrieval Attempted',
      true,
      answerBank.length > 0
        ? `Searching ${answerBank.length} course answer-bank records.`
        : 'Answer bank has 0 records. Proceeding directly to similarity check and LLM fallback.',
      { inputCount: answerBank.length }
    );

    if (answerBank.length > 0) {
      // Find exact normalized match strictly isolated to selected course / session
      for (const rec of answerBank) {
        const isSameCourse =
          !rec.courseId ||
          !selectedCourse.id ||
          rec.courseId === selectedCourse.id ||
          (selectedCourse.externalCourseId && rec.externalCourseId === selectedCourse.externalCourseId);
        if (!isSameCourse) {
          continue; // Enforce strict course isolation
        }

        const normRec = normalizeQuestionText(rec.questionText);
        if (normRec === normQ) {
          const accepted = getRecordAcceptedAnswers(rec);
          const conflict = detectCriticalTokenConflict(q.questionText, rec.questionText);

          if (!conflict.hasConflict && accepted.length > 0) {
            // Check if accepted answers map to current visible options
            const matchedOptions = q.options.filter((opt) =>
              accepted.some((ans) => normalizeOptionText(ans) === normalizeOptionText(opt.text))
            );

            if (matchedOptions.length > 0 || q.questionType === 'short-text') {
              const proposed =
                matchedOptions.length > 0 ? matchedOptions.map((o) => o.text) : accepted;

              const isPortalConfirmed = rec.reviewStatus === 'portal-confirmed';
              const state: ResolutionState = isPortalConfirmed
                ? 'portal-confirmed'
                : 'student-reviewed';

              tracer.recordQuestionStep(
                q.id,
                6,
                'Hash-map / Exact Result Returned',
                true,
                `Exact historical match found in answer bank (Record ID: ${rec.id}).`,
                { outputCount: proposed.length }
              );
              tracer.setQuestionFinalState(q.id, state);

              return {
                scannedQuestion: q,
                matchedRecord: rec,
                status: 'exact-match',
                resolutionState: state,
                confidence: 1.0,
                reasons: [
                  isPortalConfirmed
                    ? 'Exact match verified against portal-confirmed answer record.'
                    : 'Exact match verified in stored student-reviewed answer bank.',
                ],
                proposedAnswers: proposed,
                isApproved: true,
                requiresReview: false,
                candidateOptions: q.options.map((o) => o.text),
                basis: 'portal-confirmed',
                evidence: rec.explanation,
                aiExplanation: rec.explanation,
              };
            }
          }
        }
      }
    }

    // ==========================================
    // STAGE B — Similar Historical Records (DP + Graph)
    // ==========================================
    let candidateRecord: QuestionRecord | undefined = undefined;
    let candidateExplanation: string | undefined = undefined;
    let candidateSimScore = 0;
    let isAmbiguous = false;
    let ambiguityReason: string | undefined = undefined;

    if (answerBank.length > 0) {
      const graphRes = engine.retrieveAnswersForQuestion(
        q.questionText,
        q.options.map((o) => o.text),
        selectedCourse.id
      );

      tracer.recordQuestionStep(
        q.id,
        7,
        'DP Similarity Candidates Returned',
        graphRes.matchType === 'dp-sequence-match',
        graphRes.matchType === 'dp-sequence-match'
          ? `DP matched candidate with ${(graphRes.confidence * 100).toFixed(0)}% composite alignment.`
          : 'No high-confidence DP candidate found.',
        { outputCount: graphRes.recommendedAnswers.length }
      );

      tracer.recordQuestionStep(
        q.id,
        8,
        'Knowledge-Graph Candidates Returned',
        graphRes.matchType === 'graph-concept-inferred',
        graphRes.graphPathTraces
          ? `Graph traversed path: ${graphRes.graphPathTraces.join(' -> ')}`
          : 'No multi-hop concept path identified.',
        { outputCount: graphRes.graphPathTraces ? graphRes.graphPathTraces.length : 0 }
      );

      if (graphRes.matchType !== 'none' && graphRes.matchedQuestionId) {
        candidateRecord = answerBank.find((r) => r.id === graphRes.matchedQuestionId);
        if (candidateRecord) {
          candidateSimScore = graphRes.confidence;
          candidateExplanation = graphRes.explanation;

          // Check for numerical or negation conflicts
          const conflict = detectCriticalTokenConflict(q.questionText, candidateRecord.questionText);
          if (conflict.hasConflict) {
            isAmbiguous = true;
            ambiguityReason = conflict.reason;
          }
        }
      }
    } else {
      tracer.recordQuestionStep(
        q.id,
        6,
        'Hash-map Result Returned',
        false,
        'Answer bank empty: 0 hash entries.',
        { ran: false, outputCount: 0 }
      );
      tracer.recordQuestionStep(
        q.id,
        7,
        'DP Similarity Candidates Returned',
        false,
        'Answer bank empty: 0 DP targets.',
        { ran: false, outputCount: 0 }
      );
      tracer.recordQuestionStep(
        q.id,
        8,
        'Knowledge-Graph Candidates Returned',
        false,
        'Answer bank empty: 0 graph nodes.',
        { ran: false, outputCount: 0 }
      );
    }

    // ==========================================
    // STAGE C — Course-Material Retrieval
    // ==========================================
    const excerpts = courseRetrievalService.rankAndCombineEvidence({
      questionText: q.questionText,
      options: q.options.map((o) => o.text),
      courseId: selectedCourse.id,
      localMaterials: _materials,
      sharedResources,
      maxExcerpts: 3,
    });

    const sharedCount = excerpts.filter((e) => e.retrievalSource === 'shared-knowledge-base').length;
    const localCount = excerpts.filter((e) => e.retrievalSource === 'local-course-material').length;

    tracer.recordQuestionStep(
      q.id,
      9,
      'Retrieved Course-Material Excerpts Obtained',
      excerpts.length > 0,
      excerpts.length > 0
        ? `Retrieved ${excerpts.length} relevant excerpt(s) (${sharedCount} from shared KB, ${localCount} local notes).`
        : 'No course material notes matching question concepts found.',
      { outputCount: excerpts.length }
    );

    const evidenceSources = excerpts.length > 0
      ? excerpts.map((e) => ({
          title: e.title || e.materialTitle,
          sourceTitle: e.sourceTitle,
          sourceUrl: e.sourceUrl,
          retrievalSource: e.retrievalSource,
          lectureId: e.lectureId,
          timestamp: e.timestamp,
          license: e.license,
          relevanceScore: e.relevanceScore,
        }))
      : undefined;

    // ==========================================
    // STAGE D — LLM Fallback (Gemini / Grok)
    // ==========================================
    if (skipLlm) {
      tracer.setQuestionFinalState(q.id, isAmbiguous ? 'ambiguous' : 'unresolved');
      return {
        scannedQuestion: q,
        status: isAmbiguous ? 'ambiguous-match' : 'no-match',
        resolutionState: isAmbiguous ? 'ambiguous' : 'unresolved',
        confidence: candidateSimScore,
        reasons: [
          isAmbiguous
            ? `Ambiguity detected: ${ambiguityReason}`
            : candidateExplanation || 'No exact historical match in answer bank (AI generation skipped).',
        ],
        aiExplanation: candidateExplanation,
        proposedAnswers: candidateRecord ? getRecordAcceptedAnswers(candidateRecord) : [],
        isApproved: false,
        requiresReview: true,
        candidateOptions: q.options.map((o) => o.text),
        retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
        evidenceSources,
      };
    }

    // Check AI configuration
    const activeProviderType: LlmProviderType = settings.aiProvider || 'gemini';
    const primaryCreds = getProviderCredentials(activeProviderType, settings);
    const primaryKey = primaryCreds.key;
    const primaryModel = primaryCreds.model;

    if (!settings.aiAssistedReviewEnabled) {
      tracer.recordQuestionStep(
        q.id,
        10,
        'Unresolved Question Passed to LLM Provider',
        false,
        'AI assistance is disabled in Settings.',
        { failureReason: 'aiAssistedReviewEnabled is false' }
      );
      tracer.setQuestionFinalState(q.id, 'unresolved');

      return {
        scannedQuestion: q,
        status: isAmbiguous ? 'ambiguous-match' : 'no-match',
        resolutionState: isAmbiguous ? 'ambiguous' : 'unresolved',
        confidence: candidateSimScore,
        reasons: [
          isAmbiguous
            ? `Ambiguity detected: ${ambiguityReason}`
            : 'No historical match. AI assistance is disabled in Settings (enable it to generate answers).',
        ],
        proposedAnswers: candidateRecord ? getRecordAcceptedAnswers(candidateRecord) : [],
        isApproved: false,
        requiresReview: true,
        candidateOptions: q.options.map((o) => o.text),
        basis: excerpts.length > 0 ? 'course-material' : 'unresolved',
        retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
        evidenceSources,
      };
    }

    if (!primaryKey || primaryKey.trim() === '') {
      const missingName = primaryCreds.name;
      tracer.recordQuestionStep(
        q.id,
        10,
        'Unresolved Question Passed to LLM Provider',
        false,
        `${missingName} API key is missing.`,
        { failureReason: 'Missing API key in settings' }
      );
      tracer.setQuestionFinalState(q.id, 'unresolved');

      return {
        scannedQuestion: q,
        status: 'no-match',
        resolutionState: 'unresolved',
        confidence: 0,
        reasons: [
          `AI provider API key is not configured in Settings. Please configure your ${missingName} API key in Settings to generate answers for new questions.`,
        ],
        proposedAnswers: [],
        isApproved: false,
        requiresReview: true,
        candidateOptions: q.options.map((o) => o.text),
        basis: 'unresolved',
        retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
        evidenceSources,
      };
    }

    // =========================================================================
    // DIRECT API PROVIDERS (GEMINI / GROK / OPENAI) — PAUSED PER USER REQUEST
    // Keeping all provider logic in code, but pausing active browser execution
    // to focus exclusively on Web AI (ChatGPT Web / Claude Web) without quota limits.
    // In test environments (vitest), logic remains fully verified.
    // =========================================================================
    const directApiPaused = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test';
    if (directApiPaused && !settings.enableDirectApiProviders) {
      tracer.recordQuestionStep(
        q.id,
        10,
        'Direct API Provider Paused',
        false,
        'Direct Gemini/Grok/OpenAI API calls are paused. Active pipeline uses Web AI (ChatGPT Web) Bridge.'
      );
      tracer.setQuestionFinalState(q.id, 'unresolved');
      return {
        scannedQuestion: q,
        status: 'no-match',
        resolutionState: 'unresolved',
        confidence: 0,
        reasons: [
          'Direct API generation paused to prevent quota limits. Use the Web AI Bridge (ChatGPT Web) above to generate suggestions.',
        ],
        proposedAnswers: [],
        isApproved: false,
        requiresReview: true,
        candidateOptions: q.options.map((o) => o.text),
        basis: 'unresolved',
        retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
        evidenceSources,
      };
    }

    // Call Primary LLM Provider (Kept in code for reference / testing)
    tracer.recordQuestionStep(
      q.id,
      10,
      'Unresolved Question Passed to LLM Provider',
      true,
      `Dispatching prompt to ${primaryCreds.name} (${primaryModel}) with ${excerpts.length} course excerpts.`
    );

    let providerInstance = getLlmProvider(activeProviderType);
    let chosenProviderName = activeProviderType;
    let chosenModel = primaryModel;
    let effectiveKey = primaryKey;

    let aiRes;
    const startMs = Date.now();

    try {
      aiRes = await providerInstance.recommendAnswer(
        {
          questionId: q.id,
          courseTitle: selectedCourse.name,
          questionText: q.questionText,
          options: q.options.map((o) => o.text),
          questionType: q.questionType,
          retrievedExcerpts: excerpts,
          historicalExample: candidateRecord
            ? {
                questionText: candidateRecord.questionText,
                acceptedAnswers: getRecordAcceptedAnswers(candidateRecord),
                explanation: candidateRecord.explanation,
              }
            : undefined,
        },
        effectiveKey,
        chosenModel
      );
    } catch (err) {
      aiRes = {
        provider: chosenProviderName,
        model: chosenModel,
        recommendations: [],
        error: (err as Error).message || 'Unexpected network error during LLM invocation.',
      };
    }

    const durationMs = Date.now() - startMs;

    // Check for retryable fallback to secondary provider if configured
    let didFallback = false;
    let fallbackError: string | undefined;
    let attemptedFallbackName: string | undefined;
    const fallbackAllowed = settings.enableProviderFallback !== false;

    if (aiRes.error && isRetryableProviderError(aiRes.error)) {
      if (!fallbackAllowed) {
        tracer.recordQuestionStep(
          q.id,
          10,
          'Fallback Provider Skipped',
          false,
          `Primary provider (${chosenProviderName}) failed with retryable error "${aiRes.error}", but Secondary Provider Fallback is disabled in Settings.`,
          { failureReason: 'Fallback disabled by user' }
        );
      } else {
        const candidateTypes: LlmProviderType[] = (['gemini', 'grok', 'openai'] as LlmProviderType[])
          .filter((t) => t !== activeProviderType);

        const availableFallback = candidateTypes.find((t) => {
          const creds = getProviderCredentials(t, settings);
          return creds.key && creds.key.trim() !== '';
        });

        if (availableFallback) {
          const secondaryCreds = getProviderCredentials(availableFallback, settings);
          const secondaryType = availableFallback;
          const secondaryKey = secondaryCreds.key;
          const secondaryModel = secondaryCreds.model;
          attemptedFallbackName = secondaryCreds.name;

          tracer.recordQuestionStep(
            q.id,
            10,
            'Attempting Secondary Provider Fallback',
            true,
            `Primary provider encountered error (${aiRes.error}). Automatically attempting secondary fallback: ${secondaryCreds.name} (${secondaryModel}).`
          );

          try {
            const fallbackInstance = getLlmProvider(secondaryType);
            const fallbackRes = await fallbackInstance.recommendAnswer(
              {
                questionId: q.id,
                courseTitle: selectedCourse.name,
                questionText: q.questionText,
                options: q.options.map((o) => o.text),
                questionType: q.questionType,
                retrievedExcerpts: excerpts,
              },
              secondaryKey,
              secondaryModel
            );

            if (!fallbackRes.error && fallbackRes.recommendations.length > 0) {
              aiRes = fallbackRes;
              chosenProviderName = secondaryType;
              chosenModel = secondaryModel;
              didFallback = true;
            } else if (fallbackRes.error) {
              fallbackError = fallbackRes.error;
            }
          } catch (fbErr) {
            fallbackError = (fbErr as Error).message;
          }
        } else {
          tracer.recordQuestionStep(
            q.id,
            10,
            'Fallback Provider Skipped',
            false,
            `Primary provider failed (${aiRes.error}), but no alternate fallback provider has an API key configured.`,
            { failureReason: 'Secondary API key not configured' }
          );
        }
      }
    }

    // Step 11: API Response Received
    tracer.recordQuestionStep(
      q.id,
      11,
      'API Response Received',
      !aiRes.error,
      aiRes.error
        ? `API error from ${chosenProviderName}: ${aiRes.error}`
        : `Received structured completion from ${chosenProviderName} (${chosenModel}) in ${durationMs}ms.`,
      { durationMs, failureReason: aiRes.error }
    );

    if (aiRes.error || !aiRes.recommendations || aiRes.recommendations.length === 0) {
      tracer.setQuestionFinalState(q.id, 'provider-error', chosenProviderName, chosenModel);
      const combinedError = fallbackError
        ? `Primary provider (${chosenProviderName}) failed: ${aiRes.error || 'Empty response'}. Fallback (${attemptedFallbackName || 'secondary'}) also failed: ${fallbackError}`
        : aiRes.error || 'Provider returned empty recommendation.';

      return {
        scannedQuestion: q,
        status: 'no-match',
        resolutionState: 'provider-error',
        confidence: 0,
        reasons: [`AI Generation Failed: ${combinedError}`],
        proposedAnswers: [],
        isApproved: false,
        requiresReview: true,
        candidateOptions: q.options.map((o) => o.text),
        basis: 'unresolved',
        providerUsed: chosenProviderName,
        modelUsed: chosenModel,
        providerError: combinedError,
        retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
        evidenceSources,
      };
    }

    const rec = aiRes.recommendations[0];

    // Step 12: Response Parsed and Validated
    tracer.recordQuestionStep(
      q.id,
      12,
      'Response Parsed and Validated',
      rec.recommendedAnswers.length > 0,
      `Extracted ${rec.recommendedAnswers.length} proposed answer(s). Explanation: "${rec.explanation.slice(0, 60)}..."`,
      { outputCount: rec.recommendedAnswers.length }
    );

    // Step 13: Recommended Answer Mapped to Visible Options
    const validatedAnswers: string[] = [];
    if (q.options.length > 0) {
      for (const ans of rec.recommendedAnswers) {
        const matchingOpt = q.options.find(
          (opt) => normalizeOptionText(opt.text) === normalizeOptionText(ans)
        );
        if (matchingOpt) {
          validatedAnswers.push(matchingOpt.text);
        }
      }
    } else {
      validatedAnswers.push(...rec.recommendedAnswers);
    }

    tracer.recordQuestionStep(
      q.id,
      13,
      'Recommended Answer Mapped to Visible Option',
      validatedAnswers.length > 0,
      validatedAnswers.length > 0
        ? `Mapped answers to visible options: [${validatedAnswers.join(', ')}]`
        : 'Proposed answers failed to map to any visible option on page.',
      {
        inputCount: rec.recommendedAnswers.length,
        outputCount: validatedAnswers.length,
        failureReason:
          validatedAnswers.length === 0
            ? 'Model proposed options that do not exist on the page.'
            : undefined,
      }
    );

    // Step 14: Review State Updated
    const needsReview = rec.needsReview || validatedAnswers.length === 0 || isAmbiguous;
    const finalState: ResolutionState = validatedAnswers.length > 0 ? 'ai-suggested' : 'unresolved';
    tracer.recordQuestionStep(
      q.id,
      14,
      'Review State Updated',
      true,
      `Assigned state "${finalState}" (needsReview: ${needsReview}).`
    );
    tracer.setQuestionFinalState(q.id, finalState, chosenProviderName, chosenModel);

    const reasons: string[] = [];
    if (didFallback) {
      reasons.push(`Automatic fallback to ${chosenProviderName} activated after retryable primary provider error.`);
    }

    const providerDisplayName =
      chosenProviderName === 'grok' ? 'xAI Grok' : chosenProviderName === 'openai' ? 'OpenAI' : 'Google Gemini';

    if (rec.uncertaintyReasons && rec.uncertaintyReasons.length > 0) {
      reasons.push(...rec.uncertaintyReasons);
    } else if (validatedAnswers.length > 0) {
      reasons.push(`${providerDisplayName} recommendation ready for student approval.`);
    } else {
      reasons.push('Model proposed option did not match any visible option on this page (hallucinated choice rejected).');
    }

    if (excerpts.length === 0) {
      reasons.push('Answer inferred via general domain knowledge (no course notes found).');
    }

    const calcConfidence =
      validatedAnswers.length > 0
        ? typeof rec.confidence === 'number' && !isNaN(rec.confidence)
          ? rec.confidence
          : needsReview
          ? 0.75
          : 0.95
        : 0;

    return {
      scannedQuestion: q,
      status: validatedAnswers.length > 0 ? 'probable-match' : 'no-match',
      resolutionState: finalState,
      confidence: calcConfidence,
      reasons,
      proposedAnswers: validatedAnswers,
      isApproved: !needsReview,
      requiresReview: needsReview,
      candidateOptions: q.options.map((o) => o.text),
      basis: rec.basis || (excerpts.length > 0 ? 'course-material' : 'ai-reasoning'),
      evidence: rec.evidence || (excerpts.length > 0 ? excerpts[0].excerpt : undefined),
      aiExplanation: rec.explanation,
      providerUsed: chosenProviderName,
      modelUsed: chosenModel,
      retrievedEvidence: excerpts.length > 0 ? excerpts : undefined,
      evidenceSources,
    };
  }
}
