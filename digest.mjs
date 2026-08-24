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
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
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
  let html = shown
    .map(([t, n]) => `<li class="row"><span class="row-title">${esc(t)}</span>${n > 1 ? `<span class="count">×${n}</span>` : ''}</li>`)
    .join('\n');
  if (hiddenCount > 0) {
    html += `\n<li class="row more">+ ${hiddenItems} more item${hiddenItems === 1 ? '' : 's'} like this</li>`;
  }
  return html;
}

function renderHtml({ period, tasks, inbox }) {
  const taskRows = renderList(tasks, (t) => t.title, 'Nothing open — you’re caught up.');
  const inboxRows = renderList(inbox, (i) => i.title, 'Nothing waiting on you.');
  const isMorning = period === 'morning';
  const title = isMorning ? 'Morning digest' : 'End-of-day summary';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — Dori</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@1&display=swap');
  :root {
    --amber: #f0a80e; --amber-soft: #ffd978;
    --navy: #1a1f4e;
    --canvas: #fcfbf7; --canvas2: #f3f1ea; --card: #ffffff;
    --ink: #0e1626; --muted: #6b7280; --body-c: #4a5568;
    --coral: #d05436;
    --line: rgba(14,22,38,0.1);
    --font-display: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, sans-serif;
    --font-serif: "Instrument Serif", Georgia, serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --canvas: #131737; --canvas2: #1a1f4e; --card: #1a1f4e;
      --ink: #f7f4ea; --muted: #aab2c8; --body-c: #c7cee0;
      --line: rgba(247,244,234,0.12); --amber-soft: #ffe6a3;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--canvas); color: var(--ink); font-family: var(--font-body); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  main { max-width: 620px; margin: 0 auto; padding: 56px 24px 80px; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 700; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--amber); margin-bottom: 10px; }
  .eyebrow .glyph { font-size: 1rem; }
  h1 { font-family: var(--font-display); font-weight: 780; letter-spacing: -0.03em; font-size: clamp(2rem, 6vw, 2.6rem); line-height: 1.05; margin: 0 0 6px; text-wrap: balance; }
  .date { font-family: var(--font-mono); font-size: 0.82rem; color: var(--muted); margin: 0 0 44px; }
  section + section { margin-top: 40px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 4px; }
  h2 { font-family: var(--font-display); font-weight: 740; letter-spacing: -0.01em; font-size: 1.15rem; margin: 0; }
  .section-count { font-family: var(--font-mono); font-size: 0.78rem; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  li.row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  li.row:last-child { border-bottom: none; }
  .row-title { color: var(--body-c); font-size: 0.98rem; }
  .count { font-family: var(--font-mono); font-size: 0.78rem; color: var(--muted); flex-shrink: 0; }
  li.more { color: var(--muted); font-style: italic; font-family: var(--font-serif); font-size: 1.05rem; justify-content: flex-start; }
  li.empty { color: var(--muted); font-family: var(--font-serif); font-style: italic; font-size: 1.1rem; padding: 14px 0; }
</style></head><body>
<main>
  <div class="eyebrow"><span class="glyph">${isMorning ? '☀' : '☽'}</span> ${title}</div>
  <h1>${isMorning ? 'What’s ahead today' : 'How today wrapped up'}</h1>
  <p class="date">${dateStr}</p>
  <section>
    <div class="section-head"><h2>Your tasks</h2><span class="section-count">${tasks.length}</span></div>
    <ul>${taskRows}</ul>
  </section>
  <section>
    <div class="section-head"><h2>Waiting on you</h2><span class="section-count">${inbox.length}</span></div>
    <ul>${inboxRows}</ul>
  </section>
</main>
</body></html>`;
}

// Only ever keep the latest file per period (morning/evening) — each run replaces
// yesterday's, so this folder never grows past 2 files.
function deletePreviousDigests(period) {
  let entries;
  try {
    entries = readdirSync(DIGEST_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(`${period}-`) && name.endsWith('.html')) {
      unlinkSync(join(DIGEST_DIR, name));
    }
  }
}

export async function runDigest(period = 'morning', { whatsapp = false } = {}) {
  const tasks = listTasks('open', { real: true });
  const inbox = buildInbox();
  const html = renderHtml({ period, tasks, inbox });

  mkdirSync(DIGEST_DIR, { recursive: true });
  deletePreviousDigests(period);
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
