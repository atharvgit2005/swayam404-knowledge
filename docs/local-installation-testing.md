# Swayam404 Local Installer & Updater Prototype — Developer Guide

This document describes the hardened local-only update architecture, release pipeline, loopback update server, 9-stage update lifecycle, and testing workflow for the **Swayam404** Chrome Extension.

---

## 1. Architecture & Security Isolation

The updater prototype is strictly decoupled from production environments and public networks:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER WORKSTATION                           │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Local Release Pipeline      │ 2. Local Update Server (Dev Only)     │
│    scripts/generate-local-     │    local-update-server/server.mjs     │
│    release.mjs                 │    Binds strictly to 127.0.0.1:52404  │
│    Produces: local-releases/   │    Serves: /latest.json & .zip        │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Swayam404 Extension         │ 4. Staging, Apply & Recovery Utility  │
│    Settings -> Local Updater   │    scripts/apply-local-update.mjs     │
│    Checks 127.0.0.1:52404      │    npm run update:apply               │
│    9-Stage Lifecycle Flow      │    npm run update:rollback            │
└────────────────────────────────┴───────────────────────────────────────┘
```

### Manifest V3 Security Boundary
Under Google Chrome's Manifest V3 security model:
1. **No Self-Modification**: An extension cannot overwrite its own installed files or unpack new JavaScript in the background without user interaction and browser reload.
2. **No Dynamic Remote Code**: `script-src 'self'` prohibits executing remotely downloaded `.js` files or `eval()`.
3. **Manual Reload Required**: In Developer Mode, new extension files must be extracted into the extension directory, followed by clicking the **Reload (↻)** button in `chrome://extensions`.

### Trust Model
- **SHA-256 Checksums**: Protect against incomplete downloads, disk corruption, and transmission errors.
- **Pre-Extraction ZIP Inspection**: Zero-dependency parser inspects Central Directory records prior to extraction, rejecting directory traversal (`..`), absolute paths (`/`), drive letters (`C:`), null bytes (`\0`), and decompression bombs (>50MB).
- **Mandatory Asset Verification**: Asserts required extension bundle assets (`manifest.json`, `background.js`, `popup.html`, `content.js`) before staging.
- **Production Authenticity**: In production, authenticity is enforced cryptographically by Google's Chrome Web Store digital signature or signed CRX headers. Checksums alone verify integrity, not origin trust.

---

## 2. The 9-Stage Update Lifecycle

The updater prototype defines nine explicit, observable transitions:

| Stage | Name | Action / Responsibility |
|:---:|:---|:---|
| **1** | **Check** | Extension queries `http://127.0.0.1:52404/latest.json` for release metadata. |
| **2** | **Compare** | Extension parses SemVer strings and compares installed vs latest version. |
| **3** | **Download** | Extension streams the release package ZIP into an in-memory buffer via loopback. |
| **4** | **Verify** | Package size, SHA-256 checksum, and internal ZIP entry safety are audited. |
| **5** | **Stage** | Release is extracted to isolated staging directory (`local-staging/v{version}/`). |
| **6** | **Apply** | User runs local script (`npm run update:apply`) which creates backup and replaces `dist/`. |
| **7** | **Reload** | User opens `chrome://extensions` and clicks Reload (↻) on Swayam404. |
| **8** | **Confirm** | User clicks "Confirm Running Version" in Settings; extension verifies running code matches release. |
| **9** | **Recover** | If anything goes wrong, user runs `npm run update:rollback` to instantly restore the previous version. |

---

## 3. Quick-Start Testing Workflow

### Step 1: Install Dependencies & Build Extension
```bash
npm install
npm run build
```
The compiled extension is output to `dist/`.

### Step 2: Load Extension in Chrome
1. Open Google Chrome or Brave and navigate to `chrome://extensions`.
2. Toggle **Developer mode** (top right switch).
3. Click **Load unpacked** (top left).
4. Select the `dist/` directory inside this project:
   `/Users/atharvpaharia100/Desktop/Projects/swayam404/dist`
5. Pin the **swayam404** extension icon to your toolbar.

### Step 3: Start Local Update Server
In a terminal, run:
```bash
npm run server:local
```
The server will start on `http://127.0.0.1:52404` (loopback only).
Verify health by navigating to `http://127.0.0.1:52404/health` in your browser.

### Step 4: Generate Baseline Test Release (v1.0.0)
In a separate terminal:
```bash
npm run release:local -- --version 1.0.0
```
This generates:
- `local-releases/swayam404-extension-v1.0.0.zip`
- `local-releases/latest.json` with computed SHA-256 hash.

### Step 5: Test "Up to Date" State in Extension
1. Open the Swayam404 popup or sidepanel.
2. Click **More ▾ -> Settings**.
3. Scroll to the **Local Extension Code Updater (Prototype)** card.
4. Click **Check for Updates**.
5. The status badge will display **`UP TO DATE`**.

