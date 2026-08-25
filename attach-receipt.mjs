#!/usr/bin/env node
// Mirrors dori-engine/src/actions/definitions/finance-attach-trip-receipt.ts +
// trip-ledger.ts's row/supersede helpers — the actual "photo a receipt, get a
// ledger row" mechanism the marketing site demos (docs/guide.html,
// docs/whatsapp.html), which previously had NO script behind it at all.
//
// Real Dori extracts date/vendor/amount via a vision-model OCR step
// (resolveInvoiceRecord) inside the action. This prototype has no OCR model
// of its own — the calling agent (Claude Code, Codex, etc.) is itself
// multimodal, so it reads the receipt image/PDF directly and passes the
// extracted fields as CLI args. Everything downstream — ledger seeding,
// idempotent marker-based append, booking-ref/supersedes replacement — mirrors
// the real action's logic exactly. No captureId/job-record system exists here
// (that's dori-engine's async capture-intake pipeline), so identity for
// idempotency/supersede is a simple caller-provided --id instead.
//
// Usage:
//   node attach-receipt.mjs <path-to-receipt-file> --date YYYY-MM-DD --desc "<vendor/description>" --amount <n>
//     --thread <threadId>            # omit to list open trips + record a clarification, mirrors recordUncertainTrip
//     [--trip "<display name>"] [--account <slug>]     # only used when seeding a brand-new ledger
//     [--category Travel] [--tax <n>] [--paid-by self] [--reimbursable true|false]
//     [--booking-ref <ref>] [--supersedes <id>] [--id <stable-id>]
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, posix as pathPosix, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { create as createClarification } from './clarification-store.mjs';
import { buildTripLedgerSeed, buildLedgerRow } from './expense-router.mjs';
import { loadLedgers } from './query-ledger.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const TRIPS_DIR = join(VAULT_ROOT, 'finances/trips');

const TRIP_CANDIDATE_LIMIT = 10;

/** Mirrors trip-ledger.ts's normalizeBookingRef/bookingRefMarker exactly. */
function normalizeBookingRef(ref) {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function bookingRefMarker(ref) {
  return `<!-- ref:${normalizeBookingRef(ref)} -->`;
}
function supersededMarker(byId) {
  return `<!-- superseded-by:${byId} -->`;
}
function idMarker(id) {
  return `<!-- capture:${id} -->`;
}

function splitCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function headerIndexes(lines) {
  const header = lines.find((l) => l.trim().startsWith('|') && /\bdate\b/i.test(l));
  const cells = header ? splitCells(header) : [];
  return {
    description: cells.findIndex((c) => /description|source|vendor/i.test(c)),
    reimbursable: cells.findIndex((c) => /reimbursable/i.test(c)),
  };
}

/** Mirrors markRowSuperseded in trip-ledger.ts exactly: annotate the row, flip Reimbursable to no, tag with a superseded-by marker. Never deletes. */
function markRowSuperseded(content, targetMarkers, byId) {
  const markers = targetMarkers.filter((m) => m && m !== idMarker(byId));
  if (markers.length === 0) return null;
  const lines = content.split('\n');
  const rowIndex = lines.findIndex(
    (line) => markers.some((m) => line.includes(m)) && !/<!--\s*superseded-by:/.test(line),
  );
  if (rowIndex < 0) return null;

  const { description, reimbursable } = headerIndexes(lines);
  const cells = splitCells(lines[rowIndex]);
  if (description >= 0 && description < cells.length) {
    cells[description] = `${cells[description]} (superseded by ${byId})`;
  }
  if (reimbursable >= 0 && reimbursable < cells.length) cells[reimbursable] = 'no';
  cells.push(supersededMarker(byId));
  lines[rowIndex] = `| ${cells.join(' | ')}`;
  const captureMatch = /<!--\s*capture:([^\s]+)\s*-->/.exec(lines[rowIndex]);
  return { content: lines.join('\n'), supersededId: captureMatch?.[1] ?? '' };
}

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      opts[rest[i].slice(2)] = rest[i + 1];
      i++;
    }
  }
  return { file, opts };
}

function resolveLedgerRelPath(threadId) {
  for (const relPath of [`finances/trips/${threadId}.md`, `finances/reimbursements/${threadId}.md`]) {
    if (existsSync(join(VAULT_ROOT, relPath))) return relPath;
  }
  return null;
}

