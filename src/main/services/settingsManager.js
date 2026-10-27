'use strict';

const path = require('path');
const { app } = require('electron');
const fse = require('fs-extra');
const { SettingsSchema, DEFAULT_SETTINGS } = require('../../shared/constants');
const logger = require('../utils/logger');

const SETTINGS_FILE = 'settings.json';

class SettingsManager {
  constructor() {
    this._settings = null;
    this._settingsPath = null;
  }

  _getSettingsPath() {
    if (!this._settingsPath) {
      const userDataDir = app.getPath('userData');
      this._settingsPath = path.join(userDataDir, SETTINGS_FILE);
    }
    return this._settingsPath;
  }

  async load() {
    const filePath = this._getSettingsPath();
    try {
      if (await fse.pathExists(filePath)) {
        const raw = await fse.readJson(filePath);
        const merged = { ...DEFAULT_SETTINGS, ...raw };
        const result = SettingsSchema.safeParse(merged);
        if (result.success) {
          this._settings = result.data;
        } else {
          logger.warn('Settings validation failed, using defaults', { errors: result.error.issues });
          this._settings = { ...DEFAULT_SETTINGS };
        }
      } else {
        this._settings = { ...DEFAULT_SETTINGS };
      }
    } catch (err) {
      logger.error('Failed to load settings', { error: err.message });
      this._settings = { ...DEFAULT_SETTINGS };
    }
    return this._settings;
  }

  get() {
    if (!this._settings) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...this._settings };
  }

  async save(partial) {
    const current = this.get();
    const merged = { ...current, ...partial };
    const result = SettingsSchema.safeParse(merged);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid settings: ${issues}`);
    }
    this._settings = result.data;
    const filePath = this._getSettingsPath();
    await fse.ensureDir(path.dirname(filePath));
    await fse.writeJson(filePath, result.data, { spaces: 2 });
    logger.info('Settings saved');
    return result.data;
  }

  async setLastWorkspace(workspacePath) {
    return this.save({ lastWorkspace: workspacePath });
  }

  async setActiveModel(modelId) {
    return this.save({ activeModel: modelId });
  }
}

const settingsManager = new SettingsManager();
module.exports = settingsManager;
