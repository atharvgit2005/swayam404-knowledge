/**
 * Swayam404 GitHub Release Live Sync & Packaging Test Suite
 *
 * Verifies:
 * - SemVer comparison (isNewerVersion)
 * - GitHub release structure parsing (tag, notes, assets, sha256)
 * - Repository security validation (rejection of malicious/invalid repo paths)
 * - Checksum mismatch rejection
 * - Server endpoints:
 *   • GET /api/github/check
 *   • POST /api/github/download-and-apply
 * - Standalone installer packaging (macOS & Windows ZIP bundles in dist-installer/)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// @ts-ignore
import { isNewerVersion, checkGitHubRelease, downloadAndApplyFromGitHub, createInstallerAppServer } from '../../installer-app/server.mjs';

// @ts-ignore
import { bundleInstallerPackages } from '../../scripts/bundle-installer.mjs';

describe('Swayam404 GitHub Releases Live Sync & Packaging', () => {
  let appServer: http.Server | null = null;
  let serverPort: number;
  let serverUrl: string;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const server = createInstallerAppServer();
      appServer = server;
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (appServer) {
      await new Promise<void>((resolve) => appServer!.close(() => resolve()));
      appServer = null;
    }
  });

  it('1. isNewerVersion correctly compares release versions', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('2. checkGitHubRelease rejects malformed repository strings', async () => {
    await expect(checkGitHubRelease('../../etc/passwd')).rejects.toThrow(/Invalid GitHub repository format/);
    await expect(checkGitHubRelease('owner/repo/extra')).rejects.toThrow(/Invalid GitHub repository format/);
    await expect(checkGitHubRelease('invalid name')).rejects.toThrow(/Invalid GitHub repository format/);
  });

  it('3. checkGitHubRelease parses release tags, notes, and asset details', async () => {
    const mockRelease = {
      tag_name: 'v1.1.0',
      name: 'Swayam404 v1.1.0 Release',
      body: 'Changelog: Added multi-course bank support.\nSHA256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      published_at: '2026-10-12T00:00:00Z',
      assets: [
        {
          name: 'swayam404-extension-v1.1.0.zip',
          browser_download_url: 'https://github.com/test/download.zip',
          size: 154200,
        },
      ],
    };

    const result = await checkGitHubRelease('atharvpaharia100/swayam404', { mockRelease });
    expect(result.repo).toBe('atharvpaharia100/swayam404');
    expect(result.latestVersion).toBe('1.1.0');
    expect(result.tag).toBe('v1.1.0');
    expect(result.releaseName).toBe('Swayam404 v1.1.0 Release');
    expect(result.zipAsset?.name).toBe('swayam404-extension-v1.1.0.zip');
    expect(result.zipAsset?.size).toBe(154200);
    expect(result.expectedSha256).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  });

  it('4. downloadAndApplyFromGitHub rejects packages with checksum mismatch', async () => {
    const mockRelease = {
      tag_name: 'v1.1.0',
      assets: [{ name: 'swayam404-v1.1.0.zip', browser_download_url: 'mock://url', size: 100 }],
    };

    // Buffer with arbitrary content
    const mockBuffer = Buffer.from('corrupt content');
    const wrongSha = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    await expect(
      downloadAndApplyFromGitHub({
        mockRelease,
        mockZipBuffer: mockBuffer,
        sha256: wrongSha,
      })
    ).rejects.toThrow(/Security Violation: Checksum mismatch!/);
  });

  it('5. GET /api/github/check endpoint responds with valid JSON', async () => {
    const res = await fetch(`${serverUrl}/api/github/check?repo=atharvpaharia100/swayam404`);
    // Should respond with 200 or an error JSON (if rate limited by GitHub)
    expect([200, 500]).toContain(res.status);
    const data = await res.json();
    expect(typeof data).toBe('object');
  });

  it('6. bundleInstallerPackages creates standalone macOS, Windows packages and DMG', () => {
    const result = bundleInstallerPackages();
    expect(fs.existsSync(result.macZip)).toBe(true);
    expect(fs.existsSync(result.winZip)).toBe(true);
    if (process.platform === 'darwin' && result.macDmg) {
      expect(fs.existsSync(result.macDmg)).toBe(true);
      expect(result.macDmgSize).toBeGreaterThan(1000);
    }
    expect(result.macSize).toBeGreaterThan(1000);
    expect(result.winSize).toBeGreaterThan(1000);

    // Verify uncompressed directories
    const macDir = path.join(result.outDir, 'mac');
    const winDir = path.join(result.outDir, 'windows');
    expect(fs.existsSync(path.join(macDir, 'README.txt'))).toBe(true);
    expect(fs.existsSync(path.join(macDir, 'Swayam404 Installer.app', 'Contents', 'Resources', 'app', 'dist', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(winDir, 'installer-app', 'dist', 'manifest.json'))).toBe(true);
  }, 120000);
});
