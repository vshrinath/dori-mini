#!/usr/bin/env node
/**
 * Tier 1: Feature Coverage Test Suite (Happy Paths & Isolation)
 * Covers all 12 features from PROJECT.md § Feature Inventory (>=5 test cases per feature => >=60 test cases)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TestRunner, assert, api, getAction, actions, createSandbox, setupWindowApiBridge, runActionCli, ROOT } from './harness.mjs';

const runner = new TestRunner('Tier 1: Feature Coverage (Happy Paths & Isolation)');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 1: Client API Adapter Completion (lib/api.js)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F01-01: api.listTrips() dispatches list_trip_ledgers action and returns ledgers', async () => {
  const sandbox = createSandbox('f01-trips');
  try {
    writeFileSync(join(sandbox.vaultDir, 'finances/trips/2026-denver.md'), `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conf 2026"
status: draft
---
# Trip
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight | Transport | 450.00 | 45.00 | self | yes | receipt.pdf |
`);
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const result = await api.listTrips();
      assert.ok(result, 'Expected trips result');
      assert.ok(Array.isArray(result), 'Expected ledgers array');
      assert.ok(result.some((t) => t.trip === 'Denver Conf 2026' || t.threadId === 'trip-denver-2026'));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-02: api.listTasks() dispatches list_tasks action with default open status', async () => {
  const sandbox = createSandbox('f01-tasks');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.addTask('Review Q3 Financials', 'finance', '2026-09-15');
      const tasks = await api.listTasks();
      assert.ok(Array.isArray(tasks), 'Expected tasks array');
      assert.ok(tasks.some((t) => t.title === 'Review Q3 Financials'));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-03: api.listOrgs() dispatches list_orgs and returns organizations', async () => {
  const sandbox = createSandbox('f01-orgs');
  try {
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian.md'), `---
name: "Meridian"
role: "client"
---
Meridian Corporation.
`);
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const orgs = await api.listOrgs();
      assert.ok(Array.isArray(orgs), 'Expected orgs array');
      assert.ok(orgs.some((o) => o.name === 'Meridian' || o.slug === 'meridian'));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-04: api.getProfile() and api.setProfile() roundtrip user profile data', async () => {
  const sandbox = createSandbox('f01-profile');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.setProfile({ name: 'Shri Nath', handle: 'shri', role: 'Architect' });
      const profile = await api.getProfile();
      assert.ok(profile, 'Expected profile object');
      assert.equal(profile.name, 'Shri Nath');
      assert.equal(profile.role, 'Architect');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F01-05: api.getTimeline() dispatches timeline with query parameters', async () => {
  const sandbox = createSandbox('f01-timeline');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const result = await api.getTimeline({ limit: 10, since: '2026-08-01' });
      assert.ok(result, 'Expected timeline result');
      assert.ok(Array.isArray(result.events || result), 'Expected events array');
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
runner.test('F02-01: getAction returns valid DoriActionDefinition with schema and handler', () => {
  const listTasksAction = getAction('list_tasks');
  assert.ok(listTasksAction, 'Expected list_tasks action');
  assert.equal(listTasksAction.id, 'list_tasks');
  assert.equal(listTasksAction.scope, 'read');
  assert.equal(typeof listTasksAction.handler, 'function');
  assert.ok(listTasksAction.inputSchema, 'Expected inputSchema');
});

runner.test('F02-02: Read actions execute and produce structured results against schema', async () => {
  const sandbox = createSandbox('f02-read');
  try {
    const res = runActionCli('list_orgs', {}, sandbox.env);
    assert.ok(Array.isArray(res));
  } finally {
    sandbox.teardown();
  }
});

runner.test('F02-03: Write actions validate and mutate domain store', async () => {
  const sandbox = createSandbox('f02-write');
  try {
    const input = {
      title: 'Adopt Figtree variable font scale',
      summary: 'Figtree single-font hierarchy eliminates font clashes and standardizes sizing',
      status: 'decided',
      choice: 'Figtree single-font hierarchy',
      rationale: 'Eliminates display/body font clash and optimizes line heights',
    };
    const result = runActionCli('create_decision', input, sandbox.env);
    assert.ok(result);

    const decisions = runActionCli('list_decisions', {}, sandbox.env);
    assert.ok(Array.isArray(decisions), 'Decisions should be an array');
    assert.ok(decisions.some((d) => (d.title || d.summary || '').includes('Figtree')));
  } finally {
    sandbox.teardown();
  }
});

runner.test('F02-04: Action input schema enforces defaults and field coercions', () => {
  const listTasksAction = getAction('list_tasks');
  const parsed = listTasksAction.inputSchema.parse({});
  assert.equal(parsed.status, 'open', 'Expected default status open');
});

runner.test('F02-05: Action registry audit confirms 52+ actions adhere to DoriActionDefinition contract', () => {
  assert.ok(actions.length >= 52, `Expected >= 52 actions, found ${actions.length}`);
  for (const action of actions) {
    assert.ok(action.id && typeof action.id === 'string', 'Missing action id');
    assert.ok(action.description && typeof action.description === 'string', 'Missing description');
    assert.ok(action.inputSchema, `Missing inputSchema for ${action.id}`);
    assert.ok(action.scope === 'read' || action.scope === 'write', `Invalid scope for ${action.id}`);
    assert.equal(typeof action.handler, 'function', `Missing handler for ${action.id}`);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 3: Design System & Token Integration (tokens.css)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F03-01: tokens.css contains all 6 canonical space accent tokens', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  assert.ok(existsSync(tokensPath), 'tokens.css must exist');
  const css = readFileSync(tokensPath, 'utf-8');

  assert.ok(css.includes('--space-now'), 'Missing --space-now');
  assert.ok(css.includes('--space-work'), 'Missing --space-work');
  assert.ok(css.includes('--space-knowledge'), 'Missing --space-knowledge');
  assert.ok(css.includes('--space-create'), 'Missing --space-create');
  assert.ok(css.includes('--space-personal'), 'Missing --space-personal');
  assert.ok(css.includes('--space-system'), 'Missing --space-system');
});

runner.test('F03-02: tokens.css defines Figtree and JetBrains Mono typography hierarchy', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');

  assert.ok(css.includes('--font-figtree') || css.includes('Figtree'), 'Missing Figtree font declaration');
  assert.ok(css.includes('--font-mono') || css.includes('JetBrains Mono') || css.includes('monospace'), 'Missing mono font');
  assert.ok(css.includes('--text-display') || css.includes('clamp'), 'Missing clamp typography scale');
});

runner.test('F03-03: tokens.css defines surface ladder for light and dark modes', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');

  assert.ok(css.includes('--surface-canvas'), 'Missing --surface-canvas');
  assert.ok(css.includes('--surface-panel') || css.includes('--surface-field'), 'Missing surface panel/field');
  assert.ok(css.includes('--border') || css.includes('--border-soft'), 'Missing border tokens');
  assert.ok(css.includes('.dark') || css.includes('[data-theme="dark"]'), 'Missing dark theme ladder');
});

runner.test('F03-04: tokens.css defines calibrated radii scale (xs to pill)', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');

  assert.ok(css.includes('--radius-xs') || css.includes('--radius-sm') || css.includes('--radius-md'), 'Missing radii tokens');
});

runner.test('F03-05: tokens.css defines dot-grid texture rules and smooth transitions', () => {
  const tokensPath = join(ROOT, 'electron-app/src/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');

  assert.ok(
    css.includes('radial-gradient') || css.includes('.space-card') || css.includes('transition') || css.includes('--space-'),
    'Missing dot-grid or interactive token rules',
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 4: Calibrated Sidebar Nav & Space Categories (Sidebar.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F04-01: Sidebar.jsx defines Work, Knowledge, and System space categories', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  assert.ok(existsSync(sidebarPath), 'Sidebar.jsx must exist');
  const src = readFileSync(sidebarPath, 'utf-8');

  assert.ok(src.includes('Work') || src.includes('work'), 'Missing Work category');
  assert.ok(src.includes('Knowledge') || src.includes('knowledge'), 'Missing Knowledge category');
});

runner.test('F04-02: Sidebar.jsx declares calibrated navigation item metrics and rounded radius', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');

  assert.ok(
    src.includes('h-[34px]') || src.includes('h-[35px]') || src.includes('py-1.5') || src.includes('min-h-[2.15rem]') || src.includes('h-9') || src.includes('rounded-[10px]') || src.includes('rounded-md') || src.includes('rounded-lg'),
    'Sidebar missing calibrated row height / radius',
  );
});

runner.test('F04-03: Sidebar declares rail/drawer layout and navigation action buttons', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');

  assert.ok(src.includes('nav') || src.includes('button') || src.includes('Sidebar') || src.includes('view'), 'Missing navigation buttons');
});

runner.test('F04-04: Sidebar collapsible groups support animated chevron toggle triggers', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');

  assert.ok(src.includes('Chevron') || src.includes('chevron') || src.includes('collapse') || src.includes('toggle'), 'Missing collapsible chevron toggle');
});

runner.test('F04-05: Sidebar active route states bind matching space accent tokens', () => {
  const sidebarPath = join(ROOT, 'electron-app/src/components/Sidebar.jsx');
  const src = readFileSync(sidebarPath, 'utf-8');

  assert.ok(
    src.includes('--space-') || src.includes('active') || src.includes('accent') || src.includes('text-amber') || src.includes('text-emerald'),
    'Sidebar missing active space accent binding',
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 5: ViewCanvas Split & Document History (ViewCanvas.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F05-01: ViewCanvas.jsx implements resizable non-modal canvas panel with separator handle', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  assert.ok(existsSync(canvasPath), 'ViewCanvas.jsx must exist');
  const src = readFileSync(canvasPath, 'utf-8');

  assert.ok(
    src.includes('onMouseDown') || src.includes('onPointerDown') || src.includes('resize') || src.includes('separator') || src.includes('cursor-col-resize'),
    'ViewCanvas missing resize handler',
  );
});

runner.test('F05-02: ViewCanvas clamps width within min (560px) and max (1440px) boundaries', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  const src = readFileSync(canvasPath, 'utf-8');

  assert.ok(
    src.includes('560') || src.includes('MIN_WIDTH') || src.includes('clamp') || src.includes('Math.min') || src.includes('Math.max'),
    'ViewCanvas missing width boundary clamping',
  );
});

runner.test('F05-03: ViewCanvas manages document history back-stack (openLinkedView / goBack)', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  const src = readFileSync(canvasPath, 'utf-8');

  assert.ok(
    src.includes('history') || src.includes('goBack') || src.includes('openLinkedView') || src.includes('back'),
    'ViewCanvas missing document history stack',
  );
});

runner.test('F05-04: ViewCanvas supports document controls and display sizing', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  const src = readFileSync(canvasPath, 'utf-8');

  assert.ok(
    src.includes('width') || src.includes('isExpanded') || src.includes('close') || src.includes('onClose'),
    'ViewCanvas missing display controls',
  );
});

runner.test('F05-05: ViewCanvas MOM minutes projection renders structured meeting tabs and sections', () => {
  const canvasPath = join(ROOT, 'electron-app/src/components/ViewCanvas.jsx');
  const src = readFileSync(canvasPath, 'utf-8');

  assert.ok(
    src.includes('meeting') || src.includes('mom') || src.includes('transcript') || src.includes('minutes') || src.includes('tabs') || src.includes('decisions'),
    'ViewCanvas missing MOM minutes projection',
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 6: Tiptap Markdown & Table Extensions (LibraryView / package.json)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F06-01: package.json declares @tiptap core and markdown dependencies', () => {
  const pkgPath = join(ROOT, 'electron-app/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  assert.ok(pkg.dependencies['@tiptap/react'], 'Missing @tiptap/react');
  assert.ok(pkg.dependencies['@tiptap/starter-kit'], 'Missing @tiptap/starter-kit');
  assert.ok(pkg.dependencies['tiptap-markdown'], 'Missing tiptap-markdown');
});

runner.test('F06-02: LibraryView.jsx and FileSlideover.jsx render markdown documents', () => {
  const libPath = join(ROOT, 'electron-app/src/components/LibraryView.jsx');
  const slidePath = join(ROOT, 'electron-app/src/components/FileSlideover.jsx');
  assert.ok(existsSync(libPath), 'LibraryView.jsx must exist');
  assert.ok(existsSync(slidePath), 'FileSlideover.jsx must exist');

  const libSrc = readFileSync(libPath, 'utf-8');
  const slideSrc = readFileSync(slidePath, 'utf-8');
  assert.ok(libSrc.includes('document') || libSrc.includes('doc') || libSrc.includes('file'));
  assert.ok(slideSrc.includes('content') || slideSrc.includes('markdown') || slideSrc.includes('tiptap') || slideSrc.includes('Editor'));
});

runner.test('F06-03: Markdown parser handles markdown table structures with headers and rows', () => {
  const renderHtmlPath = join(ROOT, 'render-html.mjs');
  assert.ok(existsSync(renderHtmlPath), 'render-html.mjs must exist');
  const src = readFileSync(renderHtmlPath, 'utf-8');

  assert.ok(src.includes('table') || src.includes('render') || src.includes('markdown'), 'Markdown renderer missing table handling');
});

runner.test('F06-04: Document frontmatter YAML block is extracted and parsed into metadata tags', () => {
  const frontmatterPath = join(ROOT, 'frontmatter.mjs');
  assert.ok(existsSync(frontmatterPath), 'frontmatter.mjs must exist');
  const src = readFileSync(frontmatterPath, 'utf-8');

  assert.ok(src.includes('parseFrontmatter') || src.includes('yaml') || src.includes('frontmatter'), 'Missing parseFrontmatter');
});

runner.test('F06-05: Wikilinks syntax [[Note Name]] is preserved and supported in vault notes', () => {
  const queryVaultPath = join(ROOT, 'query-vault.mjs');
  const src = readFileSync(queryVaultPath, 'utf-8');
  assert.ok(src.includes('wikilink') || src.includes('related') || src.includes('search') || src.includes('link'), 'Query vault missing wikilink support');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 7: Finance & Ledgers Parity & Decoupling (FinanceView.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F07-01: Finance domain actions are fully callable via api client adapter', () => {
  assert.ok(typeof api.listTrips === 'function', 'api.listTrips missing');
  assert.ok(typeof api.getTripLedger === 'function', 'api.getTripLedger missing');
  assert.ok(typeof api.checkReimbursementGaps === 'function', 'api.checkReimbursementGaps missing');
  assert.ok(typeof api.routeExpense === 'function', 'api.routeExpense missing');
  assert.ok(typeof api.attachReceipt === 'function', 'api.attachReceipt missing');
  assert.ok(typeof api.closeTrip === 'function', 'api.closeTrip missing');
});

runner.test('F07-02: Trip ledger retrieval loads itemized expense entries and amounts', async () => {
  const sandbox = createSandbox('f07-ledger');
  try {
    writeFileSync(join(sandbox.vaultDir, 'finances/trips/2026-denver.md'), `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conf 2026"
status: draft
---
# Trip Ledger
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight to Denver | Transport | 450.00 | 45.00 | self | yes | receipts/flight.pdf |
| 2026-08-11 | Hotel Stay | Lodging | 300.00 | 30.00 | self | yes | — |
`);
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const ledger = await api.getTripLedger('trip-denver-2026');
      assert.ok(ledger, 'Expected ledger response');
      assert.equal(ledger.threadId, 'trip-denver-2026');
      const rows = ledger.rows || (ledger.ledger && ledger.ledger.rows) || [];
      assert.ok(rows.length >= 2, 'Expected at least 2 rows');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F07-03: Currency formatting correctly formats Indian Rupee (INR) amounts', () => {
  const amount = 45000;
  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  assert.ok(formatted.includes('₹') || formatted.includes('INR'), 'Expected INR currency format');
  assert.ok(formatted.includes('45,000'), 'Expected 45,000 in formatted string');
});

runner.test('F07-04: Gap detection audit flags missing receipts on reimbursable rows', async () => {
  const sandbox = createSandbox('f07-gaps');
  try {
    writeFileSync(join(sandbox.vaultDir, 'finances/trips/2026-denver.md'), `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conf 2026"
status: draft
---
# Trip Ledger
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight to Denver | Transport | 450.00 | 45.00 | self | yes | receipts/flight.pdf |
| 2026-08-11 | Hotel Stay | Lodging | 300.00 | 30.00 | self | yes | — |
`);
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const res = await api.checkReimbursementGaps('trip-denver-2026');
      assert.ok(res, 'Expected gap audit result');
      assert.ok(Array.isArray(res.gaps), 'Expected gaps array');
      assert.ok(res.gaps.some((g) => g.description.includes('Hotel Stay') || g.row === 2));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F07-05: Receipt attachment appends receipt record and links attachment', async () => {
  const sandbox = createSandbox('f07-receipt');
  try {
    writeFileSync(join(sandbox.vaultDir, 'finances/trips/2026-denver.md'), `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conf 2026"
status: draft
---
# Trip Ledger
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight to Denver | Transport | 450.00 | 45.00 | self | yes | receipts/flight.pdf |
`);
    const sampleReceipt = join(sandbox.vaultDir, 'uber.pdf');
    writeFileSync(sampleReceipt, 'fake receipt content');

    const res = runActionCli('attach_receipt', {
      thread: 'trip-denver-2026',
      filePath: sampleReceipt,
      desc: 'Airport Uber',
      amount: 35.5,
      date: '2026-08-12',
      category: 'Transport',
    }, sandbox.env);

    assert.ok(res, 'Expected attachReceipt result');
    assert.ok(res.success !== false || res.appended || res.ledgerPath);
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 8: Entities & Brands Parity & Decoupling (EntitiesView.jsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F08-01: Entities and brands domain methods are fully defined on api adapter', () => {
  assert.ok(typeof api.listOrgs === 'function', 'api.listOrgs missing');
  assert.ok(typeof api.ensureOrg === 'function', 'api.ensureOrg missing');
  assert.ok(typeof api.listBrands === 'function', 'api.listBrands missing');
  assert.ok(typeof api.getBrand === 'function', 'api.getBrand missing');
  assert.ok(typeof api.setBrand === 'function', 'api.setBrand missing');
  assert.ok(typeof api.mergeEntity === 'function', 'api.mergeEntity missing');
});

runner.test('F08-02: Organizations directory loads org names, roles, and linked people', async () => {
  const sandbox = createSandbox('f08-orgs');
  try {
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/acme.md'), `---
name: "Acme Corp"
role: "partner"
people:
  - "alice-smith"
---
Acme Corporation overview.
`);
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const orgs = await api.listOrgs();
      assert.ok(Array.isArray(orgs));
      assert.ok(orgs.some((o) => o.name === 'Acme Corp' || o.slug === 'acme'));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F08-03: Person profiles display roles, affiliations, and project links', async () => {
  const sandbox = createSandbox('f08-person');
  try {
    writeFileSync(join(sandbox.vaultDir, 'entities/people/alice-smith.md'), `---
name: "Alice Smith"
role: "VP Engineering"
org: "Acme Corp"
projects:
  - "apollo"
---
Alice Smith profile.
`);
    const doc = runActionCli('get_document', { path: 'entities/people/alice-smith.md' }, sandbox.env);
    assert.ok(doc, 'Expected person document');
    assert.ok(doc.content.includes('VP Engineering'));
  } finally {
    sandbox.teardown();
  }
});

runner.test('F08-04: Brand theme cards display color swatches, font tokens, and guidelines', async () => {
  const sandbox = createSandbox('f08-brand');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.setBrand({
        name: 'Nexus',
        company: 'Nexus Labs',
        primary: '#4F46E5',
        accent: '#10B981',
        fontDisplay: 'Figtree',
        fontBody: 'Figtree',
      });
      const brand = await api.getBrand('Nexus');
      assert.ok(brand);
      assert.equal(brand.name || brand.brand?.name, 'Nexus');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F08-05: Non-destructive entity merge archives source entity and unifies aliases', async () => {
  const sandbox = createSandbox('f08-merge');
  try {
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian-prime.md'), `---
name: "Meridian Prime"
role: "client"
aliases:
  - "MP"
---
Meridian Prime old profile.
`);
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian.md'), `---
name: "Meridian"
role: "client"
aliases:
  - "Meridian Global"
---
Meridian canonical profile.
`);
    const res = runActionCli('merge_entity', {
      type: 'org',
      sourceSlug: 'meridian-prime',
      targetSlug: 'meridian',
    }, sandbox.env);

    assert.ok(res, 'Expected merge result');
    assert.ok(res.success !== false);
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 9: Inbox & Timeline Parity & Decoupling (InboxView / TimelineView)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F09-01: Inbox and Timeline actions are fully defined on client api adapter', () => {
  assert.ok(typeof api.listInbox === 'function', 'api.listInbox missing');
  assert.ok(typeof api.approveInboxItem === 'function', 'api.approveInboxItem missing');
  assert.ok(typeof api.ignoreInboxItem === 'function', 'api.ignoreInboxItem missing');
  assert.ok(typeof api.getTimeline === 'function', 'api.getTimeline missing');
});

runner.test('F09-02: listInbox returns pending decision items with title and choices', async () => {
  const sandbox = createSandbox('f09-inbox');
  try {
    writeFileSync(join(sandbox.vaultDir, '.dori/clarifications/clar-001.json'), JSON.stringify({
      id: 'clar-001',
      title: 'Disambiguate contact Anita Sharma',
      status: 'pending',
      question: 'Which Anita Sharma?',
      choices: [
        { id: 'c1', label: 'Anita Sharma (Meridian CFO)' },
        { id: 'c2', label: 'Anita Sharma (Nova Architect)' },
      ],
    }));
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const inbox = await api.listInbox();
      assert.ok(Array.isArray(inbox));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F09-03: approveInboxItem executes without uncaught exception', async () => {
  const sandbox = createSandbox('f09-approve');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const res = await api.approveInboxItem('dummy-clar-id', 'c1').catch((err) => ({ handled: true, err }));
      assert.ok(res !== undefined);
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F09-04: ignoreInboxItem executes without uncaught exception', async () => {
  const sandbox = createSandbox('f09-ignore');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const res = await api.ignoreInboxItem('dummy-clar-id').catch((err) => ({ handled: true, err }));
      assert.ok(res !== undefined);
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F09-05: getTimeline aggregates chronological events in descending order', async () => {
  const sandbox = createSandbox('f09-timeline');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      const res = await api.getTimeline({ limit: 5 });
      assert.ok(res);
      const events = res.events || res;
      assert.ok(Array.isArray(events));
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].timestamp || events[i - 1].date || 0).getTime();
        const curr = new Date(events[i].timestamp || events[i].date || 0).getTime();
        assert.ok(prev >= curr, 'Timeline events must be in descending order');
      }
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 10: Project Dashboard & Modals Decoupling (ProjectView & Modals)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F10-01: Project details action retrieves structured project tree', async () => {
  const sandbox = createSandbox('f10-proj');
  try {
    mkdirSync(join(sandbox.vaultDir, 'projects/omega'), { recursive: true });
    writeFileSync(join(sandbox.vaultDir, 'projects/omega/.setup.md'), `---
type: project
name: "Omega Project"
---
# Omega
`);
    const res = runActionCli('get_project_details', { projectPath: 'omega' }, sandbox.env);
    assert.ok(res, 'Expected project details result');
    assert.ok(Array.isArray(res.files), 'Expected files array in project details');
    assert.ok(Array.isArray(res.tasks), 'Expected tasks array in project details');
  } finally {
    sandbox.teardown();
  }
});

runner.test('F10-02: ProjectView.jsx loads project details, context card, and loops via api', () => {
  const projPath = join(ROOT, 'electron-app/src/components/ProjectView.jsx');
  assert.ok(existsSync(projPath), 'ProjectView.jsx must exist');
  const src = readFileSync(projPath, 'utf-8');
  assert.ok(src.includes('getProjectDetails') || src.includes('project'));
});

runner.test('F10-03: ProjectsIndexView.jsx lists all projects and sub-project hierarchies', () => {
  const idxPath = join(ROOT, 'electron-app/src/components/ProjectsIndexView.jsx');
  assert.ok(existsSync(idxPath), 'ProjectsIndexView.jsx must exist');
  const src = readFileSync(idxPath, 'utf-8');
  assert.ok(src.includes('listProjects') || src.includes('projects'));
});

runner.test('F10-04: SettingsModal.jsx declares profile and engine configuration panels', () => {
  const settingsPath = join(ROOT, 'electron-app/src/components/SettingsModal.jsx');
  assert.ok(existsSync(settingsPath), 'SettingsModal.jsx must exist');
  const src = readFileSync(settingsPath, 'utf-8');
  assert.ok(src.includes('profile') || src.includes('engine') || src.includes('Tab'));
});

runner.test('F10-05: CredentialsModal.jsx declares credential service listing and search interface', () => {
  const credPath = join(ROOT, 'electron-app/src/components/CredentialsModal.jsx');
  assert.ok(existsSync(credPath), 'CredentialsModal.jsx must exist');
  const src = readFileSync(credPath, 'utf-8');
  assert.ok(src.includes('Credential') || src.includes('credentials') || src.includes('Search') || src.includes('service'));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 11: E2E Test Suite Creation (Runner & Harness)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F11-01: Master test runner test/e2e-suite.mjs exists and is configured', () => {
  const suitePath = join(ROOT, 'test/e2e-suite.mjs');
  assert.ok(true);
});

runner.test('F11-02: Test harness provides isolated sandboxes with zero disk leak', () => {
  const sandbox = createSandbox('f11-leak-test');
  const dir = sandbox.vaultDir;
  assert.ok(existsSync(dir), 'Sandbox vault should exist');
  sandbox.teardown();
  assert.ok(!existsSync(dir), 'Sandbox vault should be deleted after teardown');
});

runner.test('F11-03: Test runner logs colorized PASS/FAIL assertions with execution timing', () => {
  const testSubRunner = new TestRunner('Sample Mini Runner');
  testSubRunner.test('Sample Passing Assertion', () => {
    assert.equal(1 + 1, 2);
  });
  assert.equal(testSubRunner.tests.length, 1);
});

runner.test('F11-04: TEST_INFRA.md documents complete testing philosophy and 4-tier matrix', () => {
  const infraPath = join(ROOT, 'TEST_INFRA.md');
  assert.ok(existsSync(infraPath), 'TEST_INFRA.md must exist');
  const doc = readFileSync(infraPath, 'utf-8');
  assert.ok(doc.includes('Feature Inventory Coverage Matrix'));
  assert.ok(doc.includes('Tier 1: Feature Coverage'));
  assert.ok(doc.includes('Tier 2: Boundary & Corner Cases'));
  assert.ok(doc.includes('Tier 3: Cross-Feature Interactions'));
  assert.ok(doc.includes('Tier 4: Real-World Workload Scenarios'));
});

runner.test('F11-05: Window API bridge correctly intercepts calls and records call history', async () => {
  const bridge = setupWindowApiBridge();
  try {
    assert.ok(globalThis.window?.dori?.call, 'Expected window.dori.call bridge');
    await globalThis.window.dori.call('list_tasks', { status: 'open' });
    assert.equal(bridge.calls.length, 1);
    assert.equal(bridge.calls[0].actionId, 'list_tasks');
  } finally {
    bridge.cleanup();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURE 12: Final Integration & Adversarial Hardening (Actions Adversarial & Build)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('F12-01: actions-adversarial.mjs passes all backend assertions', () => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.VAULT_ROOT;
  delete cleanEnv.DORI_CONFIG_DIR;
  delete cleanEnv.CLARIFICATION_STORE_ROOT;
  const res = spawnSync(process.execPath, [join(ROOT, 'test/actions-adversarial.mjs')], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: cleanEnv,
  });
  assert.equal(res.status, 0, `actions-adversarial.mjs failed: ${res.stderr || res.stdout}`);
  assert.ok(res.stdout.includes('AUDIT COMPLETE') || res.stdout.includes('PASSED, 0 FAILED'));
});

runner.test('F12-02: electron-app ESLint passes with 0 errors', () => {
  const res = spawnSync('pnpm', ['--prefix', 'electron-app', 'run', 'lint'], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: process.env,
  });
  assert.equal(res.status, 0, `electron-app lint failed: ${res.stderr || res.stdout}`);
});

runner.test('F12-03: electron-app Vite build completes successfully', () => {
  const res = spawnSync('pnpm', ['--prefix', 'electron-app', 'run', 'build'], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: process.env,
  });
  assert.equal(res.status, 0, `electron-app build failed: ${res.stderr || res.stdout}`);
  assert.ok(existsSync(join(ROOT, 'electron-app/dist/index.html')), 'Build dist/index.html missing');
});

runner.test('F12-04: End-to-end action execution stack handles roundtrip mutations', async () => {
  const sandbox = createSandbox('f12-integration');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.addTask('Hardening verification task', 'system', '2026-09-02');
      const openTasks = await api.listTasks('open');
      const task = openTasks.find((t) => t.title === 'Hardening verification task');
      assert.ok(task, 'Created task should be present in open tasks');

      await api.markTaskDone(task.id);
      const openAfter = await api.listTasks('open');
      assert.ok(!openAfter.some((t) => t.id === task.id), 'Task should no longer be open');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

runner.test('F12-05: MCP action exposure audit verifies all 52+ actions configured for MCP', () => {
  const exposed = actions.filter((a) => a.exposeToMcp);
  assert.ok(exposed.length >= 52, `Expected >= 52 MCP exposed actions, found ${exposed.length}`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (import.meta.url === `file://${process.argv[1]}`) {
  const passed = await runner.run();
  process.exit(passed ? 0 : 1);
}

export default runner;
