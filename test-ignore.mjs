#!/usr/bin/env node
// Self-check for the VAULT_IGNORE matcher shared by semantic-index.mjs and
// reindex-vault.mjs. Two pattern forms: a bare name is a directory prefix, a name with '*'
// is a case-insensitive glob over the whole relative path. The glob form exists because a
// retired project's files are usually scattered rather than living in one folder — Vybe's
// are under captures/*vybe*, so a prefix-only matcher would have silently missed all of
// them while appearing to work.
import assert from 'node:assert';

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
assert.equal(ignoreMatches('captures/2025-03-17-vybe-forward-looking-plan.md', '*vybe*'), true);
assert.equal(ignoreMatches('entities/projects/vybe/README.md', '*vybe*'), true);
assert.equal(ignoreMatches('captures/2024-10-08-VYBE-development-sync.md', '*vybe*'), true); // case-insensitive
assert.equal(ignoreMatches('projects/founding-fuel/launch.md', '*vybe*'), false);

// regex metacharacters in a pattern are escaped, not interpreted
assert.equal(ignoreMatches('a+b/x.md', 'a+b'), true);
assert.equal(ignoreMatches('axxb/x.md', 'a+b'), false);

// a project whose name is a substring of another must not be over-matched by the prefix form
assert.equal(ignoreMatches('projects/aligna/README.md', 'projects/align'), false);

console.log('VAULT_IGNORE matcher: all assertions passed');
