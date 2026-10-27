'use strict';

const path = require('path');
const fse = require('fs-extra');
const {
  EXT_TO_LANGUAGE,
  MAX_INDEXABLE_FILE_SIZE,
  MAX_READABLE_FILE_SIZE,
  BINARY_EXTENSIONS,
  DEFAULT_SETTINGS,
} = require('../../shared/constants');
const { resolveAndValidate } = require('../utils/pathSecurity');
const logger = require('../utils/logger');
const settingsManager = require('./settingsManager');

const DEFAULT_EXCLUSIONS = [
  'node_modules', '.git', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit',
  '.cache', 'coverage', '.nyc_output', 'tmp', 'temp',
  '.DS_Store', 'Thumbs.db',
];

const SENSITIVE_PATTERNS = [
  /\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /\.secrets?$/i,
  /credentials?\.json$/i,
  /auth\.json$/i,
];

class WorkspaceManager {
  constructor() {
    this._root = null;
    this._index = [];
  }

  get root() { return this._root; }
  get index() { return [...this._index]; }

  async setWorkspace(dirPath) {
    const abs = path.resolve(dirPath);
    const stat = await fse.stat(abs);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: "${abs}"`);
    }
    this._root = abs;
    this._index = [];
    logger.info('Workspace set', { root: abs });
    return abs;
  }

  _getExclusions() {
    const settings = settingsManager.get();
    const extra = (settings.indexExclusions || []).flatMap(e => [e]);
    return [...new Set([...DEFAULT_EXCLUSIONS, ...extra])];
  }

  _isSensitive(relPath) {
    return SENSITIVE_PATTERNS.some(p => p.test(relPath));
  }

  _shouldExcludeName(name, exclusions) {
    return exclusions.some(ex => {
      if (ex.startsWith('*')) {
        return name.endsWith(ex.slice(1));
      }
      return name === ex;
    });
  }

  _detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_TO_LANGUAGE[ext] || null;
  }

  async buildIndex() {
    if (!this._root) throw new Error('No workspace selected');
    const exclusions = this._getExclusions();
    const entries = [];

    const scan = async (dir, relBase) => {
      let items;
      try {
        items = await fse.readdir(dir, { withFileTypes: true });
      } catch (err) {
        logger.warn('Cannot read directory', { dir, error: err.message });
        return;
      }

      for (const item of items) {
        const relPath = relBase ? `${relBase}/${item.name}` : item.name;

        if (this._shouldExcludeName(item.name, exclusions)) continue;

        if (item.isSymbolicLink()) continue; // skip symlinks for safety

        if (item.isDirectory()) {
          entries.push({ path: relPath, type: 'directory' });
          await scan(path.join(dir, item.name), relPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;

          let stat;
          try {
            stat = await fse.stat(path.join(dir, item.name));
          } catch { continue; }

          if (stat.size > MAX_INDEXABLE_FILE_SIZE) continue;

          const entry = {
            path: relPath,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
            language: this._detectLanguage(item.name),
            sensitive: this._isSensitive(relPath),
          };
          entries.push(entry);
        }
      }
    };

    await scan(this._root, '');
    this._index = entries;
    logger.info('Workspace indexed', { files: entries.filter(e => e.type === 'file').length });
    return entries;
  }

  /**
   * Return nested file-tree structure for the renderer.
   */
  async getFileTree() {
    if (!this._root) throw new Error('No workspace selected');
    if (this._index.length === 0) {
      await this.buildIndex();
    }
    return this._buildTree(this._index);
  }

  _buildTree(flatIndex) {
    const root = { name: path.basename(this._root), children: [] };
    const nodeMap = { '': root };

    // Sort: directories first, then files
    const sorted = [...flatIndex].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    for (const entry of sorted) {
      const parts = entry.path.split('/');
      const name = parts[parts.length - 1];
      const parentKey = parts.slice(0, -1).join('/');
      const parent = nodeMap[parentKey];
      if (!parent) continue;

      const node = {
        name,
        path: entry.path,
        type: entry.type,
        ...(entry.type === 'file' ? {
          size: entry.size,
          language: entry.language,
          sensitive: entry.sensitive,
        } : { children: [] }),
      };
      parent.children.push(node);
      if (entry.type === 'directory') {
        nodeMap[entry.path] = node;
      }
    }
    return root;
  }

  async readFile(relPath) {
    if (!this._root) throw new Error('No workspace selected');
    const abs = resolveAndValidate(this._root, relPath);

    const stat = await fse.stat(abs);
    if (!stat.isFile()) throw new Error(`Not a file: "${relPath}"`);
    if (stat.size > MAX_READABLE_FILE_SIZE) {
      throw new Error(`File too large to read (${(stat.size / 1024).toFixed(0)} KB): "${relPath}"`);
    }

    // Check sensitive
    if (this._isSensitive(relPath)) {
      throw new Error(`Refusing to read sensitive file: "${relPath}"`);
    }

    return fse.readFile(abs, 'utf8');
  }

  async fileExists(relPath) {
    if (!this._root) return false;
    try {
      const abs = resolveAndValidate(this._root, relPath);
      return fse.pathExists(abs);
    } catch {
      return false;
    }
  }

  /**
   * Get relevant files for a context query (simple relevance by name/extension).
   */
  getRelevantFiles(query, maxFiles = 10) {
    if (!query) return this._index.filter(e => e.type === 'file').slice(0, maxFiles);
    const terms = query.toLowerCase().split(/\s+/);
    const scored = this._index
      .filter(e => e.type === 'file')
      .map(e => {
        let score = 0;
        for (const term of terms) {
          if (e.path.toLowerCase().includes(term)) score += 2;
          if (e.language && e.language.includes(term)) score += 1;
        }
        return { entry: e, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles)
      .map(s => s.entry);
    return scored;
  }
}

const workspaceManager = new WorkspaceManager();
module.exports = workspaceManager;
