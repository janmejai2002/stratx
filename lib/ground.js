'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { paths, ensureWorkspace, readConfig } = require('./config');
const { loadChunks, loadManifest } = require('./corpus');
const { search, bestSentence } = require('./retrieve');
const { complete, parseJson } = require('./llm');
const ledger = require('./ledger');

const SYSTEM = `You are a research analyst that answers ONLY from supplied source spans.

Rules, in priority order:
1. Every factual assertion in your answer must be traceable to a span. Cite as [S1], [S3].
2. If the spans do not support something the question asks for, do NOT infer it into the
   answer as though it were established. Record it under "unsupported" instead.
3. Reporting what you could not support is as valuable as reporting what you could. Never
   omit an unsupported point to make the answer look cleaner.
4. Do not use knowledge outside the spans. If the spans are insufficient overall, say so.

Return ONLY a JSON object of this exact shape:
{
  "answer_md": "markdown prose. cite spans inline as [S1].",
  "claims": [
    {"text": "one self-contained factual assertion", "spans": ["S1"], "confidence": "direct|inferred"}
  ],
  "unsupported": [
    {"text": "the assertion that could not be supported", "searched_for": "what you looked for"}
  ]
}`;

function gist(text, n = 220) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : flat.slice(0, n - 1) + '…';
}

/**
 * Answer a question against the local corpus.
 *
 * Returns a COMPACT record by design. The full answer, every span and every
 * claim is written to disk; the caller receives ids and counts. This is the
 * single most important property of this function: a conversation that runs
 * forty of these must not accumulate forty full documents in its context.
 */
async function query(cwd, question, opts = {}) {
  const p = ensureWorkspace(cwd);
  const cfg = readConfig(cwd);
  const k = opts.k || cfg.retrieve_k;

  const chunks = loadChunks(cwd);
  if (chunks.length === 0) {
    const err = new Error('Corpus is empty. Add sources first: stratx ingest <file-or-folder>');
    err.code = 'ENOCORPUS';
    throw err;
  }

  const hits = search(chunks, question, k);
  if (hits.length === 0) {
    return persist(cwd, {
      question,
      answer_md: '',
      claims: [],
      unsupported: [{ text: question, searched_for: 'no lexical match in corpus' }],
      spans: [],
      retrieved: 0,
      usage: null,
    }, opts);
  }

  const manifest = loadManifest(cwd);
  const spanBlock = hits
    .map((h, i) => {
      const title = manifest[h.source_id] ? manifest[h.source_id].title : h.source_id;
      return `[S${i + 1}] (${title})\n${h.text}`;
    })
    .join('\n\n---\n\n');

  const prompt = `QUESTION\n${question}\n\nSOURCE SPANS\n\n${spanBlock}`;

  const res = await complete(cwd, {
    system: SYSTEM,
    prompt,
    maxTokens: opts.maxTokens || 1800,
  });

  ledger.record(cwd, {
    run: opts.run || null,
    phase: opts.phase || 'ground',
    op: 'ground.query',
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cost_usd: res.cost_usd,
    ms: res.ms,
  });

  const parsed = parseJson(res.text) || {};

  // Bind every cited span label back to a real chunk with real offsets, and
  // locate the specific sentence that carries the claim.
  const spans = hits.map((h, i) => ({
    label: `S${i + 1}`,
    chunk_id: h.chunk_id,
    source_id: h.source_id,
    title: manifest[h.source_id] ? manifest[h.source_id].title : h.source_id,
    file: manifest[h.source_id] ? manifest[h.source_id].file : null,
    start: h.start,
    end: h.end,
    score: h.score,
    text: h.text,
  }));
  const byLabel = new Map(spans.map(s => [s.label, s]));

  const claims = (parsed.claims || []).map((c, i) => {
    const labels = Array.isArray(c.spans) ? c.spans : [];
    const bound = labels
      .map(l => byLabel.get(String(l).replace(/[^A-Za-z0-9]/g, '')))
      .filter(Boolean)
      .map(s => {
        const sent = bestSentence(s.text, c.text || '');
        return {
          label: s.label,
          chunk_id: s.chunk_id,
          source_id: s.source_id,
          title: s.title,
          quote: sent ? sent.text : null,
          coverage: sent ? sent.coverage : 0,
          // sent.length is the ORIGINAL span length; sent.text has soft wraps
          // collapsed for display, so its length must not be used for offsets.
          char_start: sent ? s.start + sent.offset : s.start,
          char_end: sent ? s.start + sent.offset + sent.length : s.end,
        };
      });

    const best = bound.reduce((a, b) => (!a || b.coverage > a.coverage ? b : a), null);
    return {
      id: `cl_${i + 1}`,
      text: c.text || '',
      confidence: c.confidence === 'inferred' ? 'inferred' : 'direct',
      // A claim is only "supported" if we located an actual sentence that
      // carries it. A cited span with no matching sentence is not evidence.
      state: best && best.quote && best.coverage >= 0.34 ? 'supported' : 'unverified',
      evidence: bound,
    };
  });

  return persist(cwd, {
    question,
    answer_md: parsed.answer_md || '',
    claims,
    unsupported: parsed.unsupported || [],
    spans,
    retrieved: hits.length,
    usage: { ...res.usage, cost_usd: res.cost_usd, model: res.model, ms: res.ms },
  }, opts);
}

/** Write the full record to disk; hand back only what a caller needs to decide. */
function persist(cwd, record, opts = {}) {
  const p = ensureWorkspace(cwd);
  const id =
    'q_' + crypto.createHash('sha256')
      .update(record.question + String(Date.now()))
      .digest('hex').slice(0, 10);

  const full = { id, created_at: new Date().toISOString(), run: opts.run || null, ...record };
  fs.writeFileSync(path.join(p.spans, `${id}.json`), JSON.stringify(full, null, 2) + '\n');

  const supported = record.claims.filter(c => c.state === 'supported').length;
  return {
    id,
    file: path.join(p.spans, `${id}.json`),
    question: record.question,
    gist: gist(record.answer_md),
    retrieved: record.retrieved,
    claims_total: record.claims.length,
    claims_supported: supported,
    claims_unverified: record.claims.length - supported,
    unsupported: record.unsupported.length,
    sources: [...new Set(record.spans.map(s => s.source_id))].length,
    cost_usd: record.usage ? record.usage.cost_usd : 0,
  };
}

function load(cwd, id) {
  const p = paths(cwd);
  return JSON.parse(fs.readFileSync(path.join(p.spans, `${id}.json`), 'utf8'));
}

module.exports = { query, load, gist };
