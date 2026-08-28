import assert from 'node:assert/strict';
import { matchProject } from './scope.mjs';

const SLUGS = ['lighthouse-media', 'work'];
const PEOPLE = [{ name: 'Daniel Cross', projects: ['lighthouse-media'] }];

// Direct project-name hit.
assert.equal(matchProject('what happened with lighthouse media launch', SLUGS, []), 'lighthouse-media');

// Person name resolves to their linked project.
assert.equal(matchProject('Daniel was going to narrate the video', SLUGS, PEOPLE), 'lighthouse-media');

// matchProject only ever matches candidates it's given — the fix for "work" wrongly
// matching (a personal catch-all folder, no client) lives in discoverProjects, which
// excludes it from the candidate list in the first place (verified live against the real
// vault: 'work' does not appear in its output). Not retested here with a filesystem
// fixture, since that's exactly what the live dry run already exercised.

// No mention at all -> no scope.
assert.equal(matchProject('what time did we go live', SLUGS, []), null);

// Ambiguous (both a project and an unrelated person's linked project match) -> fail open,
// never guess.
const AMBIGUOUS_PEOPLE = [{ name: 'Someone Else', projects: ['work'] }];
assert.equal(matchProject('someone else and lighthouse media', SLUGS, AMBIGUOUS_PEOPLE), null);

// Short first names (<4 chars) are not used alone, to avoid common-word false positives.
const SHORT_NAME_PEOPLE = [{ name: 'Al Smith', projects: ['lighthouse-media'] }];
assert.equal(matchProject('al went to the store', SLUGS, SHORT_NAME_PEOPLE), null);

console.log('scope matcher (project/person resolution, fail-open on ambiguity): all assertions passed');
