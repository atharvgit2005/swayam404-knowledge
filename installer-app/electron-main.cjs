// Electron Main Process for Swayam404 Desktop Installer & Updater
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');

const fs = require('node:fs');

const PORT = 52410;
const HOST = '127.0.0.1';
let mainWindow = null;
let serverInstance = null;
const iconPath = path.join(__dirname, 'icon.png');

// Check if local server is already running
function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/status`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startServerIfNeeded() {
  const isRunning = await checkServerRunning();
  if (!isRunning) {
    // Dynamically import ESM server module
    const { createInstallerAppServer } = await import('./server.mjs');
    serverInstance = createInstallerAppServer();
    serverInstance.listen(PORT, HOST, () => {
      console.log(`[Electron] Background API Server listening on http://${HOST}:${PORT}`);
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    title: 'Swayam404 Installer',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch {
      // ignore
    }
  }

  mainWindow.loadURL(`http://${HOST}:${PORT}`);

  // Open external links (like chrome:// or github) in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});
