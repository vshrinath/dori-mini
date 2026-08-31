---
name: requirements-completeness
description: Sweep a feature's requirements.yaml for coverage gaps that no test-fidelity check can catch — claims that are themselves under-specified (e.g. never mention a platform, a failure path, or a permission boundary), not tests unfaithful to a claim that's already written down. Use when asked to audit requirement completeness, check whether test coverage is thorough, find missing test cases, sanity-check a feature before calling it fully verified, or asks "are we actually covering everything" for a feature.
---

# Requirement completeness sweep

`check-verification-semantics.mjs` asks one question: is this test faithful
to the claim next to it? It cannot catch a different problem — a claim that
never named the thing that's missing. A criterion faithful to an incomplete
requirement still passes that check.

Real precedent: a job processor's test suite covered the portal/Graphile
write path. It never touched the Desktop sqlite-git tick. The suite stayed
green throughout, because the requirement never said the behavior must also
work on the Desktop path.

This skill runs `scripts/check-requirements-completeness.mjs`, the tool built
for that gap. It then does what a bare script can't: it triages the raw
findings and asks you about the ones that are genuinely ambiguous. It does
not guess on your behalf.

The script never edits `requirements.yaml` or `verification-record.yaml`. Neither does
this skill. It produces a triaged report, and questions where needed.
Drafting new criteria is a separate, later pass — see "After the sweep"
below. Do not start drafting mid-triage.

## 1. Run the sweep

```
node scripts/check-requirements-completeness.mjs <feature> [--claude|--both]
```

Run it for the **whole feature** — do not narrow to one requirement ID. This is
a full sweep, not a spot check. Pick a reviewer that did not author the
requirements (verifier != primary) — the same rule every other reviewer script
in this repo follows. The default, with no flag, is Grok.

If the feature has many requirements and cost matters, scope a first pass to
`version: mvp` requirements. Grep `requirements.yaml` for their IDs and pass them
explicitly. Come back for `v1` requirements later. State this scoping
explicitly — never silently check only part of the feature.

The script produces two kinds of raw finding per requirement.
- **structural**: a named file sits next to a cited test, but the test
  never reaches it. Implemented, never proven.
- **checklist**: a sandboxed reviewer marks one of five fixed dimensions
  `NOT_COVERED`, from the requirement's own text. The five: platform/surface,
  failure/retry, concurrency, edge input, permission boundary.

Neither is a verified finding yet. Both need triage before anyone acts on
them, same as any other reviewer output in this repo.

## 2. Triage every finding — full sweep first, no stopping mid-way

Read every finding across every requirement before you resolve any single one.
Document the whole sweep first; fix things after. This is deliberate — stop
to argue about finding #1 while findings #2–40 sit unread, and the sweep
quietly becomes a partial one.

This mirrors the `review-triage` skill's own triage-then-fix separation.
Apply the same verification discipline: check the actual current code or
requirement text first, and the reviewer's own reasoning last. Classify each
finding into exactly one bucket:

- **confirmed-gap** — you verified it directly. For a structural finding:
  open the named file. Confirm it is real production code, with no other
  proof anywhere in the feature. It must not be a re-export or a dead file.
  For a checklist finding: re-read the requirement's `situation`/`expected`/
  `failure`/`variants` text yourself. Confirm the dimension really is not
  addressed — the reviewer can misread phrasing.
- **not-actually-missing** — the reviewer was wrong, stale, or the
  dimension genuinely doesn't apply to this requirement (e.g. a requirement with
  no notion of "who's allowed to do this" has no permission boundary to
  cover). Verify before dismissing; don't wave away a finding just because
  it's inconvenient.
- **genuinely-ambiguous** — the gap is plausible. But *whether to cover it*
  is a product call, not something more code-reading can settle. Example:
  should task creation define concurrent-edit behavior, or is that out of
  scope for MVP? The answer depends on intent no file states.

Attach each **confirmed-gap** and **genuinely-ambiguous** finding to its
requirement's existing `version` (mvp/v1) and `priority` fields. Do not invent
a separate must-have/nice-to-have tag. A gap on a `version: mvp`,
`priority: high` requirement is more urgent than the same gap on a
`version: v1` requirement. The file already says which is which.

## 3. Report in plain language

Once you triage the whole sweep, write a summary a non-technical reader can
act on. Translate "structural" and "NOT_COVERED" into what is actually
missing — not the tool's own vocabulary. Group the report by requirement. Lead
with confirmed gaps on `mvp`/high-priority requirements. State plainly which
findings you dismissed as not-actually-missing, and why — so the sweep
reads as complete, not silently filtered.

## 4. Ask about the genuinely-ambiguous bucket — once, batched

For every genuinely-ambiguous finding, ask the user with `AskUserQuestion`.
Batch these into as few questions as the tool allows — do not ask one at a
time across separate turns. Phrase each question in plain language, with
enough requirement context that the user does not need to look anything up.
Do not ask about confirmed-gap or not-actually-missing findings. Those need
only a fix, or a note explaining why not — never a decision.

If nothing is genuinely ambiguous, say so. A clean sweep with zero
questions is a valid, useful outcome — not a sign the sweep was too
shallow.

## After the sweep

Drafting new criteria or requirement text to close a confirmed gap is a
separate pass, not a continuation of this one. Once you settle triage and any
questions, stop. Summarize what is ready to fix. Only start
drafting fixes if the user explicitly asks you to continue now.
