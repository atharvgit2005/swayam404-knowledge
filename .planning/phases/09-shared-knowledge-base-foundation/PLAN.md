# Phase Plan: Phase 9 — Shared Knowledge Base Foundation (Phase 1)

## Objective
Establish Phase 1 of the shared knowledge infrastructure for Swayam404:
1. Define a stable, versioned data schema with deterministic comparison.
2. Establish the `knowledge-base/` repository structure (manifest, schemas, course packs, synthetic examples, validation workflow).
3. Build a typed validation engine in TypeScript checking fields, enums, dates, hashes, and path traversal.
4. Implement a read-only remote client with timeout, cancellation, bounded retries, and integrity checking.
5. Implement safe local caching with atomic commits, failure preservation, and offline resilience.
6. Provide a course-scoped read interface for future retrieval integration (Phase 2).
7. Add compact Neo-Brutalist settings integration in `SettingsTab.tsx`.
8. Comprehensive tests covering all 22 required test conditions.
9. Comprehensive documentation for public GitHub repo publication, contribution workflow, and attribution rules.

## Architecture & Data Flow

```
Remote Public Git Repo (Static JSON)
   │ (e.g., https://raw.githubusercontent.com/owner/swayam404-knowledge/main)
   ▼
[KnowledgeBaseClient] (Read-Only, Fetch + Timeout + Hash Check)
   │
   ▼
[KnowledgeValidator] (Schema, Version, Path Traversal, IDs, Hash Validation)
   │
   ▼
[KnowledgeCacheService] (Version Diffing, Atomic Commit to chrome.storage.local)
   │
   ├─► Preserves last valid cache on error
   ├─► Offline-first availability
   ▼
[KnowledgeBaseService] (Read API for Extension: searchResources, getCatalog)
   │
   ├─► SettingsTab.tsx (Config URL, Sync Button, Status Pill)
   └─► Future Phase 2 Retrieval Integration
```

## Tasks
1. **Types**: Create `src/types/knowledge.ts` and re-export in `src/types/index.ts`.
2. **Knowledge Base Repository**: Create `knowledge-base/` directory structure with JSON schemas, catalog, course packs, and validation CI workflow.
3. **Hasher & Security Utilities**: Implement SHA-256 calculation and path traversal safety in `src/lib/knowledge/hasher.ts` and `security.ts`.
4. **Validation Engine**: Implement `src/lib/knowledge/validator.ts` with typed schema checking and detailed diagnostics.
5. **Read-Only Client**: Implement `src/lib/knowledge/client.ts` with timeouts, cancellation, bounded retries, and zero-auth read-only architecture.
6. **Local Cache Service**: Implement `src/lib/knowledge/cache.ts` integrating with extension storage, version comparison, and atomic rollback.
7. **Consumer Service**: Implement `src/lib/knowledge/service.ts` exposing course-scoped read and search APIs.
8. **Settings UI**: Integrate compact Neo-Brutalist knowledge base sync section into `SettingsTab.tsx`.
9. **Tests**: Create comprehensive Vitest test suite (`src/test/knowledge-foundation.test.ts`) covering all 22 test scenarios.
10. **Documentation**: Create `knowledge-base/README.md`, `knowledge-base/schema/README.md`, and `docs/KNOWLEDGE_BASE.md`.
11. **Verification**: Run `npm run typecheck`, `npm test`, `npm run build`.
