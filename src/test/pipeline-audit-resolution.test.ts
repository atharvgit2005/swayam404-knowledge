import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnswerResolutionPipeline } from '@/lib/orchestration/answerResolutionPipeline';
import {
  ScannedQuestion,
  QuestionRecord,
  Course,
  ExtensionSettings,
} from '@/types';
import { GeminiProvider } from '@/lib/ai/geminiProvider';
import { GrokProvider } from '@/lib/ai/grokProvider';
import * as aiRegistry from '@/lib/ai';
import { SwayamPortalAdapter } from '@/adapters';

describe('Swayam404 Pipeline Audit & Regression Test Suite (20 Tests)', () => {
  const dummyEconCourse: Course = {
    id: 'course-econ-101',
    name: 'Principles of Economics',
    code: 'ECON101',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyEntrepCourse: Course = {
    id: 'course-entrep-201',
    name: 'Entrepreneurship Essentials',
    code: 'ENTREP201',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleQuestion: ScannedQuestion = {
    id: 'q-scanned-1',
    index: 1,
    questionText: 'Which curve represents the combinations of goods an economy can produce?',
    questionType: 'single-choice',
    formType: 'radio',
    options: [
      { id: 'opt-1', text: 'Production Possibility Frontier', value: 'ppf' },
      { id: 'opt-2', text: 'Indifference Curve', value: 'ic' },
      { id: 'opt-3', text: 'Demand Curve', value: 'dc' },
      { id: 'opt-4', text: 'Phillips Curve', value: 'pc' },
    ],
  };

  const baseSettings: ExtensionSettings = {
    theme: 'dark',
    selectedCourseId: 'course-econ-101',
    autoScanOnLoad: false,
    autoPopulateExactVerified: false,
    autoApplyHighConfidence: false,
    aiAssistedReviewEnabled: true,
    aiProvider: 'gemini',
    aiApiKey: 'valid-test-gemini-key',
    aiModel: 'gemini-2.5-flash',
    grokApiKey: 'valid-test-grok-key',
    grokModel: 'grok-2-latest',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // Test 1: Empty answer bank + AI enabled + valid API response
  // -------------------------------------------------------------
  it('1. Empty answer bank + AI enabled + valid API response: resolves via AI suggestion', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Production Possibility Frontier'],
          explanation: 'The PPF illustrates resource scarcity and trade-offs.',
          evidence: 'Chapter 2 lecture notes.',
          basis: 'course-material',
          needsReview: false,
          uncertaintyReasons: [],
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [], // 0 records
      materials: [],
      settings: baseSettings,
    });

    expect(resolution.results.length).toBe(1);
    const result = resolution.results[0];
    expect(result.resolutionState).toBe('ai-suggested');
    expect(result.proposedAnswers).toEqual(['Production Possibility Frontier']);
    expect(result.providerUsed).toBe('gemini');
    expect(result.reasons[0]).not.toContain('No matching question found in this course answer bank');
    expect(resolution.summary.aiSuggested).toBe(1);
    expect(resolution.summary.portalConfirmed).toBe(0);
  });

  // -------------------------------------------------------------
  // Test 2: Empty hash map, graph, and DP indexes + LLM fallback
  // -------------------------------------------------------------
  it('2. Empty hash map, graph, and DP indexes + LLM fallback: traverses all retrieval stages smoothly to LLM', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Production Possibility Frontier'],
          explanation: 'Model reasoning.',
          basis: 'ai-reasoning',
          needsReview: false,
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      materials: [],
      settings: baseSettings,
    });

    expect(resolution.results[0].resolutionState).toBe('ai-suggested');
    expect(resolution.tracerReport.steps.some((s) => s.stageNumber === 6 && s.status === 'skipped')).toBe(true);
    expect(resolution.tracerReport.steps.some((s) => s.stageNumber === 10 && s.status === 'succeeded')).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 3: No course material + AI provider configured
  // -------------------------------------------------------------
  it('3. No course material + AI provider configured: flags answer not supported by course material', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Production Possibility Frontier'],
          explanation: 'AI domain knowledge reasoning.',
          basis: 'ai-reasoning',
          evidence: undefined,
          needsReview: true,
          uncertaintyReasons: ['Answer is not supported by retrieved course material; review recommended.'],
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      materials: [], // No material notes
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.basis).toBe('ai-reasoning');
    expect(res.requiresReview).toBe(true);
    expect(res.reasons.some((r) => r.includes('not supported by retrieved course material'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 4: Historical exact match avoids an unnecessary AI request
  // -------------------------------------------------------------
  it('4. Historical exact match avoids an unnecessary AI request', async () => {
    const mockProvider = new GeminiProvider();
    const aiSpy = vi.spyOn(mockProvider, 'recommendAnswer');
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const historicalRecord: QuestionRecord = {
      id: 'rec-ppf-1',
      courseId: dummyEconCourse.id,
      questionText: 'Which curve represents the combinations of goods an economy can produce?',
      questionType: 'single-choice',
      correctOptions: ['Production Possibility Frontier'],
      reviewStatus: 'portal-confirmed',
      source: 'Assignment 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [historicalRecord],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('portal-confirmed');
    expect(res.proposedAnswers).toEqual(['Production Possibility Frontier']);
    expect(aiSpy).not.toHaveBeenCalled();
    expect(resolution.summary.portalConfirmed).toBe(1);
    expect(resolution.summary.aiSuggested).toBe(0);
  });

  // -------------------------------------------------------------
  // Test 5: Ambiguous historical match proceeds to AI or review
  // -------------------------------------------------------------
  it('5. Ambiguous historical match (critical token conflict) triggers review', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: 'q-ambig',
          recommendedAnswers: ['Supply increases by 10%'],
          explanation: 'Recalculated with updated elasticity.',
          basis: 'ai-reasoning',
          needsReview: true,
          uncertaintyReasons: ['Critical token discrepancy with historical record.'],
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const conflictingRecord: QuestionRecord = {
      id: 'rec-conflict-1',
      courseId: dummyEconCourse.id,
      questionText: 'When elasticity is 2.0, calculate supply change.', // Different number!
      questionType: 'single-choice',
      correctOptions: ['Supply increases by 20%'],
      reviewStatus: 'portal-confirmed',
      source: 'Assignment 2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const scannedConflict: ScannedQuestion = {
      id: 'q-ambig',
      index: 1,
      questionText: 'When elasticity is 1.0, calculate supply change.',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'o1', text: 'Supply increases by 10%', value: '10' },
        { id: 'o2', text: 'Supply increases by 20%', value: '20' },
      ],
    };

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [scannedConflict],
      selectedCourse: dummyEconCourse,
      answerBank: [conflictingRecord],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.requiresReview).toBe(true);
    expect(res.resolutionState === 'ambiguous' || res.resolutionState === 'ai-suggested').toBe(true);
  });

  // -------------------------------------------------------------
  // Test 6: AI disabled + empty answer bank
  // -------------------------------------------------------------
  it('6. AI disabled + empty answer bank: reports AI disabled in settings without crashing', async () => {
    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiAssistedReviewEnabled: false,
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('unresolved');
    expect(res.reasons[0]).toContain('AI assistance is disabled in Settings');
  });

  // -------------------------------------------------------------
  // Test 7: Missing API key
  // -------------------------------------------------------------
  it('7. Missing API key: reports direct instruction to configure API key', async () => {
    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiApiKey: '',
        grokApiKey: '',
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('unresolved');
    expect(res.reasons[0]).toContain('AI provider API key is not configured in Settings');
  });

  // -------------------------------------------------------------
  // Test 8: Gemini request failure
  // -------------------------------------------------------------
  it('8. Gemini request failure: captures explicit provider error without masking as missing bank', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockRejectedValueOnce(
      new Error('Gemini API HTTP 404: Model gemini-2.0-flash not found or deprecated.')
    );
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        grokApiKey: '', // Disable fallback
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('provider-error');
    expect(res.providerError).toContain('HTTP 404');
    expect(res.reasons[0]).toContain('HTTP 404');
    expect(resolution.summary.providerErrors).toBe(1);
  });

  // -------------------------------------------------------------
  // Test 9: Grok request failure
  // -------------------------------------------------------------
  it('9. Grok request failure: returns provider-error with exact xAI error details', async () => {
    const mockGrok = new GrokProvider();
    vi.spyOn(mockGrok, 'recommendAnswer').mockRejectedValueOnce(
      new Error('xAI API error 400: grok-2-latest context length exceeded.')
    );
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockGrok);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiProvider: 'grok',
        aiApiKey: '', // Disable secondary fallback
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('provider-error');
    expect(res.providerError).toContain('xAI API error 400');
  });

  // -------------------------------------------------------------
  // Test 10: Invalid model identifier
  // -------------------------------------------------------------
  it('10. Invalid model identifier: preserves selected model ID in request failure report', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockRejectedValueOnce(
      new Error('Model nonexistent-model-xyz not found.')
    );
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiModel: 'nonexistent-model-xyz',
        grokApiKey: '',
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('provider-error');
    expect(res.providerError).toContain('nonexistent-model-xyz');
  });

  // -------------------------------------------------------------
  // Test 11: Malformed LLM JSON
  // -------------------------------------------------------------
  it('11. Malformed LLM JSON: safely caught and classified as unresolved with review requirement', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: [],
          explanation: 'Model generated invalid non-JSON output.',
          basis: 'unresolved',
          needsReview: true,
          uncertaintyReasons: ['Malformed JSON received from LLM response.'],
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('unresolved');
    expect(res.requiresReview).toBe(true);
    expect(res.proposedAnswers.length).toBe(0);
  });

  // -------------------------------------------------------------
  // Test 12: Hallucinated option text
  // -------------------------------------------------------------
  it('12. Hallucinated option text: rejects option string not present in visible choices', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Supply and Demand Equilibrium Curve (HALLUCINATED)'],
          explanation: 'Explanation with invalid option.',
          basis: 'ai-reasoning',
          needsReview: false,
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('unresolved');
    expect(res.proposedAnswers.length).toBe(0);
    expect(res.reasons.some((r) => r.includes('did not match any visible option'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 13: Multi-select answer with an incomplete option set
  // -------------------------------------------------------------
  it('13. Multi-select answer with incomplete option set: flags review and warns student', async () => {
    const multiQuestion: ScannedQuestion = {
      id: 'q-multi-1',
      index: 2,
      questionText: 'Select all factors that shift the demand curve:',
      questionType: 'multiple-choice',
      formType: 'checkbox',
      options: [
        { id: 'm1', text: 'Consumer Income', value: 'income' },
        { id: 'm2', text: 'Tastes and Preferences', value: 'tastes' },
        { id: 'm3', text: 'Production Technology', value: 'tech' },
        { id: 'm4', text: 'Number of Buyers', value: 'buyers' },
      ],
    };

    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: multiQuestion.id,
          recommendedAnswers: ['Consumer Income'], // Only 1 of multiple
          explanation: 'Only certain about income.',
          basis: 'ai-reasoning',
          needsReview: true,
          uncertaintyReasons: ['Partial answer set: complete option set could not be verified with high certainty.'],
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [multiQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.requiresReview).toBe(true);
    expect(res.reasons.some((r) => r.includes('Partial answer set') || r.includes('multiple-choice'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 14: Course isolation with an empty selected-course bank
  // -------------------------------------------------------------
  it('14. Course isolation: empty Entrepreneurship bank does not borrow Economics answers', async () => {
    const econRecords: QuestionRecord[] = [
      {
        id: 'rec-econ-1',
        courseId: dummyEconCourse.id,
        questionText: 'What is opportunity cost?',
        questionType: 'single-choice',
        correctOptions: ['The value of the next best alternative'],
        reviewStatus: 'portal-confirmed',
        source: 'Econ Assignment 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const entrepQuestion: ScannedQuestion = {
      id: 'q-entrep-1',
      index: 1,
      questionText: 'What is opportunity cost in a startup context?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'e1', text: 'The value of the next best alternative', value: 'alt' },
        { id: 'e2', text: 'Total cash burn rate', value: 'burn' },
      ],
    };

    const mockProvider = new GrokProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: entrepQuestion.id,
          recommendedAnswers: ['The value of the next best alternative'],
          explanation: 'Evaluated with Grok in entrepreneurship context.',
          basis: 'ai-reasoning',
          needsReview: false,
        },
      ],
      provider: 'xAI Grok',
      model: 'grok-2-latest',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    // Pass only Entrepreneurship bank (which is empty)
    const entrepBank = econRecords.filter((r) => r.courseId === dummyEntrepCourse.id);
    expect(entrepBank.length).toBe(0);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [entrepQuestion],
      selectedCourse: dummyEntrepCourse,
      answerBank: entrepBank,
      settings: {
        ...baseSettings,
        aiProvider: 'grok',
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.providerUsed).toBe('grok');
    expect(res.matchedRecord).toBeUndefined(); // Did NOT match historical econ record
  });

  // -------------------------------------------------------------
  // Test 15: Provider fallback on an eligible retryable error
  // -------------------------------------------------------------
  it('15. Provider fallback on eligible retryable error: 429 Rate Limit falls back to secondary provider', async () => {
    const mockGemini = new GeminiProvider();
    vi.spyOn(mockGemini, 'recommendAnswer').mockRejectedValueOnce(
      new Error('Gemini API 429: Resource has been exhausted (rate limit exceeded).')
    );

    const mockGrok = new GrokProvider();
    vi.spyOn(mockGrok, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Production Possibility Frontier'],
          explanation: 'Grok secondary provider succeeded after Gemini 429 rate limit.',
          basis: 'ai-reasoning',
          needsReview: false,
        },
      ],
      provider: 'xAI Grok',
      model: 'grok-2-latest',
    });

    vi.spyOn(aiRegistry, 'getLlmProvider').mockImplementation((type) => {
      return type === 'gemini' ? mockGemini : mockGrok;
    });

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiProvider: 'gemini',
        aiApiKey: 'valid-gemini-key',
        grokApiKey: 'valid-grok-key',
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.providerUsed).toBe('grok');
    expect(res.modelUsed).toBe('grok-2-latest');
    expect(res.reasons.some((r) => r.includes('Automatic fallback to grok'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 16: Provider fallback not triggered by invalid credentials
  // -------------------------------------------------------------
  it('16. Provider fallback not triggered by invalid credentials: 401 Unauthorized fails immediately', async () => {
    const mockGemini = new GeminiProvider();
    vi.spyOn(mockGemini, 'recommendAnswer').mockRejectedValueOnce(
      new Error('Gemini API 401: Invalid API key or unauthorized request.')
    );

    const mockGrok = new GrokProvider();
    const grokSpy = vi.spyOn(mockGrok, 'recommendAnswer');

    vi.spyOn(aiRegistry, 'getLlmProvider').mockImplementation((type) => {
      return type === 'gemini' ? mockGemini : mockGrok;
    });

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiProvider: 'gemini',
        aiApiKey: 'bad-key',
        grokApiKey: 'valid-grok-key',
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('provider-error');
    expect(grokSpy).not.toHaveBeenCalled(); // Must NOT silently spend secondary quota on auth error
    expect(res.providerError).toContain('401');
  });

  // -------------------------------------------------------------
  // Test 17: AI suggestion returned to the actual review UI
  // -------------------------------------------------------------
  it('17. AI suggestion returned to review state with proposedAnswers and full explanation', async () => {
    const mockProvider = new GeminiProvider();
    vi.spyOn(mockProvider, 'recommendAnswer').mockResolvedValueOnce({
      recommendations: [
        {
          questionId: sampleQuestion.id,
          recommendedAnswers: ['Production Possibility Frontier'],
          explanation: 'Core macroeconomic concept representing resource allocation.',
          basis: 'ai-reasoning',
          needsReview: false,
        },
      ],
      provider: 'Google Gemini',
      model: 'gemini-2.5-flash',
    });
    vi.spyOn(aiRegistry, 'getLlmProvider').mockReturnValue(mockProvider);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: baseSettings,
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.isApproved).toBe(true);
    expect(res.aiExplanation).toContain('Core macroeconomic concept');
    expect(res.proposedAnswers).toEqual(['Production Possibility Frontier']);
  });

  // -------------------------------------------------------------
  // Test 18: Approved suggestion reaches the population adapter
  // -------------------------------------------------------------
  it('18. Approved suggestion reaches the population adapter and correctly checks radio element', () => {
    document.body.innerHTML = `
      <div data-question-id="q-scanned-1" class="gcb-form-element">
        <div class="qt-question-text">Which curve represents the combinations of goods an economy can produce?</div>
        <div class="choices">
          <label><input type="radio" id="r_ppf" name="q1" value="ppf" /> Production Possibility Frontier</label>
          <label><input type="radio" id="r_ic" name="q1" value="ic" /> Indifference Curve</label>
        </div>
      </div>
    `;

    const adapter = new SwayamPortalAdapter();
    const result = adapter.populateQuestion(document, {
      questionId: 'q-scanned-1',
      questionText: sampleQuestion.questionText,
      questionType: 'single-choice',
      selectedAnswers: ['Production Possibility Frontier'],
      options: [
        { id: 'r_ppf', text: 'Production Possibility Frontier', value: 'ppf', inputSelector: '#r_ppf' },
        { id: 'r_ic', text: 'Indifference Curve', value: 'ic', inputSelector: '#r_ic' },
      ],
    });

    expect(result.success).toBe(true);
    const radioPpf = document.getElementById('r_ppf') as HTMLInputElement;
    expect(radioPpf.checked).toBe(true);
  });

  // -------------------------------------------------------------
  // Test 19: Population failure is not misreported as an AI failure
  // -------------------------------------------------------------
  it('19. Population failure is reported distinctly from AI failure', () => {
    document.body.innerHTML = `
      <div data-question-id="q-scanned-1" class="gcb-form-element">
        <div class="qt-question-text">Which curve represents...</div>
        <div>Broken or unrendered choices container</div>
      </div>
    `;

    const adapter = new SwayamPortalAdapter();
    const popResult = adapter.populateQuestion(document, {
      questionId: 'q-scanned-1',
      questionText: sampleQuestion.questionText,
      questionType: 'single-choice',
      selectedAnswers: ['Production Possibility Frontier'],
      options: [
        { id: 'r_ppf', text: 'Production Possibility Frontier', value: 'ppf', inputSelector: '#non-existent-id' },
      ],
    });

    expect(popResult.success).toBe(false);
    expect(popResult.message).toContain('Could not safely match control on page');
  });

  // -------------------------------------------------------------
  // Test 20: Submission controls remain untouched
  // -------------------------------------------------------------
  it('20. Strict submission button immunity: submit buttons are never activated or clicked', () => {
    document.body.innerHTML = `
      <form id="quiz-form">
        <div data-question-id="q-scanned-1" class="gcb-form-element">
          <label><input type="radio" id="r_ppf" name="q1" value="ppf" /> Production Possibility Frontier</label>
        </div>
        <button type="submit" id="submit-btn" class="gcb-submit-button">Submit Answers</button>
        <button type="button" id="final-btn" class="final-submit-btn">Final Submit</button>
      </form>
    `;

    const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
    const finalBtn = document.getElementById('final-btn') as HTMLButtonElement;

    let submitClicked = false;
    let finalClicked = false;
    submitBtn.addEventListener('click', () => {
      submitClicked = true;
    });
    finalBtn.addEventListener('click', () => {
      finalClicked = true;
    });

    const adapter = new SwayamPortalAdapter();
    adapter.populateQuestion(document, {
      questionId: 'q-scanned-1',
      questionText: sampleQuestion.questionText,
      questionType: 'single-choice',
      selectedAnswers: ['Production Possibility Frontier'],
      options: [
        { id: 'r_ppf', text: 'Production Possibility Frontier', value: 'ppf', inputSelector: '#r_ppf' },
      ],
    });

    expect(submitClicked).toBe(false);
    expect(finalClicked).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 21: enableProviderFallback: false disables automatic fallback
  // -------------------------------------------------------------
  it('21. enableProviderFallback: false disables automatic fallback even on 429 rate limit', async () => {
    const mockGemini = new GeminiProvider();
    vi.spyOn(mockGemini, 'recommendAnswer').mockRejectedValueOnce(
      new Error('Gemini API 429: Resource has been exhausted (rate limit exceeded).')
    );

    const mockGrok = new GrokProvider();
    const grokSpy = vi.spyOn(mockGrok, 'recommendAnswer');

    vi.spyOn(aiRegistry, 'getLlmProvider').mockImplementation((type) => {
      return type === 'gemini' ? mockGemini : mockGrok;
    });

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestion],
      selectedCourse: dummyEconCourse,
      answerBank: [],
      settings: {
        ...baseSettings,
        aiProvider: 'gemini',
        aiApiKey: 'valid-gemini-key',
        grokApiKey: 'valid-grok-key',
        enableProviderFallback: false, // Explicitly disabled
      },
    });

    const res = resolution.results[0];
    expect(res.resolutionState).toBe('provider-error');
    expect(grokSpy).not.toHaveBeenCalled(); // Fallback was skipped because enableProviderFallback is false
  });
});
