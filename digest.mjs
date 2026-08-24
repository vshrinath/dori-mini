#!/usr/bin/env node
// Morning/evening digest — no engine equivalent to mirror 1:1 (dori-engine's
// morning-brief.ts needs a live WorkflowEngine + cron scheduler + callAI(), none of
// which this mirror has). This is the mechanical version: gathers what's already
// queryable (open tasks, inbox items) with no AI step, writes a static HTML page,
// opens it directly (no localhost server — see docs/guide.html's "no server" rule),
// and pings it through whichever channels are configured.
//
// Schedule/config lives in ~/.dori/digest-config.json — edit times there (or ask an
// agent to) and re-run install-digest-schedule.mjs (not built yet) to apply.
//
// Usage: node digest.mjs [morning|evening] [--whatsapp]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { listTasks } from './list-tasks.mjs';
import { buildInbox } from './list-inbox.mjs';
import { notifyDesktop } from './notify-desktop.mjs';

const DIGEST_DIR = join(homedir(), '.dori', 'digests');
const CONFIG_FILE = join(homedir(), '.dori', 'digest-config.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { morningTime: '07:00', eveningTime: '18:00', whatsapp: false };
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Real vaults accumulate exact-duplicate noise (e.g. a broken workflow re-filing the
// same failure notice every run) — collapse identical titles to one line with a count
// instead of listing each occurrence, and cap the distinct lines shown so one noisy
// title can't push everything else off the page. Never drop the count silently.
const MAX_DISTINCT_LINES = 8;

function groupByTitle(items, titleOf) {
  const counts = new Map();
  for (const item of items) {
    const t = titleOf(item);
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderList(items, titleOf, emptyLabel) {
  if (!items.length) return `<li class="empty">${emptyLabel}</li>`;
  const grouped = groupByTitle(items, titleOf);
  const shown = grouped.slice(0, MAX_DISTINCT_LINES);
  const hiddenCount = grouped.length - shown.length;
  const hiddenItems = grouped.slice(MAX_DISTINCT_LINES).reduce((sum, [, n]) => sum + n, 0);
  let html = shown.map(([t, n]) => `<li>${esc(t)}${n > 1 ? ` <span class="count">×${n}</span>` : ''}</li>`).join('\n');
  if (hiddenCount > 0) {
    html += `\n<li class="empty">+ ${hiddenCount} more distinct item${hiddenCount === 1 ? '' : 's'} (${hiddenItems} total) — see list-inbox.mjs / list-tasks.mjs for the full list</li>`;
  }
  return html;
}

function renderHtml({ period, tasks, inbox }) {
  const taskRows = renderList(tasks, (t) => t.title, 'Nothing open.');
  const inboxRows = renderList(inbox, (i) => i.title, 'Nothing pending.');
  const title = period === 'morning' ? 'Morning digest' : 'End-of-day summary';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1a1a1a}
h1{font-size:1.4rem} h2{font-size:1rem;color:#555;margin-top:2rem}
ul{padding-left:1.2rem} li{margin:.3rem 0} .empty{color:#999} .due{color:#a33} .count{color:#888;font-size:.85em}
.date{color:#888;font-size:.9rem}
</style></head><body>
<h1>${title}</h1>
<p class="date">${new Date().toDateString()}</p>
<h2>Open tasks</h2><ul>${taskRows}</ul>
<h2>Inbox</h2><ul>${inboxRows}</ul>
</body></html>`;
}

export async function runDigest(period = 'morning', { whatsapp = false } = {}) {
  const tasks = listTasks('open', { real: true });
  const inbox = buildInbox();
  const html = renderHtml({ period, tasks, inbox });

  mkdirSync(DIGEST_DIR, { recursive: true });
  const filePath = join(DIGEST_DIR, `${period}-${new Date().toISOString().slice(0, 10)}.html`);
  writeFileSync(filePath, html);

  const summary = `${tasks.length} open task${tasks.length === 1 ? '' : 's'}, ${inbox.length} in inbox`;
  await notifyDesktop(summary, period === 'morning' ? 'Dori — morning digest' : 'Dori — end of day');
  execFile('open', [filePath]);

  if (whatsapp) {
    const { sendWhatsApp } = await import('./send-whatsapp.mjs');
    await sendWhatsApp(`${period === 'morning' ? 'Morning' : 'Evening'} digest: ${summary}`);
  }

  return filePath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const period = args.find((a) => !a.startsWith('--')) || 'morning';
  const whatsapp = args.includes('--whatsapp') || loadConfig().whatsapp;
  const filePath = await runDigest(period, { whatsapp });
  console.log(`Digest written: ${filePath}`);
}
