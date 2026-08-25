#!/usr/bin/env node
// Mirrors dori-engine's entities.merge action (entities-merge.ts + SqliteEntityStore.merge,
// decision 0022: hard-to-reverse identity merge) for dori-mini's actual data model — a
// one-file-per-entity vault (entities/people/<slug>.md, entities/organizations/<slug>.md),
// not the engine's SQLite entity table. Same shape as the real merge: union aliases onto the
// canonical entity, rewrite every known cross-reference vault-wide (org-store.mjs's `people:`
// arrays, brand-store.mjs's `owner:` field — the only two places a person/org slug is
// referenced anywhere in this vault), and never delete the losing side — it's archived, not
// destroyed, same non-destructive discipline as accounts-merge.ts's archiveConflict.
//
// Real Dori's merge sets `redirectId` on the source row and leaves it in place; the engine's
// own reader (resolveCanonical) follows that chain transparently on every read. dori-mini has
// no such indirection layer — four separate scripts each do their own readdirSync of
// entities/people/ — so instead the archived file is MOVED to entities/<type>/merged/<slug>.md
// (with a `redirectTo:` field added for context). Every existing loader does a non-recursive
// readdir of the parent dir, so the merged-away file simply stops appearing in any listing —
// zero changes needed anywhere else — while the original content is fully preserved, not lost.
//
// Usage:
//   node entity-merge.mjs merge person <sourceSlug> <targetSlug>
//   node entity-merge.mjs merge org <sourceSlug> <targetSlug>
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const DIRS = {
  person: join(VAULT_ROOT, 'entities/people'),
  org: join(VAULT_ROOT, 'entities/organizations'),
};
const BRANDS_DIR = join(VAULT_ROOT, 'entities/brands');

function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { yaml: '', body: raw };
  return { yaml: m[1], body: m[2] };
}

function getField(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  return m ? m[1] : null;
}

/** Replace an existing `key: value` line, or insert one just before the closing `---`. */
function setField(yaml, key, valueLine) {
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(yaml)) return yaml.replace(re, `${key}: ${valueLine}`);
  return `${yaml}\n${key}: ${valueLine}`;
}

function unquote(s) {
  return (s || '').trim().replace(/^["']|["']$/g, '');
}

function parseInlineArray(rawValue) {
  return (rawValue?.match(/"([^"]*)"/g) || []).map((s) => s.replace(/"/g, ''));
}

function formatInlineArray(arr) {
  return `[${arr.map((s) => `"${s}"`).join(', ')}]`;
}

function readEntity(type, slug) {
  const path = join(DIRS[type], `${slug}.md`);
  if (!existsSync(path)) throw new Error(`${type === 'person' ? 'Person' : 'Organization'} not found: entities/${type === 'person' ? 'people' : 'organizations'}/${slug}.md`);
  const raw = readFileSync(path, 'utf-8');
  const { yaml, body } = splitFrontmatter(raw);
  return { path, raw, yaml, body, name: unquote(getField(yaml, 'name')) || slug };
}

/** Rewrite the one slug-bearing field a file type is known to carry — mirrors accounts-merge.ts's rewriteAccountText discipline: only known structured fields, never bare prose. */
function rewriteReferences(type, sourceSlug, targetSlug) {
  const rewritten = [];

  if (type === 'person' && existsSync(DIRS.org)) {
    for (const f of readdirSync(DIRS.org)) {
      if (!f.endsWith('.md')) continue;
      const path = join(DIRS.org, f);
      const raw = readFileSync(path, 'utf-8');
      const { yaml, body } = splitFrontmatter(raw);
      const people = parseInlineArray(getField(yaml, 'people'));
      if (!people.includes(sourceSlug)) continue;
      const next = [...new Set(people.map((p) => (p === sourceSlug ? targetSlug : p)))];
      const newYaml = setField(yaml, 'people', formatInlineArray(next));
      writeFileSync(path, `---\n${newYaml}\n---\n${body}`);
      rewritten.push({ file: `entities/organizations/${f}`, field: 'people' });
    }
  }

  if (existsSync(BRANDS_DIR)) {
    for (const f of readdirSync(BRANDS_DIR)) {
      if (!f.endsWith('.md')) continue;
      const path = join(BRANDS_DIR, f);
      const raw = readFileSync(path, 'utf-8');
      const { yaml, body } = splitFrontmatter(raw);
      const owner = unquote(getField(yaml, 'owner'));
      if (owner !== sourceSlug) continue;
      const newYaml = setField(yaml, 'owner', targetSlug);
      writeFileSync(path, `---\n${newYaml}\n---\n${body}`);
      rewritten.push({ file: `entities/brands/${f}`, field: 'owner' });
    }
  }

  return rewritten;
}

export function mergeEntity(type, sourceSlug, targetSlug) {
  if (type !== 'person' && type !== 'org') throw new Error('type must be "person" or "org"');
  if (sourceSlug === targetSlug) throw new Error('Source and target must differ');

  const source = readEntity(type, sourceSlug);
  const target = readEntity(type, targetSlug);

  // Union aliases: target's existing aliases, plus the source's display name
  // (so a lookup by the losing entity's own name still finds the survivor),
  // plus any aliases the source already carried.
  const aliases = new Set(parseInlineArray(getField(target.yaml, 'aliases')));
  if (source.name && source.name !== target.name) aliases.add(source.name);
  parseInlineArray(getField(source.yaml, 'aliases')).forEach((a) => aliases.add(a));

  let targetYaml = target.yaml;
  if (aliases.size > 0) targetYaml = setField(targetYaml, 'aliases', formatInlineArray([...aliases]));

  let peopleUnioned = [];
  if (type === 'org') {
    const merged = new Set(parseInlineArray(getField(target.yaml, 'people')));
    const before = merged.size;
    parseInlineArray(getField(source.yaml, 'people')).forEach((p) => merged.add(p));
    if (merged.size > before) {
      peopleUnioned = [...merged];
      targetYaml = setField(targetYaml, 'people', formatInlineArray(peopleUnioned));
    }
  }

  if (targetYaml !== target.yaml) {
    writeFileSync(target.path, `---\n${targetYaml}\n---\n${target.body}`);
  }

  const referencesRewritten = rewriteReferences(type, sourceSlug, targetSlug);

  // Archive, never delete: the losing file's full original content is preserved
  // untouched, just moved out of the directory every other script scans.
  const dirName = type === 'person' ? 'people' : 'organizations';
  const mergedDir = join(DIRS[type], 'merged');
  mkdirSync(mergedDir, { recursive: true });
  const archivedYaml = setField(source.yaml, 'redirectTo', targetSlug);
  writeFileSync(source.path, `---\n${archivedYaml}\n---\n${source.body}`);
  const archivedPath = join(mergedDir, `${sourceSlug}.md`);
  renameSync(source.path, archivedPath);

  return {
    success: true,
    type,
    sourceSlug,
    canonicalSlug: targetSlug,
    targetPath: `entities/${dirName}/${targetSlug}.md`,
    archivedSourcePath: `entities/${dirName}/merged/${sourceSlug}.md`,
    aliasesAdded: [...aliases],
    ...(type === 'org' ? { peopleUnioned } : {}),
    referencesRewritten,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, type, sourceSlug, targetSlug] = process.argv;
  if (cmd !== 'merge' || !type || !sourceSlug || !targetSlug) {
    console.error('Usage: node entity-merge.mjs merge <person|org> <sourceSlug> <targetSlug>');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(mergeEntity(type, sourceSlug, targetSlug), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
