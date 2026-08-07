'use strict';

/**
 * Lexical retrieval (BM25). Deliberately not embeddings, for three reasons:
 *   1. Zero cost and zero network - indexing works offline, so the API key is
 *      only ever spent on reasoning.
 *   2. Zero dependencies - nothing to install, which is what makes this
 *      portable to a machine that is not the author's.
 *   3. Term positions are exact, so a retrieved span resolves to real
 *      character offsets rather than an approximate neighbourhood.
 *
 * Embeddings are a later upgrade behind the same interface, not a rewrite.
 */

const STOP = new Set(
  ('a an and are as at be but by for from has have how in into is it its of on or that the to was were what when where which who will with this these those there their they i you we he she him her his hers our your not no do does did done can could should would may might must about above after again against all also am any because been before being below between both during each few further here more most other over own same so some such than then through under until up very via while' )
    .split(/\s+/)
);

function tokenize(text) {
  const out = [];
  const re = /[A-Za-z0-9][A-Za-z0-9._%-]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase().replace(/^[._-]+|[._-]+$/g, '');
    if (t.length < 2 || STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

const K1 = 1.4;
const B = 0.72;

function buildIndex(chunks) {
  const docs = chunks.map(c => {
    const terms = tokenize(c.text);
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    return { chunk: c, tf, len: terms.length };
  });

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

  const N = docs.length || 1;
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / N || 1;

  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));

  return { docs, idf, avgLen, N };
}

function score(index, queryTerms) {
  const { docs, idf, avgLen } = index;
  const results = [];
  for (const d of docs) {
    let s = 0;
    let hits = 0;
    for (const t of queryTerms) {
      const f = d.tf.get(t);
      if (!f) continue;
      hits++;
      const w = idf.get(t) || 0;
      s += w * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (d.len / avgLen))));
    }
    if (s > 0) results.push({ chunk: d.chunk, score: s, matched: hits });
  }
  return results;
}

/**
 * Retrieve top-k chunks for a query, capped per source so one verbose
 * document cannot crowd out the rest of the corpus.
 */
function search(chunks, query, k = 12, perSourceCap = 4) {
  const index = buildIndex(chunks);
  const qTerms = [...new Set(tokenize(query))];
  if (qTerms.length === 0) return [];

  const scored = score(index, qTerms).sort((a, b) => b.score - a.score);

  const perSource = new Map();
  const picked = [];
  for (const r of scored) {
    const sid = r.chunk.source_id;
    const n = perSource.get(sid) || 0;
    if (n >= perSourceCap) continue;
    perSource.set(sid, n + 1);
    picked.push(r);
    if (picked.length >= k) break;
  }

  const top = picked.length ? picked[0].score : 1;
  return picked.map(r => ({
    chunk_id: r.chunk.id,
    source_id: r.chunk.source_id,
    start: r.chunk.start,
    end: r.chunk.end,
    text: r.chunk.text,
    score: Number(r.score.toFixed(4)),
    relative: Number((r.score / (top || 1)).toFixed(3)),
    matched_terms: r.matched,
  }));
}

/**
 * Locate the exact sentence inside a chunk that best supports a claim.
 * This is what turns "the source is relevant" into "the source says this",
 * which is the only signal worth showing a reader.
 */
function splitSentences(text) {
  // Sentences end at . ! ? or a blank line - never at a soft line wrap.
  // Source files wrap prose at arbitrary columns, and treating those wraps as
  // sentence boundaries truncates quotes mid-clause, which destroys the only
  // thing a span is for.
  const sentences = [];
  let start = 0;
  const isHeadingLine = at => /^[^\S\n]*#{1,6}\s/.test(text.slice(at));

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isTerminator = ch === '.' || ch === '!' || ch === '?';
    // A paragraph break is this newline followed by another one (blank line).
    // Testing from `i` instead of `i + 1` would match the newline against
    // itself and treat every soft wrap as a break.
    const isParaBreak = ch === '\n' && /^[^\S\n]*\n/.test(text.slice(i + 1));
    // A markdown heading is its own unit: it must not be glued onto the
    // sentence that follows it, or every quote inherits a section title.
    const isHeadingBreak =
      ch === '\n' && (isHeadingLine(i + 1) || isHeadingLine(start));

    if (isTerminator) {
      // Not a boundary if it is a decimal point or a common abbreviation.
      const prev = text[i - 1];
      const next = text[i + 1];
      if (ch === '.' && /\d/.test(prev || '') && /\d/.test(next || '')) continue;
      if (ch === '.' && /[A-Z]/.test(prev || '') && !/\s/.test(next || '')) continue;
      let end = i + 1;
      while (end < text.length && /["')\]]/.test(text[end])) end++;
      if (end >= text.length || /\s/.test(text[end])) {
        pushSentence(sentences, text, start, end);
        start = end;
      }
    } else if (isParaBreak || isHeadingBreak) {
      pushSentence(sentences, text, start, i);
      start = i;
    }
  }
  pushSentence(sentences, text, start, text.length);
  return sentences;
}

function pushSentence(acc, text, from, to) {
  const raw = text.slice(from, to);
  const lead = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (trimmed.length > 12) {
    // Collapse soft wraps so the quote reads as one line, while the offset
    // still points at the real characters in the source.
    acc.push({ text: trimmed.replace(/\s*\n\s*/g, ' '), offset: from + lead, length: trimmed.length });
  }
}

/**
 * Locate the exact sentence inside a chunk that best supports a claim.
 * This is what turns "the source is relevant" into "the source says this",
 * which is the only signal worth showing a reader.
 */
function bestSentence(chunkText, claim) {
  const claimTermList = tokenize(claim);
  const claimTerms = new Set(claimTermList);
  if (claimTerms.size === 0) return null;

  // Numbers and years carry far more identifying weight than ordinary words:
  // two sentences about battery prices differ precisely by their figures.
  const claimNumbers = new Set(claimTermList.filter(t => /\d/.test(t)));

  const sentences = splitSentences(chunkText);
  if (sentences.length === 0) return null;

  let best = null;
  for (const s of sentences) {
    const terms = new Set(tokenize(s.text));
    if (!terms.size) continue;

    let hit = 0;
    for (const t of terms) if (claimTerms.has(t)) hit++;
    const coverage = hit / claimTerms.size;

    let numHit = 0;
    for (const n of claimNumbers) if (terms.has(n)) numHit++;
    const numScore = claimNumbers.size ? numHit / claimNumbers.size : 0;

    // Weighted so a sentence carrying the claim's figures wins over one that
    // merely shares its vocabulary.
    const rank = coverage + numScore * 1.25;

    if (!best || rank > best.rank) {
      best = { ...s, rank, coverage: Number(coverage.toFixed(3)), number_match: Number(numScore.toFixed(3)) };
    }
  }
  return best && best.rank > 0 ? best : null;
}

module.exports = { search, tokenize, buildIndex, bestSentence, splitSentences };
