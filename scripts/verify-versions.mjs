#!/usr/bin/env node
/**
 * Swayam404 Version Consistency Verifier
 *
 * Enforces one consistent SemVer application versioning policy across:
 * - package.json
 * - public/manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function verifyVersions() {
  console.log('🔍 Swayam404 Version Consistency Audit');

  const pkgPath = path.join(root, 'package.json');
  const manifestPath = path.join(root, 'public', 'manifest.json');

  if (!fs.existsSync(pkgPath)) {
    console.error('❌ package.json not found at:', pkgPath);
    process.exit(1);
  }

  if (!fs.existsSync(manifestPath)) {
    console.error('❌ public/manifest.json not found at:', manifestPath);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const pkgVersion = pkg.version;
  const manifestVersion = manifest.version;

  console.log(`  • package.json version:    ${pkgVersion}`);
  console.log(`  • manifest.json version:   ${manifestVersion}`);

  if (!SEMVER_REGEX.test(pkgVersion)) {
    console.error(`❌ package.json version '${pkgVersion}' is not valid SemVer!`);
    process.exit(1);
  }

  if (!SEMVER_REGEX.test(manifestVersion)) {
    console.error(`❌ manifest.json version '${manifestVersion}' is not valid SemVer!`);
    process.exit(1);
  }

  if (pkgVersion !== manifestVersion) {
    console.error(`❌ Version mismatch detected! package.json (${pkgVersion}) !== manifest.json (${manifestVersion})`);
    process.exit(1);
  }

  console.log(`✅ Version policy verified! Unified application release version: v${pkgVersion}`);
}

verifyVersions();
