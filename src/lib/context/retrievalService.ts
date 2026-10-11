import { CourseMaterial } from '@/types';
import {
  KnowledgeResource,
  RetrievedExcerpt,
} from '@/types/knowledge';
import { normalizeQuestionText } from '@/lib/matching/normalizer';
import { dpSequenceMatcher } from '@/lib/retrieval/dpEngine';
import { getOrCreateCourseChunkIndex } from '@/lib/retrieval/chunkIndex';
import { StorageService } from '@/lib/storage';

import { KnowledgeBaseService } from '@/lib/knowledge/service';

export * from '@/types/knowledge';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'from', 'up', 'down', 'in', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will',
  'just', 'should', 'now', 'which', 'what', 'who', 'whom', 'this', 'that', 'these', 'those',
]);

/**
 * Extracts significant query tokens from question and option strings
 */
export function extractSignificantTokens(text: string): string[] {
  const normalized = normalizeQuestionText(text);
  const words = normalized.split(/[^a-z0-9_-]+/);
  return words.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Splits document content into paragraphs or logical sliding windows
 */
export function chunkDocument(content: string, maxChunkLength = 400): string[] {
  if (!content || !content.trim()) return [];
  const paragraphs = content.split(/\n\s*\n/);
  const chunks: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChunkLength) {
      chunks.push(trimmed);
    } else {
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentChunk = '';
      for (const sent of sentences) {
        if ((currentChunk + ' ' + sent).trim().length > maxChunkLength && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sent;
        } else {
          currentChunk = (currentChunk + ' ' + sent).trim();
        }
      }
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
    }
  }

  return chunks;
}

export interface UnifiedRetrievalOptions {
  questionText: string;
  options?: string[];
  courseId?: string;
  localMaterials?: CourseMaterial[];
  sharedResources?: KnowledgeResource[];
  topic?: string;
  unitOrWeek?: string;
  lectureId?: string;
  maxExcerpts?: number;
  includeSharedKnowledge?: boolean;
}

/**
 * Deterministic keyword-relevance and evidence retrieval service for course materials
 * and cached shared knowledge-base resources.
 */
export class CourseMaterialRetrievalService {
  /**
   * Legacy / synchronous retrieval for local course materials.
   * Maintains 100% backwards compatibility with existing consumers and tests.
   */
  retrieveExcerpts(
    questionText: string,
    options: string[] = [],
    materials: CourseMaterial[] = [],
    maxExcerpts = 3
  ): RetrievedExcerpt[] {
    if (!materials || materials.length === 0) {
      return [];
    }

    return this.rankAndCombineEvidence({
      questionText,
      options,
      courseId: materials[0]?.courseId,
      localMaterials: materials,
      maxExcerpts,
    });
  }

