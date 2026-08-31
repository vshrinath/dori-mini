#!/usr/bin/env node
// Saves edited document content back to the vault file.
// Follows constraint.slideover.write-path-is-server-derived: relPath MUST be
// the exact vault-relative path the document was opened with (what
// get_document returned) -- NOT resolved through query-vault.mjs's
// getDocument(), which does fuzzy LIKE/title matching and could resolve a
// loosely-specified caller string (e.g. a chat-driven call passing a title
// fragment instead of an exact path) to a DIFFERENT document than intended.
// A caller that doesn't already have the exact relPath should call
// get_document first, the same two-step real callers (FileSlideover.jsx)
// already follow.
//
// Follows constraint.slideover.reindex-matches-existing-convention: after a
// successful write, runs both reindex-vault.mjs (FTS) and semantic-index.mjs
// index <path> (dense vectors) non-fatally, matching capture-text.mjs.
import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VAULT_ROOT } from './route-destination.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function saveDocument(relPath, content) {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  // relPath MUST be exact -- no fuzzy resolution. Path traversal + existence
  // are the only checks; a needle that isn't a real, already-indexed file
  // path fails closed rather than resolving to "the closest match."
  const normalizedVaultRoot = resolve(VAULT_ROOT);
  const absPath = resolve(VAULT_ROOT, relPath);
  if (!absPath.startsWith(normalizedVaultRoot + '/') && absPath !== normalizedVaultRoot) {
    throw new Error(`Path outside vault root: ${relPath}`);
  }
  if (!existsSync(absPath)) {
    throw new Error(`Document not found: ${relPath}`);
  }

  // Write content to disk
  writeFileSync(absPath, content, 'utf8');

  // Non-fatal dual reindex (FTS + semantic embedding)
  try {
    execFileSync('node', [join(HERE, 'reindex-vault.mjs')], { stdio: 'ignore' });
    execFileSync('node', [join(HERE, 'semantic-index.mjs'), 'index', absPath], { stdio: 'ignore' });
  } catch (err) {
    console.error('[save-document] indexing failed (document still saved):', err.message);
  }

  return { relPath, title: basename(relPath, '.md'), success: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , relPath, content] = process.argv;
  if (!relPath || content === undefined) {
    console.error('Usage: node save-document.mjs <exact-rel-path> <content>');
    process.exit(1);
  }
  console.log(JSON.stringify(saveDocument(relPath, content), null, 2));
}
