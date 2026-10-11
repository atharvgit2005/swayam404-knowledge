import { QuestionRecord, CourseMaterial } from '@/types';
import { HashMapIndex, CandidateQuestionMatch } from './hashMapIndex';
import { KnowledgeGraph, GraphAnswerEvidence } from './knowledgeGraph';
import { DpSequenceMatcher, DpAlignmentResult, dpSequenceMatcher } from './dpEngine';
import { normalizeQuestionText, tokenize } from '@/lib/matching/normalizer';
import { RetrievedExcerpt } from '@/lib/context/retrievalService';

export * from './hashMapIndex';
export * from './knowledgeGraph';
export * from './dpEngine';
export * from './chunkIndex';


export interface GraphRetrievalResult {
  matchType: 'exact-hash' | 'dp-sequence-match' | 'graph-concept-inferred' | 'none';
  confidence: number;
  recommendedAnswers: string[];
  explanation: string;
  evidenceSnippet?: string;
  graphPathTraces?: string[];
  matchedQuestionId?: string;
  dpScores?: DpAlignmentResult;
}

function getQuestionAcceptedAnswers(q: QuestionRecord): string[] {
  if (q.acceptedAnswers && q.acceptedAnswers.length > 0) return q.acceptedAnswers;
  if (q.correctOptions && q.correctOptions.length > 0) return q.correctOptions;
  if (q.answerText) return [q.answerText];
  return [];
}

/**
 * Unified Graph Retrieval Engine:
 * Combines Hash Map O(1) indexing, Knowledge Graph multi-hop pathfinding,
 * and Dynamic Programming sequence alignment (Wagner-Fischer + Smith-Waterman).
 */
export class GraphRetrievalEngine {
  private hashMap: HashMapIndex;
  private graph: KnowledgeGraph;
  private dp: DpSequenceMatcher;

  constructor(
    questions: QuestionRecord[] = [],
    materials: CourseMaterial[] = []
  ) {
    this.hashMap = new HashMapIndex(questions, materials);
    this.graph = new KnowledgeGraph(questions, materials);
    this.dp = dpSequenceMatcher;
  }

  rebuild(questions: QuestionRecord[], materials: CourseMaterial[]): void {
    this.hashMap.rebuild(questions, materials);
    this.graph.buildGraph(questions, materials);
    this.dp.clearCache();
  }

