# Recall: search, multi-fact questions, decisions, tasks, meeting prep

The `dori` CLI command in `SKILL.md`'s table comes first. The scripts below (`~/.claude/skills/dori/...`, a link to this repo) and their `dori-mini` MCP tools are the fallback, for the gaps that table names.

## Vault index (search cache)

**CLI first:** `dori search "<query>" [--limit N]` (hybrid full-text + vectors over Dori's vault; 6–15 s today, gap 1), then `dori vault read <path>` or `dori artifacts get <id>` for the hits that matter. The engine indexes its own writes, so nothing below is needed after a CLI write. The scripts below are the fallback, and the multi-query advice further down applies to `dori search` just the same. "Last meeting with X": `dori search "<name> meeting"` and check `dori people get <id>` for `met_with` links.

After writing any file into `dori/dori-vault/`, run:
```bash
node ~/.claude/skills/dori/reindex-vault.mjs "<absolute-path-to-the-file-just-written>"
```
This upserts just that one file directly into dori-portal's real `vault_documents`/`vault_documents_fts` table at `~/proto-space/dori/store/portal.db` — not a separate cache; if `pnpm dev` is running, the live portal app's own search sees the row immediately, no rebuild step needed there. The `.md` files stay canonical.

For vault recall, run `query-vault.mjs` — do not `SELECT content`, and do not `Read` the Markdown file:
```bash
node ~/.claude/skills/dori/query-vault.mjs last-meeting --person "Shantanu"
node ~/.claude/skills/dori/query-vault.mjs show "<path or title>"
node ~/.claude/skills/dori/query-vault.mjs search "<keywords>"
```
Default stdout is metadata plus named minutes sections (Decisions Log, Action Items) or FTS snippets. Full body only with `--full`.

For a multi-hop connection question that no single document answers directly — "who else is connected to X", "who's on Y's team, and what have they been in since" — use `related` instead of `search`. It walks a co-meeting/person-org graph built from `people:` frontmatter and `entities/people/*.md` `org:` fields (rebuilt by every `reindex-vault.mjs` run), not a document match:
```bash
node ~/.claude/skills/dori/query-vault.mjs related <person-or-org-slug> [--hops 2] [--type co_meeting,person_org]
```
Each hit carries the `rel_paths` that justify the connection — cite those, don't present the graph traversal itself as the source. The vault owner's own slug (present in nearly every meeting, since they're the one taking notes) is typically the graph's hub node, so a 2-hop query routed through them returns most of the vault's people — treat a hub-routed hit as weaker evidence than a hit reached through a more selective node.

Before trusting a recall answer (or when in doubt), check whether the cache is actually current — mirrors dori-engine's `SearchIndex.vaultStats().isStale` fix (commit `5f88e2d`, it used to hardcode `isStale: false`):
```bash
node ~/.claude/skills/dori/query-vault.mjs stats
```
Compares each vault file's on-disk mtime against the indexed mtime (no live write/reconcile-debt tracker here, unlike the engine, so this recomputes it directly instead of reading a pushed flag). Reports `isStale`, and lists which files are unindexed or changed since last index — treat those as the actionable signal and run a full reindex before relying on recall for anything time-sensitive. The `orphaned` list (rows in the DB with no matching on-disk file under this script's `walkMd`, e.g. dotfiles it skips, or rows from other vault paths sharing the same portal.db) is expected noise, not a staleness signal on its own.

To rebuild the whole index (e.g. after files changed outside this router): run the reindex script with no argument.

## Semantic search (optional, for recall/paraphrase queries)

`semantic-index.mjs` in this directory is a second, separate cache — local embeddings (Transformers.js, no API key) + hybrid vector/FTS5 search with RRF fusion, mirroring `dori-engine/src/vector/sqlite-vector-store.ts` exactly (same schema, same model `Xenova/all-MiniLM-L6-v2`, same RRF_K=60). Use this instead of `reindex-vault.mjs`'s plain FTS when the query is conceptual/paraphrased rather than an exact keyword match. After writing a file into `dori-vault`, also run:
```bash
node ~/.claude/skills/dori/semantic-index.mjs index "<absolute-path-to-the-file-just-written>"
```
To search:
```bash
node ~/.claude/skills/dori/semantic-index.mjs search "<natural language query>" [limit]
```
First run per session pays a one-time model load (~a few seconds); do a full reindex (`... index` with no path) only after bulk external changes to the vault, not per-file. For a specific meeting or person, prefer `query-vault.mjs last-meeting` before semantic search.

A full reindex (no path argument) also prunes: any indexed row whose file no longer exists on disk gets deleted from both the FTS and vector tables, mirroring dori-engine's `reconcileSearchIndex()` — a single-file reindex never prunes, same rule `reindex-vault.mjs` already follows.

If the vault is a git repo someone else also pushes to, external changes (a file deleted or edited by a `git pull`) never go through this router's own write path, so nothing else notices them. Run this after every pull instead of a bare `git pull`:
```bash
node ~/.claude/skills/dori/sync-vault.mjs
```
Pulls the vault repo (no-op if it isn't a git repo), then runs a full `reindex-vault.mjs` and a full `semantic-index.mjs index` — mirrors dori-engine's `git-sync.ts`, which calls `maybeReconcileVaultSearchIndex()` after every successful pull for the same reason.

## Multi-fact recall — issue several targeted queries, don't rely on one

A single `search` call (either script) returns one ranked list for one literal query. Real
testing (`docs/research-benchmarks-2026-08-26.md`) found this misses real, answerable
facts in two recurring shapes — neither dori-engine nor dori-portal has a fix for this
today either (checked, no decomposition/multi-query logic exists in either), so this is a
prototype worth porting back if it holds up:

- **The question spans two related things** — a decision and its outcome, a before and an
  after, two people's separate accounts of the same event. One query tends to retrieve
  only one side (verified: a "was the launch on schedule" question surfaced the
  launch-morning doc but never the pre-launch planning doc that named the actual date,
  even at `limit 20`).
- **The literal phrasing doesn't match the source's wording.** A natural paraphrase
  ("when will X launch") can miss content that a closer phrasing ("X's proper launch")
  finds immediately — the gap isn't small (not found in the top 20 vs. tied for rank 1).

**Decompose up front, don't wait to fail first.** You (the calling LLM) are the query-
decomposition layer — neither script has one internally, and neither will ever call an
LLM itself (they're plain deterministic Node, by design). If a question names or implies
two distinct facts, timeframes, or perspectives ("what was decided and did it happen",
"what did X say vs. what did Y say", "how has the plan for X changed since we last
discussed it"), issue 2–3 targeted `search` calls immediately — one per sub-fact — instead
of one combined query and waiting to see if it fails. Confirmed live (2026-08-26): a single
combined query ("Founding Fuel launch go-live time decision and outcome") surfaced the
plan-side doc but never the outcome-side doc, even after fixing a real crash bug in the
query parser (see below) and even at `limit 20`. Two targeted sub-queries run instead — one
phrased toward "the plan," one toward "the outcome" — each independently surfaced *both*
documents in their own top 5. Decomposing first, not retrying after a miss, is what
actually gets both halves of a multi-hop fact without extra round-trips.

**When a single question is genuinely single-hop, don't decompose it** — most questions
are, and splitting those wastes calls for no gain. The trigger is the question's own
shape (does it name/imply more than one fact or perspective?), not its length.

**If you didn't decompose up front and the first search's results don't actually answer
what was asked** (wrong doc, wrong timeframe, or nothing that reads like a direct
answer) — retry with 2–3 targeted searches before concluding "not in the vault."

**Tested finding (2026-08-26): splitting by *intent* alone often isn't enough — the
retry needs the source's literal vocabulary, not just a more targeted rephrasing of the
question.** Live-tested against a real "was the launch on schedule" case that needed two
separate docs: rephrasing into "the plan" and "the outcome" as natural-language
sub-questions still missed the plan-side document entirely — both queries kept landing on
the same generic, frequently-repeated docs. What actually found it was a third query
built from words the source itself would use (an exact-ish title, a specific date, a
named decision) — e.g. "the season starts in June" instead of "when will it launch," or a
document's own heading phrase instead of a description of what it's about. So: retry #1
can be a natural rephrasing, but retry #2 should reach for likely literal terms — a
proper noun, an exact date, quoted language — before concluding the vault has nothing.

Don't retry past 2–3 total queries either way — if none of them find it, say so rather
than continuing to guess new phrasings.

### `search-multi` — fuse several phrasings into one ranked list

**Use it as a second move, not a first one.** Run a plain `search` first; reach for
`search-multi` only when that came back empty or clearly off-target. This is not a
stylistic preference — always-on multi-query is measurably *worse* than cheap-first-then-
escalate in every production evaluation found (research doc 10.4: an industry deployment
measured Hit@10 falling 0.51 → 0.48 with always-on fusion; a 20,000-query study found 72%
of real queries never needed augmentation at all, and escalating only on a failed first
retrieval beat always-on augmentation while cutting latency ~32%). The trigger is simply
"did the first search return anything useful" — you can only tell after searching, so don't
try to predict it up front.

Both scripts take several phrasings at once and fuse the result lists with RRF, so you get
one merged list instead of reading 2–3 separate ones:
```bash
node ~/.claude/skills/dori/semantic-index.mjs search-multi "<phrasing 1>" "<phrasing 2>" [limit]
node ~/.claude/skills/dori/query-vault.mjs search-multi "<phrasing 1>" "<phrasing 2>" [--limit N]
```
Each result is annotated with how many of your phrasings independently found it
(`2/2 phrasings`). No LLM call happens inside either script — **you** supply the phrasings,
the script only retrieves and fuses.

**Vary the vocabulary register, not just the wording — this is the whole trick.** Tested
against the real 2.1 failure case (2026-08-26), and the result is sharper than "generate
some paraphrases":

| What was tried | Target doc found? |
|---|---|
| `search "when will Vybe launch"` (natural, alone, limit 20) | **No** |
| `search-multi` with 3 *natural* rephrasings ("what is the timeline for launching Vybe", "Vybe go to market date") | **No** — and all 3 agreed on the same wrong docs |
| `search-multi` with 1 natural + 1 source-vocabulary phrasing | **Yes** — rank 3 |
| `search-multi` with 2 source-vocabulary phrasings | **Yes** — rank 1, corroborated 2/2 |

Rephrasings that stay in *question* register all retrieve the same wrong documents,
because they're all lexically and semantically near each other and far from how the source
actually talks. At least one phrasing should be a guess at the source's own words — how a
transcript, a heading, or a decision line would actually be written ("the season starts in
June", not "when will it launch").

**More phrasings is NOT monotonically better.** Also tested: adding two weak natural
phrasings alongside one good source-vocabulary phrasing *suppressed* the correct document
that the good phrasing found on its own — RRF sums rank contributions, so a majority of
poor variants outvotes one good one. Prefer **2 well-differentiated phrasings over 3+
similar ones**, and if one phrasing is clearly your best guess at the source's wording,
run it alone first. (Independently reproduced in the literature on a different task —
performance peaked at one variant and degraded as more were added; research doc 10.4.)

**`found_by` / `N/N phrasings` is corroboration, not correctness.** In the 3-natural-
phrasings run above, the wrong documents scored a perfect 3/3 agreement. Agreement means
several phrasings retrieved the same thing, which is worth knowing — it does **not** mean
the thing answers the question. Always check the snippet actually contains the fact.
The `no_overlap` / "weak corroboration" note is likewise a hint, not a verdict: it has
never been calibrated against known-answerable vs. known-unanswerable questions (a previous
attempt at a calibrated confidence signal failed outright — research doc 4.2), so never
report it to the user as "the vault doesn't have this" on its own.

**How to reconcile:** run each targeted query as its own `search` call, read each result
set on its own terms (don't assume the first hit answers a sub-question the query wasn't
actually about), and only merge into one answer if the sub-answers are actually
consistent — otherwise present them separately with which query found what. If 2–3
genuinely different phrasings of the same question all come back with no result sets that
overlap or plausibly answer it, treat that disagreement itself as a signal the vault
likely doesn't have this — say so rather than presenting whatever ranked first as if it
were a confident answer (RRF's top score is always 1.000 regardless of real relevance, so
it cannot be trusted alone as a confidence signal — see the same research doc, section 2.3).

### `verify` — ask whether the retrieved text actually answers the question

```bash
node ~/.claude/skills/dori/semantic-index.mjs verify "<question>" [k] [--scope "<subject>"]
```

Retrieves the top-k (default 5), reads the full chunk text with a cheap model, and returns
JSON with a verdict of `sufficient`, `partial`, `insufficient`, or `unverified`. Every
`sufficient` / `partial` verdict must carry a quote that is matched back against the source
`.md` on disk; a verdict whose quotes all fail that match is automatically downgraded to
`insufficient`.

**Always pass `--scope` when you know what the question is about.** Questions name their
subject loosely — "the archive", "the site", "our stories" — and the referent lives in the
conversation you are having, not in the question string. You know it; the tool cannot infer
it. Without scope, "roughly how many old stories are sitting in the archive" was answered
`sufficient` from a real, disk-verified quote about a *personal* 47-story archive when the
question meant a 2,500-article publication archive. With `--scope "the Founding Fuel content
archive"` the same question returns `scope_match: NO` and `insufficient`. Pass the project,
publication, client, or body of work the conversation is about.

**Read the `about` field on every result.** It names what the passages were actually about,
in the model's own words, and is returned whether or not you passed a scope. On an ambiguous
question that is where a wrong referent becomes visible — `"about": "The YourStory archive…
under the name Shrinath V"` is the tell that the answer, though correctly quoted, is about
the wrong thing. Check it before repeating any answer to the user.

**Use it before you state a fact the user will act on — not on every search.** It costs
~12 s, and it improves nothing about retrieval; all it does is turn a confident wrong answer
into an honest "not found." That trade is worth it when being wrong is expensive (a
commitment, a number, a name, anything headed into a document or a message) and not worth it
while browsing or exploring. You are the only party that knows which situation you are in —
that is exactly why this is a separate command and not wired into `search`.

**Reach for it especially when the question might have no answer in the vault at all.** This
is the one thing the ranked list genuinely cannot tell you: RRF pins the top hit of *any*
query to score 1.000, so four questions whose answers were verified absent from the corpus
came back with a score ladder character-for-character identical to genuine rank-1 successes
(research doc section 2.3 / Part 15). All four are now correctly refused, stably across
repeat runs.

**Tested limits — do not oversell this to the user (Part 15):**

- **The quote check alone cannot catch a wrong referent** — that is what `--scope` and
  `about` are for (above). A disk-verified quote proves the text exists in that document; it
  never proves the text answers *your* question. When you did not pass a scope, the verdict
  is only as good as your own reading of `about`.
- **Verdicts are not reproducible on borderline cases.** One question returned three
  different verdicts across three identical runs. Refusals are stable; positive verdicts are
  the ones that vary. Never re-run to get a better verdict, and never report "verified" as
  though it were deterministic.
- **`unverified` ≠ `insufficient`.** `unverified` means the check itself did not run. It is a
  fact about the tooling, never about the vault — do not tell the user their vault lacks
  something on an `unverified` result.
- **It does not improve recall.** If retrieval never surfaced the right document, `verify`
  correctly says insufficient — which is honest, not a fix. When you get `insufficient` on a
  question you believe the vault *should* answer, that is a cue to retry with the source's
  literal vocabulary (see above), not to conclude the vault is empty.

## Decisions (any captured note, not just meeting minutes)

**CLI first:** `dori facts [<entity id>]` reads current facts; `dori facts add "<text>" --project <p>` extracts and keeps a decision under a project (decisions are kept only under a project). Decision records with a status are fallback only: `decision-store.mjs` below (gap 8).

A meeting's "### Decisions Log" (via `mom-prompt.md`, branch 3) already captures decisions made in a meeting — this is for everything else: a standalone note, a pasted message, a voice-note transcript, anything that isn't already routed as a meeting transcript, YouTube video, document, or expense. Mirrors `decisions.capture` (decision-record.ts) — real Dori classifies every capture this way, not just meetings.

When you're about to file a piece of freeform text ≥30 characters as a note (not one of branches 1–7 above), classify it first — run this exact prompt (copied verbatim from `decisions-capture.ts`'s `buildPrompt`, in `decision-store.mjs`'s own `classifyPrompt` export) via the Agent tool with a cheap model (same spirit as branch 3's haiku compression pass):

> Classify whether the following message or note contains a decision — a firm commitment to a specific course of action. Exploratory questions, suggestions, and discussions are NOT decisions.
>
> Return ONLY valid JSON, no markdown:
> { "isDecision": true or false, "confidence": 0.0 to 1.0, "summary": "one sentence describing what was decided, or empty string if not a decision", "owner": "name of who made the decision, or null", "topics": ["up to 3 short topic tags"] }
>
> Message:
> \<the text\>

If `isDecision` is true and `confidence >= 0.8` (mirrors the real action's own gate — everything below it is silently skipped, never guessed into existence):
```bash
node ~/.claude/skills/dori/decision-store.mjs create --summary "<summary>" --confidence <n> [--owner "<name>"] [--topics a,b,c]
```
Otherwise don't call it at all — file the note normally and move on, same as the real action's `status: 'skipped', reason: 'not_a_decision'`.

To recall or list decisions on file:
```bash
node ~/.claude/skills/dori/decision-store.mjs list [--status active|implemented|superseded|retracted]
```
Stored at `entities/decisions/<slug>.md`, same one-file-per-entity shape as everything else.

## Tasks

**CLI first:** `dori tasks list [--status open|done|all] [--project <p>]`, `dori tasks get <id>`, `dori tasks add "<title>" [--due YYYY-MM-DD] [--next <text>] [--project <p>]`, `dori tasks done <id>`, and `dori tasks list --suggested` for to-dos Dori found in a meeting or capture. After minutes from a `dori capture`, Dori suggests the action items itself; mention them, don't re-extract. The scripts below are the fallback.

`list-tasks.mjs` reads dori-engine's real task store directly (`<vault>/.dori/tasks/records/*.json`) — same data the engine's own `tasks.list` action reads, just a synchronous local read instead of an MCP action call. Use for "what are my pending tasks", "what's due":
```bash
node ~/.claude/skills/dori/list-tasks.mjs [open|done|...] [--real]
```
Defaults to `open`. Pass `--real` to drop leftover e2e/debug/probe fixture tasks from engine test runs. This is a different thing from the inbox (`list-inbox.mjs`, below) — tasks are engine-tracked to-dos; the inbox is unfiled captures and ambiguous routing decisions waiting on a human.

`task-store.mjs` writes to that same store — two ways in:

- **"Dori, add a task: ..."** — a direct ask, no meeting involved:
  ```bash
  node ~/.claude/skills/dori/task-store.mjs add "<title>" [--due <date|relative>] [--owner <name>]
  ```
  `--due` accepts a literal `YYYY-MM-DD` or a relative term (`tomorrow`, `eod`, `eow`, `eom`, `next week`) — same set `tasks-create-many.ts`'s `resolveDeadline` accepts. Owner defaults to whoever `self-store.mjs` has on file.
- **After minutes are written** — run this automatically once a meeting's `### Action Items` section exists (pasted transcript or Fathom sync), don't wait to be asked:
  ```bash
  node ~/.claude/skills/dori/task-store.mjs extract <meeting-minutes.md path, relative to vault>
  ```
  Mirrors `tasks.detect` + `tasks.create_many`'s real blocking rule: an item owned by the user becomes a task; an item owned by someone else is only created (as a `waiting` task) if one of the user's own action items names that person under "Depends on" — otherwise it's silently skipped, never guessed at. Re-running on the same file is safe — already-extracted items are deduped and skipped.

## Meeting prep (before an upcoming meeting, on request)

**CLI first:** `dori run meeting.generate_brief '{"title":"<meeting>","date":"YYYY-MM-DD","attendees":["<name>"],"project":"<project>"}'` writes a brief under `meetings/prep-….md` (edit with `dori brief edit <path> @file`). For calendar meetings and per-attendee briefs, use the `prep` skill. `meeting-prep.mjs` below is the read-only fallback.

When the user asks to prep for a meeting ("what should I know before the call with Anita and Sam", "prep me for the Meridian sync"):
```bash
node ~/.claude/skills/dori/meeting-prep.mjs "Attendee One,Attendee Two" [--project <slug>]
```
Mirrors `dori-engine`'s `meeting.generate_brief` action minus the LLM step — it assembles the same three lookups (prior meetings relevant to these attendees, pending tasks scoped to the project/attendees, which attendees are already known) and prints a brief directly, no model call. Same cross-project isolation the real action enforces: no `--project` means no prior meetings are cited at all (fail closed, never guess which project a meeting belongs to) and tasks fall back to attendee-owned only, never the whole vault.
