'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC_EVENTS } = require('../shared/constants');

/**
 * Narrow preload bridge. Renderer has NO direct access to Node.js APIs.
 * All communication goes through these typed channels.
 */

function makeListener(channel) {
  return (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    // Return cleanup function
    return () => ipcRenderer.off(channel, handler);
  };
}

contextBridge.exposeInMainWorld('cody', {
  // ─── Workspace ────────────────────────────────────────────────────────
  selectWorkspace: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_SELECT_WORKSPACE),
  getFileTree: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_GET_FILE_TREE),
  readFile: (path) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_READ_FILE, { path }),
  getManifest: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_GET_MANIFEST),
  runCommand: (command) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_RUN_COMMAND, { command }),

  // ─── Agent ────────────────────────────────────────────────────────────
  startTask: (message) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_START_TASK, { message }),
  cancelTask: (taskId) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_CANCEL_TASK, { taskId }),
  approveChanges: (taskId) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_APPROVE_CHANGES, { taskId }),
  rejectChanges: (taskId) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_REJECT_CHANGES, { taskId }),

  // ─── Settings ─────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_GET_SETTINGS),
  saveSettings: (partial) => ipcRenderer.invoke(IPC_EVENTS.INVOKE_SAVE_SETTINGS, partial),
  testConnection: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_TEST_CONNECTION),
  listModels: () => ipcRenderer.invoke(IPC_EVENTS.INVOKE_LIST_MODELS),

  // ─── Agent Event Subscriptions ────────────────────────────────────────
  onAgentStart:           makeListener(IPC_EVENTS.AGENT_START),
  onAgentToken:           makeListener(IPC_EVENTS.AGENT_TOKEN),
  onAgentStatus:          makeListener(IPC_EVENTS.AGENT_STATUS),
  onAgentPlan:            makeListener(IPC_EVENTS.AGENT_PLAN),
  onAgentProposedChanges: makeListener(IPC_EVENTS.AGENT_PROPOSED_CHANGES),
  onAgentApprovalRequired:makeListener(IPC_EVENTS.AGENT_APPROVAL_REQUIRED),
  onAgentFileOperation:   makeListener(IPC_EVENTS.AGENT_FILE_OPERATION),
  onAgentVerification:    makeListener(IPC_EVENTS.AGENT_VERIFICATION),
  onAgentError:           makeListener(IPC_EVENTS.AGENT_ERROR),
  onAgentComplete:        makeListener(IPC_EVENTS.AGENT_COMPLETE),
  onAgentCancelled:       makeListener(IPC_EVENTS.AGENT_CANCELLED),
});
