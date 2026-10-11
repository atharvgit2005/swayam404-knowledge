# Phase 6 Plan — Live Knowledge Deployment, Privacy-Preserving Diagnostics & College Pilot

## Objectives
1. **Preserve Current Implementation**: Maintain working tree state, ensure zero regressions across all 310 existing tests, type-checking, and build.
2. **Establish Actual Publication Readiness**:
   - Audit local files vs remote reachability.
   - Distinguish local repository files, deterministic pack generation, and remote live GitHub repository availability.
   - Inspect actual course packs for synthetic/demo labels, placeholder sources, unsupported license claims, content hashes, and metadata completeness.
   - Inventory all resources into: synthetic test fixtures, real authorized learning resources, metadata-only references, local-only resources, released-review records, and missing evidence/permissions.
   - Enforce active assessment non-publication policy.
3. **Implement Privacy-Preserving Diagnostic Export**:
   - Build `DiagnosticExporterService` (`src/lib/orchestration/diagnosticExporter.ts`).
   - Include versioning, compatibility, dataset version, pack versions, sync timestamps, durations, provider outcomes, aggregate scan counts, sanitized error codes, testable stage identifiers.
   - Strict exclusions: question text, answer text, student names, roll numbers, emails, cookies, tokens, API keys, sensitive query params in URLs, full page HTML, lecture note content.
   - Redact error messages and stack traces; omit unsanitizable records.
   - Local export only (zero server upload, zero telemetry transmission).
   - Display preview with exported data categories in `DiagnosticsModal.tsx`.
4. **Robust Diagnostic Correlation & Bounded Storage**:
   - Random local diagnostic run ID (UUID / hex, not derived from identity or fingerprint).
   - Track discrete event categories (`scan-*`, `knowledge-sync-*`, `cache-*`, `resource-search-*`, `ai-provider-request-*`, `response-parsing-*`, `population-*`).
   - Bounded storage buffer with FIFO eviction (capped capacity).
5. **Maintainer Pilot Diagnostic Checklist & User Installation Guide**:
   - 20-item checklist markable as pass, fail, blocked, not tested (`docs/PILOT_DIAGNOSTIC_CHECKLIST.md`).
6. **Course-Specific Onboarding Guide**:
   - Maintainer guide for adding new courses (`docs/COURSE_ONBOARDING_GUIDE.md`).
7. **Live Deployment Verification & Small Volunteer Pilot Guide**:
   - Verify unauthenticated public reachability or label remote status as BLOCKED pending repository publication.
   - 5–10 volunteer student pilot guide (`docs/COLLEGE_PILOT_GUIDE.md`).
8. **Automated Test Suite & Quality Gates**:
   - Author `src/test/knowledge-live-pilot-diagnostics.test.ts`.
   - Verify `npm run typecheck`, `npm test`, `npm run build`, `build-course-packs.mjs`, and `validate-contributions.mjs`.

## Tasks
- [x] Task 1: Audit repository state, course packs, and uncommitted changes.
- [ ] Task 2: Implement `src/lib/orchestration/diagnosticExporter.ts` and integrate with pipeline diagnostics.
- [ ] Task 3: Update `src/components/DiagnosticsModal.tsx` with privacy-preserving export, category preview, and download.
- [ ] Task 4: Author documentation:
  - `docs/PILOT_DIAGNOSTIC_CHECKLIST.md` (20-item checklist & user install guide)
  - `docs/COURSE_ONBOARDING_GUIDE.md` (maintainer guide for new courses)
  - `docs/COLLEGE_PILOT_GUIDE.md` (5–10 volunteer student pilot guide)
  - Update `docs/PILOT_READINESS_REPORT.md` (readiness audit & resource inventory)
- [ ] Task 5: Author comprehensive automated test suite `src/test/knowledge-live-pilot-diagnostics.test.ts`.
- [ ] Task 6: Update `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, and `.planning/STATE.md`.
- [ ] Task 7: Execute full quality gates: typecheck, Vitest, production build, pack builder, maintainer validator.
