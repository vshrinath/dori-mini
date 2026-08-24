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
import { renderMarkdownToHtml } from './render-html.mjs';

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

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const [, fmBlock, body] = m;
  const fm = {};
  let currentKey = null;
  for (const line of fmBlock.split('\n')) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      (fm[currentKey] ??= []).push(listItem[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) {
      const [, key, val] = kv;
      if (val.trim() === '') { currentKey = key; continue; }
      fm[key] = val.trim().replace(/^["']|["']$/g, '');
      currentKey = null;
    }
  }
  return { fm, body: body.trim() };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const target = process.argv[2] ? [process.argv[2]] : walk(VAULT_ROOT);

const upsertDoc = db.prepare(`
  INSERT INTO vault_documents (vault_id, rel_path, title, summary, frontmatter_json, content, raw, rendered_html, mtime, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(vault_id, rel_path) DO UPDATE SET
    title=excluded.title, summary=excluded.summary, frontmatter_json=excluded.frontmatter_json,
    content=excluded.content, raw=excluded.raw, rendered_html=excluded.rendered_html,
    mtime=excluded.mtime, updated_at=excluded.updated_at
`);
const deleteFts = db.prepare(`DELETE FROM vault_documents_fts WHERE vault_id = ? AND rel_path = ?`);
const insertFts = db.prepare(`INSERT INTO vault_documents_fts (vault_id, rel_path, title, summary, content) VALUES (?, ?, ?, ?, ?)`);
const getMtime = db.prepare(`SELECT mtime FROM vault_documents WHERE vault_id = ? AND rel_path = ?`);

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

let indexed = 0, skipped = 0;
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

  const renderedHtml = renderMarkdownToHtml(body);
  upsertDoc.run(VAULT_ID, relPath, title, summary, JSON.stringify(fm), body, raw, renderedHtml, mtimeMs, new Date().toISOString());
  deleteFts.run(VAULT_ID, relPath);
  insertFts.run(VAULT_ID, relPath, title, summary, body);
  indexed++;
}

console.log(`Indexed ${indexed}, skipped ${skipped} (unchanged), pruned ${pruned} (stale) — db: ${DB_PATH}`);
