#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'electron-app');

console.log('====================================================');
console.log('=== MILESTONE 2: DESIGN TOKENS & SIDEBAR VERIFICATION ===');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failCount++;
  }
}

// =========================================================================
// SECTION 1: DESIGN TOKENS (tokens.css)
// =========================================================================
console.log('--- 1. DESIGN TOKENS & TYPOGRAPHY SPECIFICATION ---');

const tokensCssPath = join(APP_DIR, 'src/tokens.css');
assert.ok(existsSync(tokensCssPath), 'tokens.css must exist');
const tokensCss = readFileSync(tokensCssPath, 'utf8');

test('Typography :: Figtree @font-face and font-family tokens', () => {
  assert.ok(tokensCss.includes("@font-face"), 'tokens.css must define @font-face');
  assert.ok(tokensCss.includes("font-family: 'Figtree'"), "tokens.css must register Figtree font family");
  assert.ok(tokensCss.includes("--font-figtree:"), "tokens.css must define --font-figtree");
  assert.ok(tokensCss.includes("--font-display:"), "tokens.css must define --font-display");
  assert.ok(tokensCss.includes("--font-body:"), "tokens.css must define --font-body");
  assert.ok(tokensCss.includes("--font-mono:"), "tokens.css must define --font-mono");
});

test('Typography :: Fluid & Named Typography Scale tokens', () => {
  const REQUIRED_TYPO_TOKENS = [
    '--text-display:',
    '--text-heading-lg:',
    '--text-heading:',
    '--text-title:',
    '--text-body:',
    '--text-control:',
    '--text-label:',
    '--text-caption:',
    '--text-micro:',
  ];
  for (const token of REQUIRED_TYPO_TOKENS) {
    assert.ok(tokensCss.includes(token), `tokens.css must define typography token ${token}`);
  }
});

test('Space Accents :: Six canonical categorical space accent tokens', () => {
  const REQUIRED_SPACE_TOKENS = [
    { token: '--space-now:', hex: '#d99b24' },
    { token: '--space-work:', hex: '#c44e28' },
    { token: '--space-knowledge:', hex: '#4a7a6a' },
    { token: '--space-create:', hex: '#c47218' },
    { token: '--space-personal:', hex: '#a03c5c' },
    { token: '--space-system:', hex: '#5a6880' },
  ];
  for (const { token, hex } of REQUIRED_SPACE_TOKENS) {
    assert.ok(tokensCss.includes(token), `tokens.css must define ${token}`);
    assert.ok(tokensCss.toLowerCase().includes(hex.toLowerCase()), `tokens.css must assign hex ${hex} for ${token}`);
  }
});

test('Surfaces :: Light & Dark Surface Ladder tokens', () => {
  const SURFACE_TOKENS = [
    '--surface-canvas:',
    '--surface-panel:',
    '--surface-field:',
    '--surface-field-hover:',
    '--surface-tint:',
    '--border:',
    '--border-soft:',
  ];
  for (const token of SURFACE_TOKENS) {
    assert.ok(tokensCss.includes(token), `tokens.css must define surface token ${token}`);
  }
  assert.ok(tokensCss.includes('.dark {') || tokensCss.includes('.dark'), 'tokens.css must define .dark theme block');
});

test('Space Card :: .space-card dot-grid texture rule', () => {
  assert.ok(tokensCss.includes('.space-card'), 'tokens.css must define .space-card class');
  assert.ok(tokensCss.includes('radial-gradient('), '.space-card must use radial-gradient');
  assert.ok(tokensCss.includes('background-size: 18px 18px') || tokensCss.includes('background-size:18px 18px'), '.space-card must have 18px grid');
  assert.ok(tokensCss.includes('.space-card:hover'), '.space-card must define :hover state');
});

test('Radii :: Semantic border radii scale', () => {
  const REQUIRED_RADII = [
    '--radius-xs:',
    '--radius-control:',
    '--radius-panel:',
    '--radius-sheet:',
  ];
  for (const token of REQUIRED_RADII) {
    assert.ok(tokensCss.includes(token), `tokens.css must define ${token}`);
  }
});

