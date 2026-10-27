'use strict';

const { ipcMain, dialog } = require('electron');
const { IPC_EVENTS } = require('../../../shared/constants');
const workspaceManager = require('../services/workspaceManager');
const manifestManager = require('../services/manifestManager');
const contextManager = require('../services/contextManager');
const logger = require('../utils/logger');

function registerWorkspaceHandlers() {
  // ─── Select Workspace ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_SELECT_WORKSPACE, async (event) => {
    const result = await dialog.showOpenDialog({
      title: 'Select Project Workspace',
      properties: ['openDirectory'],
      buttonLabel: 'Open Workspace',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const dirPath = result.filePaths[0];
    try {
      const root = await workspaceManager.setWorkspace(dirPath);
      await workspaceManager.buildIndex();

      // Initialize manifest
      manifestManager.setWorkspace(root);
      const manifest = await manifestManager.init();

      // Update manifest with fresh file tree
      await manifestManager.updateFileTree(workspaceManager.index);

      // Reset context for new project
      contextManager.clearHistory();

      const settingsManager = require('../services/settingsManager');
      await settingsManager.setLastWorkspace(root);

      return {
        success: true,
        root,
        manifest,
        fileCount: workspaceManager.index.filter(e => e.type === 'file').length,
      };
    } catch (err) {
      logger.error('Failed to open workspace', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ─── Get File Tree ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_GET_FILE_TREE, async () => {
    try {
      const tree = await workspaceManager.getFileTree();
      return { success: true, tree };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Read File ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_READ_FILE, async (event, { path: relPath }) => {
    try {
      if (!relPath) return { success: false, error: 'No path provided' };
      const content = await workspaceManager.readFile(relPath);
      return { success: true, content, path: relPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Get Manifest ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_GET_MANIFEST, async () => {
    try {
      const manifest = manifestManager.get();
      const tokenUsage = contextManager.getTokenUsage();
      return { success: true, manifest, tokenUsage };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerWorkspaceHandlers };
