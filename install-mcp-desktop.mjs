#!/usr/bin/env node
// Registers dori-mini's MCP server in Claude Desktop's config. Idempotent —
// safe to re-run (e.g. after moving this repo). Only ever touches the
// "dori-mini" key under mcpServers; every other key (other MCP servers,
// preferences, API keys already stored there) is round-tripped untouched via
// JSON.parse/stringify, never text-edited.
//
// Usage: node install-mcp-desktop.mjs [--remove]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = resolve(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
const SERVER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'mcp-server.mjs');
const remove = process.argv.includes('--remove');

const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) : {};
config.mcpServers ??= {};

if (remove) {
  delete config.mcpServers['dori-mini'];
  console.log('Removed dori-mini from', CONFIG_PATH);
} else {
  config.mcpServers['dori-mini'] = { command: 'node', args: [SERVER_PATH] };
  console.log('Registered dori-mini ->', SERVER_PATH);
}

mkdirSync(dirname(CONFIG_PATH), { recursive: true });
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
console.log('Wrote', CONFIG_PATH);
console.log('Restart Claude Desktop (Cmd+Q, reopen) for the change to take effect.');
