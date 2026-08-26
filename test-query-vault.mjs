#!/usr/bin/env node
// Minimal self-check for toPrefixOrQuery — the FTS query builder in query-vault.mjs,
// ported from dori-portal's real searchVaultDocumentsFts (lib/vault-indexer.ts), plus a
// dori-mini-only stopword filter (see the function's own comment for why it's not yet
// upstream in dori-portal).
import assert from 'node:assert';

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
  return kept.map((t) => `${t}*`).join(' OR ');
}

assert.equal(toPrefixOrQuery('Vybe'), 'Vybe*');
assert.equal(toPrefixOrQuery('when will Vybe launch'), 'Vybe* OR launch*');
assert.equal(toPrefixOrQuery('foo "bar" baz?'), 'foo* OR bar* OR baz*');
assert.equal(toPrefixOrQuery('   '), '');
// all-stopword query: fall back to the unfiltered tokens rather than returning empty
assert.equal(toPrefixOrQuery('when will it be'), 'when* OR will* OR it* OR be*');

console.log('toPrefixOrQuery: all assertions passed');
