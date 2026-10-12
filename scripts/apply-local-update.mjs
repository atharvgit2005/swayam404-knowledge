#!/usr/bin/env node
/**
 * Swayam404 Local Extension Apply & Recovery Utility
 *
 * Implements Stage 6 (Apply), Stage 7 (Reload), and Stage 9 (Recover) of the update lifecycle.
 *
 * Safety Guarantees:
 * - Pre-validates ZIP entry paths against Zip Slip before extraction
 * - Verifies package SHA-256 digest against release metadata
 * - Validates internal manifest version and required bundle assets
 * - Automatically creates a restorable backup in local-backups/ before replacing dist/
 * - Atomic fallback to backup if file replacement fails
 * - Provides --rollback CLI command to restore the previous working installation
 * - Strictly bounded to the local project root (no arbitrary filesystem paths)
 *
 * Usage:
 *   node scripts/apply-local-update.mjs
 *   node scripts/apply-local-update.mjs --rollback
 *   node scripts/apply-local-update.mjs --version 1.1.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const RELEASES_DIR = path.join(root, 'local-releases');
const STAGING_ROOT = path.join(root, 'local-staging');
const BACKUPS_DIR = path.join(root, 'local-backups');
const DIST_DIR = path.join(root, 'dist');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    version: null,
    rollback: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rollback') {
      options.rollback = true;
    } else if (args[i] === '--version' && args[i + 1]) {
      options.version = args[i + 1].trim();
      i++;
    } else if (args[i] === '--force') {
      options.force = true;
    }
  }

  return options;
}

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Safely extracts a ZIP archive across platforms (macOS, Linux, Windows)
 */
