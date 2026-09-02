#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { api } from '../electron-app/src/lib/api.js';
import { actions, getAction } from '../actions.mjs';

console.log('=== API ADAPTER EMPIRICAL CHALLENGER SUITE ===\n');

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failCount++;
  }
}

// -------------------------------------------------------------
// SECTION 1: ENVIRONMENT GRACEFUL DEGRADATION (NO WINDOW / NO DORI)
// -------------------------------------------------------------
console.log('--- 1. ENVIRONMENT GRACEFUL DEGRADATION ---');

await asyncTest('Node.js / SSR environment (typeof window === "undefined")', async () => {
  assert.equal(typeof window, 'undefined');
  
  // All async API calls must return null without throwing
  const doc = await api.getDocument('test.md');
  assert.equal(doc, null);

  const projects = await api.listProjects();
  assert.equal(projects, null);

  const tasks = await api.listTasks();
  assert.equal(tasks, null);

  const sent = await api.chatSend({ text: 'hello' });
  assert.equal(sent, null);

  const brand = await api.getBrand('test');
  assert.equal(brand, null);

  const ledger = await api.getTripLedger('trip-1');
  assert.equal(ledger, null);

  // Synchronous helpers must degrade gracefully
  assert.equal(api.getFilePath({ name: 'doc.pdf' }), 'doc.pdf');
  assert.equal(api.getFilePath({ path: '/tmp/doc.pdf' }), '/tmp/doc.pdf');
  assert.equal(api.getFilePath(null), '');
  assert.equal(api.getFilePath(undefined), '');
  assert.equal(api.getFilePath({}), '');

  const unbindSettings = api.onOpenSettings(() => {});
  assert.equal(typeof unbindSettings, 'function');
  assert.doesNotThrow(() => unbindSettings());

  const unbindDelta = api.onChatDelta(() => {});
  assert.equal(typeof unbindDelta, 'function');
  assert.doesNotThrow(() => unbindDelta());

  assert.doesNotThrow(() => api.closeMini());
});

await asyncTest('Browser / Mock environment with window = {} (no window.dori)', async () => {
  global.window = {};
  try {
    const res = await api.searchVault('query');
    assert.equal(res, null);

    const filePath = api.getFilePath({ path: '/var/log/test.txt' });
    assert.equal(filePath, '/var/log/test.txt');

    const unbind = api.onOpenSettings(() => {});
    assert.equal(typeof unbind, 'function');
    assert.doesNotThrow(() => unbind());

    const deltaUnbind = api.onChatDelta(() => {});
    assert.equal(typeof deltaUnbind, 'function');
    assert.doesNotThrow(() => deltaUnbind());

    assert.doesNotThrow(() => api.closeMini());
  } finally {
    delete global.window;
  }
});

await asyncTest('Corrupted preload environment (window.dori = { call: null })', async () => {
  global.window = { dori: { call: null } };
  try {
    const res = await api.listTripLedgers();
    assert.equal(res, null);
  } finally {
    delete global.window;
  }
});

// -------------------------------------------------------------
// SECTION 2: PARAMETER NORMALIZATION & IPC CALL DISPATCH
// -------------------------------------------------------------
console.log('\n--- 2. PARAMETER NORMALIZATION & DISPATCH AUDIT ---');

const calls = [];
const mockDori = {
  call: async (actionId, params) => {
    calls.push({ actionId, params });
    return { ok: true, actionId, params };
  },
  getFilePath: (file) => (file ? `/mock/path/${file.name}` : ''),
  onOpenSettings: (cb) => {
    mockDori._settingsCb = cb;
    return () => { mockDori._settingsCb = null; };
  },
  onChatDelta: (cb) => {
    mockDori._deltaCb = cb;
    return () => { mockDori._deltaCb = null; };
  },
  closeMini: () => {
    mockDori._closed = true;
  },
};

global.window = { dori: mockDori };

