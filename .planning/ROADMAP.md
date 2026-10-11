# Roadmap — swayam404

## Milestone 1: Core Extension MVP (Complete)
- [x] Phase 1: Repository inspection, project setup, manifest, and React UI foundation.
- [x] Phase 2: Course management, answer-bank schema, local persistence, import/export.
- [x] Phase 3: Layered matching engine and comprehensive unit tests.
- [x] Phase 4: Site-adapter interface, visible-page scanner, and local assignment fixtures.
- [x] Phase 5: Review workflow and approved answer population.
- [x] Phase 6: Error handling, accessibility, security review, build verification, and documentation.

---

## Milestone 2: Course Completion Mode (Complete)

### Phase 1: Audit Current Modules
- [x] Inspect existing scanner, matcher, course models, storage service, and DOM adapter.
- [x] Document extension points for course outline discovery and workflow checkpoints.

### Phase 2: Course Identity Mapping & Answer-Bank Readiness
- [x] Define data models: `CourseMapping`, `CourseTask`, `TaskStatus`, `TaskType`, `CourseReadiness`, `WorkflowCheckpoint`.
- [x] Implement course mapping store (`swayam404_course_mappings_v1`) with association logic.
- [x] Implement answer-bank readiness analyzer (usable answers, verified count, sample data flag, exact match coverage).
- [x] Add `autoPopulateExactVerified` preference to settings (default: false).

### Phase 3: Course Outline Discovery & Task Queue
- [x] Extend `ISiteAdapter` and `SwayamPortalAdapter` to parse course outline navigation (`scanCourseOutline`).
- [x] Extract units, weeks, assignments, quizzes, practice tests, and visible portal completion badges ("Submitted", checkmarks, scores).
- [x] Create mock course outline HTML fixture (`public/fixtures/economics-course-outline.html`).
- [x] Implement persistent Task Queue store (`swayam404_task_queues_v1`).

### Phase 4: One-Click Assignment Preparation Pipeline
- [x] Build `prepareAssignment` pipeline: tab check -> course mapping verification -> readiness check -> question scan -> matching -> verified auto-populate (if enabled) -> itemized report.
- [x] Transparent report showing exact populated, review required, and unmatched items.
- [x] Ensure non-submitting safety boundary is 100% maintained.

### Phase 5: Course Completion Dashboard & UI Integration
- [x] Build `CourseCompletionDashboard` component with course mapping card, readiness indicator, summary metrics, and task queue cards.
- [x] Add "Prepare Course" and "Prepare Current Assignment" actions.
- [x] Add Course Mapping modal/selector for unmapped portal courses.
- [x] Integrate into main navigation without disturbing Scanner, Courses, Import/Export, or Settings tabs.

### Phase 6: Course-Level Orchestration Workflow ("Prepare Course")
- [x] Implement sequential task runner processing ready tasks one by one.
- [x] Pause with clear instructions when student manual review, unknown answers, or submission is required.
- [x] Checkpoint saving and resumption after popup reload or restart.
- [x] Queue reset capability without touching stored answer banks.

### Phase 7: Regression Testing, Build Verification & Documentation
- [x] Comprehensive unit & integration tests covering mapping, readiness, task queue, single assignment prep, outline scanning, and submit immunity.
- [x] Run `npm run typecheck`, `npm test`, `npm run build`.
- [x] Update `README.md` and `.planning/STATE.md`.

---

## Milestone 3: AI-Powered Knowledge, Graph Retrieval & Dual LLM (Gemini 2.5 + xAI Grok)

### Phase 1: Dual LLM Provider (Gemini 2.5 & xAI Grok)
- [x] Migrate Google Gemini to `gemini-2.5-flash` with auto-migration from deprecated `gemini-2.0-flash`.
- [x] Implement `GrokProvider` (xAI `/v1/chat/completions` & `/v1/models`) with structured JSON schema and connection testing.
- [x] Update `SettingsTab.tsx` with dual provider configuration (Gemini / Grok), API keys, model presets, and custom model inputs.
- [x] Update `manifest.json` host permissions for `generativelanguage.googleapis.com` and `api.x.ai`.

### Phase 2: High-Performance Retrieval Engine (Hash Map + Knowledge Graph + Dynamic Programming)
- [x] Implement `HashMapIndex`: O(1) multi-key lookup for normalized questions, token inverted index, concept index, and course materials.
- [x] Implement `KnowledgeGraph`: Entities, Questions, Answers, Concepts, Course Notes nodes with directed weighted edges and multi-hop pathfinding.
- [x] Implement `DPSequenceMatcher` & `DPRetrievalEngine`: Wagner-Fischer edit distance, Smith-Waterman local alignment, token LCS DP, and optimal path recurrence.
- [x] Integrate into `RetrievalService` and `MatchingEngine`.

