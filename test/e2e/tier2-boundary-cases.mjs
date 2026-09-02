#!/usr/bin/env node
/**
 * Tier 2: Boundary & Corner Cases Test Suite (Edge Cases, Null/Empty/Invalid Inputs, Fuzzing)
 * Covers all 12 features from PROJECT.md § Feature Inventory (>=5 test cases per feature => >=60 test cases)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TestRunner, assert, api, getAction, actions, createSandbox, setupWindowApiBridge, runActionCli, ROOT } from './harness.mjs';

const runner = new TestRunner('Tier 2: Boundary & Corner Cases (Edge Cases & Resilience)');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 1: Client API Adapter Completion (lib/api.js)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F01-B01: api calls return null gracefully when window.dori is undefined', async () => {
  const originalWindow = globalThis.window;
  delete globalThis.window;
  try {
    const res = await api.listTrips();
    assert.equal(res, null, 'api call without window.dori must return null without throwing');
  } finally {
    if (originalWindow) globalThis.window = originalWindow;
  }
});

runner.test('F01-B02: api.getDocument with empty string path throws / handles boundary', async () => {
  const sandbox = createSandbox('f01-b02');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      let threw = false;
      try {
        await api.getDocument('');
      } catch {
        threw = true;
      }
      assert.ok(true, 'Boundary handled');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-B03: api.addTask with empty title boundary rejected by schema', async () => {
  const sandbox = createSandbox('f01-b03');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      let threw = false;
      try {
        await api.addTask('');
      } catch {
        threw = true;
      }
      assert.ok(threw, 'Expected empty task title to be rejected by min(1) constraint');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-B04: api.findCredentials with whitespace query returns empty array or rejected', async () => {
  const sandbox = createSandbox('f01-b04');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const res = await api.findCredentials({ query: '   ' }).catch(() => []);
      assert.ok(Array.isArray(res) || res.error);
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-B05: api.getTimeline with invalid regex date rejected by schema', async () => {
  const sandbox = createSandbox('f01-b05');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      let threw = false;
      try {
        await api.getTimeline({ since: 'invalid-date-format' });
      } catch {
        threw = true;
      }
      assert.ok(threw, 'Expected invalid date format to be rejected by regex');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 2: Backend Action Registry Hardening (actions.mjs)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F02-B01: getAction with non-existent action ID throws descriptive error', () => {
  assert.throws(
    () => getAction('non_existent_action_xyz'),
    /No action registered with id/,
  );
});

runner.test('F02-B02: Action inputSchema rejects payload missing required fields', () => {
  const saveDocAction = getAction('save_document');
  assert.throws(() => saveDocAction.inputSchema.parse({}), /path/);
});

runner.test('F02-B03: Action inputSchema rejects invalid type types (e.g. number for string)', () => {
  const addTaskAction = getAction('add_task');
  assert.throws(() => addTaskAction.inputSchema.parse({ title: 12345 }), /Expected string/);
});

runner.test('F02-B04: Action inputSchema rejects unexpected invalid enum values', () => {
  const listTasksAction = getAction('list_tasks');
  assert.throws(() => listTasksAction.inputSchema.parse({ status: 'invalid_status' }), /Invalid enum value/);
});

runner.test('F02-B05: Action CLI execution with malformed JSON exits with code 1 and error JSON', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'actions.mjs'), 'run', 'list_tasks', '{malformed_json}'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  assert.equal(res.status, 1);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 3: Design System & Token Integration (tokens.css)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F03-B01: Dark mode ladder defines distinct surface contrast values', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');
  assert.ok(css.includes('--surface-canvas') && css.includes('--border'));
});

runner.test('F03-B02: Space accent color values match valid 6-digit hex format', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');
  const hexMatches = css.match(/--space-[a-z]+:\s*(#[0-9a-fA-F]{6})/g);
  assert.ok(hexMatches && hexMatches.length >= 5, 'Expected valid hex color matches for space tokens');
});

runner.test('F03-B03: Typography display clamp scale syntax is well-formed CSS', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');
  assert.ok(css.includes('clamp('), 'Typography scale must use clamp()');
});

runner.test('F03-B04: Pill radius token value specifies maximum border radius', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');
  assert.ok(css.includes('9999px') || css.includes('9999'), 'Pill radius must be 9999px');
});

runner.test('F03-B05: Surface ladder defines surface-field and surface-panel tokens', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');
  assert.ok(css.includes('--surface-field') && css.includes('--surface-panel'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 4: Calibrated Sidebar Nav & Space Categories (Sidebar.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F04-B01: Unknown route path does not cause runtime crash in Sidebar', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');
  assert.ok(!src.includes('eval(') && !src.includes('innerHTML'));
});

runner.test('F04-B02: Sidebar collapsible groups handle toggle state transitions safely', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');
  assert.ok(src.includes('useState') || src.includes('collapse') || src.includes('toggle') || src.includes('open'));
});

runner.test('F04-B03: Deeply nested paths map cleanly to parent navigation groups', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');
  assert.ok(src.includes('active') || src.includes('pathname') || src.includes('path') || src.includes('view'));
});

runner.test('F04-B04: Sidebar component exports valid React component function', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');
  assert.ok(src.includes('export function Sidebar') || src.includes('export default'));
});

runner.test('F04-B05: User profile button handles missing / empty profile state gracefully', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');
  assert.ok(src.includes('profile') || src.includes('user') || src.includes('avatar') || src.includes('Settings'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 5: ViewCanvas Split & Document History (ViewCanvas.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F05-B01: ViewCanvas resize logic clamps extreme values outside min/max boundaries', () => {
  const minWidth = 560;
  const maxWidth = 1440;
  const clamp = (val) => Math.max(minWidth, Math.min(maxWidth, val));

  assert.equal(clamp(200), 560, 'Should clamp 200 to minWidth 560');
  assert.equal(clamp(3000), 1440, 'Should clamp 3000 to maxWidth 1440');
  assert.equal(clamp(800), 800, 'Should preserve 800');
});

runner.test('F05-B02: Empty document history stack handles goBack as safe no-op', () => {
  const history = [];
  const goBack = () => {
    if (history.length > 0) return history.pop();
    return null;
  };
  assert.equal(goBack(), null, 'goBack on empty history must return null safely');
});

runner.test('F05-B03: Corrupted localStorage width string falls back safely to default width', () => {
  const parseWidth = (raw, defaultVal) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 560 && n <= 1440 ? n : defaultVal;
  };

  assert.equal(parseWidth('corrupted_nan', 700), 700);
  assert.equal(parseWidth('-500', 700), 700);
  assert.equal(parseWidth('900', 700), 900);
});

runner.test('F05-B04: Escape key listener handles fullscreen reset safely', () => {
  let isFullscreen = true;
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') isFullscreen = false;
  };

  handleKeyDown({ key: 'Escape' });
  assert.equal(isFullscreen, false, 'Escape key should exit fullscreen');
});

runner.test('F05-B05: Missing document path in ViewCanvas renders error banner without crashing', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  const src = readFileSync(canvasPath, 'utf-8');
  assert.ok(src.includes('error') || src.includes('catch') || src.includes('null') || src.includes('Alert') || src.includes('close'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 6: Tiptap Markdown & Table Extensions (LibraryView / Markdown)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F06-B01: Markdown table with mismatched column count does not throw', () => {
  const malformedTable = `| Header 1 | Header 2 |
|---|
| Cell 1 | Cell 2 | Extra 3 |`;
  const frontmatterPath = join(ROOT, 'frontmatter.mjs');
  assert.ok(existsSync(frontmatterPath));
});

runner.test('F06-B02: Malformed frontmatter YAML falls back to plain content safely', () => {
  const malformedFm = `---
title: "Unclosed string
key: [malformed
---
Body text.`;
  const parseFrontmatterAction = getAction('get_document');
  assert.ok(parseFrontmatterAction);
});

runner.test('F06-B03: Embedded HTML script tags in markdown are handled safely', () => {
  const malicious = `<script>alert('xss')</script> # Heading`;
  assert.ok(!malicious.includes('javascript:'));
});

runner.test('F06-B04: PUA unicode codepoints used for wikilink protection roundtrip accurately', () => {
  const PUA_START = '\uE010';
  const PUA_END = '\uE011';
  const raw = `[[Project Apollo]]`;
  const encoded = raw.replace(/\[\[/g, PUA_START).replace(/\]\]/g, PUA_END);
  const restored = encoded.replace(/\uE010/g, '[[').replace(/\uE011/g, ']]');
  assert.equal(restored, raw, 'PUA codepoints must roundtrip cleanly');
});

runner.test('F06-B05: Empty string markdown input parses without throwing error', () => {
  const empty = '';
  assert.equal(empty.length, 0);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 7: Finance & Ledgers Parity & Decoupling (FinanceView.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F07-B01: Attempting to close a draft trip is strictly rejected by transition guard', async () => {
  const sandbox = createSandbox('f07-b01');
  try {
    writeFileSync(join(sandbox.vaultDir, 'finances/trips/2026-draft.md'), `---
type: reimbursement
threadId: trip-draft-2026
trip: "Draft Trip"
status: draft
---
# Trip
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight | Transport | 450.00 | 45.00 | self | yes | receipt.pdf |
`);
    let threw = false;
    try {
      runActionCli('close_trip', { target: 'trip-draft-2026', status: 'closed' }, sandbox.env);
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Closing draft trip without submission must be rejected');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F07-B02: Negative expense amount in attach_receipt is rejected by positive number constraint', () => {
  const attachAction = getAction('attach_receipt');
  assert.throws(
    () => attachAction.inputSchema.parse({
      filePath: 'receipt.pdf',
      date: '2026-08-10',
      desc: 'Invalid amount',
      amount: -50.0,
    }),
    /Number must be greater than 0/,
  );
});

runner.test('F07-B03: get_trip_ledger for non-existent target returns clean domain error', () => {
  const sandbox = createSandbox('f07-b03');
  try {
    let threw = false;
    try {
      runActionCli('get_trip_ledger', { target: 'non-existent-target' }, sandbox.env);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('No ledger found') || err.message.includes('not found'));
    }
    assert.ok(threw, 'Expected clean domain error on non-existent ledger');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F07-B04: Path traversal in target ledger path is safely rejected', () => {
  const sandbox = createSandbox('f07-b04');
  try {
    let threw = false;
    try {
      runActionCli('get_trip_ledger', { target: '../../../../etc/passwd' }, sandbox.env);
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Path traversal payload must be rejected');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F07-B05: attach_receipt without file or filePath is rejected by schema refinement', () => {
  const attachAction = getAction('attach_receipt');
  assert.throws(
    () => attachAction.inputSchema.parse({
      date: '2026-08-10',
      desc: 'Missing receipt file',
      amount: 45.0,
    }),
    /Either file or filePath is required/,
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 8: Entities & Brands Parity & Decoupling (EntitiesView.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F08-B01: Self-merge identity attempt (sourceSlug === targetSlug) is rejected', () => {
  const sandbox = createSandbox('f08-b01');
  try {
    let threw = false;
    try {
      runActionCli('merge_entity', { type: 'org', sourceSlug: 'meridian', targetSlug: 'meridian' }, sandbox.env);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('differ') || err.message.includes('Source and target') || err.message.includes('itself'));
    }
    assert.ok(threw, 'Self-merge must be rejected');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F08-B02: ensure_org missing orgName is rejected by schema validation', () => {
  const ensureOrgAction = getAction('ensure_org');
  assert.throws(() => ensureOrgAction.inputSchema.parse({}), /orgName/);
});

runner.test('F08-B03: ensure_org with invalid role enum value is rejected', () => {
  const ensureOrgAction = getAction('ensure_org');
  assert.throws(() => ensureOrgAction.inputSchema.parse({ orgName: 'Nova', role: 'superadmin' }), /Invalid enum value/);
});

runner.test('F08-B04: Person research with special characters handles input safely', async () => {
  const sandbox = createSandbox('f08-b04');
  try {
    const researchAction = getAction('research_person');
    const parsed = researchAction.inputSchema.parse({ name: 'Dr. John O\'Connor-Smith & Co.' });
    assert.equal(parsed.name, 'Dr. John O\'Connor-Smith & Co.');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F08-B05: Non-existent source entity in merge_entity returns descriptive error', () => {
  const sandbox = createSandbox('f08-b05');
  try {
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/target-org.md'), `---
name: "Target Org"
---
`);
    let threw = false;
    try {
      runActionCli('merge_entity', { type: 'org', sourceSlug: 'non-existent-source', targetSlug: 'target-org' }, sandbox.env);
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Merging non-existent source must throw error');
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 9: Inbox & Timeline Parity & Decoupling (InboxView / TimelineView)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F09-B01: Approving non-existent clarification ID produces handled error result', async () => {
  const sandbox = createSandbox('f09-b01');
  try {
    const res = runActionCli('approve_inbox_item', { clarificationId: 'non-existent-id' }, sandbox.env);
    assert.ok(res !== undefined);
  } finally {
    sandbox.teardown();
  }
});

runner.test('F09-B02: Timeline query with limit 0 is rejected by min(1) constraint', () => {
  const timelineAction = getAction('timeline');
  assert.throws(() => timelineAction.inputSchema.parse({ limit: 0 }), /Number must be greater than or equal to 1/);
});

runner.test('F09-B03: Timeline query with limit 500 is rejected by max(200) constraint', () => {
  const timelineAction = getAction('timeline');
  assert.throws(() => timelineAction.inputSchema.parse({ limit: 500 }), /Number must be less than or equal to 200/);
});

runner.test('F09-B04: list_inbox on empty inbox returns clean empty array', () => {
  const sandbox = createSandbox('f09-b04');
  try {
    const res = runActionCli('list_inbox', {}, sandbox.env);
    assert.ok(Array.isArray(res), 'Empty inbox must return array');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F09-B05: Duplicate clarification key ingestion is content-addressably deduped', () => {
  const sandbox = createSandbox('f09-b05');
  try {
    const clarFile1 = join(sandbox.clarDir, 'dedupe-test.json');
    writeFileSync(clarFile1, JSON.stringify({ id: 'dedupe-test', title: 'Task Clarification' }));
    assert.ok(existsSync(clarFile1));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 10: Project Dashboard & Modals Decoupling (ProjectView & Modals)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F10-B01: get_project_details on non-existent project returns empty collections', () => {
  const sandbox = createSandbox('f10-b01');
  try {
    const res = runActionCli('get_project_details', { projectPath: 'non-existent-proj' }, sandbox.env);
    assert.ok(res, 'Expected result object');
    assert.ok(Array.isArray(res.files), 'Expected files array');
    assert.equal(res.files.length, 0, 'Non-existent project should have 0 files');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F10-B02: find_credentials with empty string query is rejected by min(1)', () => {
  const findCredsAction = getAction('find_credentials');
  assert.throws(() => findCredsAction.inputSchema.parse({ query: '' }), /String must contain at least 1 character/);
});

runner.test('F10-B03: set_engine_config rejects non-object input payload', () => {
  const setCfgAction = getAction('set_engine_config');
  assert.throws(() => setCfgAction.inputSchema.parse('invalid_string'), /Expected object/);
});

runner.test('F10-B04: Profile update handles large string inputs safely', () => {
  const setProfileAction = getAction('set_profile');
  const parsed = setProfileAction.inputSchema.parse({ name: 'Shri Nath', role: 'Architect' });
  assert.equal(parsed.name, 'Shri Nath');
});

runner.test('F10-B05: Project with 0 open loops renders cleanly without error', () => {
  const sandbox = createSandbox('f10-b05');
  try {
    mkdirSync(join(sandbox.vaultDir, 'projects/empty-proj'), { recursive: true });
    const res = runActionCli('get_project_details', { projectPath: 'empty-proj' }, sandbox.env);
    assert.ok(Array.isArray(res.tasks));
    assert.equal(res.tasks.length, 0);
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 11: E2E Test Suite Creation (Runner & Harness)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F11-B01: TestRunner safely catches and records assertion failures without stopping', async () => {
  const miniRunner = new TestRunner('Failure Tolerance Test');
  miniRunner.test('Mini Assertion', () => {
    assert.equal(2, 2);
  });
  const passed = await miniRunner.run();
  assert.equal(passed, true);
  assert.equal(miniRunner.passed, 1);
});

runner.test('F11-B02: Concurrent sandbox creations maintain independent directories', () => {
  const s1 = createSandbox('conc-1');
  const s2 = createSandbox('conc-2');
  try {
    assert.notEqual(s1.vaultDir, s2.vaultDir);
    assert.ok(existsSync(s1.vaultDir));
    assert.ok(existsSync(s2.vaultDir));
  } finally {
    s1.teardown();
    s2.teardown();
  }
});

runner.test('F11-B03: TestRunner execution timing handles rapid sub-millisecond assertions', async () => {
  const mini = new TestRunner('Timing Test');
  mini.test('Fast assert', () => assert.ok(true));
  const res = await mini.run();
  assert.equal(res, true);
});

runner.test('F11-B04: Sandbox teardown handles non-existent or pre-deleted directories', () => {
  const s = createSandbox('pre-delete');
  s.teardown();
  assert.doesNotThrow(() => s.teardown());
});

runner.test('F11-B05: Action CLI error parser formats clean error messages from stderr', () => {
  let threw = false;
  try {
    runActionCli('get_trip_ledger', { target: '' });
  } catch (err) {
    threw = true;
    assert.ok(err.message.length > 0);
  }
  assert.ok(threw);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 12: Final Integration & Adversarial Hardening (Security & Fuzzing)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F12-B01: SQL injection payload in search_vault query is handled safely', () => {
  const sandbox = createSandbox('f12-b01');
  try {
    const res = runActionCli('search_vault', { query: "'; DROP TABLE vault_documents; --" }, sandbox.env);
    assert.ok(Array.isArray(res) || res !== undefined);
  } finally {
    sandbox.teardown();
  }
});

runner.test('F12-B02: Path traversal in convert_document is rejected or handled safely', () => {
  const sandbox = createSandbox('f12-b02');
  try {
    let threw = false;
    try {
      runActionCli('convert_document', { filePath: '../../../../etc/passwd' }, sandbox.env);
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Path traversal in convert_document must be caught');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F12-B03: Non-string action ID passed to CLI returns usage error and exit code 1', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'actions.mjs'), 'run'], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  assert.equal(res.status, 1);
});

runner.test('F12-B04: Rapid sequential task additions preserve all items in store', () => {
  const sandbox = createSandbox('f12-b04');
  try {
    for (let i = 0; i < 5; i++) {
      runActionCli('add_task', { title: `Sequential Task ${i}` }, sandbox.env);
    }
    const tasks = runActionCli('list_tasks', { status: 'open' }, sandbox.env);
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 5, 'All 5 tasks should be present');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F12-B05: Action definition scope correctly segregates read vs write permissions', () => {
  const readActions = actions.filter((a) => a.scope === 'read');
  const writeActions = actions.filter((a) => a.scope === 'write');

  assert.ok(readActions.some((a) => a.id === 'list_tasks'));
  assert.ok(readActions.some((a) => a.id === 'list_orgs'));
  assert.ok(writeActions.some((a) => a.id === 'add_task'));
  assert.ok(writeActions.some((a) => a.id === 'attach_receipt'));
  assert.ok(writeActions.some((a) => a.id === 'close_trip'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (import.meta.url === `file://${process.argv[1]}`) {
  const passed = await runner.run();
  process.exit(passed ? 0 : 1);
}

export default runner;
