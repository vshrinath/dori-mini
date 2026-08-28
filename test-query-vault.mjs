#!/usr/bin/env node
// Minimal self-check for toPrefixOrQuery — the FTS query builder in query-vault.mjs,
// ported from dori-portal's real searchVaultDocumentsFts (lib/vault-indexer.ts), plus a
// dori-mini-only stopword filter and a dori-mini-only per-token quoting fix (see the
// function's own comment for why neither is upstream in dori-portal yet — the quoting
// fix in particular addresses a real crash bug confirmed in dori-portal itself: an
// unquoted hyphenated token like "Go-Live*" is misparsed by FTS5's own query grammar
// and throws "no such column: Live", not just a dori-mini divergence).
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in',
  'on', 'at', 'for', 'with', 'will', 'would', 'can', 'could', 'should', 'when', 'what',
  'who', 'whom', 'which', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'if',
  'then', 'so', 'do', 'does', 'did', 'has', 'have', 'had', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'not', 'no', 'yes',
]);

function toPrefixOrQuery(q) {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]/gu, '').trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  const meaningful = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  const kept = meaningful.length > 0 ? meaningful : tokens;
  return kept.map((t) => `"${t.replace(/"/g, '')}"*`).join(' OR ');
}

assert.equal(toPrefixOrQuery('Pulse'), '"Pulse"*');
assert.equal(toPrefixOrQuery('when will Pulse launch'), '"Pulse"* OR "launch"*');
assert.equal(toPrefixOrQuery('foo "bar" baz?'), '"foo"* OR "bar"* OR "baz"*');
assert.equal(toPrefixOrQuery('   '), '');
// all-stopword query: fall back to the unfiltered tokens rather than returning empty
assert.equal(toPrefixOrQuery('when will it be'), '"when"* OR "will"* OR "it"* OR "be"*');

// regression: a hyphenated token must not crash FTS5's query parser (real bug, confirmed
// against both an isolated in-memory FTS5 table and dori-portal's own searchVaultDocumentsFts
// source, 2026-08-26) — verify the actual query string executes cleanly, not just the shape.
{
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE t USING fts5(body)");
  db.prepare('INSERT INTO t(body) VALUES (?)').run('pre launch readiness sync monday cutover');
  const match = toPrefixOrQuery('Pre-Launch Readiness Sync Go-Live Window Monday cutover');
  const rows = db.prepare('SELECT * FROM t WHERE t MATCH ?').all(match);
  assert.ok(rows.length > 0, 'hyphenated query should match, not crash or return nothing');
}

console.log('toPrefixOrQuery: all assertions passed');
