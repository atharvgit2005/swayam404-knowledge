import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SwayamPortalAdapter } from '@/adapters';
import { matchAssignment } from '@/lib/matching/matcher';
import { QuestionRecord, PopulationTarget } from '@/types';

describe('Site Adapter & Local Assignment Fixtures Integration', () => {
  let econHtml: string;
  let entHtml: string;
  let adapter: SwayamPortalAdapter;

  beforeEach(() => {
    adapter = new SwayamPortalAdapter();
    econHtml = fs.readFileSync(path.resolve(__dirname, '../../public/fixtures/economics-assignment.html'), 'utf-8');
    entHtml = fs.readFileSync(path.resolve(__dirname, '../../public/fixtures/entrepreneurship-assignment.html'), 'utf-8');
  });

  it('scans Economics assignment fixture extracting all question types correctly', () => {
    document.body.innerHTML = econHtml;

    const questions = adapter.scanQuestions(document);
    expect(questions.length).toBe(6); // 6 questions in the fixture

    // Q1: Single choice radio with shuffled options
    const q1 = questions[0];
    expect(q1.questionText).toContain('What happens to the demand curve of a normal good');
    expect(q1.formType).toBe('radio');
    expect(q1.options.length).toBe(4);
    expect(q1.options.some((o) => o.text.includes('Shifts to the right'))).toBe(true);

    // Q3: Multiple choice checkboxes
    const q3 = questions[2];
    expect(q3.questionText).toContain('components of aggregate demand');
    expect(q3.formType).toBe('checkbox');
    expect(q3.options.length).toBe(4);

    // Q4: True/False
    const q4 = questions[3];
    expect(q4.questionText).toContain('Fiscal policy involves government decisions');
    expect(q4.questionType).toBe('true-false');

    // Q5: Short text
    const q5 = questions[4];
    expect(q5.questionText).toContain('State the economic term for the cost of the next best alternative');
    expect(q5.formType).toBe('text');
  });

  it('matches scanned questions against Economics answer bank and isolates from Entrepreneurship bank', () => {
    document.body.innerHTML = econHtml;
    const scanned = adapter.scanQuestions(document);

    const econBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/economics-sample.json'), 'utf-8')
    );
    const entBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/entrepreneurship-sample.json'), 'utf-8')
    );

    const econBank: QuestionRecord[] = econBankRaw.questions;
    const entBank: QuestionRecord[] = entBankRaw.questions;

    // 1. Match against Economics bank
    const econMatches = matchAssignment(scanned, econBank);
    const exactMatches = econMatches.filter((m) => m.status === 'exact-match');
    expect(exactMatches.length).toBe(5); // Q1, Q2, Q3, Q4, Q5 match exactly!

    // Q6 is novel/unmatched
    const q6Match = econMatches.find((m) => m.scannedQuestion.index === 6);
    expect(q6Match?.status).toBe('no-match');
    expect(q6Match?.isApproved).toBe(false);

    // 2. Strict Course Isolation: Matching against Entrepreneurship bank yields 0 exact matches!
    const crossCourseMatches = matchAssignment(scanned, entBank);
    const crossExact = crossCourseMatches.filter((m) => m.status === 'exact-match');
    expect(crossExact.length).toBe(0);
  });

  it('populates ONLY student-approved fields and NEVER clicks or triggers the submit button', () => {
    document.body.innerHTML = econHtml;
    const scanned = adapter.scanQuestions(document);

    const econBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/economics-sample.json'), 'utf-8')
    );
    const econMatches = matchAssignment(scanned, econBankRaw.questions);

    // Student approves only Q1 (Shifts to the right) and Q5 (Opportunity cost)
    const approvedTargets: PopulationTarget[] = [
      {
        questionId: econMatches[0].scannedQuestion.id,
        questionText: econMatches[0].scannedQuestion.questionText,
        questionType: econMatches[0].scannedQuestion.questionType,
        selectedAnswers: econMatches[0].proposedAnswers,
        options: econMatches[0].scannedQuestion.options,
      },
      {
        questionId: econMatches[4].scannedQuestion.id,
        questionText: econMatches[4].scannedQuestion.questionText,
        questionType: econMatches[4].scannedQuestion.questionType,
        selectedAnswers: econMatches[4].proposedAnswers,
        options: econMatches[4].scannedQuestion.options,
      },
    ];

    // Execute population
    for (const target of approvedTargets) {
      const res = adapter.populateQuestion(document, target);
      expect(res.success).toBe(true);
    }

    // Verify Q1 radio is checked
    const q1RadioRight = document.querySelector<HTMLInputElement>('#q1_opt_c');
    expect(q1RadioRight?.checked).toBe(true);

    // Verify unapproved Q2 radio is NOT checked
    const q2Radios = document.querySelectorAll<HTMLInputElement>('input[name="q2_group"]:checked');
    expect(q2Radios.length).toBe(0);

    // Verify Q5 text is populated
    const q5Input = document.querySelector<HTMLInputElement>('#q5_text');
    expect(q5Input?.value).toBe('Opportunity cost');

    // CRITICAL REQUIREMENT: Final Submit button MUST NOT have been triggered
    const submitAlert = document.getElementById('submit-alert');
    expect(submitAlert?.style.display).not.toBe('block');
  });

  it('scans and populates Entrepreneurship assignment with minor course bank', () => {
    document.body.innerHTML = entHtml;
    const scanned = adapter.scanQuestions(document);
    expect(scanned.length).toBe(5);

    const entBankRaw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../src/sample-data/entrepreneurship-sample.json'), 'utf-8')
    );
    const matches = matchAssignment(scanned, entBankRaw.questions);
    const exact = matches.filter((m) => m.status === 'exact-match');
    expect(exact.length).toBe(5);

    // Populate all approved
    for (const match of exact) {
      const target: PopulationTarget = {
        questionId: match.scannedQuestion.id,
        questionText: match.scannedQuestion.questionText,
        questionType: match.scannedQuestion.questionType,
        selectedAnswers: match.proposedAnswers,
        options: match.scannedQuestion.options,
      };
      const res = adapter.populateQuestion(document, target);
      expect(res.success).toBe(true);
    }

    // Verify burn rate radio checked
    const burnRadio = document.querySelector<HTMLInputElement>('#ent_q2_b');
    expect(burnRadio?.checked).toBe(true);

    // Verify CAC populated
    const cacInput = document.querySelector<HTMLInputElement>('#ent_q5_text');
    expect(cacInput?.value).toBe('CAC');
  });

  it('triggers React controlled input event listeners with native value tracking', () => {
    document.body.innerHTML = `
      <div data-question-id="q-react">
        <div class="qt-question-text">Test React Controlled Input</div>
        <input type="text" id="react-input" value="" />
      </div>
    `;

    const input = document.getElementById('react-input') as HTMLInputElement;
    let reactState = '';
    let changeFired = false;
    let inputFired = false;

    input.addEventListener('input', (e) => {
      inputFired = true;
      reactState = (e.target as HTMLInputElement).value;
    });
    input.addEventListener('change', () => {
      changeFired = true;
    });

    const target: PopulationTarget = {
      questionId: 'q-react',
      questionText: 'Test React Controlled Input',
      questionType: 'short-text',
      selectedAnswers: ['Controlled Value 123'],
      options: [{ id: 'react-input', text: 'Short Text Input', inputSelector: '#react-input' }],
    };

    const res = adapter.populateQuestion(document, target);
    expect(res.success).toBe(true);
    expect(input.value).toBe('Controlled Value 123');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
    expect(reactState).toBe('Controlled Value 123');
  });

  it('reports failure accurately when targeted input control is disabled or missing', () => {
    document.body.innerHTML = `
      <div data-question-id="q-disabled">
        <div class="qt-question-text">Disabled Question</div>
        <input type="text" id="disabled-input" disabled value="" />
      </div>
    `;

    const target: PopulationTarget = {
      questionId: 'q-disabled',
      questionText: 'Disabled Question',
      questionType: 'short-text',
      selectedAnswers: ['Attempted Value'],
      options: [{ id: 'disabled-input', text: 'Short Text Input', inputSelector: '#disabled-input' }],
    };

    const res = adapter.populateQuestion(document, target);
    expect(res.success).toBe(false);
    expect(res.message).toContain('disabled');
  });

  it('proves submit event listener is never invoked even with active form submission buttons', () => {
    document.body.innerHTML = econHtml;
    const form = document.getElementById('assignment-form') as HTMLFormElement;
    let formSubmitCount = 0;
    form.addEventListener('submit', () => {
      formSubmitCount++;
    });

    const submitBtn = document.getElementById('final-submit-btn') as HTMLButtonElement;
    let buttonClickCount = 0;
    submitBtn.addEventListener('click', () => {
      buttonClickCount++;
    });

    // Run scan
    const scanned = adapter.scanQuestions(document);
    expect(scanned.length).toBeGreaterThan(0);

    // Run populate
    const target: PopulationTarget = {
      questionId: scanned[0].id,
      questionText: scanned[0].questionText,
      questionType: scanned[0].questionType,
      selectedAnswers: [scanned[0].options[0].text],
      options: scanned[0].options,
    };
    adapter.populateQuestion(document, target);

    // Both listeners must have strictly 0 invocations
    expect(formSubmitCount).toBe(0);
    expect(buttonClickCount).toBe(0);
  });
});
