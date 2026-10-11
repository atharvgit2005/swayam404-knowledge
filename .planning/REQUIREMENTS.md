# Requirements — swayam404

## Functional Requirements (Core Foundation)
- **FR-1: Course Management**
  - CRUD operations for courses.
  - Initial default courses: Economics (Shared/Common), Entrepreneurship (Minor).
  - Selected course persisted in storage.
  - Strict course isolation (Economics answer bank never matches Entrepreneurship questions).

- **FR-2: Answer-Bank Schema & Storage**
  - Strongly typed schema for `Course` and `QuestionRecord`.
  - Question types: `single-choice`, `multiple-choice`, `true-false`, `short-text`.
  - Content-based answers (store option text/meaning, not brittle indices like "B").
  - Explanation, review status, source, and timestamps stored.
  - Versioned storage model (`v1`) with Chrome Local Storage persistence.

- **FR-3: Import / Export**
  - Export single course or full backup to versioned JSON.
  - Import JSON with schema validation, course preview, and question count.
  - Merge vs Replace strategies.
  - Duplicate detection.
  - Clear validation error reporting.

- **FR-4: Assignment Scanning (Content Script & Site Adapter)**
  - Active tab verification and safe messaging.
  - Semantic question container discovery.
  - Radio, checkbox, select, and text input extraction with label resolution.
  - Site adapter pattern decoupling SWAYAM / mock selectors from core business logic.
  - Multiple question discovery per page.

- **FR-5: 3-Level Matching Engine**
  - Level 1: Normalized exact text matching.
  - Level 2: Deterministic conservative similarity.
  - Level 3: Ambiguity detection (numerical differences, negation detection like 'not'/'except', altered options).
  - Strict status badges: Exact Match, Probable Match (Review Required), Ambiguous Match, No Match, Unsupported Type.

- **FR-6: Match Review Interface**
  - Question list with question number, type, status badge, matched saved answer, current choices.
  - Filterable by match status.
  - Granular checkboxes for student approval.
  - Metrics: Total scanned, exact matches, requiring review, unmatched, selected for population.
  - Manual correction / answer selection capability.

- **FR-7: Safe Approved Form Population**
  - Populates ONLY approved fields upon student clicking "Populate Selected Answers".
  - Dispatches native `input`, `change`, `click` events with full React/framework controlled input support.
  - Reports success, failure, and skipped count per field.
  - Absolutely NO auto-submission, no clicking "Submit", no background form submission.

- **FR-8: Optional AI-Assisted Review Architecture**
  - Pluggable interface for explaining unmatched questions and proposing candidate answers.
  - Disabled by default, requiring explicit user API key/proxy config.
  - Never auto-populates AI answers without explicit user review and saving.

- **FR-9: Test Fixtures & Local Mocking**
  - Standalone mock assignment HTML pages representing SWAYAM assignment formats.
  - Unit and integration tests demonstrating scanning, matching, isolation, and population.

## Course Completion Mode Requirements (Milestone 2)
- **CC-1: Course Identity & Mapping**
  - Distinguish extension profile, detected portal course title, external course ID, and assignment title.
  - Local mapping table linking detected portal course strings to local course profile IDs.
  - Warn when portal course is unmapped; allow quick association or profile creation.
  - Strict cross-course isolation maintained.

- **CC-2: Answer-Bank Readiness Assessment**
  - Pre-flight readiness check: stored question count, usable answers count, verified answers count, sample-data tag detection.
  - Prohibit misleading preparation if answer bank has zero usable answers or is missing.
  - Prominent warning when bank contains only fictional sample data.

- **CC-3: Course Discovery & Task Queue**
  - Parse visible course outline navigation (weeks, assignments, quizzes, practice, feedback).
  - Extract stable local task IDs, titles, types, URLs/navigation targets, and visible completion markers.
  - Task statuses: `not-scanned`, `ready-to-prepare`, `prepared`, `needs-attention`, `awaiting-submission`, `completed`, `unsupported`, `error`.
  - Completion inferred strictly from visible portal badges (e.g. "Submitted", score, checkmark), never invented.

- **CC-4: Course Completion Dashboard**
  - Metrics: Selected Course, Detected Portal Course, Mapping Status, Tasks Identified, Completed by Portal, Ready to Prepare, Known Answers, Needs Attention, Awaiting Submission, Last Scan Time.
  - Quick actions: "Prepare Course" and "Prepare Current Assignment".
  - Existing Scanner, Courses, Import/Export features remain fully accessible.

- **CC-5: One-Click Assignment Preparation**
  - End-to-end automated pipeline for current assignment.
  - Controlled setting: `autoPopulateExactVerified` (default: false, student must opt-in).
  - When enabled: automatically populates exact, verified matches.
  - Probable / ambiguous / unmatched questions left untouched and clearly displayed with explanation/reasons.

- **CC-6: Course-Level Orchestration Workflow ("Prepare Course")**
  - Processes visible course tasks in sequence when navigation is reliable.
  - Stops cleanly when human intervention, manual submission, or unverified questions occur.
  - Recovery checkpointing across popup close and browser restart.

