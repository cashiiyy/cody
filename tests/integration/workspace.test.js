'use strict';

const path = require('path');
const os   = require('os');
const fse  = require('fs-extra');

jest.mock('electron', () => ({
  app: {
    getPath: () => path.join(require('os').tmpdir(), 'cody-settings-test'),
    getVersion: () => '0.1.0',
  },
}), { virtual: true });

describe('WorkspaceManager integration', () => {
  const TEST_WORKSPACE = path.join(os.tmpdir(), 'cody-ws-int-' + Date.now());

  beforeEach(async () => {
    await fse.ensureDir(TEST_WORKSPACE);
    await fse.writeFile(path.join(TEST_WORKSPACE, 'package.json'), '{"name":"test","version":"1.0.0"}');
    await fse.ensureDir(path.join(TEST_WORKSPACE, 'src'));
    await fse.writeFile(path.join(TEST_WORKSPACE, 'src', 'index.js'), 'console.log("hello");');
    await fse.writeFile(path.join(TEST_WORKSPACE, 'src', 'utils.js'), 'module.exports = {};');
    await fse.writeFile(path.join(TEST_WORKSPACE, 'README.md'), '# Test Project');
    await fse.ensureDir(path.join(TEST_WORKSPACE, 'node_modules', 'some-lib'));
    await fse.writeFile(path.join(TEST_WORKSPACE, 'node_modules', 'some-lib', 'index.js'), '');
    await fse.writeFile(path.join(TEST_WORKSPACE, '.env'), 'SECRET=abc123');
  });

  afterEach(async () => {
    await fse.remove(TEST_WORKSPACE);
  });

  function getWorkspaceManager() {
    return require('../../src/main/services/workspaceManager');
  }

  test('setWorkspace resolves absolute path', async () => {
    const wm = getWorkspaceManager();
    const root = await wm.setWorkspace(TEST_WORKSPACE);
    expect(root).toBe(path.resolve(TEST_WORKSPACE));
  });

  test('buildIndex excludes node_modules', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const index = await wm.buildIndex();
    expect(index.some(e => e.path.includes('node_modules'))).toBe(false);
  });

  test('buildIndex includes src/index.js', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const index = await wm.buildIndex();
    expect(index.some(e => e.path.includes('index.js'))).toBe(true);
  });

  test('buildIndex marks .env as sensitive', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const index = await wm.buildIndex();
    const envEntries = index.filter(e => e.path.endsWith('.env'));
    for (const e of envEntries) {
      expect(e.sensitive).toBe(true);
    }
  });

  test('readFile reads text file content', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    await wm.buildIndex();
    const content = await wm.readFile('src/index.js');
    expect(content).toContain('console.log');
  });

  test('readFile rejects traversal attack', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    await expect(wm.readFile('../outside.txt')).rejects.toThrow();
  });

  test('readFile rejects sensitive .env', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    await expect(wm.readFile('.env')).rejects.toThrow('sensitive');
  });

  test('fileExists returns true for existing file', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const exists = await wm.fileExists('src/index.js');
    expect(exists).toBe(true);
  });

  test('fileExists returns false for non-existent file', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const exists = await wm.fileExists('nonexistent.js');
    expect(exists).toBe(false);
  });

  test('getFileTree returns nested structure with src directory', async () => {
    const wm = getWorkspaceManager();
    await wm.setWorkspace(TEST_WORKSPACE);
    const tree = await wm.getFileTree();
    expect(tree).toBeTruthy();
    expect(Array.isArray(tree.children)).toBe(true);
    const srcNode = tree.children.find(c => c.name === 'src');
    expect(srcNode).toBeTruthy();
    expect(srcNode.type).toBe('directory');
  });
});

describe('FileOperationService integration', () => {
  const TEST_WORKSPACE_FOS = path.join(os.tmpdir(), 'cody-fos-int-' + Date.now());

  beforeEach(async () => {
    await fse.ensureDir(TEST_WORKSPACE_FOS);
    await fse.writeFile(path.join(TEST_WORKSPACE_FOS, 'existing.js'), 'const a = 1;');
  });

  afterEach(async () => {
    await fse.remove(TEST_WORKSPACE_FOS);
  });

  test('creates new file atomically', async () => {
    const wm = getWM();
    await wm.setWorkspace(TEST_WORKSPACE_FOS);
    const fos = require('../../src/main/services/fileOperationService');

    const result = await fos.applyAction({ type: 'create_file', path: 'src/newfile.js', content: 'const x = 1;' });
    expect(result.success).toBe(true);

    const written = await fse.readFile(path.join(TEST_WORKSPACE_FOS, 'src', 'newfile.js'), 'utf8');
    expect(written).toBe('const x = 1;');
  });

  test('rejects path traversal in file create', async () => {
    const wm = getWM();
    await wm.setWorkspace(TEST_WORKSPACE_FOS);
    const fos = require('../../src/main/services/fileOperationService');

    await expect(fos.applyAction({ type: 'create_file', path: '../evil.js', content: 'bad' })).rejects.toThrow();
  });

  test('reads existing file via read_file action', async () => {
    const wm = getWM();
    await wm.setWorkspace(TEST_WORKSPACE_FOS);
    const fos = require('../../src/main/services/fileOperationService');

    const result = await fos.applyAction({ type: 'read_file', path: 'existing.js' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('const a');
  });

  function getWM() {
    return require('../../src/main/services/workspaceManager');
  }
});
