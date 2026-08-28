#!/usr/bin/env node
// Self-check for the reranker's fail-open contract (reranker.mjs, shared by
// semantic-index.mjs's dense channel and query-vault.mjs's FTS channel -- Parts 17-18). The
// property under test: a reranking failure must never fail the search -- it must silently
// fall back to the first-stage ranking, exactly like real Dori's try/catch around
// this.reranker!.score(). Imports rerankWithScorer directly with a fake scorer, so this
// tests the REAL contract logic, not a hand-mirrored copy of it -- no model load, no ONNX.
// The cross-encoder's actual judgment needs the real model, exercised against the live
// vault by docs/eval-rerank-2026-08-26.mjs and docs/eval-rerank-fts-2026-08-26.mjs.
import assert from 'node:assert';
import { rerankWithScorer } from '../reranker.mjs';

const candidates = [
  { chunkId: 'a', text: 'alpha document', score: 0.1 },
  { chunkId: 'b', text: 'beta document', score: 0.5 },
  { chunkId: 'c', text: 'gamma document', score: 0.3 },
];

// a working scorer reorders by its own scores, fully replacing first-stage scores
const working = async (_q, texts) => texts.map((t) => (t.startsWith('gamma') ? 0.9 : t.startsWith('alpha') ? 0.8 : 0.1));
const reordered = await rerankWithScorer('q', candidates, working, true);
assert.deepEqual(reordered.map((c) => c.chunkId), ['c', 'a', 'b']);
assert.equal(reordered[0].score, 0.9, 'cross-encoder score must replace, not blend with, first-stage score');

// a throwing scorer must not throw the search -- falls back to first-stage order, untouched
const throwing = async () => { throw new Error('model unavailable'); };
const fallback = await rerankWithScorer('q', candidates, throwing, true);
assert.deepEqual(fallback, candidates, 'a reranking failure must return candidates unchanged, not partially scored');

// enabled=false must skip scoring entirely -- the scorer must never even be called
let called = false;
const spy = async (...args) => { called = true; return working(...args); };
const disabled = await rerankWithScorer('q', candidates, spy, false);
assert.equal(called, false, 'disabled rerank must not invoke the scorer at all');
assert.deepEqual(disabled, candidates);

// a single candidate is not worth a model call -- same short-circuit as real Dori
const one = [{ chunkId: 'a', text: 'alpha', score: 0.1 }];
let calledForOne = false;
await rerankWithScorer('q', one, async () => { calledForOne = true; return [1]; }, true);
assert.equal(calledForOne, false, 'a single candidate must skip reranking, same as real Dori (candidates.length > 1)');

// a short score array (fewer scores than candidates) must not crash -- undefined maps to 0,
// not thrown, matching `scores[i] ?? 0` rather than an out-of-bounds access
const shortScores = async () => [0.7]; // only one score for three candidates
const partial = await rerankWithScorer('q', candidates, shortScores, true);
assert.equal(partial.find((c) => c.chunkId === 'b').score, 0, 'a missing score must default to 0, never throw or leave the old score');

// default `enabled` param must follow RERANK_ENABLED (module default) when omitted -- smoke
// check that the signature still works with 3 args, matching semantic-index.mjs's call site
const defaulted = await rerankWithScorer('q', candidates, working);
assert.equal(Array.isArray(defaulted), true);

console.log('reranker fail-open contract: all assertions passed');
