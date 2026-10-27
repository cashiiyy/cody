'use strict';

const { z } = require('zod');

// ─── File Operation Schemas ──────────────────────────────────────────────────

const CreateFileActionSchema = z.object({
  type: z.literal('create_file'),
  path: z.string().min(1),
  content: z.string(),
});

const EditFileActionSchema = z.object({
  type: z.literal('edit_file'),
  path: z.string().min(1),
  content: z.string(),
});

const ReadFileActionSchema = z.object({
  type: z.literal('read_file'),
  path: z.string().min(1),
});

const DeleteFileActionSchema = z.object({
  type: z.literal('delete_file'),
  path: z.string().min(1),
  reason: z.string().optional(),
});

const FileActionSchema = z.discriminatedUnion('type', [
  CreateFileActionSchema,
  EditFileActionSchema,
  ReadFileActionSchema,
  DeleteFileActionSchema,
]);

const FileOperationBatchSchema = z.object({
  actions: z.array(FileActionSchema).min(1).max(50),
});

// ─── Project Manifest Schema ─────────────────────────────────────────────────

const ManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  projectName: z.string(),
  lastUpdated: z.string(),
  architectureSummary: z.string(),
  techStack: z.array(z.string()),
  fileTree: z.array(z.object({
    path: z.string(),
    type: z.enum(['file', 'directory']),
    size: z.number().optional(),
    modified: z.string().optional(),
    language: z.string().optional(),
  })),
  importantFiles: z.array(z.string()),
  decisions: z.array(z.string()),
  completedTasks: z.array(z.string()),
  pendingTasks: z.array(z.string()),
  knownIssues: z.array(z.string()),
  currentTask: z.string().nullable(),
  unresolvedQuestions: z.array(z.string()),
  lastVerifiedState: z.string().nullable(),
});

// ─── Settings Schema ─────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  lmStudioEndpoint: z.string().url(),
  activeModel: z.string(),
  temperature: z.number().min(0).max(2),
  maxContextTokens: z.number().int().positive(),
  softLimitTokens: z.number().int().positive(),
  responseReserveTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  requestTimeoutMs: z.number().int().positive(),
  theme: z.enum(['dark']),
  lastWorkspace: z.string().nullable(),
  defaultAutoApprove: z.boolean(),
  indexExclusions: z.array(z.string()),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
});

// ─── Task Lifecycle Schema ────────────────────────────────────────────────────

const TaskPhase = z.enum([
  'idle',
  'planning',
  'generating',
  'awaiting_approval',
  'applying',
  'verifying',
  'completed',
  'error',
  'cancelled',
]);

