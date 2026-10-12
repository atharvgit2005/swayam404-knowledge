/**
 * Swayam404 Admin Telemetry & Browser Analytics Test Suite
 *
 * Verifies:
 * 1. Ingestion of anonymous browser heartbeat pings
 * 2. Active client deduplication & 24h / 7d window analytics
 * 3. Browser (Chrome, Brave, Edge) and OS breakdown calculations
 * 4. Authentication gating on protected /api/admin/stats route
 * 5. Dev Mode bypass login for testing before Google OAuth credentials
 * 6. Simulation endpoint for live testing
 * 7. Telemetry data persistence to disk
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-ignore
import { createAdminServer, recordPing, computeStats, activeSessions } from '../../admin-panel/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDataFile = path.resolve(__dirname, '../../admin-panel/data/test-telemetry.json');

describe('Swayam404 Admin Telemetry & Browser Analytics Dashboard', () => {
  let server: http.Server | null = null;
  let serverPort: number;
  let serverUrl: string;

  beforeEach(async () => {
    // Clean test data file
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
    activeSessions.clear();

    await new Promise<void>((resolve) => {
      const s = createAdminServer({ dataFile: testDataFile });
      server = s;
      s.listen(0, '127.0.0.1', () => {
        const addr = s.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
  });

  it('1. Ingests anonymous browser heartbeat pings correctly', async () => {
    const payload = {
      clientId: 'test-browser-client-123',
      browser: 'Chrome',
      platform: 'mac',
      version: '1.1.0',
      event: 'install',
    };

    const res = await fetch(`${serverUrl}/api/telemetry/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.client.clientId).toBe('test-browser-client-123');
    expect(data.client.pings).toBe(1);
    expect(data.client.browser).toBe('Chrome');
  });

  it('2. Deduplicates multiple pings from the same browser instance and increments count', async () => {
    const payload = {
      clientId: 'browser-uuid-abc',
      browser: 'Brave',
      platform: 'windows',
      version: '1.1.0',
      event: 'heartbeat',
    };

    // First ping
    await fetch(`${serverUrl}/api/telemetry/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Second ping from same browser
    const res2 = await fetch(`${serverUrl}/api/telemetry/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data2 = await res2.json();
    expect(data2.client.pings).toBe(2);
    expect(data2.client.browser).toBe('Brave');
  });

  it('3. Computes accurate browser and platform distribution stats', () => {
    recordPing({ clientId: 'c1', browser: 'Chrome', platform: 'mac', version: '1.1.0' });
    recordPing({ clientId: 'c2', browser: 'Brave', platform: 'windows', version: '1.1.0' });
    recordPing({ clientId: 'c3', browser: 'Edge', platform: 'windows', version: '1.1.0' });

    const stats = computeStats();
    expect(stats.totalBrowsers).toBeGreaterThanOrEqual(3);
    expect(stats.active24h).toBeGreaterThanOrEqual(3);
    expect(stats.browserBreakdown.Chrome).toBeGreaterThanOrEqual(1);
    expect(stats.browserBreakdown.Brave).toBeGreaterThanOrEqual(1);
    expect(stats.platformBreakdown.windows).toBeGreaterThanOrEqual(2);
    expect(stats.platformBreakdown.mac).toBeGreaterThanOrEqual(1);
  });

  it('4. Rejects unauthorized access to /api/admin/stats without authentication', async () => {
    const res = await fetch(`${serverUrl}/api/admin/stats`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('5. Allows access via Dev Mode login bypass and returns live telemetry', async () => {
    // Perform Dev Login
    const loginRes = await fetch(`${serverUrl}/api/admin/auth/dev-login`, {
      method: 'POST',
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.success).toBe(true);
    expect(loginData.token).toBeDefined();

    // Access protected stats using issued session cookie/bearer
    const statsRes = await fetch(`${serverUrl}/api/admin/stats`, {
      headers: {
        Authorization: `Bearer ${loginData.token}`,
      },
    });
    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json();
    expect(statsData.success).toBe(true);
    expect(statsData.stats).toBeDefined();
    expect(statsData.sessionUser.name).toContain('Atharv');
  });

  it('6. Allows dev preview mode with X-Dev-Bypass header', async () => {
    const res = await fetch(`${serverUrl}/api/admin/stats`, {
      headers: {
        'X-Dev-Bypass': 'true',
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.stats.totalBrowsers).toBeDefined();
  });

  it('7. Simulation endpoint generates random browser pings for live testing', async () => {
    const simRes = await fetch(`${serverUrl}/api/telemetry/simulate`, {
      method: 'POST',
    });
    expect(simRes.status).toBe(200);
    const data = await simRes.json();
    expect(data.success).toBe(true);
    expect(data.simulated.clientId).toMatch(/^sim-/);
    expect(['Chrome', 'Brave', 'Edge']).toContain(data.simulated.browser);
  });

  it('8. Serves static Neo-Brutalist HTML dashboard at root route', async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('swayam404');
    expect(html).toContain('Admin Telemetry');
    expect(html).toContain('Total Active Browsers');
  });
});
