'use strict';

const fs = require('fs');
const path = require('path');
const { ensureWorkspace } = require('./config');

/**
 * Append-only token and cost ledger.
 *
 * Written by code, never by a model deciding to remember. The earlier version
 * of this system claimed compounding memory while its ledger sat empty; the
 * fix is that nothing here depends on anyone choosing to record it.
 */
function record(cwd, entry) {
  const p = ensureWorkspace(cwd);
  const file = path.join(p.root, 'ledger.jsonl');
  const row = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
  return row;
}

function read(cwd) {
  const p = ensureWorkspace(cwd);
  const file = path.join(p.root, 'ledger.jsonl');
  try {
    return fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function totals(cwd, runId) {
  const rows = read(cwd).filter(r => !runId || r.run === runId);
  const t = { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, by_phase: {} };
  for (const r of rows) {
    t.calls += 1;
    t.input_tokens += r.input_tokens || 0;
    t.output_tokens += r.output_tokens || 0;
    t.cost_usd += r.cost_usd || 0;
    const ph = r.phase || 'unphased';
    if (!t.by_phase[ph]) t.by_phase[ph] = { calls: 0, tokens: 0, cost_usd: 0 };
    t.by_phase[ph].calls += 1;
    t.by_phase[ph].tokens += (r.input_tokens || 0) + (r.output_tokens || 0);
    t.by_phase[ph].cost_usd = Number((t.by_phase[ph].cost_usd + (r.cost_usd || 0)).toFixed(6));
  }
  t.cost_usd = Number(t.cost_usd.toFixed(6));
  return t;
}

module.exports = { record, read, totals };
