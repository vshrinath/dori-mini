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

// Claude Desktop's config path differs per OS -- macOS and Windows are
// documented Anthropic install targets; Linux has no official Claude Desktop
// build, but follows the same ~/.config convention other desktop apps use
// there, so it's included best-effort rather than left unsupported.
function claudeDesktopConfigPath() {
  if (process.platform === 'darwin') {
    return resolve(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || resolve(homedir(), 'AppData/Roaming');
    return resolve(appData, 'Claude/claude_desktop_config.json');
  }
  if (process.platform === 'linux') {
    return resolve(homedir(), '.config/Claude/claude_desktop_config.json');
  }
  throw new Error(`install-mcp-desktop.mjs doesn't support platform: ${process.platform}`);
}

const CONFIG_PATH = claudeDesktopConfigPath();
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
const quitHint = process.platform === 'darwin' ? 'Cmd+Q' : 'quit it from the system tray, not just close the window';
console.log(`Restart Claude Desktop (${quitHint}, reopen) for the change to take effect.`);
