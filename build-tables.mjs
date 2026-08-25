#!/usr/bin/env node
// Read-only table views over structured vault records — people, orgs, brands, tasks,
// trip ledgers — alongside build-site.mjs's markdown-tree browser. Same "vault is
// canonical, this is disposable" rule as the rest of the mini-site: nothing here writes
// back, every row is rendered straight from the same files the CLI scripts already read
// (entities/people, entities/organizations, entities/brands, .dori/tasks/records,
// finances/trips|reimbursements) — no new store, no sync layer.
//
// Visual patterns borrowed from dori-portal's real UI (app/globals.css, accounts-table.tsx,
// tasks-workspace.tsx, finance-ledger.tsx), not invented: plain text-first tables (no
// color-coded status), status shown as an outlined rounded-full pill (same shape
// real Dori's reimbursementStatusLabel() badge uses, just not colored per status —
// real Dori doesn't color-code it either), a "waiting on X" line as muted subtext under
// the title (not a separate badge), right-aligned tabular-nums for amounts, and an
// invitational empty-state instead of "No X found" (dori-portal's empty-state.tsx house
// style) — adapted to a CLI tool: the action line names the command instead of a button.
//
// Usage: node build-tables.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseFrontmatter, escapeHtml, wrapStandalonePage } from './render-html.mjs';
import { loadOrgs } from './org-store.mjs';
import { loadBrands } from './brand-store.mjs';
import { listTasks } from './list-tasks.mjs';
import { loadLedgers } from './query-ledger.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');
const SITE_ROOT = join(VAULT_ROOT, '_site');
const DATA_DIR = join(SITE_ROOT, 'data');

const money = (n) => n.toFixed(2);

function loadPeople() {
  if (!existsSync(PEOPLE_DIR)) return [];
  return readdirSync(PEOPLE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ slug: f.replace(/\.md$/, ''), ...parseFrontmatter(readFileSync(join(PEOPLE_DIR, f), 'utf-8')).fm }));
}

// Extra CSS for table chrome, layered on top of wrapStandalonePage's existing
// --brand-navy/--brand-accent/--border/--card tokens — not redefined here.
const TABLE_CSS = `<style>
  table.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  table.data-table th { text-align: left; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--muted-foreground); padding: 0.5em 0.9em; border-bottom: 1px solid var(--border); }
  table.data-table td { padding: 0.7em 0.9em; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  table.data-table tr:last-child td { border-bottom: none; }
  table.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  table.data-table .sub { display: block; color: var(--muted-foreground); font-size: 0.82rem; margin-top: 0.15em; }
  .status-pill { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 0.15em 0.7em; font-size: 0.78rem; text-transform: capitalize; color: var(--foreground-secondary); background: var(--card); }
  .swatch { display: inline-block; width: 0.85em; height: 0.85em; border-radius: 3px; border: 1px solid var(--border); vertical-align: -0.05em; margin-right: 0.4em; }
  .empty-state { padding: 2.5rem 1.5rem; text-align: center; color: var(--muted-foreground); }
  .empty-state .icon { font-size: 1.8rem; margin-bottom: 0.5rem; }
  .empty-state p { margin: 0.25em 0; }
  .empty-state .action { font-size: 0.85rem; color: var(--foreground-secondary); }
  .empty-state code { background: var(--accent-tint); padding: 0.1em 0.4em; border-radius: 4px; }
</style>`;

function emptyState(icon, title, body, actionCmd) {
  return `<div class="empty-state"><div class="icon">${icon}</div><p><strong>${escapeHtml(title)}</strong></p><p>${body}</p>
  ${actionCmd ? `<p class="action">Try: <code>${escapeHtml(actionCmd)}</code></p>` : ''}</div>`;
}

