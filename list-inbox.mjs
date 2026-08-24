#!/usr/bin/env node
// Minimal local mirror of Dori's `buildInboxProjection` (dori-engine/src/shell/inbox.ts).
// Real Dori aggregates 7 sources (folder batches, jobs, staged moves, suggested
// rules, triage-unattached, clarifications, thread-attention) — most of those
// require a persistent background engine (job queue, filesystem watcher, thread
// ingestion) this synchronous, per-invocation skill doesn't have. Only two
// sources translate: files sitting in vault-relative `inbox/` (bare captures
// nobody's routed to a project), and pending ClarificationRecords. Sorted
// newest-first, matching `sortInboxDecisions`.
//
// Usage: node list-inbox.mjs
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { list as listClarifications } from './clarification-store.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const INBOX_DIR = join(VAULT_ROOT, 'inbox');

function inboxFiles() {
  let entries;
  try {
    entries = readdirSync(INBOX_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => {
      const full = join(INBOX_DIR, e.name);
      const stat = statSync(full);
      return {
        type: 'inbox_file',
        title: e.name,
        relPath: `inbox/${e.name}`,
        createdAt: new Date(stat.mtimeMs).toISOString(),
      };
    });
}

function pendingClarifications() {
  return listClarifications({ status: 'pending' }).map((r) => ({
    type: 'clarification',
    title: r.prompt,
    clarificationId: r.id,
    domain: r.domain,
    candidates: r.candidates.map((c) => c.label),
    createdAt: r.createdAt,
  }));
}

export function buildInbox() {
  const items = [...inboxFiles(), ...pendingClarifications()];
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const items = buildInbox();
  if (items.length === 0) {
    console.log('Inbox is empty — no unrouted captures, no pending clarifications.');
  } else {
    console.log(JSON.stringify(items, null, 2));
  }
}
