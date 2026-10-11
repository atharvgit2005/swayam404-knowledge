# Phase 7 Plan — First Public Knowledge Release & Live Deployment Verification

## Objectives
1. **Preserve Repository**: Maintain working-tree integrity; zero resets, zero reverts, zero commits or pushes.
2. **Audit Publication Dataset**: Classify every course and resource (synthetic fixtures vs genuine materials vs released review records vs metadata references); ensure synthetic benchmark packs are transparently labeled and cannot masquerade as genuine course content.
3. **Release Package Preparation & Tooling**:
   - Verify `scripts/build-course-packs.mjs` and `scripts/validate-contributions.mjs`.
   - Add automated release-readiness classification reporting to validation tooling.
   - Document exact repository directory structure intended for public release.
4. **Repository URL Security & Configuration**:
   - Add URL security validation (`validateRepositoryUrl` in `src/lib/knowledge/security.ts`).
   - Confirm unauthenticated read-only contract and safe handling of unconfigured URLs.
   - Document expected raw Git URL format.
5. **Real Network Workflow Preflight & Status Verification**:
   - Perform local preflight checks and manual live verification procedure.
   - Honestly mark remote-live sync as BLOCKED pending maintainer repository creation.
6. **Production Extension Packaging & Verification**:
   - Verify `dist/` package build.
   - Document Brave/Chrome unpacked installation steps.
   - Verify non-auto-submit safety, evidence provenance, and local sanitized diagnostics.
7. **Release Checklist**: Author `docs/PUBLIC_KNOWLEDGE_RELEASE_CHECKLIST.md` covering all 11 required areas.
8. **Automated Test Suite**: Author `src/test/knowledge-release-publication.test.ts` and verify all quality gates pass.

## Tasks
- [x] Task 1: Audit working tree and preserve all uncommitted files.
- [ ] Task 2: Implement URL security validation in `src/lib/knowledge/security.ts` and integrate with `client.ts`.
- [ ] Task 3: Author `docs/PUBLIC_KNOWLEDGE_RELEASE_CHECKLIST.md`.
- [ ] Task 4: Author `src/test/knowledge-release-publication.test.ts` covering Phase 7 scenarios.
- [ ] Task 5: Update `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, and `.planning/STATE.md`.
- [ ] Task 6: Run full verification: `npm run typecheck`, `npm test`, `npm run build`, and validation CLI scripts.
