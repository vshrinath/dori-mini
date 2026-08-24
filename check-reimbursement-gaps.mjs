#!/usr/bin/env node
// Mirrors the gap-detection logic inside dori-engine's
// finance.consolidate_trip_reimbursement action (finance-consolidate-trip-
// reimbursement.ts:190-216) exactly — same checks, same wording, applied to
// reimbursable rows only. That logic is real and already scoped/accepted
// (docs/slices/trips-core/scenario.yaml: trip.expense.no-evidence-file,
// trip.expense.incomplete-details, trip.reimbursement.claim-total).
//
// The gap NOT this script's own: finance.set_reimbursement_status (the
// actual draft->submitted transition) never calls this check — only the
// separate consolidate/package-assembly action does. So today real Dori lets
// you submit a claim with zero evidence as long as you skip consolidate.
// This script exists to close that gap locally — run it before treating any
// "submit this reimbursement" request as safe, regardless of whether the
// user also asks for a package.
//
// A voice-note-sourced expense (or any manual entry via expense-router.mjs /
// finance.add_trip_expense) needs no separate "mark it" step — it already
// lands with an empty Attachment column ('—' / NO_ATTACHMENT_CELL), which is
// exactly what `attachments.length === 0` below detects.
//
// Usage: node check-reimbursement-gaps.mjs <threadId|trip name>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseTripLedger } from './query-ledger.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function findLedgerRelPath(target) {
  const norm = normalize(target);
  for (const sub of ['finances/trips', 'finances/reimbursements']) {
    const dir = join(VAULT_ROOT, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const relPath = `${sub}/${f}`;
      const raw = readFileSync(join(VAULT_ROOT, relPath), 'utf-8');
      const threadId = (raw.match(/^threadId:\s*(.+)$/m) || [])[1]?.trim();
      const trip = (raw.match(/^trip:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
      if (threadId === target || (trip && normalize(trip) === norm)) return relPath;
    }
  }
  return null;
}

/** Mirrors finance-consolidate-trip-reimbursement.ts:190-216 exactly. */
export function checkGaps(ledgerRelPath, raw) {
  const ledger = parseTripLedger(ledgerRelPath, raw);
  const claim = ledger.rows.filter((row) => row.reimbursable);
  const excluded = ledger.rows.filter((row) => !row.reimbursable);

  const missing = new Set();
  for (const row of claim) {
    for (const rel of row.attachments) {
      if (!existsSync(join(VAULT_ROOT, rel))) missing.add(rel);
    }
  }

  const gaps = [];
  for (const row of claim) {
    const push = (issue) => gaps.push({ line: row.line, description: row.description, issue });
    if (!row.date) push('no date recorded');
    if (!row.amount) push('amount missing or unreadable');
    if (row.attachments.length === 0) push('no receipt attached');
    for (const rel of row.attachments) {
      if (missing.has(rel)) push(`receipt ${rel} is linked but not in the vault`);
    }
    if (!row.paidBy) push('payer not recorded');
  }

  return {
    trip: ledger.trip,
    status: ledger.status,
    claimItems: claim.length,
    excludedItems: excluded.length,
    gaps,
    complete: gaps.length === 0 && claim.length > 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , target] = process.argv;
  if (!target) {
    console.error('Usage: node check-reimbursement-gaps.mjs <threadId|trip name>');
    process.exit(1);
  }
  const relPath = findLedgerRelPath(target);
  if (!relPath) {
    console.error(`No ledger found matching "${target}"`);
    process.exit(1);
  }
  const raw = readFileSync(join(VAULT_ROOT, relPath), 'utf-8');
  console.log(JSON.stringify({ ledgerRelPath: relPath, ...checkGaps(relPath, raw) }, null, 2));
}
