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
  // 1. Package macOS Distribution
  // ----------------------------------------------------
  console.log('🍎 Assembling macOS installer package...');
  const macAppSrc = path.join(installerAppDir, 'mac', 'Swayam404 Installer.app');
  const macCommandSrc = path.join(installerAppDir, 'mac', 'Swayam404 Installer.command');
  const rootMacCommand = path.join(root, 'Swayam404-Installer-Mac.command');

  // Copy dist extension folder
  fs.cpSync(distDir, path.join(MAC_DIR, 'dist'), { recursive: true });

  // Copy app bundle and launcher scripts
  if (fs.existsSync(macAppSrc)) {
    fs.cpSync(macAppSrc, path.join(MAC_DIR, 'Swayam404 Installer.app'), { recursive: true });
  }
  if (fs.existsSync(macCommandSrc)) {
    fs.copyFileSync(macCommandSrc, path.join(MAC_DIR, 'Swayam404 Installer.command'));
    fs.chmodSync(path.join(MAC_DIR, 'Swayam404 Installer.command'), 0o755);
  }
  if (fs.existsSync(rootMacCommand)) {
    fs.copyFileSync(rootMacCommand, path.join(MAC_DIR, 'Start-Installer.command'));
    fs.chmodSync(path.join(MAC_DIR, 'Start-Installer.command'), 0o755);
  }

  // Copy installer-app assets (server.mjs, public)
  fs.cpSync(installerAppDir, path.join(MAC_DIR, 'installer-app'), { recursive: true });

  // Add macOS README
  const macReadme = `# Swayam404 Desktop Installer & Chrome Extension (macOS)

## Quick Start on Mac:
Method A (Direct Load - Fastest):
1. Open Google Chrome (or Brave / Edge / Arc) to: chrome://extensions
2. Toggle "Developer mode" ON (top right corner).
3. Click "Load unpacked" (top left).
4. Select the "dist" folder included in this package.
5. The Swayam404 extension is now active and ready to use!

Method B (Installer Dashboard App):
1. Double-click "Start-Installer.command" or "Swayam404 Installer.app".
2. If macOS displays a Gatekeeper security warning:
   - Right-click "Start-Installer.command" -> Open -> Click "Open"
3. The dashboard opens at http://127.0.0.1:52410 where you can manage updates and check status.

All updates and releases can be applied with one click!
`;
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
      console.log('💿 Creating macOS DMG disk image with hdiutil...');
      try {
        if (fs.existsSync(macDmg)) fs.unlinkSync(macDmg);
        execFileSync('hdiutil', [
          'create',
          '-volname', 'Swayam404-Installer',
          '-srcfolder', MAC_DIR,
          '-ov',
          '-format', 'UDZO',
          macDmg,
        ]);
        console.log(`🍏 macOS DMG created: ${macDmg}`);
      } catch (dmgErr) {
        console.warn('⚠️ Warning: Failed to create DMG disk image:', dmgErr.message);
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
