#!/usr/bin/env node
// Mirrors dori-engine's isSelf flag on a person entity (EntityStore.getSelf(),
// dori-portal/lib/people-setup.ts's clearOtherSelfMarks) — your own profile is a person
// file exactly like anyone else's at entities/people/<slug>.md, just marked `is_self: true`.
// Not a separate file type or a special "personal" tree — same shape, same directory, so
// every script that already reads entities/people/*.md (route-meeting.mjs, meeting-prep.mjs,
// research-and-recommend.mjs) picks it up for free, no separate integration per script.
//
// At most one file carries is_self: true — set() clears the mark off any other file that
// has it first, same guard real Dori's people-setup.ts applies.
//
// links.linkedin mirrors packages/contracts/src/entities.ts's EntityLinksSchema exactly
// (every entity has an optional `links` object with a named `linkedin` key, alongside
// website/twitter/github/etc.) — stored here as a single-line inline JSON value, the same
// "compact literal on one line" convention org-store.mjs uses for its `people: [...]` array.
//
// Usage:
//   node self-store.mjs set "Your Name" [--role <title>] [--org <company>] [--projects a,b] [--linkedin <url>]
//   node self-store.mjs get
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

function isSelfValue(fm) {
  return fm.is_self === 'true' || fm.isSelf === 'true';
}

function parseLinks(fm) {
  if (!fm.links) return {};
  try { return JSON.parse(fm.links); } catch { return {}; }
}

export function getSelf() {
  if (!existsSync(PEOPLE_DIR)) return null;
  for (const f of readdirSync(PEOPLE_DIR)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFrontmatter(readFileSync(join(PEOPLE_DIR, f), 'utf-8'));
    if (isSelfValue(fm)) {
      return {
        slug: f.replace(/\.md$/, ''),
        name: (fm.name || '').replace(/^["']|["']$/g, ''),
        role: fm.role || null,
        org: fm.org || null,
        projects: (fm.projects?.match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, '')),
        links: parseLinks(fm),
      };
    }
  }
  return null;
}

function clearOtherSelfMarks(excludeSlug) {
  if (!existsSync(PEOPLE_DIR)) return;
  for (const f of readdirSync(PEOPLE_DIR)) {
    if (!f.endsWith('.md') || f.replace(/\.md$/, '') === excludeSlug) continue;
    const full = join(PEOPLE_DIR, f);
    const raw = readFileSync(full, 'utf-8');
    const fm = parseFrontmatter(raw);
    if (!isSelfValue(fm)) continue;
    writeFileSync(full, raw.replace(/^is_self:\s*true\s*$/m, 'is_self: false').replace(/^isSelf:\s*true\s*$/m, 'isSelf: false'));
  }
}

// Merges onto whatever's already on file — a `set` that only passes --linkedin must not
// silently drop role/org/projects from an earlier call (same clobber bug already fixed in
// org-store.mjs and brand-store.mjs this session — same fix here, before it bites again).
export function setSelf({ name, role, org, projects, links }) {
  const slug = slugify(name);
  const existingPath = join(PEOPLE_DIR, `${slug}.md`);
  const existing = existsSync(existingPath) ? parseFrontmatter(readFileSync(existingPath, 'utf-8')) : {};
  clearOtherSelfMarks(slug);

  const finalRole = role ?? existing.role;
  const finalOrg = org ?? existing.org;
  const finalProjects = projects ?? (existing.projects?.match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));
  const finalLinks = { ...parseLinks(existing), ...(links || {}) };

  const lines = [`name: "${name}"`, 'is_self: true'];
  if (finalRole) lines.push(`role: ${finalRole}`);
  if (finalOrg) lines.push(`org: ${finalOrg}`);
  if (finalProjects?.length) lines.push(`projects: [${finalProjects.map((p) => `"${p}"`).join(', ')}]`);
  if (Object.keys(finalLinks).length) lines.push(`links: ${JSON.stringify(finalLinks)}`);
  const body = `---\n${lines.join('\n')}\n---\n`;

  mkdirSync(PEOPLE_DIR, { recursive: true });
  writeFileSync(existingPath, body);
  return { slug, name };
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
  if (cmd === 'get') {
    const self = getSelf();
    console.log(self ? JSON.stringify(self, null, 2) : 'No self profile set yet.');
  } else if (cmd === 'set') {
    const [name] = rest;
    if (!name) {
      console.error('Usage: node self-store.mjs set "Your Name" [--role <title>] [--org <company>] [--projects a,b] [--linkedin <url>]');
      process.exit(1);
    }
    const flags = parseFlags(rest.slice(1));
    const result = setSelf({
      name,
      role: flags.role,
      org: flags.org,
      projects: flags.projects ? flags.projects.split(',').map((s) => s.trim()) : undefined,
      links: flags.linkedin ? { linkedin: flags.linkedin } : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('Usage: node self-store.mjs set "Your Name" ...\n   or: node self-store.mjs get');
    process.exit(1);
  }
}
