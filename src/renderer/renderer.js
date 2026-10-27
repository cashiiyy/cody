'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  workspace:          null,
  settings:           null,
  activeTaskId:       null,
  isGenerating:       false,
  currentPhase:       'idle',
  pendingChanges:     null,
  rawFileTree:        null,
  activeTab:          'chat',     // 'chat' | 'diff' | 'preview'
  activeBottomTab:    'log',      // 'log' | 'tests' | 'manifest'
  sidebarCollapsed:   false,
  inspectorCollapsed: false,
  bottomCollapsed:    true,
  currentPreviewFile: null,
};

// ─── Cleanup Functions ────────────────────────────────────────────────────────
const cleanupFns = [];
function addCleanup(fn) { cleanupFns.push(fn); }

// ─── DOM References ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const els = {
  // Topbar
  workspaceName:             $('workspace-name'),
  btnTopbarWorkspace:        $('btn-topbar-workspace'),
  btnCommandPaletteTrigger:  $('btn-command-palette-trigger'),
  connectionStatus:          $('connection-status'),
  modelBadge:                $('model-badge'),
  modelName:                 $('model-name'),
  btnToggleSidebar:          $('btn-toggle-sidebar'),
  btnToggleBottom:           $('btn-toggle-bottom'),
  btnToggleInspector:        $('btn-toggle-inspector'),
  btnSettings:               $('btn-settings'),

  // Tool Strip
  btnStripProject:           $('btn-strip-project'),
  btnStripChanges:           $('btn-strip-changes'),
  btnStripManifest:          $('btn-strip-manifest'),
  btnStripExec:              $('btn-strip-exec'),
  btnStripSettings:          $('btn-strip-settings'),
  badgeChangesCount:         $('badge-changes-count'),

  // Sidebar (Project Explorer)
  sidebarProject:            $('sidebar-project'),
  btnOpenWorkspace:          $('btn-open-workspace'),
  btnRefreshTree:            $('btn-refresh-tree'),
  treeFilterInput:           $('tree-filter-input'),
  btnTreeFilterClear:        $('btn-tree-filter-clear'),
  fileTree:                  $('file-tree'),
  treeFileCounter:           $('tree-file-counter'),
  btnCollapseAll:            $('btn-collapse-all'),
  resizerSidebar:            $('resizer-sidebar'),

  // Workspace Tabs
  tabBtnChat:                $('tab-btn-chat'),
  tabBtnDiff:                $('tab-btn-diff'),
  tabDiffBadge:              $('tab-diff-badge'),
  tabBtnPreview:             $('tab-btn-preview'),
  tabPreviewTitle:           $('tab-preview-title'),
  btnClosePreviewTab:        $('btn-close-preview-tab'),
  btnClearChat:              $('btn-clear-chat'),

  // Workspace Panes
  paneConversation:          $('pane-conversation'),
  welcomeScreen:             $('welcome-screen'),
  messagesContainer:         $('messages-container'),
  btnOpenWorkspaceWelcome:   $('btn-open-workspace-welcome'),
  btnTestConnectionWelcome:  $('btn-test-connection-welcome'),

  // Diff Pane
  paneDiff:                  $('pane-diff'),
  diffSummaryStats:          $('diff-summary-stats'),
  btnRejectAll:              $('btn-reject-all'),
  btnApproveAll:             $('btn-approve-all'),
  diffFilesContainer:        $('diff-files-container'),

  // Preview Pane
  panePreview:               $('pane-preview'),
  previewFilepath:           $('preview-filepath'),
  previewMeta:               $('preview-meta'),
  previewCodeContent:        $('preview-code-content'),
  btnPreviewAskCody:         $('btn-preview-ask-cody'),

  // Composer
  composer:                  $('composer'),
  composerContextLabel:      $('composer-context-label'),
  promptInput:               $('prompt-input'),
  btnSend:                   $('btn-send'),
  btnStop:                   $('btn-stop'),

  // Agent Inspector (Right Panel)
  inspectorPanel:            $('inspector-panel'),
  resizerInspector:          $('resizer-inspector'),
  inspectorPhaseBadge:       $('inspector-phase-badge'),
  contextTokensPct:          $('context-tokens-pct'),
  contextProgressFill:       $('context-progress-fill'),
  contextTokensDetail:       $('context-tokens-detail'),
  contextStatusText:         $('context-status-text'),
  btnSummarizeNow:           $('btn-summarize-now'),
  btnClearHistory:           $('btn-clear-history'),
  manifestCardName:          $('manifest-card-name'),
  manifestCardStack:         $('manifest-card-stack'),
  manifestCardArch:          $('manifest-card-arch'),

  // Bottom Tool Window
  bottomToolWindow:          $('bottom-tool-window'),
  resizerBottom:             $('resizer-bottom'),
  tabBtnExecLog:             $('tab-btn-exec-log'),
  tabBtnTests:               $('tab-btn-tests'),
  tabBtnManifestView:        $('tab-btn-manifest-view'),
  bottomStatusMessage:       $('bottom-status-message'),
  btnCopyBottomOutput:       $('btn-copy-bottom-output'),
  btnClearBottomLog:         $('btn-clear-bottom-log'),
  btnToggleBottomCollapse:   $('btn-toggle-bottom-collapse'),

  paneBottomLog:             $('pane-bottom-log'),
  execLog:                   $('exec-log'),
  paneBottomTests:           $('pane-bottom-tests'),
  btnRunTests:               $('btn-run-tests'),
  testRunStatus:             $('test-run-status'),
  testRunOutput:             $('test-run-output'),
  paneBottomManifest:        $('pane-bottom-manifest'),
  manifestJsonRaw:           $('manifest-json-raw'),

  // Status Bar
  statusWorkspaceName:       $('status-workspace-name'),
  statusAgentPhase:          $('status-agent-phase'),
  statusModelName:           $('status-model-name'),
  statusConnectionEndpoint:  $('status-connection-endpoint'),
  statusContextTokens:       $('status-context-tokens'),
  btnStatusToggleBottom:     $('btn-status-toggle-bottom'),

  // Command Palette
  commandPalette:            $('command-palette'),
  paletteSearchInput:        $('palette-search-input'),
  paletteResults:            $('palette-results'),

  // Settings Modal
  settingsModal:             $('settings-modal'),
  btnCloseSettings:          $('btn-close-settings'),
  btnSaveSettings:           $('btn-save-settings'),
  btnCancelSettings:         $('btn-cancel-settings'),
  settingEndpoint:           $('setting-endpoint'),
  settingModel:              $('setting-model'),
  settingTemp:               $('setting-temp'),
  tempValue:                 $('temp-value'),
  settingMaxCtx:             $('setting-max-ctx'),
  settingMaxOut:             $('setting-max-out'),
  settingAutoApprove:        $('setting-auto-approve'),
  btnTestConn:               $('btn-test-conn'),
  btnRefreshModels:          $('btn-refresh-models'),
  connTestResult:            $('conn-test-result'),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format markdown to secure structured HTML.
 */
