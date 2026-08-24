#!/usr/bin/env node
// Mirrors dori-engine/src/finance/trip-ledger.ts + the finance.add_trip_expense
// action's row shape, and mirrors route-meeting.mjs's decision-table shape
// (moved/suggested/conflict/none) for the one thing real Dori does NOT have a
// deterministic router for: turning a plain-text expense message ("spent $50
// on lunch") into a ledger row. Real Dori leaves that to the AI agent's own
// judgment when calling finance.add_trip_expense — see chat-classifier.ts's
// "other": expense entries handled elsewhere. This prototype makes that
// judgment reproducible: parse the message deterministically, then apply the
// same never-guess-a-destination discipline meetings get.
//
// Like route-meeting.mjs and route-destination.mjs, this is DECISION-ONLY —
// it does not write to any ledger file. It returns the row text and target
// path; the caller appends it (or asks the user first, per `action`).
//
// Usage: node expense-router.mjs "<message text>"
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { create as createClarification } from './clarification-store.mjs';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const TRIPS_DIR = join(VAULT_ROOT, 'finances/trips');
const REIMBURSEMENTS_DIR = join(VAULT_ROOT, 'finances/reimbursements');

// Mirrors trip-ledger.ts's LEDGER_HEADER exactly.
export const LEDGER_HEADER = `| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
`;
const NO_ATTACHMENT_CELL = '—';

/** Mirrors buildTripLedgerSeed in trip-ledger.ts exactly — used when the user picks "create new trip". */
export function buildTripLedgerSeed({ threadId, account, trip }) {
  const lines = [
    '---',
    'type: reimbursement',
    `threadId: ${threadId}`,
    ...(account ? [`account: ${account}`] : []),
    ...(trip ? [`trip: ${trip}`] : []),
    'status: draft',
    '---',
    '',
    '# Trip Ledger',
    '',
    LEDGER_HEADER,
  ];
  return lines.join('\n');
}

const UNBOUND_CHOICES = [{ id: 'create_new_trip', label: 'Start a new trip ledger for this expense' }];

// Deliberately simple, deterministic word list — real classify.ts uses regex
// patterns for invoice/receipt detection, not an LLM. Same spirit here: no
// model call for a decision this mechanical. Extend, don't fuzzy-match.
const CATEGORY_KEYWORDS = [
  { category: 'Food', words: ['lunch', 'dinner', 'breakfast', 'coffee', 'snack', 'meal', 'restaurant'] },
  { category: 'Transport', words: ['uber', 'taxi', 'cab', 'flight', 'train', 'metro', 'fuel', 'gas', 'parking'] },
  { category: 'Lodging', words: ['hotel', 'stay', 'airbnb', 'room'] },
];

// Matches $50, $50.25, 50 dollars, ₹500, Rs 500, INR 500, 500 INR.
const AMOUNT_RE = /(?:[$₹]|Rs\.?\s*|INR\s*)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars?|USD|INR|rupees?)/i;

