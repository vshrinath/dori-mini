#!/usr/bin/env node
// Read-only conversational replies for the WhatsApp channel — the one place in this
// mirror that does real AI reasoning unattended (see listen-whatsapp.mjs's header on
// why everything else here is mechanical). Reuses whichever coding-agent CLI the user
// already has configured (Claude Code or Codex) instead of a separate API key, so it
// rides the same subscription/auth they already pay for.
//
// Scoped to READ-ONLY recall on purpose: the CLI is invoked headless (no TTY, nobody to
// approve a tool call), so this explicitly allowlists just the three recall scripts and
// nothing else — no Write/Edit, no arbitrary Bash, no filing/routing actions. A message
// arriving over WhatsApp is less trusted input than someone typing into a real session;
// keep its blast radius to "can answer questions," not "can change your vault."
//
// Configured via ~/.dori/whatsapp-config.json — { "replyCli": "claude" | "codex" | "none" }
// (written by setup.sh's prompt, or edit the file directly). Returns null (no reply
// sent) when unconfigured — filing still happens either way.
//
// Recent turns come from whatsapp-history.mjs (its own isolated SQLite file — see that
// file's header for why it's kept out of the vault's search index) so a follow-up like
// "and when does it renew?" can resolve against what was just asked, not just this one
// message in isolation.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { appendTurn, recentHistory } from './whatsapp-history.mjs';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(homedir(), '.dori', 'whatsapp-config.json');
const TIMEOUT_MS = 45000;

const SYSTEM_PROMPT = `You are Dori, replying to a WhatsApp message with a short, direct
answer based only on what's in the vault. For recall, run query-vault.mjs, list-tasks.mjs,
or list-inbox.mjs in ${SCRIPTS_DIR} (node <script>.mjs ...) — that's all you're allowed to
do; you have no other tools. If the vault doesn't have the answer, say so plainly rather
than guessing. Reply in plain text, no markdown, under 3 sentences — this goes over
WhatsApp, not a terminal.`;

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { replyCli: 'none' };
  }
}

function buildPrompt(message, history) {
  if (!history.length) return `${SYSTEM_PROMPT}\n\nMessage: ${message}`;
  const transcript = history.map((t) => `${t.role === 'user' ? 'User' : 'Dori'}: ${t.text}`).join('\n');
  return `${SYSTEM_PROMPT}\n\nEarlier in this conversation:\n${transcript}\n\nNew message: ${message}`;
}

// launchd background jobs get a minimal PATH (no shell profile sourced), so `claude`/
// `codex` installed via nvm/npm-global/homebrew into a user-local dir aren't found by
// name alone. Append the common install locations rather than hardcoding one user's path.
function execEnv() {
  const extra = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return { ...process.env, PATH: `${process.env.PATH || ''}:${extra.join(':')}` };
}

function runClaude(prompt) {
  const allow = (script) => `Bash(node ${join(SCRIPTS_DIR, script)}:*)`;
  const args = [
    '-p', prompt,
    '--allowedTools', allow('query-vault.mjs'), allow('list-tasks.mjs'), allow('list-inbox.mjs'),
  ];
  return new Promise((resolve, reject) => {
    execFile('claude', args, { cwd: SCRIPTS_DIR, timeout: TIMEOUT_MS, env: execEnv() }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout.trim());
    });
  });
}

function runCodex(prompt) {
  const args = ['exec', '--sandbox', 'read-only', prompt];
  return new Promise((resolve, reject) => {
    execFile('codex', args, { cwd: SCRIPTS_DIR, timeout: TIMEOUT_MS, env: execEnv() }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout.trim());
    });
  });
}

// Skip the AI call entirely for messages that aren't actually questions — a bare link or
// attachment is a capture, not something to answer, and the CLI call has real cost/latency.
export function needsReply(text, urls) {
  if (!text) return false;
  const stripped = text.trim();
  if (urls.length === 1 && stripped === urls[0]) return false; // just a bare link
  return true;
}

export async function answerMessage(chatJid, message) {
  const { replyCli } = loadConfig();
  if (replyCli !== 'claude' && replyCli !== 'codex') return null;

  const history = recentHistory(chatJid);
  const prompt = buildPrompt(message, history);
  const reply = replyCli === 'claude' ? await runClaude(prompt) : await runCodex(prompt);

  appendTurn(chatJid, 'user', message);
  appendTurn(chatJid, 'dori', reply);
  return reply;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [chatJid, ...rest] = process.argv.slice(2);
  const message = rest.join(' ');
  if (!chatJid || !message) {
    console.error('Usage: node answer-whatsapp.mjs <chat_jid> "message"');
    process.exit(1);
  }
  const reply = await answerMessage(chatJid, message);
  console.log(reply ?? '(no reply CLI configured — see ~/.dori/whatsapp-config.json)');
}
