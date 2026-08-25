#!/usr/bin/env node
// Mirrors dori-engine's meeting.generate_brief action (meeting-generate-brief.ts) — minus the
// LLM call. Real Dori assembles the same three lookups (relevant prior meetings, pending
// tasks, attendee classification) and then hands them to a model with a "use only provided
// facts" system prompt. Every one of those lookups is deterministic and already exists here
// (query-vault.mjs-equivalent meeting scan, list-tasks.mjs, entities/people/*.md) — so this
// just assembles them into one printed brief, no API call needed, same tier as everything
// else in this skill.
//
// Cross-project isolation, mirrored exactly (meeting.prep.cross-project-isolation):
// - Prior meetings only surface when their own `account:` frontmatter matches --project.
//   No --project means no prior meetings are cited — fail closed, never guess.
// - Tasks: with --project, only that project's own tasks qualify. With no --project, only
//   attendee-owned tasks qualify (never the whole vault). With neither, no tasks.
//
// Usage: node meeting-prep.mjs "Attendee One,Attendee Two" [--project acme-nonprofit]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { listTasks } from './list-tasks.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');
const PROJECTS_DIR = join(VAULT_ROOT, 'entities/projects');
const PENDING_STATUSES = ['open', 'in_progress', 'waiting'];

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  let currentListKey = null;
  for (const line of m[1].split('\n')) {
    const listItem = line.match(/^\s+-\s+"?([^"]+)"?$/);
    if (listItem && currentListKey) {
      fm[currentListKey] = fm[currentListKey] || [];
      fm[currentListKey].push(listItem[1].trim());
      continue;
    }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) {
      currentListKey = kv[2].trim() === '' ? kv[1] : null;
      if (currentListKey) continue;
      fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

// Mirrors gatherRelevantMeetingDocs: attendee-overlap score, recency tiebreak, hard filter
// on project match (no --project => no docs). Meetings live at the entities/projects/<slug>
// twin locally (route-meeting.mjs's auto-file destination), not a flat meetings/ folder.
function gatherRelevantMeetingDocs(project, attendeeSlugs) {
  if (!project) return [];
  const dir = join(PROJECTS_DIR, project, 'meetings');
  if (!existsSync(dir)) return [];
  const wanted = new Set(attendeeSlugs);
  const docs = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f.startsWith('prep-')) continue;
    const raw = readFileSync(join(dir, f), 'utf-8');
    const fm = parseFrontmatter(raw);
    if ((fm.account || '') !== project) continue;
    const people = Array.isArray(fm.people) ? fm.people : [];
    const overlap = people.filter((p) => wanted.has(p)).length;
    docs.push({ file: f, title: fm.title || f.replace(/\.md$/, ''), date: fm.date, people, score: overlap * 10 });
  }
  docs.sort((a, b) => (b.score !== a.score ? b.score - a.score : (b.date || '').localeCompare(a.date || '')));
  return docs;
}

// Mirrors gatherPendingTasks: project scope wins outright; attendee ownership only
// stands in when there's no project to isolate against.
function gatherPendingTasks(project, attendeeSlugs) {
  const wanted = new Set(attendeeSlugs);
  const all = PENDING_STATUSES.flatMap((status) => listTasks(status));
  return all.filter((t) => {
    if (project) return t.context?.project === project;
    if (wanted.size > 0) {
      if (t.owner && wanted.has(slugify(t.owner))) return true;
      if (t.context?.person && wanted.has(slugify(t.context.person))) return true;
    }
    return false;
  });
}

// Mirrors classifyAttendees: known (exact name/alias match) / unknown / ambiguous.
function classifyAttendees(names) {
  let people = [];
  if (existsSync(PEOPLE_DIR)) {
    people = readdirSync(PEOPLE_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const fm = parseFrontmatter(readFileSync(join(PEOPLE_DIR, f), 'utf-8'));
        return { name: fm.name || f.replace(/\.md$/, ''), aliases: fm.aliases || [], slug: f.replace(/\.md$/, '') };
      });
  }
  return names.map((name) => {
    const norm = name.toLowerCase().trim();
    const matches = people.filter(
      (p) => p.name.toLowerCase().trim() === norm || p.aliases.some((a) => a.toLowerCase().trim() === norm),
    );
    if (matches.length === 0) return { name, kind: 'unknown', slug: slugify(name) };
    if (matches.length > 1) return { name, kind: 'ambiguous', slug: slugify(name) };
    return { name, kind: 'known', slug: matches[0].slug };
  });
}

export function meetingPrep(attendeeNames, project) {
  const flags = classifyAttendees(attendeeNames);
  const slugs = flags.map((f) => f.slug);
  const docs = gatherRelevantMeetingDocs(project, slugs);
  const tasks = gatherPendingTasks(project, slugs);
  return { attendees: flags, priorMeetings: docs, tasks, project: project || null };
}

function renderBrief({ attendees, priorMeetings, tasks, project }) {
  const lines = [`# Meeting prep${project ? ` — ${project}` : ''}`, ''];

  const notable = attendees.filter((a) => a.kind !== 'known');
  if (notable.length > 0) {
    lines.push('## People', '');
    for (const a of notable) {
      lines.push(
        a.kind === 'unknown'
          ? `- ${a.name} — newly seen, unverified. No title, role, or organization is known.`
          : `- ${a.name} — ambiguous: matches more than one known person. Not resolved.`,
      );
    }
    lines.push('');
  }

  if (priorMeetings.length > 0) {
    lines.push('## Prior meetings', '');
    for (const d of priorMeetings) lines.push(`- ${d.title}${d.date ? ` (${d.date})` : ''}`);
    lines.push('');
  }

  const selfTasks = tasks.filter((t) => t.owner === 'self');
  const otherTasks = tasks.filter((t) => t.owner !== 'self');
  if (selfTasks.length + otherTasks.length > 0) {
    lines.push('## Tasks', '');
    if (selfTasks.length > 0) {
      lines.push('### Your tasks', '');
      for (const t of selfTasks) lines.push(`- [${t.id}] ${t.title}`);
      lines.push('');
    }
    if (otherTasks.length > 0) {
      lines.push("### Others' tasks", '');
      for (const t of otherTasks) lines.push(`- [${t.id}] ${t.title}`);
      lines.push('');
    }
  }

  if (notable.length === 0 && priorMeetings.length === 0 && selfTasks.length === 0 && otherTasks.length === 0) {
    lines.push('Nothing on file yet — no prior meetings, no pending tasks, all attendees already known.');
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const project = projectIdx !== -1 ? args[projectIdx + 1] : undefined;
  const attendeeArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--project');
  if (!attendeeArg) {
    console.error('Usage: node meeting-prep.mjs "Attendee One,Attendee Two" [--project <slug>]');
    process.exit(1);
  }
  const attendees = attendeeArg.split(',').map((s) => s.trim()).filter(Boolean);
  console.log(renderBrief(meetingPrep(attendees, project)));
}
