#!/usr/bin/env node
// Self-check for query-vault.mjs's FTS-channel reranker wiring (Part 18): the parts that
// are specific to that channel and NOT covered by test-rerank.mjs (which tests the shared
// reranker.mjs contract). Two things matter here: internal fields (vault_id, the fetched
// full-text) must never leak into printed output, and a missing content row must fail open
// to the snippet rather than dropping the candidate or crashing.
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

// Mirrors attachContent/stripInternalFields in query-vault.mjs, against a throwaway
// in-memory db — hermetic, no dependency on the real vault.
function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE vault_documents (vault_id TEXT, rel_path TEXT, content TEXT, PRIMARY KEY (vault_id, rel_path))`);
  db.prepare('INSERT INTO vault_documents VALUES (?, ?, ?)').run('default', 'a.md', 'FULL BODY OF A');
  return db;
}

function attachContent(db, hits) {
  const stmt = db.prepare('SELECT content FROM vault_documents WHERE vault_id = ? AND rel_path = ?');
  return hits.map((h) => {
    const row = stmt.get(h.vault_id, h.rel_path);
    return { ...h, text: row?.content || h.snippet || '' };
  });
}
function stripInternalFields(hits) {
  return hits.map(({ vault_id, text, ...rest }) => rest);
}

const db = makeDb();

// the common case: content exists, gets attached as .text for scoring
const [withContent] = attachContent(db, [{ vault_id: 'default', rel_path: 'a.md', snippet: '…brief…' }]);
assert.equal(withContent.text, 'FULL BODY OF A', 'content lookup must key on (vault_id, rel_path) exactly');

// a row with no matching vault_documents entry (shouldn't happen given searchStmt's INNER
// JOIN, but must not crash if it ever does) falls back to the snippet, never throws
const [missingRow] = attachContent(db, [{ vault_id: 'default', rel_path: 'nonexistent.md', snippet: 'fallback snippet' }]);
assert.equal(missingRow.text, 'fallback snippet', 'a missing content row must fall back to the snippet, not throw or leave text empty');

// a missing row with no snippet either must degrade to empty string, not undefined/null —
// downstream rerank() does texts.map, and undefined would reach the tokenizer as a bad input
const [missingBoth] = attachContent(db, [{ vault_id: 'default', rel_path: 'nonexistent.md', snippet: null }]);
assert.equal(missingBoth.text, '', 'no content and no snippet must degrade to empty string, never null/undefined');

// vault_id and text must never reach printed output — these are the two fields fetched
// purely for scoring, and this file's own stated contract (top-of-file comment) is that
// stdout never carries full document content
const stripped = stripInternalFields([{ rel_path: 'a.md', title: 'A', snippet: 's', vault_id: 'default', text: 'FULL BODY', score: 0.9 }]);
assert.deepEqual(stripped[0], { rel_path: 'a.md', title: 'A', snippet: 's', score: 0.9 });
assert.equal('vault_id' in stripped[0], false);
assert.equal('text' in stripped[0], false);

// stripping must be a no-op (not throw, not drop other fields) on a hit that never went
// through reranking — the non-rerank path's shape must stay exactly what it was before
const untouched = stripInternalFields([{ rel_path: 'b.md', title: 'B', date: null, type: null, snippet: 's' }]);
assert.deepEqual(untouched[0], { rel_path: 'b.md', title: 'B', date: null, type: null, snippet: 's' });

console.log('FTS reranker wiring (content fetch + field stripping): all assertions passed');
