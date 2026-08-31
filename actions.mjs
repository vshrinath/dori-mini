#!/usr/bin/env node
// Dori Mini's action registry — mirrors real Dori's DoriActionDefinition shape
// (@dori/contracts, dori-engine/packages/contracts/src/actions.ts) scoped down
// to what a single-user local tool needs. One definition per action, callable
// uniformly from this CLI (unchanged) and from the MCP server (mcp-server.mjs).
//
// Ported from the real shape: id, description, a Zod inputSchema (validated
// the same way regardless of caller), scope (read|write), and exposeToMcp
// (real Dori defaults this false — "only a small curated set of high-value
// primitives" get external exposure; mirrored here for the same reason: not
// every internal script should become an externally-callable tool).
//
// Deliberately NOT ported: requiresAuthority/risk tiers/authority-gate
// machinery (decision 0014 in real Dori) and workflow-engine integration —
// those exist to govern a multi-surface product with a real approval system.
// Dori Mini has no equivalent on the other end to plug into; porting the
// gate without anything to gate would be complexity with nothing to hold up.
import { z } from 'zod';
import { listTasks } from './list-tasks.mjs';
import { buildInbox } from './list-inbox.mjs';
import { resolve as resolveClarification, dismiss as dismissClarification } from './clarification-store.mjs';
import { search as searchVault, listDocs, getDocument } from './query-vault.mjs';
import { renderMarkdownToHtml } from './render-html.mjs';
import { canonicalOutputPath } from './route-destination.mjs';
import { buildTimeline } from './timeline.mjs';
import { listProjects } from './list-projects.mjs';
import { getSelf, setSelf } from './self-store.mjs';
import { setTaskStatus } from './task-store.mjs';

/** @typedef {{ id: string, description: string, inputSchema: import('zod').ZodType, scope: 'read'|'write', exposeToMcp?: boolean, handler: (input: any) => Promise<any> | any }} ActionDefinition */

/** @type {ActionDefinition[]} */
export const actions = [
  {
    id: 'list_tasks',
    description: 'List open tasks from the real task store (dori-engine\'s <vault>/.dori/tasks/records/*.json)',
    inputSchema: z.object({
      status: z.enum(['open', 'done', 'all']).default('open'),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ status }) => listTasks(status),
  },
  {
    id: 'mark_task_done',
    description: 'Mark an open task done in the real task store',
    inputSchema: z.object({
      id: z.string(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ id }) => setTaskStatus(id, 'done'),
  },
  {
    id: 'list_inbox',
    description: 'List pending items detected by watch-inbox.mjs, optionally filtered by status',
    inputSchema: z.object({
      status: z.enum(['detected', 'approved', 'ignored']).optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ status }) => buildInbox({ includeFailures: false }).filter((i) => !status || i.status === status),
  },
  {
    id: 'approve_inbox_item',
    description: 'Approve a pending inbox clarification (resolves it, optionally picking a candidate)',
    inputSchema: z.object({
      clarificationId: z.string(),
      choiceId: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ clarificationId, choiceId }) => resolveClarification(clarificationId, { choiceId }),
  },
  {
    id: 'ignore_inbox_item',
    description: 'Ignore a pending inbox clarification (dismisses it)',
    inputSchema: z.object({
      clarificationId: z.string(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ clarificationId }) => dismissClarification(clarificationId),
  },
  {
    id: 'search_vault',
    description: 'Full-text search over the vault (meetings, notes, decisions) — the flagship recall primitive',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ query, limit }) => searchVault(query, { limit }),
  },
  {
    id: 'route_destination',
    description: 'Compute where a fresh capture would land in the vault (yt/, references/clippings/, projects/<path>/, or inbox/) — a pure path computation, does not write anything',
    inputSchema: z.object({
      kind: z.enum(['youtube', 'url', 'document', 'text']),
      projectPath: z.string().optional(),
      url: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ kind, projectPath, url }) =>
      canonicalOutputPath({ kind, urls: url ? [url] : [], projectPath: projectPath || null }),
  },
  {
    id: 'timeline',
    description: 'Chronological view across meetings, decisions, and tasks — "what happened when"',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).optional(),
      since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ limit, since }) => buildTimeline({ limit, since }),
  },
  {
    id: 'list_projects',
    description: 'List projects and sub-projects (project_path is slash-separated, e.g. "aligna/platform")',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => listProjects(),
  },
  {
    id: 'get_profile',
    description: 'Get the user\'s own profile (the person entity marked is_self: true)',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => getSelf(),
  },
  {
    id: 'set_profile',
    description: 'Set the user\'s own profile (creates/updates the person entity marked is_self: true)',
    inputSchema: z.object({
      name: z.string().min(1),
      role: z.string().optional(),
      org: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ name, role, org }) => setSelf({ name, role, org }),
  },
  {
    id: 'list_documents',
    description: 'List every indexed vault document (rel_path, title, type, date) for browsing by type',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ limit }) => listDocs({ limit }),
  },
  {
    id: 'get_document',
    description: 'Get one document\'s raw content + frontmatter + pre-rendered HTML by rel_path (or title)',
    inputSchema: z.object({
      path: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ path }) => {
      const doc = getDocument(path);
      return doc && { ...doc, html: renderMarkdownToHtml(doc.content) };
    },
  },
];

export function getAction(id) {
  const action = actions.find((a) => a.id === id);
  if (!action) throw new Error(`No action registered with id: ${id}`);
  return action;
}

if (import.meta.main) {
  const { strict: assert } = await import('node:assert');
  assert.equal(actions.filter((a) => a.exposeToMcp).length, 13, 'all thirteen sketch actions should be MCP-exposed');
  assert.throws(() => getAction('nope'));
  console.log('ok —', actions.map((a) => a.id).join(', '));
}
