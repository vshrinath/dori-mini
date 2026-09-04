import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Same-shape matching as real dori-engine's findEntityMatches (packages/capture/src/
// processors/entity-match.ts) — case-insensitive, word-boundary, no LLM — but applied to
// a search QUERY instead of a capture's text.
//
// First version of this matched every folder under projects/ + entities/projects/, which
// wrongly treated "work" (a personal catch-all scaffold, no client) as a real project and
// matched it against the word "work" in an unrelated question. Fixed by requiring actual
// entity evidence per slug — a declared `client:` in its frontmatter, or being named in a
// real person's `projects:` list (entities/people/*.md) — mirroring how real dori-engine
// only trusts entities that exist in its entity store, not bare folder names.

function normalize(value) {
  return value.toLowerCase().trim().replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasClientField(projectDir) {
  let entries = [];
  try {
    entries = readdirSync(projectDir, { withFileTypes: true, recursive: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (!e.isFile?.() || !e.name.endsWith('.md')) continue;
    let text = '';
    try {
      text = readFileSync(join(e.parentPath ?? projectDir, e.name), 'utf8');
    } catch {
      continue;
    }
    const m = text.match(/^client:\s*(.*)$/m);
    if (m && m[1].trim() && m[1].trim() !== '""' && m[1].trim() !== "''") return true;
  }
  return false;
}

function projectSlugsFromPeople(vaultRoot) {
  const slugs = new Set();
  let files = [];
  try {
    files = readdirSync(join(vaultRoot, 'entities/people')).filter((f) => f.endsWith('.md'));
  } catch {
    return slugs;
  }
  for (const f of files) {
    let text = '';
    try {
      text = readFileSync(join(vaultRoot, 'entities/people', f), 'utf8');
    } catch {
      continue;
    }
    const m = text.match(/^projects:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (!m) continue;
    for (const line of m[1].split('\n')) {
      const slug = line.trim().replace(/^-\s*/, '').trim();
      if (slug) slugs.add(slug);
    }
  }
  return slugs;
}

/** Every project-folder slug that has real entity evidence — a client, or a named person
 * on record as working on it. Folders that are just personal/internal buckets (no client,
 * no linked person) are excluded, not guessed at. */
export function discoverProjects(vaultRoot) {
  const allSlugs = new Set();
  for (const dir of ['projects', 'entities/projects']) {
    let entries = [];
    try {
      entries = readdirSync(join(vaultRoot, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) allSlugs.add(e.name);
    }
  }
  const fromPeople = projectSlugsFromPeople(vaultRoot);
  const confirmed = [...allSlugs].filter((slug) => {
    if (fromPeople.has(slug)) return true;
    for (const dir of ['projects', 'entities/projects']) {
      if (hasClientField(join(vaultRoot, dir, slug))) return true;
    }
    return false;
  });
  return confirmed.sort();
}

export function discoverPeople(vaultRoot) {
  let files = [];
  try {
    files = readdirSync(join(vaultRoot, 'entities/people')).filter((f) => f.endsWith('.md') && f !== 'PEOPLE.md');
  } catch {
    return [];
  }
  const people = [];
  for (const f of files) {
    let text = '';
    try {
      text = readFileSync(join(vaultRoot, 'entities/people', f), 'utf8');
    } catch {
      continue;
    }
    const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (!name) continue;
    const projectsBlock = text.match(/^projects:\s*\n((?:\s*-\s*.+\n?)+)/m);
    const projects = projectsBlock
      ? projectsBlock[1].split('\n').map((l) => l.trim().replace(/^-\s*/, '').trim()).filter(Boolean)
      : [];
    people.push({ name, projects });
  }
  return people;
}

function findWordBoundaryHit(normalizedQuery, candidateName) {
  const name = normalize(candidateName);
  if (name.length < 3) return false;
  return new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(normalizedQuery);
}

/**
 * Resolve a query to at most one trip threadId, via a direct hit on the trip's display
 * name (finances/trips ledger frontmatter `trip:`) or its threadId itself. Same
 * fails-open discipline as matchProject: 0 or >1 hits returns null rather than guessing.
 */
export function matchTrip(query, ledgers) {
  const normalizedQuery = normalize(query);
  const hits = new Set();
  for (const l of ledgers) {
    if (!l.threadId) continue;
    if (l.ledger?.trip && findWordBoundaryHit(normalizedQuery, l.ledger.trip)) hits.add(l.threadId);
    else if (findWordBoundaryHit(normalizedQuery, l.threadId)) hits.add(l.threadId);
  }
  if (hits.size !== 1) return null;
  return [...hits][0];
}

/**
 * Resolve a query to at most one project slug, via a direct project-name hit or via a
 * named person's linked project. Fails open (returns null) on zero or ambiguous (>1)
 * matches — a wrong scope silently excludes the right document, worse than no scope.
 */
export function matchProject(query, projectSlugs, people = []) {
  const normalizedQuery = normalize(query);
  const hits = new Set();

  for (const slug of projectSlugs) {
    if (findWordBoundaryHit(normalizedQuery, slug)) hits.add(slug);
  }
  for (const person of people) {
    const firstName = person.name.split(/\s+/)[0];
    const matched =
      findWordBoundaryHit(normalizedQuery, person.name) ||
      (firstName.length >= 4 && findWordBoundaryHit(normalizedQuery, firstName));
    if (!matched) continue;
    for (const p of person.projects) {
      if (projectSlugs.includes(p)) hits.add(p);
    }
  }

  if (hits.size !== 1) return null;
  return [...hits][0];
}
