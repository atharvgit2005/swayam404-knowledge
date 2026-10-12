# Swayam404 Desktop Installer & Updater App — User & Developer Guide

The **Swayam404 Desktop Installer & Updater** is a cross-platform desktop application for **macOS** and **Windows** that automates the installation, build verification, local update server, and release update lifecycle without requiring manual terminal commands.

---

## 1. Quick Launch (How to Run the App)

### On macOS:
You have two instant options:
- **Option A (Desktop App)**: Double-click `Swayam404-Installer-Mac.command` in the project root folder.
- **Option B (macOS App Bundle)**: Open `installer-app/mac/` and double-click `Swayam404 Installer.app`.
- **Option C (Terminal)**: Run `npm run installer:open`.

*The app launches in a clean, distraction-free desktop window.*

### On Windows:
You have two instant options:
- **Option A (Desktop App)**: Double-click `Swayam404-Installer-Windows.bat` in the project root folder.
- **Option B (Command / PowerShell)**: Double-click `installer-app\windows\Swayam404-Installer.cmd` or run `installer-app\windows\Swayam404-Installer.ps1`.
- **Option C (Command Prompt)**: Run `npm run installer:open`.

---

## 2. Desktop Application Features

The Desktop App presents a clean, responsive Neo-Brutalist dashboard divided into 4 key control sections:

### Section 1: Chrome / Brave Installation
- **Status Badge**: Shows whether `dist/` is built and the compiled version (`BUILT (v1.0.0)` or `NOT BUILT`).
- **Copy Path**: One-click copies the full path to `dist/` to your clipboard for pasting into `chrome://extensions`.
- **🔨 Build Extension**: Compiles the extension using Vite & TypeScript and verifies zero forbidden `_` filenames.
- **🌐 Open chrome://extensions**: Automatically opens your browser directly to the extension management page.
- **📁 Open dist/ Folder**: Reveals the extension directory in macOS Finder or Windows File Explorer.

### Section 2: Loopback Update Server Controller
- **Toggle Button**: Start or stop the local update server (`http://127.0.0.1:52404`) with a single click.
- **Live Status Badge**: Displays `RUNNING` (green) or `STOPPED` (red).
- **Security Guarantee**: Strictly binds to loopback (`127.0.0.1`); no public ports are opened.

### Section 3: Generate Local Releases
- **Release Version**: Input field to set target release versions (e.g. `1.1.0`, `1.2.0`).
- **Release Notes**: Custom changelog notes for testing update descriptions in the extension UI.
- **📦 Generate Release**: Packages the extension into `local-releases/`, computes SHA-256 hash, and updates `latest.json`.
- **⚠️ Corrupted Release Test**: Simulates a corrupted package to test the extension's checksum rejection safeguards.

### Section 4: Apply Update & Safe Rollback (Stages 5, 6 & 9)
- **🚀 Apply Update to dist/**:
  1. Inspects the target release ZIP for safety (Zip Slip prevention).
  2. Creates a restorable snapshot in `local-backups/backup-v{version}-{timestamp}/`.
  3. Replaces `dist/` with the new version.
  4. Automatically recovers if any file operation fails.
- **🔄 Rollback to Previous Backup**: Instantly reverts `dist/` to the last working backup snapshot.
- **Backups Count & Metadata**: Displays how many recoverable backups exist.

### Section 5: Real-Time Console & Activity Log
- A live terminal window that streams all command execution details, build outputs, and error diagnostics with timestamps.

---

## 3. End-to-End Walkthrough Using the Desktop App

1. Launch `Swayam404-Installer-Mac.command` (on Mac) or `Swayam404-Installer-Windows.bat` (on Windows).
2. Click **🔨 Build Extension**.
3. Click **🌐 Open chrome://extensions**.
4. In Chrome, toggle **Developer mode** ON, click **Load unpacked**, and paste/select the `dist/` directory.
5. In the Desktop App, click **▶ Start Update Server**.
6. Under *Generate Test Release*, set Version to `1.1.0` and click **📦 Generate Release**.
7. In your Chrome extension popup, open **Settings** → **Check for Updates** → click **Download & Verify Package**.
8. In the Desktop App, click **🚀 Apply Update to dist/**.
9. In Chrome, click the **Reload (↻)** icon on Swayam404.
10. In the extension popup Settings, click **Confirm Running Version** → Version flips to **`v1.1.0`**!
11. If you want to revert: In the Desktop App, click **🔄 Rollback to Previous Backup**, then reload in Chrome!
