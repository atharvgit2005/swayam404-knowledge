#!/usr/bin/env node
/**
 * Swayam404 Cross-Platform Desktop Installer & Updater Control Server
 *
 * Runs locally on loopback (127.0.0.1:52410) and powers the macOS & Windows desktop app.
 * Provides REST API and static UI for:
 * - One-click building and manifest compliance validation
 * - Starting and stopping the local update server
 * - Generating test releases (v1.0.0, v1.1.0, etc.)
 * - Applying updates to dist/ with automatic backup
 * - One-click rollback to last working backup
 * - Opening browser extensions page (chrome://extensions / brave://extensions)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractZipSafe } from './lib/extractZip.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const STANDALONE = !fs.existsSync(path.join(root, 'package.json')) || process.env.SWAYAM_STANDALONE === '1';

const DEFAULT_PORT = 52410;
const HOST = '127.0.0.1';

let updateServerProcess = null;
let updateServerStatus = 'stopped';
let updateServerPort = 52404;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function runNpmScript(args, cwd = root) {
  if (STANDALONE) {
    return Promise.reject(new Error(`npm scripts are not available in standalone mode: npm ${args.join(' ')}`));
  }
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, args, {
      cwd,
      shell: isWindows,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const error = new Error(`Command failed with code ${code}: ${stderr || stdout}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on('error', reject);
  });
}

export const userInstallDir = path.join(os.homedir(), 'Downloads', 'swayam404-extension');

export function syncToUserInstallDir() {
  const distPath = path.join(root, 'dist');
  if (fs.existsSync(path.join(distPath, 'manifest.json'))) {
    try {
      if (!fs.existsSync(userInstallDir)) {
        fs.mkdirSync(userInstallDir, { recursive: true });
      }
      fs.cpSync(distPath, userInstallDir, { recursive: true });
    } catch {
      // ignore
    }
  }
}

export function getSystemStatus() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const distPath = path.join(root, 'dist');
  let distManifest = null;
  if (fs.existsSync(path.join(distPath, 'manifest.json'))) {
    try {
      distManifest = JSON.parse(fs.readFileSync(path.join(distPath, 'manifest.json'), 'utf8'));
    } catch {
      // ignore
    }
  }

  syncToUserInstallDir();

  const releasesPath = path.join(root, 'local-releases');
  let latestRelease = null;
  let availableReleases = [];
  if (fs.existsSync(path.join(releasesPath, 'latest.json'))) {
    try {
      latestRelease = JSON.parse(fs.readFileSync(path.join(releasesPath, 'latest.json'), 'utf8'));
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(releasesPath)) {
    try {
      const files = fs.readdirSync(releasesPath);
      availableReleases = files
        .filter((f) => f.endsWith('.zip'))
        .map((f) => ({
          filename: f,
          size: fs.statSync(path.join(releasesPath, f)).size,
        }));
    } catch {
      // ignore
    }
  }

  const backupsPath = path.join(root, 'local-backups');
  let lastBackup = null;
  let backupList = [];
  if (fs.existsSync(path.join(backupsPath, 'last-backup.json'))) {
    try {
      lastBackup = JSON.parse(fs.readFileSync(path.join(backupsPath, 'last-backup.json'), 'utf8'));
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(backupsPath)) {
    try {
      backupList = fs
        .readdirSync(backupsPath)
        .filter((f) => f.startsWith('backup-'))
        .map((f) => ({
          name: f,
          created: fs.statSync(path.join(backupsPath, f)).mtime.toISOString(),
        }));
    } catch {
      // ignore
    }
  }

  return {
    platform: isWindows ? 'windows' : isMac ? 'mac' : 'linux',
    osRelease: os.release(),
    nodeVersion: process.version,
    rootDir: root,
    distDir: distPath,
    installDir: userInstallDir,
    chromeExtensionPath: userInstallDir,
    distBuilt: fs.existsSync(distPath) && Boolean(distManifest),
    installedVersion: distManifest?.version || null,
    defaultRepo: 'atharvgit2005/swayam404-knowledge',
    updateServer: {
      status: updateServerStatus,
      port: updateServerPort,
      url: `http://127.0.0.1:${updateServerPort}`,
    },
    latestRelease,
    availableReleases,
    lastBackup,
    backupCount: backupList.length,
    backupList,
  };
}

export function startUpdateServer() {
  if (updateServerProcess && updateServerStatus === 'running') {
    return Promise.resolve({ status: 'already-running', port: updateServerPort });
  }

  return new Promise((resolve, reject) => {
    const serverScript = path.join(root, 'local-update-server', 'server.mjs');
    const child = spawn(process.execPath, [serverScript], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    updateServerProcess = child;
    updateServerStatus = 'starting';

    let resolved = false;

    child.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!resolved && msg.includes('running')) {
        resolved = true;
        updateServerStatus = 'running';
        resolve({ status: 'running', port: updateServerPort });
      }
    });

    child.stderr.on('data', (data) => {
      console.error('[UpdateServer Err]', data.toString());
    });

    child.on('close', (code) => {
      updateServerStatus = 'stopped';
      updateServerProcess = null;
      if (!resolved) {
        reject(new Error(`Update server exited immediately with code ${code}`));
      }
    });

    // Timeout fallback after 3 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        updateServerStatus = 'running';
        resolve({ status: 'running', port: updateServerPort });
      }
    }, 2000);
  });
}

export function stopUpdateServer() {
  return new Promise((resolve) => {
    if (updateServerProcess) {
      updateServerProcess.kill('SIGTERM');
      updateServerProcess = null;
    }
    updateServerStatus = 'stopped';
    resolve({ status: 'stopped' });
  });
}

export function openExtensionsPage() {
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  if (isMac) {
    // Try Brave then Chrome then default open
    exec('open -a "Brave Browser" "brave://extensions" || open -a "Google Chrome" "chrome://extensions" || open "chrome://extensions"');
  } else if (isWindows) {
    exec('start brave brave://extensions || start chrome chrome://extensions || start msedge edge://extensions');
  } else {
    exec('xdg-open chrome://extensions');
  }
}

export function openDirectory(dirPath) {
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';

  if (isMac) {
    execFile('/usr/bin/open', [dirPath]);
  } else if (isWindows) {
    exec(`explorer "${dirPath}"`);
  } else {
    execFile('xdg-open', [dirPath]);
  }
}

export function isNewerVersion(vCandidate, vCurrent) {
  if (!vCandidate || !vCurrent) return false;
  const clean = (v) =>
    v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [cMaj = 0, cMin = 0, cPat = 0] = clean(vCandidate);
  const [curMaj = 0, curMin = 0, curPat = 0] = clean(vCurrent);
  if (cMaj !== curMaj) return cMaj > curMaj;
  if (cMin !== curMin) return cMin > curMin;
  return cPat > curPat;
}

export async function checkGitHubRelease(repo = 'atharvgit2005/swayam404-knowledge', options = {}) {
  const sanitizedRepo = repo.trim();
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(sanitizedRepo)) {
    throw new Error('Invalid GitHub repository format. Expected "owner/repo".');
  }

  // Support mock release for offline testing / CI
  if (options.mockRelease) {
    const release = options.mockRelease;
    const releaseVersion = (release.tag_name || '1.1.0').replace(/^v/, '');
    const currentVersion = getSystemStatus().installedVersion || '1.0.0';
    let expectedSha256 = release.sha256 || null;
    if (!expectedSha256 && release.body) {
      const shaMatch = release.body.match(/\b([a-fA-F0-9]{64})\b/);
      if (shaMatch) expectedSha256 = shaMatch[1].toLowerCase();
    }
    return {
      repo: sanitizedRepo,
      currentVersion,
      latestVersion: releaseVersion,
      tag: release.tag_name || `v${releaseVersion}`,
      releaseName: release.name || `Release v${releaseVersion}`,
      releaseNotes: release.body || 'Mock release notes',
      publishedAt: release.published_at || new Date().toISOString(),
      htmlUrl: `https://github.com/${sanitizedRepo}/releases`,
      updateAvailable: isNewerVersion(releaseVersion, currentVersion),
      zipAsset: release.assets?.[0] || null,
      expectedSha256,
    };
  }

  const url = `https://api.github.com/repos/${sanitizedRepo}/releases/latest`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Swayam404-Installer/1.0.0',
      'Accept': 'application/vnd.github.v3+json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`No published releases found for GitHub repository: ${sanitizedRepo}`);
    }
    if (response.status === 403) {
      throw new Error('GitHub API rate limit reached or access forbidden. Please try again later.');
    }
    throw new Error(`GitHub API request failed: HTTP ${response.status} ${response.statusText}`);
  }

  const release = await response.json();
  const tagName = release.tag_name || '';
  const releaseVersion = tagName.replace(/^v/, '');
  const currentVersion = getSystemStatus().installedVersion || '1.0.0';
  const updateAvailable = isNewerVersion(releaseVersion, currentVersion);

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const zipAsset = assets.find((a) => a.name.toLowerCase().endsWith('.zip')) || null;

  let expectedSha256 = null;
  if (zipAsset?.digest && zipAsset.digest.startsWith('sha256:')) {
    expectedSha256 = zipAsset.digest.slice(7).toLowerCase();
  } else if (release.body) {
    const shaMatch = release.body.match(/\b([a-fA-F0-9]{64})\b/);
    if (shaMatch) expectedSha256 = shaMatch[1].toLowerCase();
  }

  return {
    repo: sanitizedRepo,
    currentVersion,
    latestVersion: releaseVersion,
    tag: tagName,
    releaseName: release.name || tagName,
    releaseNotes: release.body || '',
    publishedAt: release.published_at || null,
    htmlUrl: release.html_url || `https://github.com/${sanitizedRepo}/releases`,
    updateAvailable,
    zipAsset: zipAsset
      ? {
          name: zipAsset.name,
          downloadUrl: zipAsset.browser_download_url,
          size: zipAsset.size,
        }
      : null,
    expectedSha256,
  };
}

export async function downloadAndApplyFromGitHub(options = {}) {
  const repo = options.repo || 'atharvgit2005/swayam404-knowledge';
  let check;
  if (options.mockRelease) {
    check = await checkGitHubRelease(repo, { mockRelease: options.mockRelease });
  } else {
    check = await checkGitHubRelease(repo);
  }

  const targetVersion = check.latestVersion;
  const stagingRoot = path.join(root, 'local-staging');
  const downloadDir = path.join(stagingRoot, 'github-downloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const pkgName = check.zipAsset?.name || `swayam404-extension-v${targetVersion}.zip`;
  const downloadPath = path.join(downloadDir, pkgName);

  let buffer;
  if (options.mockZipBuffer) {
    buffer = options.mockZipBuffer;
    fs.writeFileSync(downloadPath, buffer);
  } else {
    if (!check.zipAsset?.downloadUrl) {
      throw new Error(`No ZIP package asset attached to GitHub release ${check.latestVersion}`);
    }
    const res = await fetch(check.zipAsset.downloadUrl, {
      headers: { 'User-Agent': 'Swayam404-Installer/1.0.0' },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`Failed to download package from GitHub: HTTP ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(downloadPath, buffer);
  }

  // 1. Verify SHA-256
  const computedSha = crypto.createHash('sha256').update(buffer).digest('hex');
  const expectedSha = options.sha256 || check.expectedSha256;
  if (expectedSha && computedSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`Security Violation: Checksum mismatch!\nExpected: ${expectedSha}\nComputed: ${computedSha}`);
  }

  // 2. Pre-extraction security audit using pure ZIP inspector
  const { validateZipPackage } = await import('./lib/zipValidator.mjs');
  const audit = validateZipPackage(buffer, {
    requireAssets: true,
    expectedVersion: targetVersion,
  });
  if (!audit.valid) {
    throw new Error(`Package security audit failed:\n  • ${audit.errors.join('\n  • ')}`);
  }

  // 3. Extract to staging
  const stagingDir = path.join(stagingRoot, `github-v${targetVersion}`);
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  extractZipSafe(downloadPath, stagingDir);

  // 4. Backup current dist/
  const distDir = path.join(root, 'dist');
  const backupsDir = path.join(root, 'local-backups');
  let currentVer = '1.0.0';
  if (fs.existsSync(path.join(distDir, 'manifest.json'))) {
    try {
      currentVer = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8')).version || '1.0.0';
    } catch {
      // ignore
    }
  }

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `backup-v${currentVer}-${timestamp}`);
  if (fs.existsSync(distDir)) {
    fs.cpSync(distDir, backupPath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(backupsDir, 'last-backup.json'),
    JSON.stringify({
      installedVersion: currentVer,
      targetVersion,
      backupPath,
      timestamp: new Date().toISOString(),
      source: `GitHub (${repo}#${check.tag})`,
    }, null, 2)
  );

  // 5. Atomic dist replacement
  try {
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });
    fs.cpSync(stagingDir, distDir, { recursive: true });
    syncToUserInstallDir();
  } catch (err) {
    if (fs.existsSync(backupPath)) {
      fs.rmSync(distDir, { recursive: true, force: true });
      fs.cpSync(backupPath, distDir, { recursive: true });
    }
    throw err;
  }

  // Cleanup
  fs.rmSync(stagingDir, { recursive: true, force: true });
  try {
    fs.unlinkSync(downloadPath);
  } catch {
    // ignore
  }

  return {
    success: true,
    version: targetVersion,
    backupPath,
    source: `GitHub (${repo}#${check.tag})`,
    sha256: computedSha,
  };
}

export function createInstallerAppServer(options = {}) {
  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. API Endpoints
      if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(getSystemStatus()));
      }

      if (pathname === '/api/server/toggle' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        if (body.action === 'start') {
          const result = await startUpdateServer();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, ...result }));
        } else {
          const result = await stopUpdateServer();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, ...result }));
        }
      }

      if (pathname === '/api/build' && req.method === 'POST') {
        const result = await runNpmScript(['run', 'build']);
        syncToUserInstallDir();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, output: result.stdout }));
      }

      if (pathname === '/api/release/create' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const version = body.version || '1.1.0';
        const notes = body.notes || `Release v${version} created from desktop installer`;
        const corrupt = Boolean(body.corrupt);

        const args = ['run', 'release:local', '--', '--version', version, '--notes', notes];
        if (corrupt) args.push('--corrupt');

        const result = await runNpmScript(args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, version, output: result.stdout }));
      }

      if (pathname === '/api/update/apply' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const args = ['run', 'update:apply'];
        if (body.version) args.push('--', '--version', body.version);

        const result = await runNpmScript(args);
        syncToUserInstallDir();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, output: result.stdout }));
      }

      if (pathname === '/api/update/rollback' && req.method === 'POST') {
        const result = await runNpmScript(['run', 'update:rollback']);
        syncToUserInstallDir();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, output: result.stdout }));
      }

      if (pathname === '/api/github/check' && req.method === 'GET') {
        const repo = parsedUrl.searchParams.get('repo') || 'atharvgit2005/swayam404-knowledge';
        const check = await checkGitHubRelease(repo);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(check));
      }

      if (pathname === '/api/github/download-and-apply' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await downloadAndApplyFromGitHub(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (pathname === '/api/browser/open-extensions' && req.method === 'POST') {
        openExtensionsPage();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Opening extensions page' }));
      }

      if (pathname === '/api/open-folder' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const target = body.target === 'releases' ? path.join(root, 'local-releases') : path.join(root, 'dist');
        openDirectory(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, target }));
      }

      // 2. Static File Serving
      if (req.url.includes('..') || pathname.includes('..') || req.url.includes('\0')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }

      let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        return fs.createReadStream(filePath).pipe(res);
      }

      // 404 Fallback to index.html
      const fallbackPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(fallbackPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(fallbackPath).pipe(res);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, code: err.code }));
    }
  });

  return server;
}

// Direct CLI launcher
if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = parseInt(process.env.PORT, 10) || DEFAULT_PORT;
  const shouldOpen = process.argv.includes('--open') || process.argv.includes('-o');

  const server = createInstallerAppServer();
  server.listen(port, HOST, () => {
    const appUrl = `http://${HOST}:${port}`;
    console.log('========================================================');
    console.log('🚀 Swayam404 Desktop Installer & Updater App');
    console.log('========================================================');
    console.log(`📡 App Running at: ${appUrl}`);
    console.log(`💻 Platform:       ${process.platform === 'win32' ? 'Windows' : 'macOS'} (${os.arch()})`);
    console.log('👉 Press Ctrl+C to close');
    console.log('========================================================');

    if (shouldOpen) {
      const isMac = process.platform === 'darwin';
      const isWindows = process.platform === 'win32';
      const nativeMacApp = path.join(__dirname, 'mac', 'native-window-mac');
      if (isMac && fs.existsSync(nativeMacApp)) {
        exec(`"${nativeMacApp}"`);
      } else if (isMac) {
        exec(`open -na "Brave Browser" --args --app="${appUrl}" --user-data-dir="/tmp/swayam404-app-profile" || open -na "Google Chrome" --args --app="${appUrl}" --user-data-dir="/tmp/swayam404-app-profile" || open "${appUrl}"`);
      } else if (isWindows) {
        exec(`start chrome --app="${appUrl}" --user-data-dir="%TEMP%\\swayam404-app-profile" || start msedge --app="${appUrl}" --user-data-dir="%TEMP%\\swayam404-app-profile" || start "${appUrl}"`);
      }
    }
  });
}