---

## 4. End-to-End Upgrade (v1.1.0) & Verification

### Step 1: Generate Newer Test Release (v1.1.0)
```bash
npm run release:local -- --version 1.1.0 --notes "Enhanced question matching and local updater prototype"
```
The release generator:
1. Builds a staging bundle with `version: "1.1.0"` in `manifest.json`.
2. Packages `local-releases/swayam404-extension-v1.1.0.zip`.
3. Runs zero-dependency pre-release ZIP inspection.
4. Calculates the SHA-256 digest.
5. Updates `local-releases/latest.json`.
6. Leaves your working tree's source files intact.

### Step 2: Check for Updates in Extension UI
1. In Swayam404 Settings, click **Check for Updates**.
2. The badge immediately updates to **`UPDATE AVAILABLE (v1.1.0)`**.
3. The release notes and expected SHA-256 hash appear in the card.

### Step 3: Download & Verify Package
1. Click the primary button: **Download & Verify Package**.
2. The extension:
   - Streams the ZIP over loopback.
   - Verifies byte size matches metadata.
   - Computes SHA-256 hash using the Web Crypto API.
   - Validates internal ZIP entry safety.
   - Transitions to **`CHECKSUM VERIFIED (READY)`**.
   - Initiates browser download of `swayam404-extension-v1.1.0.zip`.

### Step 4: Apply Update Locally (Stage 6)
In your terminal, execute the apply utility:
```bash
npm run update:apply
```
The script will:
1. Locate `local-releases/latest.json` (or pass `--version 1.1.0`).
2. Verify package size and SHA-256 digest.
3. Pre-inspect ZIP entries against Zip Slip and directory escapes.
4. Extract into isolated staging directory `local-staging/v1.1.0/`.
5. Create a recoverable snapshot of current `dist/` in `local-backups/backup-v1.0.0-{timestamp}/`.
6. Replace `dist/` with the staged files.
7. Clean up staging directory.

### Step 5: Reload in Chrome (Stage 7)
1. Open `chrome://extensions`.
2. Find **swayam404 — SWAYAM Assignment Assistant**.
3. Click the **Reload (↻)** icon button.

### Step 6: Confirm Running Version (Stage 8)
1. Re-open Swayam404 extension popup or sidepanel.
2. Go to **Settings -> Local Extension Code Updater**.
3. Click **Confirm Running Version**.
4. The running extension evaluates its active runtime version against the release.
5. The badge transitions to **`RUNNING CONFIRMED (v1.1.0)`**!

---

## 5. Recovery & Rollback Workflow (Stage 9)

If an update exhibits an issue or fails during testing, you can roll back instantly to the previously backed-up version:

```bash
npm run update:rollback
```

What the rollback utility does:
1. Reads `local-backups/last-backup.json`.
2. Verifies the backup directory exists and has a valid `manifest.json`.
3. Restores `dist/` from the backup snapshot.
4. Prompts you to click **Reload (↻)** in `chrome://extensions`.

---

## 6. Testing Failure Scenarios

### Scenario A: Corrupt Download / Checksum Mismatch
Simulate a corrupted ZIP download:
```bash
npm run release:local -- --version 1.2.0 --corrupt
```
When clicking **Download & Verify Package** in the extension UI:
- Checksum verification fails.
- The package is **rejected**.
- Status badge switches to **`CHECKSUM MISMATCH (REJECTED)`**.
- Extension files remain untouched.

### Scenario B: Server Unavailable
Stop the local server (`Ctrl+C`) and click **Check for Updates**:
- Status switches to **`LOCAL SERVER UNAVAILABLE`**.
- Helpful diagnostic banner instructs you to start `npm run server:local`.
- Zero crash or UI freeze.

### Scenario C: Truncated Download
If a network disconnect truncates the file during download:
- Byte length check detects mismatch with metadata `fileSize`.
- Package is rejected before checksum computation.

### Scenario D: Malicious Zip Slip Attempt
If an untrusted ZIP archive contains path traversal (`../../etc/passwd`):
- `validateZipPackage` detects entry escaping directory root.
- Throws security violation and rejects archive before any file touches the disk.

---

## 7. Security & Isolation Assurances

- **No Git Artifacts Leaked**: `.gitignore` strictly ignores:
  - `local-releases/*.zip`
  - `local-releases/*.json`
  - `local-releases/.staging*`
  - `local-staging/`
  - `local-backups/`
- **Zero Remote Endpoints**: No requests are made to GitHub, AWS, or public CDNs during local testing.
- **Strict Loopback Binding**: The update server strictly binds to `127.0.0.1` and refuses non-loopback bindings (`0.0.0.0` or public IPs).
- **Sanitized Server Errors**: 404, 400, and 500 error responses never leak local workstation filesystem paths.
- **Path Traversal Protection**: Only simple filenames ending with `.zip` or `.json` in `local-releases/` can be served.