  /**
   * Find answers using Hash Map, Knowledge Graph, and Dynamic Programming.
   */
  retrieveAnswersForQuestion(
    questionText: string,
    options: string[] = [],
    courseId?: string
  ): GraphRetrievalResult {
    const normQuery = normalizeQuestionText(questionText);

    // 1. O(1) Exact Hash Map Lookup
    const exactMatches = this.hashMap.getExactMatch(normQuery);
    const validExact = courseId
      ? exactMatches.filter((q) => q.courseId === courseId)
      : exactMatches;

    if (validExact.length > 0) {
      const best = validExact[0];
      const accepted = getQuestionAcceptedAnswers(best);
      if (accepted.length > 0) {
        return {
          matchType: 'exact-hash',
          confidence: 1.0,
          recommendedAnswers: accepted,
          explanation: `Instant O(1) exact hash match found in answer bank (Question: "${best.questionText.slice(0, 60)}...").`,
          evidenceSnippet: best.explanation || 'Verified stored answer record.',
          matchedQuestionId: best.id,
        };
      }
    }

    // 2. Query Inverted Index for candidates
    const tokens = tokenize(questionText);
    const candidates: CandidateQuestionMatch[] = this.hashMap.getCandidatesByTokens(
      tokens,
      8,
      courseId
    );

    // 3. Dynamic Programming Sequence Alignment across candidates
    let bestDpCandidate: {
      question: QuestionRecord;
      dp: DpAlignmentResult;
    } | null = null;

    for (const c of candidates) {
      const dpRes = this.dp.align(questionText, c.question.questionText);
      if (!bestDpCandidate || dpRes.compositeDpScore > bestDpCandidate.dp.compositeDpScore) {
        bestDpCandidate = { question: c.question, dp: dpRes };
      }
    }

    // 4. Knowledge Graph Multi-Hop Traversal
    const graphEvidences: GraphAnswerEvidence[] = this.graph.findAnswerEvidence(
      questionText,
      options,
      courseId
    );
    const topGraphEvidence = graphEvidences[0];

    // 5. Synthesis: Decide best recommendation
    const candAccepted = bestDpCandidate ? getQuestionAcceptedAnswers(bestDpCandidate.question) : [];

    // Case A: High DP score (e.g. >= 0.75 composite)
    if (
      bestDpCandidate &&
      bestDpCandidate.dp.compositeDpScore >= 0.75 &&
      candAccepted.length > 0
    ) {
      return {
        matchType: 'dp-sequence-match',
        confidence: bestDpCandidate.dp.compositeDpScore,
        recommendedAnswers: candAccepted,
        explanation: `Dynamic programming sequence alignment (Wagner-Fischer: ${Math.round(
          bestDpCandidate.dp.wagnerFischerScore * 100
        )}%, Smith-Waterman local: ${Math.round(
          bestDpCandidate.dp.smithWatermanScore * 100
        )}%) matched historical question.`,
        evidenceSnippet: bestDpCandidate.question.explanation || undefined,
        matchedQuestionId: bestDpCandidate.question.id,
        dpScores: bestDpCandidate.dp,
        graphPathTraces: topGraphEvidence ? topGraphEvidence.pathTraces : undefined,
      };
    }

    // Case B: Strong Knowledge Graph path evidence (>= 0.65)
    if (topGraphEvidence && topGraphEvidence.confidenceScore >= 0.65) {
      return {
        matchType: 'graph-concept-inferred',
        confidence: topGraphEvidence.confidenceScore,
        recommendedAnswers: [topGraphEvidence.answerText],
        explanation: topGraphEvidence.explanation,
        evidenceSnippet: topGraphEvidence.pathTraces.join(' -> '),
        graphPathTraces: topGraphEvidence.pathTraces,
        matchedQuestionId: topGraphEvidence.sourceQuestionId,
        dpScores: bestDpCandidate ? bestDpCandidate.dp : undefined,
      };
    }

    // Case C: Moderate DP or Graph match
    if (
      bestDpCandidate &&
      bestDpCandidate.dp.compositeDpScore >= 0.55 &&
      candAccepted.length > 0
    ) {
      return {
        matchType: 'dp-sequence-match',
        confidence: bestDpCandidate.dp.compositeDpScore,
        recommendedAnswers: candAccepted,
        explanation: `Moderate DP alignment (${Math.round(
          bestDpCandidate.dp.compositeDpScore * 100
        )}% similarity). Review recommended before populating.`,
        evidenceSnippet: bestDpCandidate.question.explanation || undefined,
        matchedQuestionId: bestDpCandidate.question.id,
        dpScores: bestDpCandidate.dp,
        graphPathTraces: topGraphEvidence ? topGraphEvidence.pathTraces : undefined,
      };
    }

    // No strong deterministic retrieval match found
    return {
      matchType: 'none',
      confidence: 0,
      recommendedAnswers: [],
      explanation: 'No direct or high-confidence graph/DP matches in local answer bank.',
    };
  }

  /**
   * Retrieve relevant lecture excerpts using Graph & DP ranking.
   */
  retrieveExcerpts(
    questionText: string,
    courseId: string,
    maxExcerpts = 3
  ): RetrievedExcerpt[] {
    const materials = this.hashMap.getCourseMaterials(courseId);
    if (materials.length === 0) return [];

    const excerpts: RetrievedExcerpt[] = [];
    const qTokens = tokenize(questionText);

    for (const mat of materials) {
      // Split material content into paragraphs
      const paragraphs = mat.content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);

      for (const p of paragraphs) {
        // Run Smith-Waterman local alignment score + token overlap
        const sw = this.dp.smithWaterman(questionText.slice(0, 150), p.slice(0, 200));
        const pTokens = tokenize(p);
        const lcs = this.dp.tokenLcs(qTokens, pTokens);

        const score = 0.5 * sw.normalizedScore + 0.5 * lcs;
        if (score > 0.15) {
          excerpts.push({
            materialId: mat.id,
            resourceId: mat.id,
            materialTitle: mat.title,
            title: mat.title,
            unitTitle: mat.unitTitle,
            courseId: mat.courseId,
            resourceType: mat.type,
            sourceTitle: mat.title,
            retrievalSource: 'local-course-material',
            license: 'Course Material (Local)',
            excerpt: p,
            snippet: p.length > 350 ? `${p.slice(0, 350)}...` : p,
            relevanceScore: Math.round(score * 100) / 100,
          });
        }
      }
    }

    return excerpts
      .sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        return (a.resourceId || a.materialId).localeCompare(b.resourceId || b.materialId);
      })
      .slice(0, maxExcerpts);
  }
}
