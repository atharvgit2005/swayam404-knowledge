/**
 * Swayam404 Knowledge Base — Scalable Course-Scoped Resource Chunk Index
 *
 * Fast inverted token and metadata index enabling sub-millisecond retrieval
 * across large course packs (>500 chunks) with deterministic rebuilds and safe fallbacks.
 */

import {
  KnowledgeResource,
  KnowledgeResourceChunk,
  RetrievedExcerpt,
  KnowledgeSearchOptions,
} from '@/types/knowledge';
import { normalizeQuestionText } from '@/lib/matching/normalizer';
import { extractSignificantTokens, chunkDocument } from '@/lib/context/retrievalService';
import { dpSequenceMatcher } from '@/lib/retrieval/dpEngine';

export class ResourceChunkIndex {
  private courseId: string;
  private version: string;
  private chunks: Map<string, KnowledgeResourceChunk> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private unitIndex: Map<string, Set<string>> = new Map();
  private lectureIndex: Map<string, Set<string>> = new Map();
  private topicIndex: Map<string, Set<string>> = new Map();
  private isCorrupted = false;

  constructor(courseId: string = '', version: string = '1.0.0') {
    this.courseId = courseId;
    this.version = version;
  }

  getCourseId(): string {
    return this.courseId;
  }

  getVersion(): string {
    return this.version;
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Clears and resets all internal index maps.
   */
  clear(): void {
    this.chunks.clear();
    this.invertedIndex.clear();
    this.unitIndex.clear();
    this.lectureIndex.clear();
    this.topicIndex.clear();
    this.isCorrupted = false;
  }

  /**
   * For testing or chaos verification: mark index as corrupted to test safe fallback
   */
  simulateCorruption(): void {
    this.isCorrupted = true;
  }

  /**
   * Rebuilds the inverted index deterministically from validated course resources.
   */
  rebuild(courseId: string, resources: KnowledgeResource[], version: string = '1.0.0'): void {
    this.clear();
    this.courseId = courseId;
    this.version = version;

    for (const res of resources) {
      // Course isolation enforcement
      if (res.courseId !== courseId) continue;

      // Extract or dynamically construct chunks
      let resourceChunks: KnowledgeResourceChunk[] = [];
      if (res.chunks && res.chunks.length > 0) {
        resourceChunks = res.chunks;
      } else {
        const textChunks = chunkDocument(res.content);
        resourceChunks = textChunks.map((content, idx) => ({
          chunkId: `${res.resourceId}-chunk-${idx}`,
          resourceId: res.resourceId,
          courseId: res.courseId,
          chunkIndex: idx,
          totalChunks: textChunks.length,
          content,
          contentHash: '',
          topics: [...res.topics],
          unitOrWeek: res.unitOrWeek,
          lectureId: res.lectureId,
          lectureNumber: res.lectureNumber,
          provenance: { ...res.provenance },
          version: res.version,
        }));
      }

      for (const chunk of resourceChunks) {
        this.indexChunk(chunk, res);
      }
    }
  }

  private indexChunk(chunk: KnowledgeResourceChunk, parentResource: KnowledgeResource): void {
    this.chunks.set(chunk.chunkId, chunk);

    // 1. Inverted token indexing
    const tokens = extractSignificantTokens(
      `${chunk.content} ${parentResource.title} ${chunk.topics.join(' ')}`
    );

    for (const tok of tokens) {
      if (!this.invertedIndex.has(tok)) {
        this.invertedIndex.set(tok, new Set());
      }
      this.invertedIndex.get(tok)!.add(chunk.chunkId);
    }

    // 2. Unit / Week indexing
    const unitKey = (chunk.unitOrWeek || parentResource.unitOrWeek)?.toLowerCase().trim();
    if (unitKey) {
      if (!this.unitIndex.has(unitKey)) {
        this.unitIndex.set(unitKey, new Set());
      }
      this.unitIndex.get(unitKey)!.add(chunk.chunkId);
    }

    // 3. Lecture indexing
    const lectureKey = (
      chunk.lectureId ||
      chunk.lectureNumber ||
      parentResource.lectureId ||
      parentResource.lectureNumber ||
      parentResource.provenance?.lectureNumber
    )
      ?.toLowerCase()
      .trim();
    if (lectureKey) {
      if (!this.lectureIndex.has(lectureKey)) {
        this.lectureIndex.set(lectureKey, new Set());
      }
      this.lectureIndex.get(lectureKey)!.add(chunk.chunkId);
    }

    // 4. Topic indexing
    for (const top of chunk.topics) {
      const topKey = top.toLowerCase().trim();
      if (!this.topicIndex.has(topKey)) {
        this.topicIndex.set(topKey, new Set());
      }
      this.topicIndex.get(topKey)!.add(chunk.chunkId);
    }
  }

  /**
   * Query the inverted index with course, unit, lecture, and topic scoping.
   * If corrupted, returns fallback search results safely.
   */
  search(options: KnowledgeSearchOptions): RetrievedExcerpt[] {
    const { courseId, query, topic, unitOrWeek, lectureId, limit = 3 } = options;

    // Course isolation check
    if (this.courseId && courseId && this.courseId !== courseId) {
      return [];
    }

    // Corruption check: safe empty or fallback
    if (this.isCorrupted) {
      return this.safeLinearFallback(options);
    }

    const queryTokens = extractSignificantTokens(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const queryTokenSet = new Set(queryTokens);
    const normQ = normalizeQuestionText(query);
    const filterUnit = unitOrWeek?.toLowerCase().trim();
    const filterLecture = lectureId?.toLowerCase().trim();
    const filterTopic = topic?.toLowerCase().trim();

    // 1. Candidate selection via Inverted Index
    const candidateIds = new Set<string>();

    for (const tok of queryTokens) {
      const matchingIds = this.invertedIndex.get(tok);
      if (matchingIds) {
        for (const id of matchingIds) {
          candidateIds.add(id);
        }
      }
    }

    // Include filter-matched chunks if provided
    if (filterUnit && this.unitIndex.has(filterUnit)) {
      for (const id of this.unitIndex.get(filterUnit)!) {
        candidateIds.add(id);
      }
    }
    if (filterLecture && this.lectureIndex.has(filterLecture)) {
      for (const id of this.lectureIndex.get(filterLecture)!) {
        candidateIds.add(id);
      }
    }
    if (filterTopic && this.topicIndex.has(filterTopic)) {
      for (const id of this.topicIndex.get(filterTopic)!) {
        candidateIds.add(id);
      }
    }

    if (candidateIds.size === 0) {
      return [];
    }

    // 2. Preliminary scoring across candidate chunks
    const preliminary: Array<{
      chunk: KnowledgeResourceChunk;
      baseScore: number;
    }> = [];

    for (const chunkId of candidateIds) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;

      const lowerContent = chunk.content.toLowerCase();
      let matches = 0;
      let phraseBonus = 0;
      let filterBonus = 0;

      // Token overlap (content 2x)
      for (const tok of queryTokenSet) {
        if (lowerContent.includes(tok)) {
          matches += 2;
        }
      }

      // Topic token overlap (4x)
      for (const top of chunk.topics) {
        const lowerTop = top.toLowerCase();
        for (const tok of queryTokenSet) {
          if (lowerTop.includes(tok)) {
            matches += 4;
          }
        }
      }

      // Substring phrase match
      if (normQ.length > 10 && lowerContent.includes(normQ.slice(0, 30))) {
        phraseBonus += 10;
      }

      // Filter bonuses
      if (filterUnit && chunk.unitOrWeek?.toLowerCase().includes(filterUnit)) {
        filterBonus += 10;
      }
      if (
        filterLecture &&
        (chunk.lectureId?.toLowerCase().includes(filterLecture) ||
          chunk.lectureNumber?.toLowerCase().includes(filterLecture))
      ) {
        filterBonus += 12;
      }
      if (filterTopic && chunk.topics.some((t) => t.toLowerCase().includes(filterTopic))) {
        filterBonus += 8;
      }

      const baseScore = matches + phraseBonus + filterBonus;
      if (baseScore > 0) {
        preliminary.push({ chunk, baseScore });
      }
    }

    if (preliminary.length === 0) {
      return [];
    }

    // Sort preliminary candidates and refine top 15 with Smith-Waterman DP alignment
    preliminary.sort((a, b) => b.baseScore - a.baseScore);
    const topCandidates = preliminary.slice(0, Math.max(15, limit * 2));

    const scoredCandidates: Array<{
      chunk: KnowledgeResourceChunk;
      score: number;
    }> = [];

    for (const { chunk, baseScore } of topCandidates) {
      const sw = dpSequenceMatcher.smithWaterman(query.slice(0, 80), chunk.content.slice(0, 120));
      const dpScore = Math.round(sw.normalizedScore * 4);
      const totalScore = baseScore + dpScore;

      scoredCandidates.push({
        chunk,
        score: Math.round(totalScore * 10) / 10,
      });
    }


    // 3. Deterministic Sorting: score desc, then chunkId asc
    scoredCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.chunk.chunkId.localeCompare(b.chunk.chunkId);
    });

