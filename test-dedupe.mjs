#!/usr/bin/env node
// Minimal self-check for the dedupe canonical-selection logic in semantic-index.mjs's /
// reindex-vault.mjs's cmdDedupe: canonical = lexicographically-first path per content-
// hash group, everyone else in the group points duplicate_of at it. Also covers a real
// bug found and fixed against production data (2026-08-26): frontmatter-only/near-empty
// bodies all hash the same and must never be grouped as duplicates of each other.
import assert from 'node:assert';

const MIN_DEDUP_BODY_CHARS = 40;

function shouldDedupe(body) {
  return body.trim().length >= MIN_DEDUP_BODY_CHARS;
}

function pickCanonical(members) {
  const sorted = [...members].sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { canonical: sorted[0], duplicates: sorted.slice(1) };
}

// regression: an empty/frontmatter-only body must be excluded from dedup consideration —
// confirmed against real data that two unrelated files (an empty project STATUS.md and
// an empty person profile) both had zero-length bodies and got wrongly cross-matched
// before this guard existed.
assert.equal(shouldDedupe(''), false);
assert.equal(shouldDedupe('   \n\n  '), false);
assert.equal(shouldDedupe('short'), false);
assert.equal(shouldDedupe('a'.repeat(MIN_DEDUP_BODY_CHARS)), true);

// duplicate group: canonical is the alphabetically-first path, regardless of input order
{
  const { canonical, duplicates } = pickCanonical([
    { relPath: 'projects/founding-fuel/x.md' },
    { relPath: 'entities/projects/founding-fuel/x.md' },
  ]);
  assert.equal(canonical.relPath, 'entities/projects/founding-fuel/x.md');
  assert.deepEqual(duplicates.map((d) => d.relPath), ['projects/founding-fuel/x.md']);
}

// singleton group: no duplicates, canonical is just itself
{
  const { canonical, duplicates } = pickCanonical([{ relPath: 'notes/only.md' }]);
  assert.equal(canonical.relPath, 'notes/only.md');
  assert.equal(duplicates.length, 0);
}

// stable regardless of input order
{
  const a = pickCanonical([{ relPath: 'b.md' }, { relPath: 'a.md' }, { relPath: 'c.md' }]);
  const b = pickCanonical([{ relPath: 'c.md' }, { relPath: 'a.md' }, { relPath: 'b.md' }]);
  assert.equal(a.canonical.relPath, 'a.md');
  assert.equal(a.canonical.relPath, b.canonical.relPath);
}

console.log('dedupe canonical-selection: all assertions passed');