function table(columns, rows) {
  const head = columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.render(row)}</td>`).join('')}</tr>`).join('\n');
  return `<div style="overflow-x:auto"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function writePage(relPath, title, bodyHtml, nav) {
  const outPath = join(SITE_ROOT, relPath);
  mkdirSync(join(outPath, '..'), { recursive: true });
  writeFileSync(outPath, wrapStandalonePage({ title }, TABLE_CSS + bodyHtml, nav), 'utf-8');
}

function nav(current) {
  return `<nav class="site-nav"><a href="../index.html">Home</a><span class="sep">/</span><a href="index.html">Data</a>${
    current ? `<span class="sep">/</span><span class="current">${escapeHtml(current)}</span>` : ''
  }</nav>`;
}

function buildPeople() {
  const people = loadPeople();
  const body = people.length
    ? table(
        [
          { label: 'Name', render: (p) => `${escapeHtml(p.name || p.slug)}${p.is_self === 'true' ? ' <span class="status-pill">you</span>' : ''}` },
          { label: 'Role', render: (p) => escapeHtml(p.role || '—') },
          { label: 'Org', render: (p) => escapeHtml(p.org || '—') },
          { label: 'LinkedIn', render: (p) => (p.links ? (() => { try { return JSON.parse(p.links).linkedin ? `<a href="${escapeHtml(JSON.parse(p.links).linkedin)}" target="_blank" rel="noopener">profile ↗</a>` : '—'; } catch { return '—'; } })() : '—') },
        ],
        people
      )
    : emptyState('👤', 'No people yet', 'People show up here once you meet someone new or set your own profile.', 'Dori, create my profile: I\'m [Name], [Role] at [Company]');
  writePage('data/people.html', 'People', body, nav('People'));
}

function buildOrgs() {
  const orgs = loadOrgs();
  const body = orgs.length
    ? table(
        [
          { label: 'Name', render: (o) => escapeHtml(o.name) },
          { label: 'Role', render: (o) => `<span class="status-pill">${escapeHtml(o.role)}</span>` },
          { label: 'People', num: true, render: (o) => String(o.people.length) },
        ],
        orgs
      )
    : emptyState('🏢', 'No organizations yet', 'An org shows up here the first time you tie a real person to a company with a structured affiliation.', 'Dori, [Person] works at [Company] as [Role]');
  writePage('data/orgs.html', 'Orgs', body, nav('Orgs'));
}

function buildBrands() {
  const brands = loadBrands();
  const body = brands.length
    ? table(
        [
          { label: 'Name', render: (b) => escapeHtml(b.name || b.slug) },
          { label: 'Company', render: (b) => escapeHtml(b.company || '—') },
          {
            label: 'Colors',
            render: (b) => [b.primary, b.accent].filter(Boolean).map((c) => `<span class="swatch" style="background:${escapeHtml(c)}"></span>${escapeHtml(c)}`).join(' ') || '—',
          },
        ],
        brands
      )
    : emptyState('🎨', 'No brands yet', 'A brand shows up here once you add one — Dori reads the site itself for positioning, voice, and colors.', 'Dori, create a brand called [Name] — here\'s our site: [URL]');
  writePage('data/brands.html', 'Brands', body, nav('Brands'));
}

function buildTasks() {
  const tasks = listTasks('all');
  const body = tasks.length
    ? table(
        [
          {
            label: 'Task',
            render: (t) => `${escapeHtml(t.title)}${t.waiting ? `<span class="sub">Waiting on: ${escapeHtml(t.waiting.person)}</span>` : ''}`,
          },
          { label: 'Status', render: (t) => `<span class="status-pill">${escapeHtml(t.status)}</span>` },
          { label: 'Owner', render: (t) => escapeHtml(t.owner || '—') },
          { label: 'Due', render: (t) => escapeHtml(t.dueDate || '—') },
          { label: 'Source', render: (t) => (t.source?.sourceType === 'meeting_note' ? 'meeting' : t.source?.sourceType || '—') },
        ],
        tasks
      )
    : emptyState('✅', 'No tasks yet', 'Tasks show up here once one gets extracted from a meeting\'s Action Items, or you add one directly.', 'Dori, add a task: [title]');
  writePage('data/tasks.html', 'Tasks', body, nav('Tasks'));
}

function buildTrips() {
  const ledgers = loadLedgers();
  const body = ledgers.length
    ? table(
        [
          { label: 'Trip', render: (l) => escapeHtml(l.ledger.trip || l.threadId || l.relPath) },
          { label: 'Status', render: (l) => `<span class="status-pill">${escapeHtml(l.ledger.status)}</span>` },
          { label: 'Items', num: true, render: (l) => String(l.totals.rowCount) },
          { label: 'Claim total', num: true, render: (l) => money(l.totals.reimbursableTotal) },
        ],
        ledgers
      )
    : emptyState('✈️', 'No trips yet', 'A trip ledger shows up here once an expense gets filed against one.', 'Dori, start a trip for [name]');
  writePage('data/trips.html', 'Trips & Expenses', body, nav('Trips & Expenses'));
}

function buildLanding() {
  const tables = [
    { href: 'people.html', label: 'People', icon: '👤' },
    { href: 'orgs.html', label: 'Orgs', icon: '🏢' },
    { href: 'brands.html', label: 'Brands', icon: '🎨' },
    { href: 'tasks.html', label: 'Tasks', icon: '✅' },
    { href: 'trips.html', label: 'Trips & Expenses', icon: '✈️' },
  ];
  const links = tables.map((t) => `<li><a href="${t.href}">${t.icon} ${escapeHtml(t.label)}</a></li>`).join('\n');
  writePage('data/index.html', 'Data', `<ul class="site-list">${links}</ul>`, nav());
}

export function buildTables() {
  mkdirSync(DATA_DIR, { recursive: true });
  buildPeople();
  buildOrgs();
  buildBrands();
  buildTasks();
  buildTrips();
  buildLanding();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTables();
  console.log(`Built data tables under ${DATA_DIR}`);
  console.log('Serve alongside the rest of the mini-site: node serve-site.mjs, then open http://localhost:8420/data/');
}
