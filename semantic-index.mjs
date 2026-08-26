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
//   node semantic-index.mjs search "<query>" [limit]            # default limit 10

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync, readdirSync, mkdirSync, realpathSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const VAULT_ID = 'personal';
const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
const CHUNK_TARGET_CHARS = 1200;
const MIN_DEDUP_BODY_CHARS = 40;
const RRF_K = 60;
// Mirrors dori-engine's TransformersReranker (packages/embeddings/src/reranker.ts) and its
// wiring in src/vector/index.ts: a local ONNX cross-encoder applied to the top candidates of
// a dense retrieval pass, no API key. Same model, same 4x candidate multiplier, same
// fail-open contract (a reranking error keeps the first-stage ranking, never errors the
// whole search). RERANK=0 disables it — kept as an escape hatch for A/B comparison against
// the pre-rerank baseline (docs/baseline-retrieval-eval-2026-08-26.md), not a production
// toggle real Dori exposes.
const RERANK_MODEL = process.env.RERANK_MODEL || 'mixedbread-ai/mxbai-rerank-xsmall-v1';
const RERANK_CANDIDATE_MULTIPLIER = 4;
const RERANK_ENABLED = process.env.RERANK !== '0';
// Mirrors dori-engine's DEFAULT_LIMIT (src/vector/index.ts:41). Was 8 here — an
// unmirrored divergence. dori-engine imposes no max cap, so none is imposed here either.
const DEFAULT_LIMIT = 10;

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

