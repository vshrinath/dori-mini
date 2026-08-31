# Decisions log

Lightweight decision records for dori-mini / Dori Go. One paragraph each: date,
decision, one-line why. See dori-build-system's docs/planning.md ("Lightweight
decision record") for the format this follows.

## 2026-08-31 — Three-tier product positioning: Dori Mini, Dori Go, Pro Dori

Dori Mini (this repo's CLI/MCP surface) is the power-user tier, used inside an
agent session. Dori Go (electron-app/) is the lay-user tier: a downloadable
desktop app giving the same underlying capability as Dori Mini through a
polished, native-feeling UI, no agent session required. Real Dori
(dori-engine/dori-portal) is the eventual Pro tier — more capability than Dori
Go, and the UI-quality bar Dori Go is chasing. Why: settles which product a
given feature request belongs to before scoping it, instead of re-litigating
per feature.

## 2026-08-31 — Dori Go's Pro boundary: parked, not permanently excluded

Threads, Workflows, multi-vault, social publishing, brand admin, engine
pairing, and publication rendering stay out of Dori Go for now (Pro-only).
Separately, relationships/people/accounts, finance (trip ledger, expenses,
receipts, reimbursement), decisions, and meeting-prep/routing already exist as
working dori-mini scripts (entity-merge.mjs, org-store.mjs, query-ledger.mjs,
expense-router.mjs, attach-receipt.mjs, check-reimbursement-gaps.mjs,
close-trip.mjs, decision-store.mjs, meeting-prep.mjs, route-meeting.mjs, and
related) but were never wired into actions.mjs, so they're invisible to Dori
Go today. These are staged as a fast-follow feature batch immediately after
v1, not parked indefinitely like the first group. Why: v1 stayed scoped to
composer/chat/editor/search rather than absorbing every discovered gap at
once, without losing track of which "missing" features are a deliberate Pro
boundary versus simply not-yet-wired-in.
