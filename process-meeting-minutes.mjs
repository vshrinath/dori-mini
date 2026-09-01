#!/usr/bin/env node
// Two-phase meeting minutes processor for Dori — mirrors dori-engine's
// `meeting-document.ts` (src/workflows/meeting-document.ts) pipeline:
//
// 1. Threshold check: COMPRESS_TRANSCRIPT_TOKEN_THRESHOLD = 1500 tokens (~6000 chars).
// 2. Stage 1 (Fast Tier / Compression): For long transcripts, compresses verbatim
//    dialogue into a lossy-for-filler / lossless-for-facts structured agenda.
// 3. Stage 2 (Reasoning Tier / Extraction): Follows canonical mom-prompt.md
//    to produce structured Executive Summary, Topics, Decisions Log, and Action Items.
// 4. Persistence & Indexing: Prepend MOM into the markdown file, extract tasks
//    into .dori/tasks/records/, and reindex portal.db.
//
// Usage: node process-meeting-minutes.mjs <relPath or recordingId> [--force]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { VAULT_ROOT } from './route-destination.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { getEngineConfig } from './engine-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPRESS_TRANSCRIPT_TOKEN_THRESHOLD = 1500; // ~6000 chars
const COMPRESS_CHAR_THRESHOLD = COMPRESS_TRANSCRIPT_TOKEN_THRESHOLD * 4;

const COMPRESSION_SYSTEM_PROMPT = `Compress this raw meeting transcript into a compact structured agenda for a downstream summarizer. This is a lossy-but-lossless-for-facts pass: cut filler, repetition, and small talk, but you MUST preserve every speaker attribution, decision, numeric/date detail, and action item verbatim — the next stage extracts structured minutes from your output alone and cannot see the original transcript. Group by topic. Output plain text, no commentary, no code fences.`;

function execEnv() {
  const extra = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return { ...process.env, PATH: `${process.env.PATH || ''}:${extra.join(':')}` };
}

