#!/usr/bin/env node
// Self-check for process-meeting-minutes.mjs, against a throwaway vault and a fake
// `claude` on PATH. Covers two bugs found filing a Fathom meeting (2026-11-04):
// a plain header block before "## Transcript" was taken as existing minutes, and the
// model's chat reply (it ran as a tool-using agent) was written into the vault as minutes.
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tmp = mkdtempSync(join(tmpdir(), 'dori-pmm-'));
const vault = join(tmp, 'vault');
const bin = join(tmp, 'bin');
mkdirSync(join(vault, 'meetings'), { recursive: true });
mkdirSync(bin);
process.env.VAULT_ROOT = vault;
process.env.PORTAL_DB_PATH = join(tmp, 'portal.db');
process.env.DORI_CONFIG_FILE = join(tmp, 'config.json');
writeFileSync(process.env.DORI_CONFIG_FILE, JSON.stringify({ replyCli: 'claude' }));
process.env.PATH = `${bin}:${process.env.PATH}`;

const { processMeetingMinutes, isMinutes } = await import('../process-meeting-minutes.mjs');
const { parseActionItems } = await import('../task-store.mjs');

const MINUTES = [
  '## Meeting Metadata', '- **Date:** 2026-11-04', '',
  '## Topics Discussed', '**1. Planning**', '', '**Outcome:** Agreed.', '',
  '## Action Items', '**Shrinath V**', '- [ ] Send notes | Deadline: TBD | Depends on: None', '',
].join('\n');
const CHAT_REPLY = "I've written the minutes, but they're not filed yet. The draft is in my scratchpad. Should I file it?";

function fakeClaude(output) {
  const p = join(bin, 'claude');
  writeFileSync(p, `#!/bin/sh\ncat <<'EOF'\n${output}\nEOF\n`);
  chmodSync(p, 0o755);
}

const HEADER_DOC = [
  '---', "date: '2026-11-04'", 'title: "Test meeting"', '---', '',
  '# Test meeting', '', '**Date:** 2026-11-04', '**Attendees:** Gaurav Arora, Shrinath V', '**Duration:** ~55 minutes', '',
  '## Transcript', '', '**Shrinath V** : Shall we start?', '', '**Gaurav Arora** : Sure.', '',
].join('\n');
const rel = 'meetings/2026-11-04-test.md';
const abs = join(vault, rel);

assert.equal(isMinutes(MINUTES), true);
// The model writes "## Action Items"; the parser only knew "###", so no tasks were extracted.
for (const h of ['##', '###']) {
  const items = parseActionItems(MINUTES.replace('## Action Items', `${h} Action Items`) + '\n## Glossary\n**X** — y');
  assert.deepEqual(items.map((i) => [i.person, i.description]), [['Shrinath V', 'Send notes']]);
}
assert.equal(isMinutes(CHAT_REPLY), false);
assert.equal(isMinutes(HEADER_DOC.split('## Transcript')[0]), false);

// A chat reply must not overwrite the meeting file, and the header must not count as minutes.
writeFileSync(abs, HEADER_DOC);
fakeClaude(CHAT_REPLY);
await assert.rejects(processMeetingMinutes({ relPath: rel }), /not minutes/);
assert.equal(readFileSync(abs, 'utf8'), HEADER_DOC);

// Real minutes are written above the kept transcript, and a second run is a no-op.
fakeClaude(MINUTES);
const res = await processMeetingMinutes({ relPath: rel });
assert.equal(res.status, 'completed');
const written = readFileSync(abs, 'utf8');
assert.match(written, /## Topics Discussed[\s\S]*## Transcript[\s\S]*Shall we start\?/);
assert.equal((await processMeetingMinutes({ relPath: rel })).status, 'already_processed');

console.log('process-meeting-minutes: ok');
