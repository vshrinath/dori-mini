#!/usr/bin/env node
// Read-only recall over the vault FTS cache. Default stdout never includes
// vault_documents.content / raw / rendered_html — those only appear with --full.
// Use this instead of sqlite3 SELECT content or reading the Markdown file.
//
// Meeting section names match mom-prompt.md (### Decisions Log, ### Action Items, …).
// Reads dori-portal's REAL vault_documents table at ~/proto-space/dori/store/portal.db
// (override with VAULT_INDEX_DB) — same file reindex-vault.mjs writes into, and the same
// one the live dori-portal app reads, so this is never stale relative to that app.
//
// Usage:
//   node query-vault.mjs last-meeting [--person <name>] [--sections decisions,actions] [--full]
//   node query-vault.mjs show <path-or-title> [--sections decisions,actions] [--full]
//   node query-vault.mjs search "<keywords>" [--limit 5]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { RERANK_ENABLED, RERANK_CANDIDATE_MULTIPLIER, rerank } from './reranker.mjs';
import { discoverProjects, discoverPeople, matchProject } from './scope.mjs';

const DB_PATH = process.env.VAULT_INDEX_DB || resolve(homedir(), 'proto-space/dori/store/portal.db');
const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
// Opt-in and unproven — see docs/eval-scope-2026-08-26.mjs before flipping the default.
// Fails open (matchProject returns null on 0 or >1 hits): a wrong scope would silently
// exclude the right document, worse than not scoping at all.
const SCOPE_ENABLED = process.env.SCOPE === '1';
const DEFAULT_SECTIONS = ['decisions', 'actions'];
// Mirrors real dori-portal's searchVaultDocumentsFts (lib/vault-indexer.ts:115,
// `Math.min(Math.max(options?.limit ?? 20, 1), 50)`). dori-mini previously used 5/8,
// an unmirrored divergence that silently clamped every `--limit 20` to 8 — see the
// correction in docs/research-benchmarks-2026-08-26.md Part 9. Independently, retrieval
// research finds top-20 outperforming top-10/top-5, so the real product's values are
// also the better ones.
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const CANDIDATE_LIMIT = 25;
const PREVIEW_CHARS = 400;

const SECTION_HEADINGS = {
  decisions: ['### Decisions Log', '## Decisions Log'],
  actions: ['### Action Items', '## Action Items'],
  unresolved: ['### Unresolved Questions', '## Unresolved Questions'],
  followup: ['### Follow-up', '## Follow-up'],
  insights: ['### Key Insights', '## Key Insights'],
  blockers: ['### Dependencies & Blockers', '## Dependencies & Blockers'],
  metadata: ['### Meeting Metadata', '## Meeting Metadata'],
  attendees: ['### Attendees', '## Attendees'],
};

function usage(msg) {
  if (msg) console.error(msg);
  console.error(`Usage:
  node query-vault.mjs last-meeting [--person <name>] [--sections decisions,actions] [--full]
  node query-vault.mjs show <path-or-title> [--sections decisions,actions] [--full]
  node query-vault.mjs search "<keywords>" [--limit ${DEFAULT_SEARCH_LIMIT}]
  node query-vault.mjs search-multi "<phrasing 1>" "<phrasing 2>" ["<phrasing 3>"] [--limit ${DEFAULT_SEARCH_LIMIT}]
  node query-vault.mjs stats`);
  process.exit(1);
}

