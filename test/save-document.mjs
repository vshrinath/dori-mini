#!/usr/bin/env node
import assert from 'node:assert';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_VAULT = join(process.cwd(), '.test-vault');
mkdirSync(join(TEST_VAULT, 'inbox'), { recursive: true });
process.env.VAULT_ROOT = TEST_VAULT;

const { VAULT_ROOT } = await import('../route-destination.mjs');
const { saveDocument } = await import('../save-document.mjs');
const { getAction } = await import('../actions.mjs');

console.log('Running test/save-document.mjs with VAULT_ROOT:', VAULT_ROOT);

try {
  // 1. Rejects invalid content types
  assert.throws(() => saveDocument('any-file.md', null), /Content must be a string/);
  assert.throws(() => saveDocument('any-file.md', 123), /Content must be a string/);

  // 2. Rejects path traversal outside vault root
  assert.throws(() => saveDocument('../outside.md', 'hello'), /outside vault root|Document not found/);
  assert.throws(() => saveDocument('/etc/passwd', 'hello'), /outside vault root|Document not found/);

  // 3. Rejects non-existent files that are not in index
  assert.throws(() => saveDocument('inbox/non-existent-random-path-12345.md', 'hello'), /Document not found/);

  // 4. Successful write & restore on an actual test file in vault
  const testRelPath = 'inbox/test-save-document-fixture.md';
  const testAbsPath = join(TEST_VAULT, testRelPath);
  const originalContent = `---
title: "Test Save Document Fixture"
type: "test"
---

Original content here.
`;

  const updatedContent = `---
title: "Test Save Document Fixture"
type: "test"
---

Updated content successfully saved.
`;

  writeFileSync(testAbsPath, originalContent, 'utf8');

  // Save via saveDocument
  const result = saveDocument(testRelPath, updatedContent);
  assert.equal(result.success, true);
  assert.equal(result.relPath, testRelPath);

  // Verify file on disk matches updatedContent
  const readBack = readFileSync(testAbsPath, 'utf8');
  assert.equal(readBack, updatedContent);

  // 5. Test dispatch via actions.mjs registry
  const action = getAction('save_document');
  assert.equal(action.scope, 'write');
  assert.equal(action.exposeToMcp, true);

  const actionResult = await action.handler({
    path: testRelPath,
    content: originalContent,
  });
  assert.equal(actionResult.success, true);

  const restoredContent = readFileSync(testAbsPath, 'utf8');
  assert.equal(restoredContent, originalContent);

  // 6. Rejects a fuzzy/partial needle even though it's a substring of a real
  // document's exact relPath -- proves saveDocument no longer resolves
  // through query-vault.mjs's fuzzy getDocument(). Regression test for the
  // save-path tightening (constraint.slideover.write-path-is-server-derived):
  // a caller (e.g. a future chat-driven action call) passing a title
  // fragment or partial path instead of an exact relPath must fail closed,
  // not silently resolve to -- and overwrite -- a different document.
  assert.throws(
    () => saveDocument('test-save-document-fixture.md', 'malicious overwrite attempt'),
    /Document not found/
  );
  assert.equal(
    readFileSync(testAbsPath, 'utf8'),
    originalContent,
    'fixture must be untouched by a fuzzy-needle save attempt'
  );

  console.log('save-document: all assertions passed');
} finally {
  if (existsSync(TEST_VAULT)) {
    rmSync(TEST_VAULT, { recursive: true, force: true });
  }
}