export function extractZipSafe(packagePath, destinationDir) {
  if (process.platform === 'win32') {
    // Windows: Use PowerShell Expand-Archive
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath "${packagePath}" -DestinationPath "${destinationDir}" -Force`,
    ], { stdio: 'pipe' });
  } else {
    // macOS / Linux: use unzip or /usr/bin/unzip
    const unzipBin = fs.existsSync('/usr/bin/unzip') ? '/usr/bin/unzip' : 'unzip';
    execFileSync(unzipBin, ['-q', packagePath, '-d', destinationDir], { stdio: 'pipe' });
  }
}

/**
 * Rolls back dist/ to the last saved backup in local-backups/
 */
export function rollbackToLastBackup(options = {}) {
  console.log('🔄 Initiating rollback from last verified backup...');

  const backupsDir = options.backupsDir || BACKUPS_DIR;
  const distDir = options.distDir || DIST_DIR;

  const lastBackupMetaPath = path.join(backupsDir, 'last-backup.json');
  if (!fs.existsSync(lastBackupMetaPath)) {
    throw new Error('No previous backup record found in local-backups/. Cannot roll back.');
  }

  const backupMeta = JSON.parse(fs.readFileSync(lastBackupMetaPath, 'utf8'));
  const backupPath = backupMeta.backupPath;

  if (!fs.existsSync(backupPath) || !fs.existsSync(path.join(backupPath, 'manifest.json'))) {
    throw new Error(`Backup directory is missing or invalid: ${backupPath}`);
  }

  // Restore dist from backup
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
  fs.cpSync(backupPath, distDir, { recursive: true });

  console.log('✅ Rollback successful!');
  console.log(`   • Restored Version: v${backupMeta.installedVersion}`);
  console.log(`   • Restored From:    ${backupPath}`);
  console.log('👉 Next Step: Open chrome://extensions and click Reload (↻).');

  return backupMeta;
}

/**
 * Applies a verified release package to dist/ with automatic backup
 */
export async function applyUpdate(options = {}) {
  const opts = { ...parseArgs(), ...options };

  const releasesDir = opts.releasesDir || RELEASES_DIR;
  const stagingRoot = opts.stagingRoot || STAGING_ROOT;
  const backupsDir = opts.backupsDir || BACKUPS_DIR;
  const distDir = opts.distDir || DIST_DIR;

  if (opts.rollback) {
    return rollbackToLastBackup({ backupsDir, distDir });
  }

  console.log('========================================================');
  console.log('🚀 Swayam404 Local Update Apply & Staging Tool');
  console.log('========================================================');

  // 1. Locate release metadata
  const metadataFilename = opts.version ? `v${opts.version}.json` : 'latest.json';
  const metadataPath = path.join(releasesDir, metadataFilename);

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Release metadata not found: ${metadataPath}. Generate a release first using "npm run release:local".`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const targetVersion = metadata.version;
  console.log(`📦 Target Release: v${targetVersion} (${metadata.packageFilename})`);

  // 2. Validate package file on disk
  const packagePath = path.join(releasesDir, metadata.packageFilename);
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Release package file not found: ${packagePath}`);
  }

  const stat = fs.statSync(packagePath);
  if (stat.size !== metadata.fileSize) {
    throw new Error(`Package size mismatch: Expected ${metadata.fileSize} bytes, found ${stat.size} bytes (truncated or corrupt).`);
  }

  // 3. Verify SHA-256 Checksum
  console.log('🔍 Stage 4 (Verify): Checking SHA-256 package digest...');
  const computedHash = computeSha256(packagePath);
  if (computedHash.toLowerCase() !== metadata.sha256.toLowerCase()) {
    throw new Error(`Security Violation: Checksum mismatch!\nExpected: ${metadata.sha256}\nComputed: ${computedHash}\nPackage rejected.`);
  }
  console.log('   ✅ SHA-256 integrity verified.');

  // 4. Pre-extraction ZIP Inspection (Zero-dependency parser)
  console.log('🔍 Pre-inspecting ZIP entries against Zip Slip and directory escapes...');
  const { validateZipPackage } = await import('./zipValidator.mjs');
  const packageBuffer = fs.readFileSync(packagePath);
  const zipValidation = validateZipPackage(packageBuffer, {
    requireAssets: true,
    expectedVersion: targetVersion,
  });

  if (!zipValidation.valid) {
    throw new Error(`Package security audit failed:\n  • ${zipValidation.errors.join('\n  • ')}`);
  }
  console.log(`   ✅ Validated ${zipValidation.entries.length} safe entries (${(zipValidation.totalUncompressedSize / 1024).toFixed(1)} KB uncompressed).`);

  // 5. Stage to isolated directory: stagingRoot/v{version}
  console.log(`📁 Stage 5 (Stage): Extracting release into isolated staging directory...`);
  const stagingDir = path.join(stagingRoot, `v${targetVersion}`);
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // Cross-platform safe extraction
  extractZipSafe(packagePath, stagingDir);

  // Verify staged manifest version matches metadata
  const stagedManifestPath = path.join(stagingDir, 'manifest.json');
  if (!fs.existsSync(stagedManifestPath)) {
    throw new Error('Staging failed: manifest.json missing from extracted bundle.');
  }
  const stagedManifest = JSON.parse(fs.readFileSync(stagedManifestPath, 'utf8'));
  if (stagedManifest.version !== targetVersion) {
    throw new Error(`Version conflict: Staged manifest version (${stagedManifest.version}) does not match release metadata (${targetVersion}).`);
  }
  console.log('   ✅ Staged bundle verified against manifest.');

  // 6. Backup existing dist/ (Stage 9: Recover safeguard)
  console.log('💾 Preserving recoverable backup of current installation...');
  let currentInstalledVersion = '1.0.0';
  const currentManifestPath = path.join(distDir, 'manifest.json');
  if (fs.existsSync(currentManifestPath)) {
    try {
      const curMan = JSON.parse(fs.readFileSync(currentManifestPath, 'utf8'));
      if (curMan.version) currentInstalledVersion = curMan.version;
    } catch {
      // ignore
    }
  }

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `backup-v${currentInstalledVersion}-${timestamp}`);
  if (fs.existsSync(distDir)) {
    fs.cpSync(distDir, backupPath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(backupsDir, 'last-backup.json'),
    JSON.stringify({
      installedVersion: currentInstalledVersion,
      targetVersion,
      backupPath,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log(`   ✅ Backup created at: ${backupPath}`);

  // 7. Stage 6 (Apply): Replace distDir with validated staging files
  console.log(`🚀 Stage 6 (Apply): Applying v${targetVersion} to active dist/ directory...`);
  try {
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });
    fs.cpSync(stagingDir, distDir, { recursive: true });

    // Validate replacement succeeded
    const newManifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
    if (newManifest.version !== targetVersion) {
      throw new Error('Verification failed after copying to dist/');
    }
  } catch (applyErr) {
    console.error('❌ Critical Error during application! Initiating automated recovery...', applyErr);
    if (fs.existsSync(backupPath)) {
      fs.rmSync(distDir, { recursive: true, force: true });
      fs.cpSync(backupPath, distDir, { recursive: true });
      console.log('🛡️  Automated recovery succeeded: Restored previous dist/ from backup.');
    }
    throw applyErr;
  }

  // Clean up staging directory
  fs.rmSync(stagingDir, { recursive: true, force: true });

  console.log('========================================================');
  console.log(`🎉 RELEASE v${targetVersion} APPLIED SUCCESSFULLY!`);
  console.log('========================================================');
  console.log('👉 STAGE 7 (Reload):');
  console.log('   1. Open Google Chrome or Brave to: chrome://extensions');
  console.log('   2. Find "swayam404 — SWAYAM Assignment Assistant"');
  console.log('   3. Click the Reload (↻) icon button.');
  console.log('');
  console.log('👉 STAGE 8 (Confirm):');
  console.log('   Open the extension popup/sidepanel -> Settings -> Click "Confirm Running Version".');
  console.log('========================================================');

  return {
    success: true,
    targetVersion,
    backupPath,
  };
}

// Direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('apply-local-update.mjs')) {
  (async () => {
    try {
      await applyUpdate();
    } catch (err) {
      console.error('\n❌ Apply operation failed:', err.message);
      console.error('To recover the last working version, run: npm run update:rollback');
      process.exit(1);
    }
  })();
}
