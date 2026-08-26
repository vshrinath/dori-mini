#!/usr/bin/env node
// Self-check for the reranker's fail-open contract, ported from dori-engine's
// SearchIndex.query (src/vector/index.ts). The property under test: a reranking failure
// must never fail the search — it must silently fall back to the first-stage ranking,
// exactly like real Dori's try/catch around this.reranker!.score(). Cannot test the
// cross-encoder's actual judgment here (that needs the real ONNX model, exercised by
// docs/eval-rerank-2026-08-26.mjs against the live vault) — this only tests the contract
// around it: what happens when scoring throws, returns short, or is disabled.
import assert from 'node:assert';

// Mirrors rerank()/rerankScores() in semantic-index.mjs, with a swappable scorer so this
// stays hermetic (no model load, no ONNX).
async function rerank(query, candidates, scoreFn, enabled = true) {
  if (!enabled || candidates.length <= 1) return candidates;
  try {
    const scores = await scoreFn(query, candidates.map((c) => c.text));
    return candidates
      .map((c, i) => ({ ...c, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return candidates;
  }
}

const candidates = [
  { chunkId: 'a', text: 'alpha document', score: 0.1 },
  { chunkId: 'b', text: 'beta document', score: 0.5 },
  { chunkId: 'c', text: 'gamma document', score: 0.3 },
];

// a working scorer reorders by its own scores, fully replacing first-stage scores
const working = async (_q, texts) => texts.map((t) => (t.startsWith('gamma') ? 0.9 : t.startsWith('alpha') ? 0.8 : 0.1));
const reordered = await rerank('q', candidates, working);
assert.deepEqual(reordered.map((c) => c.chunkId), ['c', 'a', 'b']);
assert.equal(reordered[0].score, 0.9, 'cross-encoder score must replace, not blend with, first-stage score');

// a throwing scorer must not throw the search — falls back to first-stage order, untouched
const throwing = async () => { throw new Error('model unavailable'); };
const fallback = await rerank('q', candidates, throwing);
assert.deepEqual(fallback, candidates, 'a reranking failure must return candidates unchanged, not partially scored');

// RERANK=0 (enabled=false) must skip scoring entirely — the scorer must never even be called
let called = false;
const spy = async (...args) => { called = true; return working(...args); };
const disabled = await rerank('q', candidates, spy, false);
assert.equal(called, false, 'disabled rerank must not invoke the scorer at all');
assert.deepEqual(disabled, candidates);

// a single candidate is not worth a model call — same short-circuit as the real code
const one = [{ chunkId: 'a', text: 'alpha', score: 0.1 }];
let calledForOne = false;
await rerank('q', one, async () => { calledForOne = true; return [1]; });
assert.equal(calledForOne, false, 'a single candidate must skip reranking, same as real Dori (candidates.length > 1)');

// a short score array (fewer scores than candidates) must not crash — undefined maps to 0,
// not thrown, matching `scores[i] ?? 0` rather than an out-of-bounds access
const shortScores = async () => [0.7]; // only one score for three candidates
const partial = await rerank('q', candidates, shortScores);
assert.equal(partial.find((c) => c.chunkId === 'b').score, 0, 'a missing score must default to 0, never throw or leave the old score');

console.log('reranker fail-open contract: all assertions passed');
