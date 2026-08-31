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
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listTasks } from './list-tasks.mjs';
import { buildInbox } from './list-inbox.mjs';
import { resolve as resolveClarification, dismiss as dismissClarification } from './clarification-store.mjs';
import { search as searchVault, listDocs, getDocument, getProjectDetails } from './query-vault.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { renderMarkdownToHtml } from './render-html.mjs';
import { canonicalOutputPath, isYouTubeUrl, VAULT_ROOT } from './route-destination.mjs';
import { buildTimeline } from './timeline.mjs';
import { listProjects } from './list-projects.mjs';
import { getSelf, setSelf } from './self-store.mjs';
import { setTaskStatus } from './task-store.mjs';
import { captureText } from './capture-text.mjs';
import { captureFile } from './capture-file.mjs';
import { saveDocument } from './save-document.mjs';
import { getEngineConfig, setEngineConfig } from './engine-config.mjs';
import { sendChatMessage } from './chat-runner.mjs';

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
    id: 'get_project_details',
    description: 'Get linked files, meetings, people, and details for a project',
    inputSchema: z.object({
      projectPath: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ projectPath }) => getProjectDetails(projectPath),
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
      if (!doc) return null;
      const { fm, body } = parseFrontmatter(doc.content || '');
      const frontmatter = { ...doc.frontmatter, ...fm };
      const bodyContent = body || doc.content || '';
      return {
        ...doc,
        frontmatter,
        body: bodyContent,
        html: renderMarkdownToHtml(bodyContent),
      };
    },
  },
  {
    id: 'capture_text',
    description: 'Capture a plain-text note to the vault (mirrors the mini-bar\'s quick-capture path) — writes to inbox/ and reindexes',
    inputSchema: z.object({
      text: z.string().min(1),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ text }) => captureText(text),
  },
  {
    id: 'capture_file',
    description: 'Copy a dropped/attached file into the vault (does not convert or index it — a raw document, same as any other file already in the vault)',
    inputSchema: z.object({
      sourcePath: z.string().min(1),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ sourcePath }) => captureFile(sourcePath),
  },
  {
    id: 'save_document',
    description: 'Save edited markdown content to an existing vault document and trigger non-fatal reindexing (FTS + semantic)',
    inputSchema: z.object({
      path: z.string().min(1),
      content: z.string(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ path, content }) => saveDocument(path, content),
  },
  {
    id: 'get_engine_config',
    description: 'Get the active local coding-agent AI engine config (claude | codex | none)',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => getEngineConfig(),
  },
  {
    id: 'set_engine_config',
    description: 'Set the active local coding-agent AI engine config in ~/.dori/whatsapp-config.json',
    inputSchema: z.object({
      replyCli: z.enum(['claude', 'codex', 'none']),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ replyCli }) => setEngineConfig({ replyCli }),
  },
  {
    id: 'chat_send',
    description: 'Send a message to Dori conversational AI using the configured local CLI backend (claude or codex)',
    inputSchema: z.object({
      message: z.string().min(1),
      history: z
        .array(
          z.object({
            role: z.enum(['user', 'dori']),
            text: z.string(),
          })
        )
        .optional(),
      projectContext: z.string().optional(),
    }),
    // 'write', not 'read': the model behind this can (once sandboxed
    // correctly) invoke any of the write actions in this same registry via
    // the CLI dispatcher below. Labeling it 'read' understated what it can
    // actually do.
    scope: 'write',
    exposeToMcp: true,
    handler: ({ message, history, projectContext }) =>
      sendChatMessage({ message, history, projectContext }),
  },
  {
    id: 'capture_url',
    description: 'Capture a URL/bookmark or YouTube link into the vault',
    inputSchema: z.object({
      url: z.string().min(1),
      title: z.string().optional(),
      projectPath: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: async ({ url, title, projectPath }) => {
      const isYt = isYouTubeUrl(url);
      const kind = isYt ? 'youtube' : 'url';
      const relPath = canonicalOutputPath({ kind, urls: [url], projectPath });
      const absPath = join(VAULT_ROOT, relPath);
      const docTitle = title || (isYt ? 'YouTube Video' : url);
      const now = new Date().toISOString();
      const content = `---
title: "${docTitle.replace(/"/g, '\\"')}"
type: "${kind}"
url: "${url}"
created: ${now}
source: "quick_capture"
${projectPath ? `project: "${projectPath}"\n` : ''}---

[${docTitle}](${url})
`;
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
      try {
        const HERE = dirname(fileURLToPath(import.meta.url));
        execFileSync('node', [join(HERE, 'reindex-vault.mjs')], { stdio: 'ignore' });
      } catch {}
      return { relPath, title: docTitle };
    },
  },
  {
    id: 'save_profile',
    description: 'Save/update user profile fields (alias for set_profile)',
    inputSchema: z.object({
      name: z.string().optional(),
      role: z.string().optional(),
      org: z.string().nullable().optional(),
      projects: z.array(z.string()).optional(),
      links: z.record(z.string(), z.string()).optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: (input) => setSelf(input),
  },
];

export function getAction(id) {
  const action = actions.find((a) => a.id === id);
  if (!action) throw new Error(`No action registered with id: ${id}`);
  return action;
}

// CLI dispatch: `node actions.mjs run <action_id> '<json_input>'`. This is
// the one command chat-runner.mjs's --allowedTools/--sandbox restriction
// allowlists for the headless model -- it must actually exist and actually
// go through getAction()/inputSchema.parse(), not just be a string the
// system prompt claims works (see docs/features/dori-go-composer-chat's
// review notes, 2026-08-31: the prompt referenced this command before it
// was implemented).
async function runFromCli(actionId, jsonInput) {
  if (!actionId) {
    console.error("Usage: node actions.mjs run <action_id> '<json_input>'");
    process.exit(1);
  }
  try {
    const action = getAction(actionId);
    const input = jsonInput ? JSON.parse(jsonInput) : {};
    const parsed = action.inputSchema.parse(input);
    const result = await action.handler(parsed);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

if (import.meta.main) {
  const [cmd, actionId, jsonInput] = process.argv.slice(2);
  if (cmd === 'run') {
    await runFromCli(actionId, jsonInput);
  } else {
    const { strict: assert } = await import('node:assert');
    assert.equal(actions.filter((a) => a.exposeToMcp).length, 22, 'all twenty-two sketch actions should be MCP-exposed');
    assert.throws(() => getAction('nope'));
    console.log('ok —', actions.map((a) => a.id).join(', '));
  }
}
