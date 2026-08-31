#!/usr/bin/env node
import assert from 'node:assert';
import { existsSync, unlinkSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_CONFIG_DIR = join(process.cwd(), '.test-config-chat');
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'whatsapp-config.json');
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.DORI_CONFIG_FILE = TEST_CONFIG_FILE;

const { setEngineConfig } = await import('../engine-config.mjs');
const { sendChatMessage } = await import('../chat-runner.mjs');
const { getAction } = await import('../actions.mjs');

console.log('Running test/chat-runner.mjs...');

try {
  // 1. Rejects invalid inputs
  await assert.rejects(() => sendChatMessage({ message: '' }), /Message must be a non-empty string/);
  await assert.rejects(() => sendChatMessage({ message: '   ' }), /Message must be a non-empty string/);

  // 2. Returns distinct NOT_CONFIGURED error when replyCli is none
  setEngineConfig({ replyCli: 'none' });
  await assert.rejects(
    () => sendChatMessage({ message: 'Hello' }),
    (err) => err.code === 'NOT_CONFIGURED' && err.message.includes('not configured')
  );

  // 3. actions.mjs registry dispatch rejects when not configured
  const chatAction = getAction('chat_send');
  await assert.rejects(
    () => chatAction.handler({ message: 'Hello' }),
    (err) => err.code === 'NOT_CONFIGURED'
  );

  // 4. Regression guard for constraint.chat.model-has-exactly-one-allowed-command:
  // the CLI invocation must restrict the model to the actions dispatcher
  // only. Source-inspection rather than mocking execFile/spawning a real
  // CLI -- cheap, and it's specifically the flags disappearing (not the
  // invocation logic changing shape) that caused the 2026-08-31 gap.
  const HERE = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(HERE, '..', 'chat-runner.mjs'), 'utf8');
  assert.ok(
    src.includes('--allowedTools') &&
      src.includes("actions.mjs'") &&
      src.includes(" run`") &&
      src.includes('Bash(${'),
    'runClaude must restrict tools to the actions.mjs dispatcher via --allowedTools'
  );
  assert.ok(
    /--sandbox['"`,\s]+workspace-write/.test(src),
    'runCodex must set --sandbox workspace-write, not run unrestricted'
  );
  assert.ok(
    src.includes("actions.mjs')} run <action_id>"),
    'system prompt must reference the actual dispatcher command'
  );

  console.log('chat-runner: all assertions passed');
} finally {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
}
