# Project State — swayam404
 
## Current Status
- **Milestone**: Milestone 9 — Shared Knowledge Base Foundation
- **Milestone**: Milestone 9 — Shared Knowledge Base Foundation
- **Current Phase**: Phase 12 — GitHub Releases Live Sync & Standalone Desktop Installer Packaging (Mac & Windows)
- **Status**: Completed & Verified
- **Last Action**: Built direct GitHub Releases live sync, extension-to-companion trigger bridge, and standalone installer packaging:
  1. **GitHub Releases Live Sync Engine (`installer-app/server.mjs`)**:
     - `GET /api/github/check`: Queries GitHub Releases API, extracts release tags, release notes, assets, and SHA-256 digests.
     - `POST /api/github/download-and-apply`: Directly downloads release asset ZIP from GitHub, validates SHA-256 integrity, verifies package with pure JavaScript ZIP inspector (`scripts/zipValidator.mjs`) preventing Zip Slip, creates timestamped snapshot in `local-backups/`, and replaces `dist/` in-place.
  2. **Desktop Dashboard GitHub Card (`installer-app/public/index.html`)**:
     - Embedded Neo-Brutalist "GitHub Releases Live Sync & 1-Click Install" card with repository input (`atharvpaharia100/swayam404`), live telemetry table, one-click install button, and live console streaming.
  3. **In-Extension Companion Bridge (`ExtensionUpdaterCard.tsx`)**:
     - Added **"⚡ 1-Click Apply via Desktop App"** button that communicates directly with `http://127.0.0.1:52410/api/update/apply` or GitHub install.
     - Added instant **"🔄 Reload Extension Now (Stage 7)"** button using `chrome.runtime.reload()`.
  4. **Cross-Platform Extraction & Standalone Distributables (`scripts/bundle-installer.mjs`)**:
     - Created `extractZipSafe` handling macOS, Linux (`unzip`), and Windows PowerShell (`Expand-Archive`).
     - Added `"package:installer"` script assembling standalone distributables in `dist-installer/`: `Swayam404-Installer-macOS.zip` (20.7 KB) and `Swayam404-Installer-Windows.zip` (20.0 KB).
  5. **Website Integration Guide (`docs/github-release-distribution.md`)**:
     - Comprehensive guide with OS-detection snippet, Neo-Brutalist HTML download card, 3-step quick start, and maintainer release checklist.
  6. **Automated Test Suite (`src/test/github-release-sync.test.ts`)**: Added 6 tests. Total test suite: **396 tests across 25 test files (100% passing)**.
  7. **Quality Gates Passed**: `npm run typecheck` (0 errors), `npm test` (396 passing), `npm run build` (verified clean `dist/` with zero `_` prefix filenames).





 
## Key Architecture & UI Decisions
 1. **Preserved Neo-Brutalist Identity**: Black (`#1a1a1a`), off-white/cream (`#f5f0e8`), solid yellow primary accents (`#ffcc00`), warning red (`#e63b2e`), thick 2px black borders, hard offset shadows (`3px 3px 0px #1a1a1a`), and Space Grotesk / Inter typography without generic SaaS softening.
 2. **Information Architecture Consolidation**:
    - **Header**: Removed the oversized top-marquee-strip. Added clean connection dot (`READY`) with tooltip, Course Selector with auto-truncation, and direct Settings icon.
    - **Navigation**: Reduced 6 tabs to 4 clean tabs (`Dashboard`, `Scan & Review`, `Course Progress`, `More ▾`). Secondary destinations (`Courses & Banks`, `Import / Export`, `Settings`, `Diagnostics Trace`) live under `More ▾`.
    - **Dashboard**: Eliminated competing cards ("Active Bank", "In-Queue", "Awaiting Review", "Safety Engine", 8-segment progress bar, duplicate live DOM target panel). Consolidated into ONE compact Assignment Panel with live status and ONE dynamic primary action.
 3. **One-Click Workflow Decoupling**:
    - Workflow progression: (1) Detect Context → (2) Scan Assignment → (3) Review proposed answers & evidence → (4) Explicitly trigger fill into inputs.
    - Zero Auto-Submit Guarantee: Native SWAYAM / NPTEL submission controls remain untouched and immune from automation.
 4. **Simplified Core Views**:
    - **Scanner & Review**: Single pre-scan context card with primary Scan button; post-scan compact question list with filter pills (`All`, `Verified`, `Needs Review`, `Unresolved`), batch approvals (`Approve Verified`, `Approve AI`), and collapsible evidence inspection.
    - **Course Progress**: Dedicated single linear progress bar (`X of Y Completed · Z%`), honest origin notation (local task queue vs portal outline), and single Next Recommended Action card.
    - **Courses & Banks**: Active course switcher, verified records count, search/filter input, compact table/list, and honest empty states.
 5. **Privacy-Preserving Diagnostics**: Dedicated 16-stage pipeline trace modal accessible via `More ▾ -> Diagnostics Trace`, featuring JSON copy and export without cluttering the primary user view.
 6. **Side-Panel Responsive Standard**: Fully verified at 320px–420px browser side-panel dimensions with zero horizontal overflow or clipped controls.
