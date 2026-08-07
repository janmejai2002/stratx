'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKSPACE_DIRNAME = '.stratx';

/**
 * Resolve the workspace root. Precedence, most explicit first:
 *   1. STRATX_WORKSPACE          - explicit override
 *   2. CLAUDE_PROJECT_DIR/.stratx - set by Claude Code
 *   3. <cwd>/.stratx
 *
 * Never inside the plugin directory: the plugin is read-only and shared,
 * the workspace is per-project and mutable. Keeping these apart is the
 * whole point (see docs/architecture.md).
 */
function workspaceRoot(cwd) {
  if (process.env.STRATX_WORKSPACE) return path.resolve(process.env.STRATX_WORKSPACE);
  const base = process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd();
  return path.join(path.resolve(base), WORKSPACE_DIRNAME);
}

function paths(cwd) {
  const root = workspaceRoot(cwd);
  return {
    root,
    config: path.join(root, 'config.json'),
    corpus: path.join(root, 'corpus'),
    index: path.join(root, 'index'),
    spans: path.join(root, 'spans'),
    runs: path.join(root, 'runs'),
    vault: path.join(root, 'vault'),
  };
}

function ensureWorkspace(cwd) {
  const p = paths(cwd);
  for (const dir of [p.root, p.corpus, p.index, p.spans, p.runs, p.vault]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return p;
}

const DEFAULTS = {
  grounding: 'local',
  model: '',
  spend_cap_usd: 5,
  chunk_target_chars: 900,
  retrieve_k: 12,
};

function readConfig(cwd) {
  const p = paths(cwd);
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(p.config, 'utf8'));
  } catch {
    /* no config yet - defaults apply */
  }
  return { ...DEFAULTS, ...onDisk };
}

function writeConfig(cwd, patch) {
  const p = ensureWorkspace(cwd);
  const next = { ...readConfig(cwd), ...patch };
  fs.writeFileSync(p.config, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Parse a dotenv-style file into a plain object. Tolerant of quotes and comments. */
function parseEnvFile(file) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Resolve the API key without ever putting it in a shell command or a
 * committed file. Precedence, most explicit first.
 */
function resolveKey(cwd) {
  const p = paths(cwd);
  const envFiles = [
    path.join(path.dirname(p.root), '.env'),
    path.join(p.root, '.env'),
    path.join(os.homedir(), '.stratx.env'),
  ];

  const candidates = [
    ['STRATX_API_KEY', process.env.STRATX_API_KEY],
    ['OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY],
    ['ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY],
    ['CLAUDE_PLUGIN_OPTION_API_KEY', process.env.CLAUDE_PLUGIN_OPTION_API_KEY],
  ];
  for (const file of envFiles) {
    const vars = parseEnvFile(file);
    for (const name of ['STRATX_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'APIKEY']) {
      if (vars[name]) candidates.push([`${name} (${file})`, vars[name]]);
    }
  }
  const stored = readConfig(cwd).api_key;
  if (stored) candidates.push(['config.json', stored]);

  for (const [source, value] of candidates) {
    if (value && String(value).trim()) {
      return { key: String(value).trim(), source, provider: detectProvider(String(value).trim()) };
    }
  }
  return null;
}

/** Infer the provider from the key shape so the user never has to declare it. */
function detectProvider(key) {
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  // Unprefixed keys are most commonly OpenRouter in this project's history.
  return 'openrouter';
}

const DEFAULT_MODELS = {
  openrouter: 'anthropic/claude-haiku-4.5',
  anthropic: 'claude-haiku-4-5-20251001',
};

function resolveModel(cwd, provider) {
  const cfg = readConfig(cwd);
  return cfg.model && cfg.model.trim() ? cfg.model.trim() : DEFAULT_MODELS[provider];
}

module.exports = {
  WORKSPACE_DIRNAME,
  DEFAULTS,
  DEFAULT_MODELS,
  workspaceRoot,
  paths,
  ensureWorkspace,
  readConfig,
  writeConfig,
  resolveKey,
  resolveModel,
  detectProvider,
  parseEnvFile,
};