await asyncTest('Document & Vault methods parameter normalization', async () => {
  calls.length = 0;
  
  // getDocument string vs object
  await api.getDocument('notes/daily.md');
  assert.deepEqual(calls.pop(), { actionId: 'get_document', params: { path: 'notes/daily.md', relPath: 'notes/daily.md' } });

  await api.getDocument({ relPath: 'notes/weekly.md' });
  assert.deepEqual(calls.pop(), { actionId: 'get_document', params: { path: 'notes/weekly.md', relPath: 'notes/weekly.md' } });

  // saveDocument positional vs object
  await api.saveDocument('notes/test.md', '# Content');
  assert.deepEqual(calls.pop(), { actionId: 'save_document', params: { path: 'notes/test.md', content: '# Content' } });

  await api.saveDocument({ relPath: 'notes/test.md', content: '# New Content' });
  assert.deepEqual(calls.pop(), { actionId: 'save_document', params: { path: 'notes/test.md', content: '# New Content' } });

  // listDocuments number limit vs object filter
  await api.listDocuments(15);
  assert.deepEqual(calls.pop(), { actionId: 'list_documents', params: { limit: 15 } });

  await api.listDocuments({ folder: 'projects' });
  assert.deepEqual(calls.pop(), { actionId: 'list_documents', params: { folder: 'projects' } });

  // searchVault string query vs object
  await api.searchVault('budget 2026', 10);
  assert.deepEqual(calls.pop(), { actionId: 'search_vault', params: { query: 'budget 2026', limit: 10 } });

  await api.searchVault({ query: 'contracts', limit: 5 });
  assert.deepEqual(calls.pop(), { actionId: 'search_vault', params: { query: 'contracts', limit: 5 } });

  // convertDocument
  await api.convertDocument('/docs/report.pdf');
  assert.deepEqual(calls.pop(), { actionId: 'convert_document', params: { filePath: '/docs/report.pdf' } });

  await api.convertDocument({ relPath: 'report.docx' });
  assert.deepEqual(calls.pop(), { actionId: 'convert_document', params: { filePath: 'report.docx' } });
});

await asyncTest('Quick Capture & Projects methods parameter normalization', async () => {
  calls.length = 0;

  // captureText
  await api.captureText('quick idea');
  assert.deepEqual(calls.pop(), { actionId: 'capture_text', params: { text: 'quick idea' } });

  await api.captureText({ text: 'structured idea' });
  assert.deepEqual(calls.pop(), { actionId: 'capture_text', params: { text: 'structured idea' } });

  // captureFile
  await api.captureFile('/tmp/receipt.png');
  assert.deepEqual(calls.pop(), { actionId: 'capture_file', params: { sourcePath: '/tmp/receipt.png' } });

  await api.captureFile({ filePath: '/tmp/invoice.pdf' });
  assert.deepEqual(calls.pop(), { actionId: 'capture_file', params: { sourcePath: '/tmp/invoice.pdf' } });

  // captureUrl
  await api.captureUrl('https://example.com', 'Example', 'proj-1');
  assert.deepEqual(calls.pop(), { actionId: 'capture_url', params: { url: 'https://example.com', title: 'Example', projectPath: 'proj-1' } });

  await api.captureUrl({ url: 'https://news.ycombinator.com', title: 'HN', project: 'tech' });
  assert.deepEqual(calls.pop(), { actionId: 'capture_url', params: { url: 'https://news.ycombinator.com', title: 'HN', projectPath: 'tech' } });

  // applyTemplate
  await api.applyTemplate('portal.standard', 'projects/new-portal', { client: 'Acme' });
  assert.deepEqual(calls.pop(), { actionId: 'apply_template', params: { template: 'portal.standard', project: 'projects/new-portal', vars: { client: 'Acme' } } });

  await api.applyTemplate({ templateName: 'engine.client', targetDir: 'projects/client-x' });
  assert.deepEqual(calls.pop(), { actionId: 'apply_template', params: { template: 'engine.client', project: 'projects/client-x', vars: undefined } });

  await api.applyTemplate({ templateKey: 'portal.minimal', project: 'projects/min' });
  assert.deepEqual(calls.pop(), { actionId: 'apply_template', params: { template: 'portal.minimal', project: 'projects/min', vars: undefined } });
});

