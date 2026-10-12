#!/usr/bin/env node
/**
 * Swayam404 Development-Only Local Update Server
 *
 * Exposes local release metadata and test ZIP packages strictly over loopback (127.0.0.1).
 *
 * Endpoints:
 *   GET /health              - Diagnostics health check
 *   GET /latest.json         - Returns latest.json metadata from local-releases/
 *   GET /releases/:filename  - Serves requested ZIP package from local-releases/
 *
 * Security:
 *   - Strictly bound to 127.0.0.1 (rejects non-loopback bindings)
 *   - Prevents path traversal (rejects '..', slashes, and non-whitelisted extensions)
 *   - Zero code execution or shell interaction
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const RELEASES_DIR = path.join(root, 'local-releases');

export const DEFAULT_PORT = 52404;
export const DEFAULT_HOST = '127.0.0.1';

export function createUpdateServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const releasesDir = options.releasesDir || RELEASES_DIR;

  // Enforce loopback security: only allow 127.0.0.1 or localhost loopbacks
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Security Violation: Local update server must strictly bind to loopback (127.0.0.1). Rejected host: ${host}`);
  }

  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const parsedUrl = new URL(req.url, `http://${host}`);
    const pathname = parsedUrl.pathname;

    // CORS headers for extension UI and background worker access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' }));
      return;
    }

    // Health check endpoint
    if (pathname === '/health') {
      const data = {
        status: 'ok',
        service: 'swayam404-local-update-server',
        mode: 'development-only',
        loopbackOnly: true,
        boundHost: host,
        timestamp: new Date().toISOString(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
      logRequest(req.method, pathname, 200, Date.now() - startTime);
      return;
    }

    // Latest metadata endpoint
    if (pathname === '/latest.json' || pathname === '/api/v1/update/latest') {
      const latestPath = path.join(releasesDir, 'latest.json');
      if (!fs.existsSync(latestPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No local releases found. Run "node scripts/generate-local-release.mjs" first.',
          code: 'NO_RELEASES_AVAILABLE',
        }));
        logRequest(req.method, pathname, 404, Date.now() - startTime);
        return;
      }

      try {
        const content = fs.readFileSync(latestPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
        logRequest(req.method, pathname, 200, Date.now() - startTime);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read latest release metadata', code: 'METADATA_READ_ERROR' }));
        logRequest(req.method, pathname, 500, Date.now() - startTime);
      }
      return;
    }

    // Release package download endpoint: /releases/:filename
    if (pathname.startsWith('/releases/')) {
      const rawFilename = pathname.slice('/releases/'.length);
      const safeFilename = path.basename(rawFilename);

      // Security check: reject directory traversal, illegal chars, null bytes, or empty filename
      const resolvedReleasesDir = path.resolve(releasesDir);
      const resolvedFilePath = path.resolve(releasesDir, safeFilename);

      if (
        !rawFilename ||
        rawFilename !== safeFilename ||
        rawFilename.includes('..') ||
        rawFilename.includes('/') ||
        rawFilename.includes('\\') ||
        rawFilename.includes('\0') ||
        !resolvedFilePath.startsWith(resolvedReleasesDir + path.sep)
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Security error: Invalid package filename or path traversal detected.',
          code: 'INVALID_FILENAME',
        }));
        logRequest(req.method, pathname, 400, Date.now() - startTime);
        return;
      }

      // Security check: only allow .zip or .json files
      const ext = path.extname(safeFilename).toLowerCase();
      if (ext !== '.zip' && ext !== '.json') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Forbidden: Only .zip release packages and .json metadata are served.',
          code: 'FORBIDDEN_FILE_TYPE',
        }));
        logRequest(req.method, pathname, 403, Date.now() - startTime);
        return;
      }

      const filePath = resolvedFilePath;
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `Release package not found: ${safeFilename}`,
          code: 'PACKAGE_NOT_FOUND',
        }));
        logRequest(req.method, pathname, 404, Date.now() - startTime);
        return;
      }

      try {
        const stat = fs.statSync(filePath);
        const contentType = ext === '.zip' ? 'application/zip' : 'application/json';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
        });

        if (req.method === 'HEAD') {
          res.end();
        } else {
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
        }
        logRequest(req.method, pathname, 200, Date.now() - startTime);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to stream release package', code: 'STREAM_ERROR' }));
        logRequest(req.method, pathname, 500, Date.now() - startTime);
      }
      return;
    }

    // Default route: 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `Endpoint not found: ${pathname}`,
      availableEndpoints: ['/health', '/latest.json', '/releases/:filename'],
    }));
    logRequest(req.method, pathname, 404, Date.now() - startTime);
  });

  return server;
}

function logRequest(method, pathname, status, durationMs) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
  console.log(`[${timestamp}] \x1b[36m${method}\x1b[0m ${pathname} -> ${color}${status}\x1b[0m (${durationMs}ms)`);
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
  const host = DEFAULT_HOST;

  const server = createUpdateServer({ host });

  server.listen(port, host, () => {
    console.log('========================================================');
    console.log('🚀 Swayam404 Development-Only Local Update Server');
    console.log(`📡 URL:             http://${host}:${port}`);
    console.log(`🔍 Health Check:    http://${host}:${port}/health`);
    console.log(`📄 Latest Metadata: http://${host}:${port}/latest.json`);
    console.log(`📁 Releases Dir:    ${RELEASES_DIR}`);
    console.log('🔒 Security:        Loopback-only (127.0.0.1) • Dev prototype');
    console.log('========================================================');
    console.log('Waiting for incoming update checks from extension UI...');
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down local update server...');
    server.close(() => {
      console.log('✅ Server stopped cleanly.');
      process.exit(0);
    });
  });
}
