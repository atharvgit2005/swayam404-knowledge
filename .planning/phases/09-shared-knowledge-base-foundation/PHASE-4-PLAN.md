# Phase 4: Production Course Packs, Resource Ingestion & Intelligent Knowledge Sync

## Goal
Advance Swayam404's shared knowledge infrastructure into a production-grade, scalable course-resource distribution system:
1. Establish a repeatable, deterministic ingestion pipeline for real, authorized course resources.
2. Organize course resources into validated, versioned course packs.
3. Improve course, unit, week, lecture, and topic indexing where source data supports it.
4. Reduce unnecessary remote downloads through conditional requests (ETag/304) and course-selective updates.
5. Make the local cache and retrieval system reliable at larger dataset sizes (>500 chunks).
6. Validate the complete publish-and-update lifecycle without compromising existing Swayam404 functionality.

## Architecture

### 1. Type Extensions (`src/types/knowledge.ts`)
- `KnowledgeResourceChunk`: Stable chunk identity (`${resourceId}-chunk-${index}`), parent provenance, course, unit/week, lecture, content hash, topics.
- `IngestionSourceFormat`: Markdown notes, study guides, transcript excerpts, instructor notes, worked examples, official external references, structured metadata, contribution packages.
- `IngestionInput`, `IngestionPreviewItem`, `IngestionResult`: Ingestion stages, permission checks, duplicate detection, and summary.
- `KnowledgeCourse`: Structured units/weeks and lectures hierarchy (`CourseUnitMetadata[]`).
- `KnowledgeCacheMetadata`: Track ETags, Last-Modified, per-course versions, and per-course sync status.
- `KnowledgeSyncOptions`: Course-selective sync and conditional fetch.

### 2. Course-Resource Ingestion Engine (`src/lib/knowledge/ingestionService.ts`)
- 13 Ingestion stages:
  1. Read selected source.
  2. Extract text and metadata.
  3. Normalize whitespace and safe text formatting.
  4. Preserve mathematical notation (LaTeX formulas, symbols).
  5. Associate with course, unit/week, lecture.
  6. Provenance and permission validation (block unverified/local-only from public packs).
  7. Deterministic resource ID generation.
  8. SHA-256 content hash calculation.
  9. Stable chunking with provenance preservation.
  10. Schema validation.
  11. Exact duplicate detection and similarity conflict flagging.
  12. Ingestion preview and summary.
  13. Repository-ready export.

### 3. Production Course-Pack Building & Validation (`src/lib/knowledge/packBuilder.ts` & `scripts/build-course-packs.mjs`)
- Validates course metadata, resources, review records.
- Verifies unique IDs, safe relative paths, redistribution permissions.
- Computes deterministic SHA-256 hashes.
- Compiles root `manifest.json` and course catalog `courses/index.json`.
- Reports changed files and generates maintainer validation report.

### 4. Intelligent Remote Sync & Resilient Caching (`client.ts` & `cache.ts`)
- Conditional HTTP requests: ETag / `If-None-Match`, `Last-Modified` / `If-Modified-Since`, HTTP 304 handling.
- Course-selective sync: Download only selected course packs.
- Partial course failure resilience: Failing course does not wipe out or corrupt other cached courses.
- Concurrency protection: Single-flight lock preventing overlapping sync operations.
- Offline access: Preserves previous valid cache on network failure or timeout.

### 5. High-Performance Inverted Chunk Index & Retrieval (`chunkIndex.ts` & `retrievalService.ts`)
- Course-scoped inverted index over resource chunks.
- Sub-millisecond retrieval at 500+ chunks.
- Granular filtering by course, unit/week, lecture, and topic.
- Deterministic index rebuild and corruption fallback.

### 6. Automated Testing & Verification
- Comprehensive 30-scenario test suite in `src/test/knowledge-course-packs-and-sync.test.ts`.
- Performance benchmarks across small (<20), medium (100), and large (500+) chunk sets.
- Verification of type-check, full test suite, build, and documentation.
