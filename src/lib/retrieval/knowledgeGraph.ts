import { QuestionRecord, CourseMaterial } from '@/types';
import { normalizeOptionText } from '@/lib/matching/normalizer';

export type GraphNodeType = 'QUESTION' | 'OPTION' | 'ANSWER' | 'CONCEPT' | 'MATERIAL';
export type GraphEdgeType =
  | 'HAS_OPTION'
  | 'CORRECT_ANSWER'
  | 'EXPLAINS_CONCEPT'
  | 'BELONGS_TO_UNIT'
  | 'CO_OCCURS'
  | 'SIMILAR_TO';

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: GraphEdgeType;
  weight: number;
}

export interface GraphAnswerEvidence {
  answerText: string;
  confidenceScore: number;
  sourceQuestionId?: string;
  pathTraces: string[];
  explanation: string;
}

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'of', 'for', 'to',
  'with', 'as', 'by', 'that', 'this', 'from', 'be', 'are', 'was', 'were', 'what',
  'how', 'when', 'where', 'who', 'does', 'doing', 'it', 'its', 'into', 'than',
  'then', 'their', 'there', 'has', 'have', 'had', 'been', 'each', 'all', 'both',
  'either', 'neither', 'under', 'over', 'between', 'through', 'during', 'before', 'after',
]);

/**
 * Extracts key domain concepts and entity terms from text.
 */
export function extractConcepts(text: string): string[] {
  const words = text
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const concepts = new Set<string>();

  // Single word concepts
  for (const w of words) {
    if (w.length >= 3) {
      concepts.add(w);
    }
  }

  // 2-gram phrases (e.g. "accounts receivable", "venture capital", "balance sheet")
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      concepts.add(`${words[i]} ${words[i + 1]}`);
    }
  }

  return Array.from(concepts);
}

/**
 * Knowledge Graph representing relationships between questions, answers,
 * options, course materials, and domain concepts.
 */