export function extractExpense(message) {
  const m = message.match(AMOUNT_RE);
  if (!m) return null;
  const amount = Number(m[1] || m[2]);
  const description = message
    .replace(AMOUNT_RE, '')
    .replace(/\b(spent|paid|cost|for|on|about|around|roughly)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Expense';
  const lower = message.toLowerCase();
  const hit = CATEGORY_KEYWORDS.find((c) => c.words.some((w) => lower.includes(w)));
  return { amount, description, category: hit ? hit.category : 'Travel' };
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

function loadTripLedgers() {
  const ledgers = [];
  for (const dir of [TRIPS_DIR, REIMBURSEMENTS_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const relPath = `finances/${dir === TRIPS_DIR ? 'trips' : 'reimbursements'}/${f}`;
      const fm = parseFrontmatter(readFileSync(join(dir, f), 'utf-8'));
      if (!fm.threadId) continue;
      ledgers.push({ threadId: fm.threadId, trip: fm.trip || fm.threadId, account: fm.account, status: fm.status || 'draft', relPath });
    }
  }
  return ledgers;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// Literal substring match of a ledger's `trip` name against the message —
// same discipline as matchPerson's literal (not fuzzy) match in route-meeting.mjs.
function explicitMatches(message, ledgers) {
  const norm = normalize(message);
  return ledgers.filter((l) => l.trip && norm.includes(normalize(l.trip)));
}

/** Mirrors buildLedgerRow in trip-ledger.ts exactly (column order, defaults, marker suffix). */
export function buildLedgerRow({ date, description, category, amount, tax, paidBy, reimbursable, attachmentCol, marker }) {
  const payer = paidBy || 'self';
  const reimbursableCell = reimbursable === false ? 'no' : 'yes';
  const taxCell = tax ?? '';
  const attachment = attachmentCol || NO_ATTACHMENT_CELL;
  return `| ${date} | ${description} | ${category} | ${amount} | ${taxCell} | ${payer} | ${reimbursableCell} | ${attachment} | ${marker}`;
}

// key: caller-stable identity for this message (e.g. a chat message id), so
// re-running the router for the same message dedupes onto one clarification
// instead of stacking duplicates — mirrors routeMeeting's `key` param.
export function routeExpense(message, key) {
  const expense = extractExpense(message);
  if (!expense) {
    return { action: 'not_expense', reason: 'no amount found in message — not routed as an expense' };
  }

  const ledgers = loadTripLedgers();
  const clarificationKey = key || message;
  const date = new Date().toISOString().split('T')[0];
  const marker = `<!-- manual:${randomUUID()} -->`;

  const explicit = explicitMatches(message, ledgers);
  if (explicit.length === 1) {
    // Strip the matched trip name out of the description — it's redundant
    // once the row is already filed under that trip's ledger.
    const tripRe = new RegExp(explicit[0].trip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    const description = expense.description.replace(tripRe, '').replace(/^[\s:,-]+|[\s:,-]+$/g, '').trim() || expense.description;
    const row = buildLedgerRow({ date, description, category: expense.category, amount: expense.amount, marker });
    return { action: 'moved', expense: { ...expense, description }, ledger: explicit[0], row, reason: 'message explicitly named a trip that matched exactly one ledger' };
  }

  const row = buildLedgerRow({ date, description: expense.description, category: expense.category, amount: expense.amount, marker });

  const candidatePool = explicit.length > 1 ? explicit : ledgers;

  if (candidatePool.length === 0) {
    const record = createClarification({
      domain: 'expense.route',
      key: clarificationKey,
      prompt: `"${message}" looks like a $${expense.amount} expense but no trip ledger exists yet — start one, or where should this go?`,
      candidates: UNBOUND_CHOICES,
      context: { message, expense },
    });
    return { action: 'none', expense, candidates: UNBOUND_CHOICES, row, clarificationId: record.id, reason: 'no trip ledgers exist' };
  }

  if (candidatePool.length === 1) {
    return { action: 'suggested', expense, ledger: candidatePool[0], row, reason: 'only one trip ledger exists — advisory only, not auto-filed (mirrors Dori)' };
  }

  const candidates = [
    ...candidatePool.map((l) => ({ id: `trip:${l.threadId}`, label: l.trip, detail: l.relPath })),
    ...UNBOUND_CHOICES,
  ];
  const record = createClarification({
    domain: 'expense.route',
    key: clarificationKey,
    prompt: `"${message}" (≈$${expense.amount}) could belong to ${candidatePool.length} open trips — which one?`,
    candidates,
    context: { message, expense },
  });
  return { action: 'conflict', expense, candidates: candidatePool, row, clarificationId: record.id, reason: `${candidatePool.length} trip ledgers open and no explicit trip name matched — not auto-filing` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , message, key] = process.argv;
  if (!message) {
    console.error('Usage: node expense-router.mjs "<message text>" [key]');
    process.exit(1);
  }
  console.log(JSON.stringify(routeExpense(message, key), null, 2));
}