// =========================================================================
// SECTION 2: SIDEBAR COMPONENT SPECIFICATION (Sidebar.jsx & App.jsx)
// =========================================================================
console.log('\n--- 2. SIDEBAR COMPONENT & SPACE CATEGORIES SPECIFICATION ---');

const sidebarJsxPath = join(APP_DIR, 'src/components/Sidebar.jsx');
assert.ok(existsSync(sidebarJsxPath), 'Sidebar.jsx must exist');
const sidebarJsx = readFileSync(sidebarJsxPath, 'utf8');

const appJsxPath = join(APP_DIR, 'src/App.jsx');
assert.ok(existsSync(appJsxPath), 'App.jsx must exist');
const appJsx = readFileSync(appJsxPath, 'utf8');

test('Sidebar :: SPACES_NAV contains Work, Knowledge, and System categories', () => {
  assert.ok(sidebarJsx.includes('SPACES_NAV'), 'Sidebar.jsx must define SPACES_NAV');
  assert.ok(sidebarJsx.includes('id: "work"') || sidebarJsx.includes("id: 'work'"), 'SPACES_NAV must contain work category');
  assert.ok(sidebarJsx.includes('id: "knowledge"') || sidebarJsx.includes("id: 'knowledge'"), 'SPACES_NAV must contain knowledge category');
  assert.ok(sidebarJsx.includes('id: "system"') || sidebarJsx.includes("id: 'system'"), 'SPACES_NAV must contain system category');
});

test('Sidebar :: Work category contains all primary work items', () => {
  const WORK_ITEMS = ['chat', 'inbox', 'tasks', 'projects', 'finance'];
  for (const item of WORK_ITEMS) {
    assert.ok(sidebarJsx.includes(`id: "${item}"`) || sidebarJsx.includes(`id: '${item}'`), `Work category must contain item ${item}`);
  }
});

test('Sidebar :: Knowledge category contains timeline, entities, and library items', () => {
  const KNOWLEDGE_ITEMS = ['timeline', 'entities', 'library'];
  for (const item of KNOWLEDGE_ITEMS) {
    assert.ok(sidebarJsx.includes(`id: "${item}"`) || sidebarJsx.includes(`id: '${item}'`), `Knowledge category must contain item ${item}`);
  }
});

test('Sidebar :: System category contains settings, credentials, and profile items', () => {
  const SYSTEM_ITEMS = ['settings', 'credentials', 'profile'];
  for (const item of SYSTEM_ITEMS) {
    assert.ok(sidebarJsx.includes(`id: "${item}"`) || sidebarJsx.includes(`id: '${item}'`), `System category must contain item ${item}`);
  }
});

test('Sidebar :: Calibrated 34px item metrics and geometry', () => {
  assert.ok(
    sidebarJsx.includes('min-h-[2.15rem]') || sidebarJsx.includes('min-h-[34px]') || sidebarJsx.includes('h-[34px]'),
    'Sidebar row items must use calibrated 34px (2.15rem) height'
  );
  assert.ok(sidebarJsx.includes('rounded-[10px]'), 'Sidebar rows must use 10px rounded corners');
  assert.ok(sidebarJsx.includes('text-[13px]'), 'Sidebar row text must be calibrated 13px');
});

test('Sidebar :: ProfileFooter avatar geometry (32-34px rounded avatar)', () => {
  assert.ok(sidebarJsx.includes('ProfileFooter'), 'Sidebar.jsx must define ProfileFooter');
  assert.ok(
    sidebarJsx.includes('h-[34px] w-[34px]') || sidebarJsx.includes('h-7 w-7') || sidebarJsx.includes('h-8 w-8') || sidebarJsx.includes('w-8 h-8'),
    'ProfileFooter must render round avatar (~32-34px)'
  );
  assert.ok(sidebarJsx.includes('rounded-full'), 'Avatar must be circular (rounded-full)');
});

test('Sidebar :: Collapsible chevron triggers with smooth rotation animation', () => {
  assert.ok(sidebarJsx.includes('ChevronDown'), 'Sidebar.jsx must use ChevronDown for accordion triggers');
  assert.ok(
    sidebarJsx.includes('-rotate-90') || sidebarJsx.includes('rotate-'),
    'Chevron must rotate when collapsed'
  );
  assert.ok(
    sidebarJsx.includes('transition-transform'),
    'Chevron must use transition-transform animation'
  );
});

