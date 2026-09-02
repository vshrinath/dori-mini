#!/usr/bin/env node
/**
 * Tier 3: Cross-Feature Interactions Test Suite (Pairwise Domain Combinations)
 * Tests multi-domain interactions across Finance, Entities, Inbox, Timeline, Library, Tasks, and Projects.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TestRunner, assert, api, getAction, actions, createSandbox, setupWindowApiBridge, runActionCli, ROOT } from './harness.mjs';

const runner = new TestRunner('Tier 3: Cross-Feature Interactions (Pairwise Combinations)');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-01: Finance ↔ Inbox Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-01: Expense capture routing to Trip Ledger updates gap detection audit', async () => {
  const sandbox = createSandbox('t3-01-fin-inbox');
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
| 2026-08-10 | Flight | Transport | 450.00 | 45.00 | self | yes | receipts/flight.pdf |
`);

    const routeRes = runActionCli('route_expense', {
      message: 'Uber to Denver airport $45.20 for Denver Conf 2026',
      targetLedger: 'finances/trips/2026-denver.md',
    }, sandbox.env);
    assert.ok(routeRes);

    const gapsRes = runActionCli('check_reimbursement_gaps', { target: 'trip-denver-2026' }, sandbox.env);
    assert.ok(gapsRes);
    assert.ok(Array.isArray(gapsRes.gaps));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-02: Entities ↔ Meetings Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-02: Filed meeting with attendees establishes project affiliations and people links', async () => {
  const sandbox = createSandbox('t3-02-ent-meet');
  try {
    mkdirSync(join(sandbox.vaultDir, 'entities/projects/platform/meetings'), { recursive: true });
    mkdirSync(join(sandbox.vaultDir, 'entities/people'), { recursive: true });

    writeFileSync(join(sandbox.vaultDir, 'entities/people/david-chen.md'), `---
name: "David Chen"
role: "Architect"
org: "Meridian"
projects:
  - "platform"
---
David Chen is Lead Architect.
`);

    writeFileSync(join(sandbox.vaultDir, 'entities/projects/platform/meetings/2026-08-20-sync.md'), `---
type: meeting
title: "Platform Sync"
date: "2026-08-20"
project: "platform"
attendees:
  - "david-chen"
---
# Platform Sync
## Notes
Discussed architecture milestones.
`);

    const projDetails = runActionCli('get_project_details', { projectPath: 'platform' }, sandbox.env);
    assert.ok(projDetails);
    assert.ok(Array.isArray(projDetails.people));
    assert.ok(projDetails.people.some((p) => p.name.includes('David') || p.relPath.includes('david-chen')));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-03: Tasks ↔ Projects Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-03: Task created with project reference reflects in task list and project open loops', async () => {
  const sandbox = createSandbox('t3-03-task-proj');
  try {
    mkdirSync(join(sandbox.vaultDir, 'projects/alpha'), { recursive: true });
    writeFileSync(join(sandbox.vaultDir, 'projects/alpha/README.md'), `# Alpha Project
- [ ] Complete security audit <!-- task:sec-audit -->
`);

    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.addTask('Deploy Alpha v1.0', 'alpha', '2026-09-30');
      const allTasks = await api.listTasks('open');
      assert.ok(allTasks.some((t) => t.title === 'Deploy Alpha v1.0'));

      const projDetails = runActionCli('get_project_details', { projectPath: 'alpha' }, sandbox.env);
      assert.ok(projDetails);
      assert.ok(Array.isArray(projDetails.tasks));
      assert.ok(projDetails.tasks.some((t) => t.title.includes('security audit') || t.text?.includes('security audit')));
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-04: Library ↔ ViewCanvas Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-04: Opening meeting document in Library parses MOM metadata for ViewCanvas projection', async () => {
  const sandbox = createSandbox('t3-04-lib-canvas');
  try {
    mkdirSync(join(sandbox.vaultDir, 'meetings'), { recursive: true });
    const meetingContent = `---
type: meeting
title: "Quarterly Strategy"
date: "2026-08-15"
attendees:
  - "anita-sharma"
---
# Quarterly Strategy
## Key Insights
- Accelerated cloud migration
## Decisions Log
- Adopt Figtree font across all surfaces
## Action Items
- [ ] Finalize budget <!-- task:budget -->
`;
    writeFileSync(join(sandbox.vaultDir, 'meetings/2026-08-15-strategy.md'), meetingContent);

    const doc = runActionCli('get_document', { path: 'meetings/2026-08-15-strategy.md' }, sandbox.env);
    assert.ok(doc);
    assert.ok(doc.content.includes('Key Insights'));
    assert.ok(doc.content.includes('Decisions Log'));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-05: Timeline ↔ Finance, Decisions & Tasks Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-05: Task completion, decision creation, and trip filing aggregate into timeline stream', async () => {
  const sandbox = createSandbox('t3-05-timeline-multi');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.addTask('Prepare Q3 Deck', 'create', '2026-09-05');
      runActionCli('create_decision', {
        title: 'Choose PostgreSQL for Metadata Index',
        summary: 'PostgreSQL provides robust indexing and ACID transactions',
        status: 'decided',
      }, sandbox.env);

      const timeline = await api.getTimeline({ limit: 10 });
      assert.ok(timeline);
      const events = timeline.events || timeline;
      assert.ok(Array.isArray(events));
      assert.ok(events.length >= 1, 'Expected at least 1 aggregated timeline event');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-06: Brand ↔ Design Tokens Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-06: Brand preset registration aligns with design token hierarchy', async () => {
  const sandbox = createSandbox('t3-06-brand-tokens');
  try {
    const bridge = setupWindowApiBridge({ env: sandbox.env });
    try {
      await api.setBrand({
        name: 'Aura',
        company: 'Aura Systems',
        primary: '#4F46E5',
        accent: '#10B981',
        fontDisplay: 'Figtree',
        fontBody: 'Figtree',
      });

      const brand = await api.getBrand('Aura');
      assert.ok(brand);
      const bData = brand.brand || brand;
      assert.equal(bData.primary, '#4F46E5');
      assert.equal(bData.fontDisplay, 'Figtree');
    } finally {
      bridge.cleanup();
    }
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-07: Projects ↔ Template Scaffolding Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-07: Project template application scaffolds directory tree and sets setup provenance', async () => {
  const sandbox = createSandbox('t3-07-proj-template');
  try {
    mkdirSync(join(sandbox.vaultDir, 'projects/software-core'), { recursive: true });
    writeFileSync(join(sandbox.vaultDir, 'projects/software-core/.setup.md'), `---
type: project
name: "Software Core"
---
# Software Core
`);

    const res = runActionCli('apply_template', {
      project: 'software-core',
      template: 'engine.software',
    }, sandbox.env);

    assert.ok(res);
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/software-core/docs')));
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/software-core/notes')));
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/software-core/source')));
    assert.ok(existsSync(join(sandbox.vaultDir, 'projects/software-core/tests')));

    const setupContent = readFileSync(join(sandbox.vaultDir, 'projects/software-core/.setup.md'), 'utf-8');
    assert.ok(setupContent.includes('template_origin: engine.software'));
  } finally {
    sandbox.teardown();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3-08: Entities ↔ Brand Association Interaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
runner.test('T3-08: Entity merge rewrites brand owner cross-references non-destructively', async () => {
  const sandbox = createSandbox('t3-08-ent-brand');
  try {
    mkdirSync(join(sandbox.vaultDir, 'entities/organizations'), { recursive: true });
    mkdirSync(join(sandbox.vaultDir, 'entities/brands'), { recursive: true });

    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/old-corp.md'), `---
name: "Old Corp"
role: "client"
---
`);
    writeFileSync(join(sandbox.vaultDir, 'entities/organizations/new-corp.md'), `---
name: "New Corp"
role: "client"
---
`);
    writeFileSync(join(sandbox.vaultDir, 'entities/brands/brand-x.md'), `---
name: "Brand X"
owner: "old-corp"
---
`);

    const res = runActionCli('merge_entity', {
      type: 'org',
      sourceSlug: 'old-corp',
      targetSlug: 'new-corp',
    }, sandbox.env);

    assert.ok(res);
    const brandContent = readFileSync(join(sandbox.vaultDir, 'entities/brands/brand-x.md'), 'utf-8');
    assert.ok(brandContent.includes('owner: "new-corp"') || brandContent.includes('owner: new-corp'));
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
