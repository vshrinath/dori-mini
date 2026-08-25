#!/usr/bin/env node
// Mirrors dori-engine's finance.consolidate_trip_reimbursement (buildPackage(),
// src/actions/definitions/finance-consolidate-trip-reimbursement.ts) for the
// document, and finance.set_reimbursement_status's rewriteStatus() (same dir,
// finance-set-reimbursement-status.ts) for the status transition.
//
// No zip file, in real Dori either — confirmed: no archiver/zip dependency
// anywhere in dori-engine. Consolidate produces a single Markdown
// reimbursement-package.md, nothing more. Status is forward-only
// draft -> submitted -> paid (STATUS_ORDER); illegal/backward transitions
// are rejected, matching real Dori's guard. Gaps are reported here but never
// block a status change — same as real Dori (consolidate and status-change
// are deliberately separate actions; see check-reimbursement-gaps.mjs).
//
// Usage: node close-trip.mjs <threadId|trip name> [--status submitted|paid]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, posix as pathPosix } from 'node:path';
import { homedir } from 'node:os';
import { parseTripLedger } from './query-ledger.mjs';
import { checkGaps, findLedgerRelPath } from './check-reimbursement-gaps.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const STATUS_ORDER = ['draft', 'submitted', 'paid'];

const money = (n) => n.toFixed(2);

// parseTripLedger's return has no threadId field (it's read separately by
// every caller that needs it — findLedgerRelPath, query-ledger.mjs's
// loadLedgers) — same extraction here.
function readThreadId(raw) {
  return (raw.match(/^threadId:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
}

// Mirrors finance-set-reimbursement-status.ts's rewriteStatus(): one
// frontmatter rewrite (replace status, or insert if absent); leaving draft
// invalidates readiness, so `ready:` (if present) is forced false in the
// same write rather than a second document write.
export function rewriteStatus(raw, newStatus) {
  let out = /^status:\s*.+$/m.test(raw)
    ? raw.replace(/^status:\s*.+$/m, `status: ${newStatus}`)
    : raw.replace(/^---\n/, `---\nstatus: ${newStatus}\n`);
  if (/^ready:\s*.+$/m.test(out)) out = out.replace(/^ready:\s*.+$/m, 'ready: false');
  return out;
}

// Mirrors buildPackage(): claim-items table, excluded-rows table (if any),
// gaps section, and a static handoff note — real Dori deliberately has no
// trip-specific send path, this is just a vault document.
export function buildPackage(ledgerRelPath, ledger, gapsResult, threadId) {
  const claim = ledger.rows.filter((r) => r.reimbursable);
  const excluded = ledger.rows.filter((r) => !r.reimbursable);
  const claimTotal = claim.reduce((s, r) => s + r.amount, 0);
  const completeCount = claim.filter((r) => !r.incomplete).length;

  const fm = [
    'type: reimbursement-package',
    `threadId: ${threadId || ''}`,
    `ledger: ${ledgerRelPath}`,
    ledger.trip ? `trip: "${ledger.trip}"` : null,
    ledger.account ? `account: ${ledger.account}` : null,
    `status: ${ledger.status}`,
    `claimTotal: ${money(claimTotal)}`,
    `claimItems: ${completeCount}`,
    `gaps: ${gapsResult.gaps.length}`,
  ].filter(Boolean).join('\n');

  let body = `# Reimbursement package — ${ledger.trip || threadId}\n\n`;
  body += `Source ledger: [${ledgerRelPath}](${ledgerRelPath})\n\n`;
  body += `## Claim items\n\n`;
  body += `| Date | Description | Category | Amount | Tax | Evidence | Counted |\n`;
  body += `|------|-------------|----------|--------|-----|----------|---------|\n`;
  for (const row of claim) {
    const evidence = row.attachments.length === 0
      ? 'missing'
      : row.attachments.map((a) => (existsSync(join(VAULT_ROOT, a)) ? `[${a.split('/').pop()}](${a})` : `${a.split('/').pop()} (not found)`)).join(', ');
    body += `| ${row.date || ''} | ${row.description} | ${row.category || ''} | ${money(row.amount)} | ${money(row.tax)} | ${evidence} | ${row.incomplete ? 'no — incomplete' : 'yes'} |\n`;
  }

  if (excluded.length) {
    body += `\n## Excluded from the claim\n\n`;
    body += `| Date | Description | Amount | Payer | Reason |\n`;
    body += `|------|-------------|--------|-------|--------|\n`;
    for (const row of excluded) {
      body += `| ${row.date || ''} | ${row.description} | ${money(row.amount)} | ${row.paidBy || ''} | marked not reimbursable |\n`;
    }
  }

  body += `\n## Gaps\n\n`;
  body += gapsResult.gaps.length === 0
    ? 'None — every reimbursable item has a date, amount, and evidence.\n'
    : gapsResult.gaps.map((g) => `- ${g.description} (ledger line ${g.line}): ${g.issue}`).join('\n') + '\n';

  body += `\n## Handoff\n\nThis is just a vault document — deliver it however you already send things `
    + `(paste into an email, attach the file). There is deliberately no trip-specific send path here.\n`;

  return { markdown: `---\n${fm}\n---\n\n${body}`, claimTotal };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const target = args[0];
  const statusIdx = args.indexOf('--status');
  const newStatus = statusIdx >= 0 ? args[statusIdx + 1] : null;
  if (!target) {
    console.error('Usage: node close-trip.mjs <threadId|trip name> [--status submitted|paid]');
    process.exit(1);
  }

  const relPath = findLedgerRelPath(target);
  if (!relPath) {
    console.error(`No ledger found matching "${target}"`);
    process.exit(1);
  }

  let raw = readFileSync(join(VAULT_ROOT, relPath), 'utf-8');
  let ledger = parseTripLedger(relPath, raw);

  if (newStatus) {
    const fromIdx = STATUS_ORDER.indexOf(ledger.status);
    const toIdx = STATUS_ORDER.indexOf(newStatus);
    if (toIdx < 0) {
      console.error(`Unknown status "${newStatus}" — must be one of ${STATUS_ORDER.join(', ')}`);
      process.exit(1);
    }
    if (toIdx <= fromIdx) {
      console.error(`Cannot move status backward or sideways: ${ledger.status} -> ${newStatus}`);
      process.exit(1);
    }
    raw = rewriteStatus(raw, newStatus);
    writeFileSync(join(VAULT_ROOT, relPath), raw);
    ledger = parseTripLedger(relPath, raw);
  }

  const threadId = readThreadId(raw);
  const gapsResult = checkGaps(relPath, raw);
  const { markdown, claimTotal } = buildPackage(relPath, ledger, gapsResult, threadId);

  const dir = pathPosix.dirname(relPath);
  const idPart = threadId || (ledger.trip || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const packageRelPath = `${dir}/${idPart}-reimbursement-package.md`;
  writeFileSync(join(VAULT_ROOT, packageRelPath), markdown);

  console.log(JSON.stringify({
    ledgerRelPath: relPath,
    packageRelPath,
    status: ledger.status,
    claimTotal: money(claimTotal),
    gaps: gapsResult.gaps.length,
  }, null, 2));
}
