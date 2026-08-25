#!/usr/bin/env node
// Writes directly into dori-engine's REAL vectors.db — the per-vault-hashed cache at
// ~/.dori/caches/<sha256(realpath(vaultRoot)).hex.slice(0,16)>/vectors.db that dori-engine
// itself reads (src/config.ts's getOperationalDbDir + src/vector/routes.ts). Same table
// shape (including repo/ref/kind/collection/fts_rowid/indexed_at, which the engine's real
// schema has beyond what earlier prototype iterations tracked), same embedding model
// (Xenova/all-MiniLM-L6-v2, 384-dim — literally the same model dori-engine's own embedder
// defaults to), same RRF fusion (src/vector/rrf.ts). No SQL triggers keep search_fts in
// sync in the real schema — the app does a manual delete-by-fts_rowid + insert + writeback
// dance in code, which this script now replicates exactly (see upsertChunk below) so a
// stale fts_rowid never orphans a row in the real engine's FTS index.
//
// Usage:
//   node semantic-index.mjs index [absolute-path-to-one-file]   # default: full vault walk
//   node semantic-index.mjs search "<query>" [limit]            # default limit 8

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync, readdirSync, mkdirSync, realpathSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const VAULT_ID = 'personal';
const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
const CHUNK_TARGET_CHARS = 1200;
const RRF_K = 60;

// Matches dori-engine/src/config.ts's getOperationalDbDir exactly: sha256(realpath(vaultRoot)), first 16 hex chars.
function operationalDbDir(vaultRoot) {
  const hash = createHash('sha256').update(realpathSync(vaultRoot)).digest('hex').slice(0, 16);
  return join(homedir(), '.dori', 'caches', hash);
}

const DB_PATH = process.env.VAULT_VECTORS_DB || join(operationalDbDir(VAULT_ROOT), 'vectors.db');

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS search_chunks (
  chunk_id      TEXT PRIMARY KEY,
  vault_id      TEXT NOT NULL DEFAULT 'personal',
  source_path   TEXT NOT NULL DEFAULT '',
  repo          TEXT,
  ref           TEXT,
  content_hash  TEXT NOT NULL DEFAULT '',
  text          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT '',
  collection    TEXT NOT NULL DEFAULT 'vault',
  title         TEXT NOT NULL DEFAULT '',
  embed_model   TEXT NOT NULL DEFAULT '',
  embed_dims    INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  fts_rowid     INTEGER,
  indexed_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_vault_coll ON search_chunks(vault_id, collection);
CREATE INDEX IF NOT EXISTS idx_chunks_vault      ON search_chunks(vault_id);
CREATE INDEX IF NOT EXISTS idx_chunks_path       ON search_chunks(source_path);
CREATE INDEX IF NOT EXISTS idx_chunks_hash       ON search_chunks(content_hash);

CREATE TABLE IF NOT EXISTS search_vectors (
  chunk_id  TEXT PRIMARY KEY REFERENCES search_chunks(chunk_id) ON DELETE CASCADE,
  embedding BLOB NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  text, chunk_id UNINDEXED
);

CREATE TABLE IF NOT EXISTS indexed_files (
  source_path TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL
);
`);

function packFloat32(arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function unpackFloat32(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = Math.floor(buf.byteLength / 4);
  const out = new Array(len);
  for (let i = 0; i < len; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

const FTS_STOP_OPS = new Set(['AND', 'OR', 'NOT', 'NEAR']);
function toFtsQuery(query) {
  const tokens = query
    .replace(/['"*^{}()|:]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !FTS_STOP_OPS.has(t.toUpperCase()));
  if (tokens.length === 0) return '';
  const quoted = tokens.map((t) => `"${t.replace(/"/g, '')}"`);
  return quoted.length === 1 ? quoted[0] : quoted.join(' AND ');
}

function fuseRrf(lists, limit, k = RRF_K) {
  const merged = new Map();
  for (const list of lists) {
    list.forEach((result, index) => {
      const contribution = 1 / (k + index + 1);
      const existing = merged.get(result.chunkId);
      if (existing) {
        existing.score += contribution;
        if (result.score > existing.result.score) existing.result = result;
      } else {
        merged.set(result.chunkId, { score: contribution, result });
      }
    });
  }
  const ranked = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  const maxScore = ranked[0]?.score ?? 0;
  const denom = maxScore > 0 ? maxScore : 1;
  return ranked.map(({ score, result }) => ({ ...result, score: score / denom }));
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const [, fmBlock, body] = m;
  const fm = {};
  for (const line of fmBlock.split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: body.trim() };
}

function chunkText(body, targetChars) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > targetChars) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [body];
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

let extractorPromise = null;
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' });
    })();
  }
  return extractorPromise;
}

