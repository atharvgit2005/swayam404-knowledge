import { QuestionRecord, CourseMaterial } from '@/types';
import { normalizeQuestionText, normalizeOptionText, tokenize } from '@/lib/matching/normalizer';

/**
 * FNV-1a 32-bit fast string hash function.
 * Generates an integer hash code in O(L) time.
 */
export function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

export interface CandidateQuestionMatch {
  question: QuestionRecord;
  tokenOverlapScore: number;
}

/**
 * Multi-Key Hash Map Index:
 * Provides O(1) direct lookups for exact question text,
 * token inverted index for sub-linear candidate filtering,
 * and concept-to-material mappings.
 */
export class HashMapIndex {
  // Direct O(1) normalized text -> QuestionRecord[]
  private questionTextMap = new Map<string, QuestionRecord[]>();

  // 32-bit Hash code -> QuestionRecord[]
  private questionHashMap = new Map<number, QuestionRecord[]>();

  // Token -> Set of question IDs (Inverted Index)
  private tokenInvertedIndex = new Map<string, Set<string>>();

  // Option text -> Set of question IDs
  private optionInvertedIndex = new Map<string, Set<string>>();

  // Concept -> Set of question IDs
  private conceptQuestionIndex = new Map<string, Set<string>>();

  // CourseId -> UnitId/Title -> CourseMaterial[]
  private materialCourseMap = new Map<string, CourseMaterial[]>();

  // Fast ID to Question lookup
  private questionById = new Map<string, QuestionRecord>();

  constructor(questions: QuestionRecord[] = [], materials: CourseMaterial[] = []) {
    this.rebuild(questions, materials);
  }

  rebuild(questions: QuestionRecord[], materials: CourseMaterial[]): void {
    this.clear();
    this.indexQuestions(questions);
    this.indexMaterials(materials);
  }

  clear(): void {
    this.questionTextMap.clear();
    this.questionHashMap.clear();
    this.tokenInvertedIndex.clear();
    this.optionInvertedIndex.clear();
    this.conceptQuestionIndex.clear();
    this.materialCourseMap.clear();
    this.questionById.clear();
  }

  indexQuestions(questions: QuestionRecord[]): void {
    for (const q of questions) {
      this.questionById.set(q.id, q);

      const normText = normalizeQuestionText(q.questionText);
      const hash = fnv1aHash(normText);

      // 1. Exact text hash map
      const existingText = this.questionTextMap.get(normText) || [];
      existingText.push(q);
      this.questionTextMap.set(normText, existingText);

      // 2. FNV-1a integer hash map
      const existingHash = this.questionHashMap.get(hash) || [];
      existingHash.push(q);
      this.questionHashMap.set(hash, existingHash);

      // 3. Token inverted index
      const tokens = tokenize(q.questionText);
      for (const tok of tokens) {
        if (tok.length > 2) {
          let set = this.tokenInvertedIndex.get(tok);
          if (!set) {
            set = new Set<string>();
            this.tokenInvertedIndex.set(tok, set);
          }
          set.add(q.id);
        }
      }

      // 4. Option inverted index
      for (const opt of q.options || []) {
        const optText = typeof opt === 'string' ? opt : (opt as { text: string }).text;
        const normOpt = normalizeOptionText(optText);
        let optSet = this.optionInvertedIndex.get(normOpt);
        if (!optSet) {
          optSet = new Set<string>();
          this.optionInvertedIndex.set(normOpt, optSet);
        }
        optSet.add(q.id);
      }

      // 5. Concept keywords extracted from accepted answers & explanation
      const accepted = q.acceptedAnswers || q.correctOptions || (q.answerText ? [q.answerText] : []);
      for (const ans of accepted) {
        const ansTokens = tokenize(ans);
        for (const tok of ansTokens) {
          if (tok.length > 3) {
            let conceptSet = this.conceptQuestionIndex.get(tok);
            if (!conceptSet) {
              conceptSet = new Set<string>();
              this.conceptQuestionIndex.set(tok, conceptSet);
            }
            conceptSet.add(q.id);
          }
        }
      }
    }
  }

  indexMaterials(materials: CourseMaterial[]): void {
    for (const mat of materials) {
      const list = this.materialCourseMap.get(mat.courseId) || [];
      list.push(mat);
      this.materialCourseMap.set(mat.courseId, list);
    }
  }

  /**
   * O(1) Instant exact match lookup by normalized text.
   */
  getExactMatch(normalizedText: string): QuestionRecord[] {
    return this.questionTextMap.get(normalizedText) || [];
  }

  /**
   * O(1) Instant lookup by FNV-1a hash code.
   */
  getByHash(hash: number): QuestionRecord[] {
    return this.questionHashMap.get(hash) || [];
  }

  /**
   * Fast Inverted Index query: returns top candidate questions matching given tokens,
   * ranked by token overlap score.
   */
  getCandidatesByTokens(
    tokens: string[],
    limit = 10,
    filterCourseId?: string
  ): CandidateQuestionMatch[] {
    const scoreMap = new Map<string, number>();

    for (const tok of tokens) {
      const qIds = this.tokenInvertedIndex.get(tok);
      if (qIds) {
        for (const id of qIds) {
          scoreMap.set(id, (scoreMap.get(id) || 0) + 1);
        }
      }
    }

    const results: CandidateQuestionMatch[] = [];
    for (const [id, score] of scoreMap.entries()) {
      const q = this.questionById.get(id);
      if (!q) continue;
      if (filterCourseId && q.courseId !== filterCourseId) continue;

      const totalTokens = Math.max(tokens.length, tokenize(q.questionText).length, 1);
      const overlapScore = score / totalTokens;
      results.push({ question: q, tokenOverlapScore: overlapScore });
    }

    return results
      .sort((a, b) => b.tokenOverlapScore - a.tokenOverlapScore)
      .slice(0, limit);
  }

  /**
   * Find questions that contain a specific option.
   */
  getQuestionsWithOption(normalizedOption: string): QuestionRecord[] {
    const ids = this.optionInvertedIndex.get(normalizedOption);
    if (!ids) return [];
    const list: QuestionRecord[] = [];
    for (const id of ids) {
      const q = this.questionById.get(id);
      if (q) list.push(q);
    }
    return list;
  }

  /**
   * Get materials for a course.
   */
  getCourseMaterials(courseId: string): CourseMaterial[] {
    return this.materialCourseMap.get(courseId) || [];
  }

  getQuestionById(id: string): QuestionRecord | undefined {
    return this.questionById.get(id);
  }
}
