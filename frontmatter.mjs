#!/usr/bin/env node
// One YAML-frontmatter parser for every script in this skill. It used to be
// copy-pasted ten times, and the copies drifted: only this one (originally
// reindex-vault.mjs's) handles block lists and flow sequences. On 2026-08-27 a
// flow sequence `tags: [a, b]` reached portal.db as the literal string
// "[a, b]" and crashed the portal's publishing pipeline on tags.forEach — the
// nine other copies would each have had to be fixed separately.
//
// Uses the real `yaml` package (same one real Dori's dori-engine depends on)
// instead of a hand-rolled scalar/flow-sequence/block-list splitter -- that
// splitter's known gap (a flow sequence of JSON objects splits on the inner
// commas into fragments) is exactly what a real parser doesn't get wrong.
import { parse as parseYaml } from 'yaml';

export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const [, fmBlock, body] = m;
  const fm = parseYaml(fmBlock) ?? {};
  return { fm, body: body.trim() };
}

// List fields now come back as real arrays, but vault files written before the
// flow-sequence fix (and any hand-edited one) can still hold `people: ["a", "b"]`
// as a plain string. Consumers that need a list call this instead of re-extracting
// quoted items themselves.
export function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return (value.match(/"([^"]*)"/g) || []).map((s) => s.replace(/"/g, ''));
}

const unquote = (s) => s.replace(/^["']|["']$/g, '');

if (import.meta.main) {
  const { strict: assert } = await import('node:assert');
  const { fm, body } = parseFrontmatter(
    `---\ntitle: '[Account Name]'\ntags: [a, "b", ]\nempty: []\nattendees:\n  - Priya\n  - "Sam"\nplain: hello\n---\n\nbody text\n`,
  );
  assert.equal(fm.title, '[Account Name]');
  assert.deepEqual(fm.tags, ['a', 'b']);
  assert.deepEqual(fm.empty, []);
  assert.deepEqual(fm.attendees, ['Priya', 'Sam']);
  assert.equal(fm.plain, 'hello');
  assert.equal(body, 'body text');
  assert.deepEqual(parseFrontmatter('no frontmatter'), { fm: {}, body: 'no frontmatter' });
  assert.deepEqual(asList(['a']), ['a']);
  assert.deepEqual(asList('["a", "b"]'), ['a', 'b']);
  assert.deepEqual(asList(undefined), []);
  console.log('ok');
}
