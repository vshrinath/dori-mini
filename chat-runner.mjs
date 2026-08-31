#!/usr/bin/env node
// Backend chat runner for Dori Go composer & chat.
// Follows constraint.chat.cli-spawn-happens-in-main-process-only,
// constraint.chat.reuse-answer-whatsapp-cli-invocation,
// constraint.chat.action-invocation-is-existing-actions-only,
// constraint.chat.no-token-streaming-for-v1, and
// constraint.chat.no-persistent-message-store-for-v1.
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { getEngineConfig } from './engine-config.mjs';
import { actions, getAction } from './actions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 60000;

function execEnv() {
  const extra = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return { ...process.env, PATH: `${process.env.PATH || ''}:${extra.join(':')}` };
}

function buildSystemPrompt(projectContext) {
  const actionList = actions.map((a) => `- ${a.id}: ${a.description}`).join('\n');
  const scopeMsg = projectContext
    ? `You are currently scoped to the project "${projectContext}". Keep your focus on this project unless asked otherwise.`
    : `You are in global conversation mode.`;

  return `You are Dori, the executive personal AI assistant. ${scopeMsg}

Available registered actions:
${actionList}

To execute an action, run exactly:
  node ${join(HERE, 'actions.mjs')} run <action_id> '<json_input>'
This is the only tool you have -- no other command is available to you.

Be direct, precise, concise, and helpful. If you perform an action (like capturing a note, completing a task, or searching), state what was done clearly.`;
}

function buildPrompt(message, history = [], projectContext = null) {
  const sys = buildSystemPrompt(projectContext);
  if (!history || history.length === 0) {
    return `${sys}\n\nUser: ${message}\n\nDori:`;
  }
  const transcript = history
    .map((t) => `${t.role === 'user' ? 'User' : 'Dori'}: ${t.text}`)
    .join('\n\n');
  return `${sys}\n\nEarlier conversation:\n${transcript}\n\nUser: ${message}\n\nDori:`;
}

// constraint.chat.action-invocation-is-existing-actions-only: the model gets
// exactly one allowed command -- the actions.mjs CLI dispatcher -- and
// nothing else. No general Bash, no Edit/Write, no arbitrary file access.
// This is the flag answer-whatsapp.mjs's runClaude/runCodex actually relied
// on for safety; dropping it (as an earlier version of this file did) is
// what made this feature unsandboxed. See PLAN-REVIEW notes, 2026-08-31.
const ACTIONS_DISPATCH_CMD = `node ${join(HERE, 'actions.mjs')} run`;

export function runClaude(prompt) {
  const args = ['-p', prompt, '--allowedTools', `Bash(${ACTIONS_DISPATCH_CMD}:*)`];
  return new Promise((resolve, reject) => {
    execFile('claude', args, { cwd: HERE, timeout: TIMEOUT_MS, env: execEnv() }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Claude Code execution failed: ${err.message}${stderr ? ' - ' + stderr : ''}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export function runCodex(prompt) {
  // Codex's --sandbox is coarser than Claude's --allowedTools: it has no
  // per-command allowlist, only read-only/workspace-write/danger-full-access.
  // workspace-write permits ANY command that only touches files under cwd
  // (HERE, i.e. dori-mini's own directory) -- weaker than Claude's guarantee
  // (only the actions dispatcher can run at all), accepted as an explicit
  // v1 tradeoff rather than a precisely equivalent restriction. The system
  // prompt's "no other command is available to you" is the only thing
  // narrowing Codex further than the sandbox flag alone would.
  const args = ['exec', '--sandbox', 'workspace-write', prompt];
  return new Promise((resolve, reject) => {
    execFile('codex', args, { cwd: HERE, timeout: TIMEOUT_MS, env: execEnv() }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Codex execution failed: ${err.message}${stderr ? ' - ' + stderr : ''}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function sendChatMessage({ message, history = [], projectContext = null }) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Message must be a non-empty string');
  }

  const { replyCli } = getEngineConfig();
  if (!replyCli || replyCli === 'none') {
    const error = new Error('AI engine is not configured');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }

  const prompt = buildPrompt(message.trim(), history, projectContext);

  try {
    const reply = replyCli === 'claude' ? await runClaude(prompt) : await runCodex(prompt);
    return {
      reply,
      replyCli,
      projectContext,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    err.code = 'CLI_CALL_FAILED';
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const message = process.argv.slice(2).join(' ');
  if (!message) {
    console.error('Usage: node chat-runner.mjs "your message"');
    process.exit(1);
  }
  try {
    const res = await sendChatMessage({ message });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, code: err.code }, null, 2));
    process.exit(1);
  }
}
