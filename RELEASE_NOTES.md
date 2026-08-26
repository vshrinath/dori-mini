# Release notes

What actually changed, for people running this — not an engineering log. Plain English,
newest first, no commit hashes. `update.sh` prints the new section(s) here (if any landed)
after a successful pull, instead of a raw commit list.

Mirrors real Dori's own `docs/RELEASE_NOTES.md` convention, sized down for this repo:
no version tags or CI here, so entries are grouped by date instead of SemVer.

## 2026-08-26 — Daily update checks, optional

`setup.sh` can now schedule `update.sh` to run once a day on its own (macOS only,
opt-in). You only get a desktop notification when it actually pulled something, or
when it's stuck and needs you — never on the routine "nothing new today."

## 2026-08-24 — An actual way to update

`update.sh` is new: `curl`'s installer only ever handled a first install. Existing
installs now have a real path to new scripts and fixes — `cd` into your install and
run `./update.sh`.

## 2026-08-20 — Watched inbox folder

Point it at a real folder (Downloads, a scanner's save spot) and it notices new files
once they stop changing, no pasting or attaching required. Opt-in during setup, or
turn it on any time by re-running `./setup.sh`.

## 2026-08-18 — Decisions from any note, not just meetings

Recall now finds decisions captured in any text, voice note, or document — not only
meeting minutes.

## 2026-08-16 — Merge duplicate people and organizations

Ran into the same person or company filed under two names? `entity-merge.mjs` folds
one into the other — keeps every alias, rewrites cross-references, never deletes the
losing file (just archives it).

## 2026-08-12 — Receipts go straight into the ledger

Drop a photographed or scanned receipt and it's routed into the right trip ledger row
automatically, same as a typed expense message.

## Earlier

Task extraction from meeting notes, a personal expense/reimbursement flow, morning and
evening digests, an optional WhatsApp channel, local semantic + full-text vault search,
and the original YouTube/document/meeting capture routing this all started from.