### Phase 3: UI Integration, Test Suites & Build Verification
- [x] Update `ScannerTab` and `CourseCompletionDashboard` to surface Graph/DP match evidence.
- [x] Comprehensive unit tests for Grok provider, Gemini 2.5, Hash Map Index, Knowledge Graph, and DP Sequence Matcher (84 tests passing).
- [x] Verify TypeScript types, Vitest suites (all pass), and package production `dist/`.

---

## Milestone 4: Full Pipeline Audit, Diagnostics Tracing & Root-Cause Fix (Complete)

### Phase 1: Answer-Resolution Pipeline Architecture & Diagnostics Tracer
- [x] Implement `AnswerResolutionPipeline`: Stages A (Historical Exact), B (DP/Graph Similarity), C (Course Materials), D (LLM Fallback), E (Explicit Result States).
- [x] Implement `PipelineDiagnosticsTracer`: Privacy-conscious 16-step trace recording input/output counts, latency, and failure reasons without logging sensitive tokens.
- [x] Ensure empty answer bank immediately proceeds to Course Materials and LLM fallback instead of halting.

### Phase 2: Remove Answer-Bank Gates & Explicit Error Resolution in Providers
- [x] Update `getCourseReadiness()`: Course is ready if usable historical answers exist OR if AI provider is configured.
- [x] Update provider error handling: Never disguise provider errors (404, 401, quota, timeout) as "no matching question found in answer bank".
- [x] Assign explicit typed terminal states: `portal-confirmed`, `student-reviewed`, `ai-suggested`, `ambiguous`, `unresolved`, `provider-error`, `population-failed`.
- [x] Support provider retry/fallback policy on eligible errors without switching on auth failures.

### Phase 3: UI Enhancements & Diagnostics Panel
- [x] Update `ScannerTab.tsx` and `CourseCompletionDashboard.tsx` to use `AnswerResolutionPipeline`.
- [x] Add explicit status badges, error banners, and direct "Analyze with AI" triggers.
- [x] Add downloadable/viewable redacted diagnostics panel for development inspection.

### Phase 4: 20 Comprehensive Regression Tests & Build Verification
- [x] Implement 20 required regression tests covering empty bank, missing key, provider error, hallucinated options, multi-select, course isolation, retry policy, and population safety.
- [x] Run `npm run typecheck`, `npm test` (104 passing tests across 10 suites), `npm run build`, and inspect `dist/`.

---

## Milestone 5: Neo-Brutalist UI/UX Overhaul (Google Stitch Integration) (Complete)

### Phase 1: Neo-Brutalist Tokens, Fonts & Global Layout Architecture
- [x] Add Space Grotesk & Inter font links to `popup.html` and `sidepanel.html`.
- [x] Define complete Neo-Brutalist design tokens in `src/index.css` (cream `#f5f0e8` paper canvas, stark `#1a1a1a` borders, `#ffcc00` yellow accents, `#e63b2e` coral red, hard drop shadows `4px 4px 0px #1a1a1a` and `6px 6px 0px #1a1a1a`, responsive 440px popup and sidepanel).

### Phase 2: Neo-Brutalist Header, Marquee Strip & Navigation
- [x] Overhaul `Header.tsx` with SWAYAM + 404 yellow tag, red square "MANUAL SUBMISSION ONLY" safety badge, course selector, and sidepanel switcher.
- [x] Add Top Global Marquee indicator with pulsating yellow light and live telemetry indicators.
- [x] Overhaul `Navigation.tsx` with brutalist sharp uppercase tabs and badges.

### Phase 3: Neo-Brutalist Dashboard Transformation
- [x] Overhaul `DashboardTab.tsx` with Executive Clarity Hero, segmented 8-part milestone progress bar, 4-pillar consolidated metric strip, master CTA card ("SCAN CURRENT ASSIGNMENT"), recent operational audit log, and zero-ban strict safety protocol guarantee box.

### Phase 4: Neo-Brutalist Scanner & Review Workspace
- [x] Overhaul `ScannerTab.tsx` with top workspace control bar, "PREPARE QUIZ" master button, 4-pillar metric strip, brutalist question review cards (Portal Confirmed with SHA-256 match and provenance drawer, AI Suggested with Gemini/Grok lecture citations, Ambiguity side-by-side comparison grid, Numerical Arc calculation), and bottom action bar with safe population modal.