function markdownToHtml(text) {
  if (!text) return '';

  // 1. Fenced Code Blocks
  let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang.trim() || 'plaintext';
    return `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="code-block-lang">${escapeHtml(language)}</span>
          <button class="code-block-copy" onclick="copyCode(this)">Copy</button>
        </div>
        <pre class="code-block-content"><code>${escapeHtml(code.trim())}</code></pre>
      </div>`;
  });

  // 2. Inline Code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Bold & Italic
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 4. Unordered & Ordered Lists
  out = out.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  out = out.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  out = out.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 5. Paragraphs
  out = out.split(/\n{2,}/).map(para => {
    const trimmed = para.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<div') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<pre')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return out;
}

// ─── Log Panel ───────────────────────────────────────────────────────────────
function log(level, message) {
  const line = document.createElement('div');
  line.className = `log-line log-line--${level}`;
  line.innerHTML = `<span class="log-time">[${now()}]</span> <span class="log-level">[${level.toUpperCase()}]</span> ${escapeHtml(message)}`;
  els.execLog.appendChild(line);
  els.execLog.scrollTop = els.execLog.scrollHeight;
  els.bottomStatusMessage.textContent = message.slice(0, 80);
}

// ─── Connection Status ────────────────────────────────────────────────────────
function setConnectionStatus(connected, label, modelId) {
  els.connectionStatus.className = `status-pill ${connected ? 'connected' : 'disconnected'}`;
  els.connectionStatus.querySelector('.status-label').textContent = label;

  if (modelId) {
    els.modelName.textContent = modelId;
    els.statusModelName.textContent = modelId;
    els.modelBadge.title = `Active Model: ${modelId}`;
  } else {
    els.statusModelName.textContent = 'No Model';
  }

  if (state.settings?.lmStudioEndpoint) {
    const ep = state.settings.lmStudioEndpoint;
    const match = ep.match(/^https?:\/\/([^/]+)/);
    els.statusConnectionEndpoint.textContent = match ? match[1] : ep;
  }
}

async function checkConnection() {
  els.connectionStatus.className = 'status-pill checking';
  els.connectionStatus.querySelector('.status-label').textContent = 'Checking…';
  try {
    const result = await window.cody.testConnection();
    if (result.connected) {
      setConnectionStatus(true, 'Connected', result.models?.[0]?.id || state.settings?.activeModel || '');
      log('info', `Connected to LM Studio (${result.models?.length || 0} models found)`);

      if (result.models?.length > 0 && state.settings && !state.settings.activeModel) {
        await window.cody.saveSettings({ activeModel: result.models[0].id });
        state.settings.activeModel = result.models[0].id;
        els.modelName.textContent = result.models[0].id;
        els.statusModelName.textContent = result.models[0].id;
      }
    } else {
      setConnectionStatus(false, 'Disconnected');
      log('warn', result.error || 'LM Studio server not reachable');
    }
  } catch (err) {
    setConnectionStatus(false, 'Disconnected');
    log('error', `Connection error: ${err.message}`);
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
    lmStudioEndpoint:   els.settingEndpoint.value.trim(),
    temperature:        parseFloat(els.settingTemp.value),
    maxContextTokens:   parseInt(els.settingMaxCtx.value, 10),
    maxOutputTokens:    parseInt(els.settingMaxOut.value, 10),
    activeModel:        els.settingModel.value,
    defaultAutoApprove: els.settingAutoApprove.checked,
  };

  const res = await window.cody.saveSettings(partial);
  if (res.success) {
    state.settings = res.settings;
    els.modelName.textContent = res.settings.activeModel || 'No model';
    els.statusModelName.textContent = res.settings.activeModel || 'No model';
    log('info', 'Settings updated successfully');
    closeSettingsModal();
    await checkConnection();
  } else {
    log('error', `Failed to save settings: ${res.error}`);
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
    log('info', `Discovered ${res.models.length} model(s) from LM Studio`);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No models available';
    els.settingModel.appendChild(opt);
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

// ─── Workspace Lifecycle ──────────────────────────────────────────────────────
async function setupWorkspaceUI(root, fileCount) {
  state.workspace = root;
  const name = root.split(/[\\/]/).pop();

  els.workspaceName.textContent = name;
  els.workspaceName.title = root;
  els.statusWorkspaceName.textContent = name;
  els.composerContextLabel.textContent = `Active Workspace: ${name}`;

  if (fileCount !== undefined) {
    els.treeFileCounter.textContent = `${fileCount} files indexed`;
    log('info', `Opened workspace "${name}" (${fileCount} files indexed)`);
  }

  // Hide welcome card if open
  els.welcomeScreen.classList.add('hidden');

  // Render informative workspace overview if conversation is empty
  renderWorkspaceWelcomeCard(name, fileCount);

  await refreshFileTree();
  await updateManifestAndContext();
}

function renderWorkspaceWelcomeCard(name, fileCount) {
  if (els.messagesContainer.children.length === 0) {
    const card = document.createElement('div');
    card.className = 'workspace-feed-card';
    card.innerHTML = `
      <div class="feed-card-header">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
        </svg>
        <span>Workspace: <strong>${escapeHtml(name)}</strong> (${fileCount || 0} files indexed)</span>
      </div>
      <p class="feed-card-body">Ready for local AI coding requests. Inspect files, plan changes, edit code, and run tests.</p>
      <div class="feed-card-chips">
        <button class="suggestion-chip" data-prompt="Analyze the architecture and main components of this codebase.">Analyze architecture</button>
        <button class="suggestion-chip" data-prompt="Audit codebase for security and error-handling bugs.">Audit code & security</button>
        <button class="suggestion-chip" data-prompt="Run existing unit tests and report any failures.">Run unit tests</button>
      </div>`;
    els.messagesContainer.appendChild(card);

    card.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        els.promptInput.value = chip.dataset.prompt;
        sendMessage();
      });
    });
  }
}

