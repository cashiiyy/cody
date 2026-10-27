'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  workspace:    null,
  settings:     null,
  activeTaskId: null,
  isGenerating: false,
  currentPhase: 'idle',
  pendingChanges: null,
};

// ─── Cleanup functions for event listeners ────────────────────────────────────
let cleanupFns = [];
function addCleanup(fn) { cleanupFns.push(fn); }

// ─── DOM References ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const els = {
  workspaceName:       $('workspace-name'),
  connectionStatus:    $('connection-status'),
  modelName:           $('model-name'),
  modelBadge:          $('model-badge'),
  fileTree:            $('file-tree'),
  contextPct:          $('context-pct'),
  contextBarFill:      $('context-bar-fill'),
  contextTokens:       $('context-tokens'),
  taskPhaseDot:        document.querySelector('.task-phase-dot'),
  taskPhaseLabel:      $('task-phase-label'),

  welcomeScreen:       $('welcome-screen'),
  conversationArea:    $('conversation-area'),
  messagesContainer:   $('messages-container'),
  approvalPanel:       $('approval-panel'),
  approvalList:        $('approval-list'),
  composer:            $('composer'),

  promptInput:         $('prompt-input'),
  btnSend:             $('btn-send'),
  btnStop:             $('btn-stop'),
  btnApprove:          $('btn-approve'),
  btnReject:           $('btn-reject'),

  btnOpenWorkspace:    $('btn-open-workspace'),
  btnOpenWorkspaceW:   $('btn-open-workspace-welcome'),
  btnRefreshTree:      $('btn-refresh-tree'),
  btnTestConnW:        $('btn-test-connection-welcome'),
  btnSettings:         $('btn-settings'),

  execPanel:           $('exec-panel'),
  execPanelToggle:     $('exec-panel-toggle'),
  execPanelBody:       $('exec-panel-body'),
  execLog:             $('exec-log'),
  execStatusInline:    $('exec-status-inline'),
  btnClearLog:         $('btn-clear-log'),

  settingsModal:       $('settings-modal'),
  btnCloseSettings:    $('btn-close-settings'),
  btnSaveSettings:     $('btn-save-settings'),
  btnCancelSettings:   $('btn-cancel-settings'),
  settingEndpoint:     $('setting-endpoint'),
  settingModel:        $('setting-model'),
  settingTemp:         $('setting-temp'),
  tempValue:           $('temp-value'),
  settingMaxCtx:       $('setting-max-ctx'),
  settingMaxOut:       $('setting-max-out'),
  settingAutoApprove:  $('setting-auto-approve'),
  btnTestConn:         $('btn-test-conn'),
  btnRefreshModels:    $('btn-refresh-models'),
  connTestResult:      $('conn-test-result'),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert markdown-style text to safe HTML.
 * Handles: code blocks, inline code, bold, italic, lists, paragraphs.
 */
