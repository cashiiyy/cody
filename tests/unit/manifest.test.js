'use strict';

// Mock Electron app before any module is loaded
const os   = require('os');
const path = require('path');

const TEST_DIR = path.join(os.tmpdir(), 'cody-test-manifest-' + Date.now());

jest.mock('electron', () => ({
  app: {
    getPath: () => require('path').join(require('os').tmpdir(), 'cody-test-manifest'),
    getVersion: () => '0.1.0',
  },
}), { virtual: true });

const fse = require('fs-extra');
const { ManifestSchema, DEFAULT_MANIFEST } = require('../../src/shared/constants');

describe('ManifestSchema validation', () => {
  test('accepts valid minimal manifest', () => {
    const manifest = {
      ...DEFAULT_MANIFEST,
      projectName: 'TestProject',
      lastUpdated: new Date().toISOString(),
    };
    const result = ManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  test('rejects missing required fields', () => {
    const result = ManifestSchema.safeParse({ projectName: 'Bad' });
    expect(result.success).toBe(false);
  });

  test('rejects non-array techStack', () => {
    const manifest = {
      ...DEFAULT_MANIFEST,
      projectName: 'Test',
      lastUpdated: new Date().toISOString(),
      techStack: 'not-an-array',
    };
    const result = ManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  test('schemaVersion must be positive integer', () => {
    const manifest = { ...DEFAULT_MANIFEST, schemaVersion: -1, projectName: 'X', lastUpdated: new Date().toISOString() };
    const result = ManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  test('currentTask can be null or string', () => {
    const withNull = { ...DEFAULT_MANIFEST, projectName: 'X', lastUpdated: new Date().toISOString(), currentTask: null };
    const withStr  = { ...DEFAULT_MANIFEST, projectName: 'X', lastUpdated: new Date().toISOString(), currentTask: 'Fix bug' };
    expect(ManifestSchema.safeParse(withNull).success).toBe(true);
    expect(ManifestSchema.safeParse(withStr).success).toBe(true);
  });
});

describe('ManifestManager filesystem operations', () => {
  const WORKSPACE = path.join(os.tmpdir(), 'cody-mm-test-' + Date.now());

  beforeEach(async () => {
    await fse.ensureDir(WORKSPACE);
  });

  afterEach(async () => {
    await fse.remove(WORKSPACE);
  });

  function getManager() {
    // Fresh module instance per test
    const mm = require('../../src/main/services/manifestManager');
    mm.setWorkspace(WORKSPACE);
    return mm;
  }

  test('init creates manifest file', async () => {
    const mm = getManager();
    const manifest = await mm.init('TestProject');
    expect(manifest.projectName).toBe('TestProject');
    expect(manifest.schemaVersion).toBe(1);
    const manifestPath = path.join(WORKSPACE, '.cody', 'project_manifest.json');
    expect(await fse.pathExists(manifestPath)).toBe(true);
  });

  test('update modifies and persists', async () => {
    const mm = getManager();
    await mm.init('Proj');
    const updated = await mm.update({ architectureSummary: 'React SPA' });
    expect(updated.architectureSummary).toBe('React SPA');

    // Re-read to verify persistence
    const raw = await fse.readJson(path.join(WORKSPACE, '.cody', 'project_manifest.json'));
    expect(raw.architectureSummary).toBe('React SPA');
  });

  test('recovers from corrupt manifest', async () => {
    await fse.ensureDir(path.join(WORKSPACE, '.cody'));
    await fse.writeFile(path.join(WORKSPACE, '.cody', 'project_manifest.json'), 'NOT_VALID_JSON{{{{');
    const mm = getManager();
    const manifest = await mm.load();
    expect(manifest).toBeTruthy();
    expect(manifest.schemaVersion).toBe(1);
  }, 15000);

  test('load returns existing valid manifest', async () => {
    const mm = getManager();
    await mm.init('MyProject');
    const loaded = await mm.load();
    expect(loaded.projectName).toBe('MyProject');
  });

  test('addCompletedTask appends task', async () => {
    const mm = getManager();
    await mm.init('TaskTest');
    await mm.addCompletedTask('Created login page');
    const manifest = mm.get();
    expect(manifest.completedTasks).toContain('Created login page');
  });
});