// PROTOTYPE, not yet in real dori-engine (checked — sqlite-vector-store.ts's content_hash
// is per-chunk, used only for per-file change detection, not cross-file dedup). Real
// vaults can have byte-identical files under multiple paths (found in dori-vault: the
// same doc mirrored under entities/projects/ and projects/, plus a rendered _site/ copy,
// plus website case-study copies — research-benchmarks-2026-08-26.md, Part 5). Each path
// getting its own chunks means duplicate content counts as independent evidence in BM25/
// RRF ranking, letting a heavily-duplicated topic bury a correct, non-duplicated match.
// Whole-file hash here (not per-chunk) so a multi-chunk duplicate is caught as one file,
// not chunk-by-chunk.
const idxFilesCols = db.prepare(`PRAGMA table_info(indexed_files)`).all().map((c) => c.name);
if (!idxFilesCols.includes('content_hash')) db.exec(`ALTER TABLE indexed_files ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''`);
if (!idxFilesCols.includes('duplicate_of')) db.exec(`ALTER TABLE indexed_files ADD COLUMN duplicate_of TEXT`);
// Contextual retrieval bookkeeping (see cmdContextualize). Nullable and additive: an
// un-contextualized index keeps working exactly as before, and this doubles as the resume
// marker for a run that takes hours and may be interrupted.
if (!idxFilesCols.includes('contextualized_at')) db.exec(`ALTER TABLE indexed_files ADD COLUMN contextualized_at TEXT`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_indexed_files_hash ON indexed_files(content_hash)`);

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

// Fallback for a paragraph with no blank-line breaks to split on — common in
// PDF/OCR-extracted text, which markitdown often emits as one dense blob with
// no paragraph breaks at all. Mirrors dori-engine's real splitOversized
// (src/vector/ingest.ts): cascade sentence -> word -> hard character splitting,
// whichever first produces pieces at or under targetChars. Without this, a
// single unbroken paragraph bypassed chunking entirely and got embedded (and
// FTS-indexed) as one oversized blob, diluting both retrieval paths.
function packUnits(units, join, targetChars) {
  const chunks = [];
  let current = '';
  for (const unit of units) {
    if (!unit) continue;
    if (current && current.length + join.length + unit.length > targetChars) {
      chunks.push(current);
      current = unit;
    } else {
      current = current ? `${current}${join}${unit}` : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function hardSlice(text, targetChars) {
  const chunks = [];
  for (let i = 0; i < text.length; i += targetChars) chunks.push(text.slice(i, i + targetChars));
  return chunks;
}

function splitOversized(text, targetChars) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    return packUnits(sentences, ' ', targetChars).flatMap((c) => (c.length > targetChars ? splitOversized(c, targetChars) : [c]));
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return packUnits(words, ' ', targetChars).flatMap((c) => (c.length > targetChars ? hardSlice(c, targetChars) : [c]));
  }
  return hardSlice(text, targetChars);
}

function chunkText(body, targetChars) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (p.length > targetChars) {
      if (current) { chunks.push(current); current = ''; }
      chunks.push(...splitOversized(p, targetChars));
      continue;
    }
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

// PROTOTYPE, not in real dori-engine (checked — its ingest path has no ignore logic
// either). Before this, the only exclusion in either indexer was "skip dotfiles", so every
// .md under the vault got embedded and FTS-indexed. Measured 2026-08-26: `hermes/` alone
// was 5,563 chunks / 258 files — 18.4% of the whole index — and it holds AI-agent skill
// definitions (SOUL.md, skills/*/SKILL.md), not personal knowledge. Junk like this doesn't
// just cost index time; it competes for rank, and was observed outranking real project
// content on real queries (research doc Part 13). Top-level path prefixes, comma-separated,
// overridable per-run without editing code.
// Two pattern forms, because vault junk comes in two shapes. A bare name is a directory
// prefix (`hermes` -> hermes/**). A name containing `*` is a case-insensitive glob over the
// whole relative path (`*vybe*`), needed because a retired project's files are usually
// scattered — Vybe's live under captures/*vybe*, not a projects/vybe/ folder.
// Exclusions are per-VAULT, never a shipped default. A project name baked in here would
// silently drop a different user's real data out of search — no error, no warning, nothing
// to notice, and nearly impossible to diagnose from the outside. So the default is empty and
// the list is read from <vault>/.doriignore, which travels with the vault and applies no
// matter how the process was started. An env var alone would not do: the launchd background
// jobs (digest, notifications) do not inherit a shell profile, so their reindex would
// silently use a different exclusion set than an interactive one.
function readIgnoreFile() {
  try {
    return readFileSync(join(VAULT_ROOT, '.doriignore'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .join(',');
  } catch {
    return ''; // absent file means "exclude nothing", the correct default for a new vault
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

// ---------------------------------------------------------------------------
// Contextual retrieval (PROTOTYPE — not in real dori-engine or dori-portal).
//
// Why: the measured baseline (docs/baseline-retrieval-eval-2026-08-26.md) puts natural-
// phrasing retrieval at 55% hit rate @k=20, and ALL 7 both-channel misses recovered when
// re-queried with source-document vocabulary (6/7 into the top 3). Register mismatch is
// therefore 100% of the measured misses: chunks are stored only in the source's wording,
// so a question phrased as a question has little to match. Anthropic's contextual-retrieval
// result (top-20 failure 5.7% -> 2.9% with contextual embeddings + contextual BM25) fixes
// exactly this, at index time, with zero added query latency.
//
// How this differs from the reference implementation: that one issues an LLM call PER CHUNK
// with the document held in a prompt cache. Here the LLM is reached through `claude -p`,
// using the session's own OAuth rather than an API key (no key handling, no separate bill),
// and process startup dominates at ~7s per invocation. Per-chunk would be ~23,700 calls;
// batching one call per DOCUMENT returns every chunk's context in a single response and
// costs ~2,000 calls instead. Same output, ~12x fewer round trips.
const CTX_MODEL = process.env.CONTEXTUAL_MODEL || 'haiku';
const CTX_MAX_DOC_CHARS = 60000; // keeps a prompt sane on the handful of very long transcripts
const CTX_TIMEOUT_MS = 180000;

function buildContextPrompt(docText, chunks) {
  const doc = docText.length > CTX_MAX_DOC_CHARS
    ? docText.slice(0, CTX_MAX_DOC_CHARS) + '\n[...document truncated for context generation...]'
    : docText;
  const numbered = chunks.map((c, i) => `<chunk index="${i + 1}">\n${c}\n</chunk>`).join('\n');
  return `<document>
${doc}
</document>

Below are ${chunks.length} chunk(s) taken from the document above.

${numbered}

For EACH chunk, give a short succinct context (one sentence, under 25 words) situating that
chunk within the overall document, for the purpose of improving search retrieval of the
chunk. Name the specific project, people, dates, or topic the chunk belongs to, using words
a person searching later would plausibly type.

Output EXACTLY ${chunks.length} line(s), one per chunk, in order, each formatted as:
<index>|<context>

No preamble, no blank lines, no markdown, nothing else.`;
}

// Returns an array of context strings (one per chunk), or null if the call failed or the
// response didn't line up. Null means "index this file exactly as before" — a failure here
// must degrade to normal behaviour, never to a half-contextualized file.
function generateContexts(docText, chunks) {
  const res = spawnSync('claude', ['-p', '--model', CTX_MODEL], {
    input: buildContextPrompt(docText, chunks),
    encoding: 'utf8',
    timeout: CTX_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error || res.status !== 0 || !res.stdout) return null;

  const byIndex = new Map();
  for (const line of res.stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s*\|(.*)$/);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    const ctx = m[2].trim();
    if (idx >= 0 && idx < chunks.length && ctx) byIndex.set(idx, ctx);
  }
  // Require full coverage: a partial response would silently leave some chunks weaker than
  // others, producing an index whose retrieval quality varies by accident rather than design.
  if (byIndex.size !== chunks.length) return null;
  return chunks.map((_, i) => byIndex.get(i));
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

// Local cross-encoder reranker — direct port of dori-engine's TransformersReranker
// (packages/embeddings/src/reranker.ts). Scores one (query, document) pair per forward
// pass: "callers should only rerank a small shortlist from a cheaper first-pass retrieval,
// not a corpus" (real Dori's own comment on this). Never call on more than a few dozen
// candidates.
let rerankerPromise = null;
async function getReranker() {
  if (!rerankerPromise) {
    rerankerPromise = (async () => {
      const { AutoModelForSequenceClassification, AutoTokenizer } = await import('@huggingface/transformers');
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(RERANK_MODEL),
        AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: 'q8' }),
      ]);
      return { tokenizer, model };
    })();
  }
  return rerankerPromise;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

async function rerankScores(query, texts) {
  if (texts.length === 0) return [];
  const { tokenizer, model } = await getReranker();
  const scores = [];
  for (const text of texts) {
    const inputs = tokenizer(query, { text_pair: text, padding: true, truncation: true });
    const { logits } = await model(inputs);
    scores.push(sigmoid(logits.data[0]));
  }
  return scores;
}

// Applies the cross-encoder to `candidates` (the fused first-stage ranking) and returns a
// NEW array sorted by cross-encoder score, which fully REPLACES the first-stage score —
// mirrors real Dori exactly: "when a reranker ran, its cross-encoder scores fully replace
// the first-stage scores... reranking already reflects deep semantic relevance to the
// query text" (src/vector/index.ts). Fails open: any error keeps candidates in their
// original first-stage order, same contract as SearchIndex.query's try/catch, so a broken
// or unavailable reranker degrades search quality — it never errors the whole search.
async function rerank(query, candidates) {
  if (!RERANK_ENABLED || candidates.length <= 1) return candidates;
  try {
    const scores = await rerankScores(query, candidates.map((c) => c.text));
    return candidates
      .map((c, i) => ({ ...c, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error(`Reranking failed, keeping first-stage ranking: ${err.message}`);
    return candidates;
  }
}

async function cmdIndex(onlyFile) {
  const targets = onlyFile ? [onlyFile] : walk(VAULT_ROOT);
  const getFileMtime = db.prepare('SELECT mtime FROM indexed_files WHERE source_path = ?');
  const setFileMtime = db.prepare(`
    INSERT INTO indexed_files (source_path, mtime, content_hash, duplicate_of) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET mtime = excluded.mtime, content_hash = excluded.content_hash, duplicate_of = excluded.duplicate_of
  `);
  // Requires the candidate to actually have chunks — an indexed_files row can exist with
  // no matching search_chunks rows (e.g. a stale bookkeeping row); deferring to a
  // "canonical" with nothing actually indexed would leave the whole duplicate group
  // unsearchable. Same class of bug found and fixed in reindex-vault.mjs's port of this.
  const findCanonicalPath = db.prepare(`
    SELECT i.source_path FROM indexed_files i
    WHERE i.content_hash = ? AND i.source_path != ? AND i.duplicate_of IS NULL
      AND EXISTS (SELECT 1 FROM search_chunks c WHERE c.source_path = i.source_path AND c.vault_id = ?)
    LIMIT 1
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
    // ponytail: if the canonical copy of a duplicate group gets pruned here, its
    // duplicates stay unindexed until one of them is touched (mtime changes) and gets
    // re-evaluated as canonical on its own. No auto-promotion of a remaining duplicate —
    // real vaults rarely delete only the canonical copy of a mirrored file, and this
    // stays simple; revisit if it turns out to matter.
  }

  let filesIndexed = 0, filesSkipped = 0, chunksWritten = 0, filesDuplicate = 0;
  const duplicatesLogged = [];
  for (const file of targets) {
    const relPath = relative(VAULT_ROOT, file);
    const stat = statSync(file);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const existing = getFileMtime.get(relPath);
    if (existing && existing.mtime === mtimeMs) { filesSkipped++; continue; }

    const raw = readFileSync(file, 'utf-8');
    const { fm, body } = parseFrontmatter(raw);
    const title = fm.title || relPath.split('/').pop().replace(/\.md$/, '');
    // Empty/near-empty bodies (frontmatter-only stub files — found 80 of these in the
    // real vault) all hash the same trivial value and would otherwise get wrongly
    // flagged as duplicates of each other and of totally unrelated files. Below this
    // length, skip dedup entirely — there's no meaningful "content" to be duplicate of,
    // and such a short body can't meaningfully pollute BM25/embedding ranking anyway.
    const fileHash = body.trim().length >= MIN_DEDUP_BODY_CHARS ? contentHash(body) : '';

    // Deleting fts rows by their stored rowid must run before chunk rows disappear —
    // needed whether this file turns out to be a duplicate or not (it may have been
    // indexed normally before an earlier duplicate check, or before its content changed
    // into a duplicate of something else).
    for (const { fts_rowid } of getFtsRowidsForPath.all(relPath, VAULT_ID)) {
      deleteFtsByRowid.run(fts_rowid);
    }
    deleteChunksForPath.run(relPath, VAULT_ID);

    const canonical = fileHash ? findCanonicalPath.get(fileHash, relPath, VAULT_ID) : null;
    if (canonical) {
      setFileMtime.run(relPath, mtimeMs, fileHash, canonical.source_path);
      filesDuplicate++;
      if (duplicatesLogged.length < 10) duplicatesLogged.push(`${relPath} == ${canonical.source_path}`);
      continue;
    }

    const chunks = chunkText(body, CHUNK_TARGET_CHARS);
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
    setFileMtime.run(relPath, mtimeMs, fileHash, null);
    filesIndexed++;
  }
  console.log(`Indexed ${filesIndexed} files (${chunksWritten} chunks), skipped ${filesSkipped} unchanged, ${filesDuplicate} exact duplicates (not chunked), pruned ${pruned} stale files — db: ${DB_PATH}`);
  for (const line of duplicatesLogged) console.log(`  duplicate: ${line}`);
  if (filesDuplicate > duplicatesLogged.length) console.log(`  ...and ${filesDuplicate - duplicatesLogged.length} more`);
}