function markdownToHtml(text) {
  // Code blocks first
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="code-block" data-lang="${escapeHtml(lang)}"><button class="code-copy-btn" onclick="copyCode(this)">Copy</button><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Unordered list items
  text = text.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Numbered list items
  text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Convert double newlines to paragraphs
  text = text.split(/\n{2,}/).map(para => {
    if (para.startsWith('<')) return para;
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return text;
}

// ─── Log Panel ───────────────────────────────────────────────────────────────

function log(level, message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-ts">${now()}</span>
    <span class="log-level ${level}">${level.toUpperCase()}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;
  els.execLog.appendChild(entry);
  // Auto-scroll log
  els.execLog.scrollTop = els.execLog.scrollHeight;
  // Show in inline status
  els.execStatusInline.textContent = message.slice(0, 60);
}

// ─── Connection Status ────────────────────────────────────────────────────────

function setConnectionStatus(connected, label, modelId) {
  els.connectionStatus.className = `connection-badge ${connected ? 'connected' : 'disconnected'}`;
  els.connectionStatus.querySelector('.status-label').textContent = label;
  if (modelId) {
    els.modelName.textContent = modelId;
    els.modelBadge.title = `Active model: ${modelId}`;
  }
}

async function checkConnection() {
  els.connectionStatus.className = 'connection-badge checking';
  els.connectionStatus.querySelector('.status-label').textContent = 'Checking…';
  try {
    const result = await window.cody.testConnection();
    if (result.connected) {
      setConnectionStatus(true, 'Connected', result.models?.[0]?.id || '');
      log('success', `LM Studio connected. Models: ${result.models.map(m => m.id).join(', ') || 'none'}`);

      // Auto-select first model if none set
      if (result.models?.length > 0 && state.settings && !state.settings.activeModel) {
        await window.cody.saveSettings({ activeModel: result.models[0].id });
        state.settings.activeModel = result.models[0].id;
        els.modelName.textContent = result.models[0].id;
      }
    } else {
      setConnectionStatus(false, 'Disconnected');
      log('warn', result.error || 'LM Studio not reachable');
    }
  } catch (err) {
    setConnectionStatus(false, 'Disconnected');
    log('error', `Connection check failed: ${err.message}`);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const res = await window.cody.getSettings();
  if (res.success) {
    state.settings = res.settings;
    populateSettingsForm(res.settings);
  }
}

function populateSettingsForm(s) {
  els.settingEndpoint.value = s.lmStudioEndpoint || '';
  els.settingTemp.value     = s.temperature ?? 0.1;
  els.tempValue.textContent = (s.temperature ?? 0.1).toFixed(2);
  els.settingMaxCtx.value   = s.maxContextTokens || 16384;
  els.settingMaxOut.value   = s.maxOutputTokens  || 4096;
  els.settingAutoApprove.checked = !!s.defaultAutoApprove;
  if (s.activeModel) {
    // Ensure model option exists
    let opt = els.settingModel.querySelector(`option[value="${CSS.escape(s.activeModel)}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = s.activeModel;
      opt.textContent = s.activeModel;
      els.settingModel.appendChild(opt);
    }
    els.settingModel.value = s.activeModel;
  }
}

async function saveSettings() {
  const partial = {
    lmStudioEndpoint: els.settingEndpoint.value.trim(),
    temperature: parseFloat(els.settingTemp.value),
    maxContextTokens: parseInt(els.settingMaxCtx.value, 10),
    maxOutputTokens: parseInt(els.settingMaxOut.value, 10),
    activeModel: els.settingModel.value,
    defaultAutoApprove: els.settingAutoApprove.checked,
  };
  const res = await window.cody.saveSettings(partial);
  if (res.success) {
    state.settings = res.settings;
    els.modelName.textContent = res.settings.activeModel || 'No model';
    log('info', 'Settings saved');
    closeSettingsModal();
    await checkConnection();
  } else {
    log('error', `Save settings failed: ${res.error}`);
    alert(`Failed to save settings: ${res.error}`);
  }
}

async function refreshModelList() {
  const res = await window.cody.listModels();
  els.settingModel.innerHTML = '';
  if (res.success && res.models?.length) {
    for (const m of res.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id;
      els.settingModel.appendChild(opt);
    }
    if (state.settings?.activeModel) {
      els.settingModel.value = state.settings.activeModel;
    }
    log('info', `Found ${res.models.length} model(s)`);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No models found — start LM Studio';
    els.settingModel.appendChild(opt);
    log('warn', 'No models found from LM Studio');
  }
}

function openSettingsModal() {
  populateSettingsForm(state.settings || {});
  refreshModelList();
  els.settingsModal.classList.remove('hidden');
  els.settingEndpoint.focus();
}

function closeSettingsModal() {
  els.settingsModal.classList.add('hidden');
  els.connTestResult.textContent = '';
  els.connTestResult.className = 'conn-test-result';
}

// ─── Workspace ────────────────────────────────────────────────────────────────

async function openWorkspace() {
  const res = await window.cody.selectWorkspace();
  if (res.cancelled || !res.success) {
    if (res.error) log('error', res.error);
    return;
  }
  state.workspace = res.root;
  const name = res.root.split(/[\\/]/).pop();
  els.workspaceName.textContent = name;
  els.workspaceName.title = res.root;
  log('info', `Workspace: ${res.root} (${res.fileCount} files indexed)`);

  // Switch to conversation view
  els.welcomeScreen.classList.add('hidden');
  els.conversationArea.classList.remove('hidden');
  els.composer.classList.remove('hidden');

  await refreshFileTree();
  updateContextBar();

  // Add a welcome assistant message
  addMessage('assistant', `Workspace loaded: **${name}**\n\n${res.fileCount} files indexed. I'm ready to help you understand, plan, and modify this project. What would you like to do?`);
}

// ─── File Tree ────────────────────────────────────────────────────────────────

async function refreshFileTree() {
  if (!state.workspace) return;
  const res = await window.cody.getFileTree();
  if (!res.success) {
    log('error', `File tree error: ${res.error}`);
    return;
  }
  renderFileTree(res.tree);
}

function renderFileTree(node, container, depth = 0) {
  if (depth === 0) {
    els.fileTree.innerHTML = '';
    container = els.fileTree;
    // Root item
    const rootEl = document.createElement('div');
    rootEl.className = 'tree-item';
    rootEl.style.paddingLeft = '8px';
    rootEl.innerHTML = `
      <svg class="tree-dir-toggle open" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <svg class="tree-item-icon" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 011-1h4l1.5 1.5H13a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="#E5C07B" stroke-width="1.3"/></svg>
      <span>${escapeHtml(node.name)}</span>`;
    container.appendChild(rootEl);
  }

  if (!node.children) return;

  for (const child of node.children) {
    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item';
    itemEl.style.paddingLeft = `${(depth + 1) * 12 + 8}px`;
    itemEl.dataset.path = child.path || '';

    if (child.type === 'directory') {
      itemEl.innerHTML = `
        <svg class="tree-dir-toggle" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <svg class="tree-item-icon" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 011-1h4l1.5 1.5H13a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="#E5C07B" stroke-width="1.3"/></svg>
        <span>${escapeHtml(child.name)}</span>`;

      const childContainer = document.createElement('div');
      childContainer.style.display = 'none';
      container.appendChild(itemEl);
      container.appendChild(childContainer);

      itemEl.addEventListener('click', () => {
        const toggle = itemEl.querySelector('.tree-dir-toggle');
        const isOpen = childContainer.style.display !== 'none';
        childContainer.style.display = isOpen ? 'none' : 'block';
        toggle.classList.toggle('open', !isOpen);
      });

      renderFileTree(child, childContainer, depth + 1);
    } else {
      const langDotHtml = child.language
        ? `<span class="lang-dot ${child.language}" title="${child.language}"></span>`
        : '';
      itemEl.innerHTML = `
        <svg class="tree-item-icon" viewBox="0 0 16 16" fill="none" style="color:var(--text-muted)"><path d="M4 1h6l4 4v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M10 1v4h4" stroke="currentColor" stroke-width="1.3"/></svg>
        ${langDotHtml}
        <span>${escapeHtml(child.name)}</span>`;
      container.appendChild(itemEl);

      if (child.sensitive) {
        itemEl.title = `${child.path} (sensitive — not readable)`;
        itemEl.style.opacity = '0.5';
      } else {
        itemEl.addEventListener('click', () => {
          document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'));
          itemEl.classList.add('active');
          // Insert read-file request into prompt
          if (child.path) {
            els.promptInput.value = `Read and explain the file: ${child.path}`;
            els.promptInput.focus();
          }
        });
      }
    }
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function addMessage(role, content, meta = {}) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  const avatarText = role === 'user' ? 'YOU' : 'AI';
  const htmlContent = markdownToHtml(content);

  msgEl.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">${avatarText}</div>
      <span>${role === 'user' ? 'You' : 'CODY'}</span>
      <span class="message-timestamp">${now()}</span>
    </div>
    <div class="message-body">${htmlContent}</div>`;

  if (meta.id) msgEl.id = `msg-${meta.id}`;
  els.messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

function addStreamingMessage() {
  const msgEl = document.createElement('div');
  msgEl.className = 'message assistant';
  msgEl.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">AI</div>
      <span>CODY</span>
      <span class="message-timestamp">${now()}</span>
    </div>
    <div class="message-body streaming-cursor" id="streaming-body"></div>`;
  els.messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

let streamingBody = null;
let streamBuffer = '';
let streamRaf = null;

function flushStreamBuffer() {
  if (streamingBody && streamBuffer) {
    streamingBody.innerHTML = markdownToHtml(streamBuffer);
    streamingBody.classList.add('streaming-cursor');
    scrollToBottomIfNearBottom();
  }
  streamRaf = null;
}

function appendToken(token) {
  streamBuffer += token;
  if (!streamRaf) {
    streamRaf = requestAnimationFrame(flushStreamBuffer);
  }
}

// ─── Scroll ───────────────────────────────────────────────────────────────────

function isNearBottom() {
  const c = els.messagesContainer;
  return c.scrollHeight - c.scrollTop - c.clientHeight < 120;
}

function scrollToBottom() {
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
}

function scrollToBottomIfNearBottom() {
  if (isNearBottom()) scrollToBottom();
}

// ─── Task lifecycle UI ────────────────────────────────────────────────────────

function setTaskPhase(phase, message) {
  state.currentPhase = phase;
  els.taskPhaseDot.className = `task-phase-dot ${phase}`;
  els.taskPhaseLabel.textContent = message || phase;
  log('info', message || phase);
}

function setGenerating(generating) {
  state.isGenerating = generating;
  els.promptInput.disabled = generating;
  els.btnSend.disabled = generating;
  els.btnSend.classList.toggle('hidden', generating);
  els.btnStop.classList.toggle('hidden', !generating);
}

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = els.promptInput.value.trim();
  if (!text || state.isGenerating) return;

  if (!state.workspace) {
    log('warn', 'Open a workspace first');
    return;
  }

  if (!state.settings?.activeModel) {
    log('warn', 'No model selected. Open Settings and pick a model.');
    return;
  }

  els.promptInput.value = '';
  els.promptInput.style.height = 'auto';

  addMessage('user', text);
  setGenerating(true);
  setTaskPhase('generating', 'Generating response…');

  // Create streaming message slot
  const streamMsg = addStreamingMessage();
  streamingBody = streamMsg.querySelector('#streaming-body');
  streamBuffer = '';

  try {
    const res = await window.cody.startTask(text);
    if (!res.success) {
      setGenerating(false);
      setTaskPhase('error', res.error);
      log('error', res.error);
      streamingBody.classList.remove('streaming-cursor');
      streamingBody.innerHTML = `<span style="color:var(--error)">${escapeHtml(res.error)}</span>`;
    } else {
      state.activeTaskId = res.taskId;
    }
  } catch (err) {
    setGenerating(false);
    setTaskPhase('error', err.message);
    log('error', err.message);
  }
}

// ─── Agent Event Handlers ─────────────────────────────────────────────────────

function setupAgentListeners() {
  addCleanup(window.cody.onAgentStart(data => {
    state.activeTaskId = data.requestId;
    setTaskPhase('generating', 'Generating…');
    log('info', `Task started: ${data.requestId.slice(0, 8)}`);
  }));

  addCleanup(window.cody.onAgentToken(data => {
    appendToken(data.token);
  }));

  addCleanup(window.cody.onAgentStatus(data => {
    setTaskPhase(data.phase, data.message);
  }));

  addCleanup(window.cody.onAgentProposedChanges(data => {
    // Finalize streaming message
    if (streamingBody) {
      streamingBody.classList.remove('streaming-cursor');
      if (streamRaf) { cancelAnimationFrame(streamRaf); streamRaf = null; }
      streamingBody.innerHTML = markdownToHtml(streamBuffer);
      streamBuffer = '';
      streamingBody = null;
    }
    setGenerating(false);
    state.pendingChanges = data;
    showApprovalPanel(data);
    setTaskPhase('awaiting_approval', 'Awaiting approval');
  }));

  addCleanup(window.cody.onAgentError(data => {
    if (streamingBody) {
      streamingBody.classList.remove('streaming-cursor');
      if (streamBuffer) streamingBody.innerHTML = markdownToHtml(streamBuffer);
      streamBuffer = '';
      streamingBody = null;
    }
    setGenerating(false);
    setTaskPhase('error', data.error);
    log('error', data.error);
    addMessage('assistant', `⚠️ **Error:** ${data.error}`);
  }));

  addCleanup(window.cody.onAgentComplete(data => {
    if (streamingBody) {
      streamingBody.classList.remove('streaming-cursor');
      if (streamRaf) { cancelAnimationFrame(streamRaf); streamRaf = null; }
      if (streamBuffer) streamingBody.innerHTML = markdownToHtml(streamBuffer);
      streamBuffer = '';
      streamingBody = null;
    }
    setGenerating(false);
    setTaskPhase('completed', data.summary || 'Completed');
    log('success', data.summary || 'Task completed');
    updateContextBar();
  }));

  addCleanup(window.cody.onAgentCancelled(data => {
    if (streamingBody) {
      streamingBody.classList.remove('streaming-cursor');
      streamBuffer = '';
      streamingBody = null;
    }
    setGenerating(false);
    setTaskPhase('idle', 'Cancelled');
    log('warn', 'Task cancelled');
  }));

  addCleanup(window.cody.onAgentFileOperation(data => {
    const icon = data.success ? '✓' : '✗';
    const color = data.success ? 'success' : 'error';
    log(color, `${icon} ${data.type}: ${data.path}${data.error ? ` — ${data.error}` : ''}`);
    if (data.success && state.workspace) {
      // Refresh tree after successful writes
      setTimeout(refreshFileTree, 500);
    }
  }));
}

// ─── Approval Panel ───────────────────────────────────────────────────────────

function showApprovalPanel(data) {
  els.approvalList.innerHTML = '';
  for (const action of data.actions || []) {
    const item = document.createElement('div');
    item.className = 'approval-item';
    const typeClass = action.type === 'edit_file' ? 'edit'
                    : action.type === 'delete_file' ? 'delete'
                    : '';
    item.innerHTML = `
      <span class="approval-item-type ${typeClass}">${action.type.replace('_', ' ')}</span>
      <span class="approval-item-path">${escapeHtml(action.path)}</span>`;
    els.approvalList.appendChild(item);
  }
  // Show conflicts warning
  if (data.conflicts?.length > 0) {
    const warn = document.createElement('div');
    warn.className = 'status-msg warning';
    warn.textContent = `⚠ ${data.conflicts.length} existing file(s) will be overwritten.`;
    els.approvalList.appendChild(warn);
  }
  els.approvalPanel.classList.remove('hidden');
  scrollToBottom();
}

function hideApprovalPanel() {
  els.approvalPanel.classList.add('hidden');
  state.pendingChanges = null;
}

async function approveChanges() {
  if (!state.activeTaskId) return;
  const taskId = state.activeTaskId;
  hideApprovalPanel();
  setTaskPhase('applying', 'Applying changes…');
  log('info', 'Applying approved changes…');
  const res = await window.cody.approveChanges(taskId);
  if (!res.success) {
    log('error', `Apply failed: ${res.error}`);
    setTaskPhase('error', res.error);
  }
}

async function rejectChanges() {
  if (!state.activeTaskId) return;
  hideApprovalPanel();
  await window.cody.rejectChanges(state.activeTaskId);
  setTaskPhase('idle', 'Changes rejected');
  log('warn', 'Changes rejected by user');
}

// ─── Context bar ──────────────────────────────────────────────────────────────

async function updateContextBar() {
  try {
    const res = await window.cody.getManifest();
    if (!res.success) return;
    const usage = res.tokenUsage;
    if (!usage) return;
    els.contextPct.textContent = `${usage.percentage}%`;
    els.contextBarFill.style.width = `${Math.min(usage.percentage, 100)}%`;
    els.contextBarFill.className = `context-bar-fill${usage.percentage > 90 ? ' danger' : usage.percentage > 70 ? ' warn' : ''}`;
    els.contextTokens.textContent = `${usage.used.toLocaleString()} / ${usage.max.toLocaleString()} tokens`;
    document.querySelector('.context-bar').setAttribute('aria-valuenow', usage.percentage);
  } catch { /* ignore */ }
}

// ─── Exec Panel ───────────────────────────────────────────────────────────────

function toggleExecPanel() {
  const isOpen = !els.execPanelBody.hidden;
  els.execPanelBody.hidden = isOpen;
  els.execPanel.classList.toggle('open', !isOpen);
  els.execPanelToggle.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    const h = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--exec-panel-height'));
    document.documentElement.style.setProperty('--exec-panel-header', `${36 + h}px`);
    document.querySelector('.app-layout').style.bottom = `${36 + h}px`;
  } else {
    document.documentElement.style.setProperty('--exec-panel-header', '36px');
    document.querySelector('.app-layout').style.bottom = '36px';
  }
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────

function wireEvents() {
  // Workspace
  els.btnOpenWorkspace.addEventListener('click', openWorkspace);
  els.btnOpenWorkspaceW?.addEventListener('click', openWorkspace);
  els.btnRefreshTree.addEventListener('click', refreshFileTree);

  // Connection test
  els.btnTestConnW?.addEventListener('click', async () => {
    els.btnTestConnW.disabled = true;
    await checkConnection();
    els.btnTestConnW.disabled = false;
  });

  // Composer
  els.btnSend.addEventListener('click', sendMessage);
  els.btnStop.addEventListener('click', () => {
    if (state.activeTaskId) {
      window.cody.cancelTask(state.activeTaskId);
    }
  });

  els.promptInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  els.promptInput.addEventListener('input', () => {
    els.promptInput.style.height = 'auto';
    els.promptInput.style.height = Math.min(els.promptInput.scrollHeight, 180) + 'px';
  });

  // Approval
  els.btnApprove.addEventListener('click', approveChanges);
  els.btnReject.addEventListener('click', rejectChanges);

  // Settings
  els.btnSettings.addEventListener('click', openSettingsModal);
  els.btnCloseSettings.addEventListener('click', closeSettingsModal);
  els.btnCancelSettings.addEventListener('click', closeSettingsModal);
  els.btnSaveSettings.addEventListener('click', saveSettings);
  els.settingTemp.addEventListener('input', () => {
    els.tempValue.textContent = parseFloat(els.settingTemp.value).toFixed(2);
  });
  els.btnRefreshModels.addEventListener('click', refreshModelList);
  els.btnTestConn.addEventListener('click', async () => {
    els.connTestResult.textContent = 'Testing…';
    els.connTestResult.className = 'conn-test-result';
    // Temporarily save endpoint for test
    const testEndpoint = els.settingEndpoint.value.trim();
    if (testEndpoint) await window.cody.saveSettings({ lmStudioEndpoint: testEndpoint });
    const res = await window.cody.testConnection();
    if (res.connected) {
      els.connTestResult.textContent = `✓ Connected. Models: ${res.models?.map(m => m.id).join(', ') || 'none'}`;
      els.connTestResult.className = 'conn-test-result success';
    } else {
      els.connTestResult.textContent = `✗ ${res.error || 'Failed'}`;
      els.connTestResult.className = 'conn-test-result error';
    }
  });

  // Close settings on overlay click
  els.settingsModal.addEventListener('click', e => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  // Exec panel
  els.execPanelToggle.addEventListener('click', toggleExecPanel);
  els.execPanelToggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExecPanel(); }
  });
  els.btnClearLog.addEventListener('click', () => {
    els.execLog.innerHTML = '';
    els.execStatusInline.textContent = '';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal();
    }
    if (e.key === 'Escape' && !els.settingsModal.classList.contains('hidden')) {
      closeSettingsModal();
    }
  });
}

// Copy code from pre block
window.copyCode = (btn) => {
  const code = btn.nextElementSibling?.textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
};

// ─── Startup ──────────────────────────────────────────────────────────────────

async function init() {
  wireEvents();
  setupAgentListeners();
  await loadSettings();
  await checkConnection();

  // Auto-refresh context bar every 30s
  setInterval(updateContextBar, 30000);

  log('info', 'CODY initialized. Select a workspace to begin.');
}

init().catch(err => {
  console.error('CODY init error:', err);
});