export class KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private adjacency = new Map<string, GraphEdge[]>(); // sourceId -> edges
  private reverseAdjacency = new Map<string, GraphEdge[]>(); // targetId -> edges

  constructor(questions: QuestionRecord[] = [], materials: CourseMaterial[] = []) {
    this.buildGraph(questions, materials);
  }

  clear(): void {
    this.nodes.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
    if (!this.reverseAdjacency.has(node.id)) {
      this.reverseAdjacency.set(node.id, []);
    }
  }

  addEdge(edge: GraphEdge): void {
    const list = this.adjacency.get(edge.sourceId) || [];
    list.push(edge);
    this.adjacency.set(edge.sourceId, list);

    const revList = this.reverseAdjacency.get(edge.targetId) || [];
    revList.push(edge);
    this.reverseAdjacency.set(edge.targetId, revList);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  buildGraph(questions: QuestionRecord[], materials: CourseMaterial[]): void {
    this.clear();

    // 1. Index course materials and lecture notes
    for (const mat of materials) {
      const matNodeId = `mat-${mat.id}`;
      this.addNode({
        id: matNodeId,
        type: 'MATERIAL',
        label: mat.title,
        metadata: {
          unitTitle: mat.unitTitle,
          courseId: mat.courseId,
          content: mat.content,
        },
      });

      // Extract concepts from material
      const matConcepts = extractConcepts(`${mat.title} ${mat.unitTitle || ''} ${mat.content}`);
      for (const concept of matConcepts) {
        const conceptNodeId = `concept-${concept}`;
        if (!this.nodes.has(conceptNodeId)) {
          this.addNode({
            id: conceptNodeId,
            type: 'CONCEPT',
            label: concept,
          });
        }

        this.addEdge({
          sourceId: matNodeId,
          targetId: conceptNodeId,
          type: 'EXPLAINS_CONCEPT',
          weight: 1.8,
        });
      }
    }

    // 2. Index Questions, Options, Accepted Answers, and Concept linkages
    for (const q of questions) {
      const qNodeId = `q-${q.id}`;
      this.addNode({
        id: qNodeId,
        type: 'QUESTION',
        label: q.questionText,
        metadata: {
          courseId: q.courseId,
          type: q.questionType,
          reviewStatus: q.reviewStatus,
          acceptedAnswers: q.acceptedAnswers || q.correctOptions || (q.answerText ? [q.answerText] : []),
        },
      });

      // Add options
      for (const opt of q.options || []) {
        const optText = typeof opt === 'string' ? opt : (opt as { text: string }).text;
        const normOpt = normalizeOptionText(optText);
        const optNodeId = `opt-${q.id}-${normOpt}`;
        this.addNode({
          id: optNodeId,
          type: 'OPTION',
          label: optText,
          metadata: { isCorrect: typeof opt === 'string' ? false : (opt as { isCorrect?: boolean }).isCorrect },
        });

        this.addEdge({
          sourceId: qNodeId,
          targetId: optNodeId,
          type: 'HAS_OPTION',
          weight: 1.0,
        });
      }

      // Add accepted/verified answers
      const accepted = q.acceptedAnswers || q.correctOptions || (q.answerText ? [q.answerText] : []);
      for (const ans of accepted) {
        const normAns = normalizeOptionText(ans);
        const ansNodeId = `ans-${q.id}-${normAns}`;
        this.addNode({
          id: ansNodeId,
          type: 'ANSWER',
          label: ans,
          metadata: { questionId: q.id, reviewStatus: q.reviewStatus },
        });

        this.addEdge({
          sourceId: qNodeId,
          targetId: ansNodeId,
          type: 'CORRECT_ANSWER',
          weight: 2.5,
        });
      }

      // Link concepts in question to Question Node
      const qConcepts = extractConcepts(q.questionText);
      for (const concept of qConcepts) {
        const conceptNodeId = `concept-${concept}`;
        if (!this.nodes.has(conceptNodeId)) {
          this.addNode({
            id: conceptNodeId,
            type: 'CONCEPT',
            label: concept,
          });
        }

        this.addEdge({
          sourceId: conceptNodeId,
          targetId: qNodeId,
          type: 'CO_OCCURS',
          weight: 1.2,
        });
      }
    }
  }

  /**
   * Find Answer Nodes connected to query concepts via multi-hop traversal.
   * Traversal paths:
   *  Query Concepts -> Question Nodes -> Correct Answer Nodes
   *  Query Concepts -> Lecture Notes -> Concept Nodes -> Option Nodes
   */
  findAnswerEvidence(
    questionText: string,
    options: string[],
    filterCourseId?: string
  ): GraphAnswerEvidence[] {
    const queryConcepts = extractConcepts(questionText);
    const candidateEvidenceMap = new Map<string, GraphAnswerEvidence>();

    // Weight factors
    const DECAY = 0.85;

    for (const concept of queryConcepts) {
      const conceptNodeId = `concept-${concept}`;
      if (!this.nodes.has(conceptNodeId)) continue;

      // Follow outgoing edges from Concept Node
      const edges = this.adjacency.get(conceptNodeId) || [];
      for (const edge of edges) {
        // Concept -> Question
        if (edge.type === 'CO_OCCURS') {
          const qNode = this.nodes.get(edge.targetId);
          if (!qNode || qNode.type !== 'QUESTION') continue;
          if (filterCourseId && qNode.metadata?.courseId !== filterCourseId) continue;

          // From Question -> find CORRECT_ANSWER edges
          const qEdges = this.adjacency.get(qNode.id) || [];
          for (const qEdge of qEdges) {
            if (qEdge.type === 'CORRECT_ANSWER') {
              const ansNode = this.nodes.get(qEdge.targetId);
              if (!ansNode) continue;

              const answerLabel = ansNode.label;
              const normAns = normalizeOptionText(answerLabel);

              // Verify if answer corresponds to one of the active options
              const matchedOption = options.find(
                (opt) => normalizeOptionText(opt) === normAns
              );

              const effectiveAns = matchedOption || answerLabel;
              const pathScore = edge.weight * qEdge.weight * DECAY;

              const existing = candidateEvidenceMap.get(normAns);
              if (existing) {
                existing.confidenceScore += pathScore;
                if (!existing.pathTraces.includes(`Concept: "${concept}"`)) {
                  existing.pathTraces.push(`Concept: "${concept}"`);
                }
              } else {
                candidateEvidenceMap.set(normAns, {
                  answerText: effectiveAns,
                  confidenceScore: pathScore,
                  sourceQuestionId: (qNode.metadata?.id as string) || qNode.id,
                  pathTraces: [
                    `Concept: "${concept}"`,
                    `Matched Historical Question: "${qNode.label.slice(0, 50)}..."`,
                    `Verified Answer: "${effectiveAns}"`,
                  ],
                  explanation: `Graph path traversal linked concept "${concept}" directly to verified answer node "${effectiveAns}".`,
                });
              }
            }
          }
        }
      }

      // Also check reverse: Material -> Concept -> Option
      const revEdges = this.reverseAdjacency.get(conceptNodeId) || [];
      for (const revEdge of revEdges) {
        if (revEdge.type === 'EXPLAINS_CONCEPT') {
          const matNode = this.nodes.get(revEdge.sourceId);
          if (!matNode || matNode.type !== 'MATERIAL') continue;
          if (filterCourseId && matNode.metadata?.courseId !== filterCourseId) continue;

          // Lecture material explains this concept.
          // Check if any options appear in or match this concept
          for (const opt of options) {
            const normOpt = normalizeOptionText(opt);
            if (normOpt.includes(concept) || concept.includes(normOpt)) {
              const pathScore = revEdge.weight * 1.5 * DECAY;
              const existing = candidateEvidenceMap.get(normOpt);
              if (existing) {
                existing.confidenceScore += pathScore;
                existing.pathTraces.push(`Material: "${matNode.label}"`);
              } else {
                candidateEvidenceMap.set(normOpt, {
                  answerText: opt,
                  confidenceScore: pathScore,
                  pathTraces: [
                    `Lecture Material: "${matNode.label}"`,
                    `Explained Concept: "${concept}"`,
                    `Option Match: "${opt}"`,
                  ],
                  explanation: `Lecture note "${matNode.label}" explains concept "${concept}" matching option "${opt}".`,
                });
              }
            }
          }
        }
      }
    }

    // Normalize confidence scores to 0.0 - 1.0 range
    const results = Array.from(candidateEvidenceMap.values());
    const maxScore = Math.max(...results.map((r) => r.confidenceScore), 1);

    return results
      .map((r) => ({
        ...r,
        confidenceScore: Math.min(1, Math.round((r.confidenceScore / maxScore) * 100) / 100),
      }))
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    let count = 0;
    for (const edges of this.adjacency.values()) {
      count += edges.length;
    }
    return count;
  }
}