const CheckpointSchema = z.object({
  taskId: z.string(),
  userRequest: z.string(),
  phase: TaskPhase,
  plannedOperations: z.array(FileActionSchema).default([]),
  appliedOperations: z.array(z.object({
    action: FileActionSchema,
    success: z.boolean(),
    error: z.string().optional(),
    timestamp: z.string(),
  })).default([]),
  pendingApprovals: z.array(FileActionSchema).default([]),
  verificationResult: z.object({
    command: z.string(),
    exitCode: z.number().nullable(),
    output: z.string(),
    passed: z.boolean(),
  }).nullable().default(null),
  errors: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── IPC Event Names ──────────────────────────────────────────────────────────

const IPC_EVENTS = Object.freeze({
  // Agent → Renderer
  AGENT_START:            'agent:start',
  AGENT_TOKEN:            'agent:token',
  AGENT_STATUS:           'agent:status',
  AGENT_PLAN:             'agent:plan',
  AGENT_PROPOSED_CHANGES: 'agent:proposed-changes',
  AGENT_APPROVAL_REQUIRED:'agent:approval-required',
  AGENT_FILE_OPERATION:   'agent:file-operation',
  AGENT_VERIFICATION:     'agent:verification',
  AGENT_ERROR:            'agent:error',
  AGENT_COMPLETE:         'agent:complete',
  AGENT_CANCELLED:        'agent:cancelled',

  // Renderer → Main (invoke channels)
  INVOKE_START_TASK:      'invoke:start-task',
  INVOKE_CANCEL_TASK:     'invoke:cancel-task',
  INVOKE_APPROVE_CHANGES: 'invoke:approve-changes',
  INVOKE_REJECT_CHANGES:  'invoke:reject-changes',
  INVOKE_SELECT_WORKSPACE:'invoke:select-workspace',
  INVOKE_GET_FILE_TREE:   'invoke:get-file-tree',
  INVOKE_READ_FILE:       'invoke:read-file',
  INVOKE_GET_SETTINGS:    'invoke:get-settings',
  INVOKE_SAVE_SETTINGS:   'invoke:save-settings',
  INVOKE_TEST_CONNECTION: 'invoke:test-connection',
  INVOKE_LIST_MODELS:     'invoke:list-models',
  INVOKE_GET_MANIFEST:    'invoke:get-manifest',
  INVOKE_GET_CHECKPOINTS: 'invoke:get-checkpoints',
  INVOKE_RUN_COMMAND:     'invoke:run-command',
});

// ─── Default Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  lmStudioEndpoint: 'http://127.0.0.1:1234/v1',
  activeModel: '',
  temperature: 0.1,
  maxContextTokens: 16384,
  softLimitTokens: 12000,
  responseReserveTokens: 2048,
  maxOutputTokens: 4096,
  requestTimeoutMs: 120000,
  theme: 'dark',
  lastWorkspace: null,
  defaultAutoApprove: false,
  indexExclusions: [
    'node_modules', '.git', '.venv', 'venv', '__pycache__',
    'dist', 'build', 'out', '.next', '.nuxt',
    '.cache', 'coverage', '.nyc_output',
    '*.env', '*.pem', '*.key', '*.p12',
  ],
  logLevel: 'info',
};

const DEFAULT_MANIFEST = {
  schemaVersion: 1,
  projectName: '',
  lastUpdated: '',
  architectureSummary: '',
  techStack: [],
  fileTree: [],
  importantFiles: [],
  decisions: [],
  completedTasks: [],
  pendingTasks: [],
  knownIssues: [],
  currentTask: null,
  unresolvedQuestions: [],
  lastVerifiedState: null,
};

// ─── File Extension → Language Map ───────────────────────────────────────────

const EXT_TO_LANGUAGE = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown', '.mdx': 'markdown',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.bat': 'batch', '.cmd': 'batch', '.ps1': 'powershell',
  '.sql': 'sql',
  '.xml': 'xml',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.tf': 'terraform', '.hcl': 'terraform',
};

// Max file size to index (bytes)
const MAX_INDEXABLE_FILE_SIZE = 1024 * 1024; // 1 MB
// Max file size to read into context (bytes)
const MAX_READABLE_FILE_SIZE = 512 * 1024; // 512 KB
// Binary-extension list
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.bz2', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.woff', '.woff2', '.ttf', '.eot',
  '.db', '.sqlite', '.sqlite3',
  '.bin', '.dat',
  '.lock',
]);

const CODY_DIR = '.cody';
const MANIFEST_FILENAME = 'project_manifest.json';
const CHECKPOINTS_DIR = 'checkpoints';
const MAX_FILE_SIZE_WRITE = 10 * 1024 * 1024; // 10 MB

module.exports = {
  FileActionSchema,
  FileOperationBatchSchema,
  ManifestSchema,
  SettingsSchema,
  TaskPhase,
  CheckpointSchema,
  IPC_EVENTS,
  DEFAULT_SETTINGS,
  DEFAULT_MANIFEST,
  EXT_TO_LANGUAGE,
  MAX_INDEXABLE_FILE_SIZE,
  MAX_READABLE_FILE_SIZE,
  BINARY_EXTENSIONS,
  CODY_DIR,
  MANIFEST_FILENAME,
  CHECKPOINTS_DIR,
  MAX_FILE_SIZE_WRITE,
};
