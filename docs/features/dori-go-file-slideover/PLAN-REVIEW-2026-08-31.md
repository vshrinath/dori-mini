# Review of Antigravity's Slice 1 implementation plan

Reviewed against `dori-go-file-slideover/` and `dori-go-global-search/`'s
`requirements.yaml` + `tech-constraints.yaml` (both `build-ready`). Source
plan: `implementation_plan.md`, "Slice 1: File Slideover & Global Search."

## 1. Editor strategy — re-opens a settled, build-ready decision

The plan's "User Review Required" section proposes Option A (plain
markdown/text editor, zero new deps) as the *recommended* starting point,
with Tiptap only as a possible later upgrade.

This was already decided and is not open: `tech-constraints.yaml`'s
`constraint.slideover.base-editor-is-minimal-tiptap` requires a minimal
Tiptap instance specifically. A plain-text/markdown editor was considered
during scoping and rejected -- it would expose raw markdown syntax to a lay
user, which contradicts Dori Go's core positioning (see
`docs/decisions/log.md`, 2026-08-31 entry, and the requirement's own note in
`requirements.yaml`).

**Action**: build `FileSlideover.jsx`'s edit mode with `@tiptap/react` +
`@tiptap/starter-kit` directly. No block picker, no Council integration, no
embedded per-file chat (`constraint.slideover.no-embedded-chat`). Please
read `tech-constraints.yaml` for a feature before treating anything in
`requirements.yaml` as still open -- the constraints file is exactly where
settled, non-negotiable calls like this one live.

## 2. `save_document`'s path input is weaker than required

Proposed schema: `{ path: z.string().min(1), content: z.string() }`,
validated only for staying inside `VAULT_ROOT` (path-traversal prevention).

`constraint.slideover.write-path-is-server-derived` requires more: the
action must write *only* to the vault-relative path the document was
opened with -- it must not accept an arbitrary in-vault path from the
renderer at all. The proposed version stops the renderer from escaping the
vault, but not from overwriting a *different* document than the one
actually open in the slideover, if a caller (buggy or otherwise) supplies a
different `path`.

**Action**: derive the write target server-side from the open document's
session/context rather than trusting a `path` field the caller supplies
directly. (Exact mechanism -- e.g. the action takes an opaque handle from
the `get_document` call rather than a raw path -- is an implementation
choice; the constraint is the non-negotiable part, not the mechanism.)

## 3. Reindexing — a real gap, half-caught

Good catch overall: the plan correctly identifies that a save needs to
update the search index, which our original `requirements.yaml` had missed
entirely (now fixed -- see `dori-go.slideover.reindex-on-save`, added
2026-08-31 specifically because this review surfaced it).

But the plan only mentions updating the FTS index. Every existing
vault-write action (`capture-text.mjs`) runs **both**:

```
execFileSync('node', [join(HERE, 'reindex-vault.mjs')], { stdio: 'ignore' });
execFileSync('node', [join(HERE, 'semantic-index.mjs'), 'index', absPath], { stdio: 'ignore' });
```

FTS-only leaves semantic search silently stale after every edit.

**Action**: `save-document.mjs` should call both, non-fatally (indexing
failure must not fail or roll back the save itself), matching
`capture-text.mjs`'s existing pattern exactly. See
`constraint.slideover.reindex-matches-existing-convention` (new).

## What's already right, no change needed

- Search-result selection opens the same `FileSlideover` component Library
  uses (`constraint.search.result-selection-opens-slideover`) -- correct,
  one file-viewing mechanism.
- `LibraryView.jsx`'s click handler updated to open the slideover instead
  of navigating to the retired full-page `ArticleViewer` -- correct.
- `SearchModal`/`FileSlideover` mounted at root so they're reachable from
  any screen -- matches the "consistent regardless of entry point" intent.
- Verification plan already runs `node scripts/dori-build-check.mjs` --
  good, keep doing that as the seam evolves and remember to move affected
  criteria in `verification-record.yaml` from `blocked`/`not_done` to
  `not_done`/`done` as real evidence lands, not just at the very end.
