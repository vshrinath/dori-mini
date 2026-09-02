#!/usr/bin/env node
/**
 * Tier 4: Real-World Workload Scenarios Test Suite (End-to-End User Journeys)
 * Simulates 5 realistic application-level workflows spanning full operational lifecycles.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TestRunner, assert, api, getAction, actions, createSandbox, setupWindowApiBridge, runActionCli, ROOT } from './harness.mjs';

const runner = new TestRunner('Tier 4: Real-World Workload Scenarios (End-to-End Journeys)');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKFLOW 1: Executive Trip & Expense Lifecycle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('Workflow 1: Executive Trip & Expense Lifecycle (Create -> Route -> Gap Audit -> Attach -> Close)', async () => {
  const sandbox = createSandbox('wf1-trip-lifecycle');
  try {
    // 1. Initialize Trip Ledger
    const tripLedgerPath = join(sandbox.vaultDir, 'finances/trips/2026-denver.md');
    writeFileSync(tripLedgerPath, `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conference 2026"
account: "acme-corp"
status: draft
---
# Trip Ledger: Denver Conference 2026

| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight to Denver | Transport | 450.00 | 45.00 | self | yes | receipts/flight.pdf |
| 2026-08-11 | Hotel Stay | Lodging | 300.00 | 30.00 | self | yes | — |
`);

    // 2. Route an additional expense
    const routeRes = runActionCli('route_expense', {
      message: 'Taxi to conference center $35.00 for Denver Conference 2026',
      targetLedger: 'finances/trips/2026-denver.md',
    }, sandbox.env);
    assert.ok(routeRes);

    // 3. Gap Detection Audit (Hotel Stay is missing receipt)
    const gapsBefore = runActionCli('check_reimbursement_gaps', { target: 'trip-denver-2026' }, sandbox.env);
    assert.ok(gapsBefore);
    assert.ok(Array.isArray(gapsBefore.gaps));
    assert.ok(gapsBefore.gaps.some((g) => g.description.includes('Hotel Stay')));

    // 4. Attach Receipt for Hotel Stay
    const sampleReceipt = join(sandbox.vaultDir, 'hotel-receipt.pdf');
    writeFileSync(sampleReceipt, 'fake receipt binary content');

    const attachRes = runActionCli('attach_receipt', {
      thread: 'trip-denver-2026',
      filePath: sampleReceipt,
      desc: 'Hotel Stay Receipt',
      amount: 300.0,
      date: '2026-08-11',
      category: 'Lodging',
    }, sandbox.env);
    assert.ok(attachRes);

    // 5. Submit and Close Trip Package
    const submitRes = runActionCli('close_trip', {
      target: 'trip-denver-2026',
      status: 'submitted',
    }, sandbox.env);
    assert.ok(submitRes);
    assert.ok(existsSync(join(sandbox.vaultDir, 'finances/trips/trip-denver-2026-reimbursement-package.md')));

    const packageContent = readFileSync(join(sandbox.vaultDir, 'finances/trips/trip-denver-2026-reimbursement-package.md'), 'utf-8');
    assert.ok(packageContent.includes('status: submitted'));
    assert.ok(packageContent.includes('Denver Conference 2026'));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKFLOW 2: Meeting Ingestion to Project MOM & Task Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('Workflow 2: Meeting Ingestion to MOM Projection & Task Execution (File -> MOM -> Extract Tasks -> Complete)', async () => {
  const sandbox = createSandbox('wf2-meeting-task');
  try {
    mkdirSync(join(sandbox.vaultDir, 'entities/projects/platform/meetings'), { recursive: true });

    // 1. File Meeting Note with Frontmatter and Action Items
    const meetingFile = join(sandbox.vaultDir, 'entities/projects/platform/meetings/2026-08-25-q3-planning.md');
    writeFileSync(meetingFile, `---
type: meeting
title: "Q3 Architecture & Planning"
date: "2026-08-25"
project: "platform"
attendees:
  - "david-chen"
  - "anita-sharma"
---
# Q3 Architecture & Planning

## Key Insights
- Decoupled client architecture guarantees cross-surface portability.

## Decisions Log
- Adopt Figtree font scale hierarchy.

## Action Items
- [ ] Implement ViewCanvas history stack <!-- task:viewcanvas-hist -->
- [ ] Verify Tiptap table extensions <!-- task:tiptap-tables -->
`);

    // 2. View Meeting Doc for ViewCanvas MOM Projection
    const doc = runActionCli('get_document', { path: 'entities/projects/platform/meetings/2026-08-25-q3-planning.md' }, sandbox.env);
    assert.ok(doc);
    assert.ok(doc.content.includes('Key Insights'));
    assert.ok(doc.content.includes('Decisions Log'));

    // 3. Extract and Add Action Item Task
    const addRes = runActionCli('add_task', {
      title: 'Implement ViewCanvas history stack',
      due: '2026-09-10',
      owner: 'david-chen',
    }, sandbox.env);
    assert.ok(addRes);
    const taskId = addRes.id || addRes.taskId;

    // 4. List and Verify Open Tasks
    const openTasks = runActionCli('list_tasks', { status: 'open' }, sandbox.env);
    assert.ok(openTasks.some((t) => t.title.includes('ViewCanvas history stack')));

    // 5. Complete Task
    if (taskId) {
      const doneRes = runActionCli('mark_task_done', { id: taskId }, sandbox.env);
      assert.ok(doneRes);
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKFLOW 3: Multi-Entity Research, Disambiguation & Account Consolidation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('Workflow 3: Multi-Entity Research, Disambiguation & Account Consolidation (Register -> Research -> Merge -> Union)', async () => {
  const sandbox = createSandbox('wf3-entity-merge');
  try {
    mkdirSync(join(sandbox.vaultDir, 'entities/organizations'), { recursive: true });
    mkdirSync(join(sandbox.vaultDir, 'entities/people'), { recursive: true });

    // 1. Create Organization and Person Profiles
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian-corp.md'), `---
name: "Meridian Corporation"
role: "client"
aliases:
  - "Meridian"
people:
  - "anita-sharma"
---
Meridian Corporation master profile.
`);

    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian-global.md'), `---
name: "Meridian Global Services"
role: "client"
aliases:
  - "MGS"
people:
  - "david-chen"
---
Meridian Global duplicate entity profile.
`);

    // 2. Perform Non-Destructive Entity Merge
    const mergeRes = runActionCli('merge_entity', {
      type: 'org',
      sourceSlug: 'meridian-global',
      targetSlug: 'meridian-corp',
    }, sandbox.env);
    assert.ok(mergeRes);

    // 3. Verify Source Entity Archived
    assert.ok(existsSync(join(sandbox.vaultDir, 'entities/organizations/merged/meridian-global.md')));

    // 4. Verify Target Entity Unioned Aliases and People
    const canonicalContent = readFileSync(join(sandbox.vaultDir, 'entities/organizations/meridian-corp.md'), 'utf-8');
    assert.ok(canonicalContent.includes('Meridian Global Services') || canonicalContent.includes('MGS'));
    assert.ok(canonicalContent.includes('david-chen'));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKFLOW 4: Project Scaffolding, Spec Authoring & Vault Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('Workflow 4: Project Scaffolding, Spec Authoring & Vault Discovery (Template -> Spec -> ViewCanvas -> Query)', async () => {
  const sandbox = createSandbox('wf4-project-spec');
  try {
    mkdirSync(join(sandbox.vaultDir, 'projects/apollo-platform'), { recursive: true });
    writeFileSync(join(sandbox.vaultDir, 'projects/apollo-platform/.setup.md'), `---
type: project
name: "Apollo Platform"
---
# Apollo Platform
`);

    // 1. Apply Template
    const templateRes = runActionCli('apply_template', {
      project: 'apollo-platform',
      template: 'engine.software',
    }, sandbox.env);
    assert.ok(templateRes);
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/apollo-platform/docs')));
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/apollo-platform/source')));

    // 2. Author Specification Document with Table
    const specPath = join(sandbox.vaultDir, 'projects/apollo-platform/docs/spec.md');
    writeFileSync(specPath, `---
title: "Apollo System Specification"
type: specification
tags:
  - "architecture"
  - "m1"
---
# Apollo System Specification

| Component | Responsibility | Status |
|-----------|----------------|--------|
| Space Shell | 60/40 ViewCanvas workspace | Complete |
| Client API | Decoupled client adapter | Complete |
| Tokens | Figtree typography ladder | Complete |
`);

    // 3. Verify Document Content Retrievable
    const doc = runActionCli('get_document', { path: 'projects/apollo-platform/docs/spec.md' }, sandbox.env);
    assert.ok(doc);
    assert.ok(doc.content.includes('Apollo System Specification'));
    assert.ok(doc.content.includes('60/40 ViewCanvas'));

    // 4. Verify Project Tree Indexing
    const projDetails = runActionCli('get_project_details', { projectPath: 'apollo-platform' }, sandbox.env);
    assert.ok(projDetails);
    assert.ok(Array.isArray(projDetails.files));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKFLOW 5: Inbox Triage, Multi-Capture Intake & Activity Stream Audit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('Workflow 5: Inbox Triage, Multi-Capture Intake & Activity Stream Audit (Capture -> Triage -> Decision -> Timeline)', async () => {
  const sandbox = createSandbox('wf5-inbox-timeline');
  try {
    // 1. Ingest Text Capture
    const capRes = runActionCli('capture_text', {
      text: 'Meeting note: Finalized Figtree typography scales for space shell layout.',
      source: 'quick-capture',
    }, sandbox.env);
    assert.ok(capRes);

    // 2. Create Strategic Decision
    const decRes = runActionCli('create_decision', {
      title: 'Decouple React UI from Electron IPC via lib/api.js',
      summary: 'Allows identical components to run in Electron, web browser, and test runner fixtures.',
      status: 'decided',
    }, sandbox.env);
    assert.ok(decRes);

    // 3. Add Followup Task
    const taskRes = runActionCli('add_task', {
      title: 'Verify 0 raw window.dori.call calls remain in components',
      due: '2026-09-02',
    }, sandbox.env);
    assert.ok(taskRes);

    // 4. Audit Chronological Activity Timeline Stream
    const timeline = runActionCli('timeline', { limit: 20 }, sandbox.env);
    assert.ok(timeline);
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.length >= 2, 'Expected multiple aggregated timeline events');
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (import.meta.url === `file://${process.argv[1]}`) {
  const passed = await runner.run();
  process.exit(passed ? 0 : 1);
}

export default runner;
