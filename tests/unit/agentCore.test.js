'use strict';

// Mock electron app before modules load
jest.mock('electron', () => ({
  app: {
    getPath: () => require('path').join(require('os').tmpdir(), 'cody-agent-test'),
    getVersion: () => '0.1.0',
  },
}), { virtual: true });

const agentCore = require('../../src/main/services/agentCore');
const llmClient = require('../../src/main/services/llmClient');

describe('agentCore._parseActions', () => {
  test('parses fenced json actions block', () => {
    const text = 'I propose the following changes:\n```json\n{"actions":[{"type":"create_file","path":"src/test.js","content":"console.log(1);"}]}\n```';
    const actions = agentCore._parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('create_file');
    expect(actions[0].path).toBe('src/test.js');
  });

  test('parses unfenced / untyped markdown code block', () => {
    const text = 'Here is the plan:\n```\n{"actions":[{"type":"edit_file","path":"README.md","content":"# Updated"}]}\n```';
    const actions = agentCore._parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('edit_file');
    expect(actions[0].path).toBe('README.md');
  });

  test('parses raw JSON object without code fences', () => {
    const text = 'Sure, applying:\n{"actions":[{"type":"delete_file","path":"temp.txt"}]}\nDone!';
    const actions = agentCore._parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('delete_file');
    expect(actions[0].path).toBe('temp.txt');
  });

  test('returns empty array when no valid actions found', () => {
    const text = 'Just conversational text without any action block.';
    const actions = agentCore._parseActions(text);
    expect(actions).toEqual([]);
  });

  test('handles malformed JSON gracefully without throwing', () => {
    const text = '```json\n{"actions": [not valid json\n```';
    const actions = agentCore._parseActions(text);
    expect(actions).toEqual([]);
  });
});

describe('agentCore lifecycle & cancellation', () => {
  beforeEach(() => {
    agentCore._activeTask = null;
    agentCore._cancelFn = null;
  });

  test('isActive is false when idle', () => {
    expect(agentCore.isActive).toBe(false);
  });

  test('cancelTask cancels active task cleanly', () => {
    // Start task mock
    agentCore._activeTask = {
      taskId: 'test-123',
      phase: 'generating',
      userRequest: 'do something',
      proposedActions: [],
      appliedResults: [],
    };
    expect(agentCore.isActive).toBe(true);

    const cancelled = agentCore.cancelTask('test-123');
    expect(cancelled).toBe(true);
    expect(agentCore.isActive).toBe(false);
    expect(agentCore._activeTask).toBeNull();
  });

  test('cancelTask delegates to llmClient.cancelRequest', () => {
    const spy = jest.spyOn(llmClient, 'cancelRequest').mockReturnValue(true);
    agentCore._activeTask = { taskId: 'task-456', phase: 'generating' };

    agentCore.cancelTask('task-456');
    expect(spy).toHaveBeenCalledWith('task-456');
    spy.mockRestore();
  });
});
