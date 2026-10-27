# CODY — Local AI Coding Workspace

> Privacy-first, local-only AI coding assistant powered by LM Studio.

CODY runs entirely on your machine. No data leaves your device.

---

## Quick Start

### Prerequisites

1. **Node.js v18+** (tested on v24)
2. **LM Studio** installed and running locally — [download here](https://lmstudio.ai)
3. A compatible model loaded in LM Studio (e.g. `Qwen2.5-Coder-7B-Instruct-GGUF`)

### Install & Run

```bash
# In the CODY project directory:
npm install
npm start
```

### Development mode (with DevTools)

```bash
npm run dev
```

### Run tests

```bash
npm test
```

---

## Configuring LM Studio

1. Launch LM Studio.
2. Navigate to **Models** and download `Qwen2.5-Coder-7B-Instruct` (Q4_K_M for 8 GB VRAM).
3. Navigate to **Local Server** (lightning bolt icon).
4. Click **Start Server** — default port is **1234**.
5. Verify: `http://127.0.0.1:1234/v1/models` should return the model list.

### LM Studio recommended settings for Qwen2.5-Coder-7B (RTX 5050 8 GB)

| Setting | Value |
|---|---|
| Context Length | 16384 |
| GPU Layers | Max (offload as many layers as fit) |
| Threads | 8 |
| Temperature | 0.1 (set in CODY) |

---

## Using CODY

1. **Open a workspace** — click "Open Workspace" and select your project directory.
2. **Explore files** in the left sidebar.
3. **Chat with the model** — describe what you want. CODY understands your project.
4. **Review proposed changes** — CODY will show a diff and ask for approval before touching files.
5. **Apply changes** — click "Apply Changes" to write files.

### Tips

- **Ctrl+,** opens Settings.
- **Enter** sends a message; **Shift+Enter** inserts a newline.
- Click any file in the tree to pre-fill a "read this file" prompt.
- The context usage bar shows how much of the model's context window is used.
- CODY auto-summarizes when context approaches the soft limit.

---

## Project Memory

CODY stores project state in `.cody/project_manifest.json` inside your workspace.

This file tracks:
- Architecture summary
- Tech stack
- Important files
- Completed tasks
- Pending tasks
- Known issues
- Decisions made

The manifest is updated after every successful operation and on context summarization. It enables CODY to resume work after restarting without losing project context.

**Do not commit `.cody/` to version control if it contains sensitive information.**

---

## Windows Packaging

```bash
npm run package    # creates unpacked app in out/
npm run make       # creates Windows installer
```

Requirements for packaging:
- Windows 10/11 host (Squirrel installer)
- Or use `maker-zip` for a portable ZIP

---

## Security Notes

- `nodeIntegration: false` — renderer has no direct Node.js access.
- `contextIsolation: true` — full isolation between main and renderer.
- All file operations validated against the workspace root (no traversal).
- Sensitive files (`.env`, `.pem`, `.key`) are excluded from indexing and reading.
- No remote API calls — all inference is local via LM Studio.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Disconnected" badge | Start LM Studio and load a model |
| No models in dropdown | Click Refresh in Settings |
| Context window errors | Reduce "Max Context Tokens" in Settings |
| Slow generation | Increase GPU layers in LM Studio |
| File write failed | Check workspace directory permissions |
| App won't start | Run `npm install` again |

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full architectural documentation.

## Known Limitations

- Context summarization requires a connected model. If LM Studio is unavailable, summarization is skipped.
- The verification (test runner) feature is scaffolded but not exposed in the UI in this release.
- Windows packaging requires `@electron-forge/maker-squirrel` which needs Windows host.
- Token counting uses a conservative character-based estimate, not an exact tokenizer.
