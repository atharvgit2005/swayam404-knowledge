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

  // Compile Swift native window if swiftc is available
  try {
    const swiftSrc = path.join(installerAppDir, 'mac', 'tray-app.swift');
    const binTarget = path.join(macAppDest, 'Contents', 'MacOS', 'native-window');
    if (fs.existsSync(swiftSrc) && process.platform === 'darwin') {
      execFileSync('swiftc', ['-O', '-o', binTarget, swiftSrc]);
      fs.chmodSync(binTarget, 0o755);
    }
  } catch (swiftErr) {
    console.warn('Note: Using fallback browser window launcher:', swiftErr.message);
  }

  // Ensure launcher is executable
  const launcherPath = path.join(macAppDest, 'Contents', 'MacOS', 'launcher');
  if (fs.existsSync(launcherPath)) {
    fs.chmodSync(launcherPath, 0o755);
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

  // 1-Click Gatekeeper Helper Script
  const gatekeeperFixScript = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Swayam404 Installer.app"

echo "========================================================"
echo "⚡ Swayam404 macOS Gatekeeper Security Helper"
echo "========================================================"
echo "Clearing macOS quarantine attribute..."

xattr -d com.apple.quarantine "$DIR/$APP_NAME" 2>/dev/null || xattr -cr "$DIR/$APP_NAME" 2>/dev/null
xattr -d com.apple.quarantine "/Applications/$APP_NAME" 2>/dev/null || xattr -cr "/Applications/$APP_NAME" 2>/dev/null

echo "✅ Quarantine cleared! Launching Swayam404 Installer..."
if [ -d "/Applications/$APP_NAME" ]; then
    open "/Applications/$APP_NAME"
else
    open "$DIR/$APP_NAME"
fi
exit 0
`;
  const fixScriptPath = path.join(MAC_DIR, 'Open First Time (Gatekeeper Fix).command');
  fs.writeFileSync(fixScriptPath, gatekeeperFixScript);
  fs.chmodSync(fixScriptPath, 0o755);

  // Add macOS README
  const macReadme = `# Swayam404 Desktop Installer (macOS)

============================================================
HOW TO INSTALL:
============================================================
1. Drag "Swayam404 Installer" into the "Applications" folder.
2. Open "Applications" and double-click "Swayam404 Installer".

============================================================
IF macOS BLOCKS WITH "Apple could not verify..."
============================================================
Because this is an open-source tool built by students without a $99/yr Apple certificate,
macOS Gatekeeper protects your Mac. Choose ANY of these 3 easy ways:

OPTION A (Fastest 1-Click):
• Double-click "Open First Time (Gatekeeper Fix).command" in this window!

OPTION B (Standard macOS Right-Click):
• Right-click (or Control-click) "Swayam404 Installer"
• Click "Open"
• Click "Open" in the prompt.

OPTION C (System Settings):
• Open System Settings > Privacy & Security
• Scroll down to the "Security" section
• Click "Open Anyway" next to Swayam404 Installer!
============================================================
`;
  fs.writeFileSync(path.join(MAC_DIR, 'HOW TO INSTALL.txt'), macReadme);

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

      // In DMG staging: copy app, symlink Applications, gatekeeper helper, and readme
      fs.cpSync(macAppDest, path.join(DMG_STAGING, 'Swayam404 Installer.app'), { recursive: true });
      fs.symlinkSync('/Applications', path.join(DMG_STAGING, 'Applications'));
      fs.copyFileSync(fixScriptPath, path.join(DMG_STAGING, 'Open First Time (Gatekeeper Fix).command'));
      fs.chmodSync(path.join(DMG_STAGING, 'Open First Time (Gatekeeper Fix).command'), 0o755);
      fs.copyFileSync(path.join(MAC_DIR, 'HOW TO INSTALL.txt'), path.join(DMG_STAGING, 'HOW TO INSTALL.txt'));

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
