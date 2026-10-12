# Phase 8 Plan — Reliable Update Architecture for Existing Installations

## Context & Objectives
Implement a robust, production-grade update architecture for Swayam404 that strictly separates **remote knowledge-base updates** (data, course packs, question banks) from **extension-code updates** (JavaScript logic, service worker, content scripts).

### A. Knowledge-Base Updates
- Reuse existing `KnowledgeBaseClient`, `KnowledgeCacheService`, `KnowledgeValidator`, manifest, and versioning system.
- Implement background check lifecycle: check for newer manifest periodically (`chrome.alarms` or suitable interval) and during lifecycle events (startup / install).
- Maintain existing manual Sync / Check for Updates action in Settings.
- Avoid full repository redownloads: compare `datasetVersion` and per-course `coursePackVersion` / `contentHash`. Download ONLY changed or new resources.
- Validate schema, hashes, relative paths (no traversal), and redistribution permissions before activating.
- Atomically commit validated updates to storage; preserve last valid cache on any error.
- Offline-first resilience: support offline startup using previously cached resources without error.
- Mutex concurrency guard: prevent concurrent or overlapping sync operations.
- Surface explicit update states in Settings: `up-to-date`, `update-available`, `downloading`, `updated`, `offline`, `update-failed`, `unconfigured`.
- Dynamic course catalog additions: show newly added courses in the UI without requiring an extension reinstall.
- Never silently treat an unsuccessful sync as success.

### B. Extension-Code Versioning
- Establish one consistent SemVer application versioning policy across `manifest.json` and `package.json`.
- Enforce manifest version updates for every code release (automated check script).
- Add visible installed-version field and link to release notes / official download page in Settings and popup footer.
- Clearly document the supported update process for unpacked Developer Mode installations (download ZIP -> extract -> click reload ↻ in `chrome://extensions`).
- Prepare build and packaging workflow (`scripts/package-zip.mjs`) for future unlisted Chrome Web Store distribution.
- Never claim that unpacked ZIP installations update executable code automatically.
- Enforce zero remote JavaScript execution, zero remote code injection, and zero stored credentials or write tokens.

### C. Website Release Consistency
- Audit `https://swayam404.vercel.app/` (`scratch/swayam404`).
- Display current extension version (`v1.0.0`) and release date (`October 2026`).
- Clearly separate extension application download (pre-built ZIP) from knowledge-base repository (`swayam404-knowledge`).
- Provide concise release notes / changelog.
- Explain honest update behavior: knowledge base updates dynamically over-the-air, while ZIP extension code requires manual reload until Web Store release.

### D. Tests & Acceptance Criteria
Implement 10 comprehensive tests in `src/test/knowledge-updates-and-versioning.test.ts`:
1. Detecting newer knowledge-base version.
2. No unnecessary downloads when dataset is unchanged.
3. Updating one course without corrupting other course caches.
4. Failed updates preserving last valid cache intact.
5. Offline startup and later synchronization.
6. Dynamic course-catalog updates where supported.
7. Version display and update-status accuracy.
8. Distinguishing knowledge updates from extension-code updates.
9. Preventing false claims that a ZIP installation updated automatically.
10. Preserving existing retrieval, AI bridges, course isolation, and manual submission safeguards.

---

## Tasks
- [x] Task 1: Update knowledge types and services (`types/knowledge.ts`, `cache.ts`, `service.ts`, `client.ts`) for update status telemetry, update detection, and dynamic catalog syncing.
- [x] Task 2: Implement lifecycle and background update checks in `src/background/index.ts`.
- [x] Task 3: Enhance Settings UI (`SettingsTab.tsx`) with visible installed version, update status pill, manual sync, and Developer Mode update instructions.
- [x] Task 4: Add version verification script (`scripts/verify-versions.mjs`) and clean ZIP packaging workflow (`scripts/package-zip.mjs`) for Web Store readiness.
- [x] Task 5: Author documentation (`docs/UPDATE_POLICY.md`).
- [x] Task 6: Audit and update website (`scratch/swayam404/public/index.html`) with version display, repository separation, and changelog.
- [x] Task 7: Implement comprehensive test suite (`src/test/knowledge-updates-and-versioning.test.ts`) covering all 10 acceptance criteria.
- [x] Task 8: Run all quality gates: `npm run typecheck`, `npm test`, `npm run build`, and `node scripts/validate-contributions.mjs`.
- [x] Task 9: Update `.planning/ROADMAP.md` and `.planning/STATE.md`.
