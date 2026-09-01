#!/usr/bin/env node
// Sketch of real Dori's timeline.ts — a single chronological view across
// everything dori-mini already tracks (meetings, decisions, tasks), rather than
// three separate places to look. No new capture logic: this just sorts what
// query-vault.mjs / decision-store.mjs / list-tasks.mjs already index.
//
// Usage: node timeline.mjs [--limit 30] [--since 2026-08-01]
import { listDocs } from './query-vault.mjs';
import { loadDecisions } from './decision-store.mjs';
import { listTasks } from './list-tasks.mjs';
import { loadLedgers } from './query-ledger.mjs';

function unquote(s) {
  return (s || '').replace(/^["']|["']$/g, '');
}

export function buildTimeline({ limit, since } = {}) {
  let meetings = [];
  try {
    meetings = listDocs()
      .filter((d) => d.rel_path.includes('/meetings/') || d.rel_path.startsWith('meetings/'))
      .map((d) => ({ date: d.date, kind: 'meeting', label: unquote(d.title), ref: d.rel_path }));
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT' && !/unable to open database/i.test(err.message)) throw err;
  }

  let decisions = [];
  try {
    decisions = loadDecisions()
      .map((d) => ({ date: (d.decidedAt || '').slice(0, 10), kind: 'decision', label: d.summary, ref: d.slug }));
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT') throw err;
  }

  let tasks = [];
  try {
    tasks = listTasks('all', { real: true })
      .map((t) => ({ date: (t.createdAt || '').slice(0, 10), kind: 'task', label: `${t.title} [${t.status}]`, ref: t.id }));
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT') throw err;
  }

  let expenses = [];
  try {
    expenses = loadLedgers().flatMap((l) =>
      (l.ledger?.rows || []).filter((r) => r.date).map((r) => ({
        date: r.date,
        kind: 'expense',
        label: `${r.description || 'Expense'} (${r.amount ? '$' + r.amount : (r.amountRaw || 'unspecified')})${l.ledger?.trip || l.threadId ? ` — ${l.ledger?.trip || l.threadId}` : ''}`,
        ref: l.relPath,
      }))
    );
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT') throw err;
  }

  let events = [...meetings, ...decisions, ...tasks, ...expenses].filter((e) => e.date);
  if (since) events = events.filter((e) => e.date >= since);
  events.sort((a, b) => b.date.localeCompare(a.date));
  return limit ? events.slice(0, limit) : events;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flags = parseFlags(process.argv.slice(2));
  try {
    const events = buildTimeline({ limit: flags.limit ? Number(flags.limit) : undefined, since: flags.since });
    if (events.length === 0) console.log('Nothing in the timeline.');
    else for (const e of events) console.log(`${e.date}  [${e.kind}]  ${e.label}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
