/**
 * Swayam404 Cross-Platform Desktop Installer & Updater App Test Suite
 *
 * Verifies:
 * - Server initialization & loopback binding (127.0.0.1)
 * - getSystemStatus() accuracy (platform detection, dist path, installed version)
 * - Static UI serving (/ -> 200 text/html)
 * - REST API endpoints:
 *   • GET /api/status
 *   • POST /api/server/toggle (start/stop update server daemon)
 * - Path traversal security on static routes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-ignore
import { createInstallerAppServer, getSystemStatus, stopUpdateServer } from '../../installer-app/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

describe('Swayam404 Desktop Installer & Updater App (Mac & Windows)', () => {
  let appServer: http.Server | null = null;
  let serverPort: number;
  let serverUrl: string;

  beforeEach(async () => {
    await stopUpdateServer();

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
    await stopUpdateServer();
    if (appServer) {
      await new Promise<void>((resolve) => appServer!.close(() => resolve()));
      appServer = null;
    }
  });

  it('1. getSystemStatus reports valid platform, dist directory, and node environment', () => {
    const status = getSystemStatus();
    expect(status.platform).toMatch(/^(mac|windows|linux)$/);
    expect(status.nodeVersion).toMatch(/^v\d+/);
    expect(status.rootDir).toBe(root);
    expect(status.distDir).toBe(path.join(root, 'dist'));
    expect(typeof status.distBuilt).toBe('boolean');
    expect(status.updateServer).toBeDefined();
    expect(status.updateServer.port).toBe(52404);
  });

  it('2. Serves static Neo-Brutalist HTML interface at root path (/)', async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('Swayam404 Installer');
    expect(html).toContain('Install Extension');
    expect(html).toContain('Update Extension');
    expect(html).toContain('Check for Updates');
    expect(html).toContain('Chrome Setup');
  });

  it('3. GET /api/status returns live telemetry JSON', async () => {
    const res = await fetch(`${serverUrl}/api/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = await res.json();
    expect(data.platform).toMatch(/^(mac|windows|linux)$/);
    expect(data.distDir).toBeDefined();
    expect(data.installedVersion).toBeDefined();
  });

  it('4. POST /api/server/toggle controls the local update server', async () => {
    // 1. Start server
    const startRes = await fetch(`${serverUrl}/api/server/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    expect(startRes.status).toBe(200);
    const startData = await startRes.json();
    expect(startData.success).toBe(true);

    // 2. Stop server
    const stopRes = await fetch(`${serverUrl}/api/server/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    expect(stopRes.status).toBe(200);
    const stopData = await stopRes.json();
    expect(stopData.success).toBe(true);
    expect(stopData.status).toBe('stopped');
  });

  it('5. Protects against directory traversal in static file requests', async () => {
    const res = await fetch(`${serverUrl}/..%2f..%2fpackage.json`);
    expect(res.status).toBe(403);
  });
});
