#!/usr/bin/env node
// Mirrors dori-engine's meeting -> task pipeline for `extract`: tasks.detect's
// parseActionItems() (src/workflows/mom-tasks.ts) feeding tasks.create_many
// (src/actions/definitions/tasks-create-many.ts) — same "### Action Items" /
// "**Person**" / checkbox-line format mom-prompt.md already tells the agent
// to produce, same blocking-dependency rule (a task owned by someone else is
// only created if a self-owned item's "Depends on" names that person —
// everything else is silently skipped, never guessed at), same dedup-by-
// source (never re-creates a task already extracted from this meeting file).
// `add` mirrors the same action for a single manually-specified item (no
// meeting source, owner defaults to self) — real Dori has no separate
// "manual add" action, tasks.create_many just takes whatever items a caller
// passes, which is exactly what a direct "Dori, add a task" is.
//
// Real JSON shape: packages/contracts/src/tasks.ts's TaskRecordSchema,
// persisted by FsTaskStore.save() to <vault>/.dori/tasks/records/<id>.json
// (same directory list-tasks.mjs already reads).
//
// ponytail: person resolution is a simplified local mirror — real Dori
// resolves against a JSON entity store (FsEntityStore); this resolves by
// exact/first-name match against entities/people/*.md frontmatter `name`
// fields instead, since that's the only person store dori-mini has
// (self-store.mjs/org-store.mjs). Upgrade if dori-mini ever grows fuzzy
// alias matching.
//
// Usage:
//   node task-store.mjs extract <meeting-minutes.md path, relative to vault>
//   node task-store.mjs add "<title>" [--due <date|relative>] [--owner <name>]
//   node task-store.mjs --test
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getSelf } from './self-store.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const TASKS_DIR = join(VAULT_ROOT, '.dori/tasks/records');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');

function parseFrontmatterName(raw) {
  const m = raw.match(/^name:\s*"?([^"\n]+)"?\s*$/m);
  return m ? m[1].trim() : null;
}

function listKnownPeople() {
  if (!existsSync(PEOPLE_DIR)) return [];
  return readdirSync(PEOPLE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseFrontmatterName(readFileSync(join(PEOPLE_DIR, f), 'utf-8')))
    .filter(Boolean);
}

// Mirrors resolvePersonEntity's tiers: exact name match, then unique
// first-name match (>=3 chars) — never synthesizes a person from free text.
function resolvePerson(name, known, selfName) {
  if (selfName && name.toLowerCase() === selfName.toLowerCase()) return { name: selfName, isSelf: true };
  const exact = known.find((k) => k.toLowerCase() === name.toLowerCase());
  if (exact) return { name: exact, isSelf: false };
  const first = name.split(/\s+/)[0];
  if (first.length >= 3) {
    const matches = known.filter((k) => k.split(/\s+/)[0].toLowerCase() === first.toLowerCase());
    if (matches.length === 1) return { name: matches[0], isSelf: false };
  }
  return { name, isSelf: false, ambiguous: true };
}