// Mirrors dori-engine's fix(search): compute real isStale in SearchIndex.vaultStats()
// (commit 5f88e2d) — this cache has no live write/reconcile-debt tracker to push a flag,
// so isStale here is computed directly from disk mtime vs. the indexed mtime instead.
function walkMd(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function statsCmd(db) {
  const indexed = new Map(
    db.prepare(`SELECT rel_path, mtime, updated_at FROM vault_documents`).all()
      .map((r) => [r.rel_path, r]),
  );
  const onDisk = new Set();
  const staleOrMissing = [];
  for (const file of walkMd(VAULT_ROOT)) {
    const relPath = relative(VAULT_ROOT, file);
    onDisk.add(relPath);
    const row = indexed.get(relPath);
    const mtimeMs = Math.floor(statSync(file).mtimeMs);
    if (!row) staleOrMissing.push({ rel_path: relPath, reason: 'not_indexed' });
    else if (row.mtime !== mtimeMs) staleOrMissing.push({ rel_path: relPath, reason: 'changed_since_index' });
  }
  const orphaned = [...indexed.keys()].filter((p) => !onDisk.has(p));
  const lastIndexedAt = [...indexed.values()].reduce((max, r) => (r.updated_at > max ? r.updated_at : max), '');

  console.log(JSON.stringify({
    db: DB_PATH,
    vaultRoot: VAULT_ROOT,
    totalIndexed: indexed.size,
    totalOnDisk: onDisk.size,
    lastIndexedAt: lastIndexedAt || null,
    isStale: staleOrMissing.length > 0 || orphaned.length > 0,
    staleOrMissing,
    orphaned,
  }, null, 2));
}

function parseArgs(argv) {
  const out = { cmd: argv[0], positional: [], flags: {}, bools: {} };
  if (!out.cmd) usage();
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') {
      out.bools.full = true;
      continue;
    }
    if (a.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out.flags[a.slice(2)] = argv[++i];
      continue;
    }
    if (a.startsWith('--')) usage(`Unknown flag: ${a}`);
    out.positional.push(a);
  }
  return out;
}

function parseSections(raw) {
  if (!raw) return DEFAULT_SECTIONS;
  const keys = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const k of keys) {
    if (!SECTION_HEADINGS[k]) usage(`Unknown section "${k}". Choose from: ${Object.keys(SECTION_HEADINGS).join(', ')}`);
  }
  return keys;
}

