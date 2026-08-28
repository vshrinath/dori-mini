#!/usr/bin/env node
// Self-check for the VAULT_IGNORE matcher shared by semantic-index.mjs and
// reindex-vault.mjs. Two pattern forms: a bare name is a directory prefix, a name with '*'
// is a case-insensitive glob over the whole relative path. The glob form exists because a
// retired project's files are usually scattered rather than living in one folder — Pulse's
// are under captures/*pulse*, so a prefix-only matcher would have silently missed all of
// them while appearing to work.
import assert from 'node:assert';

// Mirrors the .doriignore parser in both indexers. The default MUST be empty: a project
// name baked into shipped code silently drops a different user's real data out of search,
// with no error and nothing to notice. Shipping 'hermes,*pulse*' as a default would have
// done exactly that to anyone with a project of either name.
function parseIgnoreFile(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
}

// an absent or empty file excludes NOTHING — the only safe default for someone else's vault
assert.deepEqual(parseIgnoreFile(''), []);
assert.deepEqual(parseIgnoreFile('\n\n   \n'), []);
assert.deepEqual(parseIgnoreFile('# only a comment\n# and another\n'), []);

// real file shape: comments, blanks, and both pattern forms
assert.deepEqual(
  parseIgnoreFile('# header\n\n*pulse*\n\n# note about hermes\nhermes\n'),
  ['*pulse*', 'hermes'],
);
// trailing comment on a pattern line, and stray slashes trimmed
assert.deepEqual(parseIgnoreFile('/archive/  # retired\n'), ['archive']);

function ignoreMatches(rel, pattern) {
  if (!pattern.includes('*')) return rel === pattern || rel.startsWith(pattern + '/');
  const rx = pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${rx}$`, 'i').test(rel);
}

// directory-prefix form
assert.equal(ignoreMatches('hermes/SOUL.md', 'hermes'), true);
assert.equal(ignoreMatches('hermes/skills/apple/imessage/SKILL.md', 'hermes'), true);
assert.equal(ignoreMatches('hermes', 'hermes'), true);
// must NOT match a different dir that merely starts with the same letters
assert.equal(ignoreMatches('hermes-notes/x.md', 'hermes'), false);
assert.equal(ignoreMatches('projects/hermes/x.md', 'hermes'), false);

// glob form — the scattered-project case
assert.equal(ignoreMatches('captures/2025-03-17-pulse-forward-looking-plan.md', '*pulse*'), true);
assert.equal(ignoreMatches('entities/projects/pulse/README.md', '*pulse*'), true);
assert.equal(ignoreMatches('captures/2024-10-08-PULSE-development-sync.md', '*pulse*'), true); // case-insensitive
assert.equal(ignoreMatches('projects/lighthouse-media/launch.md', '*pulse*'), false);

// regex metacharacters in a pattern are escaped, not interpreted
assert.equal(ignoreMatches('a+b/x.md', 'a+b'), true);
assert.equal(ignoreMatches('axxb/x.md', 'a+b'), false);

// a project whose name is a substring of another must not be over-matched by the prefix form
assert.equal(ignoreMatches('projects/orbitpay/README.md', 'projects/align'), false);

console.log('VAULT_IGNORE matcher: all assertions passed');
