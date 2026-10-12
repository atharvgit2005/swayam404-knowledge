#!/usr/bin/env node
/**
 * Swayam404 Production Extension Packaging Tool
 *
 * Prepares clean production ZIP archive from dist/ for:
 * - Unlisted / Public Chrome Web Store distribution
 * - GitHub release distribution
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function packageExtension() {
  console.log('📦 Swayam404 Extension Packaging Tool');

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.version;
  const distDir = path.join(root, 'dist');

  if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.log('🔨 dist/ not found or missing manifest.json. Running production build first...');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }

  const zipName = `swayam404-extension-v${version}.zip`;
  const zipPath = path.join(root, zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`🗜️  Compressing dist/ contents into ${zipName}...`);
  // CD into dist and zip all files so root of archive contains manifest.json directly (Chrome Web Store requirement)
  execSync(`cd "${distDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'inherit' });

  const stat = fs.statSync(zipPath);
  console.log(`✅ Packaged successfully: ${zipName} (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log('🎯 Archive is ready for Chrome Web Store upload or manual unpacked distribution.');
}

packageExtension();
