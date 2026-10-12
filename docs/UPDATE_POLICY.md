# Swayam404 Update Architecture & Versioning Policy

## Executive Summary

Swayam404 enforces a strict architectural boundary between:
1. **Remote Knowledge-Base Updates** (dynamic course study materials, syllabi, question banks, and review records).
2. **Extension-Code Updates** (compiled JavaScript, React UI, background service workers, and content scripts).

---

## 1. Remote Knowledge-Base Updates (Over-The-Air Data Sync)

### 1.1 Architecture & Read-Only Contract
- The extension exclusively performs unauthenticated HTTP `GET` requests against public Git raw repository roots (e.g. `swayam404-knowledge`).
- Zero tokens, zero credentials, zero write APIs.
- Downloaded content is strictly static JSON data parsed with `JSON.parse()`; no remote executable code is ever downloaded or evaluated.

### 1.2 Update Detection & Lifecycle Hooks
- **Background Checks:** Periodic background checks via `chrome.alarms` (every 6 hours) inspect the remote `manifest.json`.
- **Lifecycle Events:** Initial checks trigger on `chrome.runtime.onInstalled` and `chrome.runtime.onStartup`.
- **Manual Control:** A dedicated **"Check for Updates"** and **"Sync Knowledge Base"** action in Settings allows student-initiated sync.
- **Badge Indicator:** When a newer dataset version is detected, the extension displays a subtle `"NEW"` badge on its toolbar icon.

### 1.3 Granular & Incremental Updates
- **Manifest Preflight:** Scans only `manifest.json` before initiating pack downloads.
- **Conditional Headers:** Sends `If-None-Match` (ETag) and `If-Modified-Since` to respect HTTP 304 Not Modified.
- **Per-Course Hash Comparison:** Compares `contentHash` and `coursePackVersion` per course. If Course A is updated but Course B is unchanged, Course B is reused directly from local cache with zero network overhead.
- **Dynamic Course Discovery:** When a new course is added to the remote manifest catalog, it is automatically registered into the local course selector without requiring extension reinstallation.

### 1.4 Cache Preservation & Failure Safety
- **Atomic Staging:** New course packs are validated in memory before any storage writes occur.
- **Defensive Validation:** Schema validation, relative path checking (preventing directory traversal), and SHA-256 integrity verification run before activation.
- **Failure Preservation:** If a download fails midway, network drops, or a remote pack is corrupt, the existing valid cache remains 100% intact.
- **Offline Resilience:** Previously validated course packs remain fully available offline.
- **No False Success:** Unsuccessful sync operations return explicit errors and update states; failures are never masked as success.

### 1.5 Telemetry States
Settings displays the following explicit states:
- `UP TO DATE`: Local cache matches remote dataset version.
- `UPDATE AVAILABLE`: A newer remote dataset version or course pack hash exists.
- `DOWNLOADING...`: Active in-flight synchronization.
- `UPDATED`: Successfully committed new course packs.
- `OFFLINE`: Network is unreachable; cached data remains active.
- `UPDATE FAILED`: Validation or server error encountered; previous cache preserved.
- `UNCONFIGURED`: Remote repository URL has not been configured.

---

## 2. Extension-Code Versioning & Distribution

### 2.1 SemVer Policy & Consistency
- Versioning strictly follows Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Application versions must stay 100% identical between `package.json` and `manifest.json`.
- Enforced at build time via `scripts/verify-versions.mjs`.

### 2.2 Unpacked Developer Mode Installation
- **Security Boundary:** Under Chrome Manifest V3 security policies, extensions are strictly prohibited from modifying their own executable code or executing remote scripts.
- **Supported Update Procedure:**
  1. Download the latest `swayam404-extension-v{version}.zip` from the official website.
  2. Unzip into your local extension folder, replacing old files.
  3. Navigate to `chrome://extensions` and click the **Reload (↻)** button for Swayam404.
- **Honesty Guarantee:** Swayam404 will never claim that unpacked ZIP installations can update executable code automatically.

### 2.3 Chrome Web Store Distribution (Future)
- Once distributed via the Chrome Web Store, extension code updates will occur silently in the background via Google's native update channel.
- Production ZIP archives for Web Store upload are generated via `npm run package:zip`.

### 2.4 Security & Privacy Standards
- **Zero Remote Code Execution:** CSP enforces `script-src 'self'`. No `eval()`, `new Function()`, or external scripts.
- **Zero Stored Credentials:** No browser credentials, cookies, or GitHub write tokens are stored.
- **Strict Manual Submission:** SWAYAM and NPTEL portal submission controls remain strictly immune from automation.
