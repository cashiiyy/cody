'use strict';

// ─── Path Security Tests ──────────────────────────────────────────────────────
const { resolveAndValidate, validateRelativePath, validateFilename } = require('../../src/main/utils/pathSecurity');
const path = require('path');

const WORKSPACE = 'C:\\Projects\\MyApp';
const WORKSPACE_POSIX = '/home/user/projects/myapp';

describe('pathSecurity.resolveAndValidate', () => {
  const root = path.resolve(WORKSPACE_POSIX.replace(/\//g, path.sep === '\\' ? '\\' : '/'));

  test('accepts valid relative path', () => {
    const abs = resolveAndValidate(root, 'src/index.js');
    expect(abs).toContain('src');
    expect(abs).toContain('index.js');
  });

  test('accepts nested path', () => {
    const abs = resolveAndValidate(root, 'src/components/Header.js');
    expect(abs.startsWith(root)).toBe(true);
  });

  test('rejects absolute path', () => {
    expect(() => resolveAndValidate(root, '/etc/passwd')).toThrow('Absolute paths are not allowed');
    expect(() => resolveAndValidate(root, 'C:\\Windows\\System32')).toThrow();
  });

  test('rejects parent traversal ../', () => {
    expect(() => resolveAndValidate(root, '../outside.txt')).toThrow();
  });

  test('rejects nested traversal', () => {
    expect(() => resolveAndValidate(root, 'src/../../outside.txt')).toThrow();
  });

  test('rejects empty path', () => {
    expect(() => resolveAndValidate(root, '')).toThrow();
  });

  test('rejects null path', () => {
    expect(() => resolveAndValidate(root, null)).toThrow();
  });

  test('rejects no workspace', () => {
    expect(() => resolveAndValidate(null, 'src/index.js')).toThrow('No workspace root set');
  });
});

describe('pathSecurity.validateRelativePath', () => {
  test('accepts simple filename', () => {
    expect(() => validateRelativePath('index.js')).not.toThrow();
  });

  test('accepts nested path', () => {
    expect(() => validateRelativePath('src/components/App.tsx')).not.toThrow();
  });

  test('rejects absolute path', () => {
    expect(() => validateRelativePath('/etc/passwd')).toThrow('Absolute paths are not allowed');
  });

  test('rejects traversal', () => {
    expect(() => validateRelativePath('../evil.js')).toThrow('Path traversal rejected');
  });

  test('rejects empty', () => {
    expect(() => validateRelativePath('')).toThrow();
  });
  test('rejects drive-relative path', () => {
    expect(() => validateRelativePath('C:evil.txt')).toThrow('Colon in relative path rejected');
  });

  test('rejects NTFS alternate data streams', () => {
    expect(() => validateRelativePath('file.txt:stream')).toThrow('Colon in relative path rejected');
  });

  test('rejects null byte in path', () => {
    expect(() => validateRelativePath('file\0.txt')).toThrow('null byte');
  });
});

describe('pathSecurity.validateFilename', () => {
  test('accepts normal filename', () => {
    expect(() => validateFilename('index.js')).not.toThrow();
  });

  test('rejects Windows reserved name CON', () => {
    expect(() => validateFilename('CON')).toThrow('Reserved filename');
  });

  test('rejects Windows reserved name NUL.txt', () => {
    expect(() => validateFilename('NUL.txt')).toThrow('Reserved filename');
  });

  test('rejects invalid Windows characters', () => {
    expect(() => validateFilename('bad:name.js')).toThrow('Invalid characters');
    expect(() => validateFilename('bad<name>.js')).toThrow('Invalid characters');
    expect(() => validateFilename('bad*name.js')).toThrow('Invalid characters');
    expect(() => validateFilename('bad?name.js')).toThrow('Invalid characters');
    expect(() => validateFilename('bad|name.js')).toThrow('Invalid characters');
  });

  test('rejects trailing dot or space', () => {
    expect(() => validateFilename('name.')).toThrow('cannot end with dot or space');
    expect(() => validateFilename('name ')).toThrow('cannot end with dot or space');
  });

  test('rejects null byte', () => {
    expect(() => validateFilename('file\0.js')).toThrow('null byte');
  });

  test('rejects empty', () => {
    expect(() => validateFilename('')).toThrow();
  });
});