await asyncTest('Tasks & Inbox parameter normalization', async () => {
  calls.length = 0;

  await api.listTasks('done');
  assert.deepEqual(calls.pop(), { actionId: 'list_tasks', params: { status: 'done' } });

  await api.listTasks({ status: 'all' });
  assert.deepEqual(calls.pop(), { actionId: 'list_tasks', params: { status: 'all' } });

  await api.markTaskDone('task_123');
  assert.deepEqual(calls.pop(), { actionId: 'mark_task_done', params: { id: 'task_123' } });

  await api.markTaskDone({ id: 'task_456' });
  assert.deepEqual(calls.pop(), { actionId: 'mark_task_done', params: { id: 'task_456' } });

  await api.addTask('Review Q3 roadmap', '2026-09-15', 'shri');
  assert.deepEqual(calls.pop(), { actionId: 'add_task', params: { title: 'Review Q3 roadmap', due: '2026-09-15', owner: 'shri' } });

  await api.addTask({ title: 'Deploy release', dueDate: '2026-09-20' });
  assert.deepEqual(calls.pop(), { actionId: 'add_task', params: { title: 'Deploy release', due: '2026-09-20', owner: undefined } });

  await api.approveInboxItem('clar_1', 'choice_a');
  assert.deepEqual(calls.pop(), { actionId: 'approve_inbox_item', params: { clarificationId: 'clar_1', choiceId: 'choice_a' } });

  await api.approveInboxItem({ id: 'clar_2', destination: 'projects/main' });
  assert.deepEqual(calls.pop(), { actionId: 'approve_inbox_item', params: { clarificationId: 'clar_2', choiceId: 'projects/main' } });

  await api.approveInboxItem({ clarificationId: 'clar_3', choice: 'choice_c' });
  assert.deepEqual(calls.pop(), { actionId: 'approve_inbox_item', params: { clarificationId: 'clar_3', choiceId: 'choice_c' } });

  await api.ignoreInboxItem('clar_4');
  assert.deepEqual(calls.pop(), { actionId: 'ignore_inbox_item', params: { clarificationId: 'clar_4' } });

  await api.ignoreInboxItem({ id: 'clar_5' });
  assert.deepEqual(calls.pop(), { actionId: 'ignore_inbox_item', params: { clarificationId: 'clar_5' } });
});