async function openWorkspace() {
  const res = await window.cody.selectWorkspace();
  if (res.cancelled || !res.success) {
    if (res.error) log('error', res.error);
    return;
  }
  await setupWorkspaceUI(res.root, res.fileCount);
  addAssistantMessage(`Workspace loaded: **${res.root.split(/[\\/]/).pop()}**\n\nIndexed ${res.fileCount} source files. You can ask me to analyze architecture, plan new features, refactor code, or run test suites.`);
}

// ─── Project File Tree ────────────────────────────────────────────────────────
async function refreshFileTree() {
  if (!state.workspace) return;
  const res = await window.cody.getFileTree();
  if (!res.success) {
    log('error', `Failed to read file tree: ${res.error}`);
    return;
  }
  state.rawFileTree = res.tree;
  renderFileTree(res.tree, els.treeFilterInput.value.trim().toLowerCase());
}

function renderFileTree(tree, filterQuery = '') {
  els.fileTree.innerHTML = '';
  if (!tree) return;

  const rootItem = document.createElement('div');
  rootItem.className = 'tree-item tree-dir active';
  rootItem.style.paddingLeft = '6px';
  rootItem.innerHTML = `
    <svg class="tree-dir-toggle open" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    <svg class="tree-item-icon folder-icon" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 011-1h4l1.5 1.5H13a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="#e5c07b" stroke-width="1.3"/></svg>
    <span class="tree-filename">${escapeHtml(tree.name)}</span>`;
  els.fileTree.appendChild(rootItem);

  const rootContainer = document.createElement('div');
  rootContainer.className = 'tree-children';
  els.fileTree.appendChild(rootContainer);

  renderTreeNodes(tree.children || [], rootContainer, 1, filterQuery);
}

function renderTreeNodes(children, container, depth, filterQuery) {
  for (const node of children) {
    // If filtering, skip nodes that don't match or have no matching children
    if (filterQuery && !nodeMatchesFilter(node, filterQuery)) {
      continue;
    }

    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item';
    itemEl.style.paddingLeft = `${depth * 14 + 6}px`;
    itemEl.dataset.path = node.path || '';

    if (node.type === 'directory') {
      itemEl.classList.add('tree-dir');
      itemEl.innerHTML = `
        <svg class="tree-dir-toggle open" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <svg class="tree-item-icon folder-icon" viewBox="0 0 16 16" fill="none"><path d="M1 4a1 1 0 011-1h4l1.5 1.5H13a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" stroke="#e5c07b" stroke-width="1.3"/></svg>
        <span class="tree-filename">${escapeHtml(node.name)}</span>`;

      const subContainer = document.createElement('div');
      subContainer.className = 'tree-children';
      container.appendChild(itemEl);
      container.appendChild(subContainer);

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggle = itemEl.querySelector('.tree-dir-toggle');
        const isOpen = subContainer.style.display !== 'none';
        subContainer.style.display = isOpen ? 'none' : 'block';
        toggle.classList.toggle('open', !isOpen);
      });

      renderTreeNodes(node.children || [], subContainer, depth + 1, filterQuery);
    } else {
      // File node
      const ext = (node.name.split('.').pop() || '').toLowerCase();
      itemEl.innerHTML = `
        <span class="tree-indent-spacer"></span>
        <svg class="tree-item-icon file-icon file-icon-${ext}" viewBox="0 0 16 16" fill="none"><path d="M4 1h6l4 4v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M10 1v4h4" stroke="currentColor" stroke-width="1.3"/></svg>
        <span class="tree-filename">${escapeHtml(node.name)}</span>`;

      if (node.sensitive) {
        itemEl.title = `${node.path} (sensitive / ignored)`;
        itemEl.style.opacity = '0.4';
      } else {
        itemEl.addEventListener('click', async (e) => {
          e.stopPropagation();
          document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
          itemEl.classList.add('active');
          await openFilePreview(node.path);
        });
      }

      container.appendChild(itemEl);
    }
  }
}

function nodeMatchesFilter(node, q) {
  if (node.name.toLowerCase().includes(q) || (node.path && node.path.toLowerCase().includes(q))) {
    return true;
  }
  if (node.children) {
    return node.children.some(child => nodeMatchesFilter(child, q));
  }
  return false;
}

// ─── File Preview ─────────────────────────────────────────────────────────────
async function openFilePreview(relPath) {
  state.currentPreviewFile = relPath;
  const res = await window.cody.readFile(relPath);

  els.tabBtnPreview.classList.remove('hidden');
  const filename = relPath.split(/[\\/]/).pop();
  els.tabPreviewTitle.textContent = filename;
  els.previewFilepath.textContent = relPath;

  if (res.success) {
    const lines = res.content.split('\n');
    els.previewMeta.textContent = `${res.content.length.toLocaleString()} bytes · ${lines.length} lines`;
    els.previewCodeContent.textContent = res.content;
  } else {
    els.previewMeta.textContent = 'Error reading file';
    els.previewCodeContent.textContent = `// Error loading file: ${res.error}`;
  }

  switchMainTab('preview');
}