### Phase 5: Verification & Production Build
- [x] Verify all 105 tests pass (`npm test`).
- [x] Verify TypeScript types (`npm run typecheck`) and produce production build (`npm run build`).

---

## Milestone 6: UI Clutter Reduction & Web AI Auto-Pilot (Complete)
- [x] Clutter elimination across Header, Navigation, Dashboard, and Scanner tabs.
- [x] ChatGPT & Claude Web content script bridge for auto-pilot prompt injection and answer extraction.
- [x] 151 Vitest regression tests passing.

---

## Milestone 7: Zero-Click End-to-End Auto-Pilot (ChatGPT Auto-Redirect, Automatic Answer Ingestion & Radio Button Auto-Marking) (Complete)

### Phase 1: Background Service Worker Tab Redirection & Session Tracking
- [x] Add `"tabs"` permission to `manifest.json`.
- [x] Implement SWAYAM tab session registration and active tab switching in `src/background/index.ts`.
- [x] Forward answers directly to the active SWAYAM tab via extension messaging.

### Phase 2: ChatGPT Bridge Auto-Redirect
- [x] Update `src/content/chatgptContent.ts` to trigger tab switch to SWAYAM immediately upon answer extraction.
- [x] Update status pill with redirect indication.

### Phase 3: SWAYAM In-Page Auto-Population & Feedback
- [x] Add answer sync listener in `src/content/index.ts`.
- [x] Auto-match options and mark radio buttons / checkboxes in the live DOM.
- [x] Display in-page Neo-brutalist toast confirming marked answers with zero auto-submit guarantee.
- [x] Update `ScannerTab.tsx` so "Paste & Mark" executes population in 1 click and restores state.

### Phase 4: Regression Tests & Verification
- [x] Unit & integration tests for tab switching, auto-population trigger, and radio marking safety (`autopilot-redirect-and-marking.test.ts`).
- [x] Verify Vitest (all 156 tests passing across 13 test files), TypeScript typecheck (0 errors), and package production `dist/`.

---

## Milestone 9: Shared Knowledge Base Foundation (Complete)

### Phase 1: Shared Knowledge Base Architecture, Validation & Safe Caching
- [x] Establish `knowledge-base/` data directory: Draft-07 schemas (`manifest.schema.json`, `course.schema.json`, `resource.schema.json`, `review-record.schema.json`), catalog `manifest.json`, course packs (`course-econ-101`, `course-ent-201`), synthetic templates (`examples/`), and validation CI workflow (`.github/workflows/validate.yml`).
- [x] Build typed validation engine in `src/lib/knowledge/validator.ts` checking schema versions, required fields, enums, course IDs, timestamps, semver, and SHA-256 integrity hashes.
- [x] Build security utilities in `src/lib/knowledge/security.ts` rejecting path traversal (`..`, absolute paths, backslashes, null bytes) and deterministic integer semver comparison.
- [x] Build unauthenticated, read-only remote client in `src/lib/knowledge/client.ts` with timeout, cancellation, bounded retries, and zero-token architecture.
- [x] Implement local caching engine in `src/lib/knowledge/cache.ts` and `src/lib/storage/index.ts` with atomic commit, version diffing, offline-first fallback, and last-valid-cache preservation.
- [x] Expose course-scoped read interface in `src/lib/knowledge/service.ts` for future retrieval integration with released review records isolation.
- [x] Add compact Neo-Brutalist knowledge base settings section in `src/features/settings/SettingsTab.tsx`.
- [x] Comprehensive Vitest test suite (`src/test/knowledge-foundation.test.ts`) covering all 22 required test scenarios (211 passing tests across 15 suites).
- [x] Documentation in `knowledge-base/README.md`, `knowledge-base/schema/README.md`, and `docs/KNOWLEDGE_BASE.md`.

### Phase 2: Shared Knowledge Retrieval Integration & Evidence-Aware AI
- [x] Connect KnowledgeBaseService to course-material retrieval system with unified evidence result models.
- [x] Implement deterministic ranking, token matching, DP/graph relevance, and deduplication of local and cached shared resources.
- [x] Grounded AI context construction with bounded token budget and anti-fabrication rules for LLMs.
- [x] Strict separation of source evidence and portal-confirmed verification status.
- [x] Review UI evidence affordance in ScannerTab with source provenance and offline resilience.
- [x] Course/unit/lecture-scoped resource search API.
- [x] Comprehensive unit tests (22 test scenarios) and build verification (233 passing tests).