    const topScored = scoredCandidates.slice(0, limit);

    // 4. Transform to RetrievedExcerpt
    return topScored.map(({ chunk, score }) => ({
      materialId: chunk.resourceId,
      resourceId: chunk.resourceId,
      materialTitle: chunk.provenance?.sourceTitle || 'Shared Knowledge Resource',
      title: chunk.provenance?.sourceTitle || 'Shared Knowledge Resource',
      unitTitle: chunk.unitOrWeek,
      courseId: chunk.courseId,
      lectureId: chunk.lectureId,
      timestamp: chunk.lectureTimestamp,
      license: chunk.provenance?.license || 'CC-BY-4.0',
      sourceTitle: chunk.provenance?.sourceTitle,
      sourceUrl: chunk.provenance?.sourceUrl,
      retrievalSource: 'shared-knowledge-base',
      topics: chunk.topics,
      contentHash: chunk.contentHash,
      excerpt: chunk.content,
      snippet: chunk.content.length > 350 ? `${chunk.content.slice(0, 350)}...` : chunk.content,
      relevanceScore: score,
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
    }));
  }

  /**
   * Safe linear fallback when index is corrupted
   */
  private safeLinearFallback(options: KnowledgeSearchOptions): RetrievedExcerpt[] {
    const { query, limit = 3 } = options;
    const queryTokens = extractSignificantTokens(query);
    const results: RetrievedExcerpt[] = [];

    for (const chunk of this.chunks.values()) {
      const lower = chunk.content.toLowerCase();
      let matches = 0;
      for (const tok of queryTokens) {
        if (lower.includes(tok)) matches++;
      }
      if (matches > 0) {
        results.push({
          materialId: chunk.resourceId,
          resourceId: chunk.resourceId,
          materialTitle: chunk.provenance?.sourceTitle || 'Shared Knowledge Resource',
          title: chunk.provenance?.sourceTitle || 'Shared Knowledge Resource',
          unitTitle: chunk.unitOrWeek,
          courseId: chunk.courseId,
          retrievalSource: 'shared-knowledge-base',
          excerpt: chunk.content,
          relevanceScore: matches,
          chunkId: chunk.chunkId,
        });
      }
      if (results.length >= limit) break;
    }
    return results;
  }
}

// Global cache of course-scoped chunk indices
export const courseChunkIndices: Map<string, ResourceChunkIndex> = new Map();

/**
 * Helper to get or initialize a course-scoped chunk index
 */
export function getOrCreateCourseChunkIndex(
  courseId: string,
  resources: KnowledgeResource[] = [],
  version: string = '1.0.0'
): ResourceChunkIndex {
  let index = courseChunkIndices.get(courseId);
  if (!index || index.getVersion() !== version) {
    index = new ResourceChunkIndex(courseId, version);
    if (resources.length > 0) {
      index.rebuild(courseId, resources, version);
    }
    courseChunkIndices.set(courseId, index);
  }
  return index;
}
