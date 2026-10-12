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

### Phase 8: Reliable Update Architecture & Release Versioning Consistency (Complete)
- [x] Strict architectural separation between remote knowledge-base updates (static JSON datasets) and immutable extension-code updates.
- [x] Background update checks (`chrome.alarms` periodic 6-hour alarm, `onInstalled`, `onStartup`) with badge notifications and explicit update state machine (`up-to-date`, `update-available`, `downloading`, `updated`, `offline`, `update-failed`, `unconfigured`).
- [x] Conditional requests (ETag/304), course hash comparison, zero unnecessary full-repo downloads, and atomic commits preserving the previous valid cache on failure.
- [x] Offline startup and later synchronization with dynamic course catalog auto-registration.
- [x] Extension-code versioning policy: SemVer consistency audit (`scripts/verify-versions.mjs`), visible installed version in Settings & popup footer, honest Developer Mode reload documentation, and unlisted Web Store preparation packaging (`scripts/package-zip.mjs`).
- [x] Zero remote code execution (`script-src 'self'`), zero remote script evaluation, zero stored browser or GitHub tokens.
- [x] Official website audit (`https://swayam404.vercel.app/`): current version display (v1.0.0), clear separation between pre-built extension ZIP and knowledge-base repository, release highlights changelog, and honest manual update instructions for unpacked mode.
- [x] Comprehensive automated test suite (`src/test/knowledge-updates-and-versioning.test.ts`) covering all 10 acceptance criteria (367 total passing tests across 22 test files).
- [x] Full quality gates passed: `npm run typecheck`, `npm test`, `npm run build`, and `node scripts/validate-contributions.mjs`.

### Phase 9: Local-Only Installer & Updater Prototype (Complete)
- [x] Built local release environment (`scripts/generate-local-release.mjs`) generating verified ZIP packages, SHA-256 checksums, and `local-releases/latest.json` metadata.
- [x] Implemented lightweight development-only local update server (`local-update-server/server.mjs`) strictly bound to `127.0.0.1` (loopback only) with `/health`, `/latest.json`, and `/releases/:filename` endpoints, path traversal guards, and no remote dependencies.
- [x] Built in-extension updater client (`src/lib/updater/`) with robust SemVer comparison (handling multi-digit components `1.2.0` vs `1.10.0`, older/newer, prereleases), Web Crypto SHA-256 verification, and mutex concurrency protection.
- [x] Implemented interactive Neo-Brutalist updater card (`src/features/settings/ExtensionUpdaterCard.tsx`) embedded in Settings with telemetry strip, configurable server endpoint, check/download actions, and explicit unpacked Developer Mode manual reload guidance.
- [x] Covered all 10 update states: `up-to-date`, `checking`, `update-available`, `downloading`, `download-verified`, `manual-install-required`, `check-failed`, `invalid-metadata`, `checksum-mismatch`, `server-unavailable`.
- [x] Authored developer testing guide (`docs/local-installation-testing.md`) with complete walkthrough, trust model analysis, and Chrome Manifest V3 security boundaries.
- [x] Implemented automated test suite (`src/test/local-updater.test.ts`) covering all 10 scenarios (A through J).
- [x] Full quality gates verified: `npm run typecheck` (0 errors), `npm test` (377 passing tests across 23 test files), `npm run build`, and `node scripts/validate-contributions.mjs`.

### Phase 10: Updater Hardening, End-to-End Verification & Safe Local Installation Workflow (Complete)
- [x] Defined and implemented the rigid 9-stage update lifecycle: Check, Compare, Download, Verify, Stage, Apply, Reload, Confirm, Recover.
- [x] Implemented zero-dependency pure JavaScript/Web-standard ZIP entry inspector (`src/lib/updater/zipValidator.ts` and `scripts/zipValidator.mjs`) auditing Central Directory headers against Zip Slip, directory escapes (`..`), absolute paths (`/`), drive letters (`C:`), null bytes, decompression bombs (>50MB), and missing mandatory extension bundle assets (`manifest.json`, `background.js`, `popup.html`, `content.js`).
- [x] Hardened `scripts/generate-local-release.mjs` with safe process execution (`/usr/bin/zip`), strict staging validation, and pre-release bundle security verification before generating `latest.json`.
- [x] Hardened `local-update-server/server.mjs` with strict loopback validation, route whitelisting, path containment guards, null-byte rejection, and sanitized 400/404/500 error responses (zero filesystem path leakage).
- [x] Built safe local apply and recovery utility (`scripts/apply-local-update.mjs`) with safe ZIP inspection, isolated staging extraction (`local-staging/v{version}/`), automatic timestamped backup in `local-backups/`, atomic replacement in `dist/`, automatic fallback on failure, and instant `--rollback` CLI flag. Added `npm run update:apply` and `npm run update:rollback`.
- [x] Updated extension UI (`src/features/settings/ExtensionUpdaterCard.tsx`) with 9-stage visual progress indicator, clear apply guidance, "Confirm Running Version" action, and recovery/rollback instructions.
- [x] Conservative `.gitignore` updates isolating `local-staging/`, `local-backups/`, and `local-releases/*.json` without hiding source code.
- [x] Comprehensive automated test suite (`src/test/local-updater.test.ts`) covering 17 end-to-end scenarios (A through Q) including Zip Slip detection, truncated download detection, apply and rollback execution, running version confirmation, and error sanitization.
- [x] Full quality gates passed: `npm run typecheck` (0 errors), `npm test` (384 passing tests across 23 test suites), `npm run build`, and `node scripts/validate-contributions.mjs`.
- [x] Comprehensive developer documentation updated in `docs/local-installation-testing.md`.

