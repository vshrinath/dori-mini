# Expenses, trip ledgers, reimbursements

The `dori` CLI command in `SKILL.md`'s table comes first. The scripts below (`~/.claude/skills/dori/...`, a link to this repo) and their `dori-mini` MCP tools are the fallback, for the gaps that table names.

## 6. Expense/bill message (mentions spending money, no document attached)

**No CLI equivalent yet (gap 10):** trip ledgers, expense routing, gap checks and closing a trip all stay on the scripts and MCP tools below. A receipt file can still go in with `dori capture --file <receipt>`, which routes it.

When the user pastes/types a message that describes an expense ("spent $45 on lunch", "paid $120 for the taxi on the Denver trip") with no file attached — a receipt or invoice file attachment is document routing (branch 2's receipt sub-case, `attach-receipt.mjs`), not this branch:

```bash
node ~/.claude/skills/dori/expense-router.mjs "<the message text>"
```

This mirrors `dori-engine/src/finance/trip-ledger.ts` + the `finance.add_trip_expense` action's row shape — real Dori has no deterministic router for plain-text expense messages (it leaves that to the AI agent's own judgment), so this prototype makes that judgment reproducible instead of ad hoc. It is decision-only, like `route-meeting.mjs` — it never writes to a ledger file. Act on `action`:

- `not_expense` — no dollar/rupee amount found in the message; don't route it as an expense.
- `moved` (message explicitly named a trip that matched exactly one open ledger) — append `row` to `ledger.relPath` yourself (read the file, append the line), no need to ask.
- `suggested` (exactly one trip ledger exists, no explicit name needed) — advisory only. Tell the user the row would go to that trip and confirm before appending.
- `conflict` (2+ open trip ledgers, no explicit match) or `none` (zero trip ledgers exist) — a `ClarificationRecord` is written automatically under domain `expense.route` (see `clarification-store.mjs`). Still ask the user in the same turn — never guess which trip. If they pick "create new trip," seed a new ledger first — see `dori-vault-conventions.md` for the exact frontmatter/threadId shape (`expense-router.mjs` exports `buildTripLedgerSeed` for this).

After appending a row (or seeding + appending), reindex the file exactly like any other vault write (see "Vault index" below).

To answer questions about existing ledgers (totals, what's outstanding, a specific trip's rows) rather than just full-text search:
```bash
node ~/.claude/skills/dori/query-ledger.mjs list
node ~/.claude/skills/dori/query-ledger.mjs show "<threadId or trip name>"
```
Mirrors `trip-ledger.ts`'s `parseTripLedger` column-matching exactly (including BUG-010: a row missing a date/amount is retained and flagged `incomplete`, never silently dropped). Read-only — use this instead of grepping ledger tables by hand.

## Before submitting a reimbursement

Run the gap check on either trigger, not just one:
- **Explicit submit** — the user asks to submit/finalize a trip's reimbursement claim (i.e. call or simulate `finance.set_reimbursement_status` with `status: submitted`).
- **Trip-completion cue** — the user reports an open trip as done ("back from the Denver trip", "that trip's wrapped up") with no "submit" wording at all. Only fire on this when the message names an existing open trip (literal match against its `trip` frontmatter, same discipline as `expense-router.mjs`'s trip matching) plus a completion cue — don't fuzzy-trigger off trip mentions alone.

Either way, check for gaps first — real Dori's own submit action does **not** do this itself (only its separate `finance.consolidate_trip_reimbursement` package-assembly action does), so nothing stops a claim with missing evidence from being submitted unless this check runs:

```bash
node ~/.claude/skills/dori/check-reimbursement-gaps.mjs "<threadId or trip name>"
```

Mirrors `trip-ledger.ts`'s `detectClaimGaps` exactly (shared by both real consolidate and set-status actions): for every reimbursable row, flags a missing date, missing/unreadable amount, no receipt attached (the common case for a voice-note or spoken expense filed via `expense-router.mjs` — it naturally lands with the Attachment column empty, no separate "mark it" step needed), a linked receipt that isn't actually in the vault, or no payer recorded. If `gaps` is non-empty, warn the user with the specific rows/issues before proceeding — don't submit silently.

**Closing/submitting a trip** ("close out the Denver trip", "submit this reimbursement", "mark it paid") — mirrors real Dori's `finance.consolidate_trip_reimbursement` (package doc) and `finance.set_reimbursement_status` (status transition) together:
```bash
node ~/.claude/skills/dori/close-trip.mjs "<threadId or trip name>" [--status submitted|paid]
```
Always writes/refreshes a `<threadId>-reimbursement-package.md` next to the ledger — a claim-items table, an excluded-rows table, the same gap list as above, and a plain "paste this into an email" handoff note. No zip: real Dori doesn't produce one either. `--status` is forward-only (`draft` → `submitted` → `paid`) and rejects backward/sideways moves, matching the real guard — gaps are reported but never block the transition, same as real Dori (submit and consolidate are deliberately separate actions).