function headingLevel(line) {
  const m = line.match(/^(#{1,6})\s/);
  return m ? m[1].length : 0;
}

function extractSection(content, headings) {
  const lines = content.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (headings.some((h) => trimmed === h || trimmed.toLowerCase() === h.toLowerCase())) {
      start = i;
      level = headingLevel(lines[i]) || 3;
      break;
    }
  }
  if (start < 0) return null;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const lvl = headingLevel(lines[i]);
    if (lvl && lvl <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

function parseFm(json) {
  try {
    return JSON.parse(json || '{}') || {};
  } catch {
    return {};
  }
}

function isoDate(value) {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function rowDate(relPath, fm, updatedAt) {
  return isoDate(fm.date) || isoDate((relPath.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]) || isoDate(updatedAt);
}

function rankMeeting(relPath, fm) {
  let s = 0;
  if (fm.type === 'meeting') s += 8;
  if (fm.type === 'meeting-note') s += 4;
  if (relPath.includes('/meetings/')) s += 4;
  if (relPath.endsWith('-mom.md')) s += 4;
  if (relPath.startsWith('entities/projects/')) s += 2;
  if (relPath.startsWith('projects/')) s += 1;
  if (relPath.startsWith('captures/')) s -= 3;
  return s;
}

function personNeedles(person) {
  const lower = person.toLowerCase().trim();
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [...new Set([slug, slug.split('-')[0], lower].filter(Boolean))];
}

function peopleList(fm) {
  const p = fm.people;
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === 'string') return [p];
  return [];
}

function matchesPerson(relPath, title, fm, extra, needles) {
  const hay = [
    peopleList(fm).join(' '),
    title,
    relPath,
    extra || '',
  ].join('\n').toLowerCase();
  return needles.some((n) => hay.includes(n.replace(/-/g, ' ')) || hay.includes(n));
}

function isMeetingRow(relPath, title, fm) {
  return (
    fm.type === 'meeting' ||
    fm.type === 'meeting-note' ||
    /meeting|mom|sync|call/i.test(`${relPath} ${title}`)
  );
}

function loadContent(db, relPath) {
  return db.prepare(`
    SELECT rel_path, title, summary, frontmatter_json, content, updated_at, length(content) AS content_bytes
    FROM vault_documents
    WHERE rel_path = ?
  `).get(relPath);
}

function openDb() {
  if (!existsSync(DB_PATH)) {
    console.error(`Vault index not found: ${DB_PATH}`);
    process.exit(1);
  }
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function packHit(row, sections, full) {
  const fm = parseFm(row.frontmatter_json);
  const extracted = {};
  const missing = [];
  for (const key of sections) {
    const text = extractSection(row.content, SECTION_HEADINGS[key]);
    if (text) extracted[key] = text;
    else missing.push(key);
  }
  const returnedParts = Object.values(extracted);
  if (missing.length && !full) {
    extracted.preview = (row.content || '').slice(0, PREVIEW_CHARS);
    returnedParts.push(extracted.preview);
  }
  const returnedBytes = returnedParts.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0);
  const hit = {
    rel_path: row.rel_path,
    title: row.title,
    date: rowDate(row.rel_path, fm, row.updated_at),
    type: fm.type || null,
    people: peopleList(fm),
    account: fm.account || null,
    summary: row.summary || null,
    sections: extracted,
    missing_sections: missing,
  };
  if (full) hit.content = row.content;
  return {
    hit,
    bytes: {
      full_content: row.content_bytes ?? Buffer.byteLength(row.content || '', 'utf8'),
      returned: full ? Buffer.byteLength(row.content || '', 'utf8') : returnedBytes,
    },
  };
}

function printResult(payload) {
  const full = payload.bytes.full_content || 0;
  payload.bytes.ratio = full ? Number((payload.bytes.returned / full).toFixed(3)) : 0;
  console.log(JSON.stringify(payload, null, 2));
}

function lastMeeting(db, person, sections, full) {
  const meta = db.prepare(`
    SELECT rel_path, title, summary, frontmatter_json, updated_at, length(content) AS content_bytes
    FROM vault_documents
  `).all();

  const needles = person ? personNeedles(person) : null;

  function scoreRows(rows, extraByPath) {
    const scored = [];
    for (const row of rows) {
      const fm = parseFm(row.frontmatter_json);
      if (!isMeetingRow(row.rel_path, row.title, fm)) continue;
      if (needles && !matchesPerson(row.rel_path, row.title, fm, extraByPath?.get(row.rel_path), needles)) continue;
      scored.push({
        rel_path: row.rel_path,
        title: row.title,
        date: rowDate(row.rel_path, fm, row.updated_at),
        type: fm.type || null,
        rank: rankMeeting(row.rel_path, fm),
      });
    }
    scored.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.rank - a.rank);
    return scored;
  }

  let scored = scoreRows(meta);
  if (!scored.length && needles) {
    const like = `%${needles[needles.length - 1]}%`;
    const bodyHits = db.prepare(`
      SELECT rel_path, title, summary, frontmatter_json, updated_at, length(content) AS content_bytes
      FROM vault_documents
      WHERE content LIKE ? COLLATE NOCASE
      LIMIT ?
    `).all(like, CANDIDATE_LIMIT);
    scored = scoreRows(bodyHits);
  }
  if (!scored.length) {
    console.error(person ? `No meeting found matching person "${person}"` : 'No meeting found');
    process.exit(1);
  }

  const top = loadContent(db, scored[0].rel_path);
  const packed = packHit(top, sections, full);
  printResult({
    db: DB_PATH,
    query: { cmd: 'last-meeting', person: person || null, sections, full },
    bytes: packed.bytes,
    hit: packed.hit,
    alternates: scored.slice(1, 4),
  });
}

function showDoc(db, needle, sections, full) {
  const rows = db.prepare(`
    SELECT rel_path, title, summary, frontmatter_json, updated_at
    FROM vault_documents
    WHERE rel_path = ? OR rel_path LIKE ? OR lower(title) = lower(?)
    ORDER BY length(rel_path) ASC
    LIMIT ?
  `).all(needle, `%${needle}%`, needle, CANDIDATE_LIMIT);
  if (!rows.length) {
    console.error(`No document found matching "${needle}"`);
    process.exit(1);
  }
  const packed = packHit(loadContent(db, rows[0].rel_path), sections, full);
  const alternates = rows.slice(1, 4).map((row) => {
    const fm = parseFm(row.frontmatter_json);
    return { rel_path: row.rel_path, title: row.title, date: rowDate(row.rel_path, fm, row.updated_at), type: fm.type || null };
  });
  printResult({
    db: DB_PATH,
    query: { cmd: 'show', needle, sections, full },
    bytes: packed.bytes,
    hit: packed.hit,
    alternates,
  });
}

// Mirrors dori-portal's real searchVaultDocumentsFts (lib/vault-indexer.ts): OR of
// prefix tokens ranked by BM25 `rank`, not an AND-of-whole-terms match. A single query
// word missing from a document's literal text (a stemmed form, a synonym, a % vs. a
// spelled-out word) no longer sinks the whole match — it just contributes less rank.
//
// PROTOTYPE FIX, not yet in real Dori: neither dori-engine nor dori-portal filter
// stopwords before building an FTS query. In a natural-language question ("when will
// X launch") the common words ("when", "will") still match a huge fraction of the vault
// and their summed BM25 contribution can outrank a document that matches the rarer,
// actually-distinguishing terms ("X", "launch") — found via the 2026-08-26 test suite
// (research-benchmarks-2026-08-26.md, section 2.1). Filtering them out before the OR
// query is built is a candidate fix worth porting back to dori-portal's real
// searchVaultDocumentsFts if it holds up here.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in',
  'on', 'at', 'for', 'with', 'will', 'would', 'can', 'could', 'should', 'when', 'what',
  'who', 'whom', 'which', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'if',
  'then', 'so', 'do', 'does', 'did', 'has', 'have', 'had', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'not', 'no', 'yes',
]);

