import { describe, it, expect } from 'vitest';
import { HashMapIndex, fnv1aHash } from '@/lib/retrieval/hashMapIndex';
import { KnowledgeGraph, extractConcepts } from '@/lib/retrieval/knowledgeGraph';
import { DpSequenceMatcher } from '@/lib/retrieval/dpEngine';
import { GraphRetrievalEngine } from '@/lib/retrieval';
import { QuestionRecord, CourseMaterial } from '@/types';

describe('HashMapIndex (O(1) Exact & Inverted Index)', () => {
  const sampleQuestions: QuestionRecord[] = [
    {
      id: 'q-econ-1',
      courseId: 'course-econ-101',
      questionText: 'Which curve represents the total demand in a market?',
      questionType: 'single-choice',
      options: ['Market Demand Curve', 'Marginal Cost Curve'],
      acceptedAnswers: ['Market Demand Curve'],
      reviewStatus: 'verified',
      source: 'Economics 101',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'q-ent-1',
      courseId: 'course-ent-201',
      questionText: 'An agent who handles an entrepreneur accounts receivable for a fee is a:',
      questionType: 'single-choice',
      options: ['Factor', 'Accountant'],
      acceptedAnswers: ['Factor'],
      reviewStatus: 'verified',
      source: 'Entrepreneurship 201',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  it('computes deterministic FNV-1a 32-bit hash codes', () => {
    const h1 = fnv1aHash('market demand curve');
    const h2 = fnv1aHash('market demand curve');
    const h3 = fnv1aHash('marginal cost curve');

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(typeof h1).toBe('number');
  });

  it('performs O(1) exact question retrieval', () => {
    const index = new HashMapIndex(sampleQuestions);
    const matches = index.getExactMatch('which curve represents the total demand in a market');
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe('q-econ-1');
  });

  it('filters candidates via token inverted index', () => {
    const index = new HashMapIndex(sampleQuestions);
    const candidates = index.getCandidatesByTokens(['accounts', 'receivable', 'fee']);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].question.id).toBe('q-ent-1');
  });

  it('retrieves questions by option text', () => {
    const index = new HashMapIndex(sampleQuestions);
    const questions = index.getQuestionsWithOption('factor');
    expect(questions.length).toBe(1);
    expect(questions[0].id).toBe('q-ent-1');
  });
});

