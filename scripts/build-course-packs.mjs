#!/usr/bin/env node
/**
 * Swayam404 Knowledge Base — Maintainer Course Pack Builder & Validator CLI
 *
 * Compiles, validates, and hashes course packs into manifest.json and courses/index.json.
 *
 * Usage:
 *   node scripts/build-course-packs.mjs [path-to-knowledge-base] [--check-only]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const args = process.argv.slice(2);
const isCheckOnly = args.includes('--check-only');
const nonFlagArgs = args.filter((a) => !a.startsWith('--'));

const targetArg = nonFlagArgs[0] || 'knowledge-base';
const rootDir = process.cwd();
const kbDir = path.resolve(rootDir, targetArg);

console.log('📦 Swayam404 Production Course Pack Builder');
console.log(`📁 Knowledge Base: ${path.relative(rootDir, kbDir)}`);
console.log(`⚙️  Mode: ${isCheckOnly ? 'Validation Check Only' : 'Build & Update Hashes'}\n`);

if (!fs.existsSync(kbDir)) {
  console.error(`❌ Error: Knowledge base directory "${targetArg}" does not exist.`);
  process.exit(1);
}

const coursesDir = path.join(kbDir, 'courses');
if (!fs.existsSync(coursesDir)) {
  console.error(`❌ Error: Courses directory "${coursesDir}" does not exist.`);
  process.exit(1);
}

function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  const keys = Object.keys(val).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(val[k])).join(',') + '}';
}

function computeSha256(data) {
  const canonical = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

let errorCount = 0;
let warningCount = 0;
const changedFiles = [];

function reportError(msg) {
  console.error(`  ❌ [ERROR] ${msg}`);
  errorCount++;
}

function reportWarning(msg) {
  console.warn(`  ⚠️  [WARN] ${msg}`);
  warningCount++;
}

// 1. Read existing manifest if present
const manifestPath = path.join(kbDir, 'manifest.json');
let existingManifest = null;
if (fs.existsSync(manifestPath)) {
  try {
    existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    reportWarning(`Failed to parse existing manifest.json: ${err.message}`);
  }
}

// 2. Discover course directories
const courseSubdirs = fs
  .readdirSync(coursesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(`🔍 Discovered ${courseSubdirs.length} course pack directory(s): ${courseSubdirs.join(', ')}\n`);

const builtCourseEntries = [];
const builtCatalogEntries = [];

for (const courseDirName of courseSubdirs) {
  const dirPath = path.join(coursesDir, courseDirName);
  const courseFile = path.join(dirPath, 'course.json');
  const resourcesFile = path.join(dirPath, 'resources.json');
  const reviewRecordsFile = path.join(dirPath, 'review-records.json');

  if (!fs.existsSync(courseFile)) {
    reportError(`Missing course.json in "${courseDirName}"`);
    continue;
  }
  if (!fs.existsSync(resourcesFile)) {
    reportError(`Missing resources.json in "${courseDirName}"`);
    continue;
  }

  let courseData;
  let resourcesData;
  let reviewRecordsData = [];

  try {
    courseData = JSON.parse(fs.readFileSync(courseFile, 'utf8'));
  } catch (err) {
    reportError(`Invalid JSON in ${courseFile}: ${err.message}`);
    continue;
  }

  try {
    resourcesData = JSON.parse(fs.readFileSync(resourcesFile, 'utf8'));
  } catch (err) {
    reportError(`Invalid JSON in ${resourcesFile}: ${err.message}`);
    continue;
  }

  if (fs.existsSync(reviewRecordsFile)) {
    try {
      reviewRecordsData = JSON.parse(fs.readFileSync(reviewRecordsFile, 'utf8'));
    } catch (err) {
      reportError(`Invalid JSON in ${reviewRecordsFile}: ${err.message}`);
      continue;
    }
  }

  const courseId = courseData.courseId || courseDirName;
  const version = courseData.coursePackVersion || '1.0.0';

  // Pack hash calculation: payload matches client and validator expectations
  const packPayload = {
    courseId,
    coursePackVersion: version,
    course: courseData,
    resources: resourcesData,
    reviewRecords: reviewRecordsData,
  };

  const computedHash = computeSha256(packPayload);

  // Check against prior manifest hash if available
  const priorEntry = existingManifest?.courses?.find((c) => c.courseId === courseId);
  if (priorEntry && priorEntry.contentHash !== computedHash) {
    changedFiles.push(`courses/${courseDirName}/resources.json`);
  }

  // Validate redistribution permissions
  for (const r of resourcesData) {
    if (r.provenance && r.provenance.license?.toLowerCase() === 'restricted') {
      reportError(`Resource "${r.resourceId}" in course "${courseId}" has restricted license; prohibited in public pack.`);
    }
  }

  for (const rec of reviewRecordsData) {
    if (!rec.isReleased) {
      reportError(`Review record "${rec.recordId}" in course "${courseId}" is not marked isReleased=true.`);
    }
  }

  console.log(`  ✓ ${courseId} (v${version}): ${resourcesData.length} resources, ${reviewRecordsData.length} review records | hash: ${computedHash.slice(0, 16)}...`);

  const metadataRelPath = `courses/${courseDirName}/course.json`;
  const resourcesRelPath = `courses/${courseDirName}/resources.json`;
  const reviewRecordsRelPath = reviewRecordsData.length > 0 ? `courses/${courseDirName}/review-records.json` : undefined;

  builtCourseEntries.push({
    courseId,
    courseTitle: courseData.courseTitle || courseId,
    provider: courseData.provider || 'SWAYAM',
    institution: courseData.institution || 'National Portal',
    language: courseData.language || 'en',
    coursePackVersion: version,
    lastUpdated: courseData.updatedAt || new Date().toISOString(),
    metadataPath: metadataRelPath,
    resourcesPath: resourcesRelPath,
    reviewRecordsPath: reviewRecordsRelPath,
    contentHash: computedHash,
    resourceCount: resourcesData.length,
    reviewRecordCount: reviewRecordsData.length,
  });

  builtCatalogEntries.push({
    courseId,
    courseTitle: courseData.courseTitle || courseId,
    coursePackVersion: version,
    resourceCount: resourcesData.length,
    reviewRecordCount: reviewRecordsData.length,
    lastUpdated: courseData.updatedAt || new Date().toISOString(),
    contentHash: computedHash,
  });
}

// 3. Assemble root manifest
const newManifest = {
  schemaVersion: '1.0.0',
  datasetVersion: existingManifest?.datasetVersion || '1.0.0',
  name: existingManifest?.name || 'swayam404-knowledge',
  description: existingManifest?.description || 'Shared open learning knowledge base and synthetic benchmark packs for Swayam404.',
  publishedAt: existingManifest?.publishedAt || new Date().toISOString(),
  minExtensionVersion: existingManifest?.minExtensionVersion || '1.0.0',
  courses: builtCourseEntries,
};

// 4. Check or Write outputs
const catalogPath = path.join(coursesDir, 'index.json');

if (isCheckOnly) {
  if (existingManifest) {
    const existingStr = canonicalJsonStringify(existingManifest);
    const newStr = canonicalJsonStringify(newManifest);
    if (existingStr !== newStr) {
      reportError('manifest.json does not match calculated course pack hashes.');
    }
  } else {
    reportError('manifest.json is missing.');
  }

  if (fs.existsSync(catalogPath)) {
    try {
      const existingCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      if (canonicalJsonStringify(existingCatalog) !== canonicalJsonStringify(builtCatalogEntries)) {
        reportError('courses/index.json does not match calculated catalog.');
      }
    } catch {
      reportError('Failed to read courses/index.json');
    }
  } else {
    reportError('courses/index.json is missing.');
  }

  console.log('\n--- Validation Results ---');
  console.log(`Errors: ${errorCount}, Warnings: ${warningCount}`);
  if (errorCount > 0) {
    process.exit(1);
  } else {
    console.log('✅ All course packs and manifests are valid and in sync.');
    process.exit(0);
  }
} else {
  // Write updated manifest.json and courses/index.json
  fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(catalogPath, JSON.stringify(builtCatalogEntries, null, 2) + '\n', 'utf8');

  console.log('\n--- Build Results ---');
  console.log(`✅ Updated: ${path.relative(rootDir, manifestPath)}`);
  console.log(`✅ Updated: ${path.relative(rootDir, catalogPath)}`);
  if (changedFiles.length > 0) {
    console.log(`📝 Changed packs: ${changedFiles.join(', ')}`);
  }
  console.log(`Errors: ${errorCount}, Warnings: ${warningCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}
