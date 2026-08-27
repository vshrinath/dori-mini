#!/usr/bin/env node
// Writes directly into dori-portal's REAL vault_documents(+fts) table — same schema,
// same file, same vault_id ('default') the running app itself reads. This is deliberately
// NOT a separate cache: once this script runs, dori-portal's own search sees these rows
// immediately, no rebuild/reindex step in the app required. Schema verified against the
// live table (see dori-portal/lib/db/schema.ts + client.ts's ensureVaultDocuments* raw-SQL
// migrations, which is why `raw`/`package_json`/`rendered_html` exist beyond the base
// Drizzle definition).
//
// Concurrency: portal.db runs WAL + busy_timeout=5000 + synchronous=NORMAL when dori-portal
// itself opens it (dori-portal/lib/db/client.ts) — this script sets the same pragmas so it's
// a well-behaved co-writer if `pnpm dev` is running concurrently, rather than risking
// SQLITE_BUSY or an unjournaled write.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { renderMarkdownToHtml } from './render-html.mjs';

function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
// Matches dori-portal/lib/db/client.ts's default: path.resolve(process.cwd(), '../store/portal.db')
// when cwd is dori-portal/ — hardcoded here since this script's cwd isn't dori-portal's.
const DB_PATH = process.env.PORTAL_DB_PATH || resolve(homedir(), 'proto-space/dori/store/portal.db');
const VAULT_ID = 'default';

mkdirSync(join(homedir(), 'proto-space/dori/store'), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS vault_documents (
  vault_id TEXT NOT NULL DEFAULT 'default',
  rel_path TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  raw TEXT,
  package_json TEXT NOT NULL DEFAULT '{}',
  mtime INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  rendered_html TEXT,
  PRIMARY KEY (vault_id, rel_path)
);
`);

// Additive migration for a db created by the older version of this script (pre raw/package_json/rendered_html).
const existingCols = db.prepare(`PRAGMA table_info(vault_documents)`).all().map((c) => c.name);
if (!existingCols.includes('raw')) db.exec(`ALTER TABLE vault_documents ADD COLUMN raw TEXT`);
if (!existingCols.includes('package_json')) db.exec(`ALTER TABLE vault_documents ADD COLUMN package_json TEXT NOT NULL DEFAULT '{}'`);
if (!existingCols.includes('rendered_html')) db.exec(`ALTER TABLE vault_documents ADD COLUMN rendered_html TEXT`);
// PROTOTYPE, not yet in real dori-portal's Drizzle schema (checked schema.ts — no
// content_hash/dedup column exists there; these are additive columns Drizzle's typed
// column mapping simply won't see, so this is safe to add to the shared live table).
// Ported from the same fix in semantic-index.mjs (research-benchmarks-2026-08-26.md,
// Part 6): real vaults can have byte-identical files under multiple rel_paths, and every
// path getting its own FTS row lets duplicate content count as independent evidence in
// BM25 ranking. `content`/`raw` stay populated for every path (so `show`/`last-meeting`
// still work by any of a duplicate's paths) — only the FTS row is what a duplicate
// forgoes, since that's what actually causes ranking dilution in `search`.
if (!existingCols.includes('content_hash')) db.exec(`ALTER TABLE vault_documents ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''`);
if (!existingCols.includes('duplicate_of')) db.exec(`ALTER TABLE vault_documents ADD COLUMN duplicate_of TEXT`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_documents_hash ON vault_documents(vault_id, content_hash)`);

// FTS5 tokenizer can't be altered on an existing table — drop+recreate to match the real
// schema (porter unicode61 stemming; vault_id/rel_path UNINDEXED) if it's the old shape.
const ftsSql = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'vault_documents_fts'`).get();
if (!ftsSql || !ftsSql.sql.includes('porter')) {
  db.exec(`DROP TABLE IF EXISTS vault_documents_fts`);
  db.exec(`
    CREATE VIRTUAL TABLE vault_documents_fts USING fts5(
      vault_id UNINDEXED, rel_path UNINDEXED, title, summary, content,
      tokenize = 'porter unicode61'
    )
  `);
  const rebuildFts = db.prepare(`INSERT INTO vault_documents_fts (vault_id, rel_path, title, summary, content) SELECT vault_id, rel_path, title, summary, content FROM vault_documents`);
  rebuildFts.run();
}

import { parseFrontmatter } from './frontmatter.mjs';

// Same ignore mechanism as semantic-index.mjs — see the long note there, including why the
// default is empty rather than a baked-in project name. Both indexers walk the same vault,
// so an exclusion applied to only one would leave the other's index still ranking the junk.
// Excluding a path never deletes the file; `show` and direct reads are unaffected, and
// removing the line from <vault>/.doriignore plus a reindex restores it.
function readIgnoreFile() {
  try {
    return readFileSync(join(VAULT_ROOT, '.doriignore'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .join(',');
  } catch {
    return '';
  }
}

const IGNORE_PATTERNS = (process.env.VAULT_IGNORE ?? readIgnoreFile())
  .split(',')
  .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
  .filter(Boolean);

function ignoreMatches(rel, pattern) {
  if (!pattern.includes('*')) return rel === pattern || rel.startsWith(pattern + '/');
  const rx = pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${rx}$`, 'i').test(rel);
}

