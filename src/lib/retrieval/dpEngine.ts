import { tokenize } from '@/lib/matching/normalizer';

export interface DpAlignmentResult {
  wagnerFischerScore: number;
  smithWatermanScore: number;
  tokenLcsScore: number;
  compositeDpScore: number;
  bestLocalAlignmentLength: number;
}

/**
 * Dynamic Programming Sequence Alignment & Retrieval Engine:
 * Implements Wagner-Fischer global alignment, Smith-Waterman local alignment,
 * token LCS, and memoized path optimization.
 */
export class DpSequenceMatcher {
  private memoCache = new Map<string, DpAlignmentResult>();

  clearCache(): void {
    this.memoCache.clear();
  }

  /**
   * Wagner-Fischer 2D Matrix DP algorithm for global edit distance.
   * Time Complexity: O(M * N)
   * Space Complexity: O(min(M, N)) with rolling array optimization.
   */
  wagnerFischer(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    if (m === 0) return n === 0 ? 1 : 0;
    if (n === 0) return 0;
    if (s1 === s2) return 1.0;

    // Use rolling 1D arrays for O(min(M, N)) memory efficiency
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) {
      prev[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      const c1 = s1.charCodeAt(i - 1);

      for (let j = 1; j <= n; j++) {
        const c2 = s2.charCodeAt(j - 1);
        const cost = c1 === c2 ? 0 : 1;

        curr[j] = Math.min(
          prev[j] + 1,       // deletion
          curr[j - 1] + 1,   // insertion
          prev[j - 1] + cost // substitution
        );
      }

      // Swap rolling rows
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }

    const editDist = prev[n];
    const maxLen = Math.max(m, n);
    return Math.max(0, 1 - editDist / maxLen);
  }

  /**
   * Smith-Waterman 2D Matrix DP algorithm for local sequence alignment.
   * Accurately matches partial prompts, sub-clauses, and variations where
   * extraneous intro text was prepended or appended.
   *
   * Recurrence:
   *  H[i][j] = max(0, H[i-1][j-1] + score, H[i-1][j] - gap, H[i][j-1] - gap)
   */
  smithWaterman(
    s1: string,
    s2: string,
    matchScore = 2,
    mismatchPenalty = 1,
    gapPenalty = 1
  ): { score: number; normalizedScore: number; maxAlignmentLength: number } {
    const m = s1.length;
    const n = s2.length;
    if (m === 0 || n === 0) {
      return { score: 0, normalizedScore: 0, maxAlignmentLength: 0 };
    }

    // 2D DP Matrix H of size (m+1) x (n+1)
    const H: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    let maxScore = 0;
    let maxI = 0;
    let maxJ = 0;

    for (let i = 1; i <= m; i++) {
      const c1 = s1.charAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const c2 = s2.charAt(j - 1);
        const diagScore = c1 === c2 ? matchScore : -mismatchPenalty;

        const val = Math.max(
          0,
          H[i - 1][j - 1] + diagScore,
          H[i - 1][j] - gapPenalty,
          H[i][j - 1] - gapPenalty
        );

        H[i][j] = val;
        if (val > maxScore) {
          maxScore = val;
          maxI = i;
          maxJ = j;
        }
      }
    }

    // Traceback alignment length
    let currI = maxI;
    let currJ = maxJ;
    let length = 0;
    while (currI > 0 && currJ > 0 && H[currI][currJ] > 0) {
      length++;
      currI--;
      currJ--;
    }

    // Normalize against optimal theoretical alignment of shorter string
    const minLen = Math.min(m, n);
    const theoreticalMax = minLen * matchScore;
    const normalized = theoreticalMax > 0 ? Math.min(1.0, maxScore / theoreticalMax) : 0;

    return {
      score: maxScore,
      normalizedScore: Math.round(normalized * 100) / 100,
      maxAlignmentLength: length,
    };
  }

  /**
   * Longest Common Subsequence (LCS) DP on word token sequences.
   * Measures token order preservation.
   */
  tokenLcs(tokens1: string[], tokens2: string[]): number {
    const m = tokens1.length;
    const n = tokens2.length;
    if (m === 0 || n === 0) return 0;

    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      const t1 = tokens1[i - 1];
      for (let j = 1; j <= n; j++) {
        const t2 = tokens2[j - 1];
        if (t1 === t2) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }

    const lcsLen = prev[n];
    return lcsLen / Math.max(m, n);
  }

  /**
   * Composite DP Alignment:
   * Combines Wagner-Fischer, Smith-Waterman local alignment, and token LCS.
   * Utilizes memoization for fast repeated scoring.
   */
  align(s1: string, s2: string): DpAlignmentResult {
    const key = s1.length <= s2.length ? `${s1}:::${s2}` : `${s2}:::${s1}`;
    const cached = this.memoCache.get(key);
    if (cached) return cached;

    const wf = this.wagnerFischer(s1, s2);
    const sw = this.smithWaterman(s1, s2);
    const tokens1 = tokenize(s1);
    const tokens2 = tokenize(s2);
    const lcs = this.tokenLcs(tokens1, tokens2);

    // Weighted composite recurrence
    // 0.40 Smith-Waterman (local fit) + 0.35 Token LCS (word order) + 0.25 Wagner-Fischer (global edit)
    const composite = 0.4 * sw.normalizedScore + 0.35 * lcs + 0.25 * wf;

    const result: DpAlignmentResult = {
      wagnerFischerScore: Math.round(wf * 100) / 100,
      smithWatermanScore: sw.normalizedScore,
      tokenLcsScore: Math.round(lcs * 100) / 100,
      compositeDpScore: Math.round(composite * 100) / 100,
      bestLocalAlignmentLength: sw.maxAlignmentLength,
    };

    this.memoCache.set(key, result);
    return result;
  }
}

export const dpSequenceMatcher = new DpSequenceMatcher();
