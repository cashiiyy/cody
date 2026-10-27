'use strict';

const path = require('path');
const fse = require('fs-extra');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const {
  IPC_EVENTS,
  CODY_DIR,
  CHECKPOINTS_DIR,
} = require('../../shared/constants');
const llmClient = require('./llmClient');
const contextManager = require('./contextManager');
const workspaceManager = require('./workspaceManager');
const manifestManager = require('./manifestManager');
const fileOperationService = require('./fileOperationService');
const logger = require('../utils/logger');

/**
 * AgentCore orchestrates the full task lifecycle:
 * idle → planning → generating → awaiting_approval → applying → verifying → completed
 */
class AgentCore extends EventEmitter {
  constructor() {
    super();
    this._activeTask = null;
    this._cancelFn = null;
  }

  get isActive() {
    return this._activeTask !== null && !['completed', 'error', 'cancelled'].includes(this._activeTask?.phase);
  }

  _emit(event, payload) {
    this.emit(event, payload);
  }

  _setPhase(phase) {
    if (this._activeTask) {
      this._activeTask.phase = phase;
      this._emit(IPC_EVENTS.AGENT_STATUS, {
        requestId: this._activeTask.taskId,
        phase,
        message: this._phaseMessage(phase),
      });
    }
  }

  _phaseMessage(phase) {
    const msgs = {
      idle: 'Ready',
      planning: 'Analyzing request…',
      generating: 'Generating response…',
      awaiting_approval: 'Awaiting your approval',
      applying: 'Applying file operations…',
      verifying: 'Verifying changes…',
      completed: 'Task completed',
      error: 'Task failed',
      cancelled: 'Task cancelled',
    };
    return msgs[phase] || phase;
  }

  startTask(userMessage) {
    if (this.isActive) {
      throw new Error('A task is already in progress. Cancel it first.');
    }

    const taskId = crypto.randomBytes(8).toString('hex');
    this._activeTask = {
      taskId,
      phase: 'planning',
      userRequest: userMessage,
      proposedActions: [],
      appliedResults: [],
    };

    this._emit(IPC_EVENTS.AGENT_START, { requestId: taskId, message: userMessage });
    this._setPhase('planning');

    // Launch async execution without blocking caller
    this._runTask(taskId, userMessage);

    return taskId;
  }

  async _runTask(taskId, userMessage) {
    try {
      // Check summarization need
      if (contextManager.isNearLimit()) {
        this._emit(IPC_EVENTS.AGENT_STATUS, { requestId: taskId, phase: 'planning', message: 'Summarizing context…' });
        const ok = await contextManager.summarize();
        if (!ok) {
          logger.warn('Summarization failed; trimming messages to budget');
          contextManager.trimToBudget();
        }
      }

      // Check if cancelled during planning
      if (!this._activeTask || this._activeTask.taskId !== taskId || this._activeTask.phase === 'cancelled') {
        return;
      }

      // Add user message to context
      contextManager.addUserMessage(userMessage);
      const messages = contextManager.getMessages();

      this._setPhase('generating');

      let fullResponse = '';

      const streamPromise = new Promise((resolve, reject) => {
        llmClient.streamChat({
          requestId: taskId,
          messages,
          onToken: (token) => {
            if (!this._activeTask || this._activeTask.taskId !== taskId || this._activeTask.phase === 'cancelled') {
              return;
            }
            fullResponse += token;
            this._emit(IPC_EVENTS.AGENT_TOKEN, { requestId: taskId, token });
          },
          onComplete: (text) => resolve(text),
          onError: (err) => reject(err),
        }).then(fn => { this._cancelFn = fn; });
      });

      await streamPromise;
      this._cancelFn = null;

      // Guard: if cancelled during streaming, halt immediately
      if (!this._activeTask || this._activeTask.taskId !== taskId || this._activeTask.phase === 'cancelled') {
        logger.info('Task was cancelled during streaming, halting', { taskId });
        return;
      }

      // Store assistant response
      contextManager.addAssistantMessage(fullResponse);

      // Parse proposed file actions from response
      const proposedActions = this._parseActions(fullResponse);

      if (proposedActions.length > 0) {
        this._activeTask.proposedActions = proposedActions;

        // Validate actions
        const validationErrors = fileOperationService.validateBatch({ actions: proposedActions });
        if (validationErrors.length > 0) {
          this._emit(IPC_EVENTS.AGENT_ERROR, {
            requestId: taskId,
            error: `Proposed actions failed validation:\n${validationErrors.join('\n')}`,
          });
          this._setPhase('error');
          this._activeTask = null;
          return;
        }

        // Check conflicts
        const conflicts = await fileOperationService.checkConflicts(proposedActions);

        this._emit(IPC_EVENTS.AGENT_PROPOSED_CHANGES, {
          requestId: taskId,
          actions: proposedActions,
          conflicts,
        });

        this._setPhase('awaiting_approval');
        await this._saveCheckpoint();
        // Waiting for user approval via approveChanges() or rejectChanges()
      } else {
        // No file operations — pure conversation response
        this._setPhase('completed');
        this._emit(IPC_EVENTS.AGENT_COMPLETE, {
          requestId: taskId,
          summary: 'Response generated. No file operations.',
        });
        await manifestManager.setCurrentTask(null);
        this._activeTask = null;
      }
    } catch (err) {
      if (!this._activeTask || this._activeTask.taskId !== taskId || this._activeTask.phase === 'cancelled') {
        return;
      }
      logger.error('Agent task error', { taskId, error: err.message });
      this._emit(IPC_EVENTS.AGENT_ERROR, {
        requestId: taskId,
        error: err.message,
      });
      this._setPhase('error');
      this._activeTask = null;
    }
  }