### Phase 11: Knowledge Sync Fallback Fix & Cross-Platform Desktop Installer/Updater App (Mac & Windows) (Complete)
- [x] Fixed "Take Answers from GitHub Bank" fallback in `src/lib/knowledge/service.ts`: added bundled sample bank support for `course-econ-101` (`economics-sample.json`), `course-ent-201` (`entrepreneurship-sample.json`), and graceful starter seeds for custom courses.
- [x] Updated `src/features/settings/SettingsTab.tsx` with a one-click "Use Official GitHub Repo" shortcut, `<owner>` placeholder detection, and friendly diagnostics.
- [x] Verified and updated `CourseCompletionDashboard.tsx` for consistent answer-bank import across all courses.
- [x] Built standalone cross-platform Desktop Installer & Updater App backend (`installer-app/server.mjs`) with REST API on loopback (`127.0.0.1:52410`).
- [x] Designed responsive, dark-mode Neo-Brutalist Desktop UI (`installer-app/public/index.html`) with live status telemetry, one-click build, local server toggle, release generator, safe update apply, rollback, and live terminal console.
- [x] Created macOS desktop launchers (`installer-app/mac/Swayam404 Installer.command`, `installer-app/mac/Swayam404 Installer.app`, and root `Swayam404-Installer-Mac.command`).
- [x] Created Windows desktop launchers (`installer-app/windows/Swayam404-Installer.bat`, `installer-app/windows/Swayam404-Installer.cmd`, `installer-app/windows/Swayam404-Installer.ps1`, and root `Swayam404-Installer-Windows.bat`).
- [x] Added npm scripts in `package.json`: `"installer"` and `"installer:open"`.
- [x] Implemented dedicated automated test suite (`src/test/installer-app.test.ts`) covering system telemetry, static file serving, server toggling, and directory traversal security.
- [x] Authored comprehensive guide in `docs/desktop-installer-guide.md`.
- [x] Passed all quality gates: `npm run typecheck` (0 errors), `npm test` (390 passing tests across 24 test suites), `npm run build` (verified zero `_` filenames).

### Phase 12: GitHub Releases Live Sync & Standalone Desktop Installer Packaging (Mac & Windows) (Complete)
- [x] Implemented GitHub Releases check and asset discovery endpoint (`GET /api/github/check`) in `installer-app/server.mjs`.
- [x] Implemented GitHub release asset download, SHA-256 verification, Zip Slip audit, and atomic apply endpoint (`POST /api/github/download-and-apply`) in `installer-app/server.mjs`.
- [x] Added live GitHub sync controls, repository input, telemetry table, and live console logging into `installer-app/public/index.html`.
- [x] Built in-extension companion bridge in `ExtensionUpdaterCard.tsx` enabling 1-click update trigger from inside Chrome and instant reload button (`chrome.runtime.reload()`).
- [x] Created cross-platform extraction helper (`extractZipSafe`) supporting macOS, Linux, and Windows PowerShell natively.
- [x] Created distributable packager script (`scripts/bundle-installer.mjs`) and `"package:installer"` script producing ready packages in `dist-installer/` (`Swayam404-Installer-macOS.zip` and `Swayam404-Installer-Windows.zip`).
- [x] Authored complete website integration and maintainer distribution guide in `docs/github-release-distribution.md`.
- [x] Created automated test suite in `src/test/github-release-sync.test.ts` (6 tests).
- [x] Passed all quality gates: typecheck (0 errors), 396 tests passing across 25 suites (100%), and production build.



