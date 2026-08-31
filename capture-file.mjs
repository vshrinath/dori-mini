#!/usr/bin/env node
// File-drop counterpart to capture-text.mjs. Copies the dropped file into
// the vault via route-destination.mjs's existing canonicalOutputPath(kind:
// 'document') — same convention real documents already sitting in the vault
// follow (e.g. references/The-Complete-Guide-to-Building-Skill-for-Claude.pdf).
//
// Deliberately does NOT index or convert the file: reindex-vault.mjs only
// walks *.md (query-vault.mjs's FTS table has nothing to extract from a raw
// PDF/DOCX), and turning a dropped file into searchable text is markitdown
// conversion — a separate, bigger pipeline the `dori` skill already owns for
// pasted documents. This just gets the file safely into the vault.
//
// Usage: node capture-file.mjs <source-file-path>
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { canonicalOutputPath, VAULT_ROOT } from './route-destination.mjs';

export function captureFile(sourcePath, { source = 'mini_bar' } = {}) {
  if (!existsSync(sourcePath)) throw new Error(`File not found: ${sourcePath}`);

  const ext = extname(sourcePath) || '';
  const relPath = canonicalOutputPath({ kind: 'document', source }).replace(/\.md$/, ext);
  const absPath = join(VAULT_ROOT, relPath);

  mkdirSync(dirname(absPath), { recursive: true });
  copyFileSync(sourcePath, absPath);

  return { relPath, filename: basename(sourcePath) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , sourcePath] = process.argv;
  console.log(JSON.stringify(captureFile(sourcePath), null, 2));
}