// ─── Main Tabs Switching ──────────────────────────────────────────────────────
function switchMainTab(tabName) {
  state.activeTab = tabName;
  els.tabBtnChat.classList.toggle('active', tabName === 'chat');
  els.tabBtnDiff.classList.toggle('active', tabName === 'diff');
  els.tabBtnPreview.classList.toggle('active', tabName === 'preview');

  els.tabBtnChat.setAttribute('aria-selected', tabName === 'chat');
  els.tabBtnDiff.setAttribute('aria-selected', tabName === 'diff');
  els.tabBtnPreview.setAttribute('aria-selected', tabName === 'preview');

  els.paneConversation.classList.toggle('hidden', tabName !== 'chat');
  els.paneDiff.classList.toggle('hidden', tabName !== 'diff');
  els.panePreview.classList.toggle('hidden', tabName !== 'preview');
}

// ─── Bottom Tool Window ───────────────────────────────────────────────────────
function switchBottomTab(tabName) {
  state.activeBottomTab = tabName;
  els.tabBtnExecLog.classList.toggle('active', tabName === 'log');
  els.tabBtnTests.classList.toggle('active', tabName === 'tests');
  els.tabBtnManifestView.classList.toggle('active', tabName === 'manifest');

  els.paneBottomLog.classList.toggle('hidden', tabName !== 'log');
  els.paneBottomTests.classList.toggle('hidden', tabName !== 'tests');
  els.paneBottomManifest.classList.toggle('hidden', tabName !== 'manifest');

  if (state.bottomCollapsed) {
    toggleBottomWindow(false);
  }
}

function toggleBottomWindow(forceCollapsed) {
  state.bottomCollapsed = (forceCollapsed !== undefined) ? forceCollapsed : !state.bottomCollapsed;
  els.bottomToolWindow.classList.toggle('collapsed', state.bottomCollapsed);
  els.btnToggleBottom.classList.toggle('active', !state.bottomCollapsed);
  els.btnStatusToggleBottom.classList.toggle('active', !state.bottomCollapsed);
}

// ─── Sidebar & Inspector Toggles ──────────────────────────────────────────────
function toggleSidebar(forceState) {
  state.sidebarCollapsed = (forceState !== undefined) ? forceState : !state.sidebarCollapsed;
  els.sidebarProject.classList.toggle('collapsed', state.sidebarCollapsed);
  els.btnToggleSidebar.classList.toggle('active', !state.sidebarCollapsed);
  els.btnStripProject.classList.toggle('active', !state.sidebarCollapsed);
}

function toggleInspector(forceState) {
  state.inspectorCollapsed = (forceState !== undefined) ? forceState : !state.inspectorCollapsed;
  els.inspectorPanel.classList.toggle('collapsed', state.inspectorCollapsed);
  els.btnToggleInspector.classList.toggle('active', !state.inspectorCollapsed);
}

// ─── Conversation Messages ────────────────────────────────────────────────────
function addUserMessage(text) {
  const card = document.createElement('div');
  card.className = 'message-card--user';
  card.innerHTML = `
    <div class="message-meta">
      <span class="message-meta-role">You</span>
      <span class="message-meta-time">${now()}</span>
    </div>
    <div class="message-content">${escapeHtml(text)}</div>`;
  els.messagesContainer.appendChild(card);
  scrollToBottom();
}

function addAssistantMessage(markdownContent) {
  const card = document.createElement('div');
  card.className = 'message-card--assistant';
  card.innerHTML = `
    <div class="message-meta">
      <span class="message-meta-role">CODY</span>
      <span class="message-meta-time">${now()}</span>
    </div>
    <div class="message-content markdown-body">${markdownToHtml(markdownContent)}</div>`;
  els.messagesContainer.appendChild(card);
  scrollToBottom();
  return card;
}

let streamingBodyEl = null;
let streamBuffer = '';
let streamRaf = null;

function startStreamingMessage() {
  const card = document.createElement('div');
  card.className = 'message-card--assistant';
  card.innerHTML = `
    <div class="message-meta">
      <span class="message-meta-role">CODY</span>
      <span class="message-meta-time">${now()}</span>
    </div>
    <div class="message-content markdown-body streaming-active" id="active-streaming-body"></div>`;
  els.messagesContainer.appendChild(card);

  streamingBodyEl = card.querySelector('#active-streaming-body');
  streamBuffer = '';
  scrollToBottom();
}

function appendToken(token) {
  streamBuffer += token;
  if (!streamRaf) {
    streamRaf = requestAnimationFrame(flushStreamBuffer);
  }
}

function flushStreamBuffer() {
  if (streamingBodyEl && streamBuffer) {
    streamingBodyEl.innerHTML = markdownToHtml(streamBuffer);
    scrollToBottom();
  }
  streamRaf = null;
}

function finalizeStreamingMessage() {
  if (streamRaf) {
    cancelAnimationFrame(streamRaf);
    streamRaf = null;
  }
  if (streamingBodyEl) {
    streamingBodyEl.classList.remove('streaming-active');
    if (streamBuffer) {
      streamingBodyEl.innerHTML = markdownToHtml(streamBuffer);
    }
  }
  streamingBodyEl = null;
  streamBuffer = '';
}

function scrollToBottom() {
  els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
}

