#!/usr/bin/env node
// Bulk-files every Fathom meeting not yet in the vault as a raw transcript under meetings/ —
// no compression, no mom-prompt minutes, no per-meeting routing question. Just a place to
// keep one-time meetings that would otherwise sit unfiled in Fathom forever. Full mom-prompt
// treatment (SKILL.md branch 3/4) is still the right call for a specific meeting worth
// summarizing — this is only for clearing the backlog into something searchable.
//
// Usage: node file-meetings-backlog.mjs [--since <ISO date>] [--limit N] [--dry-run]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fathomFetch, listAllMeetings, findFiledRecordingIds, formatTranscript } from './fetch-fathom.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const MEETINGS_DIR = join(VAULT_ROOT, 'meetings');

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function yamlEscape(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

function lastTimestampMinutes(segments) {
  const last = segments?.[segments.length - 1]?.timestamp;
  if (!last) return null;
  const parts = last.split(':').map(Number);
  const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return Math.round(secs / 60);
}

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const dryRun = args.includes('--dry-run');

  const [meetings, filed] = [await listAllMeetings({ since }), findFiledRecordingIds()];
  const unfiled = meetings.filter((m) => !filed.has(String(m.recording_id))).slice(0, limit);

  console.log(`${meetings.length} total, ${filed.size} already filed, ${unfiled.length} to file${dryRun ? ' (dry run)' : ''}`);
  if (!dryRun) mkdirSync(MEETINGS_DIR, { recursive: true });

  const written = [];
  for (const m of unfiled) {
    const title = m.meeting_title || m.title || 'Untitled meeting';
    const date = (m.recording_start_time || m.created_at || '').slice(0, 10) || 'undated';
    const slug = slugify(title) || `recording-${m.recording_id}`;
    let relPath = `meetings/${date}-${slug}.md`;
    let fullPath = join(VAULT_ROOT, relPath);
    if (existsSync(fullPath) || written.includes(relPath)) {
      relPath = `meetings/${date}-${slug}-${m.recording_id}.md`;
      fullPath = join(VAULT_ROOT, relPath);
    }

    if (dryRun) {
      console.log(`would write: ${relPath}`);
      continue;
    }

    const { transcript } = await fathomFetch(`/recordings/${m.recording_id}/transcript`);
    const attendees = (m.calendar_invitees || []).map((i) => i.name || i.email);
    const durationMin = lastTimestampMinutes(transcript);

    const frontmatter = [
      '---',
      'kind: meeting',
      `date: '${date}'`,
      `title: ${yamlEscape(title)}`,
      'source: fathom',
      `fathom_recording_id: "${m.recording_id}"`,
      `fathom_url: ${yamlEscape(m.url || '')}`,
      'attendees:',
      ...(attendees.length ? attendees.map((a) => `  - ${yamlEscape(a)}`) : ['  []']),
      ...(durationMin != null ? [`duration_min: ${durationMin}`] : []),
      '---',
      '',
      `# ${title}`,
      '',
      `**Date:** ${date}`,
      `**Attendees:** ${attendees.join(', ') || 'Unknown'}`,
      ...(durationMin != null ? [`**Duration:** ~${durationMin} minutes`] : []),
      '',
      '## Transcript',
      '',
      formatTranscript(transcript).split('\n').map((line) => {
        const match = line.match(/^\[([\d:]+)\]\s*([^:]+):\s*(.*)$/);
        return match ? `**${match[2]}** : ${match[3]}` : line;
      }).join('\n\n'),
      '',
    ].join('\n');

    writeFileSync(fullPath, frontmatter);
    written.push(relPath);
    console.log(`filed: ${relPath}`);
    await new Promise((r) => setTimeout(r, 300)); // be polite to the Fathom API
  }

  console.log(`\nDone. ${written.length} filed.`);
  if (written.length) console.log('Run reindex-vault.mjs (no path) to index the new files.');
}

main().catch((e) => { console.error(e); process.exit(1); });
