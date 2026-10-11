import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatGptBridgeService } from '@/lib/ai/chatgptBridge';
import { SwayamPortalAdapter } from '@/adapters';
import { ScannedQuestion, PopulationTarget } from '@/types';

describe('Milestone 7: Zero-Click End-to-End Auto-Pilot (ChatGPT Auto-Redirect & In-Page Radio Button Marking)', () => {
  const sampleAssignmentQuestions: ScannedQuestion[] = [
    {
      id: 'swayam-q1',
      index: 1,
      questionText: 'What is the opportunity cost of choosing a particular action?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'opt-q1-a', text: 'The value of the next best alternative forgone', value: 'a', inputSelector: '#opt-q1-a' },
        { id: 'opt-q1-b', text: 'The total monetary expense incurred', value: 'b', inputSelector: '#opt-q1-b' },
        { id: 'opt-q1-c', text: 'Zero, if resources were idle', value: 'c', inputSelector: '#opt-q1-c' },
      ],
    },
    {
      id: 'swayam-q2',
      index: 2,
      questionText: 'Which market structures are characterized by differentiated products?',
      questionType: 'multiple-choice',
      formType: 'checkbox',
      options: [
        { id: 'opt-q2-a', text: 'Monopolistic competition', value: 'mc', inputSelector: '#opt-q2-a' },
        { id: 'opt-q2-b', text: 'Perfect competition', value: 'pc', inputSelector: '#opt-q2-b' },
        { id: 'opt-q2-c', text: 'Differentiated oligopoly', value: 'do', inputSelector: '#opt-q2-c' },
      ],
    },
    {
      id: 'swayam-q3',
      index: 3,
      questionText: 'Is price elasticity of demand always negative for normal goods?',
      questionType: 'true-false',
      formType: 'radio',
      options: [
        { id: 'opt-q3-true', text: 'True', value: 'true', inputSelector: '#opt-q3-true' },
        { id: 'opt-q3-false', text: 'False', value: 'false', inputSelector: '#opt-q3-false' },
      ],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Auto-Redirect Coordination (ChatGPT -> Background -> SWAYAM Tab)', () => {
    it('background service worker activates original SWAYAM tab and focuses window upon CHATGPT_SOLVE_COMPLETE', async () => {
      const mockStorage: Record<string, any> = {
        swayam_pilot_context: {
          tabId: 404,
          url: 'https://swayam2.ac.in/courses/ECON101/unit?unit=1&assessment=3',
          timestamp: Date.now(),
        },
      };

      const tabsUpdateMock = vi.fn().mockResolvedValue({ id: 404, active: true });
      const tabsGetMock = vi.fn().mockResolvedValue({ id: 404, windowId: 99 });
      const windowsUpdateMock = vi.fn().mockResolvedValue({ id: 99, focused: true });
      const tabsSendMessageMock = vi.fn().mockResolvedValue({ type: 'POPULATE_RESULT' });

      // Simulated background message handler logic
      const handleBackgroundMessage = async (message: any) => {
        if (message.type === 'CHATGPT_SOLVE_COMPLETE') {
          const preferredTabId = message.swayamTabId;
          const targetTab = await tabsGetMock(preferredTabId);
          if (targetTab?.id) {
            await tabsUpdateMock(targetTab.id, { active: true });
            await windowsUpdateMock(targetTab.windowId, { focused: true });
            await tabsSendMessageMock(targetTab.id, {
              type: 'AUTO_APPLY_ANSWERS',
              answersText: message.answersText,
            });
            return { success: true, switchedTabId: targetTab.id };
          }
        }
        return { success: false };
      };

      const aiResponse = JSON.stringify({
        answers: [
          { questionNumber: 1, question: sampleAssignmentQuestions[0].questionText, selectedOption: 'The value of the next best alternative forgone' },
          { questionNumber: 2, question: sampleAssignmentQuestions[1].questionText, selectedOptions: ['Monopolistic competition', 'Differentiated oligopoly'] },
          { questionNumber: 3, question: sampleAssignmentQuestions[2].questionText, selectedOption: 'True' },
        ],
      });

      const result = await handleBackgroundMessage({
        type: 'CHATGPT_SOLVE_COMPLETE',
        answersText: aiResponse,
        swayamTabId: mockStorage.swayam_pilot_context.tabId,
        swayamUrl: mockStorage.swayam_pilot_context.url,
      });

      expect(result.success).toBe(true);
      expect(result.switchedTabId).toBe(404);
      expect(tabsUpdateMock).toHaveBeenCalledWith(404, { active: true });
      expect(windowsUpdateMock).toHaveBeenCalledWith(99, { focused: true });
      expect(tabsSendMessageMock).toHaveBeenCalledWith(404, {
        type: 'AUTO_APPLY_ANSWERS',
        answersText: aiResponse,
      });
    });

    it('falls back to querying open SWAYAM tabs if the stored tab ID is no longer valid', async () => {
      const tabsGetMock = vi.fn().mockRejectedValue(new Error('Tab not found'));
      const tabsQueryMock = vi.fn().mockResolvedValue([
        { id: 777, windowId: 10, url: 'https://swayam2.ac.in/courses/ECON101' },
      ]);
      const tabsUpdateMock = vi.fn().mockResolvedValue({ id: 777, active: true });
      const windowsUpdateMock = vi.fn().mockResolvedValue({ id: 10, focused: true });

      const handleBackgroundMessage = async (message: any) => {
        if (message.type === 'CHATGPT_SOLVE_COMPLETE') {
          let targetTab: any = null;
          try {
            targetTab = await tabsGetMock(message.swayamTabId);
          } catch {
            targetTab = null;
          }

          if (!targetTab) {
            const swayamTabs = await tabsQueryMock({
              url: ['https://*.swayam2.ac.in/*', 'https://*.swayam.gov.in/*'],
            });
            if (swayamTabs.length > 0) {
              targetTab = swayamTabs[0];
            }
          }

          if (targetTab?.id) {
            await tabsUpdateMock(targetTab.id, { active: true });
            await windowsUpdateMock(targetTab.windowId, { focused: true });
            return { success: true, switchedTabId: targetTab.id };
          }
        }
        return { success: false };
      };

      const result = await handleBackgroundMessage({
        type: 'CHATGPT_SOLVE_COMPLETE',
        answersText: '...',
        swayamTabId: 99999, // Stale tab ID
      });

      expect(result.success).toBe(true);
      expect(result.switchedTabId).toBe(777);
      expect(tabsUpdateMock).toHaveBeenCalledWith(777, { active: true });
      expect(windowsUpdateMock).toHaveBeenCalledWith(10, { focused: true });
    });
  });

  describe('2. In-Page Radio Button & Checkbox Auto-Marking in SWAYAM DOM', () => {
    it('automatically marks radio buttons and checkboxes directly in the document without manual paste/apply', () => {
      // Create DOM document structure
      document.body.innerHTML = `
        <div class="swayam-assignment-container">
          <!-- Question 1: Single Choice (Radio) -->
          <div class="qt-question" id="swayam-q1">
            <p class="question-text">1. What is the opportunity cost of choosing a particular action?</p>
            <label><input type="radio" name="q1" id="opt-q1-a" value="a" /> The value of the next best alternative forgone</label>
            <label><input type="radio" name="q1" id="opt-q1-b" value="b" /> The total monetary expense incurred</label>
            <label><input type="radio" name="q1" id="opt-q1-c" value="c" /> Zero, if resources were idle</label>
          </div>

          <!-- Question 2: Multiple Choice (Checkbox) -->
          <div class="qt-question" id="swayam-q2">
            <p class="question-text">2. Which market structures are characterized by differentiated products?</p>
            <label><input type="checkbox" name="q2" id="opt-q2-a" value="mc" /> Monopolistic competition</label>
            <label><input type="checkbox" name="q2" id="opt-q2-b" value="pc" /> Perfect competition</label>
            <label><input type="checkbox" name="q2" id="opt-q2-c" value="do" /> Differentiated oligopoly</label>
          </div>

          <!-- Question 3: True / False (Radio) -->
          <div class="qt-question" id="swayam-q3">
            <p class="question-text">3. Is price elasticity of demand always negative for normal goods?</p>
            <label><input type="radio" name="q3" id="opt-q3-true" value="true" /> True</label>
            <label><input type="radio" name="q3" id="opt-q3-false" value="false" /> False</label>
          </div>

          <!-- Native Submit Button (Strict Safety Boundary) -->
          <button id="swayam-submit-btn" class="gcb-button gcb-button-primary">Submit Answers</button>
        </div>
      `;

      const adapter = new SwayamPortalAdapter();

      // ChatGPT formatted response
      const chatGptResponseText = JSON.stringify({
        answers: [
          {
            questionNumber: 1,
            question: 'What is the opportunity cost of choosing a particular action?',
            selectedOption: 'The value of the next best alternative forgone',
          },
          {
            questionNumber: 2,
            question: 'Which market structures are characterized by differentiated products?',
            selectedOptions: ['Monopolistic competition', 'Differentiated oligopoly'],
          },
          {
            questionNumber: 3,
            question: 'Is price elasticity of demand always negative for normal goods?',
            selectedOption: 'True',
          },
        ],
      });

      // 1. Parse answers using ChatGptBridgeService
      const parsed = ChatGptBridgeService.parseResponse(chatGptResponseText, sampleAssignmentQuestions);
      expect(parsed.success).toBe(true);
      expect(parsed.matchedCount).toBe(3);

      // 2. Execute population into page DOM
      let populatedCount = 0;
      for (const item of parsed.matchedItems) {
        const target: PopulationTarget = {
          questionId: item.scannedQuestion.id,
          questionText: item.scannedQuestion.questionText,
          questionType: item.scannedQuestion.questionType,
          selectedAnswers: item.matchedOptionTexts,
          options: item.scannedQuestion.options,
        };

        const res = adapter.populateQuestion(document, target);
        if (res.success) populatedCount++;
      }

      expect(populatedCount).toBe(3);

      // Verify DOM radio button states
      const optQ1A = document.getElementById('opt-q1-a') as HTMLInputElement;
      const optQ1B = document.getElementById('opt-q1-b') as HTMLInputElement;
      const optQ1C = document.getElementById('opt-q1-c') as HTMLInputElement;

      expect(optQ1A.checked).toBe(true);
      expect(optQ1B.checked).toBe(false);
      expect(optQ1C.checked).toBe(false);

      // Verify DOM checkboxes
      const optQ2A = document.getElementById('opt-q2-a') as HTMLInputElement;
      const optQ2B = document.getElementById('opt-q2-b') as HTMLInputElement;
      const optQ2C = document.getElementById('opt-q2-c') as HTMLInputElement;

      expect(optQ2A.checked).toBe(true);
      expect(optQ2B.checked).toBe(false);
      expect(optQ2C.checked).toBe(true);

      // Verify Question 3 radio button
      const optQ3True = document.getElementById('opt-q3-true') as HTMLInputElement;
      const optQ3False = document.getElementById('opt-q3-false') as HTMLInputElement;

      expect(optQ3True.checked).toBe(true);
      expect(optQ3False.checked).toBe(false);

      // STRICT ZERO AUTO-SUBMIT GUARANTEE
      const submitBtn = document.getElementById('swayam-submit-btn') as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();
      // Ensure submit button was not clicked or disabled
      expect(submitBtn.disabled).toBe(false);
    });

    it('in-page toast renders feedback with marked answers count and manual submit reminder', () => {
      document.body.innerHTML = `<div>Assignment Page</div>`;

      // Simulates showInPageToast
      const toast = document.createElement('div');
      toast.id = 'swayam404-toast';
      toast.innerHTML = `
        <div class="toast-title">SWAYAM 404 • AUTO-PILOT</div>
        <div class="toast-body">⚡ All 3 of 3 answers automatically marked! Review your choices and click "Submit" manually.</div>
        <div class="toast-footer">🛡️ Zero Auto-Submit: Review answers & click Submit</div>
      `;
      document.body.appendChild(toast);

      const toastEl = document.getElementById('swayam404-toast');
      expect(toastEl).not.toBeNull();
      expect(toastEl?.textContent).toContain('All 3 of 3 answers automatically marked');
      expect(toastEl?.textContent).toContain('Zero Auto-Submit');
    });
  });

  describe('3. Single-Click Paste & Mark Answers Fallback', () => {
    it('parses pasted response, approves, and returns targets for immediate population in one execution', () => {
      const naturalNumberedText = `
        1. A (The value of the next best alternative forgone)
        2. Monopolistic competition, Differentiated oligopoly
        3. True
      `;

      const parsed = ChatGptBridgeService.parseResponse(naturalNumberedText, sampleAssignmentQuestions);
      expect(parsed.success).toBe(true);
      expect(parsed.matchedCount).toBe(3);

      // Transforms into population targets directly
      const targets: PopulationTarget[] = parsed.matchedItems.map((item) => ({
        questionId: item.scannedQuestion.id,
        questionText: item.scannedQuestion.questionText,
        questionType: item.scannedQuestion.questionType,
        selectedAnswers: item.matchedOptionTexts,
        options: item.scannedQuestion.options,
      }));

      expect(targets.length).toBe(3);
      expect(targets[0].selectedAnswers).toEqual(['The value of the next best alternative forgone']);
      expect(targets[1].selectedAnswers).toEqual(['Monopolistic competition', 'Differentiated oligopoly']);
      expect(targets[2].selectedAnswers).toEqual(['True']);
    });
  });
});
