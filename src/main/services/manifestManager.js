'use strict';

const path = require('path');
const fse = require('fs-extra');
const {
  ManifestSchema,
  DEFAULT_MANIFEST,
  CODY_DIR,
  MANIFEST_FILENAME,
} = require('../../shared/constants');
const logger = require('../utils/logger');

class ManifestManager {
  constructor() {
    this._manifest = null;
    this._workspaceRoot = null;
  }

  _manifestPath() {
    if (!this._workspaceRoot) throw new Error('No workspace root set');
    return path.join(this._workspaceRoot, CODY_DIR, MANIFEST_FILENAME);
  }

  _backupPath() {
    if (!this._workspaceRoot) throw new Error('No workspace root set');
    return path.join(this._workspaceRoot, CODY_DIR, `${MANIFEST_FILENAME}.bak`);
  }

  setWorkspace(root) {
    this._workspaceRoot = root;
    this._manifest = null;
  }

  async init(projectName, forceNew = false) {
    await fse.ensureDir(path.join(this._workspaceRoot, CODY_DIR));
    const manifestPath = this._manifestPath();

    if (!forceNew && (await fse.pathExists(manifestPath))) {
      return this.load();
    }

    const manifest = {
      ...DEFAULT_MANIFEST,
      projectName: projectName || path.basename(this._workspaceRoot),
      lastUpdated: new Date().toISOString(),
    };
    this._manifest = manifest;
    await this._write(manifest);
    logger.info('Manifest initialized', { projectName: manifest.projectName });
    return manifest;
  }

  async load() {
    const manifestPath = this._manifestPath();
    if (!(await fse.pathExists(manifestPath))) {
      return this.init();
    }
    try {
      const raw = await fse.readJson(manifestPath);
      const result = ManifestSchema.safeParse(raw);
      if (result.success) {
        this._manifest = result.data;
        return this._manifest;
      }
      logger.warn('Manifest validation failed, attempting recovery', {
        errors: result.error.issues.map(i => i.message),
      });
      return this._recover(raw);
    } catch (err) {
      logger.error('Manifest read error, recovering', { error: err.message });
      return this._recoverFromBackup();
    }
  }

  async _recover(raw) {
    // Merge whatever we can from corrupt manifest with defaults
    const manifest = {
      ...DEFAULT_MANIFEST,
      ...raw,
      schemaVersion: 1,
      lastUpdated: new Date().toISOString(),
      // Ensure arrays are arrays
      techStack: Array.isArray(raw.techStack) ? raw.techStack : [],
      fileTree: Array.isArray(raw.fileTree) ? raw.fileTree : [],
      importantFiles: Array.isArray(raw.importantFiles) ? raw.importantFiles : [],
      decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
      completedTasks: Array.isArray(raw.completedTasks) ? raw.completedTasks : [],
      pendingTasks: Array.isArray(raw.pendingTasks) ? raw.pendingTasks : [],
      knownIssues: Array.isArray(raw.knownIssues) ? raw.knownIssues : [],
      unresolvedQuestions: Array.isArray(raw.unresolvedQuestions) ? raw.unresolvedQuestions : [],
    };
    const result = ManifestSchema.safeParse(manifest);
    if (result.success) {
      this._manifest = result.data;
      await this._write(result.data);
      return this._manifest;
    }
    // Last resort: fresh manifest
    return this.init(null, true);
  }

  async _recoverFromBackup() {
    const backupPath = this._backupPath();
    if (await fse.pathExists(backupPath)) {
      try {
        const raw = await fse.readJson(backupPath);
        logger.info('Recovered manifest from backup');
        return this._recover(raw);
      } catch {
        logger.error('Backup manifest also corrupt');
      }
    }
    return this.init(null, true);
  }

  get() {
    return this._manifest ? { ...this._manifest } : null;
  }

  async update(partial) {
    if (!this._manifest) await this.load();
    const updated = {
      ...this._manifest,
      ...partial,
      lastUpdated: new Date().toISOString(),
    };
    const result = ManifestSchema.safeParse(updated);
    if (!result.success) {
      throw new Error(`Manifest update invalid: ${result.error.issues.map(i => i.message).join('; ')}`);
    }
    this._manifest = result.data;
    await this._write(result.data);
    return result.data;
  }

  async addCompletedTask(taskDescription) {
    if (!this._manifest) await this.load();
    const tasks = [...(this._manifest.completedTasks || []), taskDescription];
    return this.update({ completedTasks: tasks.slice(-50) }); // keep last 50
  }

  async setCurrentTask(task) {
    return this.update({ currentTask: task });
  }

  async updateFileTree(flatIndex) {
    const tree = flatIndex.map(e => ({
      path: e.path,
      type: e.type,
      ...(e.size !== undefined ? { size: e.size } : {}),
      ...(e.modified ? { modified: e.modified } : {}),
      ...(e.language ? { language: e.language } : {}),
    }));
    return this.update({ fileTree: tree });
  }

  async _write(manifest) {
    const manifestPath = this._manifestPath();
    const backupPath = this._backupPath();
    const tmpPath = manifestPath + '.tmp';

    // Backup existing
    if (await fse.pathExists(manifestPath)) {
      try {
        await fse.copy(manifestPath, backupPath, { overwrite: true });
      } catch (err) {
        logger.warn('Could not create manifest backup', { error: err.message });
      }
    }

    // Atomic write via temp file
    await fse.ensureDir(path.dirname(manifestPath));
    await fse.writeJson(tmpPath, manifest, { spaces: 2 });
    await fse.move(tmpPath, manifestPath, { overwrite: true });
    logger.debug('Manifest written');
  }
}

const manifestManager = new ManifestManager();
module.exports = manifestManager;
