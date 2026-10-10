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
});
