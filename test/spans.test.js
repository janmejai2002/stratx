'use strict';

/**
 * Span fidelity tests.
 *
 * Everything this project claims rests on one property: a quote shown to a
 * reader is the WHOLE sentence the source actually contains, and its offsets
 * point at the real characters. Run with: node --test test/
 */

const test = require('node:test');
const assert = require('node:assert');

const { bestSentence, splitSentences } = require('../lib/retrieve');
const { chunkText } = require('../lib/corpus');

// Prose wrapped at an arbitrary column, exactly as it appears in a real file.
const WRAPPED = `Volume-weighted average pack prices in Southeast Asia reached USD 81 per kilowatt-hour
in the second quarter of 2026, down from USD 96 in the same quarter of 2025.

Cell chemistry mix has shifted decisively toward lithium iron phosphate, which now
accounts for roughly 71 percent of regional pack shipments.`;

test('a soft line wrap does not end a sentence', () => {
  const sentences = splitSentences(WRAPPED);
  assert.strictEqual(sentences.length, 2, 'two sentences, not four fragments');
  assert.ok(
    sentences[0].text.includes('USD 81') && sentences[0].text.includes('USD 96'),
    'the first sentence must carry both figures - it is one sentence in the source'
  );
});

test('quotes collapse soft wraps but offsets still point at real characters', () => {
  const s = splitSentences(WRAPPED)[0];
  assert.ok(!s.text.includes('\n'), 'displayed quote is a single line');
  const original = WRAPPED.slice(s.offset, s.offset + s.length);
  assert.ok(original.startsWith('Volume-weighted'), 'offset points at the sentence start');
  assert.ok(original.trimEnd().endsWith('2025.'), 'length covers the whole sentence');
});

test('the sentence carrying the claim figure wins over a vocabulary match', () => {
  // Both sentences below are about pack prices; only one contains 96/2025.
  const text = `Pack prices reached USD 81 per kilowatt-hour in 2026.
Earlier pack prices stood at USD 96 per kilowatt-hour in 2025.`;
  const hit = bestSentence(text, 'battery pack cost was USD 96 per kilowatt-hour in 2025');
  assert.ok(hit, 'a sentence was located');
  assert.ok(hit.text.includes('96'), `expected the 96 sentence, got: ${hit.text}`);
});

test('a decimal point does not split a sentence', () => {
  const text = 'The threshold rose to 40.5 percent for the compliance year.';
  assert.strictEqual(splitSentences(text).length, 1);
});

test('an unrelated claim produces no false span', () => {
  assert.strictEqual(bestSentence(WRAPPED, 'zebra migration patterns in Patagonia'), null);
});

test('a markdown heading is not glued onto the sentence beneath it', () => {
  const doc = `## Indonesia
Domestic content requirements rise to 40 percent for the 2027 compliance year
for battery electric two-wheelers.`;
  const hit = bestSentence(doc, 'Indonesia domestic content requirement is 40 percent in 2027');
  assert.ok(hit, 'a sentence was located');
  assert.ok(!hit.text.includes('##'), `heading leaked into the quote: ${hit.text}`);
  assert.ok(hit.text.startsWith('Domestic content'), `unexpected quote start: ${hit.text}`);
});

test('chunk offsets round-trip to the original text', () => {
  const doc = 'Alpha paragraph one.\n\nBeta paragraph two.\n\nGamma paragraph three.';
  for (const c of chunkText(doc, 20)) {
    assert.strictEqual(doc.slice(c.start, c.end), c.text, 'chunk offsets must be exact');
  }
});