function recordUncertainTrip(file, opts) {
  const candidates = loadLedgers()
    .slice(0, TRIP_CANDIDATE_LIMIT)
    .map((l) => ({ id: `trip:${l.threadId}`, label: l.ledger.trip || l.threadId, detail: l.relPath }));
  const clarification = createClarification({
    domain: 'finance.trip_receipt',
    key: opts.id || file,
    prompt: opts.trip
      ? `Which trip does this receipt belong to? (suggested: ${opts.trip})`
      : 'Which trip does this receipt belong to?',
    candidates,
    context: { file, ...opts },
  });
  return {
    success: false,
    needsClarification: true,
    clarificationId: clarification.id,
    candidates: clarification.candidates,
  };
}

export function attachReceipt(file, opts) {
  if (!existsSync(file)) throw new Error(`Receipt file not found: ${file}`);
  if (!opts.date) throw new Error('--date is required');
  if (!opts.desc) throw new Error('--desc is required');
  if (opts.amount === undefined) throw new Error('--amount is required');

  if (!opts.thread) return recordUncertainTrip(file, opts);
  const threadId = opts.thread;

  let ledgerRelPath = resolveLedgerRelPath(threadId);
  if (!ledgerRelPath) {
    ledgerRelPath = `finances/trips/${threadId}.md`;
    mkdirSync(TRIPS_DIR, { recursive: true });
    writeFileSync(
      join(VAULT_ROOT, ledgerRelPath),
      buildTripLedgerSeed({ threadId, account: opts.account, trip: opts.trip }),
    );
  }

  const id = opts.id || createHash('sha256').update(file).digest('hex').slice(0, 16);
  const marker = idMarker(id);
  const ledgerAbsPath = join(VAULT_ROOT, ledgerRelPath);
  const ledgerDir = pathPosix.dirname(ledgerRelPath);

  let content = readFileSync(ledgerAbsPath, 'utf-8');
  if (content.includes(marker)) {
    return { success: true, alreadyAttached: true, threadId, ledgerPath: ledgerRelPath, id };
  }

  // Finalize the attachment: copy the receipt into the ledger's own folder,
  // mirroring finalizeCapture's targetDir (dirname of the ledger path).
  let attachmentName = basename(file);
  let attachmentAbsPath = join(VAULT_ROOT, ledgerDir, attachmentName);
  if (existsSync(attachmentAbsPath)) {
    attachmentName = `${id}-${attachmentName}`;
    attachmentAbsPath = join(VAULT_ROOT, ledgerDir, attachmentName);
  }
  copyFileSync(file, attachmentAbsPath);

  const bookingRef = opts['booking-ref'];
  const row = buildLedgerRow({
    date: opts.date,
    description: opts.desc,
    category: opts.category || 'Travel',
    amount: opts.amount,
    tax: opts.tax,
    paidBy: opts['paid-by'],
    reimbursable: opts.reimbursable === undefined ? undefined : opts.reimbursable !== 'false',
    attachmentCol: `[Receipt](${attachmentName})`,
    marker,
  });
  const rowWithRef = bookingRef ? `${row} ${bookingRefMarker(bookingRef)}` : row;

  // Supersede before appending — the replacement carries the same booking
  // ref, so it would otherwise match itself (matches the real action's order).
  const targetMarkers = [
    ...(opts.supersedes ? [idMarker(opts.supersedes)] : []),
    ...(bookingRef ? [bookingRefMarker(bookingRef)] : []),
  ];
  let supersededId;
  const superseded = markRowSuperseded(content, targetMarkers, id);
  if (superseded) {
    content = superseded.content;
    supersededId = superseded.supersededId;
  }

  const finalContent = content.endsWith('\n') ? `${content}${rowWithRef}\n` : `${content}\n${rowWithRef}\n`;
  writeFileSync(ledgerAbsPath, finalContent);

  return {
    success: true,
    alreadyAttached: false,
    threadId,
    ledgerPath: ledgerRelPath,
    id,
    attachmentPath: pathPosix.join(ledgerDir, attachmentName),
    ...(supersededId !== undefined ? { supersededId } : {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { file, opts } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Usage: node attach-receipt.mjs <path-to-receipt-file> --date <YYYY-MM-DD> --desc "<text>" --amount <n> [--thread <threadId>] [--trip "<name>"] [--account <slug>] [--category <cat>] [--tax <n>] [--paid-by <name>] [--reimbursable true|false] [--booking-ref <ref>] [--supersedes <id>] [--id <stable-id>]');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(attachReceipt(file, opts), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
