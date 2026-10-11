# Phase 2 Plan: Shared Knowledge Retrieval Integration & Evidence-Aware AI

## Objective
Integrate the completed Phase 1 shared knowledge-base foundation into Swayam404's existing course-material retrieval and answer-resolution architecture:
1. Make authorized, validated shared course knowledge available to the existing retrieval system.
2. Ground AI explanations in relevant source material with bounded token budgets.
3. Expose source evidence with complete provenance in the review interface.
4. Maintain strict course isolation, offline resilience, and zero auto-submission safety boundaries.

## Architecture & Data Flow

```
+-------------------------------------------------------------+
|             Cached Shared Knowledge Packs (Phase 1)         |
|     (course-econ-101, course-ent-201 in chrome.storage)     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               KnowledgeBaseService (Read APIs)              |
|        - searchCourseResources(courseId, query, filters)     |
|        - getCourseResources(courseId)                       |
+-------------------------------------------------------------+
                               |
                               +--------------------+
                               |                    |
                               v                    v
                 +--------------------------+ +------------------------+
                 | Local Course Materials   | | Cached Shared KB Packs |
                 | (StorageService)         | | (KnowledgeCacheService)|
                 +--------------------------+ +------------------------+
                               |                    |
                               v                    v
+-------------------------------------------------------------+
|           CourseMaterialRetrievalService (Unified)          |
|  1. Strict Course Isolation filter (courseId)                |
|  2. Token extraction & normalizer integration               |
|  3. Metadata filters: topic, unit/week, lectureId           |
|  4. Grounded scoring: Title (6x), Topic (4x), Content (2x),  |
|     Exact phrase bonus (+10), Type weight, DP Smith-Waterman|
|  5. Deduplication: resourceId + contentHash                 |
|  6. Deterministic tie-breaking by resourceId ascending       |
|  7. Output: Bounded RetrievedExcerpt[] with rich provenance |
+-------------------------------------------------------------+
                               |
                               +--------------------+
                               |                    |
                               v                    v
+-----------------------------------------+ +----------------------------------+
| AnswerResolutionPipeline (Stages C & D) | | ScannerTab Review UI             |
|  - Pass bounded evidence to LLMs        | |  - Neo-Brutalist Evidence Drawer |
|  - Anti-hallucination / anti-fabrication| |  - Source title, URL, lecture ID |
|  - Record evidence on QuestionResult    | |  - Local vs Shared KB indicator  |
|  - Never upgrade AI to portal-confirmed | |  - Honest "No source found" state|
+-----------------------------------------+ +----------------------------------+
```

## Implementation Phases
- **Task 1**: Update Types (`src/types/knowledge.ts`, `src/types/index.ts`, `src/lib/ai/types.ts`) with unified evidence fields and search filter options.
- **Task 2**: Enhance `KnowledgeBaseService` with course/unit/lecture/topic-scoped search APIs and deterministic sorting.
- **Task 3**: Upgrade `CourseMaterialRetrievalService` with unified local + shared knowledge retrieval, deterministic ranking, deduplication, and tie-breaking.
- **Task 4**: Integrate unified evidence retrieval into `AnswerResolutionPipeline` and AI provider prompt builders (`GeminiProvider`, `GrokProvider`, `OpenaiProvider`) with bounded context budgets and strict provenance recording.
- **Task 5**: Implement compact Neo-Brutalist evidence affordance and inspection drawer in `ScannerTab.tsx`.
- **Task 6**: Implement 22 comprehensive regression tests in `src/test/knowledge-retrieval-evidence.test.ts`.
- **Task 7**: Run full test suite, typecheck, build verification, and sidepanel layout inspection.
