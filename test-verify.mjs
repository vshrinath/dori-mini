#!/usr/bin/env node
// Self-check for the quote validator behind `semantic-index.mjs verify` (failure mode 2.3).
//
// The verdict itself comes from an LLM and cannot be unit-tested. What CAN be tested — and
// is the whole reason the check has any teeth — is the rule that a sufficient/partial
// verdict must carry a quote that genuinely appears in the source document on disk. If this
// validator is loose, the check degrades into taking the model's word for it, which is the
// exact failure (a confident answer with no grounding) that 2.3 is about.
//
// Mirrors the logic in semantic-index.mjs. Duplicated rather than imported because that
// file runs its CLI dispatch at module scope; test-ignore.mjs does the same for the same
// reason. checkQuote takes source text directly here so the test stays hermetic.
import assert from 'node:assert';

const MIN_QUOTE_CHARS = 12;

function normalizeForMatch(s) {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function checkQuote(quote, srcRaw) {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return { ok: false, why: 'too_short' };
  if (srcRaw === null) return { ok: false, why: 'source_unreadable' };
  const src = normalizeForMatch(srcRaw);
  if (!src.includes(q)) return { ok: false, why: 'not_in_source' };
  return { ok: true, why: 'ok' };
}

// A realistic slice of a meeting note, including the markdown line-wrap that makes a
// naive exact-substring match fail on quotes that are in fact verbatim.
const SOURCE = `# Video production oscars strategy

Discussed the awards slate. This year features a two-tier strategy
by contributor **Ronan Roy**.

Charles said the site tour narration would be handed to Aparna — he
didn't have the bandwidth this cycle.`;

// --- quotes that MUST verify -------------------------------------------------
// exact, single line
assert.deepEqual(checkQuote('by contributor **Ronan Roy**.', SOURCE), { ok: true, why: 'ok' });
// spans a markdown line break: verbatim in substance, different whitespace on disk
assert.deepEqual(
  checkQuote('This year features a two-tier strategy by contributor **Ronan Roy**.', SOURCE),
  { ok: true, why: 'ok' },
);
// model straightened the apostrophe and the em-dash
assert.deepEqual(
  checkQuote('handed to Aparna - he didn\'t have the bandwidth', SOURCE),
  { ok: true, why: 'ok' },
);
// case differences are not evidence of fabrication
assert.deepEqual(checkQuote('DISCUSSED THE AWARDS SLATE', SOURCE), { ok: true, why: 'ok' });
// markdown emphasis dropped while quoting prose — measured as a real intermittent false
// negative before this was normalized (Q9 flipped verdicts across runs on exactly this)
assert.deepEqual(
  checkQuote('This year features a two-tier strategy by contributor Ronan Roy.', SOURCE),
  { ok: true, why: 'ok' },
);
assert.deepEqual(checkQuote('by contributor Ronan Roy', SOURCE), { ok: true, why: 'ok' });
// ...but dropping formatting must not also let different WORDS through
assert.deepEqual(
  checkQuote('by contributor Ronan Royce', SOURCE),
  { ok: false, why: 'not_in_source' },
);

// --- quotes that MUST be rejected --------------------------------------------
// the teeth: plausible, on-topic, and entirely invented
assert.deepEqual(
  checkQuote('The Oscars coverage is written by Charles Assisi.', SOURCE),
  { ok: false, why: 'not_in_source' },
);
// two real fragments stitched into a claim the document never makes
assert.deepEqual(
  checkQuote('two-tier strategy handed to Aparna', SOURCE),
  { ok: false, why: 'not_in_source' },
);
// a single word or a heading is not evidence, even though it does appear
assert.deepEqual(checkQuote('Ronan', SOURCE), { ok: false, why: 'too_short' });
assert.deepEqual(checkQuote('  \n ', SOURCE), { ok: false, why: 'too_short' });

// The Part 14 contamination guard. 62 files carry an LLM-generated contextual prefix in
// their INDEXED text; that prefix was never written into the document. Validating against
// the file on disk is what makes a quote lifted from it fail — matching against the chunk
// text instead would have let this through as grounded.
const CONTEXT_PREFIX = 'This chunk is from a Founding Fuel meeting about Oscars video strategy.';
assert.deepEqual(checkQuote(CONTEXT_PREFIX, SOURCE), { ok: false, why: 'not_in_source' });
assert.equal(checkQuote(CONTEXT_PREFIX, CONTEXT_PREFIX + '\n\n' + SOURCE).ok, true,
  'sanity: the prefix WOULD have verified against chunk text — disk is what rejects it');

// fails closed when the source cannot be read, rather than trusting the model
assert.deepEqual(
  checkQuote('This year features a two-tier strategy', null),
  { ok: false, why: 'source_unreadable' },
);

console.log('verify quote validator: all assertions passed');
