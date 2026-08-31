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
// Usage: node list-inbox.mjs [--all]
//   --all  also include workflow-failure notices (excluded by default — see
//          WORKFLOW_FAILURE_TITLE below)
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { list as listClarifications } from './clarification-store.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const INBOX_DIR = join(VAULT_ROOT, 'inbox');

// WorkflowEngine auto-titles its own failure notices "Workflow <name> failed."
// and routes them back through capture intake (dori-engine's src/workflow/engine.ts).
// Left unfiltered these bury real inbox items under operational noise whenever
// a workflow is failing repeatedly (e.g. the portal being offline). See
// dori-vault/ops/2026-08-22-capture-intake-enrichment-no-ai-provider.md.
const WORKFLOW_FAILURE_TITLE = /^Workflow .+ failed\.?$/i;
const isWorkflowFailure = (title) => WORKFLOW_FAILURE_TITLE.test(title);

function frontmatterTitle(full) {
  try {
    const head = readFileSync(full, 'utf8').slice(0, 2000);
    const m = head.match(/^title:\s*"?(.*?)"?\s*$/m);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function inboxFiles({ includeFailures = false } = {}) {
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
        title: frontmatterTitle(full) || e.name,
        relPath: `inbox/${e.name}`,
        createdAt: new Date(stat.mtimeMs).toISOString(),
      };
    })
    .filter((item) => includeFailures || !isWorkflowFailure(item.title));
}

function pendingClarifications() {
  return listClarifications({ status: 'pending' }).map((r) => ({
    type: 'clarification',
    title: r.prompt,
    clarificationId: r.id,
    domain: r.domain,
    candidates: r.candidates.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
    createdAt: r.createdAt,
  }));
}

export function buildInbox({ includeFailures = false } = {}) {
  const items = [...inboxFiles({ includeFailures }), ...pendingClarifications()];
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const includeFailures = process.argv.includes('--all');
  const items = buildInbox({ includeFailures });
  if (items.length === 0) {
    console.log('Inbox is empty — no unrouted captures, no pending clarifications.');
  } else {
    console.log(JSON.stringify(items, null, 2));
  }
}
