#!/usr/bin/env node
/**
 * Swayam404 Local Release Generator
 *
 * Builds and packages a local development release artifact with SHA-256 integrity metadata.
 * Stores output in local-releases/ with a canonical latest.json manifest.
 *
 * Usage:
 *   node scripts/generate-local-release.mjs
 *   node scripts/generate-local-release.mjs --version 1.1.0 --notes "Enhanced question matching"
 *   node scripts/generate-local-release.mjs --version 1.1.0 --corrupt
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    version: null,
    notes: 'Development test release for Swayam404 local updater.',
    corrupt: false,
    skipBuild: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      options.version = args[i + 1].trim();
      i++;
    } else if (args[i] === '--notes' && args[i + 1]) {
      options.notes = args[i + 1].trim();
      i++;
    } else if (args[i] === '--corrupt') {
      options.corrupt = true;
    } else if (args[i] === '--skip-build') {
      options.skipBuild = true;
    }
  }

  return options;
}

export function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export async function generateRelease(options = {}) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const targetVersion = options.version || pkg.version;
  const releaseNotes = options.notes || `Swayam404 v${targetVersion} local release`;
  const isCorrupt = Boolean(options.corrupt);

  console.log(`🔨 Preparing local release v${targetVersion}...`);

  const distDir = path.join(root, 'dist');
  if (!options.skipBuild || !fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.log('📦 Running extension build (tsc & vite)...');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }

  const outputDir = path.join(root, 'local-releases');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create temporary staging directory to pack release without altering source tree
  const stagingDir = path.join(outputDir, `.staging-v${targetVersion}-${Date.now()}`);
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy dist files to staging safely using native Node fs.cpSync
  fs.cpSync(distDir, stagingDir, { recursive: true });

  // If a different target version was specified, update manifest.json in the staging package
  const stagingManifestPath = path.join(stagingDir, 'manifest.json');
  if (fs.existsSync(stagingManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(stagingManifestPath, 'utf8'));
    manifest.version = targetVersion;
    fs.writeFileSync(stagingManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  const zipFilename = `swayam404-extension-v${targetVersion}.zip`;
  const zipPath = path.join(outputDir, zipFilename);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`🗜️  Compressing staging directory into ${zipFilename}...`);
  // Use execFileSync without shell interpolation to avoid command injection
  const { execFileSync } = await import('node:child_process');
  execFileSync('/usr/bin/zip', ['-r', zipPath, '.', '-x', '*.DS_Store'], {
    cwd: stagingDir,
    stdio: 'pipe',
  });

  // Clean up staging directory
  fs.rmSync(stagingDir, { recursive: true, force: true });

  // Pre-release validation of the generated ZIP package
  const { validateZipPackage } = await import('./zipValidator.mjs');
  const zipValidation = validateZipPackage(fs.readFileSync(zipPath), {
    requireAssets: true,
    expectedVersion: targetVersion,
  });

  if (!zipValidation.valid) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    throw new Error(`Package validation failed: ${zipValidation.errors.join('; ')}`);
  }

  const stat = fs.statSync(zipPath);
  let sha256 = computeSha256(zipPath);

  if (isCorrupt) {
    console.log('⚠️  --corrupt flag specified: Generating mismatched checksum to test error handling.');
    // Mismatch the checksum by altering the first 8 characters
    sha256 = '00000000' + sha256.substring(8);
  }

  const metadata = {
    version: targetVersion,
    packageFilename: zipFilename,
    fileSize: stat.size,
    sha256: sha256,
    releasedAt: new Date().toISOString(),
    releaseNotes: releaseNotes,
    downloadUrl: `/releases/${zipFilename}`,
    minBrowserVersion: '116.0',
    isCorruptFixture: isCorrupt,
  };

  const latestJsonPath = path.join(outputDir, 'latest.json');
  fs.writeFileSync(latestJsonPath, JSON.stringify(metadata, null, 2), 'utf8');

  // Also write version-specific manifest
  const versionJsonPath = path.join(outputDir, `v${targetVersion}.json`);
  fs.writeFileSync(versionJsonPath, JSON.stringify(metadata, null, 2), 'utf8');

  console.log('✅ Local release generated successfully:');
  console.log(`   • Version:         v${targetVersion}`);
  console.log(`   • Package:         ${zipFilename} (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log(`   • SHA-256:         ${sha256}`);
  console.log(`   • Metadata:        ${latestJsonPath}`);

  return metadata;
}

// Direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('generate-local-release.mjs')) {
  (async () => {
    try {
      const opts = parseArgs();
      await generateRelease(opts);
    } catch (err) {
      console.error('❌ Failed to generate local release:', err);
      process.exit(1);
    }
  })();
}