- **CC-7: Strict Submission Boundary**
  - Under NO circumstances clicks submit controls or triggers final commits.
  - Leaves student at the normal quiz page with platform submit button ready.

- **CC-8: State Persistence & Reset**
  - Versioned storage keys for course mappings, task queue, and workflow checkpoints.
  - Safe reset option that resets task queue state without touching stored answer banks.

## Milestone 7: Zero-Click End-to-End Auto-Pilot Requirements
- **AP-1: ChatGPT Auto-Redirect Back to SWAYAM**
  - Immediately upon ChatGPT (or Claude) completing answer generation and extraction, the extension must switch focus / redirect active tab back to the SWAYAM assignment tab.
  - Background service worker tracks original SWAYAM tab ID and URL to activate the window and tab automatically.
- **AP-2: Automated Answer Ingestion & Radio Button Marking**
  - SWAYAM content script listens directly for synced answers.
  - Automatically matches options and marks radio buttons / checkboxes directly in the page DOM.
  - Eliminates the need to manually click "Paste Answers" and then "Apply Answers".
- **AP-3: Single-Click Manual Paste & Mark Fallback**
  - If the user uses the manual Paste button in the extension UI, it parses and marks the radio buttons on the page in a single unified action.
- **AP-4: In-Page Feedback Toast**
  - Neo-brutalist floating banner on the SWAYAM page confirming marked answers count and instructing student to review before clicking Submit.
- **AP-5: Strict Zero Auto-Submit Safety Guarantee**
  - All radio buttons and checkboxes are marked automatically, but native Submit buttons remain completely untouched.

## Milestone 9: Phase 4 — Production Course Packs, Resource Ingestion & Intelligent Knowledge Sync
- **KB-4-1: Repeatable Resource Ingestion Pipeline**
  - Converts authorized source material (Markdown notes, study guides, transcripts, instructor notes, worked examples, external references) into valid `KnowledgeResource` and `KnowledgeResourceChunk` entities.
  - Normalizes whitespace, preserves mathematical notation (LaTeX formulas and symbols).
  - Collects provenance and redistribution permissions; restricts unverified/local-only material from public packs.
  - Generates deterministic IDs and content hashes.
- **KB-4-2: Stable Chunking & Indexing**
  - Splits long resources into bounded, searchable chunks with stable chunk IDs (`${resourceId}-chunk-${index}`).
  - Preserves parent resource, course, unit/week, lecture, provenance, and content hash in each chunk.
  - Exact duplicate detection (SHA-256) and similarity collision flagging (>0.85).
- **KB-4-3: Production Course Packs & Pack Builder Tool**
  - Compiles validated, versioned course packs (`course.json`, `resources.json`, `review-records.json`).
  - Verifies relative paths, unique IDs, SHA-256 hashes, redistribution permissions.
  - Generates root `manifest.json` and course catalog `courses/index.json`.
  - Maintainer CLI tool (`scripts/build-course-packs.mjs`) reports exact changed files and validation status.
- **KB-4-4: Efficient Remote Synchronization & Conditional Requests**
  - Supports HTTP conditional requests (`ETag` / `If-None-Match`, `Last-Modified` / `If-Modified-Since`, HTTP 304).
  - Course-selective download (downloads only packs needed for selected courses).
  - Single-flight lock preventing concurrent overlapping syncs.
  - Partial course failure resilience: one failing course does not wipe out or corrupt other cached courses.
  - Preserves valid cache on network failure, timeout, or schema incompatibility.
- **KB-4-5: Scalable Inverted Chunk Index & Retrieval**
  - Course-scoped inverted chunk index supporting fast retrieval across >500 resource chunks.
  - Scoped filtering by unit/week, lecture, and topic.
  - Rebuilds deterministically on resource updates with corruption recovery fallback.

## Milestone 9: Phase 5 — First Real Course Pack, End-to-End Validation & College Pilot Readiness
- **KB-5-1: Hash Integrity & Anti-Placeholder Audit**
  - Canonical SHA-256 integrity verification across all published course packs and manifests.
  - Absolute exclusion of empty-input SHA-256 (`e3b0c442...`) from published records.
  - Deterministic idempotency: repeated builds produce identical output.
- **KB-5-2: Real Course Pilot Onboarding Inventory**
  - Onboard and map `course-econ-101` to portal syllabus and released assignment feedback.
  - Transparent attribution, CC-BY / open licensing, and documented required instructor inputs.
- **KB-5-3: End-to-End Wire Remote Sync with Local HTTP Server**
  - Controlled native Node.js HTTP server fixture validating real wire transmission.
  - ETag / HTTP 304 conditional request handling and bandwidth optimization.
  - Course-selective download, atomic cache update, and server-failure cache preservation.
- **KB-5-4: Real Retrieval & Evidence Display Verification**
  - Course-scoped search, unit/week filtering, Smith-Waterman local alignment, and source provenance drawer display.
  - Strict course isolation: zero cross-course leakage.