// ─── Agent Stage Tracking ─────────────────────────────────────────────────────
function setTaskPhase(phase, label) {
  state.currentPhase = phase;
  els.inspectorPhaseBadge.textContent = label || phase;
  els.statusAgentPhase.textContent = label || phase;

  // Pipeline step elements
  const steps = document.querySelectorAll('.pipeline-step');
  const stageOrder = ['planning', 'generating', 'awaiting_approval', 'applying', 'completed'];
  const currentIndex = stageOrder.indexOf(phase);

  steps.forEach((stepEl, idx) => {
    stepEl.classList.remove('active', 'done');
    if (currentIndex >= 0) {
      if (idx < currentIndex) {
        stepEl.classList.add('done');
      } else if (idx === currentIndex) {
        stepEl.classList.add('active');
      }
    }
  });

  log('info', `Stage: ${label || phase}`);
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
    log('warn', 'Please open a project workspace first.');
    openWorkspace();
    return;
  }

  els.promptInput.value = '';
  els.promptInput.style.height = 'auto';

  // Ensure conversation pane is active
  switchMainTab('chat');
  els.welcomeScreen.classList.add('hidden');

  addUserMessage(text);
  setGenerating(true);
  setTaskPhase('generating', 'Generating plan…');
  startStreamingMessage();

  try {
    const res = await window.cody.startTask(text);
    if (!res.success) {
      finalizeStreamingMessage();
      setGenerating(false);
      setTaskPhase('idle', 'Error');
      log('error', res.error);
      addAssistantMessage(`⚠️ **Task Error:** ${res.error}`);
    } else {
      state.activeTaskId = res.taskId;
    }
  } catch (err) {
    finalizeStreamingMessage();
    setGenerating(false);
    setTaskPhase('idle', 'Error');
    log('error', `Failed to start task: ${err.message}`);
  }
}

// ─── Diff & Action Review ─────────────────────────────────────────────────────
async function handleProposedChanges(data) {
  finalizeStreamingMessage();
  setGenerating(false);
  state.pendingChanges = data;
  setTaskPhase('awaiting_approval', 'Changes Ready for Review');

  const actions = data.actions || [];
  const actionCount = actions.length;

  // 1. Render in-conversation card
  renderProposalChatCard(actions, data.conflicts || []);

  // 2. Populate Dedicated Diff Pane
  await populateDiffPane(actions);

  // 3. Update Badges
  els.badgeChangesCount.textContent = actionCount;
  els.badgeChangesCount.classList.toggle('hidden', actionCount === 0);
  els.tabDiffBadge.textContent = actionCount;
  els.tabDiffBadge.classList.toggle('hidden', actionCount === 0);
}

function renderProposalChatCard(actions, conflicts) {
  const card = document.createElement('div');
  card.className = 'changes-proposal-card';

  let itemsHtml = '';
  for (const act of actions) {
    const badgeType = act.type === 'create_file' ? 'badge--success'
                    : act.type === 'edit_file'   ? 'badge--warning'
                    : 'badge--danger';
    const typeLabel = act.type.replace('_', ' ').toUpperCase();
    itemsHtml += `
      <div class="proposal-item">
        <div class="proposal-item-left">
          <span class="badge ${badgeType}">${typeLabel}</span>
          <span>${escapeHtml(act.path)}</span>
        </div>
      </div>`;
  }

  let conflictNotice = '';
  if (conflicts && conflicts.length > 0) {
    conflictNotice = `<div class="status-msg warning">⚠️ ${conflicts.length} existing file(s) will be overwritten.</div>`;
  }

  card.innerHTML = `
    <div class="proposal-header">
      <div class="proposal-title">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2v12M12 2v12M2 6h4M10 10h4"/></svg>
        <span>Proposed Changes (${actions.length} file${actions.length === 1 ? '' : 's'})</span>
      </div>
      <button class="btn btn--secondary btn--xs" onclick="switchMainTab('diff')">Open Full Diff</button>
    </div>
    <div class="proposal-list">${itemsHtml}</div>
    ${conflictNotice}
    <div class="proposal-actions">
      <button class="btn btn--danger btn--sm" id="btn-chat-reject">Reject</button>
      <button class="btn btn--success btn--sm" id="btn-chat-approve">Approve & Apply</button>
    </div>`;

  els.messagesContainer.appendChild(card);
  scrollToBottom();

  card.querySelector('#btn-chat-reject').addEventListener('click', rejectChanges);
  card.querySelector('#btn-chat-approve').addEventListener('click', approveChanges);
}

async function populateDiffPane(actions) {
  els.diffFilesContainer.innerHTML = '';
  els.diffSummaryStats.textContent = `${actions.length} file(s) changed`;

  for (const action of actions) {
    const fileCard = document.createElement('div');
    fileCard.className = 'diff-file-card';

    // Fetch existing content if editing
    let oldContent = '';
    if (action.type === 'edit_file') {
      const readRes = await window.cody.readFile(action.path);
      if (readRes.success) {
        oldContent = readRes.content;
      }
    }

    const diffLines = computeUnifiedDiff(oldContent, action.content || '');
    let diffLinesHtml = '';
    for (const d of diffLines) {
      const lineClass = d.type === 'add' ? 'diff-line--add'
                      : d.type === 'del' ? 'diff-line--del'
                      : 'diff-line--ctx';
      const prefix = d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' ';
      diffLinesHtml += `<div class="diff-line ${lineClass}"><span>${prefix}</span> ${escapeHtml(d.line)}</div>`;
    }

    const badgeClass = action.type === 'create_file' ? 'badge--success'
                     : action.type === 'edit_file'   ? 'badge--warning'
                     : 'badge--danger';

    fileCard.innerHTML = `
      <div class="diff-file-header">
        <div class="diff-file-header-left">
          <span class="badge ${badgeClass}">${action.type.replace('_', ' ').toUpperCase()}</span>
          <strong>${escapeHtml(action.path)}</strong>
        </div>
      </div>
      <div class="diff-lines-block">${diffLinesHtml}</div>`;

    els.diffFilesContainer.appendChild(fileCard);
  }
}

function computeUnifiedDiff(oldStr, newStr) {
  const oldLines = oldStr ? oldStr.split('\n') : [];
  const newLines = newStr ? newStr.split('\n') : [];

  if (oldLines.length === 0) {
    return newLines.map(line => ({ type: 'add', line }));
  }

  const result = [];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'ctx', line: oldLines[i] });
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i, i + 5).includes(newLines[j]))) {
      result.push({ type: 'add', line: newLines[j] });
      j++;
    } else if (i < oldLines.length) {
      result.push({ type: 'del', line: oldLines[i] });
      i++;
    }
  }
  return result;
}