  /**
   * Deterministic ranking and deduplication layer combining eligible local course materials
   * and shared knowledge-base resources.
   *
   * Invariants:
   * 1. Course ID Match: Resources from other courses are strictly dropped.
   * 2. Grounded Signals: Token overlap, exact phrases, topic/unit filters, resource type quality.
   * 3. Deterministic Ordering: Ties broken by stable resource ID ascending.
   * 4. Deduplication: Duplicate content hashes and overlapping text removed.
   */
  rankAndCombineEvidence(options: UnifiedRetrievalOptions): RetrievedExcerpt[] {
    const {
      questionText,
      options: optList = [],
      courseId,
      localMaterials = [],
      sharedResources = [],
      topic,
      unitOrWeek,
      lectureId,
      maxExcerpts = 3,
    } = options;

    const queryTokens = extractSignificantTokens(
      questionText + ' ' + optList.join(' ')
    );

    if (queryTokens.length === 0) {
      return [];
    }

    const queryTokenSet = new Set(queryTokens);
    const normQ = normalizeQuestionText(questionText);
    const filterTopic = topic?.toLowerCase().trim();
    const filterUnitOrWeek = unitOrWeek?.toLowerCase().trim();
    const filterLectureId = lectureId?.toLowerCase().trim();

    const candidates: RetrievedExcerpt[] = [];

    // 1. Process Local Course Materials
    for (const mat of localMaterials) {
      // Course isolation: exclude if courseId is specified and does not match
      if (courseId && mat.courseId && mat.courseId !== courseId) {
        continue;
      }

      const chunks = chunkDocument(mat.content);
      for (const chunk of chunks) {
        const lowerChunk = chunk.toLowerCase();
        let matches = 0;
        let phraseBonus = 0;
        let filterBonus = 0;

        for (const token of queryTokenSet) {
          if (lowerChunk.includes(token)) {
            matches++;
          }
        }

        // Title token matches (6x weight)
        const lowerTitle = mat.title.toLowerCase();
        for (const token of queryTokenSet) {
          if (lowerTitle.includes(token)) {
            matches += 3;
          }
        }

        if (normQ.length > 10 && lowerChunk.includes(normQ.slice(0, 30))) {
          phraseBonus += 10;
        }

        // Unit/Topic filter boosts
        if (filterUnitOrWeek && mat.unitTitle && mat.unitTitle.toLowerCase().includes(filterUnitOrWeek)) {
          filterBonus += 8;
        }
        if (filterTopic && (mat.title.toLowerCase().includes(filterTopic) || (mat.unitTitle && mat.unitTitle.toLowerCase().includes(filterTopic)))) {
          filterBonus += 8;
        }

        const hasGrounding = matches > 0 || phraseBonus > 0 || filterBonus > 0;
        if (hasGrounding) {
          // Smith-Waterman local alignment score
          const sw = dpSequenceMatcher.smithWaterman(questionText.slice(0, 100), chunk.slice(0, 150));
          const dpBonus = Math.round(sw.normalizedScore * 5);

          const score = matches + phraseBonus + filterBonus + dpBonus + 2; // base quality weight for verified local material
          candidates.push({
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
            excerpt: chunk,
            snippet: chunk.length > 350 ? `${chunk.slice(0, 350)}...` : chunk,
            relevanceScore: Math.round(score * 10) / 10,
          });
        }
      }
    }

    // 2. Process Shared Knowledge-Base Resources
    for (const res of sharedResources) {
      // Course isolation: strictly exclude if courseId does not match
      if (courseId && res.courseId && res.courseId !== courseId) {
        continue;
      }

      if (!res.content || !res.content.trim()) continue;

      const rawChunks =
        res.chunks && res.chunks.length > 0
          ? res.chunks.map((c) => ({
              text: c.content,
              chunkId: c.chunkId,
              chunkIndex: c.chunkIndex,
              totalChunks: c.totalChunks,
              unitOrWeek: c.unitOrWeek || res.unitOrWeek,
              lectureId: c.lectureId || res.lectureId,
            }))
          : chunkDocument(res.content).map((text, idx, arr) => ({
              text,
              chunkId: `${res.resourceId}-chunk-${idx}`,
              chunkIndex: idx,
              totalChunks: arr.length,
              unitOrWeek: res.unitOrWeek,
              lectureId: res.lectureId,
            }));

      const lowerResTitle = res.title.toLowerCase();
      const lowerTopics = (res.topics || []).map((t) => t.toLowerCase());
      const resLectureNum = (res.provenance?.lectureNumber || res.lectureNumber)?.toLowerCase();

      for (const cItem of rawChunks) {
        const chunk = cItem.text;
        const lowerChunk = chunk.toLowerCase();
        let matches = 0;
        let phraseBonus = 0;
        let filterBonus = 0;

        // Content token overlap (2x weight)
        for (const token of queryTokenSet) {
          if (lowerChunk.includes(token)) {
            matches += 2;
          }
        }

        // Title token overlap (6x weight)
        for (const token of queryTokenSet) {
          if (lowerResTitle.includes(token)) {
            matches += 6;
          }
        }

        // Topic token overlap (4x weight)
        for (const token of queryTokenSet) {
          if (lowerTopics.some((t) => t.includes(token))) {
            matches += 4;
          }
        }

        if (normQ.length > 10 && lowerChunk.includes(normQ.slice(0, 30))) {
          phraseBonus += 10;
        }

        // Metadata filter boosts
        if (filterLectureId && (resLectureNum || cItem.lectureId)) {
          const lId = (cItem.lectureId || resLectureNum)?.toLowerCase();
          if (lId === filterLectureId || lId?.includes(filterLectureId)) {
            filterBonus += 12;
          }
        }
        if (filterTopic && lowerTopics.some((t) => t.includes(filterTopic))) {
          filterBonus += 8;
        }
        if (
          filterUnitOrWeek &&
          (lowerTopics.some((t) => t.includes(filterUnitOrWeek)) ||
            cItem.unitOrWeek?.toLowerCase().includes(filterUnitOrWeek))
        ) {
          filterBonus += 8;
        }

        const hasSharedGrounding = matches > 0 || phraseBonus > 0 || filterBonus > 0;
        if (hasSharedGrounding) {
          // Resource type quality weighting
          let typeWeight = 1.0;
          if (res.resourceType === 'worked-example') typeWeight = 3.0;
          else if (res.resourceType === 'concept-summary') typeWeight = 2.5;
          else if (
            res.resourceType === 'lecture-notes' ||
            res.resourceType === 'official-reference'
          )
            typeWeight = 2.0;
          else if (res.resourceType === 'practice-explanation') typeWeight = 1.5;

          // Smith-Waterman DP alignment
          const sw = dpSequenceMatcher.smithWaterman(
            questionText.slice(0, 100),
            chunk.slice(0, 150)
          );
          const dpBonus = Math.round(sw.normalizedScore * 5);

          const score = matches + phraseBonus + filterBonus + dpBonus + typeWeight;
          candidates.push({
            materialId: res.resourceId,
            resourceId: res.resourceId,
            materialTitle: res.title,
            title: res.title,
            unitTitle: cItem.unitOrWeek || res.unitOrWeek,
            courseId: res.courseId,
            resourceType: res.resourceType,
            sourceTitle: res.provenance?.sourceTitle || res.title,
            sourceUrl: res.provenance?.sourceUrl,
            lectureId: cItem.lectureId || res.provenance?.lectureNumber || res.lectureNumber,
            timestamp: res.provenance?.lectureTimestamp,
            license: res.provenance?.license,
            authorOrPublisher: res.provenance?.authorOrPublisher,
            retrievalSource: 'shared-knowledge-base',
            contentHash: res.contentHash,
            topics: res.topics,
            excerpt: chunk,
            snippet: chunk.length > 350 ? `${chunk.slice(0, 350)}...` : chunk,
            relevanceScore: Math.round(score * 10) / 10,
            chunkId: cItem.chunkId,
            chunkIndex: cItem.chunkIndex,
            totalChunks: cItem.totalChunks,
          });
        }
      }
    }


    // 3. Deterministic Tie-Breaking & Ranking
    // Sort primarily by relevanceScore descending.
    // If scores tie, sort by resourceId / materialId ascending, then excerpt text ascending.
    candidates.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      const idA = a.resourceId || a.materialId || '';
      const idB = b.resourceId || b.materialId || '';
      const cmp = idA.localeCompare(idB);
      if (cmp !== 0) return cmp;
      return a.excerpt.localeCompare(b.excerpt);
    });

    // 4. Deduplication
    const selected: RetrievedExcerpt[] = [];
    const seenHashes = new Set<string>();

    for (const item of candidates) {
      if (selected.length >= maxExcerpts) break;

      // Deduplicate identical content hashes
      if (item.contentHash) {
        if (seenHashes.has(item.contentHash)) continue;
        seenHashes.add(item.contentHash);
      }

      // Deduplicate overlapping or identical text excerpts
      const isDuplicate = selected.some(
        (s) =>
          s.excerpt === item.excerpt ||
          s.excerpt.includes(item.excerpt) ||
          item.excerpt.includes(s.excerpt)
      );

      if (!isDuplicate) {
        selected.push(item);
      }
    }

    return selected;
  }

  /**
   * Unified asynchronous retrieval across local course materials and cached shared knowledge packs.
   * Respects user settings and offline caching.
   */
  async retrieveEvidence(options: UnifiedRetrievalOptions): Promise<RetrievedExcerpt[]> {
    let localMaterials = options.localMaterials;
    let sharedResources = options.sharedResources;

    // Load local materials if not explicitly provided
    if (!localMaterials && options.courseId) {
      try {
        localMaterials = await StorageService.getCourseMaterials(options.courseId);
      } catch {
        localMaterials = [];
      }
    }

    // Load cached shared knowledge base resources if enabled and not provided
    if (!sharedResources && options.courseId && options.includeSharedKnowledge !== false) {
      try {
        const settings = await StorageService.getSettings();
        if (settings.knowledgeBaseEnabled) {
          sharedResources = await KnowledgeBaseService.getCourseResources(options.courseId);
        }
      } catch {
        sharedResources = [];
      }
    }

    return this.rankAndCombineEvidence({
      ...options,
      localMaterials: localMaterials || [],
      sharedResources: sharedResources || [],
    });
  }

  /**
   * Course/unit-scoped search API using a structured options query.
   */
  async searchResources(options: {
    courseId: string;
    query: string;
    topic?: string;
    unitOrWeek?: string;
    lectureId?: string;
    limit?: number;
    includeSharedKnowledge?: boolean;
  }): Promise<RetrievedExcerpt[]> {
    return await this.retrieveEvidence({
      questionText: options.query,
      courseId: options.courseId,
      topic: options.topic,
      unitOrWeek: options.unitOrWeek,
      lectureId: options.lectureId,
      maxExcerpts: options.limit || 5,
      includeSharedKnowledge: options.includeSharedKnowledge !== false,
    });
  }

  /**
   * Fast indexed search using ResourceChunkIndex for large resource sets (>500 chunks).
   */
  retrieveIndexedSharedChunks(
    options: {
      courseId: string;
      query: string;
      topic?: string;
      unitOrWeek?: string;
      lectureId?: string;
      limit?: number;
    },
    resources: KnowledgeResource[] = []
  ): RetrievedExcerpt[] {
    const index = getOrCreateCourseChunkIndex(options.courseId, resources);
    return index.search(options);
  }
}

export const courseRetrievalService = new CourseMaterialRetrievalService();

