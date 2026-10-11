/**
 * Text normalization & critical token extraction for SWAYAM questions
 */

// Regex for leading question numbers e.g. "1.", "Q1:", "Question 2)", "Q.3:"
const QUESTION_NUMBER_REGEX = /^(?:question\s*\d+|q\s*\.?\s*\d+|\d+)\s*[:.)-]\s*/i;

// Critical negation words that invert meaning
export const NEGATION_WORDS = new Set([
  'not',
  'never',
  'except',
  'neither',
  'nor',
  'no',
  'untrue',
  'false',
  'incorrect',
  'cannot',
  'cant',
  'non',
  'without',
]);

/**
 * Normalizes question text for robust deterministic comparison:
 * - Strips leading question index labels
 * - Standardizes quotes, dashes, whitespace
 * - Keeps numerical values, math operators, percentages
 */
export function normalizeQuestionText(raw: string): string {
  if (!raw) return '';

  let text = raw.trim();

  // Strip leading question labels like "Q1. ", "Question 4: ", "5) "
  text = text.replace(QUESTION_NUMBER_REGEX, '');

  // Normalize quotes and dashes
  text = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');

  // Lowercase
  text = text.toLowerCase();

  // Normalize fill-in-the-blank underscores and dashes e.g. "________" -> "_"
  text = text.replace(/_{2,}/g, '_').replace(/-{2,}/g, '-');

  // Collapse all whitespace (tabs, newlines, multi-spaces)
  text = text.replace(/\s+/g, ' ');

  // Strip trailing punctuation like '?', '.', ':' before or after trailing quotes
  text = text.replace(/[?:.]+(["']?)$/, '$1');
  text = text.replace(/["']$/, '');
  text = text.replace(/^["']/, '');
  text = text.replace(/[?:.]+$/, '');

  return text.trim();
}

/**
 * Normalizes option strings for choice matching
 */
export function normalizeOptionText(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // Strip leading option letters e.g. "(a) ", "A. ", "1) "
  text = text.replace(/^(\([a-z0-9]+\)|[a-z0-9]+[.)])\s*/i, '');

  text = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/_{2,}/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  text = text.replace(/[?:.]+(["']?)$/, '$1');
  text = text.replace(/["']$/, '');
  text = text.replace(/^["']/, '');
  text = text.replace(/[?:.]+$/, '');

  return text.trim();
}

/**
 * Extracts numerical tokens including decimals, negatives, and percentages
 */
export function extractNumbers(text: string): string[] {
  // Strip leading question index before extracting numbers so question number isn't mistaken for math
  const clean = text.replace(QUESTION_NUMBER_REGEX, '');
  const matches = clean.match(/-?\b\d+(?:\.\d+)?%?/g);
  return matches ? matches.map((m) => m.trim()) : [];
}

/**
 * Extracts negation tokens from text
 */
export function extractNegations(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return words.filter((w) => NEGATION_WORDS.has(w));
}

/**
 * Detects if two texts have critical semantic conflicts (numbers or negations)
 */
export function detectCriticalTokenConflict(
  textA: string,
  textB: string
): { hasConflict: boolean; reason?: string } {
  // 1. Check numbers
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);
  if (numsA.length > 0 || numsB.length > 0) {
    const sortedA = [...numsA].sort().join(',');
    const sortedB = [...numsB].sort().join(',');
    if (sortedA !== sortedB) {
      return {
        hasConflict: true,
        reason: `Numerical discrepancy detected: [${numsA.join(', ')}] vs [${numsB.join(', ')}]`,
      };
    }
  }

  // 2. Check negations
  const negA = extractNegations(textA);
  const negB = extractNegations(textB);
  if (negA.length !== negB.length || negA.some((n) => !negB.includes(n))) {
    return {
      hasConflict: true,
      reason: `Negation difference detected: '${negA.join(', ')}' vs '${negB.join(', ')}'`,
    };
  }

  return { hasConflict: false };
}

/**
 * Deterministic Token-based Jaccard similarity and Sorensen-Dice coefficient
 */
export function calculateTextSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection++;
    }
  }

  // Jaccard index
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Bigram character Sorensen-Dice for finer typo tolerance
  const getBigrams = (str: string): Set<string> => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.substring(i, i + 2));
    }
    return s;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  let bgOverlap = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) bgOverlap++;
  }
  const dice = bgA.size + bgB.size === 0 ? 0 : (2 * bgOverlap) / (bgA.size + bgB.size);

  // Return weighted conservative score
  return 0.6 * jaccard + 0.4 * dice;
}

/**
 * Splits text into lowercased alphanumeric tokens
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}