// Split on any run of characters that isn't a letter/digit/underscore/hyphen — not just
// whitespace. Splitting on whitespace alone (the old behavior) left "agents.md" as one
// glued-together token ("agentsmd") that matches nothing in the index, since FTS5's own
// tokenizer treats the period as a separator when the content was indexed. That token
// then poisoned the AND-first match below (runSearch): one term that can never match
// makes the whole AND query return zero rows, silently falling through to the weaker OR
// path even though every OTHER term in the query matched fine. Splitting the same way
// the index itself splits keeps query tokens and index tokens on the same footing.
function meaningfulTokens(q) {
  const tokens = q
    .split(/[^\p{L}\p{N}_-]+/gu)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];
  const meaningful = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  return meaningful.length > 0 ? meaningful : tokens;
}

// Quote each token: an unquoted bareword containing '-' (e.g. "Go-Live") is
// misparsed by FTS5's own query-grammar (confirmed: throws "no such column")
// — a real bug in dori-portal's searchVaultDocumentsFts, mirrored here and
// fixed as a dori-mini prototype. Quoting preserves prefix semantics.
function toPrefixOrQuery(q) {
  const kept = meaningfulTokens(q);
  if (kept.length === 0) return '';
  return kept.map((t) => `"${t.replace(/"/g, '')}"*`).join(' OR ');
}

// AND of the same tokens — tried first (see runSearch): a generic multi-word query like
// "SHA locked test cases" OR-matches almost any doc that mentions "test" or "cases"
// anywhere, and bm25 has no way to know those are the filler terms — a doc that happens
// to repeat "test"/"cases" a lot can outrank the one doc that actually contains every
// term. Requiring ALL terms first (when there are 2+) finds the doc containing every
// word in the query, which is both far more precise and closer to how someone reads their
// own query. Falls back to the existing OR behavior when AND has no hits at all, so a
// short/single-word or genuinely partial-match query still works exactly as before.
function toPrefixAndQuery(q) {
  const kept = meaningfulTokens(q);
  if (kept.length < 2) return null;
  return kept.map((t) => `"${t.replace(/"/g, '')}"*`).join(' AND ');
}

function searchStmt(db, scoped) {
  return db.prepare(`
    SELECT
      vault_documents_fts.rel_path AS rel_path,
      vault_documents.vault_id AS vault_id,
      vault_documents.title AS title,
      json_extract(vault_documents.frontmatter_json, '$.date') AS date,
      json_extract(vault_documents.frontmatter_json, '$.type') AS type,
      snippet(vault_documents_fts, 4, '', '', '…', 12) AS snippet
    FROM vault_documents_fts
    JOIN vault_documents
      ON vault_documents.vault_id = vault_documents_fts.vault_id
     AND vault_documents.rel_path = vault_documents_fts.rel_path
    WHERE vault_documents_fts MATCH ?
    ${scoped ? "AND vault_documents_fts.rel_path LIKE ?" : ''}
    ORDER BY rank
    LIMIT ?
  `);
}

function runSearch(stmt, q, n, scopeSlug) {
  const run = (match) => (scopeSlug ? stmt.all(match, `%/${scopeSlug}/%`, n) : stmt.all(match, n));
  try {
    const andMatch = toPrefixAndQuery(q);
    if (andMatch) {
      const andHits = run(andMatch);
      if (andHits.length > 0) return andHits;
    }
    const orMatch = toPrefixOrQuery(q);
    if (!orMatch) return [];
    return run(orMatch);
  } catch (err) {
    console.error(`FTS query failed: ${err.message}`);
    process.exit(1);
  }
}

