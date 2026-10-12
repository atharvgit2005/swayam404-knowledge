#!/usr/bin/env node
/**
 * Swayam404 Admin Telemetry & Analytics Server
 *
 * Tracks how many browsers the extension is currently installed and active on.
 * Protected by Google Auth (OAuth2 / Google Identity Services) with Dev Preview mode.
 *
 * Endpoints:
 * - POST /api/telemetry/ping : Ingests anonymous heartbeat from extension background worker
 * - GET  /api/admin/stats    : Protected telemetry statistics dashboard data
 * - POST /api/admin/auth/google : Verifies Google ID token and issues admin session
 * - POST /api/admin/auth/dev-login : Dev mode bypass before Google OAuth is configured
 * - POST /api/admin/auth/logout    : Clears session
 * - POST /api/telemetry/simulate   : Simulates browser heartbeat for testing
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export const DEFAULT_PORT = 52420;
export const DATA_FILE = path.join(__dirname, 'data', 'telemetry.json');
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'swayam404-admin-secret-key-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_ADMINS = (process.env.ALLOWED_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// In-memory telemetry cache
let telemetryStore = {
  clients: {}, // { [clientId]: { clientId, browser, platform, version, firstSeen, lastSeen, pings } }
  history: [], // Recent 100 ping records
};

// In-memory GitHub distribution metrics cache
export let cachedGitHubStats = {
  totalDownloads: 0,
  assetDownloads: {
    macDmg: 0,
    macZip: 0,
    windowsZip: 0,
    extensionZip: 0,
  },
  releasesCount: 0,
  stars: 0,
  forks: 0,
  openIssues: 0,
  lastUpdated: null,
};

export async function fetchGitHubMetrics(repo = 'atharvgit2005/swayam404-knowledge') {
  const now = Date.now();
  if (cachedGitHubStats.lastUpdated && (now - new Date(cachedGitHubStats.lastUpdated).getTime()) < 60000) {
    return cachedGitHubStats;
  }
  try {
    const headers = { 'User-Agent': 'swayam404-admin-telemetry' };
    const [relRes, repoRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/releases`, { headers }),
      fetch(`https://api.github.com/repos/${repo}`, { headers }),
    ]);

    if (relRes.ok) {
      const releases = await relRes.json();
      let totalDownloads = 0;
      const assetDownloads = {
        macDmg: 0,
        macZip: 0,
        windowsZip: 0,
        extensionZip: 0,
      };

      if (Array.isArray(releases)) {
        for (const rel of releases) {
          if (Array.isArray(rel.assets)) {
            for (const asset of rel.assets) {
              const count = asset.download_count || 0;
              totalDownloads += count;
              const name = (asset.name || '').toLowerCase();
              if (name.endsWith('.dmg')) assetDownloads.macDmg += count;
              else if (name.includes('installer-macos') || name.includes('mac.zip')) assetDownloads.macZip += count;
              else if (name.includes('windows')) assetDownloads.windowsZip += count;
              else if (name.includes('extension')) assetDownloads.extensionZip += count;
            }
          }
        }
      }
      cachedGitHubStats.totalDownloads = totalDownloads;
      cachedGitHubStats.assetDownloads = assetDownloads;
      cachedGitHubStats.releasesCount = Array.isArray(releases) ? releases.length : 0;
    }

    if (repoRes.ok) {
      const repoData = await repoRes.json();
      cachedGitHubStats.stars = repoData.stargazers_count || 0;
      cachedGitHubStats.forks = repoData.forks_count || 0;
      cachedGitHubStats.openIssues = repoData.open_issues_count || 0;
    }

    cachedGitHubStats.lastUpdated = new Date().toISOString();
  } catch (err) {
    console.warn('[Admin] Error fetching GitHub metrics:', err.message);
  }
  return cachedGitHubStats;
}

// In-memory active sessions: { [token]: { user, expiresAt, provider } }
export const activeSessions = new Map();

export function loadTelemetryData(filePath = DATA_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      telemetryStore = {
        clients: parsed.clients || {},
        history: parsed.history || [],
      };
    }
  } catch (err) {
    console.warn('[Telemetry] Error loading telemetry data file:', err.message);
  }
}

export function saveTelemetryData(filePath = DATA_FILE) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(telemetryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Telemetry] Error saving telemetry data file:', err.message);
  }
}

export function recordPing(payload) {
  const now = new Date().toISOString();
  const clientId = payload.clientId || `anon-${crypto.randomBytes(6).toString('hex')}`;
  const browser = payload.browser || 'Chrome';
  const platform = payload.platform || 'other';
  const version = payload.version || '1.1.0';
  const event = payload.event || 'heartbeat';

  if (!telemetryStore.clients[clientId]) {
    telemetryStore.clients[clientId] = {
      clientId,
      browser,
      platform,
      version,
      firstSeen: now,
      lastSeen: now,
      pings: 1,
    };
  } else {
    const client = telemetryStore.clients[clientId];
    client.browser = browser;
    client.platform = platform;
    client.version = version;
    client.lastSeen = now;
    client.pings += 1;
  }

  const pingEvent = {
    clientId,
    browser,
    platform,
    version,
    event,
    timestamp: now,
  };

  telemetryStore.history.unshift(pingEvent);
  if (telemetryStore.history.length > 100) {
    telemetryStore.history.length = 100;
  }

  return telemetryStore.clients[clientId];
}

export function computeStats() {
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const ms30d = 30 * ms24h;

  const allClients = Object.values(telemetryStore.clients);
  const total = allClients.length;

  let active24h = 0;
  let active7d = 0;
  let active30d = 0;

  const browserCounts = { Chrome: 0, Brave: 0, Edge: 0, Arc: 0, Other: 0 };
  const platformCounts = { mac: 0, windows: 0, linux: 0, other: 0 };
  const versionCounts = {};

  for (const client of allClients) {
    const lastSeenTime = new Date(client.lastSeen).getTime();
    const diff = now - lastSeenTime;

    if (diff <= ms24h) active24h++;
    if (diff <= ms7d) active7d++;
    if (diff <= ms30d) active30d++;

    // Browser tally
    const b = client.browser || 'Other';
    if (browserCounts[b] !== undefined) browserCounts[b]++;
    else browserCounts.Other++;

    // Platform tally
    const p = client.platform || 'other';
    if (platformCounts[p] !== undefined) platformCounts[p]++;
    else platformCounts.other++;

    // Version tally
    const v = client.version || 'unknown';
    versionCounts[v] = (versionCounts[v] || 0) + 1;
  }

  return {
    totalBrowsers: total,
    active24h,
    active7d,
    active30d,
    browserBreakdown: browserCounts,
    platformBreakdown: platformCounts,
    versionBreakdown: versionCounts,
    recentPings: telemetryStore.history.slice(0, 25),
    github: cachedGitHubStats,
    googleAuthStatus: {
      configured: Boolean(GOOGLE_CLIENT_ID),
      clientId: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.slice(0, 12)}...` : null,
      allowedAdmins: ALLOWED_ADMINS,
    },
  };
}

export function createSession(user, provider = 'google') {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  activeSessions.set(token, { user, expiresAt, provider });
  return token;
}

export function validateSession(token) {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

export async function verifyGoogleToken(idToken) {
  if (!idToken) throw new Error('Missing Google ID token');

  // Verify against Google OAuth2 tokeninfo endpoint
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Google token validation failed');
  }
  const payload = await res.json();

  if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error('Google Client ID mismatch');
  }

  const email = (payload.email || '').toLowerCase();
  if (ALLOWED_ADMINS.length > 0 && !ALLOWED_ADMINS.includes(email)) {
    throw new Error(`Email ${email} is not authorized as an admin`);
  }

  return {
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture,
    sub: payload.sub,
  };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = req.headers['cookie'];
  if (cookies) {
    const match = cookies.match(/(?:^|;\s*)admin_session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

export async function handleAdminRequest(req, res, options = {}) {
  const dataFile = options.dataFile || DATA_FILE;
  loadTelemetryData(dataFile);

  // CORS headers for extension pings
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Dev-Bypass');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Ingest Telemetry Ping from Extension
    if (pathname === '/api/telemetry/ping' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const recorded = recordPing(body);
      saveTelemetryData(dataFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, client: recorded }));
    }

    // 2. Simulate Telemetry Ping (Demo / Testing)
    if (pathname === '/api/telemetry/simulate' && req.method === 'POST') {
      const browsers = ['Chrome', 'Brave', 'Edge'];
      const platforms = ['mac', 'windows', 'linux'];
      const randomBrowser = browsers[Math.floor(Math.random() * browsers.length)];
      const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
      const simulatedPayload = {
        clientId: `sim-${crypto.randomBytes(4).toString('hex')}`,
        browser: randomBrowser,
        platform: randomPlatform,
        version: '1.1.0',
        event: 'simulated_ping',
      };
      const recorded = recordPing(simulatedPayload);
      saveTelemetryData(dataFile);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, simulated: recorded }));
    }

    // 3. Google OAuth Verification
    if (pathname === '/api/admin/auth/google' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const user = await verifyGoogleToken(body.idToken);
      const token = createSession(user, 'google');
      res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, token, user }));
    }

    // 4. Dev Mode Admin Login (For testing before Google OAuth credentials are set)
    if (pathname === '/api/admin/auth/dev-login' && req.method === 'POST') {
      const devUser = {
        email: 'admin@swayam404.local',
        name: 'Atharv Paharia (Admin)',
        role: 'administrator',
      };
      const token = createSession(devUser, 'dev');
      res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, token, user: devUser, mode: 'dev' }));
    }

    // 5. Admin Logout
    if (pathname === '/api/admin/auth/logout' && req.method === 'POST') {
      const token = parseAuthToken(req);
      if (token) activeSessions.delete(token);
      res.setHeader('Set-Cookie', `admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // 6. Admin Telemetry Statistics (Protected)
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      const token = parseAuthToken(req);
      const session = validateSession(token);

      // Allow dev bypass if header X-Dev-Bypass is present or valid session exists
      const hasDevBypass = req.headers['x-dev-bypass'] === 'true';

      if (!session && !hasDevBypass) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized. Please sign in with Google Auth.' }));
      }

      await fetchGitHubMetrics();
      const stats = computeStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, stats, sessionUser: session?.user || { name: 'Preview Mode' } }));
    }

    // 7. Serve Static Dashboard UI
    if (pathname === '/' || pathname === '/index.html') {
      const htmlPath = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(htmlPath)) {
        const content = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(content);
      }
    }

    // 404 handler
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('[Admin Server Error]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
  }
}

export default function handler(req, res) {
  const isVercel = Boolean(process.env.VERCEL);
  const dataFile = isVercel ? '/tmp/telemetry.json' : DATA_FILE;
  return handleAdminRequest(req, res, { dataFile });
}

export function createAdminServer(options = {}) {
  const dataFile = options.dataFile || DATA_FILE;
  loadTelemetryData(dataFile);
  return http.createServer((req, res) => handleAdminRequest(req, res, { dataFile }));
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = process.env.PORT || DEFAULT_PORT;
  const server = createAdminServer();
  server.listen(port, '0.0.0.0', () => {
    console.log('========================================================');
    console.log('⚡ Swayam404 Admin Telemetry & Analytics Dashboard');
    console.log(`📡 Listening on: http://localhost:${port}`);
    console.log('🔒 Google Auth: ' + (GOOGLE_CLIENT_ID ? 'Configured' : 'Dev Preview Mode'));
    console.log('========================================================');
  });

  if (process.argv.includes('--open')) {
    import('node:child_process').then(({ exec }) => {
      const url = `http://localhost:${port}`;
      if (process.platform === 'darwin') exec(`open "${url}"`);
      else if (process.platform === 'win32') exec(`start "${url}"`);
    });
  }
}