describe('KnowledgeGraph (Concept Extraction & Multi-Hop Pathfinding)', () => {
  const questions: QuestionRecord[] = [
    {
      id: 'q-ent-factor',
      courseId: 'course-ent-201',
      questionText: 'An agent who handles an entrepreneur accounts receivable for a fee is a factor.',
      questionType: 'single-choice',
      options: ['Factor', 'Accountant'],
      acceptedAnswers: ['Factor'],
      reviewStatus: 'verified',
      source: 'Entrepreneurship 201',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const materials: CourseMaterial[] = [
    {
      id: 'mat-fin-1',
      courseId: 'course-ent-201',
      title: 'Financial Considerations in Entrepreneurship',
      unitTitle: 'Week 5',
      type: 'notes',
      content:
        'Factoring involves selling accounts receivable to a factor. The factor advances cash against outstanding customer invoices.',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  it('extracts unigram and bigram concepts excluding stop words', () => {
    const concepts = extractConcepts('Accounts receivable management for venture financing');
    expect(concepts).toContain('accounts');
    expect(concepts).toContain('receivable');
    expect(concepts).toContain('accounts receivable');
    expect(concepts).toContain('venture');
    expect(concepts).toContain('financing');
    expect(concepts).not.toContain('for');
  });

  it('builds knowledge graph linking questions, answers, options, and lecture concepts', () => {
    const kg = new KnowledgeGraph(questions, materials);
    expect(kg.getNodeCount()).toBeGreaterThan(5);
    expect(kg.getEdgeCount()).toBeGreaterThan(5);
  });

  it('traverses multi-hop paths from question concepts to verified answer nodes', () => {
    const kg = new KnowledgeGraph(questions, materials);
    const evidence = kg.findAnswerEvidence(
      'An agent who handles accounts receivable for a fee',
      ['Factor', 'Accountant', 'Advisor'],
      'course-ent-201'
    );

    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].answerText).toBe('Factor');
    expect(evidence[0].confidenceScore).toBeGreaterThan(0.5);
    expect(evidence[0].pathTraces.some((t) => t.includes('accounts receivable') || t.includes('accounts'))).toBe(true);
  });
});

describe('DpSequenceMatcher (Dynamic Programming Algorithms)', () => {
  const dp = new DpSequenceMatcher();

  it('Wagner-Fischer computes exact and edit distance DP matrix with rolling arrays', () => {
    // Identical
    expect(dp.wagnerFischer('hello world', 'hello world')).toBe(1.0);

    // 1 substitution in 5 chars -> 1 - 1/5 = 0.8
    const sim = dp.wagnerFischer('cat', 'bat');
    expect(sim).toBeCloseTo(0.67, 1);

    // Empty string edge cases
    expect(dp.wagnerFischer('', '')).toBe(1.0);
    expect(dp.wagnerFischer('abc', '')).toBe(0.0);
  });

  it('Smith-Waterman performs local alignment identifying embedded sub-clauses', () => {
    const query = 'Which curve represents market demand?';
    const longPreamble =
      'According to Professor Sharma in Chapter 4, which curve represents market demand in microeconomics?';

    const localAlign = dp.smithWaterman(query, longPreamble);
    expect(localAlign.normalizedScore).toBeGreaterThan(0.7);
    expect(localAlign.maxAlignmentLength).toBeGreaterThan(25);
  });

  it('token LCS computes word-order sequence preservation', () => {
    const t1 = ['market', 'demand', 'curve', 'analysis'];
    const t2 = ['market', 'demand', 'curve'];
    const lcsScore = dp.tokenLcs(t1, t2);
    expect(lcsScore).toBe(0.75); // 3 / 4
  });

  it('composite DP alignment merges Wagner-Fischer, Smith-Waterman, and token LCS', () => {
    const res = dp.align(
      'An agent who handles accounts receivable for a fee',
      'An agent who handles an entrepreneur accounts receivable for a fee'
    );
    expect(res.compositeDpScore).toBeGreaterThan(0.75);
    expect(res.smithWatermanScore).toBeGreaterThan(0.80);
  });
});

describe('GraphRetrievalEngine (Unified Pipeline)', () => {
  const questions: QuestionRecord[] = [
    {
      id: 'q-factor',
      courseId: 'course-ent-201',
      questionText: 'An agent who handles an entrepreneur accounts receivable for a fee:',
      questionType: 'single-choice',
      options: ['Factor', 'Accountant', 'Resource intermediary', 'Advisor'],
      acceptedAnswers: ['Factor'],
      reviewStatus: 'verified',
      source: 'Entrepreneurship 201',
      explanation: 'A factor buys accounts receivable at a discount to provide immediate liquidity.',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const materials: CourseMaterial[] = [
    {
      id: 'mat-5',
      courseId: 'course-ent-201',
      title: 'Week 5: Financial Consideration in Entrepreneurship',
      unitTitle: 'Week 5',
      type: 'notes',
      content:
        'Factoring is a financial transaction where an entrepreneur sells accounts receivable to a third party called a factor for immediate cash.',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const engine = new GraphRetrievalEngine(questions, materials);

  it('retrieves instant exact match via Hash Map in O(1)', () => {
    const res = engine.retrieveAnswersForQuestion(
      'An agent who handles an entrepreneur accounts receivable for a fee:',
      ['Factor', 'Accountant', 'Resource intermediary', 'Advisor'],
      'course-ent-201'
    );

    expect(res.matchType).toBe('exact-hash');
    expect(res.confidence).toBe(1.0);
    expect(res.recommendedAnswers).toEqual(['Factor']);
  });

  it('retrieves rephrased question via Dynamic Programming sequence alignment', () => {
    const rephrased =
      'According to Week 5 notes, an agent who handles an entrepreneur accounts receivable for a fee is known as:';

    const res = engine.retrieveAnswersForQuestion(
      rephrased,
      ['Factor', 'Accountant', 'Resource intermediary', 'Advisor'],
      'course-ent-201'
    );

    expect(res.recommendedAnswers).toEqual(['Factor']);
    expect(res.confidence).toBeGreaterThan(0.7);
    expect(['exact-hash', 'dp-sequence-match', 'graph-concept-inferred']).toContain(res.matchType);
  });

  it('retrieves relevant lecture excerpts using DP local alignment ranking', () => {
    const excerpts = engine.retrieveExcerpts(
      'accounts receivable factoring cash discount',
      'course-ent-201',
      2
    );

    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts[0].materialTitle).toContain('Financial Consideration');
    expect(excerpts[0].relevanceScore).toBeGreaterThan(0.2);
  });
});
