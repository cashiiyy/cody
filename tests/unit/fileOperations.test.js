'use strict';

const { FileOperationBatchSchema, FileActionSchema } = require('../../src/shared/constants');

describe('FileOperationBatchSchema', () => {
  test('accepts valid create_file batch', () => {
    const batch = {
      actions: [{ type: 'create_file', path: 'src/hello.js', content: 'console.log("hi")' }]
    };
    expect(FileOperationBatchSchema.safeParse(batch).success).toBe(true);
  });

  test('accepts multiple mixed actions', () => {
    const batch = {
      actions: [
        { type: 'create_file', path: 'src/index.js', content: '' },
        { type: 'edit_file',   path: 'src/utils.js', content: 'export default {}' },
        { type: 'read_file',   path: 'README.md' },
      ]
    };
    expect(FileOperationBatchSchema.safeParse(batch).success).toBe(true);
  });

  test('rejects empty actions array', () => {
    const result = FileOperationBatchSchema.safeParse({ actions: [] });
    expect(result.success).toBe(false);
  });

  test('rejects more than 50 actions', () => {
    const actions = Array(51).fill({ type: 'read_file', path: 'x.js' });
    const result = FileOperationBatchSchema.safeParse({ actions });
    expect(result.success).toBe(false);
  });

  test('rejects missing path', () => {
    const result = FileOperationBatchSchema.safeParse({ actions: [{ type: 'create_file', content: '' }] });
    expect(result.success).toBe(false);
  });

  test('rejects unknown action type', () => {
    const result = FileOperationBatchSchema.safeParse({ actions: [{ type: 'hack_system', path: 'x.js' }] });
    expect(result.success).toBe(false);
  });

  test('rejects missing path in read_file', () => {
    const result = FileOperationBatchSchema.safeParse({ actions: [{ type: 'read_file' }] });
    expect(result.success).toBe(false);
  });

  test('delete_file includes optional reason', () => {
    const batch = {
      actions: [{ type: 'delete_file', path: 'old.js', reason: 'Replaced by new.js' }]
    };
    expect(FileOperationBatchSchema.safeParse(batch).success).toBe(true);
  });
});

describe('FileActionSchema (individual)', () => {
  test('create_file requires path and content', () => {
    expect(FileActionSchema.safeParse({ type: 'create_file', path: 'x.js', content: '' }).success).toBe(true);
    expect(FileActionSchema.safeParse({ type: 'create_file', path: '', content: '' }).success).toBe(false);
  });

  test('edit_file requires path and content', () => {
    expect(FileActionSchema.safeParse({ type: 'edit_file', path: 'x.js', content: 'hello' }).success).toBe(true);
  });

  test('read_file only needs path', () => {
    expect(FileActionSchema.safeParse({ type: 'read_file', path: 'x.js' }).success).toBe(true);
  });
});
