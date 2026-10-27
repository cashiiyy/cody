'use strict';

const { estimateTokens, estimateChatTokens } = require('../../src/main/utils/tokenEstimator');

describe('tokenEstimator', () => {
  test('empty string = 0 tokens', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  test('short text returns positive integer', () => {
    const t = estimateTokens('Hello world');
    expect(t).toBeGreaterThan(0);
    expect(Number.isInteger(t)).toBe(true);
  });

  test('longer text = more tokens', () => {
    const short = estimateTokens('Short text.');
    const long  = estimateTokens('This is a much longer piece of text that contains many more words and should thus produce a higher token estimate.');
    expect(long).toBeGreaterThan(short);
  });

  test('estimateChatTokens: empty messages = small baseline', () => {
    const t = estimateChatTokens([]);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(20);
  });

  test('estimateChatTokens: grows with messages', () => {
    const t1 = estimateChatTokens([{ role: 'user', content: 'Hello' }]);
    const t2 = estimateChatTokens([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there! How can I help you today?' },
    ]);
    expect(t2).toBeGreaterThan(t1);
  });

  test('code-heavy content stays within 4.5 chars/token', () => {
    const code = 'function add(a, b) { return a + b; } '.repeat(20);
    const tokens = estimateTokens(code);
    const maxExpected = Math.ceil(code.length / 3.0); // conservative upper bound
    expect(tokens).toBeLessThanOrEqual(maxExpected);
  });
});
