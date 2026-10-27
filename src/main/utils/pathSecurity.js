'use strict';

const path = require('path');

// Windows invalid filename characters: < > : " / \ | ? * and ASCII 0-31
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/**
 * Check if a single filename/basename is valid on Windows.
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }
  if (filename.includes('\0')) {
    throw new Error('Filename contains null byte');
  }
  const basename = path.basename(filename);
  if (WINDOWS_RESERVED.test(basename)) {
    throw new Error(`Reserved filename on Windows: "${basename}"`);
  }
  if (INVALID_FILENAME_CHARS.test(basename)) {
    throw new Error(`Invalid characters in filename: "${basename}"`);
  }
  if (basename.endsWith('.') || basename.endsWith(' ')) {
    throw new Error(`Filename cannot end with dot or space: "${basename}"`);
  }
  return true;
}

/**
 * Validate just the relative path component (no workspace needed).
 * Used for early rejection before workspace is known.
 */
function validateRelativePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }
  if (relativePath.includes('\0')) {
    throw new Error('Path contains null byte');
  }
  // Colons are never valid in workspace-relative paths on Windows (blocks drive letters and ADS)
  if (relativePath.includes(':')) {
    throw new Error(`Colon in relative path rejected: "${relativePath}"`);
  }
  // Reject leading slash or backslash (UNC or root paths)
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    throw new Error(`Absolute paths are not allowed: "${relativePath}"`);
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: "${relativePath}"`);
  }

  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || normalized.includes('\\..') || normalized.includes('/..')) {
    throw new Error(`Path traversal rejected: "${relativePath}"`);
  }

  const parts = normalized.split(/[\\/]/);
  for (const part of parts) {
    if (part === '..') {
      throw new Error(`Path traversal rejected: "${relativePath}"`);
    }
  }

  return normalized;
}

/**
 * Resolve and validate a file path is safely within the workspace root.
 * Rejects: absolute paths, traversal (../), paths outside workspace, device paths.
 * Returns the resolved absolute path on success.
 * Throws on violation.
 */
function resolveAndValidate(workspaceRoot, relativePath) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('No workspace root set');
  }
  validateRelativePath(relativePath);

  const normalized = path.normalize(relativePath);
  const resolved = path.resolve(workspaceRoot, normalized);
  const resolvedRoot = path.resolve(workspaceRoot);

  // Case-insensitive comparison on Windows
  const isWindows = process.platform === 'win32';
  const checkResolved = isWindows ? resolved.toLowerCase() : resolved;
  const checkRoot = isWindows ? resolvedRoot.toLowerCase() : resolvedRoot;
  const prefix = checkRoot.endsWith(path.sep) ? checkRoot : checkRoot + path.sep;

  if (!checkResolved.startsWith(prefix) && checkResolved !== checkRoot) {
    throw new Error(`Path escapes workspace: "${relativePath}" → "${resolved}"`);
  }

  // Reject Windows device paths
  if (/^\\\\[.?]/.test(resolved)) {
    throw new Error(`Device path rejected: "${resolved}"`);
  }

  return resolved;
}

/**
 * Normalise a path for consistent display.
 */
function normalizePlatformPath(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/\\/g, '/');
}

module.exports = {
  resolveAndValidate,
  validateRelativePath,
  validateFilename,
  normalizePlatformPath,
};
