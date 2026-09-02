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
import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, posix as pathPosix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { listTasks } from './list-tasks.mjs';
import { buildInbox } from './list-inbox.mjs';
import { resolve as resolveClarification, dismiss as dismissClarification } from './clarification-store.mjs';
import { search as searchVault, listDocs, getDocument, getProjectDetails, toggleMarkdownTask } from './query-vault.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { renderMarkdownToHtml } from './render-html.mjs';
import { canonicalOutputPath, isYouTubeUrl, VAULT_ROOT } from './route-destination.mjs';
import { buildTimeline } from './timeline.mjs';
import { listProjects } from './list-projects.mjs';
import { getSelf, setSelf } from './self-store.mjs';
import { setTaskStatus, addTask } from './task-store.mjs';
import { captureText } from './capture-text.mjs';
import { captureFile } from './capture-file.mjs';
import { saveDocument } from './save-document.mjs';
import { getEngineConfig, setEngineConfig } from './engine-config.mjs';
import { sendChatMessage } from './chat-runner.mjs';
import { loadLedgers, parseTripLedger } from './query-ledger.mjs';
import { findLedgerRelPath, checkGaps } from './check-reimbursement-gaps.mjs';
import { routeExpense } from './expense-router.mjs';
import { attachReceipt } from './attach-receipt.mjs';
import { buildPackage, rewriteStatus } from './close-trip.mjs';
import { listAllMeetings, findFiledRecordingIds, fathomFetch, formatTranscript } from './fetch-fathom.mjs';
import { routeMeeting } from './route-meeting.mjs';
import { meetingPrep } from './meeting-prep.mjs';
import { loadOrgs, ensureOrg, loadAccounts, loadPeople } from './org-store.mjs';
import { loadBrands, getBrand, getBrandContext, setBrand } from './brand-store.mjs';
import { researchPerson } from './research-person.mjs';
import { researchAndRecommend } from './research-and-recommend.mjs';
import { mergeEntity } from './entity-merge.mjs';
import { loadDecisions, createDecision } from './decision-store.mjs';
import { convertDocument } from './convert-document.mjs';
import { db as getCredentialsDb } from './credentials-lib.mjs';
import { processMeetingMinutes } from './process-meeting-minutes.mjs';

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
    description: 'Mark an open task done in the real task store or markdown checklist',
    inputSchema: z.object({
      id: z.string(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ id }) => {
      if (id.includes('.md:')) {
        return toggleMarkdownTask(id, 'done');
      }
      return setTaskStatus(id, 'done');
    },
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
      path: z.string().min(1).optional(),
      relPath: z.string().min(1).optional(),
    }).refine((data) => Boolean(data.path || data.relPath), {
      message: 'path or relPath is required',
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ path, relPath }) => {
      const targetPath = path || relPath;
      const doc = getDocument(targetPath);
      if (!doc) return null;
      const { fm, body } = parseFrontmatter(doc.content || '');
      const frontmatter = { ...doc.frontmatter, ...fm };
      const bodyContent = body || doc.content || '';
      const html = renderMarkdownToHtml(bodyContent);
      return {
        ...doc,
        frontmatter,
        body: bodyContent,
        html,
        renderedHtml: html,
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
      // Only meaningful over IPC (main.js uses it to route stream chunks
      // back to the right chat bubble) -- unused by the plain handler below,
      // which non-Electron callers (CLI, MCP) still get.
      requestId: z.string().optional(),
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
  {
    id: 'list_trip_ledgers',
    description: 'List all trip and reimbursement ledgers with itemized row count, status, totals, and incomplete field counts',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadLedgers().map(({ threadId, relPath, ledger, totals: t }) => ({
          threadId,
          relPath,
          trip: ledger.trip,
          account: ledger.account,
          status: ledger.status,
          rowCount: t.rowCount,
          incompleteCount: t.incompleteCount,
          total: t.total,
          reimbursableTotal: t.reimbursableTotal,
        }));
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'list_ledgers',
    description: 'List all trip and reimbursement ledgers (alias for list_trip_ledgers)',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadLedgers().map(({ threadId, relPath, ledger, totals: t }) => ({
          threadId,
          relPath,
          trip: ledger.trip,
          account: ledger.account,
          status: ledger.status,
          rowCount: t.rowCount,
          incompleteCount: t.incompleteCount,
          total: t.total,
          reimbursableTotal: t.reimbursableTotal,
        }));
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'get_trip_ledger',
    description: 'Get full itemized rows, status, frontmatter, and totals for a specific trip ledger',
    inputSchema: z.object({
      target: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ target }) => {
      const norm = (target || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const match = loadLedgers().find((l) => l.threadId === target || (l.ledger?.trip && l.ledger.trip.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() === norm) || l.relPath === target);
      if (!match) throw new Error(`No ledger found matching "${target}"`);
      return match;
    },
  },
  {
    id: 'get_ledger',
    description: 'Get full itemized rows, status, frontmatter, and totals for a specific trip ledger (alias for get_trip_ledger)',
    inputSchema: z.object({
      target: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ target }) => {
      const norm = (target || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const match = loadLedgers().find((l) => l.threadId === target || (l.ledger?.trip && l.ledger.trip.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() === norm) || l.relPath === target);
      if (!match) throw new Error(`No ledger found matching "${target}"`);
      return match;
    },
  },
  {
    id: 'check_reimbursement_gaps',
    description: 'Run reimbursement audit and evidence gap detection on a trip ledger',
    inputSchema: z.object({
      target: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ target }) => {
      const relPath = findLedgerRelPath(target);
      if (!relPath) throw new Error(`No ledger found matching "${target}"`);
      const raw = readFileSync(join(VAULT_ROOT, relPath), 'utf-8');
      return { ledgerRelPath: relPath, ...checkGaps(relPath, raw) };
    },
  },
  {
    id: 'route_expense',
    description: 'Parse a natural language expense statement, extract amount/category, and route to matching trip ledger or clarification',
    inputSchema: z.object({
      message: z.string().min(1),
      key: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ message, key }) => routeExpense(message, key),
  },
  {
    id: 'attach_receipt',
    description: 'Attach a receipt image/PDF to a trip ledger with OCR metadata, booking ref, or supersede marker',
    inputSchema: z
      .object({
        file: z.string().optional(),
        filePath: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        desc: z.string().min(1),
        amount: z.number().positive(),
        thread: z.string().optional(),
        trip: z.string().optional(),
        account: z.string().optional(),
        category: z.string().optional(),
        tax: z.number().optional(),
        paidBy: z.string().optional(),
        reimbursable: z.boolean().optional(),
        bookingRef: z.string().optional(),
        supersedes: z.string().optional(),
        id: z.string().optional(),
      })
      .refine((data) => Boolean(data.file || data.filePath), {
        message: 'Either file or filePath is required',
      }),
    scope: 'write',
    exposeToMcp: true,
    handler: (input) => {
      const targetFile = input.file || input.filePath;
      const opts = {
        date: input.date,
        desc: input.desc,
        amount: input.amount,
        thread: input.thread,
        trip: input.trip,
        account: input.account,
        category: input.category,
        tax: input.tax,
        'paid-by': input.paidBy,
        reimbursable: input.reimbursable !== undefined ? (input.reimbursable ? 'true' : 'false') : undefined,
        'booking-ref': input.bookingRef,
        supersedes: input.supersedes,
        id: input.id,
      };
      return attachReceipt(targetFile, opts);
    },
  },
  {
    id: 'close_trip',
    description: 'Transition a trip ledger status (draft -> submitted -> paid) and generate structured reimbursement package markdown',
    inputSchema: z.object({
      target: z.string().min(1),
      status: z.enum(['submitted', 'paid']).optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ target, status }) => {
      const relPath = findLedgerRelPath(target);
      if (!relPath) throw new Error(`No ledger found matching "${target}"`);
      let raw = readFileSync(join(VAULT_ROOT, relPath), 'utf-8');
      let ledger = parseTripLedger(relPath, raw);
      const STATUS_ORDER = ['draft', 'submitted', 'paid'];
      if (status) {
        const fromIdx = STATUS_ORDER.indexOf(ledger.status);
        const toIdx = STATUS_ORDER.indexOf(status);
        if (toIdx < 0) throw new Error(`Unknown status "${status}"`);
        if (toIdx <= fromIdx) throw new Error(`Cannot move status backward or sideways: ${ledger.status} -> ${status}`);
        raw = rewriteStatus(raw, status);
        writeFileSync(join(VAULT_ROOT, relPath), raw);
        ledger = parseTripLedger(relPath, raw);
      }
      const threadId = (raw.match(/^threadId:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
      const gapsResult = checkGaps(relPath, raw);
      const { markdown, claimTotal } = buildPackage(relPath, ledger, gapsResult, threadId);
      const dir = pathPosix.dirname(relPath);
      const idPart = threadId || (ledger.trip || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const packageRelPath = `${dir}/${idPart}-reimbursement-package.md`;
      writeFileSync(join(VAULT_ROOT, packageRelPath), markdown);
      return {
        ledgerRelPath: relPath,
        packageRelPath,
        status: ledger.status,
        claimTotal: claimTotal.toFixed(2),
        gaps: gapsResult.gaps.length,
      };
    },
  },
  {
    id: 'list_fathom_meetings',
    description: 'List recordings from Fathom AI REST API, indicating which are already filed in the vault',
    inputSchema: z.object({
      since: z.string().optional(),
      includeFiled: z.boolean().default(false),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: async ({ since, includeFiled }) => {
      const meetings = await listAllMeetings({ since });
      const filed = findFiledRecordingIds();
      const formatted = meetings.map((m) => ({
        recordingId: String(m.recording_id),
        title: m.meeting_title || m.title || 'Untitled meeting',
        date: (m.recording_start_time || m.created_at || '').slice(0, 10),
        recordedAt: m.recording_start_time || m.created_at,
        durationMin: m.duration ? Math.round(m.duration / 60) : undefined,
        url: m.url,
        invitees: (m.calendar_invitees || []).map((i) => i.name || i.email),
        isFiled: filed.has(String(m.recording_id)),
      }));
      return includeFiled ? formatted : formatted.filter((m) => !m.isFiled);
    },
  },
  {
    id: 'get_fathom_meeting',
    description: 'Fetch transcript and metadata for a specific Fathom recording',
    inputSchema: z.object({
      recordingId: z.string().min(1),
      since: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: async ({ recordingId, since }) => {
      const meetings = await listAllMeetings({ since });
      const meta = meetings.find((m) => String(m.recording_id) === String(recordingId));
      const transcriptData = await fathomFetch(`/recordings/${recordingId}/transcript`);
      const segments = transcriptData.transcript || [];
      return {
        recordingId,
        title: meta?.meeting_title || meta?.title || 'Meeting',
        date: (meta?.recording_start_time || meta?.created_at || '').slice(0, 10),
        recordedAt: meta?.recording_start_time || meta?.created_at,
        invitees: meta?.calendar_invitees || [],
        url: meta?.url,
        transcript: formatTranscript(segments),
        segments,
      };
    },
  },
  {
    id: 'route_meeting',
    description: 'Route meeting attendees to matching project directory or record a routing clarification',
    inputSchema: z.object({
      attendees: z.array(z.string()).min(1),
      selfName: z.string().optional(),
      key: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ attendees, selfName, key }) =>
      routeMeeting(attendees, selfName || process.env.DORI_SELF_NAME || '', key),
  },
  {
    id: 'get_meeting_prep',
    description: 'Generate meeting briefing from attendee names and project context',
    inputSchema: z.object({
      attendees: z.array(z.string()).min(1),
      project: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ attendees, project }) => meetingPrep(attendees, project),
  },
  {
    id: 'meeting_prep',
    description: 'Generate meeting briefing from attendee names and project context (alias for get_meeting_prep)',
    inputSchema: z.object({
      attendees: z.array(z.string()).min(1),
      project: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ attendees, project }) => meetingPrep(attendees, project),
  },
  {
    id: 'file_meeting',
    description: 'File meeting minutes/transcript into the vault with YAML frontmatter and trigger vault reindexing',
    inputSchema: z.object({
      title: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      transcript: z.string().min(1),
      attendees: z.array(z.string()).optional(),
      projectPath: z.string().optional(),
      fathomRecordingId: z.string().optional(),
      fathomUrl: z.string().optional(),
      durationMin: z.number().optional(),
      minutes: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: async ({
      title,
      date,
      transcript,
      attendees = [],
      projectPath,
      fathomRecordingId,
      fathomUrl,
      durationMin,
      minutes,
    }) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'meeting';
      const targetDir = projectPath ? `entities/projects/${projectPath}/meetings` : 'meetings';
      let relPath = `${targetDir}/${date}-${slug}.md`;
      let absPath = join(VAULT_ROOT, relPath);
      if (existsSync(absPath)) {
        const suffix = fathomRecordingId || Math.random().toString(36).slice(2, 6);
        relPath = `${targetDir}/${date}-${slug}-${suffix}.md`;
        absPath = join(VAULT_ROOT, relPath);
      }
      mkdirSync(dirname(absPath), { recursive: true });

      const frontmatterLines = [
        '---',
        'kind: meeting',
        'type: meeting',
        `date: '${date}'`,
        `title: "${title.replace(/"/g, '\\"')}"`,
        'source: fathom',
        ...(fathomRecordingId ? [`fathom_recording_id: "${fathomRecordingId}"`] : []),
        ...(fathomUrl ? [`fathom_url: "${fathomUrl.replace(/"/g, '\\"')}"`] : []),
        ...(projectPath ? [`project: "${projectPath}"`] : []),
        'attendees:',
        ...(attendees.length ? attendees.map((a) => `  - "${a.replace(/"/g, '\\"')}"`) : ['  []']),
        ...(durationMin != null ? [`duration_min: ${durationMin}`] : []),
        '---',
        '',
        `# ${title}`,
        '',
        `**Date:** ${date}`,
        `**Attendees:** ${attendees.join(', ') || 'Unknown'}`,
        ...(durationMin != null ? [`**Duration:** ~${durationMin} minutes`] : []),
        '',
      ];

      if (minutes) {
        frontmatterLines.push('## Minutes', '', minutes, '');
      }

      frontmatterLines.push('## Transcript', '', transcript, '');

      writeFileSync(absPath, frontmatterLines.join('\n'));

      try {
        const HERE = dirname(fileURLToPath(import.meta.url));
        execFileSync('node', [join(HERE, 'reindex-vault.mjs')], { stdio: 'ignore' });
      } catch {}

      return { success: true, relPath, title };
    },
  },
  {
    id: 'process_meeting',
    description: 'Process a raw meeting transcript into structured Minutes of Meeting (MOM), extract tasks, and reindex vault',
    inputSchema: z.object({
      relPath: z.string().min(1),
      force: z.boolean().default(false),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ relPath, force }) => processMeetingMinutes({ relPath, force }),
  },
  {
    id: 'list_orgs',
    description: 'List all organization entities on file with roles, linked people, and evidence',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadOrgs();
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'list_accounts',
    description: 'List all client, prospect, and partner accounts in the vault with relationship details',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadAccounts();
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'list_people',
    description: 'List all people entities with organization affiliations and contact roles',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadPeople();
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'ensure_org',
    description: 'Ensure organization exists, linking person and validating affiliation evidence',
    inputSchema: z.object({
      orgName: z.string().min(1),
      personSlug: z.string().optional(),
      personName: z.string().optional(),
      evidenceText: z.string().optional(),
      role: z.enum(['client', 'vendor', 'partner', 'employer', 'none']).optional(),
      requireEvidence: z.boolean().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: (input) => ensureOrg(input),
  },
  {
    id: 'list_brands',
    description: 'List all brands on file with colors, typography, owner, and logo',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      try {
        return loadBrands();
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'get_brand',
    description: 'Get brand details and guidelines context prompt by brand name',
    inputSchema: z.object({
      name: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ name }) => ({ brand: getBrand(name), context: getBrandContext(name) }),
  },
  {
    id: 'get_brand_context',
    description: 'Get formatted brand guidelines prompt context block for writing in brand voice',
    inputSchema: z.object({
      name: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ name }) => ({ context: getBrandContext(name) }),
  },
  {
    id: 'set_brand',
    description: 'Create or update brand theme tokens and guidelines',
    inputSchema: z.object({
      name: z.string().min(1),
      owner: z.string().optional(),
      company: z.string().optional(),
      primary: z.string().optional(),
      accent: z.string().optional(),
      fontDisplay: z.string().optional(),
      fontBody: z.string().optional(),
      logo: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ name, ...fields }) => setBrand(name, fields),
  },
  {
    id: 'research_person',
    description: 'Search web for person and company background via Tavily',
    inputSchema: z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      context: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ name, company, context }) => researchPerson(name, company, context),
  },
  {
    id: 'research_and_recommend',
    description: 'Research person on web and cross-reference with vault relationships, colleagues, and docs',
    inputSchema: z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      context: z.string().optional(),
      project: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ name, company, context, project }) => researchAndRecommend(name, company, context, project),
  },
  {
    id: 'merge_entity',
    description: 'Merge duplicate person or organization entity, unioning aliases and updating vault references',
    inputSchema: z.object({
      type: z.enum(['person', 'org']),
      sourceSlug: z.string().min(1),
      targetSlug: z.string().min(1),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ type, sourceSlug, targetSlug }) => mergeEntity(type, sourceSlug, targetSlug),
  },
  {
    id: 'list_decisions',
    description: 'List recorded decisions across the vault, optionally filtered by status',
    inputSchema: z.object({
      status: z.enum(['active', 'implemented', 'superseded', 'retracted']).optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ status }) => {
      try {
        const all = loadDecisions();
        return status ? all.filter((d) => d.status === status) : all;
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'create_decision',
    description: 'Create and record a new decision in the vault',
    inputSchema: z.object({
      summary: z.string().min(1),
      confidence: z.number().min(0).max(1).optional(),
      owner: z.string().optional(),
      topics: z.array(z.string()).optional(),
      decidedAt: z.string().optional(),
      source: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: (input) => createDecision(input),
  },
  {
    id: 'add_task',
    description: 'Add an open task to the real task store (<vault>/.dori/tasks/records/<id>.json)',
    inputSchema: z.object({
      title: z.string().min(1),
      due: z.string().optional(),
      owner: z.string().optional(),
    }),
    scope: 'write',
    exposeToMcp: true,
    handler: ({ title, due, owner }) => addTask({ title, due, owner }),
  },
  {
    id: 'convert_document',
    description: 'Convert local document (PDF, DOCX, PPTX, XLSX) to Markdown text for preview or filing',
    inputSchema: z.object({
      filePath: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: async ({ filePath }) => ({
      markdown: await convertDocument(filePath),
      filePath,
    }),
  },
  {
    id: 'list_credentials',
    description: 'List stored credential services, label, and field counts',
    inputSchema: z.object({
      service: z.string().optional(),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ service }) => {
      try {
        const d = getCredentialsDb();
        try {
          if (service) {
            const rows = d.prepare('SELECT service, field, secret, updated_at FROM credentials WHERE service = ? ORDER BY field').all(service);
            return rows.map((r) => ({ service: r.service, field: r.field, secret: Boolean(r.secret), updatedAt: r.updated_at }));
          }
          const rows = d.prepare('SELECT service, field, value, secret FROM credentials ORDER BY service').all();
          const byService = new Map();
          for (const r of rows) {
            if (!byService.has(r.service)) byService.set(r.service, { service: r.service, fieldCount: 0, label: null, hasPlain: false });
            const s = byService.get(r.service);
            s.fieldCount++;
            if (r.field === 'label') s.label = r.value;
            if (!r.secret) s.hasPlain = true;
          }
          return [...byService.values()];
        } finally {
          d.close();
        }
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'find_credentials',
    description: 'Find credential entries by matching query terms against service name, label, and aliases',
    inputSchema: z.object({
      query: z.string().min(1),
    }),
    scope: 'read',
    exposeToMcp: true,
    handler: ({ query }) => {
      try {
        const d = getCredentialsDb();
        try {
          const rows = d.prepare(`SELECT service, field, value FROM credentials WHERE field IN ('label', 'aliases') AND secret = 0`).all();
          const byService = new Map();
          for (const r of rows) {
            if (!byService.has(r.service)) byService.set(r.service, { service: r.service, label: null, aliases: null });
            byService.get(r.service)[r.field] = r.value;
          }
          const terms = query.toLowerCase().trim().split(/\s+/);
          const scored = [];
          for (const [service, e] of byService) {
            const hay = `${service} ${e.label || ''} ${e.aliases || ''}`.toLowerCase();
            const score = terms.filter((t) => hay.includes(t)).length;
            if (score) scored.push({ service, label: e.label, aliases: e.aliases, score });
          }
          const best = Math.max(0, ...scored.map((m) => m.score));
          return scored.filter((m) => m.score === best).map(({ score, ...item }) => item);
        } finally {
          d.close();
        }
      } catch (err) {
        if (err.code === 'EPERM' || err.code === 'ENOENT') return [];
        throw err;
      }
    },
  },
  {
    id: 'start_credential_server',
    description: 'Launch local secure browser form intake server for credential entry',
    inputSchema: z.object({}),
    scope: 'read',
    exposeToMcp: true,
    handler: () => {
      return new Promise((resolve, reject) => {
        const HERE = dirname(fileURLToPath(import.meta.url));
        const child = spawn(process.execPath, [join(HERE, 'add-credential-server.mjs')], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
        child.unref();
        let output = '';
        child.stdout.on('data', (data) => {
          output += data.toString();
          const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+/);
          if (match) {
            resolve({ url: match[0] });
          }
        });
        child.stderr.on('data', (data) => {
          console.error('[add-credential-server]', data.toString());
        });
        child.on('error', (err) => reject(err));
        setTimeout(() => {
          if (!output) reject(new Error('Timed out waiting for credential intake server URL'));
        }, 5000);
      });
    },
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
    assert.equal(actions.filter((a) => a.exposeToMcp).length, 52, 'all fifty-two actions should be MCP-exposed');
    assert.throws(() => getAction('nope'));
    console.log('ok —', actions.map((a) => a.id).join(', '));
  }
}
