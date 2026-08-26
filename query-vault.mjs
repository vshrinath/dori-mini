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

const DB_PATH = process.env.VAULT_INDEX_DB || resolve(homedir(), 'proto-space/dori/store/portal.db');
const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const DEFAULT_SECTIONS = ['decisions', 'actions'];
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 8;
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

function searchDocs(db, q, limit) {
  const n = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const match = toPrefixOrQuery(q);
  const stmt = db.prepare(`
    SELECT
      vault_documents_fts.rel_path AS rel_path,
      vault_documents.title AS title,
      json_extract(vault_documents.frontmatter_json, '$.date') AS date,
      json_extract(vault_documents.frontmatter_json, '$.type') AS type,
      snippet(vault_documents_fts, 4, '', '', '…', 12) AS snippet
    FROM vault_documents_fts
    JOIN vault_documents
      ON vault_documents.vault_id = vault_documents_fts.vault_id
     AND vault_documents.rel_path = vault_documents_fts.rel_path
    WHERE vault_documents_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  let hits = [];
  if (match) {
    try {
      hits = stmt.all(match, n);
    } catch (err) {
      console.error(`FTS query failed: ${err.message}`);
      process.exit(1);
    }
  }
  printResult({
    db: DB_PATH,
    query: { cmd: 'search', q, limit: n, full: false },
    bytes: {
      full_content: 0,
      returned: hits.reduce((s, h) => s + Buffer.byteLength(h.snippet || '', 'utf8'), 0),
    },
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
    searchDocs(db, q, args.flags.limit);
  } else if (args.cmd === 'stats') {
    statsCmd(db);
  } else {
    usage(`Unknown command: ${args.cmd}`);
  }
} finally {
  db.close();
}