  async approveChanges(taskId) {
    if (!this._activeTask || this._activeTask.taskId !== taskId) {
      throw new Error('No matching active task to approve');
    }
    if (this._activeTask.phase !== 'awaiting_approval') {
      throw new Error('Task is not in awaiting_approval state');
    }

    this._setPhase('applying');
    const actions = this._activeTask.proposedActions;

    const results = await fileOperationService.applyBatch(actions);
    this._activeTask.appliedResults = results;

    for (const result of results) {
      this._emit(IPC_EVENTS.AGENT_FILE_OPERATION, {
        requestId: taskId,
        path: result.action?.path,
        type: result.action?.type,
        success: result.success,
        error: result.error,
      });
    }

    const allSuccess = results.every(r => r.success);

    if (allSuccess) {
      // Refresh index and manifest
      try {
        await workspaceManager.buildIndex();
        await manifestManager.updateFileTree(workspaceManager.index);
        await manifestManager.addCompletedTask(
          `Applied ${results.length} file operation(s): ${actions.map(a => a.path).join(', ')}`
        );
      } catch (err) {
        logger.warn('Post-apply manifest update failed', { error: err.message });
      }

      this._setPhase('completed');
      this._emit(IPC_EVENTS.AGENT_COMPLETE, {
        requestId: taskId,
        summary: `Successfully applied ${results.length} file operation(s).`,
        results,
      });
    } else {
      const failed = results.filter(r => !r.success);
      this._emit(IPC_EVENTS.AGENT_ERROR, {
        requestId: taskId,
        error: `${failed.length} operation(s) failed: ${failed.map(r => r.error).join('; ')}`,
      });
      this._setPhase('error');
    }

    this._activeTask = null;
  }

  async rejectChanges(taskId) {
    if (!this._activeTask || this._activeTask.taskId !== taskId) return;
    this._setPhase('cancelled');
    this._emit(IPC_EVENTS.AGENT_CANCELLED, { requestId: taskId, reason: 'User rejected proposed changes' });
    contextManager.addAssistantMessage('[User rejected the proposed file changes. No files were modified.]');
    this._activeTask = null;
  }

  cancelTask(taskId) {
    if (this._cancelFn) {
      this._cancelFn();
      this._cancelFn = null;
    }
    if (this._activeTask) {
      this._setPhase('cancelled');
      this._emit(IPC_EVENTS.AGENT_CANCELLED, { requestId: taskId || this._activeTask.taskId, reason: 'User cancelled' });
      this._activeTask = null;
    }
    llmClient.cancelRequest(taskId);
    return true;
  }

  /**
   * Parse JSON actions from model response.
   * Looks for ```json ... ``` blocks containing {"actions": [...]}
   */
  _parseActions(text) {
    if (!text || typeof text !== 'string') return [];

    // 1. Check markdown blocks: ```json ... ``` or ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          return parsed.actions;
        }
      } catch { /* continue */ }
    }

    // 2. Fallback: Search for raw JSON object containing "actions"
    const rawMatch = text.match(/\{[\s\S]*?"actions"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]);
        if (parsed && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          return parsed.actions;
        }
      } catch { /* continue */ }
    }

    return [];
  }

  async _saveCheckpoint() {
    if (!this._activeTask || !workspaceManager.root) return;
    try {
      const checkpointDir = path.join(workspaceManager.root, CODY_DIR, CHECKPOINTS_DIR);
      await fse.ensureDir(checkpointDir);
      const checkpointPath = path.join(checkpointDir, `${this._activeTask.taskId}.json`);
      const checkpoint = {
        taskId: this._activeTask.taskId,
        userRequest: this._activeTask.userRequest,
        phase: this._activeTask.phase,
        plannedOperations: this._activeTask.proposedActions || [],
        appliedOperations: this._activeTask.appliedResults || [],
        pendingApprovals: this._activeTask.proposedActions || [],
        verificationResult: null,
        errors: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fse.writeJson(checkpointPath, checkpoint, { spaces: 2 });
    } catch (err) {
      logger.warn('Failed to save checkpoint', { error: err.message });
    }
  }
}

const agentCore = new AgentCore();
module.exports = agentCore;