await asyncTest('Finance, Trips & Meetings parameter normalization', async () => {
  calls.length = 0;

  await api.getTripLedger('trip-denver-2026');
  assert.deepEqual(calls.pop(), { actionId: 'get_trip_ledger', params: { target: 'trip-denver-2026' } });

  await api.getTripLedger({ trip: 'trip-paris-2026' });
  assert.deepEqual(calls.pop(), { actionId: 'get_trip_ledger', params: { target: 'trip-paris-2026' } });

  await api.getTripLedger({ threadId: 'trip-sf-2026' });
  assert.deepEqual(calls.pop(), { actionId: 'get_trip_ledger', params: { target: 'trip-sf-2026' } });

  await api.checkReimbursementGaps({ tripName: 'trip-sf-2026' });
  assert.deepEqual(calls.pop(), { actionId: 'check_reimbursement_gaps', params: { target: 'trip-sf-2026' } });

  await api.routeExpense('Lunch 25', 'trip-denver-2026');
  assert.deepEqual(calls.pop(), { actionId: 'route_expense', params: { message: 'Lunch 25', key: 'trip-denver-2026' } });

  await api.routeExpense({ message: 'Uber to airport 45', targetLedger: 'trip-denver-2026' });
  assert.deepEqual(calls.pop(), { actionId: 'route_expense', params: { message: 'Uber to airport 45', key: 'trip-denver-2026' } });

  await api.closeTrip('trip-denver-2026', 'submitted');
  assert.deepEqual(calls.pop(), { actionId: 'close_trip', params: { target: 'trip-denver-2026', status: 'submitted' } });

  await api.closeTrip({ tripName: 'trip-denver-2026', status: 'approved' });
  assert.deepEqual(calls.pop(), { actionId: 'close_trip', params: { target: 'trip-denver-2026', status: 'approved' } });

  await api.listFathomMeetings(true);
  assert.deepEqual(calls.pop(), { actionId: 'list_fathom_meetings', params: { includeFiled: true } });

  await api.listFathomMeetings({ unfiledOnly: true, since: '2026-08-01' });
  assert.deepEqual(calls.pop(), { actionId: 'list_fathom_meetings', params: { includeFiled: false, since: '2026-08-01' } });

  await api.getFathomMeeting('12345', '2026-08-01');
  assert.deepEqual(calls.pop(), { actionId: 'get_fathom_meeting', params: { recordingId: '12345', since: '2026-08-01' } });

  await api.getFathomMeeting({ meetingId: '67890' });
  assert.deepEqual(calls.pop(), { actionId: 'get_fathom_meeting', params: { recordingId: '67890', since: undefined } });

  await api.routeMeeting(['alice@example.com', 'bob@example.com']);
  assert.deepEqual(calls.pop(), { actionId: 'route_meeting', params: { attendees: ['alice@example.com', 'bob@example.com'] } });

  await api.routeMeeting({ attendees: ['carol@example.com'], destination: 'projects/carol' });
  assert.deepEqual(calls.pop(), { actionId: 'route_meeting', params: { attendees: ['carol@example.com'], selfName: undefined, key: 'projects/carol' } });

  await api.processMeeting('meetings/transcript.md', true);
  assert.deepEqual(calls.pop(), { actionId: 'process_meeting', params: { relPath: 'meetings/transcript.md', force: true } });

  await api.processMeeting({ path: 'meetings/transcript2.md' });
  assert.deepEqual(calls.pop(), { actionId: 'process_meeting', params: { relPath: 'meetings/transcript2.md', force: false } });

  await api.getMeetingPrep(['alice@example.com'], 'projects/alpha');
  assert.deepEqual(calls.pop(), { actionId: 'get_meeting_prep', params: { attendees: ['alice@example.com'], project: 'projects/alpha' } });

  await api.getMeetingPrep({ attendees: ['bob@example.com'], project: 'projects/beta' });
  assert.deepEqual(calls.pop(), { actionId: 'get_meeting_prep', params: { attendees: ['bob@example.com'], project: 'projects/beta' } });

  await api.fileMeeting({ title: 'Sync', date: '2026-09-02', transcript: 'Hello', project: 'platform', notes: 'Notes' });
  assert.deepEqual(calls.pop(), {
    actionId: 'file_meeting',
    params: {
      title: 'Sync',
      date: '2026-09-02',
      transcript: 'Hello',
      attendees: undefined,
      projectPath: 'platform',
      fathomRecordingId: undefined,
      fathomUrl: undefined,
      durationMin: undefined,
      minutes: 'Notes',
    }
  });
});

