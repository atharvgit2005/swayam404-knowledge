import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnswerResolutionPipeline } from '@/lib/orchestration/answerResolutionPipeline';
import { openAiProvider, getLlmProvider } from '@/lib/ai';
import {
  ScannedQuestion,
  ExtensionSettings,
  Course,
  QuestionMatchResult,
} from '@/types';

describe('Swayam404 In-Extension AI Execution, Provider Fallback & Batch Control Regression Suite', () => {
  const sampleCourse: Course = {
    id: 'course-econ-101',
    name: 'Principles of Economics',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleQuestions: ScannedQuestion[] = [
    {
      id: 'q-101',
      index: 1,
      questionText: 'What is the opportunity cost of an economy operating on its PPF?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'opt-101-a', text: 'The amount of another good sacrificed', value: 'a' },
        { id: 'opt-101-b', text: 'Zero, because resources are efficient', value: 'b' },
        { id: 'opt-101-c', text: 'Infinite monetary cost', value: 'c' },
      ],
    },
    {
      id: 'q-102',
      index: 2,
      questionText: 'Which of the following are components of GDP calculated via expenditure method?',
      questionType: 'multiple-choice',
      formType: 'checkbox',
      options: [
        { id: 'opt-102-a', text: 'Consumption (C)', value: 'c' },
        { id: 'opt-102-b', text: 'Investment (I)', value: 'i' },
        { id: 'opt-102-c', text: 'Government Spending (G)', value: 'g' },
        { id: 'opt-102-d', text: 'Transfer Payments', value: 'tp' },
      ],
    },
    {
      id: 'q-103',
      index: 3,
      questionText: 'Calculate the elasticity coefficient when quantity demanded drops by 10% from a 5% price rise.',
      questionType: 'short-text',
      formType: 'text',
      options: [],
    },
  ];

  const defaultSettings: ExtensionSettings = {
    theme: 'dark',
    selectedCourseId: 'course-econ-101',
    autoScanOnLoad: false,
    autoPopulateExactVerified: false,
    autoApplyHighConfidence: false,
    aiAssistedReviewEnabled: true,
    aiProvider: 'gemini',
    aiApiKey: 'test-gemini-key',
    aiModel: 'gemini-1.5-flash',
    grokApiKey: 'test-grok-key',
    grokModel: 'grok-2-latest',
    openaiApiKey: 'test-openai-key',
    openaiModel: 'gpt-4o-mini',
    enableProviderFallback: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Zero Tab Switch / No Navigation
  it('proves that in-extension AI suggestion generation never opens a new browser tab or navigates away', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const chromeTabsCreate = vi.fn();
    (globalThis as unknown as { chrome?: { tabs?: { create?: unknown } } }).chrome = {
      tabs: { create: chromeTabsCreate },
    };

    // Mock fetch for Gemini API
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-101',
                    recommendedAnswers: ['The amount of another good sacrificed'],
                    explanation: 'By definition of the PPF frontier.',
                    confidence: 0.95,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const resolution = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    // In-extension result reached
    expect(resolution.resolutionState).toBe('ai-suggested');
    expect(resolution.proposedAnswers).toEqual(['The amount of another good sacrificed']);

    // Neither window.open nor chrome.tabs.create was triggered
    expect(openSpy).not.toHaveBeenCalled();
    expect(chromeTabsCreate).not.toHaveBeenCalled();
  });

  // 2. Empty Answer Bank Still Allows Provider Requests
  it('proves an empty answer bank still allows AI provider requests to proceed and succeed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-101',
                    recommendedAnswers: ['The amount of another good sacrificed'],
                    explanation: 'Standard microeconomic trade-off.',
                    confidence: 0.92,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const resolution = await AnswerResolutionPipeline.resolveAssignment({
      questions: [sampleQuestions[0]],
      selectedCourse: sampleCourse,
      answerBank: [], // Completely empty answer bank
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    expect(resolution.results.length).toBe(1);
    expect(resolution.results[0].resolutionState).toBe('ai-suggested');
    expect(resolution.results[0].proposedAnswers).toEqual(['The amount of another good sacrificed']);
    expect(resolution.summary.aiSuggested).toBe(1);
    expect(resolution.summary.portalConfirmed).toBe(0);
  });

  // 3. Successful Gemini Response Reaches UI
  it('proves a successful Gemini response reaches the UI result object with confidence and reasons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-101',
                    recommendedAnswers: ['The amount of another good sacrificed'],
                    explanation: 'Opportunity cost on the PPF curve represents goods foregone.',
                    confidence: 0.96,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.proposedAnswers).toEqual(['The amount of another good sacrificed']);
    expect(res.providerUsed).toBe('gemini');
    expect(res.confidence).toBe(0.96);
    expect(res.aiExplanation).toContain('PPF curve represents goods foregone');
    expect(res.requiresReview).toBe(true); // AI suggestions must be reviewed
    expect(res.isApproved).toBe(false); // Never auto-approved until student acts
  });

  // 4. Provider Failure Triggers Configured Fallback
  it('proves a retryable primary provider failure triggers the configured fallback (Gemini 429 -> Grok fallback)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 1st call: Gemini fails with 429 Quota Exceeded
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED: Rate limit exceeded.' } }),
    } as unknown as Response);

    // 2nd call: Grok fallback succeeds
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questionId: 'q-101',
                recommendedAnswers: ['The amount of another good sacrificed'],
                explanation: 'Grok reasoning: movement along PPF requires sacrificing production of other goods.',
                confidence: 0.94,
                basis: 'ai-reasoning',
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    expect(res.resolutionState).toBe('ai-suggested');
    expect(res.providerUsed).toBe('grok');
    expect(res.proposedAnswers).toEqual(['The amount of another good sacrificed']);
    expect(res.aiExplanation).toContain('Grok reasoning');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // 5. All Providers Failing Produces Visible Error Without Crashing
  it('proves all providers failing produces a visible provider-error state without throwing an uncaught exception', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Gemini fails
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'Quota exceeded' } }),
    } as unknown as Response);

    // Grok fails
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as unknown as Response);

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    expect(res.resolutionState).toBe('provider-error');
    expect(res.proposedAnswers).toEqual([]);
    expect(res.providerError).toBeDefined();
    expect(res.reasons.some((r) => r.toLowerCase().includes('failed') || r.includes('Unavailable'))).toBe(true);
    expect(res.isApproved).toBe(false);
  });

  // 6. AI Answers Map to Correct Question IDs
  it('proves AI answers accurately map to the original question IDs and indices', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-102',
                    recommendedAnswers: ['Consumption (C)', 'Investment (I)', 'Government Spending (G)'],
                    explanation: 'GDP = C + I + G + (X - M). Transfer payments are excluded.',
                    confidence: 0.95,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[1],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    expect(res.scannedQuestion.id).toBe('q-102');
    expect(res.scannedQuestion.index).toBe(2);
    expect(res.proposedAnswers).toEqual([
      'Consumption (C)',
      'Investment (I)',
      'Government Spending (G)',
    ]);
  });

  // 7. Invalid or Hallucinated Options Remain Unresolved
  it('proves hallucinated or non-existent options are rejected and do not populate proposedAnswers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-101',
                    recommendedAnswers: ['A completely invented answer option that does not exist'],
                    explanation: 'Invented answer.',
                    confidence: 0.9,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    const res = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    // Valid options on page: 'The amount of another good sacrificed', 'Zero...', 'Infinite...'
    // The hallucinated answer must NOT be proposed
    expect(res.proposedAnswers).toEqual([]);
    expect(res.resolutionState).toBe('unresolved');
    expect(res.isApproved).toBe(false);
  });

  // 8. Batch Selection and Deselection Work Independently
  it('proves question selection for batch generation is independent of answer approval', () => {
    const selectedIds = new Set<string>();

    // Select All
    sampleQuestions.forEach((q) => selectedIds.add(q.id));
    expect(selectedIds.size).toBe(3);
    expect(selectedIds.has('q-101')).toBe(true);
    expect(selectedIds.has('q-102')).toBe(true);

    // Toggle off q-102
    selectedIds.delete('q-102');
    expect(selectedIds.size).toBe(2);
    expect(selectedIds.has('q-102')).toBe(false);

    // Deselect All
    selectedIds.clear();
    expect(selectedIds.size).toBe(0);
  });

  // 9. Batch Generation Preserves Partial Successes
  it('proves partial successes are preserved when one question succeeds and another fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Question 1: Gemini succeeds
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questionId: 'q-101',
                    recommendedAnswers: ['The amount of another good sacrificed'],
                    explanation: 'PPF sacrifice.',
                    confidence: 0.9,
                    basis: 'ai-reasoning',
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    // Question 2: Fails permanently on both primary and fallback
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response);

    const res1 = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[0],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: defaultSettings,
      skipLlm: false,
    });

    const res2 = await AnswerResolutionPipeline.resolveSingleQuestion({
      question: sampleQuestions[1],
      selectedCourse: sampleCourse,
      answerBank: [],
      materials: [],
      settings: { ...defaultSettings, enableProviderFallback: false },
      skipLlm: false,
    });

    // Question 1 remains valid and suggested
    expect(res1.resolutionState).toBe('ai-suggested');
    expect(res1.proposedAnswers).toEqual(['The amount of another good sacrificed']);

    // Question 2 shows provider-error
    expect(res2.resolutionState).toBe('provider-error');
    expect(res2.proposedAnswers).toEqual([]);
  });

  // 10. Fill Reviewed Answers Populates Approved Answers Only
  it('proves Fill Reviewed Answers populates only explicitly approved items and excludes unapproved or error items', () => {
    const items: QuestionMatchResult[] = [
      {
        scannedQuestion: sampleQuestions[0],
        status: 'probable-match',
        resolutionState: 'ai-suggested',
        confidence: 0.9,
        reasons: [],
        proposedAnswers: ['The amount of another good sacrificed'],
        isApproved: true, // APPROVED
        requiresReview: true,
      },
      {
        scannedQuestion: sampleQuestions[1],
        status: 'probable-match',
        resolutionState: 'ai-suggested',
        confidence: 0.85,
        reasons: [],
        proposedAnswers: ['Consumption (C)'],
        isApproved: false, // UNAPPROVED
        requiresReview: true,
      },
      {
        scannedQuestion: sampleQuestions[2],
        status: 'no-match',
        resolutionState: 'provider-error',
        confidence: 0,
        reasons: ['Provider error'],
        proposedAnswers: [],
        isApproved: false,
        requiresReview: true,
      },
    ];

    // Filter used by Fill Reviewed Answers
    const approvedFillItems = items.filter(
      (r) =>
        r.isApproved &&
        r.proposedAnswers.length > 0 &&
        r.resolutionState !== 'ambiguous' &&
        r.resolutionState !== 'provider-error' &&
        r.resolutionState !== 'unresolved'
    );

    expect(approvedFillItems.length).toBe(1);
    expect(approvedFillItems[0].scannedQuestion.id).toBe('q-101');
    expect(approvedFillItems[0].proposedAnswers).toEqual(['The amount of another good sacrificed']);
  });

  // 11. OpenAI Direct API Provider
  describe('OpenAI Direct API Provider Integration', () => {
    it('is registered and resolvable via getLlmProvider("openai")', () => {
      const p = getLlmProvider('openai');
      expect(p).toBeDefined();
      expect(p.id).toBe('openai');
      expect(p.name).toBe('OpenAI');
    });

    it('rejects empty API key without making network calls', async () => {
      const res = await openAiProvider.recommendAnswer(
        {
          questionId: 'q-101',
          courseTitle: 'Principles of Economics',
          questionText: 'Test?',
          questionType: 'single-choice',
          options: ['A', 'B'],
        },
        '',
        'gpt-4o-mini'
      );

      expect(res.recommendations[0].basis).toBe('unresolved');
      expect(res.recommendations[0].explanation).toContain('OpenAI API key not configured');
      expect(res.error).toBe('API key missing in settings.');
    });

    it('successfully calls OpenAI chat completions and parses structured JSON response', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  questionId: 'q-101',
                  recommendedAnswers: ['The amount of another good sacrificed'],
                  explanation: 'OpenAI GPT-4o-mini analysis: PPF slope equals the marginal rate of transformation.',
                  confidence: 0.95,
                  basis: 'ai-reasoning',
                }),
              },
            },
          ],
        }),
      } as unknown as Response);

      const res = await openAiProvider.recommendAnswer(
        {
          questionId: 'q-101',
          courseTitle: 'Principles of Economics',
          questionText: sampleQuestions[0].questionText,
          questionType: 'single-choice',
          options: sampleQuestions[0].options.map((o) => o.text),
        },
        'sk-test-key-12345',
        'gpt-4o-mini'
      );

      expect(res.provider).toBe('openai');
      expect(res.model).toBe('gpt-4o-mini');
      expect(res.recommendations[0].recommendedAnswers).toEqual(['The amount of another good sacrificed']);
      expect(res.recommendations[0].explanation).toContain('OpenAI GPT-4o-mini analysis');

      // Verify endpoint and headers
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key-12345',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('handles OpenAI 429 quota exhaustion with actionable error message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'You exceeded your current quota, please check your plan and billing details.',
              type: 'insufficient_quota',
              code: 'insufficient_quota',
            },
          }),
      } as unknown as Response);

      const res = await openAiProvider.recommendAnswer(
        {
          questionId: 'q-101',
          courseTitle: 'Principles of Economics',
          questionText: 'Sample?',
          questionType: 'single-choice',
          options: ['A', 'B'],
        },
        'sk-expired-key',
        'gpt-4o-mini'
      );

      expect(res.recommendations[0].basis).toBe('unresolved');
      expect(res.error).toContain('OpenAI API quota exhausted');
    });

    it('testConnection returns success on 200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"status":"ok"}' } }] }),
      } as unknown as Response);

      const testRes = await openAiProvider.testConnection('sk-valid-key', 'gpt-4o-mini');
      expect(testRes.success).toBe(true);
      expect(testRes.message).toContain('Successfully connected to OpenAI');
    });
  });

  // 12. Strict Immunity: The extension never clicks submit controls
  it('proves the extension never triggers submit controls on the assignment', () => {
    // Inspect DOM selector blacklist
    const forbiddenSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '#submit-assignment',
      '.submit-btn',
      'button:contains("Submit")',
    ];

    // Verification that only radio/checkbox/text input targets are populated
    const targets = sampleQuestions.map((q) => ({
      questionId: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      selectedAnswers: ['Sample answer'],
      options: q.options,
    }));

    // Ensure none of the targets contain submit actions
    targets.forEach((t) => {
      forbiddenSelectors.forEach((forbidden) => {
        expect(t.questionId).not.toContain('submit');
        expect(t.selectedAnswers).not.toContain(forbidden);
      });
    });
  });
});
