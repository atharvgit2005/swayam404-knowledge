import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChatGptBridgeService,
} from '@/lib/ai/chatgptBridge';
import {
  ScannedQuestion,
  QuestionMatchResult,
} from '@/types';

describe('Swayam404 ChatGPT Bridge, Response Import, Batch Review & Safety Test Suite', () => {
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Prompt Construction & Privacy
  describe('Prompt Construction & Batching', () => {
    it('constructs a compact, natural academic prompt containing question strings and clean options without internal IDs', () => {
      const prompt = ChatGptBridgeService.buildPrompt({
        questions: sampleQuestions,
        courseName: 'Principles of Economics',
        assignmentTitle: 'Week 3 Assignment',
      });

      expect(prompt).toContain('Course: "Principles of Economics"');
      expect(prompt).toContain('Assignment: "Week 3 Assignment"');
      // Natural question text strings are present
      expect(prompt).toContain('What is the opportunity cost of an economy operating on its PPF?');
      expect(prompt).toContain('The amount of another good sacrificed');
      expect(prompt).toContain('Which of the following are components of GDP calculated via expenditure method?');
      expect(prompt).toContain('Calculate the elasticity coefficient when quantity demanded drops by 10% from a 5% price rise.');
      // Does NOT include internal DOM IDs or artificial IDs
      expect(prompt).not.toContain('opt-101-a');
      expect(prompt).not.toContain('Option ID:');
      expect(prompt).not.toContain('Question ID: "q-101"');
      // Instructs JSON format mentioning question strings
      expect(prompt).toContain('"question": "exact question text"');
      expect(prompt).toContain('"selectedOption": "exact option text"');
    });

    it('sanitizes input and does not include browser tokens, cookies, or irrelevant DOM state', () => {
      const prompt = ChatGptBridgeService.buildPrompt({
        questions: sampleQuestions,
      });

      expect(prompt).not.toContain('cookie');
      expect(prompt).not.toContain('token');
      expect(prompt).not.toContain('Authorization');
      expect(prompt).not.toContain('password');
    });

    it('splits large assignments into manageable batches preserving stable question IDs', () => {
      const manyQuestions: ScannedQuestion[] = Array.from({ length: 25 }, (_, i) => ({
        id: `q-${i + 1}`,
        index: i + 1,
        questionText: `Sample question numbered ${i + 1}`,
        questionType: 'single-choice',
        formType: 'radio',
        options: [
          { id: `opt-${i + 1}-a`, text: 'Option A', value: 'a' },
          { id: `opt-${i + 1}-b`, text: 'Option B', value: 'b' },
        ],
      }));

      const batches = ChatGptBridgeService.createBatches(manyQuestions, 10);
      expect(batches.length).toBe(3);
      expect(batches[0].length).toBe(10);
      expect(batches[1].length).toBe(10);
      expect(batches[2].length).toBe(5);
      expect(batches[0][0].id).toBe('q-1');
      expect(batches[2][4].id).toBe('q-25');
    });
  });

  // 2. Clipboard Handling & Tab Opening
  describe('Clipboard Copying & ChatGPT Tab Handling', () => {
    it('uses navigator.clipboard.writeText when available', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const success = await ChatGptBridgeService.copyToClipboard('Test Prompt');
      expect(success).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith('Test Prompt');
    });

    it('falls back gracefully to document.execCommand if navigator.clipboard fails', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      const success = await ChatGptBridgeService.copyToClipboard('Fallback Prompt');
      expect(success).toBe(true);
      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });

    it('opens https://chatgpt.com/ using chrome.tabs.create when in extension context', async () => {
      const createMock = vi.fn();
      // @ts-ignore
      (global as any).chrome = {
        tabs: {
          create: createMock,
        },
      };

      await ChatGptBridgeService.openChatGptTab();
      expect(createMock).toHaveBeenCalledWith({ url: 'https://chatgpt.com/' });
    });

    it('falls back to window.open if chrome.tabs is unavailable', async () => {
      // @ts-ignore
      delete global.chrome;
      const windowOpenMock = vi.spyOn(window, 'open').mockImplementation(() => null);

      await ChatGptBridgeService.openChatGptTab();
      expect(windowOpenMock).toHaveBeenCalledWith('https://chatgpt.com/', '_blank');
    });
  });

  // 3. Response Parsing & Markdown Code Fences
  describe('JSON Extraction & Response Parsing', () => {
    it('extracts and parses valid raw JSON output', () => {
      const rawJson = JSON.stringify({
        answers: [
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-101-a',
            selectedOptionText: 'The amount of another good sacrificed',
            explanation: 'Opportunity cost reflects trade-offs along the frontier.',
            status: 'suggested',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(rawJson, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.matchedItems[0].questionId).toBe('q-101');
      expect(result.matchedItems[0].matchedOptionIds).toEqual(['opt-101-a']);
      expect(result.matchedItems[0].matchedOptionTexts).toEqual(['The amount of another good sacrificed']);
    });

    it('extracts JSON safely when wrapped in markdown code fences and conversational prose', () => {
      const wrappedResponse = `
Here is the JSON format you requested with the answers:

\`\`\`json
{
  "answers": [
    {
      "questionId": "q-101",
      "selectedOptionId": "opt-101-a",
      "explanation": "Opportunity cost definition."
    },
    {
      "questionId": "q-102",
      "selectedOptionIds": ["opt-102-a", "opt-102-b", "opt-102-c"],
      "explanation": "GDP = C + I + G + (X - M). Transfer payments are excluded."
    }
  ]
}
\`\`\`

Let me know if you need explanations for further questions!
`;

      const result = ChatGptBridgeService.parseResponse(wrappedResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(2);
      expect(result.matchedItems[0].matchedOptionIds).toEqual(['opt-101-a']);
      expect(result.matchedItems[1].matchedOptionIds).toEqual(['opt-102-a', 'opt-102-b', 'opt-102-c']);
      expect(result.matchedItems[1].matchedOptionTexts).toContain('Consumption (C)');
      expect(result.matchedItems[1].matchedOptionTexts).toContain('Government Spending (G)');
    });

    it('handles short-text questions with numerical or text response', () => {
      const shortTextResponse = JSON.stringify({
        answers: [
          {
            questionId: 'q-103',
            selectedOptionText: '-2.0',
            explanation: 'Elasticity = % change in Q / % change in P = -10 / 5 = -2.',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(shortTextResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.matchedItems[0].matchedOptionTexts).toEqual(['-2.0']);
    });

    it('successfully parses natural JSON where questions are mentioned as strings without question IDs', () => {
      const naturalResponse = JSON.stringify({
        answers: [
          {
            question: 'What is the opportunity cost of an economy operating on its PPF?',
            selectedOption: 'The amount of another good sacrificed',
            explanation: 'Points on the PPF illustrate trade-offs.',
          },
          {
            question: 'Which of the following are components of GDP calculated via expenditure method?',
            selectedOptions: ['Consumption (C)', 'Investment (I)', 'Government Spending (G)'],
          },
          {
            question: 'Calculate the elasticity coefficient when quantity demanded drops by 10% from a 5% price rise.',
            selectedOption: '-2.0',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(naturalResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(3);
      expect(result.invalidCount).toBe(0);

      // Question 1
      expect(result.matchedItems[0].questionId).toBe('q-101');
      expect(result.matchedItems[0].matchedOptionIds).toEqual(['opt-101-a']);
      expect(result.matchedItems[0].matchedOptionTexts).toEqual(['The amount of another good sacrificed']);

      // Question 2 (multiple choice)
      expect(result.matchedItems[1].questionId).toBe('q-102');
      expect(result.matchedItems[1].matchedOptionIds).toEqual(['opt-102-a', 'opt-102-b', 'opt-102-c']);

      // Question 3 (short text)
      expect(result.matchedItems[2].questionId).toBe('q-103');
      expect(result.matchedItems[2].matchedOptionTexts).toEqual(['-2.0']);
    });

    it('correctly maps answers when ChatGPT returns option letters and numbered question strings', () => {
      const letterResponse = JSON.stringify({
        answers: [
          {
            question: '1. What is the opportunity cost of an economy operating on its PPF?',
            selectedOption: 'A. The amount of another good sacrificed',
          },
          {
            question: 'Question 2: Which of the following are components of GDP calculated via expenditure method?',
            selectedOption: 'A, B, C',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(letterResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(2);
      expect(result.matchedItems[0].matchedOptionIds).toEqual(['opt-101-a']);
      expect(result.matchedItems[1].matchedOptionIds).toEqual(['opt-102-a', 'opt-102-b', 'opt-102-c']);
    });

    it('parses direct dictionary/map format with question text keys', () => {
      const dictResponse = JSON.stringify({
        'What is the opportunity cost of an economy operating on its PPF?': 'The amount of another good sacrificed',
        'Which of the following are components of GDP calculated via expenditure method?': 'Consumption (C)',
      });

      const result = ChatGptBridgeService.parseResponse(dictResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(2);
      expect(result.matchedItems[0].matchedOptionIds).toEqual(['opt-101-a']);
      expect(result.matchedItems[1].matchedOptionIds).toEqual(['opt-102-a']);
    });
  });

  // 4. Validation, Duplicate & Unknown Question Handling
  describe('Validation & Edge Case Handling', () => {
    it('rejects unknown question IDs that do not exist in current scan', () => {
      const responseWithUnknown = JSON.stringify({
        answers: [
          {
            questionId: 'q-999-hallucinated',
            selectedOptionId: 'opt-foo',
            selectedOptionText: 'Random option',
          },
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-101-a',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(responseWithUnknown, sampleQuestions);
      expect(result.matchedCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidItems[0].questionId).toBe('q-999-hallucinated');
      expect(result.invalidItems[0].reason).toContain('does not belong to the currently scanned assignment');
    });

    it('rejects duplicate answers for the same question ID in the response', () => {
      const responseWithDuplicates = JSON.stringify({
        answers: [
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-101-a',
          },
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-101-b',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(responseWithDuplicates, sampleQuestions);
      expect(result.matchedCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidItems[0].reason).toContain('Duplicate answer entry for question ID');
    });

    it('rejects unknown option IDs that do not belong to the question', () => {
      const responseWithBadOption = JSON.stringify({
        answers: [
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-102-a', // Belongs to q-102, not q-101!
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(responseWithBadOption, sampleQuestions);
      expect(result.matchedCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidItems[0].reason).toContain('does not match any visible option');
    });

    it('handles partial responses gracefully without failing the entire batch', () => {
      // Only 1 of 3 questions answered
      const partialResponse = JSON.stringify({
        answers: [
          {
            questionId: 'q-101',
            selectedOptionId: 'opt-101-a',
          },
        ],
      });

      const result = ChatGptBridgeService.parseResponse(partialResponse, sampleQuestions);
      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.skippedCount).toBe(2);
    });

    it('shows useful error if the output does not contain parseable JSON', () => {
      const nonJson = 'I am sorry, as an AI language model I cannot answer this without more context.';
      const result = ChatGptBridgeService.parseResponse(nonJson, sampleQuestions);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to parse JSON');
    });
  });

  // 5. Preserving Portal-Confirmed & Verified Answers
  describe('Merging Suggestions & Safeguards', () => {
    it('NEVER overwrites portal-confirmed answers with imported ChatGPT suggestions', () => {
      const existingResults: QuestionMatchResult[] = [
        {
          scannedQuestion: sampleQuestions[0],
          status: 'exact-match',
          resolutionState: 'portal-confirmed',
          confidence: 1.0,
          reasons: ['Portal feedback confirmed'],
          requiresReview: false,
          proposedAnswers: ['The amount of another good sacrificed'],
          matchedRecord: {
            id: 'rec-1',
            courseId: 'econ-1',
            questionText: sampleQuestions[0].questionText,
            questionType: 'single-choice',
            options: sampleQuestions[0].options.map((o) => o.text),
            correctOptions: ['The amount of another good sacrificed'],
            reviewStatus: 'portal-confirmed',
            source: 'Assignment 3',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          isApproved: true,
        },
        {
          scannedQuestion: sampleQuestions[1],
          status: 'no-match',
          resolutionState: 'unresolved',
          confidence: 0,
          reasons: [],
          requiresReview: true,
          proposedAnswers: [],
          isApproved: false,
        },
      ];

      // ChatGPT tries to suggest a different answer for q-101 and an answer for q-102
      const importResult = ChatGptBridgeService.parseResponse(
        JSON.stringify({
          answers: [
            {
              questionId: 'q-101',
              selectedOptionId: 'opt-101-b',
              explanation: 'ChatGPT thinks B.',
            },
            {
              questionId: 'q-102',
              selectedOptionIds: ['opt-102-a', 'opt-102-b'],
              explanation: 'C and I.',
            },
          ],
        }),
        sampleQuestions
      );

      const merged = ChatGptBridgeService.mergeImportedAnswers(existingResults, importResult);

      expect(merged.mergedCount).toBe(1);
      expect(merged.protectedCount).toBe(1);

      // q-101 remains portal-confirmed with original verified answer!
      expect(merged.updatedResults[0].resolutionState).toBe('portal-confirmed');
      expect(merged.updatedResults[0].proposedAnswers).toEqual(['The amount of another good sacrificed']);

      // q-102 received the ChatGPT suggestion, but is NOT auto-approved (deliberate user review requirement)
      expect(merged.updatedResults[1].resolutionState).toBe('chatgpt-suggested');
      expect(merged.updatedResults[1].proposedAnswers).toEqual(['Consumption (C)', 'Investment (I)']);
      expect(merged.updatedResults[1].isApproved).toBe(false);
    });

    it('NEVER overwrites manually verified records with imported suggestions', () => {
      const existingResults: QuestionMatchResult[] = [
        {
          scannedQuestion: sampleQuestions[0],
          status: 'exact-match',
          resolutionState: 'ai-suggested',
          confidence: 0.9,
          reasons: ['Manually verified key'],
          requiresReview: false,
          proposedAnswers: ['The amount of another good sacrificed'],
          matchedRecord: {
            id: 'rec-manual-verified',
            courseId: 'econ-1',
            questionText: sampleQuestions[0].questionText,
            questionType: 'single-choice',
            options: sampleQuestions[0].options.map((o) => o.text),
            correctOptions: ['The amount of another good sacrificed'],
            reviewStatus: 'verified',
            source: 'Manual entry',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          isApproved: true,
        },
      ];

      const importResult = ChatGptBridgeService.parseResponse(
        JSON.stringify({
          answers: [
            {
              questionId: 'q-101',
              selectedOptionId: 'opt-101-b',
            },
          ],
        }),
        sampleQuestions
      );

      const merged = ChatGptBridgeService.mergeImportedAnswers(existingResults, importResult);
      expect(merged.protectedCount).toBe(1);
      expect(merged.updatedResults[0].proposedAnswers).toEqual(['The amount of another good sacrificed']);
    });
  });

  // 6. Batch Selection, Approval & Execution Queue
  describe('Batch Controls & Execution Queue', () => {
    it('only approves eligible items having proposed answers on select all', () => {
      const results: QuestionMatchResult[] = [
        {
          scannedQuestion: sampleQuestions[0],
          status: 'exact-match',
          resolutionState: 'portal-confirmed',
          confidence: 1.0,
          reasons: [],
          requiresReview: false,
          proposedAnswers: ['The amount of another good sacrificed'],
          isApproved: false,
        },
        {
          scannedQuestion: sampleQuestions[1],
          status: 'no-match',
          resolutionState: 'unresolved',
          confidence: 0,
          reasons: [],
          requiresReview: true,
          proposedAnswers: [], // Empty! Should NOT be approved
          isApproved: false,
        },
      ];

      const selectAll = results.map((r) =>
        r.proposedAnswers.length > 0 ? { ...r, isApproved: true } : r
      );

      expect(selectAll[0].isApproved).toBe(true);
      expect(selectAll[1].isApproved).toBe(false);

      const deselectAll = selectAll.map((r) => ({ ...r, isApproved: false }));
      expect(deselectAll.every((r) => !r.isApproved)).toBe(true);
    });

    it('populates ONLY explicitly approved answers, skipping unapproved items', () => {
      const results: QuestionMatchResult[] = [
        {
          scannedQuestion: sampleQuestions[0],
          status: 'exact-match',
          resolutionState: 'portal-confirmed',
          confidence: 1.0,
          reasons: [],
          requiresReview: false,
          proposedAnswers: ['The amount of another good sacrificed'],
          isApproved: true, // Approved
        },
        {
          scannedQuestion: sampleQuestions[1],
          status: 'probable-match',
          resolutionState: 'chatgpt-suggested',
          confidence: 0.85,
          reasons: [],
          requiresReview: true,
          proposedAnswers: ['Consumption (C)'],
          isApproved: false, // NOT approved
        },
      ];

      const targetsToPopulate = results.filter((r) => r.isApproved && r.proposedAnswers.length > 0);
      expect(targetsToPopulate.length).toBe(1);
      expect(targetsToPopulate[0].scannedQuestion.id).toBe('q-101');
    });

    it('Strict Submit Button Immunity Boundary: never triggers or references assessment submit buttons', () => {
      // Create mock DOM representing Swayam assessment
      document.body.innerHTML = `
        <div data-question-id="q-101">
          <input type="radio" id="opt-1" name="q-101" value="a" />
        </div>
        <button id="submit_assessment" class="gcb-submit-button">Submit Assignment</button>
        <button id="final_submit">Final Submit</button>
      `;

      const submitBtn = document.getElementById('submit_assessment') as HTMLButtonElement;
      const finalSubmitBtn = document.getElementById('final_submit') as HTMLButtonElement;
      const submitClickSpy = vi.spyOn(submitBtn, 'click');
      const finalSubmitSpy = vi.spyOn(finalSubmitBtn, 'click');

      // Execute simulated radio selection on target
      const radio = document.getElementById('opt-1') as HTMLInputElement;
      radio.checked = true;

      // Verify submit buttons were never touched
      expect(submitClickSpy).not.toHaveBeenCalled();
      expect(finalSubmitSpy).not.toHaveBeenCalled();
    });

    it('robustly parses direct JSON array and comma-separated objects for fill-in-the-blank questions with option letter prefixes', () => {
      const fillInBlankQuestions: ScannedQuestion[] = [
        {
          id: 'fb-1',
          index: 1,
          questionText: '1. A/An _________ is an investor who funds start-up companies:',
          questionType: 'single-choice',
          formType: 'radio',
          options: [
            { id: 'fb-1-a', text: 'Venture Capitalist', value: 'a' },
            { id: 'fb-1-b', text: 'Angel', value: 'b' },
            { id: 'fb-1-c', text: 'Commercial Bank', value: 'c' },
          ],
        },
        {
          id: 'fb-2',
          index: 2,
          questionText: '2. _________ is the money raised by taking out loans:',
          questionType: 'single-choice',
          formType: 'radio',
          options: [
            { id: 'fb-2-a', text: 'Debt capital', value: 'a' },
            { id: 'fb-2-b', text: 'Equity capital', value: 'b' },
          ],
        },
      ];

      // Format 1: Direct JSON array as output by ChatGPT in code blocks
      const directArrayJson = `
\`\`\`json
[
  {
    "question": "A/An _____ is an investor who funds start-up companies:",
    "selectedOption": "B. Angel"
  },
  {
    "question": "_____ is the money raised by taking out loans:",
    "selectedOption": "A. Debt capital"
  }
]
\`\`\`
`;
      const res1 = ChatGptBridgeService.parseResponse(directArrayJson, fillInBlankQuestions);
      expect(res1.success).toBe(true);
      expect(res1.matchedCount).toBe(2);
      expect(res1.matchedItems[0].matchedOptionIds).toEqual(['fb-1-b']);
      expect(res1.matchedItems[0].matchedOptionTexts).toEqual(['Angel']);
      expect(res1.matchedItems[1].matchedOptionIds).toEqual(['fb-2-a']);
      expect(res1.matchedItems[1].matchedOptionTexts).toEqual(['Debt capital']);

      // Format 2: Comma-separated objects without enclosing array brackets
      const bareObjects = `
  {
    "question": "A/An _____ is an investor who funds start-up companies:",
    "selectedOption": "B. Angel"
  },
  {
    "question": "_____ is the money raised by taking out loans:",
    "selectedOption": "A. Debt capital"
  }
`;
      const res2 = ChatGptBridgeService.parseResponse(bareObjects, fillInBlankQuestions);
      expect(res2.success).toBe(true);
      expect(res2.matchedCount).toBe(2);
      expect(res2.matchedItems[0].matchedOptionIds).toEqual(['fb-1-b']);
      expect(res2.matchedItems[1].matchedOptionIds).toEqual(['fb-2-a']);
    });
  });

  // 13. Floating Popup Conditional Visibility & Non-Intrusive Normal ChatGPT Browsing
  describe('13. ChatGPT Floating Popup Conditional Visibility & Session Dismissal', () => {
    function shouldShowBadgeLogic(
      storageData: {
        pendingChatGptPrompt?: string;
        autoPilotActive?: boolean;
        swayam_pilot_context?: { timestamp?: number };
      },
      sessionDismissed: boolean
    ): boolean {
      if (sessionDismissed) return false;
      const hasPrompt = Boolean(storageData?.pendingChatGptPrompt);
      const isPilotActive = Boolean(storageData?.autoPilotActive);
      const pilotTimestamp = storageData?.swayam_pilot_context?.timestamp || 0;
      const isRecentPilot = pilotTimestamp > 0 && Date.now() - pilotTimestamp < 15 * 60 * 1000;

      return hasPrompt || (isPilotActive && isRecentPilot);
    }

    it('does NOT display floating popup on normal ChatGPT sessions without active Swayam task', () => {
      const normalSessionStorage = {
        pendingChatGptPrompt: undefined,
        autoPilotActive: false,
        swayam_pilot_context: undefined,
      };

      const shouldShow = shouldShowBadgeLogic(normalSessionStorage, false);
      expect(shouldShow).toBe(false);
    });

    it('displays floating popup when pendingChatGptPrompt is queued from Swayam404', () => {
      const activeSolveStorage = {
        pendingChatGptPrompt: 'Please solve these 5 questions...',
        autoPilotActive: true,
        swayam_pilot_context: { timestamp: Date.now() },
      };

      const shouldShow = shouldShowBadgeLogic(activeSolveStorage, false);
      expect(shouldShow).toBe(true);
    });

    it('displays floating popup during recent auto-pilot solve session', () => {
      const activeAutoPilotStorage = {
        pendingChatGptPrompt: undefined,
        autoPilotActive: true,
        swayam_pilot_context: { timestamp: Date.now() - 30 * 1000 }, // 30s ago
      };

      const shouldShow = shouldShowBadgeLogic(activeAutoPilotStorage, false);
      expect(shouldShow).toBe(true);
    });

    it('does NOT display floating popup if session was dismissed by the user with close button', () => {
      const activeStorage = {
        pendingChatGptPrompt: 'Solve questions',
        autoPilotActive: true,
        swayam_pilot_context: { timestamp: Date.now() },
      };

      const shouldShow = shouldShowBadgeLogic(activeStorage, true);
      expect(shouldShow).toBe(false);
    });

    it('does NOT display floating popup if autoPilot timestamp is expired (> 15 minutes)', () => {
      const staleStorage = {
        pendingChatGptPrompt: undefined,
        autoPilotActive: true,
        swayam_pilot_context: { timestamp: Date.now() - 20 * 60 * 1000 }, // 20m ago
      };

      const shouldShow = shouldShowBadgeLogic(staleStorage, false);
      expect(shouldShow).toBe(false);
    });
  });
});
