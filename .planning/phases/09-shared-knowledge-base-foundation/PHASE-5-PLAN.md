# Phase 5 Plan — First Real Course Pack, End-to-End Validation & College Pilot Readiness

## Objectives
1. **Repository Audit & Baseline**: Verify working tree preservation, audit `e3b0c442...` empty SHA-256 hash, and verify all published hashes match canonical content.
2. **Pilot Course Onboarding Inventory**: Inventory `course-econ-101` against portal syllabus fixtures (`economics-course-outline.html`) and feedback fixtures (`submitted-feedback-assignment.html`), documenting licenses, formats, and required instructor inputs.
3. **Deterministic Pack & Ingestion Pipeline**: Ingest representative authorized notes with LaTeX math notation, unit/week tags, and CC-BY licensing; compile packs and assert idempotency.
4. **Real Local HTTP Server Sync**: Spin up native `node:http` server to test real wire HTTP GET, ETag/304 conditional responses, course-selective downloads, atomic cache updates, and network failure cache preservation.
5. **Retrieval, Evidence & Isolation Validation**: Test course-scoped search, unit/week filtering, Smith-Waterman alignment, evidence provenance formatting, and zero cross-course leakage.
6. **22-Scenario Comprehensive Test Suite**: Implement `src/test/knowledge-pilot-lifecycle.test.ts`.
7. **College Pilot Readiness Documentation**: Author `docs/PILOT_READINESS_REPORT.md` with measured numbers and pilot checklist.

## Implementation Tasks
- [x] Task 1: Audit repository and sample hash across knowledge base.
- [ ] Task 2: Create Phase 5 plan and update ROADMAP/REQUIREMENTS/STATE.
- [ ] Task 3: Author pilot onboarding inventory and course pack documentation.
- [ ] Task 4: Author `src/test/knowledge-pilot-lifecycle.test.ts` covering all 22 required lifecycle verification scenarios.
- [ ] Task 5: Author `docs/PILOT_READINESS_REPORT.md`.
- [ ] Task 6: Run full test suite, type-check, pack validator, and production build.
