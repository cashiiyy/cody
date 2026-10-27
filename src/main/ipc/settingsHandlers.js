'use strict';

const { ipcMain } = require('electron');
const { IPC_EVENTS } = require('../../shared/constants');
const settingsManager = require('../services/settingsManager');
const llmClient = require('../services/llmClient');
const logger = require('../utils/logger');

function registerSettingsHandlers() {
  // ─── Get Settings ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_GET_SETTINGS, async () => {
    try {
      const settings = settingsManager.get();
      return { success: true, settings };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Save Settings ────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_SAVE_SETTINGS, async (event, partial) => {
    try {
      if (!partial || typeof partial !== 'object') {
        return { success: false, error: 'Invalid settings payload' };
      }
      const settings = await settingsManager.save(partial);
      return { success: true, settings };
    } catch (err) {
      logger.error('Save settings error', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ─── Test Connection ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_TEST_CONNECTION, async () => {
    try {
      const result = await llmClient.testConnection();
      return { success: true, ...result };
    } catch (err) {
      return { success: false, connected: false, error: err.message };
    }
  });

  // ─── List Models ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_LIST_MODELS, async () => {
    try {
      const models = await llmClient.listModels();
      return { success: true, models };
    } catch (err) {
      return { success: false, error: err.message, models: [] };
    }
  });
}

module.exports = { registerSettingsHandlers };