function bytesOf(hits) {
  return hits.reduce((s, h) => s + Buffer.byteLength(h.snippet || '', 'utf8'), 0);
}

// The FTS channel's own retrieval only ever produces a short highlighted `snippet` (see
// searchStmt above) — Part 11 already measured 3 of 5 verified snippets truncating before
// the answer they matched. Reranking off that snippet would repeat the same failure inside
// the cross-encoder: it would be scoring relevance from a fragment, not the passage. So
// unlike the dense channel (whose chunks already ARE the full unit of retrieval),
// reranking the FTS channel needs one extra step — fetch the full document body per
// candidate before scoring. `vault_documents` is keyed on (vault_id, rel_path), which is
// why searchStmt now also selects vault_id: without it, two vaults sharing a rel_path could
// fetch the wrong document's content.
// Measured against the real vault before this was caught: vault_documents.content is NOT
// chunk-sized like the dense channel's candidates (median 1,140 chars there). Full document
// content runs p90=36KB, p99=119KB, max 445KB. Feeding that unbounded into the cross-encoder
// tokenizer pinned a single query at 12+ minutes of CPU time — not slow, actually wrong.
// An initial 4000-char cap fixed the hang (52s) but was still measured wasteful: the
// mxbai-rerank-xsmall-v1 tokenizer's own model_max_length is 512 tokens, and it truncates
// there regardless of input size (confirmed: a 10,000-char pair tokenizes to exactly 512
// input_ids) — so most of a 4000-char string was being tokenized in JS only to be discarded
// by the model. 2000 chars covers what 512 tokens can hold (with room left for the query
// text, which shares the same budget) without paying to tokenize a tail the model never
// sees.
const RERANK_MAX_DOC_CHARS = 2000;

// A plain slice(0, N) truncates from the doc's start — fine for a short doc, but on a
// long one (this meeting file included) the matched passage can sit well past 2000 chars,
// so the reranker would score a window that never contains the words the query actually
// hit. Center the window on the earliest query-token occurrence instead — a small lead-in
// keeps some heading/context before it. Falls back to slice(0, N) when no token is found
// in the content at all (e.g. only the snippet was available), same as before.
function windowedContent(text, tokens) {
  if (text.length <= RERANK_MAX_DOC_CHARS) return text;
  const lower = text.toLowerCase();
  let earliest = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }
  if (earliest === -1) return text.slice(0, RERANK_MAX_DOC_CHARS);
  const start = Math.max(0, earliest - 200);
  return text.slice(start, start + RERANK_MAX_DOC_CHARS);
}

function attachContent(db, hits, query) {
  const stmt = db.prepare('SELECT content FROM vault_documents WHERE vault_id = ? AND rel_path = ?');
  const tokens = meaningfulTokens(query);
  return hits.map((h) => {
    const row = stmt.get(h.vault_id, h.rel_path);
    // Falls back to the (weaker) snippet rather than dropping the candidate if content is
    // somehow missing — searchStmt's INNER JOIN guarantees a matching row exists today, but
    // failing open here costs nothing and avoids a crash if that ever stops being true.
    const text = row?.content || h.snippet || '';
    return { ...h, text: windowedContent(text, tokens) };
  });
}

// vault_id and text are internal-only — fetched for scoring, never part of this file's
// stated output contract (top-of-file comment: stdout never includes vault_documents.content
// unless --full). Strips both before a hit set reaches printResult, whether or not
// reranking actually ran.
function stripInternalFields(hits) {
  return hits.map(({ vault_id, text, ...rest }) => rest);
}

async function rerankFtsHits(db, query, hits) {
  if (!RERANK_ENABLED || hits.length <= 1) return hits;
  return rerank(query, attachContent(db, hits, query));
}

async function searchDocs(db, q, limit) {
  const n = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  // Pull RERANK_CANDIDATE_MULTIPLIER x the requested limit from FTS so the cross-encoder has
  // more than the final page to choose from — mirrors the dense channel's candidateLimit
  // exactly (semantic-index.mjs cmdSearch, Part 17), which itself mirrors real Dori's
  // effectiveLimit (src/vector/index.ts).
  const candidateN = RERANK_ENABLED ? n * RERANK_CANDIDATE_MULTIPLIER : n;
  const scopeSlug = SCOPE_ENABLED
    ? matchProject(q, discoverProjects(VAULT_ROOT), discoverPeople(VAULT_ROOT))
    : null;
  const candidates = runSearch(searchStmt(db, Boolean(scopeSlug)), q, candidateN, scopeSlug);
  const reranked = await rerankFtsHits(db, q, candidates);
  const hits = stripInternalFields(reranked.slice(0, n));
  printResult({
    db: DB_PATH,
    query: { cmd: 'search', q, limit: n, full: false },
    bytes: { full_content: 0, returned: bytesOf(hits) },
    hits,
  });
}

