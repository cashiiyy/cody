'use strict';

const path = require('path');
const fse = require('fs-extra');
const crypto = require('crypto');
const {
  FileOperationBatchSchema,
  MAX_FILE_SIZE_WRITE,
} = require('../../shared/constants');
const { resolveAndValidate, validateFilename } = require('../utils/pathSecurity');
const logger = require('../utils/logger');
const workspaceManager = require('./workspaceManager');

class FileOperationService {
  constructor() {
    this._pendingOps = new Map(); // requestId → operations
  }

  /**
   * Validate a batch of file operations. Returns array of errors (empty = valid).
   */
  validateBatch(batch) {
    const result = FileOperationBatchSchema.safeParse(batch);
    if (!result.success) {
      return result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    }
    const root = workspaceManager.root;
    const errors = [];
    for (const action of result.data.actions) {
      try {
        resolveAndValidate(root, action.path);
        validateFilename(path.basename(action.path));
      } catch (err) {
        errors.push(`[${action.type}] "${action.path}": ${err.message}`);
      }
      if (action.content && Buffer.byteLength(action.content, 'utf8') > MAX_FILE_SIZE_WRITE) {
        errors.push(`[${action.type}] "${action.path}": Content exceeds size limit`);
      }
    }
    return errors;
  }

  /**
   * Check if any action would overwrite an existing file.
   */
  async checkConflicts(actions) {
    const root = workspaceManager.root;
    const conflicts = [];
    for (const action of actions) {
      if (action.type !== 'create_file' && action.type !== 'edit_file') continue;
      try {
        const abs = resolveAndValidate(root, action.path);
        const exists = await fse.pathExists(abs);
        if (exists) {
          const stat = await fse.stat(abs);
          const existing = stat.size > 0 ? await fse.readFile(abs, 'utf8').catch(() => '') : '';
          conflicts.push({
            path: action.path,
            type: action.type,
            existingSize: stat.size,
            diff: this._simpleDiff(existing, action.content || ''),
          });
        }
      } catch { /* skip paths that can't be resolved */ }
    }
    return conflicts;
  }

  /**
   * Produce a simple line-level diff for display.
   */
  _simpleDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff = [];

    // Simple non-LCS diff for display purposes
    let removed = 0, added = 0;
    for (let i = 0; i < oldLines.length; i++) {
      if (!newLines.includes(oldLines[i])) {
        diff.push(`- ${oldLines[i]}`);
        removed++;
      }
    }
    for (let i = 0; i < newLines.length; i++) {
      if (!oldLines.includes(newLines[i])) {
        diff.push(`+ ${newLines[i]}`);
        added++;
      }
    }
    return {
      summary: `${removed} line(s) removed, ${added} line(s) added`,
      patch: diff.slice(0, 100).join('\n'), // limit display
    };
  }

  /**
   * Apply a single validated action to the filesystem.
   * Uses atomic write (temp → rename).
   */
  async applyAction(action) {
    const root = workspaceManager.root;
    const abs = resolveAndValidate(root, action.path);

    if (action.type === 'read_file') {
      const content = await workspaceManager.readFile(action.path);
      return { success: true, type: 'read_file', path: action.path, content };
    }

    if (action.type === 'delete_file') {
      if (!(await fse.pathExists(abs))) {
        return { success: false, error: `File not found: "${action.path}"` };
      }
      await fse.remove(abs);
      return { success: true, type: 'delete_file', path: action.path };
    }

    if (action.type === 'create_file' || action.type === 'edit_file') {
      const content = action.content || '';
      const dir = path.dirname(abs);
      const tmpPath = abs + `.cody_tmp_${crypto.randomBytes(4).toString('hex')}`;

      await fse.ensureDir(dir);
      try {
        await fse.writeFile(tmpPath, content, 'utf8');

        // Verify what we wrote
        const written = await fse.readFile(tmpPath, 'utf8');
        if (written !== content) {
          throw new Error(`Write verification failed for "${action.path}"`);
        }

        await fse.move(tmpPath, abs, { overwrite: true });
        return { success: true, type: action.type, path: action.path, bytesWritten: Buffer.byteLength(content, 'utf8') };
      } catch (err) {
        await fse.remove(tmpPath).catch(() => {});
        throw err;
      }
    }

    throw new Error(`Unknown action type: "${action.type}"`);
  }

  /**
   * Apply all actions in a batch. Stops on first error, does not rollback already applied.
   * Returns results array.
   */
  async applyBatch(actions) {
    const results = [];
    for (const action of actions) {
      try {
        const result = await this.applyAction(action);
        results.push({ action, ...result });
        logger.info('File operation applied', { type: action.type, path: action.path });
      } catch (err) {
        logger.error('File operation failed', { action, error: err.message });
        results.push({ action, success: false, error: err.message });
        break; // stop on first failure
      }
    }
    return results;
  }
}

const fileOperationService = new FileOperationService();
module.exports = fileOperationService;
