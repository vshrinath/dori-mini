# Dori vault — routing and naming conventions

Reference for destination/frontmatter when saving into your Dori vault. Read this instead of scanning existing vault files to infer the pattern.

## Two project trees exist — `projects/` is canonical, `entities/projects/` is a thin twin

- **`<vault>/projects/<path>/`** — the real canonical tree. `projects.create`, `projects.apply_template`, and capture-intake (`canonicalOutputPath`) all write here. Has a full `.setup.md`. **This is where actual project content belongs.**
- **`<vault>/entities/projects/<leaf>/`** — a flat, top-level-only "twin" (that's Dori's own term for it — see `dori-engine/src/project-tree/rename.ts`'s `renameEntitiesTwin`, `vector-reindex.ts`, `vault-path-rewrite.ts`). Only `meeting-router.ts`/`meeting-route.ts` write here (meetings only, via lazy `mkdirSync`, no full project scaffolding), and project renames keep the twin's directory name in sync.

**Do not treat `entities/projects/` as the canonical tree.** If a project's `entities/projects/<leaf>/` folder ever holds more than `meetings/` + `.setup.md`, that's leftover manual/historical duplication, not a pattern to extend — restore/reconcile against `projects/<path>/` instead.

## Default destination

The vault root is configurable (`VAULT_ROOT` env var) — do not ask "where should this go" for a plain capture; compute it:
- **Fresh capture (YouTube/document/URL/plain text, not yet meeting-routed):** `route-destination.mjs` in this skill's directory mirrors `dori-engine/src/jobs/schema.ts` `canonicalOutputPath` — `yt/` (or `yt/<project>/` when project-scoped) for YouTube, `references/clippings/` for other reference-worthy kinds, `projects/<path>/` (only if a project was explicitly given), or `inbox/` as the real Dori default when no project is known. Never guess a project for a bare capture — that's Dori's own rule, not just this mirror's.
  - YouTube used to go to `references/youtube/` here, matching Dori's own code at the time — that turned out to be a real bug (nothing in `dori-portal` ever rendered from that path; only `yt/${relPath}` does). Fixed upstream in `dori-engine` and mirrored here.
- **Meeting transcript → minutes:** `route-meeting.mjs` mirrors `dori-engine/src/workflows/meeting-router.ts`'s attendee-vote decision table against `entities/people/*.md`. Run it, then act on `action`:
  - `moved` (2+ attendees agree on one project) → auto-file to `entities/projects/<slug>/meetings/`, no need to ask.
  - `suggested` (exactly one attendee match) → advisory only. Tell the user the suggested destination and ask before filing — this mirrors Dori's own behavior (it writes `suggested_destination` into frontmatter but does not move the file either).
  - `conflict` or `none` → a `ClarificationRecord` is written automatically (see `clarification-store.mjs`). Still ask the user in the same turn — never guess.

## Example: how a stale reference looks and how to fix it

Vault data can drift — e.g. a person's `entities/people/*.md` lists `projects: ["acme-widgets-v2"]`, but the actual project folder is `entities/projects/acme-widgets/` (renamed at some point, and one reference file missed the update). Because Dori's router does a literal string match (not fuzzy), this kind of mismatch causes real mis-routing — a new, wrong folder gets created instead of filing into the existing one. When you find this pattern: it's a vault Markdown fix (safe to edit directly), not something to silently work around in the router. Fix the stale field, re-run the router, confirm it now resolves correctly.

## Filename
`YYYY-MM-DD-<slug>.md`, append `-mom.md` when the file is processed minutes (vs. a raw transcript capture). Dori's own filenames (`canonicalOutputPath`) use `<date>-<source>-<kind>-<time>-<suffix>.md` for non-meeting captures — `route-destination.mjs` reproduces that shape; exact byte-for-byte filenames don't matter for compatibility, folder placement and frontmatter do.

## Frontmatter
```yaml
---
date: 'YYYY-MM-DD'
title: "Meeting title"
type: meeting
account: <project-slug>        # omit if personal/cross-account
people:
  - first-last                 # one slug per attendee, lowercase hyphenated
topics:
  - topic-slug                 # 3-8 reusable theme slugs, lowercase hyphenated
fathom_recording_id: "123"     # only when sourced via fetch-fathom.mjs
---
```

Confirm the destination folder still exists rather than assuming — projects vary in whether they've adopted the `meetings/` subfolder yet.

## Expense message → trip ledger

`expense-router.mjs` mirrors `dori-engine/src/finance/trip-ledger.ts`'s row shape and the `finance.add_trip_expense` action — but real Dori has no deterministic router for a plain-text expense message, only for the file it's attached to (invoice/receipt classification). This script fills that gap. Run it, then act on `action`:

- `moved` (message explicitly named a trip that matched exactly one ledger) → append `row` to `ledger.relPath`, no need to ask.
- `suggested` (exactly one open trip ledger, no explicit name needed) → advisory only, confirm before appending.
- `conflict`/`none` → a `ClarificationRecord` (domain `expense.route`) is written automatically. Still ask which trip before filing — never guess.

Ledgers live at `finances/trips/<threadId>.md` (or `finances/reimbursements/<threadId>.md` once submitted) — never `entities/` or `projects/`, this is its own tree. `threadId` follows Dori's own `thread_<uuid>` shape (e.g. `thread_29c6b78e-0fd4-409c-91cc-c60a208934e1`) — generate one with `node -e "console.log('thread_' + crypto.randomUUID())"` when seeding a new ledger for a "create new trip" choice.

New ledger seed (frontmatter + empty table), produced by `expense-router.mjs`'s exported `buildTripLedgerSeed`:
```yaml
---
type: reimbursement
threadId: thread_<uuid>
account: <project-slug>        # omit if personal
trip: Trip Display Name
status: draft
---

# Trip Ledger

| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
```
Row format (what `expense-router.mjs` returns as `row`, append as-is):
```
| YYYY-MM-DD | Description | Category | Amount | Tax | Payer | yes/no | — | <!-- manual:<uuid> -->
```
`status` here tracks reimbursement lifecycle (`draft` → `submitted` → `paid`), separate from the trip being open/closed — this script has no visibility into that (it only reads the vault, not Dori's thread store), so it treats every ledger file it finds as a live candidate.

Before advancing `status` to `submitted`, run `check-reimbursement-gaps.mjs` — see "Before submitting a reimbursement" in `SKILL.md`. Real Dori's own submit action doesn't run this check itself (only the separate consolidate-package action does), so it's easy to submit a claim with a voice-note expense that has no receipt unless this is checked explicitly.

## Fathom-sourced meetings

`fetch-fathom.mjs` (this skill's directory) dedups against re-filing by scanning every vault `.md` for `fathom_recording_id: <id>` in frontmatter — always set this field when a meeting's minutes came from a Fathom fetch rather than a pasted transcript. Without it, the same call would resurface as "unfiled" on every future `list`.
