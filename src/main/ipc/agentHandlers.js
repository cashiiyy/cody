'use strict';

const { ipcMain } = require('electron');
const { IPC_EVENTS } = require('../../shared/constants');
const agentCore = require('../services/agentCore');
const logger = require('../utils/logger');

function registerAgentHandlers(windowGetter) {
  const getWindow = () => (typeof windowGetter === 'function' ? windowGetter() : windowGetter);
  // ─── Start Task ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_START_TASK, async (event, { message }) => {
    try {
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return { success: false, error: 'Message cannot be empty' };
      }

      const taskId = agentCore.startTask(message.trim());
      return { success: true, taskId };
    } catch (err) {
      logger.error('Start task error', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ─── Cancel Task ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_CANCEL_TASK, async (event, { taskId }) => {
    try {
      const cancelled = agentCore.cancelTask(taskId);
      return { success: cancelled };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Approve Changes ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_APPROVE_CHANGES, async (event, { taskId }) => {
    try {
      await agentCore.approveChanges(taskId);
      return { success: true };
    } catch (err) {
      logger.error('Approve changes error', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ─── Reject Changes ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_REJECT_CHANGES, async (event, { taskId }) => {
    try {
      await agentCore.rejectChanges(taskId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ─── Wire AgentCore Events → IPC to Renderer ────────────────────────────
  const agentEvents = [
    IPC_EVENTS.AGENT_START,
    IPC_EVENTS.AGENT_TOKEN,
    IPC_EVENTS.AGENT_STATUS,
    IPC_EVENTS.AGENT_PLAN,
    IPC_EVENTS.AGENT_PROPOSED_CHANGES,
    IPC_EVENTS.AGENT_APPROVAL_REQUIRED,
    IPC_EVENTS.AGENT_FILE_OPERATION,
    IPC_EVENTS.AGENT_VERIFICATION,
    IPC_EVENTS.AGENT_ERROR,
    IPC_EVENTS.AGENT_COMPLETE,
    IPC_EVENTS.AGENT_CANCELLED,
  ];

  for (const event of agentEvents) {
    agentCore.on(event, (data) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(event, data);
      }
    });
  }
}

module.exports = { registerAgentHandlers };