// All embeddings for the vault, decoded once. cmdSearchMulti scores several queries
// against the same set, so loading/unpacking per query would repeat the whole scan.
function loadVectorRows() {
  return db
    .prepare('SELECT c.chunk_id, c.source_path, c.title, c.text, v.embedding FROM search_vectors v JOIN search_chunks c ON c.chunk_id = v.chunk_id WHERE c.vault_id = ?')
    .all(VAULT_ID)
    .map((r) => ({
      chunkId: r.chunk_id, sourcePath: r.source_path, title: r.title, text: r.text,
      vector: unpackFloat32(r.embedding),
    }));
}

// The two retrieval channels for ONE query, returned unfused so a caller can fuse
// across several queries at once (see cmdSearchMulti).
async function retrieveLists(query, limit, vecRows) {
  const queryVector = await embed(query);
  const vectorHits = vecRows
    .map((r) => ({
      chunkId: r.chunkId, sourcePath: r.sourcePath, title: r.title, text: r.text,
      score: cosineSimilarity(queryVector, r.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);

  let ftsHits = [];
  const ftsQuery = toFtsQuery(query);
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
  return [vectorHits, ftsHits];
}

async function cmdSearch(query, limit) {
  // Pull RERANK_CANDIDATE_MULTIPLIER x the requested limit from first-stage fusion so the
  // cross-encoder has more than the final page to choose from — mirrors real Dori's
  // effectiveLimit calculation exactly (src/vector/index.ts).
  const candidateLimit = RERANK_ENABLED ? limit * RERANK_CANDIDATE_MULTIPLIER : limit;
  const lists = await retrieveLists(query, candidateLimit, loadVectorRows());
  const candidates = fuseRrf(lists, candidateLimit);
  const fused = (await rerank(query, candidates)).slice(0, limit);
  for (const hit of fused) {
    console.log(`[${hit.score.toFixed(3)}] ${hit.sourcePath} — ${hit.title}`);
    console.log(`  ${previewAround(hit.text, query)}\n`);
  }
  if (fused.length === 0) console.log('No results.');
}

// Multi-query retrieval (the RAG-Fusion pattern): the CALLER — an LLM agent driving this
// CLI — supplies several rephrasings of one question, and all 2N channel lists fuse
// through the same RRF. Targets the paraphrase-brittleness failure mode documented in
// docs/research-benchmarks-2026-08-26.md section 2.1, where a natural phrasing misses a
// document that the source's own literal vocabulary finds immediately. No LLM call is
// added here: these scripts stay deterministic, the rephrasings come from the caller.
async function cmdSearchMulti(queries, limit) {
  const vecRows = loadVectorRows();
  const perQuery = [];
  for (const q of queries) perQuery.push(await retrieveLists(q, limit, vecRows));
  const fused = fuseRrf(perQuery.flat(), limit);

  // Cross-query agreement: how many of the N rephrasings independently found each chunk's
  // document. A doc corroborated by several phrasings is a stronger signal than RRF's own
  // score, which is max-normalized to 1.000 for the top hit of ANY query (see 2.3/4.2).
  const foundBy = new Map();
  perQuery.forEach((lists, i) => {
    for (const path of new Set(lists.flat().map((h) => h.sourcePath))) {
      if (!foundBy.has(path)) foundBy.set(path, new Set());
      foundBy.get(path).add(i);
    }
  });

  for (const hit of fused) {
    const n = foundBy.get(hit.sourcePath)?.size ?? 1;
    const mark = n > 1 ? `${n}/${queries.length} phrasings` : `1/${queries.length} phrasing`;
    console.log(`[${hit.score.toFixed(3)}] (${mark}) ${hit.sourcePath} — ${hit.title}`);
    console.log(`  ${previewAround(hit.text, queries[0])}\n`);
  }
  if (fused.length === 0) console.log('No results.');
  const corroborated = fused.filter((h) => (foundBy.get(h.sourcePath)?.size ?? 1) > 1).length;
  if (fused.length > 0 && corroborated === 0) {
    // Uncalibrated hint, deliberately worded as a hint — 4.2 showed a thresholded
    // confidence signal here failing badly, so this reports the fact, not a verdict.
    console.log(`Note: no document was found by more than one phrasing — weak corroboration.`);
  }
}

// CLI display convenience, not a mirrored Dori mechanism (dori-engine hands the
// full chunk to the caller, no snippet step of its own) — chunks can still run
// well past 200 chars, so always slicing from position 0 often shows the start
// of the chunk instead of the sentence that actually matched the query.
const PREVIEW_WINDOW = 220;
function previewAround(text, query) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const words = [...new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2))]
    .sort((a, b) => b.length - a.length);
  let matchAt = -1;
  for (const w of words) {
    const idx = flat.toLowerCase().indexOf(w);
    if (idx !== -1) { matchAt = idx; break; }
  }
  if (matchAt === -1) return `${flat.slice(0, PREVIEW_WINDOW)}…`;
  const start = Math.max(0, matchAt - Math.floor(PREVIEW_WINDOW / 3));
  const end = Math.min(flat.length, start + PREVIEW_WINDOW);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < flat.length ? '…' : '';
  return `${prefix}${flat.slice(start, end)}${suffix}`;
}

