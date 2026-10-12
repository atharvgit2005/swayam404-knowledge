# Phase 10 Plan — Updater Hardening, End-to-End Verification & Safe Local Installation Workflow

## Context & Objectives
Audit and harden the local-only extension installer and updater prototype in the Swayam404 repository.
Strict constraints:
- Do not publish, push, upload, deploy, or commit anything.
- Preserve all existing code and uncommitted changes.
- Respect Chrome Manifest V3 security restrictions (no self-modifying code, no dynamic script injection).
- Implement a rigid 9-stage update lifecycle: Check, Compare, Download, Verify, Stage, Apply, Reload, Confirm, Recover.
- Implement safe ZIP inspection against Zip Slip and malformed packages.
- Provide a safe, recoverable local apply utility (`scripts/apply-local-update.mjs`) with automatic backup and rollback.

---

## Tasks

### Wave 1: Repository Audit & Planning (Complete)
- [x] Task 1: Inspect repository structure, manifest, build outputs, versioning, server, and uncommitted modifications.
- [x] Task 2: Create Phase 10 plan (`.planning/phases/09-shared-knowledge-base-foundation/PHASE-10-PLAN.md`).

### Wave 2: Safe ZIP Inspection & Packaging Hardening (Complete)
- [x] Task 3: Create zero-dependency ZIP entry validator (`src/lib/updater/zipValidator.ts` and `scripts/zipValidator.mjs`) detecting Zip Slip, absolute paths, directory escapes, zip bombs, and missing required assets.
- [x] Task 4: Harden `scripts/generate-local-release.mjs` using safe process execution and validating staging bundles before generating release metadata.

### Wave 3: Local Update Server Security Hardening (Complete)
- [x] Task 5: Harden `local-update-server/server.mjs` with strict loopback validation, route whitelisting, path traversal prevention, sanitized error responses (no internal filesystem leakage), and clean shutdown.

### Wave 4: 9-Stage Update Lifecycle & Safe Local Apply Utility (Complete)
- [x] Task 6: Update `src/lib/updater/types.ts` with the 9 distinct lifecycle stages and states.
- [x] Task 7: Update `src/lib/updater/updaterService.ts` to enforce size validation, checksum verification, staging status, and running version confirmation.
- [x] Task 8: Create `scripts/apply-local-update.mjs` with safe staging extraction, pre-apply backup (`local-backups/`), atomic file replacement in `dist/`, automated rollback on failure, and `--rollback` CLI flag.
- [x] Task 9: Add npm scripts in `package.json`: `"update:apply"` and `"update:rollback"`.

### Wave 5: In-Extension UI Refinement (Complete)
- [x] Task 10: Update `src/features/settings/ExtensionUpdaterCard.tsx` to communicate all 9 lifecycle stages accurately, guide user through `npm run update:apply`, provide running version confirmation, and display recovery guidance.

### Wave 6: Conservative Gitignore Configuration (Complete)
- [x] Task 11: Update `.gitignore` to specifically ignore `local-staging/`, `local-backups/`, and `local-releases/*.json` without hiding source files.

### Wave 7: Comprehensive End-to-End Automated Tests (Complete)
- [x] Task 12: Expand `src/test/local-updater.test.ts` to 17 tests (Scenarios A through Q) testing Zip Slip rejection, missing asset rejection, truncated download detection, apply and rollback workflow, running version confirmation, and error path sanitization.

### Wave 8: Quality Gates & Documentation (Complete)
- [x] Task 13: Run quality gates: `npm run typecheck`, `npm test` (all 23 suites, 384 tests passed), `npm run build`, and `node scripts/validate-contributions.mjs`.
- [x] Task 14: Update `docs/local-installation-testing.md` to reflect the 9-stage lifecycle, apply helper, and recovery workflow.
- [x] Task 15: Update `.planning/ROADMAP.md` and `.planning/STATE.md`.