async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text.slice(0, 8192), { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function cmdIndex(onlyFile) {
  const targets = onlyFile ? [onlyFile] : walk(VAULT_ROOT);
  const getFileMtime = db.prepare('SELECT mtime FROM indexed_files WHERE source_path = ?');
  const setFileMtime = db.prepare(`
    INSERT INTO indexed_files (source_path, mtime) VALUES (?, ?)
    ON CONFLICT(source_path) DO UPDATE SET mtime = excluded.mtime
  `);
  // Real schema has no FTS-sync trigger — deleting a chunk row must delete its fts row by
  // stored fts_rowid first (the app's own delete-by-rowid dance, replicated exactly).
  const getFtsRowidsForPath = db.prepare('SELECT fts_rowid FROM search_chunks WHERE source_path = ? AND vault_id = ? AND fts_rowid IS NOT NULL');
  const deleteFtsByRowid = db.prepare('DELETE FROM search_fts WHERE rowid = ?');
  const deleteChunksForPath = db.prepare('DELETE FROM search_chunks WHERE source_path = ? AND vault_id = ?');
  const insertChunk = db.prepare(`
    INSERT INTO search_chunks (chunk_id, vault_id, source_path, kind, collection, content_hash, text, title, embed_model, embed_dims, metadata_json, indexed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVector = db.prepare('INSERT INTO search_vectors (chunk_id, embedding) VALUES (?, ?)');
  const insertFts = db.prepare('INSERT INTO search_fts (text, chunk_id) VALUES (?, ?)');
  const setFtsRowid = db.prepare('UPDATE search_chunks SET fts_rowid = ? WHERE chunk_id = ?');
  const deleteFileMtime = db.prepare('DELETE FROM indexed_files WHERE source_path = ?');

  // Mirrors dori-engine's reconcileSearchIndex (src/vector/reconcile.ts): a full run
  // (no onlyFile) sees every current file, so it's safe to prune rows for paths no
  // longer on disk — deleted, moved, or removed by a git pull that never went through
  // this script's own write path. search_vectors cascades on chunk delete (FK ON DELETE
  // CASCADE), so no separate vector cleanup is needed. A single-file run has no such
  // full picture, so it never prunes — same rule reindex-vault.mjs already follows.
  let pruned = 0;
  if (!onlyFile) {
    const currentRelPaths = new Set(targets.map((f) => relative(VAULT_ROOT, f)));
    const staleRelPaths = db.prepare('SELECT source_path FROM indexed_files').all()
      .map((r) => r.source_path)
      .filter((p) => !currentRelPaths.has(p));
    for (const relPath of staleRelPaths) {
      for (const { fts_rowid } of getFtsRowidsForPath.all(relPath, VAULT_ID)) {
        deleteFtsByRowid.run(fts_rowid);
      }
      deleteChunksForPath.run(relPath, VAULT_ID);
      deleteFileMtime.run(relPath);
      pruned++;
    }
  }

  let filesIndexed = 0, filesSkipped = 0, chunksWritten = 0;
  for (const file of targets) {
    const relPath = relative(VAULT_ROOT, file);
    const stat = statSync(file);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const existing = getFileMtime.get(relPath);
    if (existing && existing.mtime === mtimeMs) { filesSkipped++; continue; }

    const raw = readFileSync(file, 'utf-8');
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title || relPath.split('/').pop().replace(/\.md$/, '');
    const chunks = chunkText(body, CHUNK_TARGET_CHARS);

    // Deleting fts rows by their stored rowid must run before chunk rows disappear.
    for (const { fts_rowid } of getFtsRowidsForPath.all(relPath, VAULT_ID)) {
      deleteFtsByRowid.run(fts_rowid);
    }
    deleteChunksForPath.run(relPath, VAULT_ID);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const chunkId = `${relPath}#${i}`;
      const vector = await embed(text);
      const now = new Date().toISOString();
      insertChunk.run(
        chunkId, VAULT_ID, relPath, 'note', 'vault', contentHash(text), text, title,
        EMBED_MODEL, vector.length, JSON.stringify(fm), now, now,
      );
      insertVector.run(chunkId, packFloat32(vector));
      const ftsResult = insertFts.run(text, chunkId);
      setFtsRowid.run(ftsResult.lastInsertRowid, chunkId);
      chunksWritten++;
    }
    setFileMtime.run(relPath, mtimeMs);
    filesIndexed++;
  }
  console.log(`Indexed ${filesIndexed} files (${chunksWritten} chunks), skipped ${filesSkipped} unchanged, pruned ${pruned} stale files — db: ${DB_PATH}`);
}

async function cmdSearch(query, limit) {
  const queryVector = await embed(query);
  const ftsQuery = toFtsQuery(query);

  const vecRows = db
    .prepare('SELECT c.chunk_id, c.source_path, c.title, c.text, v.embedding FROM search_vectors v JOIN search_chunks c ON c.chunk_id = v.chunk_id WHERE c.vault_id = ?')
    .all(VAULT_ID);
  const vectorHits = vecRows
    .map((r) => ({
      chunkId: r.chunk_id, sourcePath: r.source_path, title: r.title, text: r.text,
      score: cosineSimilarity(queryVector, unpackFloat32(r.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);

  let ftsHits = [];
  if (ftsQuery) {
    const rows = db
      .prepare(`
        SELECT c.chunk_id, c.source_path, c.title, f.text
        FROM search_fts f JOIN search_chunks c ON c.chunk_id = f.chunk_id
        WHERE search_fts MATCH ? AND c.vault_id = ?
        ORDER BY bm25(search_fts) LIMIT ?
      `)
      .all(ftsQuery, VAULT_ID, limit * 2);
    ftsHits = rows.map((r, i, arr) => ({
      chunkId: r.chunk_id, sourcePath: r.source_path, title: r.title, text: r.text,
      score: arr.length > 0 ? (arr.length - i) / (arr.length + 1) : 0.5,
    }));
  }

  const fused = fuseRrf([vectorHits, ftsHits], limit);
  for (const hit of fused) {
    console.log(`[${hit.score.toFixed(3)}] ${hit.sourcePath} — ${hit.title}`);
    console.log(`  ${hit.text.replace(/\s+/g, ' ').slice(0, 200)}…\n`);
  }
  if (fused.length === 0) console.log('No results.');
}

const [, , cmd, arg1, arg2] = process.argv;
if (cmd === 'index') {
  await cmdIndex(arg1);
} else if (cmd === 'search') {
  if (!arg1) { console.error('Usage: node semantic-index.mjs search "<query>" [limit]'); process.exit(1); }
  await cmdSearch(arg1, arg2 ? Number(arg2) : 8);
} else {
  console.error('Usage: node semantic-index.mjs index [file] | search "<query>" [limit]');
  process.exit(1);
}
