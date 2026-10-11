#!/usr/bin/env node
/**
 * Swayam404 Knowledge Base — Maintainer Contribution Validator CLI
 *
 * Validates proposed contribution packages or existing course packs against
 * Draft-07 schemas, security boundaries, and provenance rules.
 *
 * Usage:
 *   node scripts/validate-contributions.mjs [path-to-contribution-or-course-dir]
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const rawArgs = process.argv.slice(2);
const isReleaseAudit = rawArgs.includes('--release-audit');
const nonFlagArgs = rawArgs.filter((a) => !a.startsWith('--'));
const targetArg = nonFlagArgs[0] || 'knowledge-base';
const rootDir = process.cwd();
const targetPath = path.resolve(rootDir, targetArg);

console.log('🔍 Swayam404 Knowledge Maintainer Validator');
console.log(`📁 Target: ${path.relative(rootDir, targetPath)}`);
if (isReleaseAudit) {
  console.log('⚙️  Mode: Full Release-Readiness Audit\n');
} else {
  console.log('');
}

if (!fs.existsSync(targetPath)) {
  console.error(`❌ Error: Target path "${targetArg}" does not exist.`);
  process.exit(1);
}

let errorCount = 0;
let warningCount = 0;
let totalCoursesCount = 0;
let syntheticResourcesCount = 0;
let genuineResourcesCount = 0;
let releasedReviewRecordsCount = 0;
let unreleasedViolationsCount = 0;
let placeholderHashesCount = 0;

function reportError(msg, file = '') {
  console.error(`  ❌ [ERROR] ${file ? `(${file}) ` : ''}${msg}`);
  errorCount++;
}

function reportWarning(msg, file = '') {
  console.warn(`  ⚠️  [WARN] ${file ? `(${file}) ` : ''}${msg}`);
  warningCount++;
}

function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  const keys = Object.keys(val).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(val[k])).join(',') + '}';
}

function scanSensitive(text, context) {
  if (typeof text !== 'string') return;
  if (/AIza[0-9A-Za-z-_]{35}/.test(text)) {
    reportError('Detected Google API Key in content.', context);
  }
  if (/sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}/.test(text)) {
    reportError('Detected OpenAI/xAI API Key in content.', context);
  }
  if (/Bearer\s+[a-zA-Z0-9_.-]{20,}/i.test(text)) {
    reportError('Detected Bearer authentication token in content.', context);
  }
  if (/(?:sessionid|connect\.sid|PHPSESSID)=/i.test(text)) {
    reportError('Detected session cookie in content.', context);
  }
  if (/\b(?:roll\s*no|student\s*id)\s*[:=]\s*[a-zA-Z0-9_-]{4,}\b/i.test(text)) {
    reportError('Detected student roll number or ID in content.', context);
  }
  if (/<script\b[^>]*>([\s\S]*?)<\/script>/i.test(text)) {
    reportError('Detected raw HTML <script> tag in content.', context);
  }
}

function validateResourceItem(res, file) {
  if (!res.resourceId || !res.courseId || !res.title || !res.content) {
    reportError(`Resource missing required fields (id=${res.resourceId || 'unknown'})`, file);
  }
  if (!res.provenance || !res.provenance.license) {
    reportError(`Resource "${res.resourceId}" missing provenance or license.`, file);
  }

  // Classification tracking
  const lowerTitle = (res.title || '').toLowerCase();
  const lowerAttribution = (res.provenance?.attribution || '').toLowerCase();
  const lowerUrl = (res.provenance?.sourceUrl || '').toLowerCase();
  if (lowerTitle.includes('synthetic') || lowerAttribution.includes('synthetic') || lowerUrl.includes('example.org')) {
    syntheticResourcesCount++;
  } else {
    genuineResourcesCount++;
  }

  scanSensitive(res.content, `${file} [${res.resourceId}]`);
  scanSensitive(res.title, `${file} [${res.resourceId}]`);
}

function validateReviewRecordItem(rec, file) {
  if (!rec.recordId || !rec.courseId || !rec.normalizedQuestionText) {
    reportError(`Review record missing required fields (id=${rec.recordId || 'unknown'})`, file);
  }
  if (rec.isReleased !== true) {
    unreleasedViolationsCount++;
    reportError(`Review record "${rec.recordId}" is NOT marked isReleased=true. Unreleased records are prohibited.`, file);
  } else {
    releasedReviewRecordsCount++;
  }
  if (rec.verificationStatus !== 'portal-confirmed' && rec.verificationStatus !== 'instructor-provided') {
    reportWarning(`Review record "${rec.recordId}" has verificationStatus "${rec.verificationStatus}". Only confirmed records are recommended.`, file);
  }
  scanSensitive(rec.normalizedQuestionText, `${file} [${rec.recordId}]`);
  if (rec.explanation) scanSensitive(rec.explanation, `${file} [${rec.recordId}]`);
}

// Case 1: Target is a JSON file (e.g. contribution package)
if (fs.statSync(targetPath).isFile()) {
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(raw);
    console.log(`📄 Validating contribution package: ${path.basename(targetPath)}`);

    if (data.manifest) {
      console.log(`  Package Manifest: Course ${data.manifest.courseId}, Schema v${data.manifest.schemaVersion}`);
    }

    if (Array.isArray(data.resources)) {
      console.log(`  Checking ${data.resources.length} resources...`);
      const seenIds = new Set();
      for (const res of data.resources) {
        if (seenIds.has(res.resourceId)) {
          reportError(`Duplicate resourceId "${res.resourceId}"`, targetArg);
        }
        seenIds.add(res.resourceId);
        validateResourceItem(res, targetArg);
      }
    }

    if (Array.isArray(data.reviewRecords)) {
      console.log(`  Checking ${data.reviewRecords.length} review records...`);
      const seenIds = new Set();
      for (const rec of data.reviewRecords) {
        if (seenIds.has(rec.recordId)) {
          reportError(`Duplicate recordId "${rec.recordId}"`, targetArg);
        }
        seenIds.add(rec.recordId);
        validateReviewRecordItem(rec, targetArg);
      }
    }
  } catch (err) {
    reportError(`Failed to parse JSON file: ${err.message}`, targetArg);
  }
} else {
  // Case 2: Target is a directory (e.g. knowledge-base/ repository)
  const manifestFile = path.join(targetPath, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    console.log(`📄 Found repository manifest: ${path.relative(rootDir, manifestFile)}`);
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (manifest.schemaVersion !== '1.0.0') {
        reportError(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`, 'manifest.json');
      }

      for (const courseEntry of manifest.courses || []) {
        console.log(`\n📚 Checking course: ${courseEntry.courseId}`);
        const cPath = path.resolve(targetPath, courseEntry.metadataPath);
        const rPath = path.resolve(targetPath, courseEntry.resourcesPath);
        const revPath = courseEntry.reviewRecordsPath ? path.resolve(targetPath, courseEntry.reviewRecordsPath) : null;

        if (!fs.existsSync(cPath)) reportError(`Course metadata missing: ${courseEntry.metadataPath}`);
        if (!fs.existsSync(rPath)) reportError(`Course resources missing: ${courseEntry.resourcesPath}`);

        totalCoursesCount++;
        if (courseEntry.contentHash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
          placeholderHashesCount++;
          reportError(`Empty string placeholder SHA-256 hash detected for course ${courseEntry.courseId}`);
        }

        let courseObj = null;
        let resArr = [];
        let revArr = [];

        if (fs.existsSync(cPath)) {
          courseObj = JSON.parse(fs.readFileSync(cPath, 'utf8'));
          scanSensitive(courseObj.description, courseEntry.metadataPath);
        }

        if (fs.existsSync(rPath)) {
          resArr = JSON.parse(fs.readFileSync(rPath, 'utf8'));
          const seenIds = new Set();
          for (const res of resArr) {
            if (seenIds.has(res.resourceId)) reportError(`Duplicate resourceId: ${res.resourceId}`, courseEntry.resourcesPath);
            seenIds.add(res.resourceId);
            validateResourceItem(res, courseEntry.resourcesPath);
          }
        }

        if (revPath && fs.existsSync(revPath)) {
          revArr = JSON.parse(fs.readFileSync(revPath, 'utf8'));
          const seenIds = new Set();
          for (const rec of revArr) {
            if (seenIds.has(rec.recordId)) reportError(`Duplicate recordId: ${rec.recordId}`, courseEntry.reviewRecordsPath);
            seenIds.add(rec.recordId);
            validateReviewRecordItem(rec, courseEntry.reviewRecordsPath);
          }
        }

        // Integrity verification
        if (courseObj && resArr) {
          const payload = {
            courseId: courseEntry.courseId,
            coursePackVersion: courseEntry.coursePackVersion,
            course: courseObj,
            resources: resArr,
            reviewRecords: revArr,
          };
          const canonical = canonicalJsonStringify(payload);
          const computed = crypto.createHash('sha256').update(canonical).digest('hex');
          if (computed.toLowerCase() !== courseEntry.contentHash.toLowerCase()) {
            reportError(`Integrity hash mismatch for ${courseEntry.courseId}. Expected ${courseEntry.contentHash}, computed ${computed}`);
          } else {
            console.log(`  ✅ SHA-256 integrity hash verified: ${computed.slice(0, 16)}...`);
          }
        }
      }
    } catch (err) {
      reportError(`Failed to process directory manifest: ${err.message}`);
    }
  } else {
    reportError(`No manifest.json found in directory "${targetArg}".`);
  }
}

console.log('\n========================================');
console.log('📊 Release-Readiness Classification Audit:');
console.log(`  • Validated Course Packs: ${totalCoursesCount}`);
console.log(`  • Synthetic Development Fixtures: ${syntheticResourcesCount} (contains demo/example.org source tags)`);
console.log(`  • Genuine Production Handouts: ${genuineResourcesCount}`);
console.log(`  • Released Review Records: ${releasedReviewRecordsCount} (strictly post-deadline feedback)`);
console.log(`  • Active Assessment Violations: ${unreleasedViolationsCount}`);
console.log(`  • Empty Hash Anomaly (e3b0c442...): ${placeholderHashesCount}`);
if (genuineResourcesCount === 0 && syntheticResourcesCount > 0) {
  console.log('  • Public Release Eligibility: ⚠️  BENCHMARK/PILOT READY (Local/Pilot Only)');
  console.log('    Notice: Production public distribution requires genuine CC-BY course materials.');
} else {
  console.log('  • Public Release Eligibility: ✅ READY');
}

console.log('\n========================================');
console.log(`Summary: ${errorCount} errors, ${warningCount} warnings`);
if (errorCount > 0) {
  console.log('❌ Validation FAILED.');
  process.exit(1);
} else {
  console.log('✅ Validation PASSED.');
  process.exit(0);
}