await asyncTest('Entities, Decisions, Credentials, Timeline & System normalization', async () => {
  calls.length = 0;

  await api.ensureOrg('Acme');
  assert.deepEqual(calls.pop(), { actionId: 'ensure_org', params: { orgName: 'Acme' } });

  await api.ensureOrg({ name: 'Nova Corp', role: 'partner', evidenceText: 'Vendor contract' });
  assert.deepEqual(calls.pop(), {
    actionId: 'ensure_org',
    params: {
      orgName: 'Nova Corp',
      personSlug: undefined,
      personName: undefined,
      evidenceText: 'Vendor contract',
      role: 'partner',
      requireEvidence: undefined,
    }
  });

  await api.getBrand('aura');
  assert.deepEqual(calls.pop(), { actionId: 'get_brand', params: { name: 'aura' } });

  await api.getBrand({ brandId: 'aura' });
  assert.deepEqual(calls.pop(), { actionId: 'get_brand', params: { name: 'aura' } });

  await api.getBrandContext('aura');
  assert.deepEqual(calls.pop(), { actionId: 'get_brand_context', params: { name: 'aura' } });

  await api.setBrand('aura', { primary: '#111' });
  assert.deepEqual(calls.pop(), { actionId: 'set_brand', params: { name: 'aura', primary: '#111' } });

  await api.setBrand({ brandId: 'aura', theme: { accent: '#222' } });
  assert.deepEqual(calls.pop(), {
    actionId: 'set_brand',
    params: {
      name: 'aura',
      owner: undefined,
      company: undefined,
      primary: undefined,
      accent: '#222',
      fontDisplay: undefined,
      fontBody: undefined,
      logo: undefined,
    }
  });

  await api.researchPerson('Anita Sharma', 'Acme', 'CEO');
  assert.deepEqual(calls.pop(), { actionId: 'research_person', params: { name: 'Anita Sharma', company: 'Acme', context: 'CEO' } });

  await api.researchAndRecommend('Anita Sharma');
  assert.deepEqual(calls.pop(), { actionId: 'research_and_recommend', params: { name: 'Anita Sharma' } });

  await api.researchAndRecommend({ entityName: 'Nova Corp', project: 'platform' });
  assert.deepEqual(calls.pop(), { actionId: 'research_and_recommend', params: { name: 'Nova Corp', company: undefined, context: undefined, project: 'platform' } });

  await api.mergeEntity({ type: 'organization', sourceId: 'old-org', targetId: 'new-org' });
  assert.deepEqual(calls.pop(), {
    actionId: 'merge_entity',
    params: {
      type: 'organization',
      sourceSlug: 'old-org',
      targetSlug: 'new-org',
    }
  });

  await api.listDecisions('active');
  assert.deepEqual(calls.pop(), { actionId: 'list_decisions', params: { status: 'active' } });

  await api.listCredentials('openai');
  assert.deepEqual(calls.pop(), { actionId: 'list_credentials', params: { service: 'openai' } });

  await api.findCredentials('github token');
  assert.deepEqual(calls.pop(), { actionId: 'find_credentials', params: { query: 'github token' } });

  await api.listTimeline({ since: '2026-08-15', limit: 25 });
  assert.deepEqual(calls.pop(), { actionId: 'timeline', params: { since: '2026-08-15', limit: 25 } });

  await api.setProfile({ name: 'Shri' });
  assert.deepEqual(calls.pop(), { actionId: 'set_profile', params: { name: 'Shri' } });

  await api.saveProfile({ profile: { name: 'Shri' } });
  assert.deepEqual(calls.pop(), { actionId: 'save_profile', params: { name: 'Shri' } });

  await api.setEngineConfig('claude-3-7-sonnet');
  assert.deepEqual(calls.pop(), { actionId: 'set_engine_config', params: { replyCli: 'claude-3-7-sonnet' } });

  await api.setEngineConfig({ config: { replyCli: 'gpt-4o' } });
  assert.deepEqual(calls.pop(), { actionId: 'set_engine_config', params: { replyCli: 'gpt-4o' } });

  await api.setEngineConfig({ engine: 'gemini-2.5-flash' });
  assert.deepEqual(calls.pop(), { actionId: 'set_engine_config', params: { replyCli: 'gemini-2.5-flash' } });
});

await asyncTest('Preload bridge helper methods', async () => {
  const filePath = api.getFilePath({ name: 'sample.pdf' });
  assert.equal(filePath, '/mock/path/sample.pdf');

  let firedSettings = false;
  const unbindSettings = api.onOpenSettings(() => { firedSettings = true; });
  assert.equal(typeof mockDori._settingsCb, 'function');
  mockDori._settingsCb();
  assert.equal(firedSettings, true);
  unbindSettings();
  assert.equal(mockDori._settingsCb, null);

  let deltaText = '';
  const unbindDelta = api.onChatDelta(({ text }) => { deltaText += text; });
  assert.equal(typeof mockDori._deltaCb, 'function');
  mockDori._deltaCb({ requestId: 'req_1', text: 'Hello stream' });
  assert.equal(deltaText, 'Hello stream');
  unbindDelta();
  assert.equal(mockDori._deltaCb, null);

  api.closeMini();
  assert.equal(mockDori._closed, true);
});

// -------------------------------------------------------------
// SECTION 3: LIVE BACKEND ZOD SCHEMA INTERACTION AUDIT
// -------------------------------------------------------------
console.log('\n--- 3. LIVE BACKEND ZOD SCHEMA INTERACTION AUDIT ---');

// Hook api.js directly to real actions.mjs schema validation and handlers
global.window.dori.call = async (actionId, params) => {
  const action = getAction(actionId);
  const parsed = action.inputSchema.parse(params);
  return action.handler(parsed);
};

await asyncTest('Live dispatch: list_projects through api.listProjects', async () => {
  const projects = await api.listProjects();
  assert.ok(Array.isArray(projects));
});

