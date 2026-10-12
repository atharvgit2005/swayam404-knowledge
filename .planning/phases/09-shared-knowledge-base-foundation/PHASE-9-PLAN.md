# Phase 9 Plan — Local-Only Installer & Updater Prototype

## Context & Objectives
Build a reliable, minimal installation and update workflow prototype for the Swayam404 Chrome Extension in a completely local development environment.
Strict constraints:
- Do not publish, push, upload, or deploy anything.
- Preserve all existing code and uncommitted changes.
- Respect Chrome Manifest V3 security restrictions (no self-modifying code, no dynamic script injection).
- Create a working prototype with a local release pipeline, a local loopback update server, an in-extension updater UI, and automated test coverage for Scenarios A through J.

---

## Tasks

### Wave 1: Repository Audit & Planning (Complete)
- [x] Task 1: Inspect repository structure, build outputs, versioning configuration, and existing uncommitted changes.
- [x] Task 2: Create Phase 9 plan (`.planning/phases/09-shared-knowledge-base-foundation/PHASE-9-PLAN.md`).

### Wave 2: Local Release Pipeline & Release Generator
- [x] Task 3: Create `scripts/generate-local-release.mjs` supporting clean ZIP packaging, SHA-256 checksum generation, `latest.json` release metadata, version bumping, and intentional corruption testing.
- [x] Task 4: Ensure `.gitignore` ignores `local-releases/*.zip` and temporary test releases while preserving scripts.

### Wave 3: Local Development Update Server
- [x] Task 5: Implement `local-update-server/server.mjs` binding strictly to `127.0.0.1` (configurable port 52404), with `/health`, `/latest.json`, `/releases/:filename`, directory traversal guards, and proper HTTP error codes.

### Wave 4: In-Extension Updater Core Engine & Version Comparison
- [x] Task 6: Implement robust SemVer comparison in `src/lib/updater/semver.ts` handling multi-digit components (`1.2.0` vs `1.10.0`), equality, older versions, and prereleases.
- [x] Task 7: Implement `src/lib/updater/types.ts` defining all 10 explicit update states and metadata schema.
- [x] Task 8: Implement `src/lib/updater/updaterService.ts` for checking updates, downloading ZIP packages, verifying SHA-256 checksums, mutex protection, and persistent storage in `StorageService`.

### Wave 5: In-Extension Neo-Brutalist Updater UI
- [x] Task 9: Create `src/features/settings/ExtensionUpdaterCard.tsx` and integrate into `src/features/settings/SettingsTab.tsx`, featuring status badges for all 10 states, check button, download & verify button, checksum display, and explicit unpacked manual reload instructions.

### Wave 6: Comprehensive Documentation
- [x] Task 10: Author `docs/local-installation-testing.md` with complete architecture, setup instructions, CLI commands, trust model, and Chrome Manifest V3 restrictions explanation.

### Wave 7: Automated Test Suite & Quality Gates
- [x] Task 11: Create `src/test/local-updater.test.ts` covering Scenarios A through J (10 scenarios).
- [x] Task 12: Add convenience npm scripts (`release:local`, `server:local`) in `package.json`.
- [x] Task 13: Run quality gates: `npm run typecheck`, `npm test`, `npm run build`, and `node scripts/validate-contributions.mjs`.
- [x] Task 14: Update `.planning/ROADMAP.md` and `.planning/STATE.md`.
