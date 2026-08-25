#!/usr/bin/env node
// `git pull` + a full reindex (both FTS and semantic), in one step. Mirrors
// dori-engine's git-sync.ts, which calls maybeReconcileVaultSearchIndex() after every
// successful pull — its own comment states why: "a pull may have deleted/renamed/moved
// vault files externally... without ever going through vault.write()/delete()/rename()."
// Same reason applies here: dori-mini has no passive watcher (see reindex-vault.mjs /
// semantic-index.mjs's own prune logic, which only runs on a full no-path reindex) — a
// git pull is exactly the kind of external change that needs this run afterward, since
// nothing else will notice files that were deleted or edited by the pull.
//
// No debounce/throttle: real Dori's version is a background daemon tick; this is a
// manual command run occasionally, so it always does the full thing.
//
// Usage: node sync-vault.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

if (existsSync(join(VAULT_ROOT, '.git'))) {
  console.log(`Pulling ${VAULT_ROOT} ...`);
  execFileSync('git', ['pull'], { cwd: VAULT_ROOT, stdio: 'inherit' });
} else {
  console.log(`${VAULT_ROOT} isn't a git repo — skipping pull, reindexing as-is.`);
}

console.log('\nReindexing (full-text) ...');
execFileSync('node', [join(SCRIPT_DIR, 'reindex-vault.mjs')], { stdio: 'inherit', env: process.env });

console.log('\nReindexing (semantic) ...');
execFileSync('node', [join(SCRIPT_DIR, 'semantic-index.mjs'), 'index'], { stdio: 'inherit', env: process.env });