// One-time backfill for a vault that was already indexed before duplicate detection
// existed — `index`'s per-file dedup check only runs for files whose mtime changed, so
// already-indexed unchanged duplicates would otherwise never get caught. Dedup decisions
// only need file content (a cheap read+hash), not embeddings, so this never re-embeds
// anything — much cheaper than a full reindex. Canonical = lexicographically-first path
// in each duplicate group, deterministic and stable across repeated runs.
async function cmdDedupe() {
  const files = walk(VAULT_ROOT);
  const groups = new Map();
  let skippedTrivial = 0;
  for (const file of files) {
    const relPath = relative(VAULT_ROOT, file);
    const stat = statSync(file);
    const { body } = parseFrontmatter(readFileSync(file, 'utf-8'));
    const mtimeMs = Math.floor(stat.mtimeMs);
    // See MIN_DEDUP_BODY_CHARS's comment in cmdIndex — empty/near-empty bodies all hash
    // the same and would otherwise get wrongly grouped as duplicates of each other.
    if (body.trim().length < MIN_DEDUP_BODY_CHARS) { skippedTrivial++; continue; }
    const hash = contentHash(body);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push({ relPath, mtimeMs });
  }

  const byRelPath = new Map(files.map((f) => [relative(VAULT_ROOT, f), f]));
  const setFileMtime = db.prepare(`
    INSERT INTO indexed_files (source_path, mtime, content_hash, duplicate_of) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET mtime = excluded.mtime, content_hash = excluded.content_hash, duplicate_of = excluded.duplicate_of
  `);
  const getFtsRowidsForPath = db.prepare('SELECT fts_rowid FROM search_chunks WHERE source_path = ? AND vault_id = ? AND fts_rowid IS NOT NULL');
  const deleteFtsByRowid = db.prepare('DELETE FROM search_fts WHERE rowid = ?');
  const countChunksForPath = db.prepare('SELECT COUNT(*) AS n FROM search_chunks WHERE source_path = ? AND vault_id = ?');
  const deleteChunksForPath = db.prepare('DELETE FROM search_chunks WHERE source_path = ? AND vault_id = ?');
  const insertChunk = db.prepare(`
    INSERT INTO search_chunks (chunk_id, vault_id, source_path, kind, collection, content_hash, text, title, embed_model, embed_dims, metadata_json, indexed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVector = db.prepare('INSERT INTO search_vectors (chunk_id, embedding) VALUES (?, ?)');
  const insertFts = db.prepare('INSERT INTO search_fts (text, chunk_id) VALUES (?, ?)');
  const setFtsRowid = db.prepare('UPDATE search_chunks SET fts_rowid = ? WHERE chunk_id = ?');

  // Canonical must be a member that's actually searchable — trusting lexicographic order
  // alone broke this against real data (a source_path can have an indexed_files row with
  // zero actual chunks, a pre-existing gap unrelated to dedup; picking it as canonical
  // over a duplicate that DID have chunks left the whole group unsearchable). Prefer
  // whichever member already has chunks; only if none do, chunk+embed the chosen one.
  let groupsWithDuplicates = 0, filesDeChunked = 0, chunksRemoved = 0, filesBackfilled = 0;
  const examples = [];
  for (const [hash, members] of groups) {
    members.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const withChunks = members.filter((m) => countChunksForPath.get(m.relPath, VAULT_ID).n > 0);
    const canonical = withChunks[0] ?? members[0];
    if (!withChunks.length) {
      const file = byRelPath.get(canonical.relPath);
      const { fm, body } = parseFrontmatter(readFileSync(file, 'utf-8'));
      const title = fm.title || canonical.relPath.split('/').pop().replace(/\.md$/, '');
      const chunks = chunkText(body, CHUNK_TARGET_CHARS);
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const chunkId = `${canonical.relPath}#${i}`;
        const vector = await embed(text);
        const now = new Date().toISOString();
        insertChunk.run(chunkId, VAULT_ID, canonical.relPath, 'note', 'vault', contentHash(text), text, title, EMBED_MODEL, vector.length, JSON.stringify(fm), now, now);
        insertVector.run(chunkId, packFloat32(vector));
        const ftsResult = insertFts.run(text, chunkId);
        setFtsRowid.run(ftsResult.lastInsertRowid, chunkId);
      }
      filesBackfilled++;
    }
    setFileMtime.run(canonical.relPath, canonical.mtimeMs, hash, null);
    const duplicates = members.filter((m) => m.relPath !== canonical.relPath);
    if (duplicates.length === 0) continue;
    groupsWithDuplicates++;
    for (const dup of duplicates) {
      const { n } = countChunksForPath.get(dup.relPath, VAULT_ID);
      if (n > 0) {
        for (const { fts_rowid } of getFtsRowidsForPath.all(dup.relPath, VAULT_ID)) deleteFtsByRowid.run(fts_rowid);
        deleteChunksForPath.run(dup.relPath, VAULT_ID);
        filesDeChunked++;
        chunksRemoved += n;
      }
      setFileMtime.run(dup.relPath, dup.mtimeMs, hash, canonical.relPath);
      if (examples.length < 10) examples.push(`${dup.relPath} == ${canonical.relPath}`);
    }
  }
  console.log(`Dedup scan: ${groupsWithDuplicates} duplicate groups found, ${filesDeChunked} already-indexed duplicates de-chunked (${chunksRemoved} chunks removed), ${filesBackfilled} canonicals back-filled with missing chunks, ${skippedTrivial} trivial/near-empty files excluded from dedup — db: ${DB_PATH}`);
  for (const line of examples) console.log(`  duplicate: ${line}`);
}

