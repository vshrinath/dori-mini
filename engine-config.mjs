#!/usr/bin/env node
// Shared accessor for ~/.dori/whatsapp-config.json.
// Follows constraint.engine-picker.single-config-file and
// constraint.engine-picker.config-write-path: single source of truth for
// replyCli ("claude" | "codex" | "none") shared across Dori Go and WhatsApp.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const CONFIG_FILE = process.env.DORI_CONFIG_FILE || join(homedir(), '.dori', 'whatsapp-config.json');

export const VALID_CLIS = ['claude', 'codex', 'none'];

export function getEngineConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { replyCli: 'none' };
    }
    const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    const replyCli = VALID_CLIS.includes(data.replyCli) ? data.replyCli : 'none';
    return { ...data, replyCli };
  } catch (err) {
    return { replyCli: 'none' };
  }
}

export function setEngineConfig({ replyCli }) {
  if (!VALID_CLIS.includes(replyCli)) {
    throw new Error(`Invalid replyCli value: "${replyCli}". Must be one of: ${VALID_CLIS.join(', ')}`);
  }

  let existing = {};
  try {
    if (existsSync(CONFIG_FILE)) {
      existing = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {
    existing = {};
  }

  const updated = { ...existing, replyCli };
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');

  return { replyCli: updated.replyCli, success: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, val] = process.argv.slice(2);
  if (cmd === 'get') {
    console.log(JSON.stringify(getEngineConfig(), null, 2));
  } else if (cmd === 'set' && val) {
    console.log(JSON.stringify(setEngineConfig({ replyCli: val }), null, 2));
  } else {
    console.error('Usage: node engine-config.mjs get | set <claude|codex|none>');
    process.exit(1);
  }
}
