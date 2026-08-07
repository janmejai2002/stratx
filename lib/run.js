'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { paths, ensureWorkspace } = require('./config');
const ledger = require('./ledger');

/**
 * The phase machine.
 *
 * The previous generation of this system expressed its process as prose in a
 * skill file - "MUST do X before Y" - which meant every guarantee was a
 * request to a model rather than a property of the system. Nothing enforced
 * that planning happened before spawning, and a crash mid-engagement lost
 * everything because no phase left a durable artifact.
 *
 * Here, ordering is enforced by construction: a phase cannot start until its
 * prerequisite has committed an artifact on disk, and any phase can be re-run
 * independently because its input is a file rather than a conversation.
 */
const PHASES = [
  { name: 'plan',       requires: null,          produces: 'plan.md',        label: 'Name the verticals this question actually implies' },
  { name: 'ground',     requires: 'plan',        produces: 'grounding.json', label: 'Establish the shared fact base from the corpus' },
  { name: 'assign',     requires: 'ground',      produces: 'assignments.json', label: 'Match verticals to specialists' },
  { name: 'execute',    requires: 'assign',      produces: 'claims.jsonl',   label: 'Specialists emit claims, not essays' },
  { name: 'challenge',  requires: 'execute',     produces: 'challenge.json', label: 'Red-team: contradictions, unsupported claims, omissions' },
  { name: 'synthesize', requires: 'challenge',   produces: 'synthesis.md',   label: 'Resolve across verticals into one narrative' },
  { name: 'compile',    requires: 'synthesize',  produces: 'report.html',    label: 'Render the reading surface' },
  { name: 'record',     requires: 'compile',     produces: 'retro.json',     label: 'Write learnings back to the vault' },
];

const PHASE_NAMES = PHASES.map(p => p.name);

function phaseDef(name) {
  return PHASES.find(p => p.name === name);
}

function runDir(cwd, runId) {
  return path.join(paths(cwd).runs, runId);
}

function runFile(cwd, runId) {
  return path.join(runDir(cwd, runId), 'run.json');
}

function create(cwd, goal) {
  ensureWorkspace(cwd);
  const id = crypto.createHash('sha256').update(goal + Date.now()).digest('hex').slice(0, 6);
  const dir = runDir(cwd, id);
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });

  const run = {
    id,
    goal,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    state: 'open',
    current_phase: 'plan',
    phases: Object.fromEntries(
      PHASES.map(p => [p.name, { state: 'queued', started_at: null, committed_at: null, artifact: null }])
    ),
  };
  fs.writeFileSync(runFile(cwd, id), JSON.stringify(run, null, 2) + '\n');
  return run;
}

function load(cwd, runId) {
  const id = runId || latestId(cwd);
  if (!id) {
    const err = new Error('No runs yet. Start one with: stratx run new "<your question>"');
    err.code = 'ENORUN';
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(runFile(cwd, id), 'utf8'));
  } catch {
    const err = new Error(`Run ${id} not found in ${paths(cwd).runs}`);
    err.code = 'ENORUN';
    throw err;
  }
}

function save(cwd, run) {
  run.updated_at = new Date().toISOString();
  fs.writeFileSync(runFile(cwd, run.id), JSON.stringify(run, null, 2) + '\n');
  return run;
}

function list(cwd) {
  const dir = paths(cwd).runs;
  let ids = [];
  try {
    ids = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
  return ids
    .map(id => { try { return JSON.parse(fs.readFileSync(runFile(cwd, id), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function latestId(cwd) {
  const all = list(cwd);
  return all.length ? all[0].id : null;
}

/** Start a phase. Refuses if its prerequisite has not committed an artifact. */
function start(cwd, runId, phase) {
  const def = phaseDef(phase);
  if (!def) {
    const err = new Error(`Unknown phase "${phase}". Valid: ${PHASE_NAMES.join(', ')}`);
    err.code = 'EPHASE';
    throw err;
  }
  const run = load(cwd, runId);

  if (def.requires) {
    const prev = run.phases[def.requires];
    if (prev.state !== 'committed') {
      const err = new Error(
        `Cannot start "${phase}": phase "${def.requires}" has not committed an artifact yet.\n` +
        `  Expected: ${path.join(runDir(cwd, run.id), 'artifacts', phaseDef(def.requires).produces)}\n` +
        `  Do that first, then: stratx run commit ${def.requires} --artifact <path>`
      );
      err.code = 'EPRECONDITION';
      throw err;
    }
  }

  run.phases[phase].state = 'running';
  run.phases[phase].started_at = new Date().toISOString();
  run.current_phase = phase;
  return save(cwd, run);
}

/** Commit a phase's artifact. This is what unlocks the next phase. */
function commit(cwd, runId, phase, artifactPath) {
  const def = phaseDef(phase);
  if (!def) {
    const err = new Error(`Unknown phase "${phase}". Valid: ${PHASE_NAMES.join(', ')}`);
    err.code = 'EPHASE';
    throw err;
  }
  const run = load(cwd, runId);
  const dir = path.join(runDir(cwd, run.id), 'artifacts');
  fs.mkdirSync(dir, { recursive: true });

  const target = artifactPath ? path.resolve(artifactPath) : path.join(dir, def.produces);
  if (!fs.existsSync(target)) {
    const err = new Error(
      `Cannot commit "${phase}": no artifact at ${target}\n` +
      `  A phase without a durable artifact did not happen, as far as any later phase is concerned.`
    );
    err.code = 'ENOARTIFACT';
    throw err;
  }

  run.phases[phase].state = 'committed';
  run.phases[phase].committed_at = new Date().toISOString();
  run.phases[phase].artifact = path.relative(runDir(cwd, run.id), target).split(path.sep).join('/');

  const idx = PHASE_NAMES.indexOf(phase);
  const next = PHASE_NAMES[idx + 1];
  run.current_phase = next || phase;
  if (!next) run.state = 'complete';
  return save(cwd, run);
}

/** What should happen next, and why. Read this instead of re-reading history. */
function next(cwd, runId) {
  const run = load(cwd, runId);
  const t = ledger.totals(cwd, run.id);

  for (const def of PHASES) {
    const st = run.phases[def.name];
    if (st.state === 'committed') continue;
    const blocked =
      def.requires && run.phases[def.requires].state !== 'committed'
        ? def.requires
        : null;
    return {
      run: run.id,
      goal: run.goal,
      state: run.state,
      next_phase: def.name,
      phase_state: st.state,
      what: def.label,
      expected_artifact: path.join(runDir(cwd, run.id), 'artifacts', def.produces),
      blocked_by: blocked,
      spend: { cost_usd: t.cost_usd, calls: t.calls, tokens: t.input_tokens + t.output_tokens },
    };
  }
  return {
    run: run.id,
    goal: run.goal,
    state: 'complete',
    next_phase: null,
    what: 'All phases committed.',
    spend: { cost_usd: t.cost_usd, calls: t.calls, tokens: t.input_tokens + t.output_tokens },
  };
}

module.exports = { PHASES, PHASE_NAMES, create, load, save, list, start, commit, next, runDir, phaseDef };
