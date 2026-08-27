#!/usr/bin/env node
// Mirrors dori-engine/src/workflows/meeting-router.ts: matchPerson + topProjectVotes +
// the moved/suggested/conflict/none decision table (incl. the BUG-036 tie-avoidance rule:
// a tie NEVER auto-picks a destination the user didn't review). Matching is literal-string
// against each person's `projects` frontmatter list — same as real Dori, mismatches and all
// (e.g. a person file listing a project slug that doesn't match any real project folder is
// a vault data-quality issue, not something this script silently corrects).
//
// Usage: node route-meeting.mjs "Attendee One,Attendee Two,..." [selfName]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { create as createClarification } from './clarification-store.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');
const PROJECTS_DIR = join(VAULT_ROOT, 'entities/projects');
const PROJECT_CANDIDATE_LIMIT = 10;

// Mirrors meeting-route.ts's UNBOUND_CHOICES exactly.
const UNBOUND_CHOICES = [
  { id: 'create_new_project', label: 'Create a new project for this meeting' },
  { id: 'leave_unbound', label: "Don't attach this to a project" },
];

// Mirrors meeting-route.ts's vaultProjectCandidates: entities/projects/ is the
// flat top-level twin, exactly what real Dori enumerates for this candidate list.
function vaultProjectCandidates() {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ id: `project:${e.name}`, label: e.name, detail: 'Attach to this existing project' }));
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, ' ');
}

import { parseFrontmatter, asList } from './frontmatter.mjs';

function loadPeople() {
  if (!existsSync(PEOPLE_DIR)) return [];
  const people = [];
  for (const f of readdirSync(PEOPLE_DIR)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFrontmatter(readFileSync(join(PEOPLE_DIR, f), 'utf-8')).fm;
    const name = (fm.name || f.replace(/\.md$/, '')).replace(/^["']|["']$/g, '');
    const projects = asList(fm.projects);
    const isSelf = fm.is_self === 'true' || fm.isSelf === 'true';
    people.push({ name, projects, file: f, isSelf });
  }
  return people;
}

// Mirrors real Dori's `if (p.isSelf) continue` in meeting-router.ts/meeting-route.ts —
// a person file marked is_self: true (self-store.mjs) is excluded automatically. --self
// (a plain name match) still works too, for a vault with no self-store entry yet.
function matchPerson(attendeeName, people, selfName) {
  const norm = normalize(attendeeName);
  if (selfName && norm === normalize(selfName)) return null;
  if (people.some((p) => p.isSelf && normalize(p.name) === norm)) return null;
  const withProjects = people.filter((p) => p.projects.length > 0);
  const exact = withProjects.find((p) => normalize(p.name) === norm);
  if (exact) return exact;
  const firstName = norm.split(' ')[0] || '';
  if (firstName.length > 3) {
    const matches = withProjects.filter((p) => normalize(p.name).split(' ')[0] === firstName);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// key: caller-stable identity for this meeting (e.g. a title or date), so
// re-running the router for the same meeting dedupes onto one clarification
// instead of stacking duplicates — mirrors recordRoutingClarification's `key`.
export function routeMeeting(attendees, selfName, key) {
  const people = loadPeople();
  const votes = new Map();
  const matched = [];
  for (const name of attendees) {
    const person = matchPerson(name, people, selfName);
    if (!person) continue;
    matched.push({ attendee: name, person: person.name, projects: person.projects });
    for (const project of person.projects) votes.set(project, (votes.get(project) || 0) + 1);
  }
  const clarificationKey = key || [...attendees].sort().join('|');
  const label = key || attendees.join(', ') || 'meeting';

  if (votes.size === 0) {
    const candidates = [...vaultProjectCandidates().slice(0, PROJECT_CANDIDATE_LIMIT), ...UNBOUND_CHOICES];
    const record = createClarification({
      domain: 'meeting.route',
      key: clarificationKey,
      prompt: `"${label}" didn't match any project — where should it go?`,
      candidates,
      context: { attendees: attendees.join(', ') },
    });
    return { action: 'none', candidates, matched, clarificationId: record.id, reason: 'no attendee matched a person with an associated project' };
  }

  const maxVotes = Math.max(...votes.values());
  const tied = [...votes.entries()].filter(([, v]) => v === maxVotes).map(([p]) => p);

  if (tied.length > 1) {
    const candidates = [
      ...tied.map((p) => ({ id: `project:${p}`, label: p, detail: `${maxVotes} matching attendee${maxVotes === 1 ? '' : 's'}` })),
      ...UNBOUND_CHOICES,
    ];
    const record = createClarification({
      domain: 'meeting.route',
      key: clarificationKey,
      prompt: `"${label}" matches ${tied.length} projects equally — which one should it file under?`,
      candidates,
      context: { attendees: attendees.join(', ') },
    });
    return { action: 'conflict', candidates: tied, votes: Object.fromEntries(votes), matched, clarificationId: record.id, reason: `${tied.length} projects tied at ${maxVotes} vote(s) — not auto-filing (mirrors Dori's BUG-036 guard)` };
  }

  const project = tied[0];
  const slug = project.replace(/_/g, '-');
  const destination = `entities/projects/${slug}/meetings/`;
  if (maxVotes >= 2) {
    return { action: 'moved', project, slug, destination, votes: Object.fromEntries(votes), matched };
  }
  return { action: 'suggested', project, slug, destination, votes: Object.fromEntries(votes), matched, reason: 'only one attendee match — advisory only, not auto-filed (mirrors Dori)' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , attendeesArg, selfName, key] = process.argv;
  const attendees = (attendeesArg || '').split(',').map((s) => s.trim()).filter(Boolean);
  console.log(JSON.stringify(routeMeeting(attendees, selfName || process.env.DORI_SELF_NAME || '', key), null, 2));
}
