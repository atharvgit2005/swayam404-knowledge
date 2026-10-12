# Swayam404 — GitHub Release Distribution & Desktop Companion Architecture

This document defines the production distribution and update architecture for Swayam404 using direct GitHub Releases and native OS companions for macOS and Windows.

---

## 1. Executive Summary & Design Rationale

Traditional Chrome extension distribution relies on the Google Chrome Web Store (CWS). While CWS handles silent automatic background updates, it introduces significant friction:
- **Mandatory Review Delays:** Every bug fix or assignment parser patch takes 2–7 business days to be reviewed.
- **Store Policy Restrictions:** Strictly controls dynamic APIs and unpacked developer debugging.
- **Single Point of Failure:** Risk of sudden delisting or takedowns.

Swayam404 adopts a **Hybrid Distribution Architecture**:
1. **Website Download:** Users download a lightweight, open-source companion app packaged for their operating system (macOS or Windows).
2. **One-Time Setup:** The companion sets up a persistent local extension folder and assists the user in completing the 1-time "Developer Mode -> Load Unpacked" authorization in Chrome.
3. **Continuous GitHub Sync:** All future releases published to `https://github.com/atharvpaharia100/swayam404/releases` are detected directly by the extension and companion.
4. **One-Click Safe In-Place Updates:** When a new release is available, the companion downloads the release ZIP, verifies SHA-256 integrity, inspects contents against Zip Slip attacks, creates a backup snapshot, and atomically replaces the extension files in-place. A single click on **Reload Extension (↻)** activates the new code immediately.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────┐
│               OFFICIAL GITHUB REPOSITORY               │
│          atharvpaharia100/swayam404/releases           │
└───────────────────────────┬────────────────────────────┘
                            │ (Release Tag + Assets)
                            ▼
┌────────────────────────────────────────────────────────┐
│           SWAYAM404 WEBSITE & LANDING PAGE             │
│              https://swayam404.vercel.app              │
├───────────────────────────┬────────────────────────────┤
│  [Download for macOS]     │   [Download for Windows]   │
│  (Swayam404-Mac.zip)      │   (Swayam404-Windows.zip)  │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐┌───────────────────────────┐
│     macOS INSTALLER       ││    WINDOWS INSTALLER      │
│  Swayam404 Installer.app  ││ Swayam404-Installer.bat   │
│  Start-Installer.command  ││ Swayam404-Installer.cmd   │
└─────────────┬─────────────┘└─────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌────────────────────────────────────────────────────────┐
│       SWAYAM404 DESKTOP COMPANION (127.0.0.1:52410)    │
│  • Manages local 'dist/' directory                      │
│  • Inspects Central Directory ZIP headers (Zip Slip)   │
│  • Preserves timestamped backups in 'local-backups/'   │
│  • REST API for building, staging, and rollbacks       │
└───────────────────────────┬────────────────────────────┘
                            │ (Local HTTP Bridge)
                            ▼
┌────────────────────────────────────────────────────────┐
│           CHROME EXTENSION (MANIFEST V3)               │
│  • Embedded Neo-Brutalist Updater in Settings Tab      │
│  • Checks latest release version                       │
│  • "1-Click Apply via Desktop App" button              │
│  • "Reload Extension Now" (chrome.runtime.reload())    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Website Integration Specification

To deliver a friction-free experience on `https://swayam404.vercel.app/`, embed this OS-detection card:

