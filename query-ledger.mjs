#!/usr/bin/env node
// Mirrors dori-engine/src/finance/trip-ledger.ts's parseTripLedger exactly
// (same column-matching regexes, same incomplete-row handling per BUG-010 —
// a missing date/amount is retained and flagged, never silently dropped)
// so totals computed here agree with what dori-portal would show. Read-only:
// this never writes back to a ledger file. expense-router.mjs decides where
// a new row goes; this script answers questions about what's already there.
//
// Usage:
//   node query-ledger.mjs list                          # every open ledger, with totals
//   node query-ledger.mjs show <threadId|trip name>      # one ledger's rows + totals
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, posix as pathPosix } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const TRIPS_DIR = join(VAULT_ROOT, 'finances/trips');
const REIMBURSEMENTS_DIR = join(VAULT_ROOT, 'finances/reimbursements');

function splitCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function parseAmount(value) {
  if (!value) return 0;
  const n = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function frontmatterField(yaml, field) {
  const m = yaml?.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { yaml: null, content: raw };
  return { yaml: m[1], content: m[2] };
}

/** Mirrors trip-ledger.ts's parseTripLedger exactly — same header/column detection, same incomplete-row handling (BUG-010: retain and flag, never drop), same attachment-link extraction (used by finance.consolidate_trip_reimbursement's gap check). */
export function parseTripLedger(ledgerRelPath, raw) {
  const { yaml, content } = splitFrontmatter(raw);
  const ledgerDir = pathPosix.dirname(ledgerRelPath);
  const contentOffset = raw.split('\n').length - content.split('\n').length;
  const lines = content.split('\n');
  const headerIndex = lines.findIndex((line, i) => {
    if (!line.includes('|') || !lines[i + 1]?.includes('|')) return false;
    return splitCells(lines[i + 1]).every((c) => /^:?-{3,}:?$/.test(c));
  });

  const ledger = {
    trip: frontmatterField(yaml, 'trip'),
    account: frontmatterField(yaml, 'account'),
    status: frontmatterField(yaml, 'status') || 'draft',
    rows: [],
  };
  if (headerIndex < 0) return ledger;

  const headers = splitCells(lines[headerIndex]).map((h) => h.toLowerCase());
  const at = {
    date: headers.findIndex((h) => h === 'date'),
    description: headers.findIndex((h) => /description|source|vendor/.test(h)),
    category: headers.findIndex((h) => h === 'category'),
    amount: headers.findIndex((h) => /^amount/.test(h)),
    tax: headers.findIndex((h) => /gst|tds|tax/.test(h)),
    payer: headers.findIndex((h) => /payer|paid.?by/.test(h)),
    reimbursable: headers.findIndex((h) => /reimbursable/.test(h)),
    attachment: headers.findIndex((h) => /attachment|receipt|file/.test(h)),
  };
  if (at.date < 0 || at.amount < 0) return ledger;

  const cellAt = (cells, i) => (i >= 0 ? cells[i] || '' : '');
  for (let i = headerIndex + 2; i < lines.length; i++) {
    if (!lines[i].includes('|')) break;
    const cells = splitCells(lines[i]);
    const date = cellAt(cells, at.date);
    const amountRaw = cellAt(cells, at.amount);
    const amount = parseAmount(amountRaw);
    const reimbursableCell = cellAt(cells, at.reimbursable).toLowerCase();
    const attachments = [];
    for (const link of cellAt(cells, at.attachment).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = link[1].replace(/^<|>$/g, '').trim();
      if (!target || /^https?:\/\//i.test(target)) continue;
      attachments.push(pathPosix.join(ledgerDir, target));
    }
    ledger.rows.push({
      line: contentOffset + i + 1,
      date,
      description: cellAt(cells, at.description) || 'Entry',
      category: cellAt(cells, at.category),
      amount,
      amountRaw,
      tax: parseAmount(cellAt(cells, at.tax)),
      paidBy: cellAt(cells, at.payer),
      reimbursable: !reimbursableCell || !['no', 'false', '0'].includes(reimbursableCell),
      attachments,
      incomplete: !date || !amount,
    });
  }
  return ledger;
}

function totals(ledger) {
  const claimable = ledger.rows.filter((r) => r.reimbursable);
  return {
    rowCount: ledger.rows.length,
    incompleteCount: ledger.rows.filter((r) => r.incomplete).length,
    total: ledger.rows.reduce((s, r) => s + r.amount, 0),
    reimbursableTotal: claimable.reduce((s, r) => s + r.amount, 0),
  };
}

export function loadLedgers() {
  const out = [];
  for (const dir of [TRIPS_DIR, REIMBURSEMENTS_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      // generated packages (close-trip.mjs) carry the same trip/threadId
      // frontmatter as their source ledger but no table — skip them. So does a
      // ticket/itinerary document attach-receipt.mjs files alongside the ledger and
      // stamps with the trip's threadId (withThreadIdFrontmatter) — it carries no
      // `type: reimbursement` marker (only buildTripLedgerSeed writes that), which is
      // the actual ledger-vs-filed-document discriminator.
      if (!f.endsWith('.md') || f.endsWith('-reimbursement-package.md')) continue;
      const relPath = `finances/${dir === TRIPS_DIR ? 'trips' : 'reimbursements'}/${f}`;
      const raw = readFileSync(join(dir, f), 'utf-8');
      if (!/^type:\s*reimbursement\s*$/m.test(raw)) continue;
      const threadId = frontmatterField(raw, 'threadId');
      const ledger = parseTripLedger(relPath, raw);
      out.push({ threadId, relPath, ledger, totals: totals(ledger) });
    }
  }
  return out;
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, arg] = process.argv;
  if (cmd === 'show' && arg) {
    const target = normalize(arg);
    const match = loadLedgers().find((l) => l.threadId === arg || normalize(l.ledger.trip) === target);
    if (!match) {
      console.error(`No ledger found matching "${arg}"`);
      process.exit(1);
    }
    console.log(JSON.stringify(match, null, 2));
  } else if (cmd === 'list' || !cmd) {
    const ledgers = loadLedgers().map(({ threadId, relPath, ledger, totals: t }) => ({
      threadId, relPath, trip: ledger.trip, account: ledger.account, status: ledger.status, ...t,
    }));
    console.log(JSON.stringify(ledgers, null, 2));
  } else {
    console.error('Usage: node query-ledger.mjs [list | show <threadId|trip name>]');
    process.exit(1);
  }
}
