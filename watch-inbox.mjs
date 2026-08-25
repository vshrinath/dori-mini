#!/usr/bin/env node
// Mirrors dori-engine's watcher/index.ts + pending-batch-store.ts — a passively
// watched dropbox folder (e.g. Downloads, a scanner's save folder), scoped down
// from the real mechanism to what a single-user local tool actually needs.
// Researched from the real source directly, not guessed:
//
// - Real Dori's `reviewPolicy` is a per-folder static setting ('auto' skips
//   straight to ingestion, anything else — the default — defers to a review
//   queue). This mirror only ever defers to review: nothing here should
//   silently auto-file an unreviewed drop into the vault.
// - Stability check: chokidar's own `awaitWriteFinish` is real Dori's actual
//   debounce (a `stableMs`-long window with no size/mtime change). This mirror
//   has no chokidar dependency (plain-Node-only is the whole pitch), so it
//   polls the directory every POLL_MS and applies the identical rule by hand:
//   `now - lastChangedAt >= STABLE_MS` before a file counts as stable.
//   STABLE_MS=3000 matches real Dori's DEFAULT_STABLE_MS exactly.
// - Move vs. delete: real Dori's `findRelocatableOrphan` is an identity-proxy
//   match (filename + size + mtimeMs against a path verified gone), NOT a
//   content hash — content hashing there is only for a separate dedup ledger
//   at actual-ingestion time, unrelated to move detection. Mirrored exactly:
//   a newly-stable file matching a missing pending item's filename+size+mtime
//   is relocated in place (same id), not filed as a new duplicate.
// - A missing file isn't declared gone immediately — MISSING_GRACE_MS=120000
//   matches real Dori's PATH_MISSING_GRACE_MS (2 minutes) exactly, giving a
//   slow move/rename time to resolve via the orphan match above.
//
// Deliberately NOT mirrored — real infrastructure this tool has no equivalent
// of: job-queue/captureId coupling, per-project batch scoping (dori-mini has
// no project registry), the split processed-hash dedup ledger, retry/backoff
// concurrency handling, and the portal review UI (this script's `list` is the
// entire review surface). This is detection/triage only — approving an item
// tells you what it is and where it likely goes; it never files the file
// itself, that's still route-destination.mjs / attach-receipt.mjs's job, run
// by the calling agent.
//
// Watched folder must NOT be inside the vault (mirrors assertNoVaultOverlap —
// a watcher inside the vault would see its own writes and self-trigger).
//
// Usage:
//   node watch-inbox.mjs watch              # long-lived poll loop (run via launchd)
//   node watch-inbox.mjs once                # two ticks, STABLE_MS apart, then exit
//   node watch-inbox.mjs list [--status detected|approved|ignored]
//   node watch-inbox.mjs approve <id>
//   node watch-inbox.mjs ignore <id>
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const VAULT_ROOT = resolve(process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault'));
const WATCH_DIR = resolve(process.env.DORI_WATCH_DIR || join(homedir(), 'Dori Inbox'));
const STATE_DIR = join(homedir(), '.dori');
const STATE_FILE = join(STATE_DIR, 'watch-inbox-state.json');
const PENDING_FILE = join(STATE_DIR, 'watch-inbox-pending.json');

export const STABLE_MS = 3000;
export const MISSING_GRACE_MS = 120_000;
const POLL_MS = 1000;

// Mirrors assertNoVaultOverlap — a watched path inside/equal to/an ancestor
// of the vault would see its own writes and never stop triggering itself.
function assertNoVaultOverlap(watchDir, vaultRoot) {
  const a = watchDir.endsWith(sep) ? watchDir : watchDir + sep;
  const b = vaultRoot.endsWith(sep) ? vaultRoot : vaultRoot + sep;
  if (watchDir === vaultRoot || a.startsWith(b) || b.startsWith(a)) {
    throw new Error(`DORI_WATCH_DIR (${watchDir}) overlaps the vault (${vaultRoot}) — a watcher inside the vault would see its own writes and self-trigger forever. Point it at a real dropbox folder instead.`);
  }
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}

function saveJson(path, data) {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  writeFileSync(path, readFileSync(tmp));
}

// Mirrors suggestedDestination's heuristic exactly (filename hints at an
// invoice/receipt/bill), pointed at this vault's own routing scripts instead
// of a portal triage queue.
function suggestDestination(filename) {
  if (/invoice|receipt|bill|gst|payment/i.test(filename)) {
    return 'expense — likely a receipt, see attach-receipt.mjs';
  }
  return 'inbox — run route-destination.mjs once you know what it is';
}

function listDirFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

/**
 * One scan tick: mirrors scanFolderDeferred's stability/orphan/missing logic.
 * `state` = { seen: {filename: {size,mtimeMs,firstSeenAt,lastChangedAt}} }
 * `pending` = array of pending items (see module doc for shape).
 */
export function scanTick(watchDir, state, pending, now = Date.now()) {
  const currentFiles = new Set(listDirFiles(watchDir));
  const seen = state.seen || (state.seen = {});

  // 1. Update/seed seen[] for every file currently on disk.
  for (const name of currentFiles) {
    const stat = statSync(join(watchDir, name));
    const prev = seen[name];
    if (!prev) {
      seen[name] = { size: stat.size, mtimeMs: stat.mtimeMs, firstSeenAt: now, lastChangedAt: now };
    } else if (prev.size !== stat.size || prev.mtimeMs !== stat.mtimeMs) {
      seen[name] = { ...prev, size: stat.size, mtimeMs: stat.mtimeMs, lastChangedAt: now, missingAt: undefined };
      // Content changed after the file was already pending (re-saved before
      // review) — keep the same pending item (same id), just refresh what it
      // reports rather than leaving it pointing at stale size/mtime.
      if (prev.pendingId) {
        const item = pending.find((p) => p.id === prev.pendingId);
        if (item) { item.size = stat.size; item.mtimeMs = stat.mtimeMs; }
      }
    } else {
      delete seen[name].missingAt;
    }
  }

  // 2. Files that vanished since the last tick: start (or continue) the grace
  //    clock rather than declaring a delete immediately (a slow move/rename
  //    needs time to resolve via the orphan match below).
  for (const name of Object.keys(seen)) {
    if (currentFiles.has(name)) continue;
    if (seen[name].missingAt === undefined) seen[name].missingAt = now;
  }

  // 3. Newly-stable files (no change for STABLE_MS) become pending items,
  //    unless they match a missing pending item's filename+size+mtimeMs —
  //    real Dori's findRelocatableOrphan: relocate in place, same id, don't
  //    duplicate. A move only counts once the OLD path is actually gone.
  for (const name of currentFiles) {
    const entry = seen[name];
    if (now - entry.lastChangedAt < STABLE_MS) continue;
    if (entry.pendingId) continue; // already tracked

    const orphan = pending.find(
      (p) => p.status !== 'ignored' && !currentFiles.has(basename(p.path)) &&
        p.filename === name && p.size === entry.size && p.mtimeMs === entry.mtimeMs,
    );
    if (orphan) {
      orphan.path = join(watchDir, name);
      orphan.relocatedAt = now;
      entry.pendingId = orphan.id;
      continue;
    }

    const item = {
      id: randomUUID(),
      filename: name,
      path: join(watchDir, name),
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      detectedAt: now,
      status: 'detected',
      suggestedDestination: suggestDestination(name),
    };
    pending.push(item);
    entry.pendingId = item.id;
  }

  // 4. Files missing past the grace period with no orphan match: genuinely
  //    gone — drop the seen entry (leave the pending item as history; it'll
  //    just never resolve further since its path no longer exists).
  for (const name of Object.keys(seen)) {
    const entry = seen[name];
    if (entry.missingAt === undefined) continue;
    if (now - entry.missingAt >= MISSING_GRACE_MS) delete seen[name];
  }

  return { state, pending };
}

function runTick() {
  assertNoVaultOverlap(WATCH_DIR, VAULT_ROOT);
  mkdirSync(WATCH_DIR, { recursive: true });
  const state = loadJson(STATE_FILE, { seen: {} });
  const pending = loadJson(PENDING_FILE, []);
  scanTick(WATCH_DIR, state, pending);
  saveJson(STATE_FILE, state);
  saveJson(PENDING_FILE, pending);
  return pending;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function watchLoop() {
  console.log(`Watching ${WATCH_DIR} (poll every ${POLL_MS}ms, stability window ${STABLE_MS}ms)...`);
  for (;;) {
    runTick();
    await sleep(POLL_MS);
  }
}

async function once() {
  runTick();
  await sleep(STABLE_MS);
  const pending = runTick();
  const fresh = pending.filter((p) => Date.now() - p.detectedAt < STABLE_MS * 2 && p.status === 'detected');
  console.log(JSON.stringify({ scanned: WATCH_DIR, newItems: fresh }, null, 2));
}

function list(status) {
  const pending = loadJson(PENDING_FILE, []);
  const filtered = pending.filter((p) => !status || p.status === status);
  if (filtered.length === 0) { console.log(status ? `No ${status} items.` : 'No pending items.'); return; }
  for (const p of filtered) {
    console.log(`[${p.status}] ${p.id.slice(0, 8)}  ${p.filename}  — ${p.suggestedDestination}`);
  }
}

function setStatus(id, status) {
  const pending = loadJson(PENDING_FILE, []);
  const item = pending.find((p) => p.id === id || p.id.startsWith(id));
  if (!item) throw new Error(`No pending item matching id: ${id}`);
  item.status = status;
  saveJson(PENDING_FILE, pending);
  return item;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, arg] = process.argv;
  try {
    if (cmd === 'watch') {
      assertNoVaultOverlap(WATCH_DIR, VAULT_ROOT);
      await watchLoop();
    } else if (cmd === 'once') {
      await once();
    } else if (cmd === 'list') {
      const flags = process.argv.slice(3);
      const statusIdx = flags.indexOf('--status');
      list(statusIdx >= 0 ? flags[statusIdx + 1] : undefined);
    } else if (cmd === 'approve' && arg) {
      console.log(JSON.stringify(setStatus(arg, 'approved'), null, 2));
    } else if (cmd === 'ignore' && arg) {
      console.log(JSON.stringify(setStatus(arg, 'ignored'), null, 2));
    } else {
      console.error('Usage: node watch-inbox.mjs watch | once | list [--status detected|approved|ignored] | approve <id> | ignore <id>');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