// Mirrors tasks-create-many.ts's resolveDeadline: literal YYYY-MM-DD passes
// through; relative terms resolve against `today`.
export function resolveDeadline(raw, today = new Date()) {
  if (!raw || /^tbd$/i.test(raw)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(today);
  const lower = raw.toLowerCase();
  if (lower === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (lower === 'eod' || lower === 'today') { /* same day */ }
  else if (lower === 'eow' || lower === 'end of week') d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  else if (lower === 'eom' || lower === 'end of month') d.setMonth(d.getMonth() + 1, 0);
  else if (lower === 'next week') d.setDate(d.getDate() + 7);
  else return undefined;
  return d.toISOString().slice(0, 10);
}

// Mirrors mom-tasks.ts's parseActionItems: "**Person**" heading followed by
// "- [ ] Task | Deadline: X | Depends on: Y" lines.
export function parseActionItems(markdown) {
  const section = markdown.match(/###\s*Action Items\s*\n([\s\S]*?)(?=\n###|\n##[^#]|$)/i);
  if (!section) return [];
  const items = [];
  let currentPerson = null;
  for (const line of section[1].split('\n')) {
    const personMatch = line.match(/^\*\*(.+?)\*\*/);
    if (personMatch) { currentPerson = personMatch[1].trim(); continue; }
    const taskMatch = line.match(/^-\s*\[ \]\s*(.+)/);
    if (taskMatch && currentPerson) {
      const parts = taskMatch[1].split('|').map((p) => p.trim());
      const deadlineRaw = (parts.find((p) => /^deadline:/i.test(p)) || '').replace(/^deadline:\s*/i, '').trim();
      const dependsOnRaw = (parts.find((p) => /^depends on:/i.test(p)) || '').replace(/^depends on:\s*/i, '').trim();
      items.push({
        person: currentPerson,
        description: parts[0],
        dueDate: resolveDeadline(deadlineRaw),
        dependsOn: dependsOnRaw && !/^none$/i.test(dependsOnRaw) ? dependsOnRaw : undefined,
      });
    }
  }
  return items;
}

function buildTask({ title, owner, status = 'open', dueDate, waiting, sourceMeetingPath, sourceDescription, confirmed = true }) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `task_${randomUUID()}`,
    title,
    status,
    priority: 'normal',
    owner,
    dueDate,
    waiting,
    // extractedFrom holds the raw action-item description (pre-"Waiting: "
    // prefix) so dedup below matches regardless of any display-title prefix.
    source: sourceMeetingPath ? { sourceType: 'meeting_note', meetingPath: sourceMeetingPath, extractedFrom: sourceDescription } : { sourceType: 'manual' },
    tags: status === 'waiting' ? ['from-meeting', 'waiting-for'] : sourceMeetingPath ? ['from-meeting'] : [],
    confirmed,
    createdAt: now,
    updatedAt: now,
  };
}

function writeTask(task) {
  mkdirSync(TASKS_DIR, { recursive: true });
  writeFileSync(join(TASKS_DIR, `${task.id}.json`), JSON.stringify(task, null, 2) + '\n');
}

function alreadyExtractedFrom(meetingRelPath) {
  if (!existsSync(TASKS_DIR)) return new Set();
  return new Set(
    readdirSync(TASKS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf-8')))
      .filter((t) => t.source?.meetingPath === meetingRelPath)
      .map((t) => t.source.extractedFrom)
  );
}

// Mirrors tasks-create-many.ts's run(): self-owned items become tasks; a
// commitment owned by someone else is created (as a blocking `waiting` task)
// only if some self-owned item's "Depends on" names that person — otherwise
// it's skipped, never written.
export function extractTasks(markdown, meetingRelPath) {
  const self = getSelf();
  const known = listKnownPeople();
  const items = parseActionItems(markdown).map((item) => ({ ...item, resolved: resolvePerson(item.person, known, self?.name) }));

  const selfDependsOnNames = new Set(
    items.filter((i) => i.resolved.isSelf && i.dependsOn).map((i) => i.dependsOn.toLowerCase())
  );
  const alreadyExtracted = alreadyExtractedFrom(meetingRelPath);

  const created = [];
  const skipped = [];
  for (const item of items) {
    if (alreadyExtracted.has(item.description)) { skipped.push({ ...item, reason: 'already extracted' }); continue; }
    if (item.resolved.isSelf) {
      created.push(buildTask({
        title: item.description, owner: item.resolved.name, dueDate: item.dueDate,
        sourceMeetingPath: meetingRelPath, sourceDescription: item.description, confirmed: !item.resolved.ambiguous,
      }));
    } else if (selfDependsOnNames.has(item.resolved.name.toLowerCase())) {
      created.push(buildTask({
        title: `Waiting: ${item.description}`, status: 'waiting', dueDate: item.dueDate,
        waiting: { person: item.resolved.name, reason: item.description },
        sourceMeetingPath: meetingRelPath, sourceDescription: item.description, confirmed: !item.resolved.ambiguous,
      }));
    } else {
      skipped.push({ ...item, reason: 'not self-owned and does not block a self-owned item' });
    }
  }

  for (const task of created) writeTask(task);
  return { created, skipped };
}

export function addTask({ title, due, owner }) {
  const self = getSelf();
  const task = buildTask({ title, owner: owner || self?.name, dueDate: resolveDeadline(due) });
  writeTask(task);
  return task;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return flags;
}

function selfCheck() {
  const fixture = `### Action Items\n\n**Alice**\n- [ ] Send the deck | Deadline: 2026-09-01 | Depends on: None\n\n**Bob**\n- [ ] Review budget | Deadline: TBD | Depends on: Alice\n`;
  const items = parseActionItems(fixture);
  console.assert(items.length === 2, 'expected 2 action items, got ' + items.length);
  console.assert(items[0].person === 'Alice' && items[0].dueDate === '2026-09-01', 'Alice item parsed correctly');
  console.assert(items[1].person === 'Bob' && items[1].dependsOn === 'Alice' && items[1].dueDate === undefined, 'Bob item parsed correctly');
  console.assert(resolveDeadline('tomorrow', new Date('2026-01-01')) === '2026-01-02', 'resolveDeadline(tomorrow)');
  console.assert(resolveDeadline('TBD') === undefined, 'resolveDeadline(TBD) is undefined');
  console.log('task-store.mjs self-check passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === '--test') {
    selfCheck();
  } else if (cmd === 'extract') {
    const [relPath] = rest;
    if (!relPath) {
      console.error('Usage: node task-store.mjs extract <meeting-minutes.md path, relative to vault>');
      process.exit(1);
    }
    const full = join(VAULT_ROOT, relPath);
    if (!existsSync(full)) {
      console.error(`Not found: ${full}`);
      process.exit(1);
    }
    const { created, skipped } = extractTasks(readFileSync(full, 'utf-8'), relPath);
    console.log(JSON.stringify({
      created: created.length,
      skipped: skipped.length,
      tasks: created.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
    }, null, 2));
  } else if (cmd === 'add') {
    const [title] = rest;
    if (!title) {
      console.error('Usage: node task-store.mjs add "<title>" [--due <date|relative>] [--owner <name>]');
      process.exit(1);
    }
    const flags = parseFlags(rest.slice(1));
    const task = addTask({ title, due: flags.due, owner: flags.owner });
    console.log(JSON.stringify({ id: task.id, title: task.title, dueDate: task.dueDate, owner: task.owner }, null, 2));
  } else {
    console.error('Usage: node task-store.mjs extract <meeting-minutes.md> | add "<title>" [--due ...] [--owner ...] | --test');
    process.exit(1);
  }
}
