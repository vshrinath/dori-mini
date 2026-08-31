#!/usr/bin/env node
// Minimal mirror of dori-engine's POST /capture/items text path (job-processor
// writes the file dori-engine's real schema requires — capture_id, job_id,
// event timeline, routing metadata). dori-mini has no job processor, so this
// writes a plain-frontmatter capture instead: title/type/created/source,
// enough for list_documents/get_document (query-vault.mjs's indexer only
// reads title/type/date from frontmatter) without inventing engine-internal
// fields nothing here ever reads.
//
// Usage: node capture-text.mjs "<text>"
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalOutputPath, VAULT_ROOT } from './route-destination.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function captureText(text, { source = 'mini_bar' } = {}) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Cannot capture empty text');

  const relPath = canonicalOutputPath({ kind: 'text', source });
  const absPath = join(VAULT_ROOT, relPath);
  const title = trimmed.split('\n')[0].slice(0, 80);
  const now = new Date().toISOString();
  const content = `---
title: "${title.replace(/"/g, '\\"')}"
type: "capture"
created: ${now}
source: ${source}
---

${trimmed}
`;

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);

  // Keep the vault index (and Library screen) current without waiting for a
  // manual reindex — both are fast, single-vault-scan-incremental (~1s) and
  // single-file (~50ms) respectively. Non-fatal: the capture already landed
  // on disk even if indexing fails.
  try {
    execFileSync('node', [join(HERE, 'reindex-vault.mjs')], { stdio: 'ignore' });
    execFileSync('node', [join(HERE, 'semantic-index.mjs'), 'index', absPath], { stdio: 'ignore' });
  } catch (err) {
    console.error('[capture-text] indexing failed (capture still saved):', err.message);
  }

  return { relPath, title };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).join(' ');
  console.log(JSON.stringify(captureText(text), null, 2));
}
