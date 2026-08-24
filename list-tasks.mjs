#!/usr/bin/env node
// Read-only view over dori-engine's task store (same files the `tasks.list` /
// `tasks.create_many` MCP actions read/write): <vault>/.dori/tasks/records/*.json.
//
// Usage: node list-tasks.mjs [status] [--real]
//   --real   drop e2e/debug/probe fixture tasks left over from test runs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const TASKS_DIR = join(VAULT_ROOT, '.dori', 'tasks', 'records');

// ponytail: title-pattern heuristic (e2e-<timestamp>, "Debug task", "probe-curl",
// "Probe task") — upgrade to a real `source: 'test-fixture'` tag if fixtures
// ever stop following this naming convention.
const FIXTURE_TITLE = /\(e2e-\d+\)|^Debug task \(|^probe-curl|^Probe task/i;
const isFixture = (t) => FIXTURE_TITLE.test(t.title);

export function listTasks(status = 'open', { real = false } = {}) {
  let entries;
  try {
    entries = readdirSync(TASKS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => JSON.parse(readFileSync(join(TASKS_DIR, e.name), 'utf8')))
    .filter((t) => t.status === status)
    .filter((t) => !real || !isFixture(t))
    .sort((a, b) => (a.due || a.dueDate || '9999').localeCompare(b.due || b.dueDate || '9999'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const real = args.includes('--real');
  const status = args.find((a) => !a.startsWith('--')) || 'open';
  const tasks = listTasks(status, { real });
  if (tasks.length === 0) {
    console.log(`No ${status} tasks.`);
  } else {
    for (const t of tasks) {
      const due = t.dueDate ? ` (due ${t.dueDate})` : '';
      console.log(`- [${t.id}] ${t.title}${due}`);
    }
  }
}