async function approveChanges() {
  if (!state.activeTaskId) return;
  const taskId = state.activeTaskId;

  setTaskPhase('applying', 'Applying changes…');
  log('info', 'Applying proposed changes to filesystem…');

  const res = await window.cody.approveChanges(taskId);
  if (res.success) {
    log('info', 'All modifications successfully applied');
    clearPendingChangesUI();
  } else {
    log('error', `Failed to apply changes: ${res.error}`);
    setTaskPhase('idle', 'Error');
  }
}

async function rejectChanges() {
  if (!state.activeTaskId) return;
  const taskId = state.activeTaskId;

  await window.cody.rejectChanges(taskId);
  log('warn', 'Proposed changes rejected by user');
  setTaskPhase('idle', 'Changes Rejected');
  clearPendingChangesUI();
}

function clearPendingChangesUI() {
  state.pendingChanges = null;
  els.badgeChangesCount.classList.add('hidden');
  els.tabDiffBadge.classList.add('hidden');
  els.diffFilesContainer.innerHTML = `
    <div class="diff-empty-state">
      <div class="diff-empty-icon-wrap" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="M4 2v12M12 2v12M2 6h4M10 10h4" />
        </svg>
      </div>
      <h3>No Proposed Changes</h3>
      <p>Ask CODY in Conversation to plan modifications, refactor code, or create files.</p>
      <button id="btn-diff-empty-switch" class="btn btn--secondary btn--xs">Return to Conversation</button>
    </div>`;
  els.diffSummaryStats.textContent = '0 files changed';
  const switchBtn = $('btn-diff-empty-switch');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => switchMainTab('chat'));
  }
}

// ─── Tests Runner ─────────────────────────────────────────────────────────────
async function runWorkspaceTests() {
  if (!state.workspace) {
    log('warn', 'Open a workspace first to execute tests.');
    return;
  }

  els.btnRunTests.disabled = true;
  els.testRunStatus.textContent = 'Running npm test…';
  els.testRunStatus.className = 'meta-tag badge--warning';
  els.testRunOutput.textContent = '$ npm test\n\nExecuting test suite in workspace…';

  log('info', 'Executing "npm test" in workspace…');

  try {
    const res = await window.cody.runCommand('npm test');
    els.btnRunTests.disabled = false;

    if (res.success) {
      els.testRunStatus.textContent = 'Passed (Exit 0)';
      els.testRunStatus.className = 'meta-tag badge--success';
      els.testRunOutput.textContent = `$ npm test (duration: ${res.durationMs}ms)\n\n${res.stdout || res.stderr}`;
      log('info', `Tests completed with exit code 0 (${res.durationMs}ms)`);
    } else {
      els.testRunStatus.textContent = `Failed (Exit ${res.exitCode ?? 1})`;
      els.testRunStatus.className = 'meta-tag badge--danger';
      els.testRunOutput.textContent = `$ npm test\n\n${res.stdout || ''}\n${res.stderr || res.error || 'Execution failed'}`;
      log('error', `Tests exited with error: ${res.error || res.exitCode}`);
    }
  } catch (err) {
    els.btnRunTests.disabled = false;
    els.testRunStatus.textContent = 'Execution Error';
    els.testRunStatus.className = 'meta-tag badge--danger';
    els.testRunOutput.textContent = `Execution failed: ${err.message}`;
  }
}

// ─── Manifest and Context Gauge ───────────────────────────────────────────────
async function updateManifestAndContext() {
  try {
    const res = await window.cody.getManifest();
    if (!res.success) return;

    // 1. Raw JSON Viewer
    els.manifestJsonRaw.textContent = JSON.stringify(res.manifest, null, 2);

    // 2. Token Gauge
    const usage = res.tokenUsage;
    if (usage) {
      els.contextTokensPct.textContent = `${usage.percentage}%`;
      els.contextProgressFill.style.width = `${Math.min(usage.percentage, 100)}%`;
      els.contextProgressFill.className = `progress-bar-fill${usage.percentage > 90 ? ' danger' : usage.percentage > 70 ? ' warn' : ''}`;
      els.contextTokensDetail.textContent = `${usage.used.toLocaleString()} / ${usage.max.toLocaleString()} tokens`;
      els.statusContextTokens.textContent = `Context: ${Math.round(usage.used / 1000)}k / ${Math.round(usage.max / 1000)}k`;

      if (usage.percentage > 85) {
        els.contextStatusText.textContent = 'High Context Pressure';
        els.contextStatusText.className = 'status-danger';
      } else {
        els.contextStatusText.textContent = 'Safe Budget';
        els.contextStatusText.className = 'status-safe';
      }
    }

    // 3. Project Architecture Card
    const manifest = res.manifest;
    if (manifest) {
      els.manifestCardName.textContent = manifest.projectName || '—';
      if (manifest.techStack && manifest.techStack.length) {
        els.manifestCardStack.innerHTML = manifest.techStack.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ');
      }
      if (manifest.architectureSummary) {
        els.manifestCardArch.textContent = manifest.architectureSummary;
      }
    }
  } catch (err) {
    console.warn('Failed to update manifest UI', err);
  }
}

