'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { paths, ensureWorkspace, readConfig } = require('./config');

const TEXT_EXT = new Set([
  '.md', '.markdown', '.txt', '.text', '.rst', '.org',
  '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml',
  '.html', '.htm', '.xml',
]);

function sha(s, n = 10) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, n);
}

/** Strip HTML tags but preserve character count alignment as closely as practical. */
function stripHtml(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length))
    .replace(/<[^>]+>/g, m => ' '.repeat(m.length));
}

/**
 * Split text into chunks that stay inside paragraph boundaries where possible,
 * carrying exact [start, end) character offsets into the ORIGINAL text.
 *
 * The offsets are the reason this project uses lexical retrieval: a span is
 * only trustworthy if you can point at the characters it came from.
 */
function chunkText(text, targetChars) {
  const chunks = [];
  const paraRe = /\n\s*\n/g;
  const bounds = [];
  let last = 0;
  let m;
  while ((m = paraRe.exec(text)) !== null) {
    bounds.push([last, m.index]);
    last = m.index + m[0].length;
  }
  bounds.push([last, text.length]);

  let curStart = null;
  let curEnd = null;

  const flush = () => {
    if (curStart === null) return;
    const raw = text.slice(curStart, curEnd);
    if (raw.trim().length > 0) chunks.push({ start: curStart, end: curEnd, text: raw });
    curStart = null;
    curEnd = null;
  };

  for (const [s, e] of bounds) {
    if (text.slice(s, e).trim().length === 0) continue;
    const len = e - s;

    // A single paragraph larger than the target is split on sentence ends.
    if (len > targetChars * 1.6) {
      flush();
      let segStart = s;
      const sentRe = /[.!?]["')\]]?\s+/g;
      sentRe.lastIndex = 0;
      const local = text.slice(s, e);
      let mm;
      let cut = s;
      while ((mm = sentRe.exec(local)) !== null) {
        const abs = s + mm.index + mm[0].length;
        if (abs - segStart >= targetChars) {
          chunks.push({ start: segStart, end: abs, text: text.slice(segStart, abs) });
          segStart = abs;
        }
        cut = abs;
      }
      if (e > segStart) chunks.push({ start: segStart, end: e, text: text.slice(segStart, e) });
      continue;
    }

    if (curStart === null) {
      curStart = s;
      curEnd = e;
    } else if (e - curStart <= targetChars) {
      curEnd = e;
    } else {
      flush();
      curStart = s;
      curEnd = e;
    }
  }
  flush();
  return chunks;
}

function listFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  };
  walk(target);
  return out;
}

/**
 * Ingest files into the workspace corpus. Each source keeps its full original
 * text on disk so a span can always be re-resolved to real characters later,
 * even if the file moves or disappears (provenance decays - see docs).
 */
function ingest(cwd, target, opts = {}) {
  const p = ensureWorkspace(cwd);
  const cfg = readConfig(cwd);
  const targetChars = opts.chunkChars || cfg.chunk_target_chars;

  const files = listFiles(path.resolve(target));
  const manifestPath = path.join(p.corpus, 'sources.json');
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch { /* first ingest */ }

  const added = [];
  let chunkTotal = 0;

  for (const file of files) {
    let raw = fs.readFileSync(file, 'utf8');
    if (/\.html?$/i.test(file)) raw = stripHtml(raw);

    const id = 'src_' + sha(path.resolve(file));
    const title = deriveTitle(raw, file);
    const chunks = chunkText(raw, targetChars).map((c, i) => ({
      id: `${id}:${i}`,
      source_id: id,
      start: c.start,
      end: c.end,
      text: c.text.trim(),
    }));

    fs.writeFileSync(path.join(p.corpus, `${id}.txt`), raw);
    fs.writeFileSync(
      path.join(p.corpus, `${id}.chunks.json`),
      JSON.stringify(chunks, null, 2) + '\n'
    );

    manifest[id] = {
      id,
      title,
      file: path.resolve(file),
      chars: raw.length,
      chunks: chunks.length,
      ingested_at: new Date().toISOString(),
    };
    added.push(manifest[id]);
    chunkTotal += chunks.length;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { sources: added, total_sources: Object.keys(manifest).length, chunks: chunkTotal };
}

function deriveTitle(raw, file) {
  const h1 = /^#\s+(.+)$/m.exec(raw);
  if (h1) return h1[1].trim().slice(0, 160);
  const firstLine = raw.split(/\r?\n/).find(l => l.trim().length > 0);
  if (firstLine && firstLine.trim().length < 120) return firstLine.trim();
  return path.basename(file);
}

function loadManifest(cwd) {
  const p = paths(cwd);
  try {
    return JSON.parse(fs.readFileSync(path.join(p.corpus, 'sources.json'), 'utf8'));
  } catch {
    return {};
  }
}

function loadChunks(cwd) {
  const p = paths(cwd);
  const manifest = loadManifest(cwd);
  const all = [];
  for (const id of Object.keys(manifest)) {
    try {
      all.push(...JSON.parse(fs.readFileSync(path.join(p.corpus, `${id}.chunks.json`), 'utf8')));
    } catch { /* skip unreadable source */ }
  }
  return all;
}

/** Re-resolve a chunk to its exact characters in the original source text. */
function resolveSpan(cwd, chunkId) {
  const p = paths(cwd);
  const [sourceId] = chunkId.split(':');
  const chunks = JSON.parse(
    fs.readFileSync(path.join(p.corpus, `${sourceId}.chunks.json`), 'utf8')
  );
  const chunk = chunks.find(c => c.id === chunkId);
  if (!chunk) return null;
  const full = fs.readFileSync(path.join(p.corpus, `${sourceId}.txt`), 'utf8');
  const manifest = loadManifest(cwd);
  return {
    chunk_id: chunkId,
    source_id: sourceId,
    title: manifest[sourceId] ? manifest[sourceId].title : sourceId,
    file: manifest[sourceId] ? manifest[sourceId].file : null,
    start: chunk.start,
    end: chunk.end,
    text: full.slice(chunk.start, chunk.end),
  };
}

module.exports = { ingest, loadManifest, loadChunks, resolveSpan, chunkText, sha, listFiles };