// Reciprocal Rank Fusion over N result lists, keyed on rel_path. Same k=60 and the
// same max-normalization as semantic-index.mjs's fuseRrf / real dori-engine's
// src/vector/rrf.ts — duplicated rather than imported because these two CLIs are
// separate entry points (importing would run the other's top-level dispatch).
// Caveat inherited from that shared design: the top score is always 1.000 by
// construction, so it is NOT a relevance signal. `found_by` below is the real signal.
const RRF_K = 60;

function fuseByRelPath(lists, limit) {
  const merged = new Map();
  lists.forEach((list) => {
    list.forEach((hit, index) => {
      const entry = merged.get(hit.rel_path);
      const contribution = 1 / (RRF_K + index + 1);
      if (entry) {
        entry.score += contribution;
        entry.found_by += 1;
        entry.ranks.push(index + 1);
      } else {
        merged.set(hit.rel_path, { score: contribution, hit, found_by: 1, ranks: [index + 1] });
      }
    });
  });
  const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  const denom = ranked[0]?.score > 0 ? ranked[0].score : 1;
  return ranked.map((e) => ({ ...e.hit, score: e.score / denom, found_by: e.found_by, ranks: e.ranks }));
}

// Multi-query retrieval (RAG-Fusion pattern): the CALLER (an LLM agent) supplies several
// rephrasings of one question; this fuses their result lists into one ranked list. Fixes
// the paraphrase-brittleness failure mode where a natural phrasing misses a document that
// a literal, source-vocabulary phrasing finds — see docs/research-benchmarks-2026-08-26.md
// section 2.1. Also emits a cross-query agreement signal: a document found by several
// independent phrasings is corroborated; zero overlap across all phrasings is a cheap
// (uncalibrated) hint that the vault may simply not cover the question.
function searchMulti(db, queries, limit) {
  const n = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const stmt = searchStmt(db);
  const lists = queries.map((q) => runSearch(stmt, q, n));
  const hits = fuseByRelPath(lists, n);
  const corroborated = hits.filter((h) => h.found_by > 1).length;
  printResult({
    db: DB_PATH,
    query: { cmd: 'search-multi', queries, limit: n, full: false },
    agreement: {
      queries: queries.length,
      per_query_hits: lists.map((l) => l.length),
      distinct_docs: new Set(lists.flat().map((h) => h.rel_path)).size,
      corroborated_docs: corroborated,
      // Honest, uncalibrated signal — see 4.2/2.3 in the research doc: no threshold here
      // has been validated against known-answerable vs. known-unanswerable queries.
      no_overlap: queries.length > 1 && corroborated === 0,
    },
    bytes: { full_content: 0, returned: bytesOf(hits) },
    hits,
  });
}

const args = parseArgs(process.argv.slice(2));
const sections = parseSections(args.flags.sections);
const full = Boolean(args.bools.full);
const db = openDb();

try {
  if (args.cmd === 'last-meeting') {
    lastMeeting(db, args.flags.person || args.positional[0], sections, full);
  } else if (args.cmd === 'show') {
    const needle = args.positional.join(' ').trim();
    if (!needle) usage('show requires a path or title');
    showDoc(db, needle, sections, full);
  } else if (args.cmd === 'search') {
    const q = args.positional.join(' ').trim();
    if (!q) usage('search requires keywords');
    await searchDocs(db, q, args.flags.limit);
  } else if (args.cmd === 'search-multi') {
    // Each positional arg is one full rephrasing — quote them individually in the shell.
    const queries = args.positional.map((q) => q.trim()).filter(Boolean);
    if (queries.length < 2) usage('search-multi requires 2+ quoted queries');
    searchMulti(db, queries, args.flags.limit);
  } else if (args.cmd === 'stats') {
    statsCmd(db);
  } else {
    usage(`Unknown command: ${args.cmd}`);
  }
} finally {
  db.close();
}
