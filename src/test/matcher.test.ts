import { describe, it, expect } from 'vitest';
import { matchQuestion, findMatchingScannedOption } from '@/lib/matching/matcher';
import { QuestionRecord, ScannedQuestion } from '@/types';

describe('Layered Question Matching Engine', () => {
  const sampleBank: QuestionRecord[] = [
    {
      id: 'rec-1',
      courseId: 'course-econ-101',
      questionText: '1. What happens to demand when price decreases for a normal good?',
      questionType: 'single-choice',
      options: ['Demand decreases', 'Demand increases', 'Demand stays unchanged', 'Price elasticity drops'],
      correctOptions: ['Demand increases'],
      reviewStatus: 'verified',
      source: 'Economics Assignment 1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'rec-2',
      courseId: 'course-econ-101',
      questionText: 'Which curve represents the trade-off between inflation and unemployment?',
      questionType: 'single-choice',
      options: ['Laffer Curve', 'Phillips Curve', 'Lorenz Curve', 'Engel Curve'],
      correctOptions: ['Phillips Curve'],
      reviewStatus: 'verified',
      source: 'Economics Assignment 2',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'rec-3',
      courseId: 'course-ent-201',
      questionText: 'What is a Minimum Viable Product (MVP)?',
      questionType: 'single-choice',
      options: ['A final commercial product', 'A version with just enough features to validate assumptions', 'A theoretical pitch deck'],
      correctOptions: ['A version with just enough features to validate assumptions'],
      reviewStatus: 'verified',
      source: 'Entrepreneurship Assignment 1',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'rec-4',
      courseId: 'course-econ-101',
      questionText: 'If marginal cost is 25 and marginal revenue is 40, what should a competitive firm do?',
      questionType: 'single-choice',
      options: ['Increase output', 'Decrease output', 'Shut down immediately'],
      correctOptions: ['Increase output'],
      reviewStatus: 'verified',
      source: 'Economics Midterm',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  it('matches exact question even when option order is shuffled', () => {
    // Scanned question has different option ordering:
    // in bank: ['Demand decreases', 'Demand increases', 'Demand stays unchanged', 'Price elasticity drops']
    // on page: option C is "Demand increases"
    const scanned: ScannedQuestion = {
      id: 'q-page-1',
      index: 1,
      questionText: 'What happens to demand when price decreases for a normal good?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'opt-a', text: 'Demand stays unchanged' },
        { id: 'opt-b', text: 'Demand decreases' },
        { id: 'opt-c', text: 'Demand increases' },
        { id: 'opt-d', text: 'Price elasticity drops' },
      ],
    };

    const econBank = sampleBank.filter((r) => r.courseId === 'course-econ-101');
    const result = matchQuestion(scanned, econBank);

    expect(result.status).toBe('exact-match');
    expect(result.confidence).toBe(1.0);
    expect(result.proposedAnswers).toEqual(['Demand increases']);
    expect(result.isApproved).toBe(true);
    expect(result.requiresReview).toBe(false);
  });

  it('flags ambiguous match when saved option no longer appears in current options', () => {
    const scanned: ScannedQuestion = {
      id: 'q-page-2',
      index: 2,
      questionText: 'Which curve represents the trade-off between inflation and unemployment?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'opt-1', text: 'Laffer Curve' },
        { id: 'opt-2', text: 'Lorenz Curve' },
        { id: 'opt-3', text: 'Indifference Curve' }, // "Phillips Curve" is missing!
      ],
    };

    const econBank = sampleBank.filter((r) => r.courseId === 'course-econ-101');
    const result = matchQuestion(scanned, econBank);

    expect(result.status).toBe('ambiguous-match');
    expect(result.reasons[0]).toContain('does not appear among the current visible options');
    expect(result.isApproved).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it('flags ambiguous match when numbers differ materially', () => {
    const scanned: ScannedQuestion = {
      id: 'q-page-3',
      index: 3,
      // Note marginal cost is 60 instead of 25!
      questionText: 'If marginal cost is 60 and marginal revenue is 40, what should a competitive firm do?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'opt-1', text: 'Increase output' },
        { id: 'opt-2', text: 'Decrease output' },
        { id: 'opt-3', text: 'Shut down immediately' },
      ],
    };

    const econBank = sampleBank.filter((r) => r.courseId === 'course-econ-101');
    const result = matchQuestion(scanned, econBank);

    expect(result.status).toBe('ambiguous-match');
    expect(result.reasons.some((r) => r.includes('Numerical discrepancy'))).toBe(true);
    expect(result.isApproved).toBe(false);
  });

  it('maintains strict course isolation: Economics bank never matches Entrepreneurship question', () => {
    const scannedEnt: ScannedQuestion = {
      id: 'q-ent-1',
      index: 1,
      questionText: 'What is a Minimum Viable Product (MVP)?',
      questionType: 'single-choice',
      formType: 'radio',
      options: [
        { id: 'o-1', text: 'A final commercial product' },
        { id: 'o-2', text: 'A version with just enough features to validate assumptions' },
      ],
    };

    // Attempt to match against Economics bank only
    const econBank = sampleBank.filter((r) => r.courseId === 'course-econ-101');
    const result = matchQuestion(scannedEnt, econBank);

    expect(result.status).toBe('no-match');
    expect(result.proposedAnswers).toEqual([]);

    // When matched against Entrepreneurship bank:
    const entBank = sampleBank.filter((r) => r.courseId === 'course-ent-201');
    const entResult = matchQuestion(scannedEnt, entBank);
    expect(entResult.status).toBe('exact-match');
    expect(entResult.proposedAnswers).toEqual([
      'A version with just enough features to validate assumptions',
    ]);
  });

  it('detects unsupported question form types safely', () => {
    const scannedUnsupported: ScannedQuestion = {
      id: 'q-unsupported',
      index: 99,
      questionText: 'Drag and drop the economic phases into chronological order',
      questionType: 'single-choice',
      formType: 'unknown',
      options: [],
    };

    const result = matchQuestion(scannedUnsupported, sampleBank);
    expect(result.status).toBe('unsupported-type');
    expect(result.isApproved).toBe(false);
  });

  it('finds matching scanned option with normalized whitespace and case', () => {
    const opts = [
      { id: '1', text: ' (A)   Fiscal Stimulus  ' },
      { id: '2', text: ' (B) Monetary Policy ' },
    ];
    const match = findMatchingScannedOption('fiscal stimulus', opts);
    expect(match).toBeDefined();
    expect(match?.id).toBe('1');
  });
});