function runCliFast(prompt) {
  const { replyCli } = getEngineConfig();
  const cli = replyCli === 'codex' ? 'codex' : 'claude';

  if (cli === 'claude') {
    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--strict-mcp-config',
      '--settings', JSON.stringify({ hooks: { SessionEnd: [] } }),
    ];
    try {
      const out = execFileSync('claude', args, {
        cwd: HERE,
        env: execEnv(),
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out.trim();
    } catch (err) {
      console.warn(`[compress] Fast tier CLI warning: ${err.message}`);
      return null;
    }
  } else {
    const args = ['exec', '--sandbox', 'workspace-write', prompt];
    try {
      const out = execFileSync('codex', args, {
        cwd: HERE,
        env: execEnv(),
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return out.trim();
    } catch (err) {
      console.warn(`[compress] Codex fast tier warning: ${err.message}`);
      return null;
    }
  }
}

function runCliReasoning(prompt) {
  const { replyCli } = getEngineConfig();
  const cli = replyCli === 'codex' ? 'codex' : 'claude';

  if (cli === 'claude') {
    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--strict-mcp-config',
      '--settings', JSON.stringify({ hooks: { SessionEnd: [] } }),
    ];
    const out = execFileSync('claude', args, {
      cwd: HERE,
      env: execEnv(),
      encoding: 'utf-8',
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim();
  } else {
    const args = ['exec', '--sandbox', 'workspace-write', prompt];
    const out = execFileSync('codex', args, {
      cwd: HERE,
      env: execEnv(),
      encoding: 'utf-8',
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim();
  }
}

/**
 * Stage 1 of the hybrid pipeline: compress long transcripts with fast tier.
 */
async function compressTranscript(rawTranscript) {
  if (rawTranscript.length < COMPRESS_CHAR_THRESHOLD) {
    return rawTranscript;
  }
  const prompt = `${COMPRESSION_SYSTEM_PROMPT}\n\nTranscript:\n${rawTranscript}`;
  const compressed = runCliFast(prompt);
  if (compressed && compressed.length > 200) {
    return compressed;
  }
  return rawTranscript; // Fallback to raw transcript if compression fails
}

/**
 * Stage 2 of the hybrid pipeline: extract full structured MOM using mom-prompt.md.
 */
async function extractMinutes({ title, date, attendees, transcript }) {
  const momPromptTemplate = readFileSync(join(HERE, 'mom-prompt.md'), 'utf-8');

  const fullPrompt = [
    momPromptTemplate,
    '',
    '---',
    `# Target Meeting for Processing:`,
    `Title: ${title}`,
    `Date: ${date}`,
    `Attendees: ${attendees.join(', ') || 'Unknown'}`,
    '',
    '## Transcript / Structured Agenda:',
    transcript,
  ].join('\n');

  return runCliReasoning(fullPrompt);
}

export async function processMeetingMinutes({ relPath, force = false }) {
  const candidates = [
    relPath,
    `${relPath}.md`,
    join('meetings', relPath),
    join('meetings', `${relPath}.md`),
  ];
  let absPath = null;
  let targetRel = relPath;
  for (const c of candidates) {
    const full = join(VAULT_ROOT, c);
    if (existsSync(full) && !statSync(full).isDirectory()) {
      absPath = full;
      targetRel = c;
      break;
    }
  }

  if (!absPath) {
    throw new Error(`Meeting document not found for "${relPath}"`);
  }

  const rawFile = readFileSync(absPath, 'utf-8');
  const { fm, body } = parseFrontmatter(rawFile);

  const transcriptMatch = body.match(/(?:^|\n)(?:#{1,3}\s+Transcript|Transcript)[\s\S]*/i);
  const transcriptText = transcriptMatch
    ? transcriptMatch[0].replace(/^(?:\n*#{1,3}\s+Transcript\s*\n*|\n*Transcript\s*\n*)/i, '').trim()
    : body;

  const existingMOM = transcriptMatch ? body.slice(0, transcriptMatch.index).trim() : '';
  const alreadyProcessed = existingMOM.length > 100 && !force;

  if (alreadyProcessed) {
    return {
      status: 'already_processed',
      relPath: targetRel,
      message: 'Meeting already has structured MOM. Pass force: true to re-extract.',
    };
  }

  const title = fm.title || targetRel.split('/').pop().replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '');
  const date = fm.date || (targetRel.match(/\d{4}-\d{2}-\d{2}/) || [new Date().toISOString().slice(0, 10)])[0];
  const attendees = Array.isArray(fm.attendees) ? fm.attendees : [];

  // Stage 1: Fast compression
  const effectiveTranscript = await compressTranscript(transcriptText);

  // Stage 2: Reasoning extraction
  const generatedMOM = await extractMinutes({
    title,
    date,
    attendees,
    transcript: effectiveTranscript,
  });

  // Strip duplicated frontmatter from generated output if present
  let cleanMOM = generatedMOM;
  if (cleanMOM.startsWith('---')) {
    const endFm = cleanMOM.indexOf('---', 3);
    if (endFm !== -1) {
      cleanMOM = cleanMOM.slice(endFm + 3).trim();
    }
  }

  // Stage 3: Merge back into markdown file preserving original YAML frontmatter & raw transcript
  const updatedDoc = [
    '---',
    ...Object.entries(fm || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`),
    '---',
    '',
    cleanMOM.trim(),
    '',
    '## Transcript',
    '',
    transcriptText.trim(),
    '',
  ].join('\n');

  writeFileSync(absPath, updatedDoc, 'utf-8');

  // Stage 4: Extract action items into .dori/tasks/records/
  let tasksCreated = 0;
  try {
    const taskOut = execFileSync('node', [join(HERE, 'task-store.mjs'), 'extract', targetRel], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(taskOut);
    tasksCreated = parsed.created || 0;
  } catch (err) {
    console.warn(`[tasks] Task extraction notice: ${err.message}`);
  }

  // Stage 5: Reindex vault SQLite index
  try {
    execFileSync('node', [join(HERE, 'reindex-vault.mjs'), absPath], { stdio: 'ignore' });
  } catch {}

  return {
    status: 'completed',
    relPath: targetRel,
    title,
    date,
    tasksCreated,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const relPath = process.argv[2];
  const force = process.argv.includes('--force');
  if (!relPath) {
    console.error('Usage: node process-meeting-minutes.mjs <relPath> [--force]');
    process.exit(1);
  }
  processMeetingMinutes({ relPath, force })
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(JSON.stringify({ error: err.message }, null, 2));
      process.exit(1);
    });
}
