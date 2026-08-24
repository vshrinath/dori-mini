#!/usr/bin/env node
// Mirrors dori-engine/src/clarification/store.ts's FsClarificationStore + the
// ClarificationRecordSchema exactly (decision 0019) — content-addressed id
// (sha256 of vaultId/domain/key, so re-creating with the same key dedupes
// instead of stacking), pending/resolved/dismissed lifecycle, stale-choice
// rejection on resolve. Does NOT mirror the learnField/learnKey → Rule
// auto-promotion path (that's the separate rules-store stretch item).
//
// Deliberately stored at ~/.dori/clarifications/, NOT dori-vault/.dori/clarifications/
// (where real Dori keeps it) — .dori/ inside the vault is live-engine-internal
// state we've established as off-limits to write into directly, even though this
// particular store is "just JSON files." Keeping our mirror in our own ~/.dori/
// avoids any collision with a live Dori engine that starts up later.
//
// Usage:
//   node clarification-store.mjs create --domain <domain> --key <key> --prompt "<text>" [--candidates 'id1:Label 1|id2:Label 2'] [--context 'k=v,k2=v2']
//   node clarification-store.mjs list [--status pending|resolved|dismissed]
//   node clarification-store.mjs resolve <id> --choice <candidateId> | --note "<text>"
//   node clarification-store.mjs dismiss <id>
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = process.env.CLARIFICATION_STORE_ROOT || join(homedir(), '.dori/clarifications');
mkdirSync(ROOT, { recursive: true });

function clarificationId(vaultId, domain, key) {
  return createHash('sha256').update(`${vaultId}\0${domain}\0${key}`).digest('hex');
}

function recordPath(id) {
  return join(ROOT, `${id}.json`);
}

function readRecord(id) {
  const p = recordPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function writeRecord(record) {
  const p = recordPath(record.id);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(record, null, 2));
  renameSync(tmp, p);
}

export function create({ vaultId = 'local', domain, key, prompt, candidates = [], context = {} }) {
  const id = clarificationId(vaultId, domain, key);
  const existing = readRecord(id);
  if (existing) {
    if (existing.status !== 'pending') return existing;
    const refreshed = { ...existing, prompt, candidates, context };
    writeRecord(refreshed);
    return refreshed;
  }
  const record = {
    id,
    vaultId,
    domain,
    prompt,
    candidates,
    context,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  writeRecord(record);
  return record;
}

export function list({ vaultId, status } = {}) {
  if (!existsSync(ROOT)) return [];
  const records = readdirSync(ROOT)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
    .map((f) => readRecord(f.slice(0, -'.json'.length)))
    .filter(Boolean)
    .filter((r) => (vaultId ? r.vaultId === vaultId : true))
    .filter((r) => (status ? r.status === status : true));
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return records;
}

export function resolve(id, { choiceId, note } = {}) {
  const record = readRecord(id);
  if (!record) return null;
  if (record.status !== 'pending') return record;
  if (choiceId && record.candidates.length > 0 && !record.candidates.some((c) => c.id === choiceId)) {
    throw new Error(`Stale choice: candidate "${choiceId}" is no longer available for this clarification`);
  }
  const resolved = {
    ...record,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    resolvedChoiceId: choiceId,
    resolvedNote: note,
  };
  writeRecord(resolved);
  return resolved;
}

export function dismiss(id) {
  const record = readRecord(id);
  if (!record) return null;
  if (record.status !== 'pending') return record;
  const dismissed = { ...record, status: 'dismissed', dismissedAt: new Date().toISOString() };
  writeRecord(dismissed);
  return dismissed;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[key] = val;
    }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  const flags = parseFlags(rest);

  if (cmd === 'create') {
    const candidates = flags.candidates
      ? flags.candidates.split('|').map((c) => {
          const [id, ...labelParts] = c.split(':');
          return { id: id.trim(), label: labelParts.join(':').trim() };
        })
      : [];
    const context = flags.context
      ? Object.fromEntries(flags.context.split(',').map((kv) => kv.split('=').map((s) => s.trim())))
      : {};
    console.log(JSON.stringify(create({ vaultId: flags.vaultId, domain: flags.domain, key: flags.key, prompt: flags.prompt, candidates, context }), null, 2));
  } else if (cmd === 'list') {
    console.log(JSON.stringify(list({ vaultId: flags.vaultId, status: flags.status }), null, 2));
  } else if (cmd === 'resolve') {
    const id = rest[0];
    console.log(JSON.stringify(resolve(id, { choiceId: flags.choice, note: flags.note }), null, 2));
  } else if (cmd === 'dismiss') {
    const id = rest[0];
    console.log(JSON.stringify(dismiss(rest[0]), null, 2));
  } else {
    console.error('Usage: create | list | resolve <id> | dismiss <id>');
    process.exit(1);
  }
}
