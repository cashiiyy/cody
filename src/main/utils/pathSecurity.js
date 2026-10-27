'use strict';

const path = require('path');
const os = require('os');

/**
 * Resolve and validate a file path is safely within the workspace root.
 * Rejects: absolute paths, traversal (../), paths outside workspace.
 * Returns the resolved absolute path on success.
 * Throws on violation.
 */
function resolveAndValidate(workspaceRoot, relativePath) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('No workspace root set');
  }
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // Reject absolute paths
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: "${relativePath}"`);
  }

  // Normalize and resolve
  const normalized = path.normalize(relativePath);

  // Reject any remaining traversal after normalize
  if (normalized.startsWith('..') || normalized.includes('\\..') || normalized.includes('/..')) {
    throw new Error(`Path traversal rejected: "${relativePath}"`);
  }

  const resolved = path.resolve(workspaceRoot, normalized);
  const resolvedRoot = path.resolve(workspaceRoot);

  // Ensure resolved path is inside workspace (handles symlinks at resolve level)
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(`Path escapes workspace: "${relativePath}" → "${resolved}"`);
  }

  // Reject Windows device paths
  if (/^\\\\[.?]/.test(resolved)) {
    throw new Error(`Device path rejected: "${resolved}"`);
  }

  return resolved;
}

/**
 * Validate just the relative path component (no workspace needed).
 * Used for early rejection before workspace is known.
 */
function validateRelativePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute paths are not allowed: "${relativePath}"`);
  }
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..') || normalized.includes('\\..')) {
    throw new Error(`Path traversal rejected: "${relativePath}"`);
  }
  // Reject empty segments that could cause issues
  const parts = normalized.split(path.sep);
  for (const part of parts) {
    if (part === '' && parts.length > 1) continue; // leading/trailing ok after normalize
    if (part === '..') throw new Error(`Path traversal rejected: "${relativePath}"`);
  }
  return normalized;
}

/**
 * Check if a filename is valid (no special chars that cause FS issues on Windows).
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }
  // Windows reserved names
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  const basename = path.basename(filename);
  if (reserved.test(basename)) {
    throw new Error(`Reserved filename on Windows: "${basename}"`);
  }
  // Reject null bytes
  if (filename.includes('\0')) {
    throw new Error('Filename contains null byte');
  }
  return true;
}

/**
 * Normalise a Windows absolute path for consistent display.
 */
function normalizePlatformPath(p) {
  if (typeof p !== 'string') return p;
  // Convert backslashes to forward slashes for display
  return p.replace(/\\/g, '/');
}

module.exports = {
  resolveAndValidate,
  validateRelativePath,
  validateFilename,
  normalizePlatformPath,
};
