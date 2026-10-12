/**
 * Swayam404 Local-Only Installer & Updater Prototype Test Suite
 *
 * Covers Scenarios A through J:
 * - Scenario A: First local release generation and server metadata serving
 * - Scenario B: No update (equal version -> up-to-date)
 * - Scenario C: Update available -> download -> checksum verification -> reload guidance
 * - Scenario D: Corrupt download -> checksum mismatch -> rejection
 * - Scenario E: Server unavailable -> friendly error, no crash
 * - Scenario F: Invalid metadata schemas and path traversal safety
 * - Scenario G: Strict SemVer comparison (multi-digit, prereleases, older/newer)
 * - Scenario H: Preserves existing extension files and storage data
 * - Scenario I: Production build isolation (no leaked test artifacts)
 * - Scenario J: No accidental publication (local-only loopback verification)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  LocalUpdaterService,
  localUpdaterService,
  compareSemVer,
  isNewerVersion,
  parseSemVer,
  LocalReleaseMetadata,
  validateZipPackage,
} from '@/lib/updater';
import { StorageService } from '@/lib/storage';
// @ts-ignore
import { createUpdateServer } from '../../local-update-server/server.mjs';
// @ts-ignore
import { applyUpdate, rollbackToLastBackup } from '../../scripts/apply-local-update.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

describe('Local Extension Updater Prototype (Scenarios A through J)', () => {
  let testServer: http.Server | null = null;
  let testServerPort: number = 52405;
  let testServerUrl: string = `http://127.0.0.1:${testServerPort}`;
  let tempReleasesDir: string;

  beforeEach(async () => {
    await StorageService.clearAll();

    // Create isolated temporary directory for test releases
    tempReleasesDir = path.join(root, 'local-releases', `.test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    fs.mkdirSync(tempReleasesDir, { recursive: true });
  });

  afterEach(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
      testServer = null;
    }

    if (tempReleasesDir && fs.existsSync(tempReleasesDir)) {
      fs.rmSync(tempReleasesDir, { recursive: true, force: true });
    }
  });

  // Helper to build deterministic ZIP buffers for audit testing
  function createSyntheticZip(entries: { name: string; content?: string }[]): Buffer {
    const parts: Buffer[] = [];
    const cdHeaders: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const data = Buffer.from(entry.content || '');
      const nameBuf = Buffer.from(entry.name, 'utf8');

      // Local file header: 30 bytes + nameBuf.length + data.length
      const lfh = Buffer.alloc(30);
      lfh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
      lfh.writeUInt16LE(20, 4);
      lfh.writeUInt32LE(data.length, 18); // comp size
      lfh.writeUInt32LE(data.length, 22); // uncomp size
      lfh.writeUInt16LE(nameBuf.length, 26);
      parts.push(lfh, nameBuf, data);

      // Central directory header: 46 bytes + nameBuf.length
      const cdh = Buffer.alloc(46);
      cdh.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
      cdh.writeUInt16LE(20, 4);
      cdh.writeUInt16LE(20, 6);
      cdh.writeUInt32LE(data.length, 20); // comp size
      cdh.writeUInt32LE(data.length, 24); // uncomp size
      cdh.writeUInt16LE(nameBuf.length, 28);
      cdh.writeUInt32LE(offset, 42);
      cdHeaders.push(cdh, nameBuf);

      offset += 30 + nameBuf.length + data.length;
    }

    const cdOffset = offset;
    const cdSize = cdHeaders.reduce((acc, b) => acc + b.length, 0);

    // End of central directory record (EOCD): 22 bytes
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);

    return Buffer.concat([...parts, ...cdHeaders, eocd]);
  }

  function createValidExtensionZip(version: string = '1.1.0'): Buffer {
    return createSyntheticZip([
      {
        name: 'manifest.json',
        content: JSON.stringify({ manifest_version: 3, version, name: 'Swayam404' }),
      },
      { name: 'background.js', content: '// background worker' },
      { name: 'popup.html', content: '<!DOCTYPE html><html><head></head><body></body></html>' },
      { name: 'content.js', content: '// content script' },
    ]);
  }

  function startTestServer(releasesDir: string): Promise<string> {
    return new Promise((resolve) => {
      // Use dynamic port 0 to avoid port clashes
      const server = createUpdateServer({
        host: '127.0.0.1',
        releasesDir,
      });
      testServer = server;

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        testServerPort = addr.port;
        testServerUrl = `http://127.0.0.1:${testServerPort}`;
        resolve(testServerUrl);
      });
    });
  }

  // --- Scenario A: First local release ---
  it('Scenario A: Generates valid release metadata and serves via loopback server', async () => {
    const dummyZipPath = path.join(tempReleasesDir, 'swayam404-extension-v1.0.0.zip');
    const dummyContent = Buffer.from('PK\x03\x04dummy-zip-archive-v1.0.0');
    fs.writeFileSync(dummyZipPath, dummyContent);

    const sha256 = crypto.createHash('sha256').update(dummyContent).digest('hex');
    const metadata: LocalReleaseMetadata = {
      version: '1.0.0',
      packageFilename: 'swayam404-extension-v1.0.0.zip',
      fileSize: dummyContent.length,
      sha256,
      releasedAt: new Date().toISOString(),
      releaseNotes: 'Baseline local release v1.0.0',
      downloadUrl: '/releases/swayam404-extension-v1.0.0.zip',
    };

    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(metadata, null, 2));

    const serverUrl = await startTestServer(tempReleasesDir);

    // Verify /health endpoint
    const healthRes = await fetch(`${serverUrl}/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe('ok');
    expect(healthJson.loopbackOnly).toBe(true);

    // Verify /latest.json endpoint
    const latestRes = await fetch(`${serverUrl}/latest.json`);
    expect(latestRes.status).toBe(200);
    const latestJson = await latestRes.json();
    expect(latestJson.version).toBe('1.0.0');
    expect(latestJson.sha256).toBe(sha256);
  });

  // --- Scenario B: No update (Equal version) ---
  it('Scenario B: Correctly reports up-to-date when local release version equals installed version', async () => {
    const dummyZipPath = path.join(tempReleasesDir, 'swayam404-extension-v1.0.0.zip');
    fs.writeFileSync(dummyZipPath, Buffer.from('dummy-v1.0.0'));

    const metadata: LocalReleaseMetadata = {
      version: '1.0.0',
      packageFilename: 'swayam404-extension-v1.0.0.zip',
      fileSize: 12,
      sha256: crypto.createHash('sha256').update('dummy-v1.0.0').digest('hex'),
      releasedAt: new Date().toISOString(),
      releaseNotes: 'Current release',
      downloadUrl: '/releases/swayam404-extension-v1.0.0.zip',
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(metadata, null, 2));

    const serverUrl = await startTestServer(tempReleasesDir);

    const state = await localUpdaterService.checkForUpdates(serverUrl);
    expect(state.status).toBe('up-to-date');
    expect(state.installedVersion).toBe('1.0.0');
    expect(state.latestVersion).toBe('1.0.0');
  });

  // --- Scenario C: Update available, download, and checksum verification ---
  it('Scenario C: Detects higher version, downloads package, verifies checksum, and guides manual reload', async () => {
    const higherVersion = '1.1.0';
    const packageBuffer = createValidExtensionZip(higherVersion);
    const packageFilename = `swayam404-extension-v${higherVersion}.zip`;
    fs.writeFileSync(path.join(tempReleasesDir, packageFilename), packageBuffer);

    const expectedSha256 = crypto.createHash('sha256').update(packageBuffer).digest('hex');
    const metadata: LocalReleaseMetadata = {
      version: higherVersion,
      packageFilename,
      fileSize: packageBuffer.length,
      sha256: expectedSha256,
      releasedAt: new Date().toISOString(),
      releaseNotes: 'V1.1.0 with new features',
      downloadUrl: `/releases/${packageFilename}`,
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(metadata, null, 2));

    const serverUrl = await startTestServer(tempReleasesDir);

    // 1. Check for updates -> update-available
    const checkState = await localUpdaterService.checkForUpdates(serverUrl);
    expect(checkState.status).toBe('update-available');
    expect(checkState.latestVersion).toBe('1.1.0');
    expect(checkState.metadata).toBeDefined();

    // 2. Download and verify package
    const downloadRes = await localUpdaterService.downloadAndVerifyPackage(checkState.metadata!, serverUrl);
    expect(downloadRes.success).toBe(true);
    expect(downloadRes.state.status).toBe('download-verified');
    expect(downloadRes.state.verifiedChecksum).toBe(expectedSha256);
    expect(downloadRes.state.downloadedFilename).toBe(packageFilename);
    expect(downloadRes.blob).toBeDefined();

    // 3. Verify state persisted
    const storedState = await localUpdaterService.getState();
    expect(storedState.status).toBe('download-verified');
    expect(storedState.verifiedChecksum).toBe(expectedSha256);
  });

  // --- Scenario D: Corrupt download (Checksum mismatch) ---
  it('Scenario D: Rejects download when computed checksum does not match release metadata', async () => {
    const packageBuffer = Buffer.from('genuine-bytes-before-corruption');
    const corruptedBuffer = Buffer.from('corrupted-bytes-during-transit');
    const packageFilename = 'swayam404-extension-v1.2.0.zip';
    fs.writeFileSync(path.join(tempReleasesDir, packageFilename), corruptedBuffer);

    // Metadata contains SHA-256 of genuine bytes, but server delivers corruptedBuffer
    const genuineSha256 = crypto.createHash('sha256').update(packageBuffer).digest('hex');
    const metadata: LocalReleaseMetadata = {
      version: '1.2.0',
      packageFilename,
      fileSize: corruptedBuffer.length,
      sha256: genuineSha256, // mismatch!
      releasedAt: new Date().toISOString(),
      releaseNotes: 'Corrupt test release',
      downloadUrl: `/releases/${packageFilename}`,
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(metadata, null, 2));

    const serverUrl = await startTestServer(tempReleasesDir);

    const checkState = await localUpdaterService.checkForUpdates(serverUrl);
    expect(checkState.status).toBe('update-available');

    // Attempt download
    const downloadRes = await localUpdaterService.downloadAndVerifyPackage(checkState.metadata!, serverUrl);
    expect(downloadRes.success).toBe(false);
    expect(downloadRes.state.status).toBe('checksum-mismatch');
    expect(downloadRes.state.errorMessage).toContain('Checksum mismatch');

    // Verify stored state
    const stored = await localUpdaterService.getState();
    expect(stored.status).toBe('checksum-mismatch');
  });

  // --- Scenario E: Server unavailable ---
  it('Scenario E: Handles unreachable server gracefully without throwing or corrupting state', async () => {
    // Point to non-existent server port
    const offlineUrl = 'http://127.0.0.1:59998';

    const state = await localUpdaterService.checkForUpdates(offlineUrl);
    expect(state.status).toBe('server-unavailable');
    expect(state.errorMessage).toContain('Cannot reach local update server');

    // Extension remains operational
    const current = await localUpdaterService.getState();
    expect(current.status).toBe('server-unavailable');
  });

  // --- Scenario F: Invalid metadata schemas & security path traversal ---
  it('Scenario F: Rejects malformed JSON, missing fields, and path traversal filenames safely', async () => {
    const service = LocalUpdaterService.getInstance();

    // 1. Missing version
    const r1 = service.validateMetadata({ packageFilename: 'test.zip', fileSize: 100, sha256: 'a'.repeat(64), downloadUrl: '/test.zip' });
    expect(r1.valid).toBe(false);

    // 2. Non-SemVer version
    const r2 = service.validateMetadata({ version: 'invalid-ver', packageFilename: 'test.zip', fileSize: 100, sha256: 'a'.repeat(64), downloadUrl: '/test.zip' });
    expect(r2.valid).toBe(false);

    // 3. Path traversal in package filename
    const r3 = service.validateMetadata({ version: '1.1.0', packageFilename: '../../etc/passwd.zip', fileSize: 100, sha256: 'a'.repeat(64), downloadUrl: '/test.zip' });
    expect(r3.valid).toBe(false);
    expect(r3.error).toContain('Illegal or unsafe package filename');

    // 4. Non-zip package extension
    const r4 = service.validateMetadata({ version: '1.1.0', packageFilename: 'payload.exe', fileSize: 100, sha256: 'a'.repeat(64), downloadUrl: '/test.exe' });
    expect(r4.valid).toBe(false);

    // 5. Short SHA-256
    const r5 = service.validateMetadata({ version: '1.1.0', packageFilename: 'test.zip', fileSize: 100, sha256: 'too-short', downloadUrl: '/test.zip' });
    expect(r5.valid).toBe(false);
  });

  // --- Scenario G: Strict SemVer comparison ---
  it('Scenario G: Correctly handles multi-digit components, equal, older, and prerelease versions', () => {
    // Multi-digit components: 1.10.0 > 1.2.0
    expect(compareSemVer('1.10.0', '1.2.0')).toBe(1);
    expect(compareSemVer('1.2.0', '1.10.0')).toBe(-1);
    expect(isNewerVersion('1.10.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.10.0')).toBe(false);

    // Equal versions
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);

    // Patch differences
    expect(compareSemVer('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemVer('1.0.0', '1.0.1')).toBe(-1);

    // Major differences
    expect(compareSemVer('2.0.0', '1.9.9')).toBe(1);

    // Prerelease comparison: normal release > prerelease
    expect(compareSemVer('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(compareSemVer('1.0.0-beta.1', '1.0.0')).toBe(-1);

    // Parsing
    const parsed = parseSemVer('1.4.12-rc.2');
    expect(parsed).toEqual({
      major: 1,
      minor: 4,
      patch: 12,
      prerelease: 'rc.2',
      raw: '1.4.12-rc.2',
    });

    // Invalid SemVer strings
    expect(parseSemVer('invalid')).toBeNull();
    expect(() => compareSemVer('invalid', '1.0.0')).toThrow();
  });

  // --- Scenario H: Existing extension & data remains intact ---
  it('Scenario H: Update checks and downloads never overwrite stored user data or courses', async () => {
    // 1. Save user course and questions
    await StorageService.saveCourse({
      id: 'course-user-private',
      name: 'Custom User Course',
      code: 'USER-101',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    await StorageService.saveQuestion({
      id: 'q-user-private-1',
      courseId: 'course-user-private',
      questionText: 'What is elasticity of demand?',
      questionType: 'single-choice',
      reviewStatus: 'student-reviewed',
      source: 'User Manual Entry',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    // 2. Perform update check
    const higherVersion = '1.1.0';
    const validZip = createValidExtensionZip(higherVersion);
    const dummyZipPath = path.join(tempReleasesDir, `swayam404-extension-v${higherVersion}.zip`);
    fs.writeFileSync(dummyZipPath, validZip);
    const meta: LocalReleaseMetadata = {
      version: higherVersion,
      packageFilename: `swayam404-extension-v${higherVersion}.zip`,
      fileSize: validZip.length,
      sha256: crypto.createHash('sha256').update(validZip).digest('hex'),
      releasedAt: new Date().toISOString(),
      releaseNotes: 'Update',
      downloadUrl: `/releases/swayam404-extension-v${higherVersion}.zip`,
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(meta));
    const serverUrl = await startTestServer(tempReleasesDir);

    await localUpdaterService.checkForUpdates(serverUrl);
    await localUpdaterService.downloadAndVerifyPackage(meta, serverUrl);

    // 3. Assert user courses and questions are completely untouched
    const courses = await StorageService.getCourses();
    expect(courses.some((c) => c.id === 'course-user-private')).toBe(true);

    const questions = await StorageService.getQuestions();
    expect(questions.some((q) => q.id === 'q-user-private-1')).toBe(true);
  });

  // --- Scenario I: Production build isolation ---
  it('Scenario I: Asserts production build and gitignore exclude local releases and test artifacts', () => {
    const gitignorePath = path.join(root, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    // local-releases/*.zip must be ignored
    expect(gitignoreContent).toContain('local-releases/*.zip');

    // Manifest in public must have valid version matching package.json
    const manifestPath = path.join(root, 'public/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.version).toBe(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);

    // Production manifest must not contain remote code execution permissions
    expect(manifest.content_security_policy).toBeUndefined(); // MV3 defaults to strict script-src 'self'
    const permissions = manifest.permissions || [];
    expect(permissions).not.toContain('unsafe-eval');
  });

  // --- Scenario J: No accidental publication & loopback binding enforcement ---
  it('Scenario J: Local update server strictly enforces 127.0.0.1 and rejects non-loopback bindings', () => {
    // Attempting to bind server to public 0.0.0.0 or external IP must throw security violation
    expect(() => {
      createUpdateServer({ host: '0.0.0.0' });
    }).toThrow(/Security Violation: Local update server must strictly bind to loopback/);

    expect(() => {
      createUpdateServer({ host: '192.168.1.50' });
    }).toThrow(/Security Violation: Local update server must strictly bind to loopback/);
  });

  // --- Scenario K: Zip Slip & Path Traversal Pre-Extraction Validation ---
  it('Scenario K: Detects and rejects Zip Slip and directory traversal attacks in ZIP archives', () => {
    // 1. Path traversal with ..
    const zipWithTraversal = createSyntheticZip([
      { name: '../../etc/passwd', content: 'malicious' },
      { name: 'manifest.json', content: '{}' },
    ]);
    const res1 = validateZipPackage(zipWithTraversal);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes('Zip Slip attempt detected'))).toBe(true);

    // 2. Absolute path starting with /
    const zipWithAbsolute = createSyntheticZip([
      { name: '/usr/local/bin/evil', content: 'malicious' },
      { name: 'manifest.json', content: '{}' },
    ]);
    const res2 = validateZipPackage(zipWithAbsolute);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes('Illegal absolute entry path'))).toBe(true);
  });

  // --- Scenario L: Missing Required Bundle Assets in ZIP ---
  it('Scenario L: Rejects ZIP packages missing mandatory extension assets', () => {
    // Only contains manifest.json, missing background.js, popup.html, content.js
    const incompleteZip = createSyntheticZip([
      { name: 'manifest.json', content: '{"version":"1.0.0"}' },
    ]);
    const res = validateZipPackage(incompleteZip, { requireAssets: true });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Missing mandatory extension bundle asset: "background.js"'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Missing mandatory extension bundle asset: "popup.html"'))).toBe(true);
  });

  // --- Scenario M: Truncated or Wrong-Size Downloads ---
  it('Scenario M: Detects truncated downloads where payload size differs from metadata', async () => {
    const dummyZip = createSyntheticZip([
      { name: 'manifest.json', content: '{}' },
    ]);
    const filename = 'swayam404-extension-v1.1.0.zip';
    fs.writeFileSync(path.join(tempReleasesDir, filename), dummyZip);

    const metadata: LocalReleaseMetadata = {
      version: '1.1.0',
      packageFilename: filename,
      fileSize: 999999, // Intentional mismatch: metadata claims ~1MB, dummyZip is small
      sha256: crypto.createHash('sha256').update(dummyZip).digest('hex'),
      releasedAt: new Date().toISOString(),
      releaseNotes: 'Size mismatch test',
      downloadUrl: `/releases/${filename}`,
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'latest.json'), JSON.stringify(metadata));

    const serverUrl = await startTestServer(tempReleasesDir);

    const downloadRes = await localUpdaterService.downloadAndVerifyPackage(metadata, serverUrl);
    expect(downloadRes.success).toBe(false);
    expect(downloadRes.state.status).toBe('failed');
    expect(downloadRes.state.errorMessage).toContain('truncated or corrupted');
  });

  // --- Scenario N: Running Version Confirmation (Stage 8) ---
  it('Scenario N: Evaluates whether running extension matches release version and sets appropriate state', async () => {
    // 1. Initial state where installed version (1.0.0) is behind target (1.1.0)
    await StorageService.saveExtensionUpdaterState({
      status: 'reload-required',
      currentStage: 'reload',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
    });

    const check1 = await localUpdaterService.confirmRunningVersion();
    expect(check1.status).toBe('reload-required');
    expect(check1.errorMessage).toContain('Extension is still running v1.0.0');

    // 2. State where running extension matches target version (1.0.0 === 1.0.0)
    await StorageService.saveExtensionUpdaterState({
      status: 'reload-required',
      currentStage: 'reload',
      installedVersion: '1.0.0',
      latestVersion: '1.0.0',
    });

    const check2 = await localUpdaterService.confirmRunningVersion();
    expect(check2.status).toBe('confirmed');
    expect(check2.currentStage).toBe('confirm');
  });

  // --- Scenario O: Sanitized Local Server Error Responses ---
  it('Scenario O: Ensures server error responses never leak internal filesystem paths', async () => {
    const serverUrl = await startTestServer(tempReleasesDir);

    // 1. Request nonexistent path
    const res404 = await fetch(`${serverUrl}/nonexistent-route`);
    expect(res404.status).toBe(404);
    const body404 = await res404.json();
    expect(body404.error).toBeDefined();
    // Must not leak user home directory or path
    expect(JSON.stringify(body404)).not.toContain('/Users/');

    // 2. Attempt path traversal in /releases/
    const resTraversal = await fetch(`${serverUrl}/releases/..%2f..%2fetc%2fpasswd`);
    expect(resTraversal.status).toBe(400);
    const bodyTraversal = await resTraversal.json();
    expect(bodyTraversal.code).toBe('INVALID_FILENAME');
    expect(JSON.stringify(bodyTraversal)).not.toContain('/Users/');
  });

  // --- Scenario P: Apply local update with staging and backup creation ---
  it('Scenario P: Applies local update package to dist, creates restorable backup, and validates new version', async () => {
    const isolatedDist = path.join(tempReleasesDir, 'mock-dist');
    const isolatedStaging = path.join(tempReleasesDir, 'mock-staging');
    const isolatedBackups = path.join(tempReleasesDir, 'mock-backups');
    fs.mkdirSync(isolatedDist, { recursive: true });

    // Seed original mock-dist with v1.0.0
    fs.writeFileSync(
      path.join(isolatedDist, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, version: '1.0.0', name: 'Swayam404' })
    );

    // Create v1.2.0 release in tempReleasesDir using real zip packaging
    const v120Dir = path.join(tempReleasesDir, 'source-v1.2.0');
    fs.mkdirSync(v120Dir, { recursive: true });
    fs.writeFileSync(
      path.join(v120Dir, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, version: '1.2.0', name: 'Swayam404' })
    );
    fs.writeFileSync(path.join(v120Dir, 'background.js'), '// bg');
    fs.writeFileSync(path.join(v120Dir, 'popup.html'), '<!DOCTYPE html><html><body></body></html>');
    fs.writeFileSync(path.join(v120Dir, 'content.js'), '// content');

    const zipFilename = 'swayam404-extension-v1.2.0.zip';
    const zipPath = path.join(tempReleasesDir, zipFilename);
    const { execFileSync } = await import('node:child_process');
    execFileSync('/usr/bin/zip', ['-q', '-r', zipPath, '.'], { cwd: v120Dir });

    const packageBuffer = fs.readFileSync(zipPath);
    const meta: LocalReleaseMetadata = {
      version: '1.2.0',
      packageFilename: zipFilename,
      fileSize: packageBuffer.length,
      sha256: crypto.createHash('sha256').update(packageBuffer).digest('hex'),
      releasedAt: new Date().toISOString(),
      releaseNotes: 'V1.2.0 apply test',
      downloadUrl: `/releases/${zipFilename}`,
    };
    fs.writeFileSync(path.join(tempReleasesDir, 'v1.2.0.json'), JSON.stringify(meta));

    const applyResult = await applyUpdate({
      version: '1.2.0',
      releasesDir: tempReleasesDir,
      stagingRoot: isolatedStaging,
      backupsDir: isolatedBackups,
      distDir: isolatedDist,
    });

    expect(applyResult.success).toBe(true);
    expect(applyResult.targetVersion).toBe('1.2.0');

    // Verify mock-dist was upgraded to 1.2.0
    const upgradedManifest = JSON.parse(fs.readFileSync(path.join(isolatedDist, 'manifest.json'), 'utf8'));
    expect(upgradedManifest.version).toBe('1.2.0');

    // Verify backup was created for v1.0.0
    const lastBackupPath = path.join(isolatedBackups, 'last-backup.json');
    expect(fs.existsSync(lastBackupPath)).toBe(true);
    const lastBackupMeta = JSON.parse(fs.readFileSync(lastBackupPath, 'utf8'));
    expect(lastBackupMeta.installedVersion).toBe('1.0.0');
    expect(lastBackupMeta.targetVersion).toBe('1.2.0');
  });

  // --- Scenario Q: Rollback restored previous version from backup ---
  it('Scenario Q: Safely rolls back to previous installation when rollback is invoked', async () => {
    const isolatedDist = path.join(tempReleasesDir, 'mock-dist');
    const isolatedBackups = path.join(tempReleasesDir, 'mock-backups');
    const backupDir = path.join(isolatedBackups, 'backup-v1.0.0-snapshot');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(isolatedDist, { recursive: true });

    // Currently dist is at 1.2.0
    fs.writeFileSync(
      path.join(isolatedDist, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, version: '1.2.0' })
    );

    // Backup is at 1.0.0
    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, version: '1.0.0' })
    );

    fs.writeFileSync(
      path.join(isolatedBackups, 'last-backup.json'),
      JSON.stringify({
        installedVersion: '1.0.0',
        targetVersion: '1.2.0',
        backupPath: backupDir,
        timestamp: new Date().toISOString(),
      })
    );

    const rollbackResult = rollbackToLastBackup({
      backupsDir: isolatedBackups,
      distDir: isolatedDist,
    });

    expect(rollbackResult.installedVersion).toBe('1.0.0');

    // Verify mock-dist restored to 1.0.0
    const restoredManifest = JSON.parse(fs.readFileSync(path.join(isolatedDist, 'manifest.json'), 'utf8'));
    expect(restoredManifest.version).toBe('1.0.0');
  });
});

