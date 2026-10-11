# Phase 3: Community Knowledge Contributions, Provenance and Course Metadata

## Goal
Implement a safe, maintainable community contribution workflow for the shared learning knowledge repository, combined with enriched course/unit/topic metadata and strict provenance, validation, and conflict verification.

## Architecture

### 1. Contribution Lifecycle & State Machine
- Lifecycle states: `'draft' | 'pending-validation' | 'validation-failed' | 'ready-for-review' | 'rejected' | 'approved' | 'exported' | 'published'`.
- Strict separation between local draft saving, local package export, and actual GitHub publication.
- Zero-token architecture: no GitHub PATs or maintainer credentials stored in client extension.

### 2. Type Contracts (`src/types/knowledge.ts`)
- `ContributionState`: Staged explicit states.
- `ContributionProposal`: Typed container with stable IDs, timestamps, provenance summary, resources, review records, and validation summary.
- `ContributionManifest`: Export package manifest with schema version, hashes, counts, and maintainer instructions.
- `ConflictItem`: Detailed collision and contradiction report.
- `CourseMetadataProposal`, `CourseUnitMetadata`, `CourseLectureMetadata`: Structured syllabus hierarchy.

### 3. Contribution Services (`src/lib/knowledge/`)
- `contributionBuilder.ts`: Assembles candidate resources, lecture notes, and eligible released feedback into proposals. Sanitizes sensitive data (API keys, student IDs, cookies).
- `conflictService.ts`: Evaluates exact hash duplicates, ID collisions, conflicting answer keys, and similarity warnings without silent overwriting.
- `contributionExporter.ts`: Validates and exports deterministic JSON packages + GitHub PR markdown summary.
- `syllabusExtractor.ts`: Parses DOM/outline structures into structured syllabus metadata without fabricating missing details.

### 4. UI: Contribution Preview & Management
- Integrated in `src/features/answer-bank/ImportExportTab.tsx` and available from `CapturePreviewModal.tsx`.
- Review metadata, license, topics, conflict warnings.
- Explicit actions: Edit, Validate, Save Locally, Export Package, Copy PR Instructions.
- Neo-Brutalist responsive design at 400px sidepanel width.

### 5. Automated Tests & Maintainer Tooling
- `src/test/knowledge-contribution-lifecycle.test.ts`: 25 comprehensive Vitest tests.
- `scripts/validate-contributions.mjs`: Standalone CLI validator for maintainers and CI.
- Updated documentation in `knowledge-base/README.md` and `docs/COMMUNITY_CONTRIBUTIONS.md`.