### 3.1 JavaScript Client OS Detection
```javascript
function detectUserOS() {
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes('mac') || ua.includes('darwin')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'other';
}

function getDownloadUrl(os) {
  const GITHUB_REPO = 'atharvpaharia100/swayam404';
  if (os === 'mac') {
    return `https://github.com/${GITHUB_REPO}/releases/latest/download/Swayam404-Installer-macOS.zip`;
  }
  if (os === 'windows') {
    return `https://github.com/${GITHUB_REPO}/releases/latest/download/Swayam404-Installer-Windows.zip`;
  }
  return `https://github.com/${GITHUB_REPO}/releases/latest/download/swayam404-extension.zip`;
}
```

### 3.2 HTML Neo-Brutalist Download Section
```html
<div class="download-card" style="border: 3px solid #1a1a1a; box-shadow: 5px 5px 0px #1a1a1a; padding: 24px; background: #fff;">
  <div style="font-weight: 900; font-size: 20px; text-transform: uppercase;">Get Swayam404 for Desktop</div>
  <p style="color: #475569; font-size: 13px; margin: 8px 0 16px 0;">
    Includes automatic GitHub release updates and one-click installation.
  </p>
  
  <div style="display: flex; gap: 12px; flex-wrap: wrap;">
    <a id="btn-primary-download" href="#" class="btn-primary" style="background: #ffcc00; color: #1a1a1a; font-weight: 800; padding: 12px 20px; border: 2px solid #1a1a1a; text-decoration: none;">
      ⚡ Download for Your OS
    </a>
    <a href="https://github.com/atharvpaharia100/swayam404/releases/latest" style="padding: 12px 16px; border: 2px solid #1a1a1a; color: #1a1a1a; font-weight: 700; text-decoration: none;">
      📦 View Direct ZIP Archive
    </a>
  </div>

  <div style="margin-top: 20px; background: #f8fafc; border: 1.5px solid #1a1a1a; padding: 12px; font-size: 11px;">
    <strong>3-Step Quick Install:</strong>
    <ol style="margin-top: 6px; padding-left: 18px; line-height: 1.6;">
      <li>Unzip and double-click <code>Start-Installer.command</code> (Mac) or <code>Swayam404-Installer-Windows.bat</code> (Windows).</li>
      <li>In Chrome, navigate to <code>chrome://extensions</code> and toggle <strong>Developer mode</strong> ON.</li>
      <li>Click <strong>Load unpacked</strong> and select the <code>dist</code> folder.</li>
    </ol>
  </div>
</div>
```

---

## 4. Operating System Security Clearances

### macOS Gatekeeper
Because the installer script is distributed outside the Apple Mac App Store without an Apple Developer ID signature, macOS will present a warning:
- *"App cannot be opened because developer cannot be verified"*
- **Resolution:** Right-click `Start-Installer.command` (or `Swayam404 Installer.app`), select **Open**, and click **Open**.

### Windows SmartScreen
Because the script is downloaded directly from the internet without a Microsoft Authenticode certificate, Windows will present SmartScreen:
- *"Windows protected your PC"*
- **Resolution:** Click **More info** ➔ Click **Run anyway**.

---

## 5. Security & Safety Guarantees

1. **Manifest V3 Sandboxing:** The browser extension code runs strictly within Chromium's sandboxed environment. Remote scripts are strictly prohibited by Content Security Policy (`script-src 'self'`).
2. **Loopback Only:** The desktop companion binds strictly to `127.0.0.1:52410` (no public interfaces).
3. **Zip Slip Prevention:** The central directory header of every downloaded package is validated before extraction. Any entry containing directory traversal sequences (`..`), leading slashes, drive letters, or decompression bombs (>50MB uncompressed) is immediately rejected.
4. **Non-Destructive Backups:** Prior to replacing any files in `dist/`, the current working version is archived into `local-backups/backup-v{version}-{timestamp}`.
5. **Instant Rollback:** If any update fails, automated rollback restores the last known good installation.

---

## 6. Maintainer Release Checklist

When publishing a new release:
1. Update version in `package.json` and `public/manifest.json`.
2. Run quality gates:
   ```bash
   npm run build
   npm test
   npm run package:zip
   npm run package:installer
   ```
3. Create GitHub release tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. Attach the generated artifacts from `dist-zip/` and `dist-installer/` to the GitHub Release:
   - `swayam404-extension-v1.0.1.zip`
   - `Swayam404-Installer-macOS.zip`
   - `Swayam404-Installer-Windows.zip`
5. Published updates are immediately detected by all active installations!
