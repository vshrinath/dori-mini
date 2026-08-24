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

function renderHtml({ period, tasks, inbox }) {
  const taskRows = tasks.length
    ? tasks.map((t) => `<li>${esc(t.title)}${t.due ? ` — <span class="due">due ${esc(t.due)}</span>` : ''}</li>`).join('\n')
    : '<li class="empty">Nothing open.</li>';
  const inboxRows = inbox.length
    ? inbox.map((i) => `<li>${esc(i.title)}</li>`).join('\n')
    : '<li class="empty">Nothing pending.</li>';
  const title = period === 'morning' ? 'Morning digest' : 'End-of-day summary';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1a1a1a}
h1{font-size:1.4rem} h2{font-size:1rem;color:#555;margin-top:2rem}
ul{padding-left:1.2rem} li{margin:.3rem 0} .empty{color:#999} .due{color:#a33}
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
