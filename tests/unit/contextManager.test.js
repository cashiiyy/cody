'use strict';

// Mock electron app before modules load
jest.mock('electron', () => ({
  app: {
    getPath: () => require('path').join(require('os').tmpdir(), 'cody-ctx-test'),
    getVersion: () => '0.1.0',
  },
}), { virtual: true });

const contextManager = require('../../src/main/services/contextManager');
const settingsManager = require('../../src/main/services/settingsManager');

describe('contextManager', () => {
  beforeEach(() => {
    contextManager.clearHistory();
  });

  test('adds and retrieves user and assistant messages', () => {
    contextManager.addUserMessage('hello');
    contextManager.addAssistantMessage('world');
    const messages = contextManager.getMessages();
    expect(messages).toHaveLength(3); // system + user + assistant
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'world' });
  });

  test('estimates tokens for current context', () => {
    contextManager.addUserMessage('Short test message');
    const tokens = contextManager.estimateCurrentTokens();
    expect(tokens).toBeGreaterThan(0);
  });

  test('reports token usage metrics', () => {
    const usage = contextManager.getTokenUsage();
    expect(usage).toHaveProperty('used');
    expect(usage).toHaveProperty('max');
    expect(usage).toHaveProperty('percentage');
    expect(usage).toHaveProperty('nearLimit');
  });

  test('trimToBudget truncates oldest messages when over limit', () => {
    for (let i = 0; i < 20; i++) {
      contextManager.addUserMessage(`Long message ${i}: ` + 'x'.repeat(500));
      contextManager.addAssistantMessage(`Response ${i}: ` + 'y'.repeat(500));
    }
    const beforeTokens = contextManager.estimateCurrentTokens();
    expect(beforeTokens).toBeGreaterThan(1000);

    // Trim to small budget
    contextManager.trimToBudget(500);
    const afterTokens = contextManager.estimateCurrentTokens();
    expect(afterTokens).toBeLessThan(beforeTokens);
    // Should retain at least recent messages
    expect(contextManager.getMessages().length).toBeGreaterThanOrEqual(2);
  });

  test('clearHistory resets messages', () => {
    contextManager.addUserMessage('msg');
    expect(contextManager.getMessages().length).toBe(2);
    contextManager.clearHistory();
    expect(contextManager.getMessages().length).toBe(1); // system only
  });
});
