#!/usr/bin/env node
// Sketch of real Dori's timeline.ts — a single chronological view across
// everything dori-mini already tracks (meetings, decisions, tasks), rather than
// three separate places to look. No new capture logic: this just sorts what
// query-vault.mjs / decision-store.mjs / list-tasks.mjs already index.
//
// Usage: node timeline.mjs [--limit 30] [--since 2026-08-01]
import fs from 'node:fs';
import path from 'node:path';
import { listDocs } from './query-vault.mjs';
import { loadDecisions } from './decision-store.mjs';
import { listTasks } from './list-tasks.mjs';
import { loadLedgers } from './query-ledger.mjs';
import { VAULT_ROOT } from './route-destination.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

function unquote(s) {
  return (s || '').replace(/^["']|["']$/g, '');
}

function extractDate(rel, fm, stat) {
  if (fm.date) {
    const d = String(fm.date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  const match = path.basename(rel).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  if (stat && stat.mtime) {
    return stat.mtime.toISOString().slice(0, 10);
  }
  return null;
}

function extractTitle(rel, fm, content) {
  if (fm.title) return unquote(fm.title);
  const h1Match = (content || '').match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  const name = path.basename(rel, '.md').replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '');
  return name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Meeting';
}

function scanVaultMeetings() {
  const results = [];
  const seenRefs = new Set();

  function scan(dir, base = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const rel = path.join(base, e.name);
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') {
            scan(full, rel);
          }
        } else if (e.isFile() && e.name.endsWith('.md')) {
          if (
            rel.includes('/meetings/') ||
            rel.startsWith('meetings/') ||
            rel.startsWith('captures/')
          ) {
            try {
              const content = fs.readFileSync(full, 'utf-8');
              const fm = parseFrontmatter(content) || {};
              const stat = fs.statSync(full);
              const date = extractDate(rel, fm, stat);
              const title = extractTitle(rel, fm, content);
              if (date && !seenRefs.has(rel)) {
                seenRefs.add(rel);
                results.push({
                  date,
                  kind: 'meeting',
                  label: title,
                  ref: rel,
                  org: fm.org || (rel.startsWith('accounts/') ? rel.split('/')[1] : null),
                  attendees: fm.attendees || [],
                });
              }
            } catch (err) {}
          }
        }
      }
    } catch (err) {}
  }

  if (VAULT_ROOT && fs.existsSync(VAULT_ROOT)) {
    scan(VAULT_ROOT);
  }
  return results;
}

export function buildTimeline({ limit, since } = {}) {
  let meetings = [];
  const seenMeetingRefs = new Set();

  try {
    const indexed = listDocs()
      .filter((d) => d.rel_path.includes('/meetings/') || d.rel_path.startsWith('meetings/') || d.rel_path.startsWith('captures/'))
      .map((d) => ({
        date: d.date,
        kind: 'meeting',
        label: unquote(d.title),
        ref: d.rel_path,
        attendees: d.attendees || [],
      }));
    for (const m of indexed) {
      if (m.ref) seenMeetingRefs.add(m.ref);
      meetings.push(m);
    }
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT' && !/unable to open database/i.test(err.message)) throw err;
  }

  try {
    const diskMeetings = scanVaultMeetings();
    for (const dm of diskMeetings) {
      if (!seenMeetingRefs.has(dm.ref)) {
        seenMeetingRefs.add(dm.ref);
        meetings.push(dm);
      }
    }
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'ENOENT') throw err;
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
        amount: r.amount,
        trip: l.ledger?.trip || l.threadId,
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