test('Sidebar :: Width boundaries & LocalStorage persistence', () => {
  assert.ok(sidebarJsx.includes('SIDEBAR_MIN_WIDTH'), 'Sidebar must define SIDEBAR_MIN_WIDTH (240)');
  assert.ok(sidebarJsx.includes('SIDEBAR_MAX_WIDTH'), 'Sidebar must define SIDEBAR_MAX_WIDTH');
  assert.ok(sidebarJsx.includes('SIDEBAR_STORAGE_KEY') || sidebarJsx.includes('dori.sidebar.width'), 'Sidebar must persist width in localStorage');
  assert.ok(sidebarJsx.includes('handleResizeStart') || sidebarJsx.includes('onMouseDown'), 'Sidebar must provide drag-resize handle');
});

test('Sidebar :: Dynamic badges for Inbox unread and Open tasks counts', () => {
  assert.ok(sidebarJsx.includes('inboxCount'), 'Sidebar must track inboxCount');
  assert.ok(sidebarJsx.includes('openTasksCount'), 'Sidebar must track openTasksCount');
  assert.ok(sidebarJsx.includes('badgeCount > 0'), 'Badges must conditionally render when count > 0');
});

test('Sidebar & App :: Modal wiring (Search, Settings, Credentials)', () => {
  assert.ok(appJsx.includes('SearchModal'), 'App.jsx must import SearchModal');
  assert.ok(appJsx.includes('SettingsModal'), 'App.jsx must import SettingsModal');
  assert.ok(appJsx.includes('CredentialsModal'), 'App.jsx must import CredentialsModal');
  assert.ok(appJsx.includes('isSearchOpen'), 'App.jsx must maintain isSearchOpen state');
  assert.ok(appJsx.includes('isSettingsOpen'), 'App.jsx must maintain isSettingsOpen state');
  assert.ok(appJsx.includes('isCredentialsOpen'), 'App.jsx must maintain isCredentialsOpen state');
});

test('Sidebar & App :: Keyboard shortcuts for Search (Cmd+K, /) and Settings (Cmd+,)', () => {
  assert.ok(appJsx.includes('"k"') || appJsx.includes("'k'"), 'App.jsx must listen for Cmd+K');
  assert.ok(appJsx.includes('"/"') || appJsx.includes("'/'"), 'App.jsx must listen for / search shortcut');
  assert.ok(appJsx.includes('","') || appJsx.includes("','"), 'App.jsx must listen for Cmd+, settings shortcut');
});

// =========================================================================
// SECTION 3: DESIGN TOKEN PURITY SWEEP (NO HARDCODED HEX COLORS)
// =========================================================================
console.log('\n--- 3. DESIGN TOKEN PURITY SWEEP ---');

test('Token Purity :: Sidebar.jsx and App.jsx avoid hardcoded hex colors in markup', () => {
  const SWEPT_COMPONENTS = ['components/Sidebar.jsx', 'App.jsx'];
  for (const comp of SWEPT_COMPONENTS) {
    const src = readFileSync(join(APP_DIR, `src/${comp}`), 'utf8');
    // Allow SVG XML attributes or regex inside comments, check style / className hex literals
    const hexLiterals = src.match(/className="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/g) || [];
    assert.equal(hexLiterals.length, 0, `${comp} must not hardcode hex colors in classNames, found: ${hexLiterals.join(', ')}`);
  }
});

// =========================================================================
// SECTION 4: BUILD & LINT SANITY CHECKS
// =========================================================================
console.log('\n--- 4. ESLINT & VITE BUILD SANITY GATES ---');

test('Lint :: pnpm --prefix electron-app run lint passes with 0 errors', () => {
  const output = execSync('pnpm --prefix electron-app run lint', { encoding: 'utf8' });
  assert.ok(!output.includes('error'), 'ESLint output must not contain errors');
});

test('Build :: pnpm --prefix electron-app run build succeeds with code 0', () => {
  const output = execSync('pnpm --prefix electron-app run build', { encoding: 'utf8' });
  assert.ok(output.includes('built in') || output.includes('dist/'), 'Vite build must produce dist output');
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n====================================================');
console.log(`VERIFICATION AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED.`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
}
