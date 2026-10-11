import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PageConnectionService } from '@/lib/connection/pageConnection';
import { SwayamPortalAdapter } from '@/adapters';
import { PopulationTarget } from '@/types';

describe('Feature E: Page Connection & Form Population Hardening', () => {
  let adapter: SwayamPortalAdapter;

  beforeEach(() => {
    adapter = new SwayamPortalAdapter();
  });

  describe('Page Connection & Host Permissions', () => {
    it('accurately identifies live SWAYAM2 portal URL as supported', () => {
      const liveUrl =
        'https://onlinecourses.swayam2.ac.in/e-learning/course/ini26_cm22?unitId=26&assessmentId=118';
      const check = PageConnectionService.isSupportedUrl(liveUrl);

      expect(check.supported).toBe(true);
      expect(check.reason).toBeUndefined();
    });

    it('identifies standard swayam.gov.in and nptel.ac.in domains as supported', () => {
      expect(
        PageConnectionService.isSupportedUrl('https://swayam.gov.in/courses/test').supported
      ).toBe(true);
      expect(
        PageConnectionService.isSupportedUrl('https://nptel.ac.in/courses/106105').supported
      ).toBe(true);
      expect(
        PageConnectionService.isSupportedUrl('http://localhost:5173/fixtures/economics.html').supported
      ).toBe(true);
    });

    it('rejects internal browser pages with clear descriptive reasons', () => {
      const chromeExt = PageConnectionService.isSupportedUrl('chrome://extensions');
      expect(chromeExt.supported).toBe(false);
      expect(chromeExt.reason).toContain('Cannot connect to browser internal pages');

      const edgeCheck = PageConnectionService.isSupportedUrl('edge://settings');
      expect(edgeCheck.supported).toBe(false);

      const braveCheck = PageConnectionService.isSupportedUrl('brave://extensions');
      expect(braveCheck.supported).toBe(false);

      const emptyCheck = PageConnectionService.isSupportedUrl('');
      expect(emptyCheck.supported).toBe(false);
    });
  });

  describe('Form Population & Checkbox Unchecking', () => {
    it('correctly checks target checkboxes AND UNCHECKS previously incorrect choices', () => {
      document.body.innerHTML = `
        <div data-question-id="q-multi" class="gcb-form-element">
          <div class="qt-question-text">Select all prime numbers under 10:</div>
          <div class="choices">
            <label class="choice-label">
              <input type="checkbox" id="chk_2" name="primes" value="2" />
              <span>2</span>
            </label>
            <label class="choice-label">
              <input type="checkbox" id="chk_3" name="primes" value="3" />
              <span>3</span>
            </label>
            <label class="choice-label">
              <input type="checkbox" id="chk_4" name="primes" value="4" checked />
              <span>4</span>
            </label>
            <label class="choice-label">
              <input type="checkbox" id="chk_5" name="primes" value="5" />
              <span>5</span>
            </label>
          </div>
        </div>
      `;

      const chk2 = document.getElementById('chk_2') as HTMLInputElement;
      const chk3 = document.getElementById('chk_3') as HTMLInputElement;
      const chk4 = document.getElementById('chk_4') as HTMLInputElement;
      const chk5 = document.getElementById('chk_5') as HTMLInputElement;

      // Note: chk4 was incorrectly pre-checked!
      expect(chk4.checked).toBe(true);
      expect(chk2.checked).toBe(false);

      const target: PopulationTarget = {
        questionId: 'q-multi',
        questionText: 'Select all prime numbers under 10:',
        questionType: 'multiple-choice',
        selectedAnswers: ['2', '3', '5'], // Complete correct set; '4' is not here
        options: [
          { id: 'chk_2', text: '2', value: '2', inputSelector: '#chk_2' },
          { id: 'chk_3', text: '3', value: '3', inputSelector: '#chk_3' },
          { id: 'chk_4', text: '4', value: '4', inputSelector: '#chk_4' },
          { id: 'chk_5', text: '5', value: '5', inputSelector: '#chk_5' },
        ],
      };

      const res = adapter.populateQuestion(document, target);

      expect(res.success).toBe(true);
      // Correct choices MUST be checked
      expect(chk2.checked).toBe(true);
      expect(chk3.checked).toBe(true);
      expect(chk5.checked).toBe(true);
      // CRITICAL: Previously selected wrong choice '4' MUST be unchecked!
      expect(chk4.checked).toBe(false);
    });

    it('strictly avoids double-checking or toggling already correctly selected checkboxes', () => {
      document.body.innerHTML = `
        <div data-question-id="q-precheck" class="gcb-form-element">
          <input type="checkbox" id="chk_a" value="a" checked />
          <input type="checkbox" id="chk_b" value="b" />
        </div>
      `;

      const chkA = document.getElementById('chk_a') as HTMLInputElement;
      const chkB = document.getElementById('chk_b') as HTMLInputElement;

      const target: PopulationTarget = {
        questionId: 'q-precheck',
        questionText: 'Sample question',
        questionType: 'multiple-choice',
        selectedAnswers: ['a'],
        options: [
          { id: 'chk_a', text: 'a', value: 'a', inputSelector: '#chk_a' },
          { id: 'chk_b', text: 'b', value: 'b', inputSelector: '#chk_b' },
        ],
      };

      const res = adapter.populateQuestion(document, target);
      expect(res.success).toBe(true);
      expect(chkA.checked).toBe(true);
      expect(chkB.checked).toBe(false);
    });

    it('enforces single radio selection for single-choice questions', () => {
      document.body.innerHTML = `
        <div data-question-id="q-radio" class="gcb-form-element">
          <input type="radio" id="rad_1" name="grp" value="opt1" checked />
          <input type="radio" id="rad_2" name="grp" value="opt2" />
        </div>
      `;

      const rad1 = document.getElementById('rad_1') as HTMLInputElement;
      const rad2 = document.getElementById('rad_2') as HTMLInputElement;

      const target: PopulationTarget = {
        questionId: 'q-radio',
        questionText: 'Single choice question',
        questionType: 'single-choice',
        selectedAnswers: ['opt2'],
        options: [
          { id: 'rad_1', text: 'opt1', value: 'opt1', inputSelector: '#rad_1' },
          { id: 'rad_2', text: 'opt2', value: 'opt2', inputSelector: '#rad_2' },
        ],
      };

      const res = adapter.populateQuestion(document, target);
      expect(res.success).toBe(true);
      expect(rad2.checked).toBe(true);
      expect(rad1.checked).toBe(false);
    });

    it('guarantees submit buttons and form submissions are NEVER triggered', () => {
      const submitSpy = vi.fn();

      document.body.innerHTML = `
        <form id="quiz-form">
          <div data-question-id="q-safe" class="gcb-form-element">
            <input type="radio" id="safe_rad" value="ans" />
          </div>
          <button type="submit" id="submit-btn">Submit Assignment</button>
        </form>
      `;

      const form = document.getElementById('quiz-form') as HTMLFormElement;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitSpy();
      });

      const btn = document.getElementById('submit-btn') as HTMLButtonElement;
      btn.addEventListener('click', () => {
        submitSpy();
      });

      const target: PopulationTarget = {
        questionId: 'q-safe',
        questionText: 'Safe question',
        questionType: 'single-choice',
        selectedAnswers: ['ans'],
        options: [{ id: 'safe_rad', text: 'ans', value: 'ans', inputSelector: '#safe_rad' }],
      };

      const res = adapter.populateQuestion(document, target);
      expect(res.success).toBe(true);

      // Verify submitSpy was NEVER called
      expect(submitSpy).not.toHaveBeenCalled();
    });
  });
});
