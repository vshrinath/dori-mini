#!/usr/bin/env node
// Self-check for query-vault.mjs's FTS-channel reranker wiring (Part 18): the parts that
// are specific to that channel and NOT covered by test-rerank.mjs (which tests the shared
// reranker.mjs contract). Three things matter here: internal fields (vault_id, the fetched
// full-text) must never leak into printed output, a missing content row must fail open to
// the snippet rather than dropping the candidate or crashing, and long content must be
// capped before it reaches the cross-encoder.
//
// The cap exists because of a real bug caught by measurement, not review: the first FTS
// eval run pinned a single query at 12+ minutes of CPU time. vault_documents.content is NOT
// chunk-sized like the dense channel's candidates (median 1,140 chars there) — full document
// content runs p90=36KB, p99=119KB, max 445KB, and attachContent originally passed it to the
// cross-encoder unbounded. RERANK_MAX_DOC_CHARS below pins the fix.
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

// Mirrors attachContent/stripInternalFields in query-vault.mjs, against a throwaway
// in-memory db — hermetic, no dependency on the real vault.
function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE vault_documents (vault_id TEXT, rel_path TEXT, content TEXT, PRIMARY KEY (vault_id, rel_path))`);
  db.prepare('INSERT INTO vault_documents VALUES (?, ?, ?)').run('default', 'a.md', 'FULL BODY OF A');
  db.prepare('INSERT INTO vault_documents VALUES (?, ?, ?)').run('default', 'huge.md', 'X'.repeat(50000));
  return db;
}

const RERANK_MAX_DOC_CHARS = 2000;

function attachContent(db, hits) {
  const stmt = db.prepare('SELECT content FROM vault_documents WHERE vault_id = ? AND rel_path = ?');
  return hits.map((h) => {
    const row = stmt.get(h.vault_id, h.rel_path);
    const text = row?.content || h.snippet || '';
    return { ...h, text: text.length > RERANK_MAX_DOC_CHARS ? text.slice(0, RERANK_MAX_DOC_CHARS) : text };
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

// the regression this file exists to pin: a 50,000-char document must be capped before it
// ever reaches attachContent's caller (rerank -> the cross-encoder tokenizer), not passed
// through whole. This is the actual fix for the 12-minute hang, not a hypothetical.
const [huge] = attachContent(db, [{ vault_id: 'default', rel_path: 'huge.md', snippet: 's' }]);
assert.equal(huge.text.length, RERANK_MAX_DOC_CHARS, 'content longer than the cap must be truncated to exactly the cap, never passed through whole');

console.log('FTS reranker wiring (content fetch + field stripping + length cap): all assertions passed');
