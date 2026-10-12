# Phase 11 Plan — Knowledge Sync Fallback Fix & Cross-Platform Desktop Installer/Updater App (Mac & Windows)

## Context & Objectives
Two critical requirements from user feedback:
1. **Fix Knowledge Base Sync & "Take Answers from GitHub Bank" Error**:
   - The screenshot shows: "Sync Failed: No verified questions found for this course in the GitHub knowledge repository."
   - The root cause was `src/lib/knowledge/service.ts:importAnswersForCourse` only checked `course-ent-201` and ignored `course-econ-101` (`economics-sample.json`) and other courses.
   - When remote sync is unconfigured, offline, or lacks the active course pack, gracefully fall back to bundled verified materials (`economics-sample.json` for economics, `entrepreneurship-sample.json` for entrepreneurship, and any bundled course pack in `knowledge-base/courses/`).
   - In `SettingsTab.tsx`, provide an option to use the official repository URL (`https://raw.githubusercontent.com/atharvpaharia100/swayam404-knowledge/main`) and display helpful diagnostics instead of raw failures.

2. **Cross-Platform Desktop Installer & Updater App (Mac & Windows)**:
   - Provide a GUI desktop application for both macOS and Windows that replaces manual terminal commands.
   - Features:
     • One-click build and verification
     • One-click local update server start/stop
     • One-click release generation (v1.0.0, v1.1.0, or custom)
     • One-click update apply (with automatic backup and safe staging)
     • One-click rollback to last working backup
     • One-click open `chrome://extensions` in the developer's browser
   - Launchers:
     • macOS: `installer-app/mac/Swayam404 Installer.command` & `installer-app/mac/Swayam404 Installer.app` (and root `Swayam404-Installer-Mac.command`)
     • Windows: `installer-app/windows/Swayam404-Installer.bat` & `installer-app/windows/Swayam404-Installer.cmd` (and root `Swayam404-Installer-Windows.bat`)
     • Cross-platform CLI: `npm run installer` (and `npm run installer:open`)

---

## Tasks

### Wave 1: Fix Knowledge Sync & Sample Fallback (Complete)
- [x] Task 1: Update `src/lib/knowledge/service.ts` (`importAnswersForCourse`) to support `course-econ-101` (`economics-sample.json`), `course-ent-201` (`entrepreneurship-sample.json`), and general course fallback.
- [x] Task 2: Enhance `SettingsTab.tsx` with default official repo URL auto-fill and improved error guidance when unconfigured.
- [x] Task 3: Verify and update `CourseCompletionDashboard.tsx` for consistent fallback behavior.
- [x] Task 4: Add tests in `src/test/knowledge-updates-and-versioning.test.ts` verifying answer imports for `course-econ-101`, `course-ent-201`, and offline/unconfigured courses.

### Wave 2: Build Desktop Installer & Updater App Engine (Complete)
- [x] Task 5: Build `installer-app/server.mjs` — a lightweight desktop app backend with REST API for:
  • System health & environment checks (Node version, Chrome paths, dist/ status)
  • Extension build trigger (`npm run build`)
  • Server daemon control (toggle `local-update-server`)
  • Release generator trigger (`npm run release:local`)
  • Apply & Staging trigger (`npm run update:apply`)
  • Rollback trigger (`npm run update:rollback`)
  • Open Chrome / Brave extensions page
- [x] Task 6: Build `installer-app/public/index.html` — Neo-Brutalist Desktop UI with:
  • Live status dashboard (Installed Version, Server Status, Latest Release, Backup History)
  • One-click actions with live console log output
  • Clear step-by-step installation instructions for unpacked mode

### Wave 3: Create macOS & Windows Native Launchers (Complete)
- [x] Task 7: Create macOS launcher (`installer-app/mac/Swayam404 Installer.command` and `installer-app/mac/Swayam404 Installer.app/Contents/...`).
- [x] Task 8: Create Windows launcher (`installer-app/windows/Swayam404-Installer.bat` and `installer-app/windows/Swayam404-Installer.cmd`).
- [x] Task 9: Add npm scripts in `package.json`: `"installer"` and `"installer:open"`.

### Wave 4: Automated Testing & Verification (Complete)
- [x] Task 10: Create automated test suite `src/test/installer-app.test.ts` validating API endpoints, build actions, server control, apply, and rollback.
- [x] Task 11: Run full quality gates: `npm run typecheck`, `npm test` (390 passed across 24 suites), `npm run build`.
- [x] Task 12: Author developer documentation in `docs/desktop-installer-guide.md`.
- [x] Task 13: Update `.planning/ROADMAP.md` and `.planning/STATE.md`.
