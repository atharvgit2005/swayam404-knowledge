import { describe, it, expect } from 'vitest';
import {
  normalizeQuestionText,
  normalizeOptionText,
  extractNumbers,
  extractNegations,
  detectCriticalTokenConflict,
  calculateTextSimilarity,
} from '@/lib/matching/normalizer';

describe('Text Normalizer Module', () => {
  it('strips leading question numbers and labels', () => {
    expect(normalizeQuestionText('1. What is fiscal policy?')).toBe('what is fiscal policy');
    expect(normalizeQuestionText('Q.1: What is fiscal policy?')).toBe('what is fiscal policy');
    expect(normalizeQuestionText('Question 12 - What is fiscal policy?')).toBe('what is fiscal policy');
    expect(normalizeQuestionText('4) What is fiscal policy?')).toBe('what is fiscal policy');
  });

  it('normalizes curly quotes, unicode spaces, and dashes', () => {
    const raw = '“What is John’s law—in economics?”';
    expect(normalizeQuestionText(raw)).toBe("what is john's law-in economics");
  });

  it('preserves mathematical equations and numerical values', () => {
    const raw = 'If GDP grows by 5.5% and inflation is 2.1%, what is real growth?';
    const norm = normalizeQuestionText(raw);
    expect(norm).toContain('5.5%');
    expect(norm).toContain('2.1%');
  });

  it('normalizes choice option text stripping index markers', () => {
    expect(normalizeOptionText('(a) Fiscal stimulus')).toBe('fiscal stimulus');
    expect(normalizeOptionText('B. Monetary easing')).toBe('monetary easing');
    expect(normalizeOptionText('3) Supply-side economics.')).toBe('supply-side economics');
  });

  it('extracts numbers accurately', () => {
    const text = 'A firm produces 500 units at $12.50 with a 15% margin.';
    expect(extractNumbers(text)).toEqual(['500', '12.50', '15%']);
  });

  it('extracts negation tokens', () => {
    const text = 'Which of the following is NOT an example of a public good and cannot be excluded?';
    expect(extractNegations(text)).toEqual(['not', 'cannot']);
  });

  it('detects critical token conflict when numbers change', () => {
    const q1 = 'What is the inflation rate if CPI rises by 10% in a year?';
    const q2 = 'What is the inflation rate if CPI rises by 20% in a year?';
    const conflict = detectCriticalTokenConflict(q1, q2);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.reason).toContain('Numerical discrepancy');
  });

  it('detects critical token conflict when negation changes', () => {
    const q1 = 'Which of the following is an example of monopolistic competition?';
    const q2 = 'Which of the following is NOT an example of monopolistic competition?';
    const conflict = detectCriticalTokenConflict(q1, q2);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.reason).toContain('Negation difference');
  });

  it('calculates deterministic text similarity', () => {
    const simSame = calculateTextSimilarity('what is market equilibrium', 'what is market equilibrium');
    expect(simSame).toBe(1.0);

    const simHigh = calculateTextSimilarity('what is market equilibrium price', 'what is market equilibrium rate');
    expect(simHigh).toBeGreaterThan(0.7);

    const simLow = calculateTextSimilarity('what is market equilibrium', 'how does photosynthesis operate in plants');
    expect(simLow).toBeLessThan(0.2);
  });
});
