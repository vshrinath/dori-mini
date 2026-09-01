#!/usr/bin/env node
// Unattended (launchd) poll: fetch new Fathom meetings, classify each via route-meeting.mjs's
// policy, file every one as a raw transcript, and let the existing clarification/inbox
// mechanism (list-inbox.mjs) surface anything that needs a human decision. No LLM calls —
// deterministic only, same spirit as digest.mjs/watch-inbox.mjs. Full mom-prompt minutes
// (SKILL.md branch 3/4) are still a deliberate, interactive follow-up for a meeting worth
// summarizing — this just guarantees nothing sits unfiled in Fathom and gets missed.
//
// Usage: node fathom-poll.mjs [--since <ISO date>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fathomFetch, listAllMeetings, findFiledRecordingIds, formatTranscript } from './fetch-fathom.mjs';
import { routeMeeting } from './route-meeting.mjs';
import { processMeetingMinutes } from './process-meeting-minutes.mjs';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const MEETINGS_DIR = join(VAULT_ROOT, 'meetings');

function selfName() {
  try {
    const out = execFileSync('node', [join(SKILL_DIR, 'self-store.mjs'), 'get'], { encoding: 'utf-8' });
    return JSON.parse(out).name || '';
  } catch {
    return '';
  }
}

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

function uniquePath(dir, date, slug, recordingId) {
  let relDir = dir.replace(VAULT_ROOT + '/', '');
  let relPath = `${relDir}/${date}-${slug}.md`;
  if (existsSync(join(VAULT_ROOT, relPath))) relPath = `${relDir}/${date}-${slug}-${recordingId}.md`;
  return relPath;
}

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
  const self = selfName();

  const meetings = await listAllMeetings({ since });
  const filed = findFiledRecordingIds();
  const unfiled = meetings.filter((m) => !filed.has(String(m.recording_id)));

  if (unfiled.length === 0) {
    console.log(`[${new Date().toISOString()}] no new meetings`);
    return;
  }

  let autoFiled = 0, suggested = 0, needsResolution = 0;
  for (const m of unfiled) {
    const title = m.meeting_title || m.title || 'Untitled meeting';
    const date = (m.recording_start_time || m.created_at || '').slice(0, 10) || 'undated';
    const slug = slugify(title) || `recording-${m.recording_id}`;
    const attendees = (m.calendar_invitees || []).map((i) => i.name || i.email);

    const decision = routeMeeting(attendees.length ? attendees : [self], self, title);

    let targetDir = MEETINGS_DIR;
    let suggestedNote = '';
    if (decision.action === 'moved') {
      targetDir = join(VAULT_ROOT, decision.destination);
      autoFiled++;
    } else if (decision.action === 'suggested') {
      suggestedNote = decision.destination;
      suggested++;
    } else {
      needsResolution++; // 'conflict' / 'none' — routeMeeting already wrote a ClarificationRecord
    }
    mkdirSync(targetDir, { recursive: true });

    const relPath = uniquePath(targetDir, date, slug, m.recording_id);
    const fullPath = join(VAULT_ROOT, relPath);

    const { transcript } = await fathomFetch(`/recordings/${m.recording_id}/transcript`);
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
      ...(decision.action === 'moved' ? [`account: ${decision.slug}`] : []),
      ...(suggestedNote ? [`suggested_destination: ${yamlEscape(suggestedNote)}`] : []),
      `routing_action: ${decision.action}`,
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
    console.log(`filed [${decision.action}]: ${relPath}`);

    try {
      console.log(`processing structured MOM for: ${relPath}`);
      await processMeetingMinutes({ relPath });
    } catch (err) {
      console.warn(`[fathom-poll] automated MOM processing deferred: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 300)); // be polite to the Fathom API
  }

  execFileSync('node', [join(SKILL_DIR, 'reindex-vault.mjs')], { stdio: 'inherit' });

  const summary = `${unfiled.length} new meeting(s): ${autoFiled} auto-filed, ${suggested} suggested (review), ${needsResolution} need resolution (check inbox)`;
  console.log(summary);
  if (needsResolution > 0 || suggested > 0) {
    try {
      execFileSync('node', [join(SKILL_DIR, 'notify-desktop.mjs'), summary, 'Dori: new meetings filed'], { stdio: 'ignore' });
    } catch { /* notification is best-effort */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
