'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const settingsManager = require('./services/settingsManager');
const workspaceManager = require('./services/workspaceManager');
const manifestManager = require('./services/manifestManager');
const { registerAgentHandlers } = require('./ipc/agentHandlers');
const { registerWorkspaceHandlers } = require('./ipc/workspaceHandlers');
const { registerSettingsHandlers } = require('./ipc/settingsHandlers');

// Graceful unhandled rejection handling
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

let mainWindow = null;

async function createWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: true, // native Windows frame
    backgroundColor: '#1E1E1E',
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to require shared constants
      webSecurity: true,
    },

  });

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none';"
        ],
      },
    });
  });

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  logger.info('CODY starting', { version: app.getVersion(), platform: process.platform });

  // Load settings
  const settings = await settingsManager.load();
  logger.setLevel(settings.logLevel || 'info');

  // Restore last workspace if it exists
  if (settings.lastWorkspace) {
    try {
      const fse = require('fs-extra');
      const exists = await fse.pathExists(settings.lastWorkspace);
      if (exists) {
        await workspaceManager.setWorkspace(settings.lastWorkspace);
        await workspaceManager.buildIndex();
        manifestManager.setWorkspace(settings.lastWorkspace);
        await manifestManager.load();
        logger.info('Restored last workspace', { path: settings.lastWorkspace });
      }
    } catch (err) {
      logger.warn('Could not restore last workspace', { error: err.message });
    }
  }

  // Register IPC handlers once
  registerWorkspaceHandlers();
  registerSettingsHandlers();
  registerAgentHandlers(() => mainWindow);

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  logger.info('CODY shutting down');
});
