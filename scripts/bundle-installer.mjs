#!/usr/bin/env node
/**
 * Swayam404 Standalone Installer Packaging Tool
 *
 * Packages the macOS and Windows desktop installer & updater apps into
 * clean, distributable standalone archives in dist-installer/.
 *
 * Generated artifacts:
 * - dist-installer/mac/
 * - dist-installer/windows/
 * - dist-installer/Swayam404-Installer-macOS.zip
 * - dist-installer/Swayam404-Installer-Windows.zip
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const OUT_DIR = path.join(root, 'dist-installer');
const MAC_DIR = path.join(OUT_DIR, 'mac');
const WIN_DIR = path.join(OUT_DIR, 'windows');

export function bundleInstallerPackages() {
  console.log('========================================================');
  console.log('📦 Swayam404 Desktop Installer Packaging Tool');
  console.log('========================================================');

  // Clean / prepare dist-installer directory
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(MAC_DIR, { recursive: true });
  fs.mkdirSync(WIN_DIR, { recursive: true });

  const installerAppDir = path.join(root, 'installer-app');
  const distDir = path.join(root, 'dist');

  // Verify dist folder exists
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.log('🔨 dist/ not found or missing manifest.json. Building extension...');
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  }

  // ----------------------------------------------------
  // ----------------------------------------------------
  // 1. Package macOS Distribution & DMG Staging
  // ----------------------------------------------------
  console.log('🍎 Assembling macOS installer package & DMG...');
  const macAppSrc = path.join(installerAppDir, 'mac', 'Swayam404 Installer.app');
  const macCommandSrc = path.join(installerAppDir, 'mac', 'Swayam404 Installer.command');
  const rootMacCommand = path.join(root, 'Swayam404-Installer-Mac.command');

  // Copy dist extension folder for manual inspection / zip
  fs.cpSync(distDir, path.join(MAC_DIR, 'dist'), { recursive: true });

  // Prepare self-contained Swayam404 Installer.app in MAC_DIR
  const macAppDest = path.join(MAC_DIR, 'Swayam404 Installer.app');
  if (fs.existsSync(macAppSrc)) {
    fs.cpSync(macAppSrc, macAppDest, { recursive: true });
  }

  // Embed full app resources into Swayam404 Installer.app/Contents/Resources/app
  const appResourcesDir = path.join(macAppDest, 'Contents', 'Resources', 'app');
  fs.mkdirSync(appResourcesDir, { recursive: true });
  fs.cpSync(path.join(installerAppDir, 'server.mjs'), path.join(appResourcesDir, 'server.mjs'));
  fs.cpSync(path.join(installerAppDir, 'public'), path.join(appResourcesDir, 'public'), { recursive: true });
  fs.cpSync(path.join(installerAppDir, 'lib'), path.join(appResourcesDir, 'lib'), { recursive: true });
  fs.cpSync(distDir, path.join(appResourcesDir, 'dist'), { recursive: true });

  // Compile Swift universal Mach-O binary if swiftc is available
  try {
    const swiftSrc = path.join(installerAppDir, 'mac', 'tray-app.swift');
    const macBinTarget = path.join(macAppDest, 'Contents', 'MacOS', 'Swayam404 Installer');
    const fallbackTarget = path.join(macAppDest, 'Contents', 'MacOS', 'native-window');
    if (fs.existsSync(swiftSrc) && process.platform === 'darwin') {
      const tmpArm64 = '/tmp/swayam-arm64';
      const tmpX86 = '/tmp/swayam-x86_64';
      try {
        execFileSync('swiftc', ['-target', 'arm64-apple-macos11.0', '-O', '-o', tmpArm64, swiftSrc]);
        execFileSync('swiftc', ['-target', 'x86_64-apple-macos11.0', '-O', '-o', tmpX86, swiftSrc]);
        execFileSync('lipo', ['-create', '-output', macBinTarget, tmpArm64, tmpX86]);
      } catch {
        // Fallback to native architecture if cross-compilation fails
        execFileSync('swiftc', ['-O', '-o', macBinTarget, swiftSrc]);
      }
      fs.copyFileSync(macBinTarget, fallbackTarget);
      fs.chmodSync(macBinTarget, 0o755);
      fs.chmodSync(fallbackTarget, 0o755);
    }
  } catch (swiftErr) {
    console.warn('Note: Using fallback browser window launcher:', swiftErr.message);
  }

  // Ensure launcher is executable
  const launcherPath = path.join(macAppDest, 'Contents', 'MacOS', 'launcher');
  if (fs.existsSync(launcherPath)) {
    fs.chmodSync(launcherPath, 0o755);
  }

  // Ensure Info.plist specifies Swayam404 Installer as CFBundleExecutable
  const plistPath = path.join(macAppDest, 'Contents', 'Info.plist');
  if (fs.existsSync(plistPath)) {
    let plistContent = fs.readFileSync(plistPath, 'utf8');
    plistContent = plistContent.replace(
      /<key>CFBundleExecutable<\/key>\s*<string>[^<]+<\/string>/,
      '<key>CFBundleExecutable</key>\n    <string>Swayam404 Installer</string>'
    );
    fs.writeFileSync(plistPath, plistContent);
  }

  // Ad-hoc codesign the application bundle on macOS
  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--force', '--deep', '-s', '-', macAppDest]);
      console.log('✅ Ad-hoc codesigned Swayam404 Installer.app');
    } catch (signErr) {
      console.warn('Note: Ad-hoc signing note:', signErr.message);
    }
  }

  if (fs.existsSync(macCommandSrc)) {
    fs.copyFileSync(macCommandSrc, path.join(MAC_DIR, 'Swayam404 Installer.command'));
    fs.chmodSync(path.join(MAC_DIR, 'Swayam404 Installer.command'), 0o755);
  }
  if (fs.existsSync(rootMacCommand)) {
    fs.copyFileSync(rootMacCommand, path.join(MAC_DIR, 'Start-Installer.command'));
    fs.chmodSync(path.join(MAC_DIR, 'Start-Installer.command'), 0o755);
  }

  // 1-Click Install & Gatekeeper Helper Script
  const gatekeeperFixScript = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$DIR/Swayam404 Installer.app"
APP_DEST="/Applications/Swayam404 Installer.app"

echo "========================================================"
echo "⚡ Swayam404 Automatic 1-Click Installer"
echo "========================================================"
echo "1. Installing Swayam404 to /Applications..."
rm -rf "$APP_DEST" 2>/dev/null
cp -R "$APP_SRC" "/Applications/"

echo "2. Authorizing application with macOS Security..."
xattr -cr "$APP_DEST" 2>/dev/null || true

echo "3. Launching Swayam404 Installer..."
open "$APP_DEST"
echo "========================================================"
echo "🎉 Installation complete! Dashboard window opened."
echo "========================================================"
exit 0
`;
  const fixScriptPath = path.join(MAC_DIR, 'Open First Time (Gatekeeper Fix).command');
  fs.writeFileSync(fixScriptPath, gatekeeperFixScript);
  fs.chmodSync(fixScriptPath, 0o755);

  const oneClickScriptPath = path.join(MAC_DIR, '🚀 1-Click Install to Applications.command');
  fs.writeFileSync(oneClickScriptPath, gatekeeperFixScript);
  fs.chmodSync(oneClickScriptPath, 0o755);

  // Helper script for when macOS blocks with "Apple could not verify"
  const ifBlockedScript = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$DIR/Swayam404 Installer.app"
APP_DEST="/Applications/Swayam404 Installer.app"

echo "========================================================"
echo "⚡ Swayam404 — macOS Security Guide & Auto-Approval"
echo "========================================================"
echo ""
echo "1. Installing Swayam404 into /Applications..."
if [ -d "$APP_SRC" ]; then
    rm -rf "$APP_DEST" 2>/dev/null
    cp -R "$APP_SRC" "/Applications/" 2>/dev/null
fi

echo "2. Clearing Gatekeeper quarantine restrictions..."
xattr -cr "$APP_DEST" 2>/dev/null || true

echo "3. Opening System Settings to Privacy & Security..."
open "x-apple.systempreferences:com.apple.preference.security"

echo ""
echo "========================================================"
echo "👉 WHAT TO DO IN SYSTEM SETTINGS (Right Now):"
echo "========================================================"
echo "1. The System Settings window is now open on your screen."
echo "2. Scroll down to the 'Security' section."
echo "3. Click the 'Open Anyway' button next to Swayam404 Installer."
echo "4. When prompted, click 'Open'!"
echo "========================================================"
echo ""
echo "Launching Swayam404 Installer..."
sleep 1
open "$APP_DEST" 2>/dev/null || true
exit 0
`;
  const ifBlockedScriptPath = path.join(MAC_DIR, '⚠️ IF BLOCKED BY APPLE - CLICK HERE.command');
  fs.writeFileSync(ifBlockedScriptPath, ifBlockedScript);
  fs.chmodSync(ifBlockedScriptPath, 0o755);

  // Render Visual Guide PNG
  const visualGuidePng = path.join(MAC_DIR, '👀 STEP 2 - HOW TO APPROVE IN SETTINGS.png');
  try {
    const guideSvg = `<svg width="1200" height="680" viewBox="0 0 1200 680" xmlns="http://www.w3.org/2000/svg" style="background:#09090b; font-family:-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a" /><stop offset="100%" stop-color="#020617" /></linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fbbf24" /><stop offset="100%" stop-color="#f59e0b" /></linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000" flood-opacity="0.6"/></filter>
      </defs>
      <rect width="1200" height="680" fill="url(#bg)"/>
      <rect x="0" y="0" width="1200" height="8" fill="url(#gold)"/>
      <text x="600" y="55" text-anchor="middle" fill="#ffffff" font-size="28" font-weight="800">⚡ SWAYAM404 — macOS GATEKEEPER APPROVAL GUIDE</text>
      <text x="600" y="85" text-anchor="middle" fill="#94a3b8" font-size="16">If macOS shows "Apple could not verify...", follow these 3 simple steps (1-Time Setup):</text>

      <g transform="translate(60, 120)" filter="url(#shadow)">
        <rect width="320" height="420" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <rect x="0" y="0" width="320" height="48" rx="16" fill="#334155"/>
        <text x="24" y="32" fill="#38bdf8" font-size="18" font-weight="700">STEP 1: The Warning</text>
        <rect x="24" y="80" width="272" height="200" rx="12" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
        <circle cx="160" cy="120" r="24" fill="#fbbf24" opacity="0.2"/>
        <text x="160" y="128" text-anchor="middle" fill="#fbbf24" font-size="24">⚠️</text>
        <text x="160" y="170" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700">"Swayam404" Not Opened</text>
        <text x="160" y="195" text-anchor="middle" fill="#94a3b8" font-size="11">Apple could not verify that</text>
        <text x="160" y="210" text-anchor="middle" fill="#94a3b8" font-size="11">this app is free of malware.</text>
        <rect x="90" y="235" width="140" height="28" rx="6" fill="#2563eb"/>
        <text x="160" y="254" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="600">Done</text>
        <text x="24" y="320" fill="#f8fafc" font-size="15" font-weight="600">Double-clicking in DMG</text>
        <text x="24" y="345" fill="#94a3b8" font-size="13">triggers macOS Gatekeeper</text>
        <text x="24" y="365" fill="#94a3b8" font-size="13">because it is an open-source</text>
        <text x="24" y="385" fill="#94a3b8" font-size="13">community tool.</text>
      </g>

      <g transform="translate(400, 310)"><text x="0" y="0" fill="#fbbf24" font-size="36" font-weight="bold">➔</text></g>

      <g transform="translate(440, 120)" filter="url(#shadow)">
        <rect width="340" height="420" rx="16" fill="#1e293b" stroke="#fbbf24" stroke-width="2.5"/>
        <rect x="0" y="0" width="340" height="48" rx="16" fill="#f59e0b" opacity="0.2"/>
        <text x="24" y="32" fill="#fbbf24" font-size="18" font-weight="700">STEP 2: Privacy &amp; Security</text>
        <rect x="20" y="70" width="300" height="220" rx="12" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
        <text x="40" y="105" fill="#e2e8f0" font-size="13" font-weight="600">⚙️ System Settings</text>
        <text x="40" y="128" fill="#94a3b8" font-size="12">➔ Privacy &amp; Security</text>
        <line x1="30" y1="145" x2="310" y2="145" stroke="#334155" stroke-width="1"/>
        <text x="40" y="172" fill="#e2e8f0" font-size="12" font-weight="600">Security</text>
        <text x="40" y="195" fill="#94a3b8" font-size="10">"Swayam404 Installer" was</text>
        <text x="40" y="210" fill="#94a3b8" font-size="10">blocked to protect your Mac.</text>
        <rect x="180" y="185" width="125" height="32" rx="8" fill="#fbbf24"/>
        <text x="242" y="206" text-anchor="middle" fill="#09090b" font-size="13" font-weight="800">Open Anyway</text>
        <text x="242" y="245" text-anchor="middle" fill="#fbbf24" font-size="18">⬆️ CLICK THIS</text>
        <text x="24" y="325" fill="#f8fafc" font-size="14" font-weight="600">Open System Settings</text>
        <text x="24" y="350" fill="#94a3b8" font-size="13">Scroll down to the "Security"</text>
        <text x="24" y="370" fill="#94a3b8" font-size="13">section and click the</text>
        <text x="24" y="390" fill="#fbbf24" font-size="14" font-weight="700">"Open Anyway" button.</text>
      </g>

      <g transform="translate(800, 310)"><text x="0" y="0" fill="#22c55e" font-size="36" font-weight="bold">➔</text></g>

      <g transform="translate(840, 120)" filter="url(#shadow)">
        <rect width="300" height="420" rx="16" fill="#1e293b" stroke="#22c55e" stroke-width="2"/>
        <rect x="0" y="0" width="300" height="48" rx="16" fill="#22c55e" opacity="0.15"/>
        <text x="24" y="32" fill="#22c55e" font-size="18" font-weight="700">STEP 3: Confirm "Open"</text>
        <rect x="20" y="80" width="260" height="190" rx="12" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
        <text x="130" y="125" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700">Are you sure you want</text>
        <text x="130" y="145" text-anchor="middle" fill="#f8fafc" font-size="14" font-weight="700">to open it?</text>
        <rect x="40" y="195" width="90" height="30" rx="6" fill="#334155"/>
        <text x="85" y="215" text-anchor="middle" fill="#cbd5e1" font-size="12">Cancel</text>
        <rect x="150" y="195" width="105" height="30" rx="6" fill="#22c55e"/>
        <text x="202" y="215" text-anchor="middle" fill="#09090b" font-size="13" font-weight="800">Open</text>
        <text x="202" y="248" text-anchor="middle" fill="#22c55e" font-size="14">⬆️ Click Open</text>
        <text x="24" y="315" fill="#f8fafc" font-size="15" font-weight="600">🎉 Done!</text>
        <text x="24" y="340" fill="#94a3b8" font-size="13">Swayam404 will open</text>
        <text x="24" y="360" fill="#94a3b8" font-size="13">immediately and never</text>
        <text x="24" y="380" fill="#94a3b8" font-size="13">ask again!</text>
      </g>

      <rect x="60" y="570" width="1080" height="70" rx="14" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
      <text x="90" y="612" fill="#fbbf24" font-size="20">⚡</text>
      <text x="125" y="602" fill="#f8fafc" font-size="15" font-weight="700">FASTEST 1-CLICK METHOD:</text>
      <text x="125" y="624" fill="#94a3b8" font-size="14">Double-click <tspan fill="#38bdf8" font-weight="600">"⚠️ IF BLOCKED BY APPLE - CLICK HERE.command"</tspan> in this DMG window — it opens Settings automatically!</text>
    </svg>`;
    const tmpSvg = '/tmp/swayam_guide_gen.svg';
    fs.writeFileSync(tmpSvg, guideSvg);
    execFileSync('qlmanage', ['-t', '-s', '1200', '-o', '/tmp', tmpSvg]);
    if (fs.existsSync('/tmp/swayam_guide_gen.svg.png')) {
      fs.copyFileSync('/tmp/swayam_guide_gen.svg.png', visualGuidePng);
    }
  } catch (imgErr) {
    console.warn('Note: Guide image generation:', imgErr.message);
  }

  // Add macOS README
  const macReadme = `# Swayam404 Desktop Installer (macOS)

============================================================
HOW TO INSTALL:
============================================================
OPTION 1 (Easiest — 1-Click):
• Double-click "🚀 1-Click Install to Applications.command"
  (or "⚠️ IF BLOCKED BY APPLE - CLICK HERE.command")!
  It will automatically copy the app to /Applications and launch it.

OPTION 2 (Standard macOS Drag & Drop):
1. Drag "Swayam404 Installer" into the "Applications" folder right next to it.
2. Open your "Applications" folder and double-click "Swayam404 Installer".

============================================================
IF macOS BLOCKS WITH "Apple could not verify..."
============================================================
Because this is an open-source tool built by students:
• Method A: Double-click "⚠️ IF BLOCKED BY APPLE - CLICK HERE.command" (opens Settings for you!)
• Method B: Right-click (or Control-click) Swayam404 Installer ➔ Open ➔ Click "Open"
• Method C: Open System Settings > Privacy & Security > scroll to "Security" > Click "Open Anyway"
============================================================
`;
  fs.writeFileSync(path.join(MAC_DIR, 'HOW TO INSTALL.txt'), macReadme);
  fs.writeFileSync(path.join(MAC_DIR, 'README.txt'), macReadme);

  // ----------------------------------------------------
  // 2. Package Windows Distribution
  // ----------------------------------------------------
  console.log('🪟 Assembling Windows installer package...');
  const winSrcDir = path.join(installerAppDir, 'windows');
  const rootWinBat = path.join(root, 'Swayam404-Installer-Windows.bat');

  // Copy dist extension folder
  fs.cpSync(distDir, path.join(WIN_DIR, 'dist'), { recursive: true });

  if (fs.existsSync(winSrcDir)) {
    fs.cpSync(winSrcDir, path.join(WIN_DIR, 'windows-scripts'), { recursive: true });
  }
  if (fs.existsSync(rootWinBat)) {
    fs.copyFileSync(rootWinBat, path.join(WIN_DIR, 'Swayam404-Installer-Windows.bat'));
  }

  // Copy installer-app assets
  fs.cpSync(installerAppDir, path.join(WIN_DIR, 'installer-app'), { recursive: true });

  // Add Windows README
  const winReadme = `# Swayam404 Desktop Installer & Chrome Extension (Windows)

## Quick Start on Windows:
Method A (Direct Load - Fastest):
1. Open Google Chrome (or Brave / Edge) to: chrome://extensions
2. Toggle "Developer mode" ON (top right corner).
3. Click "Load unpacked" (top left).
4. Select the "dist" folder included in this package.
5. The Swayam404 extension is now active and ready to use!

Method B (Installer Dashboard Script):
1. Double-click "Swayam404-Installer-Windows.bat".
2. If Windows SmartScreen displays "Windows protected your PC":
   - Click "More info" -> Click "Run anyway".
3. The installer dashboard will automatically launch in your browser.
4. Follow the on-screen instructions.

All future updates will be applied automatically from GitHub or local releases with one click!
`;
  fs.writeFileSync(path.join(WIN_DIR, 'README.txt'), winReadme);

  // ----------------------------------------------------
  // 3. Compress into Release Archives & DMG
  // ----------------------------------------------------
  console.log('🗜️  Compressing distributable packages...');
  const macZip = path.join(OUT_DIR, 'Swayam404-Installer-macOS.zip');
  const winZip = path.join(OUT_DIR, 'Swayam404-Installer-Windows.zip');
  const macDmg = path.join(OUT_DIR, 'Swayam404-Installer-macOS.dmg');

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const zipBin = fs.existsSync('/usr/bin/zip') ? '/usr/bin/zip' : 'zip';
    execFileSync(zipBin, ['-r', '-q', macZip, '.'], { cwd: MAC_DIR });
    execFileSync(zipBin, ['-r', '-q', winZip, '.'], { cwd: WIN_DIR });

    if (process.platform === 'darwin') {
      console.log('💿 Creating macOS DMG disk image with drag-to-Applications layout...');
      const DMG_STAGING = path.join(OUT_DIR, 'dmg-staging');
      if (fs.existsSync(DMG_STAGING)) fs.rmSync(DMG_STAGING, { recursive: true, force: true });
      fs.mkdirSync(DMG_STAGING, { recursive: true });

      // In DMG staging: copy app, symlink Applications, gatekeeper helper, visual guide, and readme
      fs.cpSync(macAppDest, path.join(DMG_STAGING, 'Swayam404 Installer.app'), { recursive: true });
      fs.symlinkSync('/Applications', path.join(DMG_STAGING, 'Applications'));
      fs.copyFileSync(ifBlockedScriptPath, path.join(DMG_STAGING, '⚠️ IF BLOCKED BY APPLE - CLICK HERE.command'));
      fs.chmodSync(path.join(DMG_STAGING, '⚠️ IF BLOCKED BY APPLE - CLICK HERE.command'), 0o755);
      fs.copyFileSync(oneClickScriptPath, path.join(DMG_STAGING, '🚀 1-Click Install to Applications.command'));
      fs.chmodSync(path.join(DMG_STAGING, '🚀 1-Click Install to Applications.command'), 0o755);
      fs.copyFileSync(fixScriptPath, path.join(DMG_STAGING, 'Open First Time (Gatekeeper Fix).command'));
      fs.chmodSync(path.join(DMG_STAGING, 'Open First Time (Gatekeeper Fix).command'), 0o755);
      if (fs.existsSync(visualGuidePng)) {
        fs.copyFileSync(visualGuidePng, path.join(DMG_STAGING, '👀 STEP 2 - HOW TO APPROVE IN SETTINGS.png'));
      }
      fs.copyFileSync(path.join(MAC_DIR, 'HOW TO INSTALL.txt'), path.join(DMG_STAGING, 'HOW TO INSTALL.txt'));
      fs.copyFileSync(path.join(MAC_DIR, 'README.txt'), path.join(DMG_STAGING, 'README.txt'));

      try {
        if (fs.existsSync(macDmg)) fs.unlinkSync(macDmg);
        execFileSync('hdiutil', [
          'create',
          '-volname', 'Swayam404 Installer',
          '-srcfolder', DMG_STAGING,
          '-ov',
          '-format', 'UDZO',
          macDmg,
        ]);
        console.log(`🍏 macOS DMG created: ${macDmg}`);
      } catch (dmgErr) {
        console.warn('⚠️ Warning: Failed to create DMG disk image:', dmgErr.message);
      } finally {
        fs.rmSync(DMG_STAGING, { recursive: true, force: true });
      }
    }
  } else {
    // Windows
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path "${MAC_DIR}\\*" -DestinationPath "${macZip}" -Force; Compress-Archive -Path "${WIN_DIR}\\*" -DestinationPath "${winZip}" -Force`,
    ]);
  }

  const hasDmg = fs.existsSync(macDmg);

  console.log('========================================================');
  console.log('✅ Standalone Installer Packages Created Successfully!');
  console.log('========================================================');
  if (hasDmg) {
    console.log(`💿 macOS DMG:       ${macDmg} (${(fs.statSync(macDmg).size / (1024 * 1024)).toFixed(2)} MB)`);
  }
  console.log(`📁 macOS ZIP:       ${macZip} (${(fs.statSync(macZip).size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`📁 Windows ZIP:     ${winZip} (${(fs.statSync(winZip).size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('========================================================');

  return {
    outDir: OUT_DIR,
    macDmg: hasDmg ? macDmg : null,
    macZip,
    winZip,
    macDmgSize: hasDmg ? fs.statSync(macDmg).size : 0,
    macSize: fs.statSync(macZip).size,
    winSize: fs.statSync(winZip).size,
  };
}

if (process.argv[1] && process.argv[1].endsWith('bundle-installer.mjs')) {
  bundleInstallerPackages();
}