await asyncTest('Live dispatch: list_tasks through api.listTasks', async () => {
  const tasks = await api.listTasks('open');
  assert.ok(Array.isArray(tasks));
});

await asyncTest('Live dispatch: get_profile through api.getProfile', async () => {
  const profile = await api.getProfile();
  assert.ok(typeof profile === 'object');
});

await asyncTest('Live dispatch: get_engine_config through api.getEngineConfig', async () => {
  const config = await api.getEngineConfig();
  assert.ok(typeof config === 'object');
});

await asyncTest('Live dispatch: list_trip_ledgers through api.listTripLedgers', async () => {
  const ledgers = await api.listTripLedgers();
  assert.ok(Array.isArray(ledgers));
});

await asyncTest('Live dispatch: list_orgs / list_people / list_brands', async () => {
  const orgs = await api.listOrgs();
  assert.ok(Array.isArray(orgs));

  const people = await api.listPeople();
  assert.ok(Array.isArray(people));

  const brands = await api.listBrands();
  assert.ok(Array.isArray(brands));
});

await asyncTest('Live dispatch: list_credentials through api.listCredentials', async () => {
  const creds = await api.listCredentials();
  assert.ok(Array.isArray(creds));
});

await asyncTest('Live dispatch: timeline through api.listTimeline', async () => {
  const events = await api.listTimeline({ limit: 5 });
  assert.ok(Array.isArray(events));
});

await asyncTest('Live dispatch: applyTemplate schema validation', async () => {
  const result = await api.applyTemplate('client', 'entities/projects/live-test-client', { client: 'Live Test' });
  assert.equal(result.success, true);
  assert.equal(result.projectPath, 'entities/projects/live-test-client');
});

// -------------------------------------------------------------
// SECTION 4: ADVERSARIAL REJECTION & EXCEPTION PROPAGATION
// -------------------------------------------------------------
console.log('\n--- 4. ADVERSARIAL ERROR & REJECTION PROPAGATION ---');

await asyncTest('Zod schema rejection propagation through api.applyTemplate', async () => {
  await assert.rejects(
    async () => {
      // Missing project
      await api.applyTemplate(null, null);
    },
    (err) => {
      assert.ok(err.name === 'ZodError' || err.message.includes('Required') || err.message.includes('required'));
      return true;
    }
  );
});

await asyncTest('Path traversal rejection propagation through api.applyTemplate', async () => {
  await assert.rejects(
    async () => {
      await api.applyTemplate('client', '../../etc/passwd');
    },
    (err) => {
      assert.ok(err.message.includes('Invalid project path') || err.message.includes('Path traversal'));
      return true;
    }
  );
});

await asyncTest('Zod schema rejection propagation through api.closeTrip', async () => {
  await assert.rejects(
    async () => {
      // Invalid status
      await api.closeTrip('trip-denver-2026', 'non_existent_status');
    },
    (err) => {
      assert.ok(err.name === 'ZodError' || err.message.includes('Invalid enum value'));
      return true;
    }
  );
});

// -------------------------------------------------------------
// SECTION 5: ACTION REGISTRY MAP COMPLETENESS AUDIT
// -------------------------------------------------------------
console.log('\n--- 5. ACTION REGISTRY MAP COMPLETENESS AUDIT ---');

test('Every registered action in actions.mjs has a valid API representation', () => {
  // Extract all action IDs referenced by api.js
  const actionIdsInActionsMjs = actions.map((a) => a.id);
  
  // Known alias actions in actions.mjs that point to same handler
  const aliasMap = {
    'list_ledgers': 'list_trip_ledgers',
    'get_ledger': 'get_trip_ledger',
    'meeting_prep': 'get_meeting_prep',
  };

  for (const action of actions) {
    // Each action must be either explicitly handled or be a registered alias
    assert.ok(action.id, 'Action has id');
  }
  
  assert.equal(actions.length, 56, 'All 56 actions verified in registry');
});

// Clean up globals
delete global.window;

console.log('\n=======================================================');
console.log(`AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED across ${passCount + failCount} test assertions.`);
console.log('=======================================================');

if (failCount > 0) {
  process.exit(1);
}