// ─── Command Palette ──────────────────────────────────────────────────────────
const PALETTE_COMMANDS = [
  { id: 'open-workspace',  title: 'Open Project Workspace…', shortcut: 'Ctrl+O', action: openWorkspace },
  { id: 'run-tests',       title: 'Run Workspace Tests (npm test)', shortcut: 'Alt+T', action: () => { switchBottomTab('tests'); runWorkspaceTests(); } },
  { id: 'view-diff',       title: 'Review Proposed File Changes', shortcut: 'Alt+2', action: () => switchMainTab('diff') },
  { id: 'toggle-sidebar',  title: 'Toggle Project Explorer Sidebar', shortcut: 'Ctrl+B', action: () => toggleSidebar() },
  { id: 'toggle-bottom',   title: 'Toggle Bottom Tool Window', shortcut: 'Ctrl+J', action: () => toggleBottomWindow() },
  { id: 'toggle-insp',     title: 'Toggle Agent Inspector Panel', shortcut: 'Ctrl+I', action: () => toggleInspector() },
  { id: 'refresh-files',   title: 'Refresh Project File Tree', shortcut: 'F5', action: refreshFileTree },
  { id: 'test-conn',       title: 'Test LM Studio Connection', shortcut: '', action: checkConnection },
  { id: 'open-settings',   title: 'Open Settings Dialog', shortcut: 'Ctrl+,', action: openSettingsModal },
  { id: 'clear-chat',      title: 'Clear Conversation Feed', shortcut: '', action: () => { els.messagesContainer.innerHTML = ''; } },
];

function openCommandPalette() {
  els.commandPalette.classList.remove('hidden');
  els.paletteSearchInput.value = '';
  renderPaletteResults('');
  els.paletteSearchInput.focus();
}

function closeCommandPalette() {
  els.commandPalette.classList.add('hidden');
}

function renderPaletteResults(query) {
  els.paletteResults.innerHTML = '';
  const q = query.toLowerCase();
  const matched = PALETTE_COMMANDS.filter(cmd => cmd.title.toLowerCase().includes(q));

  if (matched.length === 0) {
    els.paletteResults.innerHTML = '<div class="palette-empty">No matching commands</div>';
    return;
  }

  matched.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = `palette-item ${idx === 0 ? 'selected' : ''}`;
    item.innerHTML = `
      <span class="palette-item-title">${escapeHtml(cmd.title)}</span>
      ${cmd.shortcut ? `<kbd class="shortcut-pill">${escapeHtml(cmd.shortcut)}</kbd>` : ''}`;

    item.addEventListener('click', () => {
      closeCommandPalette();
      cmd.action();
    });

    els.paletteResults.appendChild(item);
  });
}

