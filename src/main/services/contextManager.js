'use strict';

const { estimateChatTokens, estimateTokens } = require('../utils/tokenEstimator');
const settingsManager = require('./settingsManager');
const manifestManager = require('./manifestManager');
const llmClient = require('./llmClient');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are CODY, a privacy-first local AI coding assistant.
You help developers understand codebases, plan software changes, create and edit source files, and maintain project memory.

IMPORTANT RULES:
- Be precise and technical. Avoid unnecessary verbosity.
- When proposing file changes, output a JSON block in this exact format:
\`\`\`json
{"actions":[{"type":"create_file","path":"relative/path","content":"..."},{"type":"edit_file","path":"relative/path","content":"..."}]}
\`\`\`
- Never use absolute paths. Always use relative paths from the workspace root.
- Explain your reasoning before the JSON actions block.
- If asked to read a file, use {"actions":[{"type":"read_file","path":"relative/path"}]}
- Never invent file contents you haven't read.
- Be honest about what you know and what requires reading files first.
- Code blocks use triple backticks with language identifier.`;

const SUMMARIZE_PROMPT = `You are a project memory assistant. Given the conversation below, produce a concise JSON summary of the current project state.
Respond with ONLY valid JSON in this exact schema:
{
  "architectureSummary": "...",
  "techStack": ["..."],
  "importantFiles": ["relative/path"],
  "decisions": ["..."],
  "completedTasks": ["..."],
  "pendingTasks": ["..."],
  "knownIssues": ["..."],
  "unresolvedQuestions": ["..."]
}
Be accurate. Only include facts established in the conversation. Do not invent file paths or completed work.`;

class ContextManager {
  constructor() {
    this._messages = []; // {role, content}
    this._summarizing = false;
  }

  getSystemMessage() {
    const manifest = manifestManager.get();
    let systemContent = SYSTEM_PROMPT;
    if (manifest && manifest.projectName) {
      systemContent += `\n\n## Project: ${manifest.projectName}`;
      if (manifest.architectureSummary) {
        systemContent += `\n### Architecture\n${manifest.architectureSummary}`;
      }
      if (manifest.techStack?.length) {
        systemContent += `\n### Tech Stack\n${manifest.techStack.join(', ')}`;
      }
      if (manifest.currentTask) {
        systemContent += `\n### Current Task\n${manifest.currentTask}`;
      }
      if (manifest.importantFiles?.length) {
        systemContent += `\n### Key Files\n${manifest.importantFiles.join('\n')}`;
      }
    }
    return { role: 'system', content: systemContent };
  }

  addUserMessage(content) {
    this._messages.push({ role: 'user', content });
  }

  addAssistantMessage(content) {
    this._messages.push({ role: 'assistant', content });
  }

  getMessages() {
    return [this.getSystemMessage(), ...this._messages];
  }

  estimateCurrentTokens() {
    return estimateChatTokens(this.getMessages());
  }

  isNearLimit() {
    const settings = settingsManager.get();
    const current = this.estimateCurrentTokens();
    return current >= settings.softLimitTokens;
  }

  /**
   * Attempt to summarize conversation to reduce context.
   * Returns true on success, false on failure (preserves original).
   */
  async summarize() {
    if (this._summarizing) {
      logger.warn('Summarization already in progress, skipping');
      return false;
    }
    if (this._messages.length < 4) {
      logger.info('Too few messages to summarize');
      return false;
    }

    this._summarizing = true;
    const originalMessages = [...this._messages];

    try {
      const conversationText = this._messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      const summarizeMessages = [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: `Conversation to summarize:\n\n${conversationText}` },
      ];

      let summaryText = '';
      await new Promise((resolve, reject) => {
        llmClient.streamChat({
          requestId: 'summarize-' + Date.now(),
          messages: summarizeMessages,
          onToken: (token) => { summaryText += token; },
          onComplete: resolve,
          onError: reject,
        });
      });

      // Extract JSON from response
      const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Summarization returned no valid JSON');
      }
      const summary = JSON.parse(jsonMatch[0]);

      // Update manifest with summary
      await manifestManager.update({
        architectureSummary: summary.architectureSummary || '',
        techStack: Array.isArray(summary.techStack) ? summary.techStack : [],
        importantFiles: Array.isArray(summary.importantFiles) ? summary.importantFiles : [],
        decisions: Array.isArray(summary.decisions) ? summary.decisions : [],
        completedTasks: Array.isArray(summary.completedTasks) ? summary.completedTasks : [],
        pendingTasks: Array.isArray(summary.pendingTasks) ? summary.pendingTasks : [],
        knownIssues: Array.isArray(summary.knownIssues) ? summary.knownIssues : [],
        unresolvedQuestions: Array.isArray(summary.unresolvedQuestions) ? summary.unresolvedQuestions : [],
      });

      // Compact messages: keep last 4 messages (2 exchanges) + summary note
      const recent = this._messages.slice(-4);
      this._messages = [
        {
          role: 'assistant',
          content: `[Context summarized. Project state updated in manifest. Key points: ${summary.architectureSummary || 'See manifest.'} Continuing from recent messages.]`,
        },
        ...recent,
      ];

      logger.info('Context summarized successfully', { newMessageCount: this._messages.length });
      this._summarizing = false;
      return true;
    } catch (err) {
      logger.error('Summarization failed, preserving original context', { error: err.message });
      this._messages = originalMessages; // restore
      this._summarizing = false;
      return false;
    }
  }

  clearHistory() {
    this._messages = [];
  }

  getTokenUsage() {
    const settings = settingsManager.get();
    const used = this.estimateCurrentTokens();
    const max = settings.maxContextTokens;
    return {
      used,
      max,
      percentage: Math.round((used / max) * 100),
      nearLimit: this.isNearLimit(),
    };
  }
}

const contextManager = new ContextManager();
module.exports = contextManager;
