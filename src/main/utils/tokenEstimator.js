'use strict';



/**
 * Estimate token count conservatively.
 * Uses ~3.5 chars/token for English code, rounded up.
 */
function estimateTokens(text) {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate tokens for a chat messages array.
 */
function estimateChatTokens(messages) {
  let total = 4; // base overhead
  for (const msg of messages) {
    total += 4; // per-message overhead
    total += estimateTokens(msg.role || '');
    total += estimateTokens(msg.content || '');
  }
  return total;
}

module.exports = { estimateTokens, estimateChatTokens };
