'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { IPC_EVENTS } = require('../../../shared/constants');
const workspaceManager = require('../services/workspaceManager');
const manifestManager = require('../services/manifestManager');
const agentCore = require('../services/agentCore');
const contextManager = require('../services/contextManager');
const logger = require('../utils/logger');

function registerAgentHandlers(mainWindow) {
  // ─── Start Task ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC_EVENTS.INVOKE_START_TASK, async (event, { message }) => {
    try {
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return { success: false, error: 'Message cannot be empty' };
      }

      const taskId = await new Promise((resolve, reject) => {
        const handler = (taskData) => {
          resolve(taskData.requestId);
        };
        agentCore.once(IPC_EVENTS.AGENT_START, handler);
        agentCore.startTask(message.trim(), (channel, data) => {
          mainWindow.webContents.send(channel, data);
        }).catch(err => {
          agentCore.off(IPC_EVENTS.AGENT_START, handler);
          reject(err);
        });
      });

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

  const listeners = [];
  for (const event of agentEvents) {
    const listener = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(event, data);
      }
    };
    agentCore.on(event, listener);
    listeners.push({ event, listener });
  }

  // Cleanup on window close
  mainWindow.on('closed', () => {
    for (const { event, listener } of listeners) {
      agentCore.off(event, listener);
    }
  });
}

module.exports = { registerAgentHandlers };
