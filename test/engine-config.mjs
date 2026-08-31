#!/usr/bin/env node
import assert from 'node:assert';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_CONFIG_DIR = join(process.cwd(), '.test-config');
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'whatsapp-config.json');
mkdirSync(TEST_CONFIG_DIR, { recursive: true });
process.env.DORI_CONFIG_FILE = TEST_CONFIG_FILE;

const { getEngineConfig, setEngineConfig } = await import('../engine-config.mjs');
const { getAction } = await import('../actions.mjs');

console.log('Running test/engine-config.mjs with CONFIG_FILE:', TEST_CONFIG_FILE);

try {
  // 1. Initial state when file does not exist
  if (existsSync(TEST_CONFIG_FILE)) unlinkSync(TEST_CONFIG_FILE);
  assert.equal(getEngineConfig().replyCli, 'none');

  // 2. Reject invalid enum values
  assert.throws(() => setEngineConfig({ replyCli: 'gpt4' }), /Invalid replyCli value/);
  assert.throws(() => setEngineConfig({ replyCli: 'openrouter' }), /Invalid replyCli value/);

  // 3. Set valid enum values
  const r1 = setEngineConfig({ replyCli: 'claude' });
  assert.equal(r1.replyCli, 'claude');
  assert.equal(getEngineConfig().replyCli, 'claude');

  // Check file on disk
  const diskData = JSON.parse(readFileSync(TEST_CONFIG_FILE, 'utf8'));
  assert.equal(diskData.replyCli, 'claude');

  // 4. Update to codex
  setEngineConfig({ replyCli: 'codex' });
  assert.equal(getEngineConfig().replyCli, 'codex');

  // 5. Update to none
  setEngineConfig({ replyCli: 'none' });
  assert.equal(getEngineConfig().replyCli, 'none');

  // 6. Test actions.mjs registry dispatch
  const getAct = getAction('get_engine_config');
  const setAct = getAction('set_engine_config');

  await setAct.handler({ replyCli: 'claude' });
  const afterSet = await getAct.handler({});
  assert.equal(afterSet.replyCli, 'claude');

  console.log('engine-config: all assertions passed');
} finally {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
}