### Phase 3: Community Knowledge Contributions, Provenance and Course Metadata
- [x] Define contribution lifecycle states and typed models (`draft`, `pending-validation`, `validation-failed`, `ready-for-review`, `rejected`, `approved`, `exported`, `published`).
- [x] Implement reusable ContributionBuilder for authorized learning resources and eligible released feedback.
- [x] Implement ConflictService for exact content-hash duplicates, ID collisions, and conflicting answers.
- [x] Build ContributionExporter with portable JSON packaging, validation checks, and GitHub PR guide.
- [x] Implement syllabus metadata extraction for units, weeks, lectures, and topics.
- [x] Add Contribution Preview UI in ImportExportTab / CapturePreviewModal.
- [x] Create standalone maintainer validation CLI script (`scripts/validate-contributions.mjs`).
- [x] Comprehensive automated test suite (25 test scenarios, 258 passing tests) and documentation.

### Phase 4: Production Course Packs, Resource Ingestion & Intelligent Knowledge Sync
- [x] Establish a repeatable ingestion pipeline for real, authorized course resources (`src/lib/knowledge/ingestionService.ts`).
- [x] Organize course resources into validated, versioned course packs (`src/lib/knowledge/packBuilder.ts` & `scripts/build-course-packs.mjs`).
- [x] Improve course, unit, week, lecture, and topic indexing where source data supports it.
- [x] Reduce unnecessary remote downloads through conditional requests (ETag/304) and course-selective updates (`client.ts` & `cache.ts`).
- [x] Make the local cache and retrieval system reliable at larger dataset sizes (>500 chunks) via course-scoped inverted chunk index (`chunkIndex.ts`).
- [x] Validate complete publish-and-update lifecycle with 30 focused tests and performance benchmarks.

### Phase 5: First Real Course Pack, End-to-End Validation & College Pilot Readiness
- [x] Audit pack integrity and verify zero placeholder hashes (`e3b0c442...`) in published packs.
- [x] Author pilot course onboarding inventory (`course-econ-101`) mapped to portal outline and feedback fixtures.
- [x] Validate end-to-end ingestion and course-pack generation pipeline with mathematical formatting preservation.
- [x] Real wire remote HTTP server synchronization testing (ETag/304, course-selective sync, update detection, offline fallback).
- [x] Course-scoped retrieval, unit/week filtering, and evidence provenance verification in Scanner & Review.
- [x] 22 dedicated lifecycle and pilot-readiness automated tests (`src/test/knowledge-pilot-lifecycle.test.ts`).
- [x] College pilot maintainer readiness report and pilot checklist (`docs/PILOT_READINESS_REPORT.md`).

### Phase 6: Live Knowledge Deployment, Privacy-Preserving Diagnostics & College Pilot
- [x] Audit repository publication readiness, verify live Git reachability, and catalog synthetic vs authorized resources.
- [x] Build privacy-preserving diagnostic export engine with secret redaction, URL sanitization, and strict exclusion of questions, answers, and student identities.
- [x] Implement robust diagnostic correlation with random local run IDs and bounded event telemetry.
- [x] Add diagnostic export preview modal with explicit data category inspection in extension UI.
- [x] Author 20-item maintainer pilot diagnostic checklist and user installation guide (`docs/PILOT_DIAGNOSTIC_CHECKLIST.md`).
- [x] Author maintainer course onboarding guide (`docs/COURSE_ONBOARDING_GUIDE.md`) and 5–10 volunteer student pilot guide (`docs/COLLEGE_PILOT_GUIDE.md`).
- [x] Expand automated test suite with comprehensive privacy, redaction, correlation, and live readiness verification (331 tests passing across 20 suites).
- [x] Verify TypeScript types, Vitest suites, production build, and course-pack builder tools.

### Phase 7: First Public Knowledge Release & Live Deployment Verification
- [x] Audit publication dataset and strictly classify all resources into synthetic fixtures vs genuine authorized materials.
- [x] Enhance validation and packaging tooling with automated release-readiness classification and summary reporting (`scripts/validate-contributions.mjs`).
- [x] Strengthen repository URL security validation in `src/lib/knowledge/security.ts` and `client.ts` (strict HTTP/HTTPS, reject embedded credentials, safe unconfigured handling).
- [x] Author comprehensive 12-dimension verification matrix, release guide, and manual publication checklist (`docs/PUBLIC_KNOWLEDGE_RELEASE_CHECKLIST.md`).
- [x] Create comprehensive automated test suite for Phase 7 publication verification (`src/test/knowledge-release-publication.test.ts`) (16 tests, 347 total passing).
- [x] Verify production extension package (`dist/`), unpack loading workflow, submission immunity, and privacy guarantees.
- [x] Verify all quality gates: typecheck, 347 tests, production build, deterministic pack generation, and contribution validation.




