#!/usr/bin/env node
// Resolves a plain inbox_file item from list-inbox.mjs — files sitting in inbox/ that
// haven't been routed to a project yet. This is the counterpart to
// clarification-store.mjs's resolve/dismiss, which only covers the OTHER inbox source
// (pending clarifications), not bare captures.
//
// Usage:
//   node resolve-inbox.mjs move <inbox-filename-or-relPath> <projectPath>
//   node resolve-inbox.mjs archive <inbox-filename-or-relPath>
//
// `archive` moves the file to inbox/.archive/ (not deleted — reversible) rather than
// removing it outright; list-inbox.mjs's readdirSync never descends into dotdirs, so
// archived items simply stop appearing.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const INBOX_DIR = join(VAULT_ROOT, 'inbox');
const ARCHIVE_DIR = join(INBOX_DIR, '.archive');

function resolveInboxFile(name) {
  const base = name.startsWith('inbox/') ? name.slice('inbox/'.length) : name;
  const full = join(INBOX_DIR, base);
  if (!existsSync(full)) throw new Error(`Not found in inbox: ${base}`);
  return { base, full };
}

// A capture with an attachment (e.g. from listen-whatsapp.mjs) has a `media: <relPath>`
// frontmatter line pointing at a sibling file — move that too, and rewrite the
// reference so it still points at the right place once relocated.
function moveWithSidecar(full, destDir) {
  const content = readFileSync(full, 'utf8');
  const mediaMatch = content.match(/^media:\s*(\S+)\s*$/m);
  const destMdPath = join(destDir, basename(full));
  mkdirSync(destDir, { recursive: true });

  if (mediaMatch) {
    const oldMediaRel = mediaMatch[1];
    const oldMediaFull = join(VAULT_ROOT, oldMediaRel);
    const newMediaRel = `${destDir.slice(VAULT_ROOT.length + 1)}/${basename(oldMediaRel)}`;
    if (existsSync(oldMediaFull)) {
      renameSync(oldMediaFull, join(VAULT_ROOT, newMediaRel));
    }
    writeFileSync(destMdPath, content.replace(mediaMatch[0], `media: ${newMediaRel}`));
    unlinkSync(full);
  } else {
    renameSync(full, destMdPath);
  }
  return destMdPath.slice(VAULT_ROOT.length + 1);
}

export function moveToProject(name, projectPath) {
  const { full } = resolveInboxFile(name);
  return moveWithSidecar(full, join(VAULT_ROOT, 'projects', projectPath));
}

export function archive(name) {
  const { full } = resolveInboxFile(name);
  return moveWithSidecar(full, ARCHIVE_DIR);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [action, name, projectPath] = process.argv.slice(2);
  try {
    if (action === 'move') {
      if (!name || !projectPath) throw new Error('Usage: node resolve-inbox.mjs move <filename> <projectPath>');
      console.log(`Moved to ${moveToProject(name, projectPath)}`);
    } else if (action === 'archive') {
      if (!name) throw new Error('Usage: node resolve-inbox.mjs archive <filename>');
      console.log(`Archived to ${archive(name)}`);
    } else {
      console.error('Usage:\n  node resolve-inbox.mjs move <filename> <projectPath>\n  node resolve-inbox.mjs archive <filename>');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