- **KB-5-5: College Pilot Readiness & Diagnostic Maintenance Report**
  - Maintainer operations report with measured values for dataset version, course count, chunk count, retrieval latency.
  - Small cohort pilot checklist, privacy policy (zero cross-student tracking), and failure recovery procedures.

## Milestone 9: Phase 6 — Live Knowledge Deployment, Privacy-Preserving Diagnostics & College Pilot
- **KB-6-1: Live Publication Readiness & Anti-Synthetic Resource Inventory**
  - Complete readiness audit verifying local files, deterministic builds, and live GitHub remote reachability (unauthenticated HTTP GET).
  - Explicit distinction between local test fixtures and live public repository status.
  - Classification of all resources: synthetic fixtures, real learning materials, metadata references, local resources, released review records, and missing permissions.
  - Strict assessment boundary: zero publication of active assessment questions or unreleased answer keys.
- **KB-6-2: Privacy-Preserving Diagnostic Exporter**
  - User-initiated export action producing a strictly sanitized JSON report.
  - Includes application version, browser compatibility, dataset version, cached pack versions, sync timestamps and duration, retrieval duration, cache hit/miss counts, provider outcome categories, aggregate scan counts, sanitized error codes, testable stage identifiers.
  - Strictly excludes: question text, answer text, student names, emails, roll numbers, account IDs, cookies, auth tokens, API keys, full URLs with sensitive query params, full page HTML, and private lecture note text.
  - Error sanitization, stack trace redaction, and omission of unsanitizable records.
  - In-UI preview displaying exported categories before saving. Local export only (zero server transmission).
- **KB-6-3: Robust Diagnostic Correlation & Bounded Telemetry Storage**
  - Random local run ID per diagnostic session (not derived from student identity or browser fingerprint).
  - Discrete event categories: scan started/completed/failed, knowledge sync started/completed/failed, cache hit/miss, resource search, AI provider requests, response parsing, population.
  - Bounded storage buffer with FIFO eviction preventing memory or storage growth.
- **KB-6-4: Maintainer Pilot Diagnostic Checklist & User Installation Guide**
  - 20-item maintainer checklist markable as pass, fail, blocked, or not tested.
  - Step-by-step student installation and troubleshooting guide.
- **KB-6-5: Course-Specific Onboarding Guide for Maintainers**
  - Step-by-step maintainer guide for onboarding new courses into the knowledge base repository.
  - Checklist of prerequisite files and permissions needed from course instructors.
- **KB-6-6: Live Deployment Verification & Small Volunteer Pilot Guide**
  - Verification procedure for live GitHub repository or clear marking of remote status as BLOCKED.
  - Protocol for conducting a 5–10 volunteer student pilot with zero personal data collection.

## Milestone 9: Phase 7 — First Public Knowledge Release & Live Deployment Verification
- **KB-7-1: Publication Dataset Audit & Classification**
  - Strict classification of all repository courses and resources: synthetic benchmark fixture, genuine authorized learning resource, metadata-only reference, local-only resource, released-review record, or unverified/blocked.
  - Prohibition on inferring redistribution permission from license label alone; required explicit evidence/provenance.
  - Clear separation of development benchmark fixtures from public production datasets.
- **KB-7-2: Release Tooling & Readiness Reporting**
  - Validation script enhancement (`scripts/validate-contributions.mjs`) to compute and report release readiness counts (synthetic fixtures, genuine resources, released reviews, readiness status).
  - Deterministic course pack build verification (`scripts/build-course-packs.mjs --check-only`).
  - Validation of schemas, course IDs, SHA-256 hashes, semver compatibility, and catalog consistency.
- **KB-7-3: Secure Remote Repository URL Configuration**
  - Strict URL validation rejecting embedded credentials (`user:pass@`), unsupported schemes (only `http:` and `https:` permitted), and path traversal.
  - Graceful handling of unconfigured repository URLs with clear instructions and safe defaults.
  - Unauthenticated, zero-token read-only network access pattern.
- **KB-7-4: Cache Preservation & Failure Immunity**
  - Verified immunity of valid cached data: network drops, HTTP 500/502/503 errors, and malformed responses never overwrite or corrupt existing valid cache.
  - High-performance chunk-level retrieval (<30ms query latency) from cached course packs.
- **KB-7-5: Production Extension Verification & Submission Immunity**
  - Verification of unpacked extension in `dist/` for Brave/Chrome.
  - Verification that zero automatic assignment submission occurs at any point in the workflow.
  - Strict offline accessibility for already-synchronized course packs.
- **KB-7-6: Release Checklist & Honest Deployment Status**
  - Creation of `docs/PUBLIC_KNOWLEDGE_RELEASE_CHECKLIST.md` with 12 verification dimensions, each marked PASS, FAIL, BLOCKED, or NOT TESTED.
  - Honest marking of live remote deployment as BLOCKED pending maintainer GitHub repository creation.