// One-time (and resumable) pass that rewrites each file's chunks as
// `<generated context>\n\n<original chunk>` and re-embeds them. Separate subcommand rather
// than a flag on `index` because `index` skips unchanged files by mtime — the whole corpus
// is "unchanged", so a flag there would contextualize nothing.
//
// Resumability is the point: ~2,000 files at ~7s per call is measured in hours, and the run
// WILL be interrupted. `contextualized_at` is set per file immediately after that file's
// chunks are committed, so a re-run picks up exactly where it stopped. A file is only ever
// in the old state or the new state, never half-rewritten.
async function cmdContextualize(limit, pathFilter) {
  const files = walk(VAULT_ROOT);
  const rows = db.prepare('SELECT source_path, contextualized_at, duplicate_of FROM indexed_files').all();
  const state = new Map(rows.map((r) => [r.source_path, r]));

  const getFtsRowids = db.prepare('SELECT fts_rowid FROM search_chunks WHERE source_path = ? AND vault_id = ? AND fts_rowid IS NOT NULL');
  const deleteFtsByRowid = db.prepare('DELETE FROM search_fts WHERE rowid = ?');
  const deleteChunks = db.prepare('DELETE FROM search_chunks WHERE source_path = ? AND vault_id = ?');
  const countChunks = db.prepare('SELECT COUNT(*) AS n FROM search_chunks WHERE source_path = ? AND vault_id = ?');
  const insertChunk = db.prepare(`
    INSERT INTO search_chunks (chunk_id, vault_id, source_path, kind, collection, content_hash, text, title, embed_model, embed_dims, metadata_json, indexed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVector = db.prepare('INSERT INTO search_vectors (chunk_id, embedding) VALUES (?, ?)');
  const insertFts = db.prepare('INSERT INTO search_fts (text, chunk_id) VALUES (?, ?)');
  const setFtsRowid = db.prepare('UPDATE search_chunks SET fts_rowid = ? WHERE chunk_id = ?');
  const markDone = db.prepare('UPDATE indexed_files SET contextualized_at = ? WHERE source_path = ?');

  const todo = [];
  for (const file of files) {
    const relPath = relative(VAULT_ROOT, file);
    const st = state.get(relPath);
    if (!st || st.contextualized_at || st.duplicate_of) continue; // unindexed, done, or a duplicate
    if (countChunks.get(relPath, VAULT_ID).n === 0) continue;     // nothing to rewrite
    // Optional substring filter, so a high-value subset can be done (and measured) first
    // rather than waiting on a full-corpus run that takes hours.
    if (pathFilter && !relPath.toLowerCase().includes(pathFilter.toLowerCase())) continue;
    todo.push({ file, relPath });
  }
  const batch = limit ? todo.slice(0, limit) : todo;
  console.log(`Contextualize: ${todo.length} files pending, processing ${batch.length} this run.`);

  let done = 0, failed = 0, chunksRewritten = 0;
  for (const { file, relPath } of batch) {
    const { fm, body } = parseFrontmatter(readFileSync(file, 'utf-8'));
    const title = fm.title || relPath.split('/').pop().replace(/\.md$/, '');
    const chunks = chunkText(body, CHUNK_TARGET_CHARS);
    if (!chunks.length) { markDone.run(new Date().toISOString(), relPath); continue; }

    const contexts = generateContexts(body, chunks);
    if (!contexts) {
      // Leave the file exactly as it was and move on — an un-contextualized file still
      // retrieves as well as it did before, so a failure costs nothing but the opportunity.
      failed++;
      console.log(`  [skip] ${relPath} (context generation failed)`);
      continue;
    }

    for (const r of getFtsRowids.all(relPath, VAULT_ID)) deleteFtsByRowid.run(r.fts_rowid);
    deleteChunks.run(relPath, VAULT_ID);

    for (let i = 0; i < chunks.length; i++) {
      const text = `${contexts[i]}\n\n${chunks[i]}`;
      const chunkId = `${relPath}#${i}`;
      const vector = await embed(text);
      const now = new Date().toISOString();
      insertChunk.run(chunkId, VAULT_ID, relPath, 'note', 'vault', contentHash(text), text, title, EMBED_MODEL, vector.length, JSON.stringify(fm), now, now);
      insertVector.run(chunkId, packFloat32(vector));
      const ftsResult = insertFts.run(text, chunkId);
      setFtsRowid.run(ftsResult.lastInsertRowid, chunkId);
      chunksRewritten++;
    }
    markDone.run(new Date().toISOString(), relPath);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${batch.length} files, ${chunksRewritten} chunks rewritten`);
  }
  const remaining = todo.length - done;
  console.log(`Contextualized ${done} files (${chunksRewritten} chunks), ${failed} failed, ${remaining} still pending — db: ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// Sufficiency check — failure mode 2.3, "no not-found signal"
// ---------------------------------------------------------------------------
// Neither retrieval channel can say "the vault does not contain this." RRF
// max-normalization pins the top hit of ANY query to 1.000, so the score ladder for four
// verified-absent negative controls came back character-for-character identical to three
// genuine rank-1 successes (docs/baseline-retrieval-eval-2026-08-26.md section 5). A cosine
// floor failed calibration, and cross-query agreement was measured agreeing 3/3 on WRONG
// documents. Both cheap signals are ruled out by evidence, not by taste.
//
// What is left is to read the retrieved text and judge it — a different information source
// from vector geometry. A launch-readiness document sits near "what uptime did we promise"
// in embedding space precisely because it is about the launch, but a reader can see it
// never mentions uptime.
//
// The teeth are the quote check, not the verdict. A sufficient/partial verdict must carry a
// verbatim quote, and every quote is matched back against the SOURCE FILE ON DISK rather
// than the indexed chunk. Three things that buys: a fabricated quote fails, a quote
// stitched together from two passages fails, and a quote lifted from the LLM-generated
// contextual prefix that 62 files carry from the Part 14 experiment fails — because no
// human ever wrote that line into the document. A verdict whose quotes all fail is
// downgraded to insufficient rather than reported as the model stated it.
const VERIFY_MODEL = process.env.VERIFY_MODEL || 'haiku';
const VERIFY_TIMEOUT_MS = 120000;
const VERIFY_DEFAULT_K = 5;
const VERIFY_MAX_PASSAGE_CHARS = 4000; // chunks run past 8k; keeps one prompt bounded
const MIN_QUOTE_CHARS = 12;            // a word or a heading is not evidence

function buildVerifyPrompt(question, passages, scope) {
  const numbered = passages
    .map((p, i) => `<passage index="${i + 1}" source="${p.sourcePath}">\n${p.body}\n</passage>`)
    .join('\n\n');
  // Supplied by the caller, who is the only party that knows it. Questions name their
  // subject loosely — "the archive", "the site", "our stories" — and the referent lives in
  // the conversation, not the question. Without it, a passage about a DIFFERENT archive
  // answers the question's wording perfectly while answering the wrong question.
  const scopeBlock = scope
    ? `\nSCOPE: this question is about ${scope}. Passages concerning a different project,
publication, organization, client, or body of work do NOT answer it, no matter how closely
their wording matches the question.\n`
    : '';
  const scopeLine = scope ? '\nSCOPE_MATCH: <YES|NO|UNCLEAR>' : '';
  const scopeRule = scope
    ? `\n- If the passages are about something other than the stated SCOPE, answer INSUFFICIENT
  and set SCOPE_MATCH to NO, even when they answer the question's literal wording.`
    : '';
  return `You are checking whether retrieved passages actually contain the answer to a question.

Be strict. These passages come from a search index that always returns its top matches, so
they are usually about the right topic even when they contain nothing that answers the
question. Mistaking topical relevance for an answer is the specific error you exist to catch.

QUESTION: ${question}
${scopeBlock}
${numbered}

Classify:
- SUFFICIENT — the passages contain enough to answer the question fully.
- PARTIAL — they contain some of the answer but leave part of it unanswered.
- INSUFFICIENT — they do not answer it. Being about the right project, meeting, or topic is NOT sufficiency.

Rules:
- If uncertain, answer INSUFFICIENT.
- Use only the passages. Do not use outside knowledge and do not infer what was probably meant.
- Questions name their subject loosely ("the archive", "the site", "our stories"). Work out
  what the passages are actually about before deciding. A passage that answers a similarly
  worded question about a DIFFERENT thing — another publication, another project, another
  person's body of work — is NOT an answer. This is the most common way to get this wrong.${scopeRule}
- For SUFFICIENT or PARTIAL you MUST give at least one quote copied character-for-character
  from a passage that carries the answer. Quotes are checked automatically against the source
  documents; an approximate or invented quote fails that check and voids the verdict.
- A quote must be a full clause or sentence, not a single word or a heading.

Output exactly this, nothing else:
VERDICT: <SUFFICIENT|PARTIAL|INSUFFICIENT>
ABOUT: <what the quoted material is specifically about — name the project, publication, organization, or body of work it belongs to>
REASON: <one sentence, under 25 words>${scopeLine}
QUOTE: <passage index>|<verbatim quote>

Give one QUOTE line per supporting quote. For INSUFFICIENT, output no QUOTE lines.
Always output ABOUT, including for INSUFFICIENT — say what the passages were about instead.`;
}

// Whitespace, case, and smart-punctuation are normalized away before matching: a quote that
// is verbatim in substance should not fail because markdown wrapped a line differently or
// the model straightened an apostrophe. Anything beyond that must match exactly.
function normalizeForMatch(s) {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    // Markdown emphasis and code markers are formatting, not wording. A model quoting prose
    // naturally drops them — "by contributor Ronan Roy" for a source that reads "by
    // contributor **Ronan Roy**" — and rejecting that as unverified made a genuine hit fail
    // intermittently (measured: Q9 flipped between sufficient and downgraded across repeated
    // runs on exactly this). Stripped from BOTH sides, so this loosens formatting only and
    // never wording: a quote still has to match the document's actual words to pass.
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const verifyFileCache = new Map();
function sourceText(sourcePath) {
  if (!verifyFileCache.has(sourcePath)) {
    let text = null;
    try {
      text = normalizeForMatch(readFileSync(join(VAULT_ROOT, sourcePath), 'utf8'));
    } catch {
      text = null; // unreadable source cannot corroborate anything — fails closed below
    }
    verifyFileCache.set(sourcePath, text);
  }
  return verifyFileCache.get(sourcePath);
}

function checkQuote(quote, passage) {
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return { ok: false, why: 'too_short' };
  if (!passage) return { ok: false, why: 'bad_passage_index' };
  const src = sourceText(passage.sourcePath);
  if (src === null) return { ok: false, why: 'source_unreadable' };
  if (!src.includes(q)) return { ok: false, why: 'not_in_source' };
  return { ok: true, why: 'ok' };
}

// Applies the two mechanical downgrades to a model-stated verdict. Order matters: scope
// mismatch is checked BEFORE quote coverage, because a wrong-referent answer typically has
// perfectly verifiable quotes — measured, a real disk-verified quote about a 47-story
// personal archive answering a question that meant a 2,500-article publication archive.
// Quote validation cannot catch that, so checking coverage first would name the wrong cause
// on the one failure the quote check is blind to.
function resolveVerdict(verdict, scopeMatch, verifiedCount, about) {
  const none = { verdict, downgraded_from: null, downgrade_cause: null };
  if (verdict === 'insufficient') return none;
  if (scopeMatch === 'NO') {
    return {
      verdict: 'insufficient',
      downgraded_from: verdict,
      downgrade_cause: `passages are about ${about || 'a different subject'}, which is not the requested scope`,
    };
  }
  if (verifiedCount === 0) {
    return {
      verdict: 'insufficient',
      downgraded_from: verdict,
      downgrade_cause: 'no quote could be matched back to its source document',
    };
  }
  return none;
}

async function cmdVerify(question, k, scope) {
  const emit = (o) => console.log(JSON.stringify(o, null, 2));
  const lists = await retrieveLists(question, k, loadVectorRows());
  const hits = fuseRrf(lists, k);

  if (hits.length === 0) {
    emit({ question, scope: scope ?? null, verdict: 'insufficient', reason: 'retrieval returned no passages', passages: [], quotes: [], model: VERIFY_MODEL });
    return;
  }

  const passages = hits.map((h) => ({
    sourcePath: h.sourcePath,
    title: h.title,
    body: h.text.length > VERIFY_MAX_PASSAGE_CHARS
      ? h.text.slice(0, VERIFY_MAX_PASSAGE_CHARS) + '\n[...passage truncated...]'
      : h.text,
  }));

  const started = Date.now();
  const res = spawnSync('claude', ['-p', '--model', VERIFY_MODEL], {
    input: buildVerifyPrompt(question, passages, scope),
    encoding: 'utf8',
    timeout: VERIFY_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const elapsed_ms = Date.now() - started;
  const shown = passages.map((p) => p.sourcePath);

  // Fails closed and says so. "unverified" is deliberately NOT "insufficient": the caller
  // must be able to tell "the vault does not have this" apart from "the check did not run",
  // because only the first is a fact about the vault.
  if (res.error || res.status !== 0 || !res.stdout) {
    const why = res.error ? res.error.message : `exit status ${res.status}`;
    emit({ question, scope: scope ?? null, verdict: 'unverified', reason: `sufficiency check did not run: ${why}`, passages: shown, quotes: [], elapsed_ms, model: VERIFY_MODEL });
    return;
  }

  const vm = res.stdout.match(/^\s*VERDICT:\s*(SUFFICIENT|PARTIAL|INSUFFICIENT)\b/im);
  if (!vm) {
    emit({ question, scope: scope ?? null, verdict: 'unverified', reason: 'sufficiency check returned no parsable verdict', passages: shown, quotes: [], elapsed_ms, model: VERIFY_MODEL });
    return;
  }
  let verdict = vm[1].toLowerCase();
  const reason = (res.stdout.match(/^\s*REASON:\s*(.+)$/im)?.[1] ?? '').trim();
  // What the passages are actually about, in the model's own words. Reported even when no
  // scope was supplied: an ambiguous question ("how many stories are in the archive") gets
  // silently resolved to whichever referent the passages happen to carry, and naming it is
  // what lets the caller see the assumption instead of inheriting it.
  const about = (res.stdout.match(/^\s*ABOUT:\s*(.+)$/im)?.[1] ?? '').trim();
  // Absent/garbled SCOPE_MATCH reads as UNCLEAR, never as YES — a scope check that failed to
  // parse must not be able to wave a mismatched answer through.
  const scopeMatch = scope
    ? (res.stdout.match(/^\s*SCOPE_MATCH:\s*(YES|NO|UNCLEAR)\b/im)?.[1] ?? 'UNCLEAR').toUpperCase()
    : null;

  const quotes = [...res.stdout.matchAll(/^\s*QUOTE:\s*(\d+)\s*\|(.+)$/gim)].map((m) => {
    const idx = Number(m[1]);
    const text = m[2].trim();
    const passage = passages[idx - 1];
    const chk = checkQuote(text, passage);
    return { passage: idx, source: passage?.sourcePath ?? null, quote: text, verified: chk.ok, check: chk.why };
  });

  const verifiedCount = quotes.filter((q) => q.verified).length;
  const resolved = resolveVerdict(verdict, scopeMatch, verifiedCount, about);
  verdict = resolved.verdict;
  const { downgraded_from, downgrade_cause } = resolved;

  emit({
    question,
    ...(scope ? { scope, scope_match: scopeMatch } : {}),
    verdict, about, reason,
    ...(downgraded_from ? { downgraded_from, downgrade_cause } : {}),
    quotes_verified: verifiedCount, quotes_claimed: quotes.length,
    quotes, passages: shown, elapsed_ms, model: VERIFY_MODEL,
  });
}

const [, , cmd, arg1, arg2] = process.argv;
if (cmd === 'index') {
  await cmdIndex(arg1);
} else if (cmd === 'search') {
  if (!arg1) { console.error('Usage: node semantic-index.mjs search "<query>" [limit]'); process.exit(1); }
  await cmdSearch(arg1, arg2 ? Number(arg2) : DEFAULT_LIMIT);
} else if (cmd === 'search-multi') {
  // Variable arg count: every positional is one full rephrasing, with an optional bare
  // trailing number as the limit (only popped when 3+ args remain, so two queries and no
  // limit still parse as two queries).
  const rest = process.argv.slice(3);
  const limit = rest.length > 2 && /^\d+$/.test(rest[rest.length - 1]) ? Number(rest.pop()) : DEFAULT_LIMIT;
  if (rest.length < 2) {
    console.error('Usage: node semantic-index.mjs search-multi "<phrasing 1>" "<phrasing 2>" ["<phrasing 3>"] [limit]');
    process.exit(1);
  }
  await cmdSearchMulti(rest, limit);
} else if (cmd === 'dedupe') {
  await cmdDedupe();
} else if (cmd === 'contextualize') {
  await cmdContextualize(arg1 ? Number(arg1) : 0, arg2);
} else if (cmd === 'verify') {
  const usage = 'Usage: node semantic-index.mjs verify "<question>" [k] [--scope "<what the question is about>"]';
  const rest = process.argv.slice(3);
  const si = rest.indexOf('--scope');
  let scope;
  if (si !== -1) {
    scope = rest[si + 1];
    if (!scope || scope.startsWith('--')) { console.error(`--scope needs a value.\n${usage}`); process.exit(1); }
    rest.splice(si, 2);
  }
  if (!rest[0]) { console.error(usage); process.exit(1); }
  await cmdVerify(rest[0], rest[1] ? Number(rest[1]) : VERIFY_DEFAULT_K, scope);
} else {
  console.error('Usage: node semantic-index.mjs index [file] | search "<query>" [limit] | search-multi "<q1>" "<q2>" [limit] | verify "<question>" [k] [--scope "<subject>"] | dedupe | contextualize [maxFiles] [pathFilter]');
  process.exit(1);
}
