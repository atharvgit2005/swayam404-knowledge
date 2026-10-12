# Phase 12 Plan — GitHub Releases Live Sync & Standalone Desktop Installer Packaging (Mac & Windows)

## Context & Objectives
The user's envisioned distribution & updater architecture:
1. **Website Download**: When users visit the site, they download a lightweight native installer for their OS (Mac or Windows).
2. **First-Time Setup**: The installer creates a persistent local folder, downloads the latest release, guides the 1-time Developer Mode setup, and opens `chrome://extensions`.
3. **Live Sync with GitHub**: The desktop companion and the in-extension updater always stay in sync with GitHub Releases (`atharvpaharia100/swayam404`).
4. **1-Click Auto-Update**: When a new release is available, the extension prompts the user with the matching Neo-Brutalist theme. Clicking update triggers the companion to download the release asset, verify checksums, validate against Zip Slip, safely back up `dist/`, and atomically apply the update without any manual extraction needed.

---

## Tasks

### Wave 1: GitHub Releases Live Sync API Engine (installer-app/server.mjs) (Complete)
- [x] Task 1: Implement `GET /api/github/check` endpoint in `installer-app/server.mjs`:
  • Queries GitHub REST API for latest release (`/repos/:owner/:repo/releases/latest`).
  • Compares latest tag against installed `dist/manifest.json`.
  • Identifies release assets (`.zip`, `latest.json`, checksums).
  • Returns `{ updateAvailable, currentVersion, latestVersion, releaseNotes, assets, publishedAt }`.
- [x] Task 2: Implement `POST /api/github/download-and-apply` endpoint in `installer-app/server.mjs`:
  • Downloads release ZIP asset to `local-staging/github-downloads/`.
  • Computes SHA-256 and validates against checksum if available.
  • Performs Zip Slip inspection using `scripts/zipValidator.mjs`.
  • Takes timestamped backup of `dist/` in `local-backups/`.
  • Atomically applies update into `dist/`.
  • Returns `{ success: true, version, backupCreated, appliedAt }`.

### Wave 2: Desktop Dashboard GitHub Controls (installer-app/public/index.html) (Complete)
- [x] Task 3: Add dedicated "GitHub Releases Live Sync" card to the Neo-Brutalist dashboard:
  • Configurable repository input (`atharvpaharia100/swayam404`).
  • "Check GitHub for Releases" button.
  • "1-Click Download & Apply from GitHub" button.
  • Live terminal output stream displaying download, verification, backup, and extraction stages.

### Wave 3: In-Extension ➔ Desktop Companion Direct Trigger Bridge (Complete)
- [x] Task 4: Enhance `src/features/settings/ExtensionUpdaterCard.tsx` and `updaterService.ts`:
  • Detect if Desktop Companion (`http://127.0.0.1:52410`) is active.
  • Add "Auto-Install via Desktop Companion" button when update is available.
  • Trigger in-place file replacement on disk and advance state directly to Stage 7 (Reload Required).
  • Provide 1-click "Reload Extension" button (`chrome.runtime.reload()`).

### Wave 4: Standalone Distributable Packaging & Website Integration (Complete)
- [x] Task 5: Build `scripts/bundle-installer.mjs` generating distributable self-contained packages:
  • `dist-installer/mac/`: Runnable macOS package with launchers.
  • `dist-installer/windows/`: Runnable Windows package with batch/PowerShell launchers.
- [x] Task 6: Add npm script `"package:installer"` in `package.json`.
- [x] Task 7: Author user documentation and website setup guide in `docs/github-release-distribution.md`.

### Wave 5: Automated Testing, Quality Gates & GSD Tracking (Complete)
- [x] Task 8: Implement automated test suite `src/test/github-release-sync.test.ts` covering GitHub release check, asset download, checksum validation, and atomic apply.
- [x] Task 9: Run full quality gates: `npm run typecheck`, `npm test` (396 tests passing across 25 suites), `npm run build`.
- [x] Task 10: Update `.planning/ROADMAP.md` and `.planning/STATE.md`.