function isIgnored(fullPath) {
  const rel = relative(VAULT_ROOT, fullPath);
  return IGNORE_PATTERNS.some((p) => ignoreMatches(rel, p));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (isIgnored(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const deleteFts = db.prepare(`DELETE FROM vault_documents_fts WHERE vault_id = ? AND rel_path = ?`);
const insertFts = db.prepare(`INSERT INTO vault_documents_fts (vault_id, rel_path, title, summary, content) VALUES (?, ?, ?, ?, ?)`);
const MIN_DEDUP_BODY_CHARS = 40;

if (process.argv[2] === 'dedupe') {
  // One-time backfill for a table already indexed before dedup existed — the per-file
  // check below only fires for changed files, so already-indexed unchanged duplicates
  // would otherwise never get caught. Dedup decisions only need file content (cheap
  // read+hash), not the FTS/render work, so this is much cheaper than a full reindex.
  // Canonical = lexicographically-first path per hash group, deterministic and stable.
  const files = walk(VAULT_ROOT);
  const groups = new Map();
  let skippedTrivial = 0;
  for (const file of files) {
    const relPath = relative(VAULT_ROOT, file);
    const { body } = parseFrontmatter(readFileSync(file, 'utf-8'));
    // Empty/near-empty bodies (frontmatter-only stub files — found 80 of these in the
    // real vault) all hash the same trivial value and would otherwise get wrongly
    // grouped as duplicates of each other and of unrelated files.
    if (body.trim().length < MIN_DEDUP_BODY_CHARS) { skippedTrivial++; continue; }
    const hash = contentHash(body);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(relPath);
  }
  const setHash = db.prepare(`UPDATE vault_documents SET content_hash = ?, duplicate_of = ? WHERE vault_id = ? AND rel_path = ?`);
  const hasFtsRow = db.prepare(`SELECT 1 FROM vault_documents_fts WHERE vault_id = ? AND rel_path = ?`);
  const getDoc = db.prepare(`SELECT title, summary, content FROM vault_documents WHERE vault_id = ? AND rel_path = ?`);
  let groupsWithDuplicates = 0, ftsRowsRemoved = 0, ftsRowsBackfilled = 0;
  const examples = [];
  for (const [hash, members] of groups) {
    members.sort((a, b) => a.localeCompare(b));
    // Canonical must be a member that's actually searchable — trusting lexicographic
    // order alone broke this against real data (found: entities/projects/aligna/* had
    // vault_documents rows but had never gotten an FTS row in the first place, a
    // pre-existing indexing gap unrelated to dedup; picking it as canonical over its
    // duplicate that DID have an FTS row left the whole group unsearchable). Prefer
    // whichever member already has FTS coverage; only if none do, back-fill one.
    const withFts = members.filter((m) => hasFtsRow.get(VAULT_ID, m));
    const canonical = withFts[0] ?? members[0];
    if (!withFts.length) {
      const doc = getDoc.get(VAULT_ID, canonical);
      if (doc) { insertFts.run(VAULT_ID, canonical, doc.title, doc.summary, doc.content); ftsRowsBackfilled++; }
    }
    setHash.run(hash, null, VAULT_ID, canonical);
    const duplicates = members.filter((m) => m !== canonical);
    if (duplicates.length === 0) continue;
    groupsWithDuplicates++;
    for (const dup of duplicates) {
      if (hasFtsRow.get(VAULT_ID, dup)) { deleteFts.run(VAULT_ID, dup); ftsRowsRemoved++; }
      setHash.run(hash, canonical, VAULT_ID, dup);
      if (examples.length < 10) examples.push(`${dup} == ${canonical}`);
    }
  }
  console.log(`Dedup scan: ${groupsWithDuplicates} duplicate groups found, ${ftsRowsRemoved} already-indexed duplicates removed from search (content/show still intact), ${ftsRowsBackfilled} canonicals back-filled with a missing FTS row, ${skippedTrivial} trivial/near-empty files excluded from dedup — db: ${DB_PATH}`);
  for (const line of examples) console.log(`  duplicate: ${line}`);
  process.exit(0);
}

const target = process.argv[2] ? [process.argv[2]] : walk(VAULT_ROOT);

const upsertDoc = db.prepare(`
  INSERT INTO vault_documents (vault_id, rel_path, title, summary, frontmatter_json, content, raw, rendered_html, mtime, updated_at, content_hash, duplicate_of)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(vault_id, rel_path) DO UPDATE SET
    title=excluded.title, summary=excluded.summary, frontmatter_json=excluded.frontmatter_json,
    content=excluded.content, raw=excluded.raw, rendered_html=excluded.rendered_html,
    mtime=excluded.mtime, updated_at=excluded.updated_at, content_hash=excluded.content_hash, duplicate_of=excluded.duplicate_of
`);
const getMtime = db.prepare(`SELECT mtime FROM vault_documents WHERE vault_id = ? AND rel_path = ?`);
// Requires the candidate to actually have an FTS row — found against real data that a
// row can exist in vault_documents with no matching vault_documents_fts row (a
// pre-existing indexing gap, unrelated to dedup); deferring to a "canonical" that was
// never searchable would leave the whole duplicate group unsearchable.
const findCanonicalPath = db.prepare(`
  SELECT vd.rel_path FROM vault_documents vd
  WHERE vd.vault_id = ? AND vd.content_hash = ? AND vd.rel_path != ? AND vd.duplicate_of IS NULL
    AND EXISTS (SELECT 1 FROM vault_documents_fts f WHERE f.vault_id = vd.vault_id AND f.rel_path = vd.rel_path)
  LIMIT 1
`);

// Full-reindex runs (no specific path arg) see every current file, so it's safe to prune
// DB rows for paths that no longer exist there (moved/archived/deleted since last index).
// A single-file reindex has no such full picture, so it never prunes.
let pruned = 0;
if (!process.argv[2]) {
  const currentRelPaths = new Set(target.map((f) => relative(VAULT_ROOT, f)));
  const existingRelPaths = db.prepare(`SELECT rel_path FROM vault_documents WHERE vault_id = ?`).all(VAULT_ID);
  const deleteDoc = db.prepare(`DELETE FROM vault_documents WHERE vault_id = ? AND rel_path = ?`);
  for (const { rel_path } of existingRelPaths) {
    if (currentRelPaths.has(rel_path)) continue;
    deleteDoc.run(VAULT_ID, rel_path);
    deleteFts.run(VAULT_ID, rel_path);
    pruned++;
  }
}

let indexed = 0, skipped = 0, duplicates = 0;
for (const file of target) {
  const relPath = relative(VAULT_ROOT, file);
  const stat = statSync(file);
  const mtimeMs = Math.floor(stat.mtimeMs);
  const existing = getMtime.get(VAULT_ID, relPath);
  if (existing && existing.mtime === mtimeMs) { skipped++; continue; }

  const raw = readFileSync(file, 'utf-8');
  const { fm, body } = parseFrontmatter(raw);
  const title = fm.title || relPath.split('/').pop().replace(/\.md$/, '');
  // Matches dori-portal/lib/vault-indexer.ts titleFrom/summary semantics: summary comes
  // only from an explicit frontmatter field — Dori never auto-truncates the body for it.
  const summary = fm.summary || null;
  // See MIN_DEDUP_BODY_CHARS's comment above the dedupe block — empty/near-empty bodies
  // all hash the same and must never be treated as duplicates of each other.
  const hash = body.trim().length >= MIN_DEDUP_BODY_CHARS ? contentHash(body) : '';
  const canonical = hash ? findCanonicalPath.get(VAULT_ID, hash, relPath) : null;

  const renderedHtml = renderMarkdownToHtml(body);
  upsertDoc.run(VAULT_ID, relPath, title, summary, JSON.stringify(fm), body, raw, renderedHtml, mtimeMs, new Date().toISOString(), hash, canonical?.rel_path ?? null);
  deleteFts.run(VAULT_ID, relPath);
  if (canonical) {
    duplicates++;
  } else {
    insertFts.run(VAULT_ID, relPath, title, summary, body);
  }
  indexed++;
}

console.log(`Indexed ${indexed} (${duplicates} exact duplicates, not added to search), skipped ${skipped} (unchanged), pruned ${pruned} (stale) — db: ${DB_PATH}`);
