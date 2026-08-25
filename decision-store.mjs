#!/usr/bin/env node
// Mirrors dori-engine's decisions.capture action (decisions-capture.ts) +
// DecisionRecord (packages/contracts/src/decision-record.ts) — extends decision
// recall past meeting minutes to ANY captured text/note. Previously the only way
// a decision became findable here was via a meeting's "### Decisions Log"
// heading (mom-prompt.md); a decision mentioned in a plain note was invisible.
//
// Real Dori classifies via an in-action callAI() call. This mirror has no such
// in-script model call, so the classification step happens the same way
// task-store.mjs's transcript-compression step does: SKILL.md has the calling
// agent run CLASSIFY_PROMPT (below, copied verbatim from decisions-capture.ts's
// buildPrompt) via the Agent tool, then call this script's `create` with the
// result. Same threshold, same shape: MIN_TEXT_LENGTH=30, CONFIDENCE_THRESHOLD=0.8,
// MAX_SUMMARY_LENGTH=120 — below the confidence bar, don't call create at all
// (mirrors the real action's status:'skipped', reason:'not_a_decision').
//
// Storage: entities/decisions/<slug>.md — one-file-per-entity, same shape as
// every other vault entity. Frontmatter fields mirror decisionToMarkdownFrontmatter
// exactly (type/id/summary/status/decided_at/owner/topics/confidence/capture_id).
// `id` here is `decision_<uuid>` (task-store.mjs's convention for a fresh local
// id) rather than the real record's content-hash id — dori-mini has no
// captureId system to hash against.
//
// Usage:
//   node decision-store.mjs create --summary "<one sentence>" --confidence <0-1>
//     [--owner "<name>"] [--topics a,b,c] [--decided-at <ISO date>] [--source "<free text>"]
//   node decision-store.mjs list [--status active|implemented|superseded|retracted]
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const DECISIONS_DIR = join(VAULT_ROOT, 'entities/decisions');

export const MIN_TEXT_LENGTH = 30;
export const CONFIDENCE_THRESHOLD = 0.8;
export const MAX_SUMMARY_LENGTH = 120;
const MAX_INPUT_LENGTH = 2000;

// Copied verbatim from decisions-capture.ts's buildPrompt — run this via the
// Agent tool (a cheap model is fine, same spirit as task-store.mjs's haiku
// compression pass) whenever a captured note/text is ≥30 chars and isn't
// already meeting-minutes (those get their own Decisions Log via mom-prompt.md).
export function classifyPrompt(text) {
  return `Classify whether the following message or note contains a decision — a firm commitment to a specific course of action. Exploratory questions, suggestions, and discussions are NOT decisions.

Return ONLY valid JSON, no markdown:
{
  "isDecision": true or false,
  "confidence": 0.0 to 1.0,
  "summary": "one sentence describing what was decided, or empty string if not a decision",
  "owner": "name of who made the decision, or null",
  "topics": ["up to 3 short topic tags"]
}

Message:
${text.slice(0, MAX_INPUT_LENGTH)}`;
}

function slugify(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

function unquote(s) {
  return (s || '').replace(/^["']|["']$/g, '');
}

function parseList(raw) {
  return (raw?.match(/"([^"]*)"/g) || []).map((s) => s.replace(/"/g, ''));
}

export function loadDecisions() {
  if (!existsSync(DECISIONS_DIR)) return [];
  return readdirSync(DECISIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(join(DECISIONS_DIR, f), 'utf-8'));
      return {
        slug: f.replace(/\.md$/, ''),
        id: fm.id,
        summary: unquote(fm.summary),
        status: fm.status || 'active',
        decidedAt: fm.decided_at,
        owner: unquote(fm.owner) || undefined,
        topics: parseList(fm.topics),
        confidence: fm.confidence !== undefined ? Number(fm.confidence) : undefined,
        source: unquote(fm.source) || undefined,
      };
    });
}

// Mirrors decisions.capture's post-classification gate: below the confidence
// threshold, empty summary, or not flagged a decision — nothing gets written.
export function shouldCapture({ isDecision, confidence, summary }) {
  return Boolean(isDecision) && Number(confidence) >= CONFIDENCE_THRESHOLD && Boolean(summary?.trim());
}

export function createDecision({ summary, confidence, owner, topics = [], decidedAt, source }) {
  if (!summary?.trim()) throw new Error('--summary is required');
  const clippedSummary = summary.trim().slice(0, MAX_SUMMARY_LENGTH);
  const id = `decision_${randomUUID()}`;
  const slug = `${slugify(clippedSummary).slice(0, 40) || 'decision'}-${id.slice(-8)}`;
  const now = new Date().toISOString();

  const lines = [
    '---',
    'type: decision',
    `id: ${id}`,
    `summary: "${clippedSummary.replace(/"/g, '\\"')}"`,
    'status: active',
    `decided_at: ${decidedAt || now}`,
    ...(owner ? [`owner: "${owner}"`] : []),
    ...(topics.length ? [`topics: [${topics.map((t) => `"${t}"`).join(', ')}]`] : []),
    ...(confidence !== undefined ? [`confidence: ${Number(confidence)}`] : []),
    ...(source ? [`source: "${source.replace(/"/g, '\\"')}"`] : []),
    `created_at: ${now}`,
    'updated_at: ' + now,
    '---',
    '',
  ];

  mkdirSync(DECISIONS_DIR, { recursive: true });
  const relPath = `entities/decisions/${slug}.md`;
  writeFileSync(join(VAULT_ROOT, relPath), lines.join('\n'));
  return { success: true, id, slug, relPath, summary: clippedSummary };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'create') {
    const flags = parseFlags(rest);
    if (flags.confidence !== undefined && Number(flags.confidence) < CONFIDENCE_THRESHOLD) {
      console.error(`Confidence ${flags.confidence} is below the ${CONFIDENCE_THRESHOLD} threshold — not captured (mirrors decisions.capture's own gate). Pass --confidence >= ${CONFIDENCE_THRESHOLD} only when the classifier actually returned that.`);
      process.exit(1);
    }
    try {
      console.log(JSON.stringify(createDecision({
        summary: flags.summary,
        confidence: flags.confidence !== undefined ? Number(flags.confidence) : undefined,
        owner: flags.owner,
        topics: flags.topics ? flags.topics.split(',').map((t) => t.trim()).filter(Boolean) : [],
        decidedAt: flags['decided-at'],
        source: flags.source,
      }), null, 2));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else if (cmd === 'list' || !cmd) {
    const flags = parseFlags(rest);
    const decisions = loadDecisions().filter((d) => !flags.status || d.status === flags.status);
    if (decisions.length === 0) console.log('No decisions on file.');
    else for (const d of decisions) {
      console.log(`- [${d.status}] ${d.summary}${d.owner ? ` (${d.owner})` : ''}${d.decidedAt ? ` — ${d.decidedAt.slice(0, 10)}` : ''}`);
    }
  } else {
    console.error('Usage: node decision-store.mjs create --summary "<text>" --confidence <0-1> [--owner "<name>"] [--topics a,b,c] [--decided-at <ISO>] [--source "<text>"]\n   or: node decision-store.mjs list [--status active|implemented|superseded|retracted]');
    process.exit(1);
  }
}
