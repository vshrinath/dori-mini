#!/usr/bin/env node
// Talks to Fathom's public REST API (https://api.fathom.ai/external/v1) directly, using a
// personal API key — deliberately NOT routed through dori-engine's MCP/Universal Actions
// layer (src/integrations/fathom-mcp-routes.ts). That layer exists to gate engine-owned code
// (audit trace, provenance tagging, approval gating for risky actions); this is a read-only
// personal script outside the engine's actor boundary, so there's nothing there to lose.
// Dedup against re-filing is done here, the same way dori-engine's sync route does it
// (caller-side `excludeIds`, not something Universal Actions tracks) — see findFiledRecordingIds.
//
// Usage:
//   node fetch-fathom.mjs list [--since <ISO date>]   # new (unfiled) meetings, dedup'd against vault
//   node fetch-fathom.mjs get <recording_id>           # transcript + metadata for one meeting
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const API_BASE = 'https://api.fathom.ai/external/v1';

function loadApiKey() {
  if (process.env.FATHOM_API_KEY) return process.env.FATHOM_API_KEY;
  const envPath = join(SKILL_DIR, '.env');
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf-8').match(/^FATHOM_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error(`FATHOM_API_KEY not set — export it, or put "FATHOM_API_KEY=..." in ${envPath}`);
}

export async function fathomFetch(path, params = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, v);
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'X-Api-Key': loadApiKey() } });
    if (res.status === 429 && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2 ** attempt * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Fathom API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

export async function listAllMeetings({ since } = {}) {
  const items = [];
  let cursor;
  do {
    const page = await fathomFetch('/meetings', { created_after: since, cursor, include_transcript: false });
    items.push(...(page.items || []));
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return items;
}

// Any vault .md whose frontmatter already has fathom_recording_id: <id> (or the older
// fathom_id: <id> field used by earlier filed meetings) counts as filed.
export function findFiledRecordingIds() {
  const ids = new Set();
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(p);
      } else if (entry.name.endsWith('.md')) {
        const m = readFileSync(p, 'utf-8').match(/^fathom_(?:recording_)?id:\s*['"]?(\d+)['"]?/m);
        if (m) ids.add(m[1]);
      }
    }
  }
  walk(VAULT_ROOT);
  return ids;
}

export function formatTranscript(segments) {
  return (segments || [])
    .map((s) => `[${s.timestamp}] ${s.speaker?.display_name || 'Unknown'}: ${s.text}`)
    .join('\n');
}

async function cmdList(since) {
  const meetings = await listAllMeetings({ since });
  const filed = findFiledRecordingIds();
  const unfiled = meetings.filter((m) => !filed.has(String(m.recording_id)));
  console.log(JSON.stringify(
    unfiled.map((m) => ({
      recording_id: m.recording_id,
      title: m.meeting_title || m.title,
      recorded_at: m.recording_start_time || m.created_at,
      invitees: (m.calendar_invitees || []).map((i) => i.name || i.email),
      url: m.url,
    })),
    null,
    2,
  ));
}

async function cmdGet(recordingId, since) {
  const meetings = await listAllMeetings({ since });
  const meta = meetings.find((m) => String(m.recording_id) === String(recordingId));
  if (!meta) throw new Error(`recording_id ${recordingId} not found in meeting list (try widening --since)`);
  const { transcript } = await fathomFetch(`/recordings/${recordingId}/transcript`);
  console.log(JSON.stringify({
    recording_id: meta.recording_id,
    title: meta.meeting_title || meta.title,
    recorded_at: meta.recording_start_time || meta.created_at,
    invitees: (meta.calendar_invitees || []).map((i) => ({ name: i.name, email: i.email })),
    url: meta.url,
    transcript_text: formatTranscript(transcript),
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  const sinceFlagIdx = rest.indexOf('--since');
  const since = sinceFlagIdx >= 0 ? rest[sinceFlagIdx + 1] : undefined;
  if (cmd === 'list') {
    await cmdList(since);
  } else if (cmd === 'get') {
    const id = rest.find((a) => a !== '--since' && a !== since);
    if (!id) throw new Error('usage: fetch-fathom.mjs get <recording_id> [--since <ISO date>]');
    await cmdGet(id, since);
  } else {
    console.error('usage:\n  fetch-fathom.mjs list [--since <ISO date>]\n  fetch-fathom.mjs get <recording_id> [--since <ISO date>]');
    process.exit(1);
  }
}
