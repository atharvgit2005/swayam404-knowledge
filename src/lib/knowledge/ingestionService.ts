/**
 * Swayam404 Knowledge Base — Course Resource Ingestion Service
 *
 * Implements a repeatable, deterministic 13-stage ingestion pipeline converting
 * authorized source material into valid, versioned course resources and chunks.
 *
 * Fully decoupled from extension UI for CLI, maintainer, and background usage.
 */

import {
  KnowledgeResource,
  KnowledgeResourceChunk,
  KnowledgeResourceType,
  KnowledgeProvenance,
  IngestionInput,
  IngestionPreviewItem,
  IngestionResult,
  IngestionSummary,
  ContributionPermission,
} from '@/types/knowledge';
import { computeSha256 } from './hasher';
import { KnowledgeValidator } from './validator';
import { ConflictService } from './conflictService';

export interface ChunkingOptions {
  targetChunkSize?: number; // target character count, default ~400
  minChunkSize?: number; // min chunk size, default ~100
}

export class ResourceIngestionService {
  /**
   * Slugify a title deterministically for stable identifiers
   */
  static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'resource';
  }

  /**
   * Stage 3: Normalize whitespace and safe text formatting while preserving
   * indentation and math expressions.
   */
  static normalizeText(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // remove invisible control codes
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // strip raw script tags
      .replace(/[ \t]+$/gm, '') // strip trailing line whitespace
      .trim();
  }

  /**
   * Stage 4: Detect and verify mathematical notation presence
   * (e.g. LaTeX $...$, $$...$$, \frac, \sum, \int, superscripts, Greek symbols)
   */
  static containsMathNotation(text: string): boolean {
    return (
      /\$[^$]+\$/.test(text) ||
      /\$\$[^$]+\$\$/.test(text) ||
      /\\(?:frac|sqrt|sum|int|alpha|beta|gamma|theta|partial|times|le|ge|neq|approx|pi)\b/.test(text) ||
      /[∑∫π√αβγθλμσ∆≠≤≥≈]/.test(text)
    );
  }

  /**
   * Stage 6: Determine if redistribution permission permits inclusion in a public pack
   */
  static isPermissionPubliclyDistributable(permission: ContributionPermission): boolean {
    const publicPermissions: Set<ContributionPermission> = new Set([
      'public-open-educational',
      'cc-by',
      'cc-by-sa',
      'cc0-public-domain',
    ]);
    return publicPermissions.has(permission);
  }

  /**
   * Stage 7: Generate stable, deterministic resource ID derived from
   * courseId, resourceType, title, and initial content hash prefix.
   */
  static async generateStableResourceId(
    courseId: string,
    resourceType: KnowledgeResourceType,
    title: string,
    content: string
  ): Promise<string> {
    const slug = this.slugify(title);
    const hash = await computeSha256(`${courseId}:${resourceType}:${title}:${content.slice(0, 200)}`);
    const shortHash = hash.slice(0, 8);
    return `res-${courseId}-${slug}-${shortHash}`;
  }

  /**
   * Stage 9: Split long text into bounded, searchable chunks with stable IDs and provenance
   */
  static async chunkResource(
    resource: KnowledgeResource,
    options: ChunkingOptions = {}
  ): Promise<KnowledgeResourceChunk[]> {
    const targetSize = options.targetChunkSize ?? 400;
    const content = resource.content.trim();

    if (!content) return [];

    // If content is already concise, return as single chunk
    if (content.length <= targetSize + 100) {
      const chunkHash = await computeSha256(content);
      const chunkId = `${resource.resourceId}-chunk-0`;
      return [
        {
          chunkId,
          resourceId: resource.resourceId,
          courseId: resource.courseId,
          chunkIndex: 0,
          totalChunks: 1,
          content,
          contentHash: chunkHash,
          topics: [...resource.topics],
          unitOrWeek: resource.unitOrWeek,
          lectureId: resource.lectureId,
          lectureNumber: resource.lectureNumber,
          lectureTimestamp: resource.provenance.lectureTimestamp,
          provenance: { ...resource.provenance },
          version: resource.version,
        },
      ];
    }

    // Paragraph-aware splitting while respecting math formulas ($$ ... $$)
    const paragraphs = content.split(/\n\s*\n/);
    const chunkTexts: string[] = [];
    let currentBuffer = '';

    for (const p of paragraphs) {
      const para = p.trim();
      if (!para) continue;

      if ((currentBuffer + '\n\n' + para).trim().length <= targetSize || !currentBuffer) {
        currentBuffer = currentBuffer ? `${currentBuffer}\n\n${para}` : para;
      } else {
        chunkTexts.push(currentBuffer.trim());
        currentBuffer = para;
      }
    }

    if (currentBuffer.trim()) {
      chunkTexts.push(currentBuffer.trim());
    }

    // Second pass: if any chunk is still excessively long (> targetSize * 2), split by sentences
    const refinedChunks: string[] = [];
    for (const c of chunkTexts) {
      if (c.length <= targetSize * 1.8) {
        refinedChunks.push(c);
      } else {
        const sentences = c.split(/(?<=[.!?])\s+(?=[A-Z0-9$])/);
        let sBuf = '';
        for (const s of sentences) {
          if ((sBuf + ' ' + s).trim().length > targetSize && sBuf.length > 0) {
            refinedChunks.push(sBuf.trim());
            sBuf = s;
          } else {
            sBuf = sBuf ? `${sBuf} ${s}` : s;
          }
        }
        if (sBuf.trim()) {
          refinedChunks.push(sBuf.trim());
        }
      }
    }

    const totalChunks = refinedChunks.length;
    const chunks: KnowledgeResourceChunk[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkText = refinedChunks[i];
      const chunkHash = await computeSha256(chunkText);
      const chunkId = `${resource.resourceId}-chunk-${i}`;

      chunks.push({
        chunkId,
        resourceId: resource.resourceId,
        courseId: resource.courseId,
        chunkIndex: i,
        totalChunks,
        content: chunkText,
        contentHash: chunkHash,
        topics: [...resource.topics],
        unitOrWeek: resource.unitOrWeek,
        lectureId: resource.lectureId,
        lectureNumber: resource.lectureNumber,
        lectureTimestamp: resource.provenance.lectureTimestamp,
        provenance: { ...resource.provenance },
        version: resource.version,
      });
    }

    return chunks;
  }

  /**
   * Parse frontmatter or embedded metadata from Markdown content
   */
  static extractMarkdownMetadata(rawContent: string): {
    metadata: Record<string, string>;
    body: string;
  } {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = rawContent.match(frontmatterRegex);

    if (!match) {
      return { metadata: {}, body: rawContent };
    }

    const rawMeta = match[1];
    const body = match[2];
    const metadata: Record<string, string> = {};

    for (const line of rawMeta.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && value) {
          metadata[key] = value;
        }
      }
    }

    return { metadata, body };
  }

  /**
   * Map input format to canonical resource type if not specified
   */
  static mapSourceFormatToResourceType(
    format: IngestionInput['sourceFormat'],
    explicit?: KnowledgeResourceType
  ): KnowledgeResourceType {
    if (explicit) return explicit;
    switch (format) {
      case 'markdown-notes':
      case 'instructor-notes':
        return 'lecture-notes';
      case 'study-guide':
        return 'concept-summary';
      case 'transcript-excerpt':
        return 'transcript-excerpt';
      case 'worked-example':
        return 'worked-example';
      case 'official-reference':
        return 'official-reference';
      default:
        return 'lecture-notes';
    }
  }

  /**
   * Executes the end-to-end 13-stage ingestion workflow across provided inputs.
   *
   * @param inputs Array of candidate inputs (Markdown notes, study guides, transcripts, etc.)
   * @param existingResources Currently existing resources in the course pack (for duplicate/conflict detection)
   * @param chunkOptions Custom chunking configuration
   */
  static async ingest(
    inputs: IngestionInput[],
    existingResources: KnowledgeResource[] = [],
    chunkOptions: ChunkingOptions = {}
  ): Promise<IngestionResult> {
    const items: IngestionPreviewItem[] = [];
    const summary: IngestionSummary = {
      totalInputs: inputs.length,
      acceptedResources: 0,
      generatedChunks: 0,
      duplicatesSkipped: 0,
      conflictsFlagged: 0,
      localOnlyCount: 0,
      warnings: [],
    };

    // Index existing hashes for fast duplicate checking
    const existingHashMap = new Map<string, KnowledgeResource>();
    for (const ex of existingResources) {
      if (ex.contentHash) {
        existingHashMap.set(ex.contentHash, ex);
      }
    }

    const processedResources: KnowledgeResource[] = [];

    for (const input of inputs) {
      const warnings: string[] = [];

      // Stage 1 & 2: Extract text and metadata
      let contentBody = input.rawContent;
      let title = input.title;
      let unitOrWeek = input.unitOrWeek;
      let lectureId = input.lectureId;
      let lectureNumber = input.lectureNumber;
      const topics = input.topics ? [...input.topics] : [];

      if (input.sourceFormat === 'markdown-notes') {
        const parsed = this.extractMarkdownMetadata(input.rawContent);
        contentBody = parsed.body;
        if (parsed.metadata.title && !title) title = parsed.metadata.title;
        if (parsed.metadata.unitOrWeek && !unitOrWeek) unitOrWeek = parsed.metadata.unitOrWeek;
        if (parsed.metadata.lectureId && !lectureId) lectureId = parsed.metadata.lectureId;
        if (parsed.metadata.lectureNumber && !lectureNumber) lectureNumber = parsed.metadata.lectureNumber;
        if (parsed.metadata.topics) {
          const parsedTopics = parsed.metadata.topics.split(',').map((t) => t.trim()).filter(Boolean);
          topics.push(...parsedTopics);
        }
      }

      // Stage 5 baseline: course & resource association
      const courseId = (input.courseId || '').trim();

      const resType = this.mapSourceFormatToResourceType(input.sourceFormat, input.resourceType);

      // Stage 3: Normalize text
      const normalizedContent = this.normalizeText(contentBody);
      if (!normalizedContent) {
        const warn = 'Resource content is empty after normalization; skipped.';
        summary.warnings.push(warn);
        items.push({
          resource: {
            resourceId: `res-${courseId}-empty`,
            courseId,
            title: title || 'Empty Resource',
            resourceType: resType,
            content: '',
            topics: [],
            provenance: {
              sourceTitle: title || 'Empty',
              license: 'Restricted',
              retrievalDate: new Date().toISOString().split('T')[0],
            },
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          chunks: [],
          isDuplicate: false,
          hasConflict: false,
          warnings: [warn],
          isAuthorizedForPublicPack: false,
        });
        continue;
      }

      // Stage 4: Math notation verification
      const hasMath = this.containsMathNotation(normalizedContent);
      if (hasMath && !topics.includes('mathematical-formulation')) {
        // Safe enrichment without overwriting topics
      }


      // Stage 6: Provenance & Permission validation
      const prov = input.provenance;
      const isPubliclyAllowed = this.isPermissionPubliclyDistributable(prov.permission);
      if (!isPubliclyAllowed) {
        summary.localOnlyCount++;
        warnings.push(
          `Redistribution permission '${prov.permission}' is restricted/unverified. Stored local-only; excluded from public pack.`
        );
      }

      const provenance: KnowledgeProvenance = {
        sourceTitle: prov.sourceTitle || title || 'Untitled Course Material',
        sourceUrl: prov.sourceUrl,
        authorOrPublisher: prov.authorOrPublisher || 'Course Contributor',
        license: prov.license || (isPubliclyAllowed ? 'CC-BY-4.0' : 'Restricted'),
        attribution: prov.attribution,
        retrievalDate: prov.retrievalDate || new Date().toISOString().split('T')[0],
        lectureNumber: lectureNumber || prov.lectureNumber,
        lectureTimestamp: input.lectureTimestamp || prov.lectureTimestamp,
      };

      // Stage 8: Content hash
      const contentHash = await computeSha256(normalizedContent);

      // Stage 7: Generate stable resource ID
      const resourceId = await this.generateStableResourceId(courseId, resType, title, normalizedContent);

      // Assemble candidate resource
      const resource: KnowledgeResource = {
        resourceId,
        courseId,
        title,
        resourceType: resType,
        content: normalizedContent,
        topics: Array.from(new Set(topics)),
        provenance,
        version: input.version || '1.0.0',
        contentHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unitOrWeek,
        lectureId,
        lectureNumber,
      };

      // Stage 10: Validate against existing schema
      const val = KnowledgeValidator.validateResources([resource], courseId);
      if (!val.isValid) {
        const msgs = val.errors.map((e) => e.message).join('; ');
        warnings.push(`Schema validation failed: ${msgs}`);
      }

      // Stage 11: Exact duplicate detection & conflict evaluation
      let isDuplicate = false;
      let hasConflict = false;
      let conflictReason: string | undefined;

      // Check exact hash collision against existing or newly processed
      if (existingHashMap.has(contentHash)) {
        isDuplicate = true;
        const duplicateOf = existingHashMap.get(contentHash)!;
        conflictReason = `Exact duplicate of existing resource '${duplicateOf.resourceId}'.`;
        summary.duplicatesSkipped++;
      } else {
        const alreadyInBatch = processedResources.find((r) => r.contentHash === contentHash);
        if (alreadyInBatch) {
          isDuplicate = true;
          conflictReason = `Exact duplicate of batch resource '${alreadyInBatch.resourceId}'.`;
          summary.duplicatesSkipped++;
        }
      }

      // Similarity / Conflict check using ConflictService
      if (!isDuplicate) {
        const conflicts = ConflictService.detectResourceConflicts({
          proposedResources: [resource],
          existingResources,
        });
        if (conflicts.length > 0) {
          const highSeverity = conflicts.find((c) => c.type === 'id-collision' || c.type === 'content-conflict');
          if (highSeverity) {
            hasConflict = true;
            conflictReason = highSeverity.message;
            summary.conflictsFlagged++;
          }
        }
      }


      // Stage 9: Generate bounded chunks
      const chunks = await this.chunkResource(resource, chunkOptions);
      resource.chunks = chunks;

      if (!isDuplicate && val.isValid) {
        summary.acceptedResources++;
        summary.generatedChunks += chunks.length;
        processedResources.push(resource);
        existingHashMap.set(contentHash, resource);
      }

      items.push({
        resource,
        chunks,
        isDuplicate,
        hasConflict,
        conflictReason,
        warnings,
        isAuthorizedForPublicPack: isPubliclyAllowed && !isDuplicate && !hasConflict && val.isValid,
      });
    }

    summary.warnings = items.flatMap((i) => i.warnings);

    // Stage 13: Export only valid, authorized resources for repository pack
    const exportableResources = items
      .filter((i) => i.isAuthorizedForPublicPack)
      .map((i) => i.resource);

    return {
      success: summary.acceptedResources > 0 || (inputs.length === 0),
      summary,
      items,
      exportedPack: {
        resources: exportableResources,
      },
    };
  }
}