// ─── Resizers ─────────────────────────────────────────────────────────────────
function setupResizers() {
  // Sidebar Horizontal Resizing
  els.resizerSidebar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 240;

    function onMouseMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(180, Math.min(500, startWidth + delta));
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Inspector Horizontal Resizing
  els.resizerInspector.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--inspector-width'), 10) || 270;

    function onMouseMove(moveEvent) {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(200, Math.min(500, startWidth + delta));
      document.documentElement.style.setProperty('--inspector-width', `${newWidth}px`);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Bottom Tool Window Vertical Resizing
  els.resizerBottom.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-height'), 10) || 220;

    function onMouseMove(moveEvent) {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(120, Math.min(600, startHeight + delta));
      document.documentElement.style.setProperty('--bottom-height', `${newHeight}px`);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// ─── Agent Listeners ──────────────────────────────────────────────────────────
function setupAgentListeners() {
  addCleanup(window.cody.onAgentStart(data => {
    state.activeTaskId = data.requestId;
    setTaskPhase('generating', 'Generating plan…');
  }));

  addCleanup(window.cody.onAgentToken(data => {
    appendToken(data.token);
  }));

  addCleanup(window.cody.onAgentStatus(data => {
    setTaskPhase(data.phase, data.message);
  }));

  addCleanup(window.cody.onAgentProposedChanges(async data => {
    await handleProposedChanges(data);
  }));

  addCleanup(window.cody.onAgentError(data => {
    finalizeStreamingMessage();
    setGenerating(false);
    setTaskPhase('idle', 'Error');
    log('error', data.error);
    addAssistantMessage(`⚠️ **Agent Error:** ${data.error}`);
  }));

  addCleanup(window.cody.onAgentComplete(data => {
    finalizeStreamingMessage();
    setGenerating(false);
    setTaskPhase('completed', data.summary || 'Task Completed');
    log('info', data.summary || 'Agent task completed safely');
    updateManifestAndContext();
  }));

  addCleanup(window.cody.onAgentCancelled(() => {
    finalizeStreamingMessage();
    setGenerating(false);
    setTaskPhase('idle', 'Cancelled');
    log('warn', 'Agent generation cancelled');
  }));

  addCleanup(window.cody.onAgentFileOperation(data => {
    const symbol = data.success ? '✓' : '✗';
    const level = data.success ? 'info' : 'error';
    log(level, `${symbol} ${data.type}: ${data.path}`);
    if (data.success && state.workspace) {
      setTimeout(refreshFileTree, 400);
    }
  }));
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
function wireEvents() {
  // Topbar
  els.btnTopbarWorkspace.addEventListener('click', openWorkspace);
  els.btnCommandPaletteTrigger.addEventListener('click', openCommandPalette);
  els.btnToggleSidebar.addEventListener('click', () => toggleSidebar());
  els.btnToggleBottom.addEventListener('click', () => toggleBottomWindow());
  els.btnToggleInspector.addEventListener('click', () => toggleInspector());
  els.btnSettings.addEventListener('click', openSettingsModal);

  // Tool Strip
  els.btnStripProject.addEventListener('click', () => {
    if (state.sidebarCollapsed) toggleSidebar(false);
  });
  els.btnStripChanges.addEventListener('click', () => switchMainTab('diff'));
  els.btnStripManifest.addEventListener('click', () => switchBottomTab('manifest'));
  els.btnStripExec.addEventListener('click', () => switchBottomTab('log'));
  els.btnStripSettings.addEventListener('click', openSettingsModal);

  // Sidebar
  els.btnOpenWorkspace.addEventListener('click', openWorkspace);
  els.btnRefreshTree.addEventListener('click', refreshFileTree);
  els.treeFilterInput.addEventListener('input', () => {
    const val = els.treeFilterInput.value.trim();
    els.btnTreeFilterClear.classList.toggle('hidden', !val);
    if (state.rawFileTree) {
      renderFileTree(state.rawFileTree, val.toLowerCase());
    }
  });
  els.btnTreeFilterClear.addEventListener('click', () => {
    els.treeFilterInput.value = '';
    els.btnTreeFilterClear.classList.add('hidden');
    if (state.rawFileTree) renderFileTree(state.rawFileTree);
  });
  els.btnCollapseAll.addEventListener('click', () => {
    document.querySelectorAll('.tree-children').forEach(c => { c.style.display = 'none'; });
    document.querySelectorAll('.tree-dir-toggle').forEach(t => { t.classList.remove('open'); });
  });

  // Welcome Screen actions
  els.btnOpenWorkspaceWelcome?.addEventListener('click', openWorkspace);
  els.btnTestConnectionWelcome?.addEventListener('click', checkConnection);
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      els.promptInput.value = chip.dataset.prompt || chip.textContent.trim();
      sendMessage();
    });
  });

  // Tabs
  els.tabBtnChat.addEventListener('click', () => switchMainTab('chat'));
  els.tabBtnDiff.addEventListener('click', () => switchMainTab('diff'));
  els.tabBtnPreview.addEventListener('click', () => switchMainTab('preview'));
  els.btnClosePreviewTab.addEventListener('click', (e) => {
    e.stopPropagation();
    els.tabBtnPreview.classList.add('hidden');
    switchMainTab('chat');
  });
  els.btnClearChat.addEventListener('click', () => {
    els.messagesContainer.innerHTML = '';
  });

  // Diff Pane
  els.btnApproveAll.addEventListener('click', approveChanges);
  els.btnRejectAll.addEventListener('click', rejectChanges);
  const initialDiffSwitch = $('btn-diff-empty-switch');
  if (initialDiffSwitch) {
    initialDiffSwitch.addEventListener('click', () => switchMainTab('chat'));
  }

  // Preview Pane
  els.btnPreviewAskCody.addEventListener('click', () => {
    if (state.currentPreviewFile) {
      els.promptInput.value = `Explain the implementation and role of ${state.currentPreviewFile} in this project.`;
      switchMainTab('chat');
      sendMessage();
    }
  });

  // Composer
  els.btnSend.addEventListener('click', sendMessage);
  els.btnStop.addEventListener('click', () => {
    if (state.activeTaskId) window.cody.cancelTask(state.activeTaskId);
  });
  els.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  els.promptInput.addEventListener('input', () => {
    els.promptInput.style.height = 'auto';
    els.promptInput.style.height = `${Math.min(els.promptInput.scrollHeight, 180)}px`;
  });

  // Bottom Tool Window
  els.tabBtnExecLog.addEventListener('click', () => switchBottomTab('log'));
  els.tabBtnTests.addEventListener('click', () => switchBottomTab('tests'));
  els.tabBtnManifestView.addEventListener('click', () => switchBottomTab('manifest'));
  els.btnToggleBottomCollapse.addEventListener('click', () => toggleBottomWindow());
  els.btnStatusToggleBottom.addEventListener('click', () => toggleBottomWindow());
  els.btnClearBottomLog.addEventListener('click', () => {
    els.execLog.innerHTML = '';
    els.bottomStatusMessage.textContent = '';
  });
  els.btnCopyBottomOutput.addEventListener('click', () => {
    navigator.clipboard.writeText(els.execLog.innerText);
    log('info', 'Execution log copied to clipboard');
  });
  els.btnRunTests.addEventListener('click', runWorkspaceTests);

  // Settings Modal
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
    const ep = els.settingEndpoint.value.trim();
    if (ep) await window.cody.saveSettings({ lmStudioEndpoint: ep });
    const res = await window.cody.testConnection();
    if (res.connected) {
      els.connTestResult.textContent = `✓ Connected (${res.models?.length || 0} models)`;
      els.connTestResult.className = 'conn-test-result success';
    } else {
      els.connTestResult.textContent = `✗ ${res.error || 'Connection failed'}`;
      els.connTestResult.className = 'conn-test-result error';
    }
  });
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  // Command Palette
  els.paletteSearchInput.addEventListener('input', () => {
    renderPaletteResults(els.paletteSearchInput.value);
  });
  els.paletteSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCommandPalette();
    if (e.key === 'Enter') {
      const first = els.paletteResults.querySelector('.palette-item');
      if (first) first.click();
    }
  });
  els.commandPalette.addEventListener('click', (e) => {
    if (e.target === els.commandPalette) closeCommandPalette();
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault();
      openCommandPalette();
    } else if (isCtrl && e.code === 'KeyO') {
      e.preventDefault();
      openWorkspace();
    } else if (isCtrl && e.code === 'Comma') {
      e.preventDefault();
      openSettingsModal();
    } else if (isCtrl && e.code === 'KeyB') {
      e.preventDefault();
      toggleSidebar();
    } else if (isCtrl && e.code === 'KeyJ') {
      e.preventDefault();
      toggleBottomWindow();
    } else if (isCtrl && e.code === 'KeyI') {
      e.preventDefault();
      toggleInspector();
    } else if (e.key === 'Escape') {
      if (!els.commandPalette.classList.contains('hidden')) closeCommandPalette();
      if (!els.settingsModal.classList.contains('hidden')) closeSettingsModal();
    }
  });

  setupResizers();
}

// ─── Global Helper for Code Block Copy ────────────────────────────────────────
window.copyCode = (btn) => {
  const codeEl = btn.closest('.code-block-container')?.querySelector('code');
  if (codeEl) {
    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
    });
  }
};

// ─── Initialization ───────────────────────────────────────────────────────────
async function init() {
  wireEvents();
  setupAgentListeners();
  await loadSettings();
  await checkConnection();

  // Restore existing workspace if active
  try {
    const manifestRes = await window.cody.getManifest();
    if (manifestRes.success && manifestRes.root) {
      await setupWorkspaceUI(manifestRes.root);
    }
  } catch (err) {
    console.warn('Could not restore workspace state', err);
  }

  setInterval(updateManifestAndContext, 30000);
  log('info', 'CODY IDE initialized');
}

init().catch(err => {
  console.error('Fatal initialization error:', err);
});
