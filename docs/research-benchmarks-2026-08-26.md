---
title: "Benchmark & failure-mode research — 2026-08-26"
status: internal (not published to site)
scope: all tests run against REAL data — the actual 3,026-file dori-vault, the actual
  production portal.db / vectors.db, and real PDFs via the real markitdown pipeline.
  No synthetic fixtures except where explicitly labeled.
---

# Dori: what actually holds up, and what actually breaks

This is the honest version — including the four tests that were run specifically to
find failure modes, per explicit instruction ("see where Dori system breaks"). Nothing
here should go on the marketing site until each claim is re-checked against whatever
copy is drafted, since site copy tends to round off the hedges that matter here.

---

## Part 1 — Cases that hold up

### 1.1 Recall: real vault vs. grep
`query-vault.mjs last-meeting` vs. grepping the raw vault by hand.
- Grep-everything: 473,866 chars
- `query-vault.mjs`: 3,703 chars
- **99.2% reduction**, real 3,026-file vault, not the earlier 12-file synthetic fixture.

### 1.2 Task recall
9 real open tasks via `list-tasks.mjs`: 1,579 chars, vs. 2,247,777 chars to read all 159
real meeting files by hand looking for the same info. **99.9% reduction.**

### 1.3 Routing
Deterministic project routing (`route-destination.mjs`) against a real project name
("aligna"): 24ms, no ambiguity. Not a token/context case — a correctness-and-speed case.

### 1.4 PDF needle-in-haystack, case A (résumé, revenue %)
Real résumé PDF via real `markitdown`. Question: "What % of revenue came from the GPS
products he led?" Before the chunking fix (see Part 3), this failed — a markitdown PDF
paragraph with no blank-line breaks bypassed chunking entirely and got embedded/indexed
as one 8,947-char blob, diluting the match. After the fix: 604 chars surfaced, correct
sentence, right answer (40%). **~99% reduction, and this is the case where a real bug
was found and fixed, not a synthetic pass.**

### 1.5 PDF needle-in-haystack, case B (different file, different fact type)
To check the fix generalizes rather than re-confirming the same fixed example: a 27,261-
char CliftonStrengths report, question "which strength is ranked third?" (an ordinal
fact, not a percentage).
- Naive: whole 27,261-char doc.
- Dori: `search ... 5` → ~1,500 chars across 5 chunks, includes the literal ranked list.
- **~94% reduction.** Honest caveat: the correct chunk ranked 5th of 5, not 1st — this
  was a real "needed the full limit-5 window" result, not a clean rank-1 hit like case A.

### 1.6 Hallucination reduction — multi-fact eval (real, messy transcript)
Real 973-line Fathom transcript (`2025-03-19-sprint-planning.md`, actual ASR noise, not
scripted). A 10-question ground-truth key was fixed *before* generating any answers, with
4 of the 10 deliberately chosen because the source itself is hedged or contradictory:

| # | Question | Naive | mom-prompt-style extraction | Ground truth |
|---|---|---|---|---|
| 3 | Items Jyotish refactored | "20, completed" | "20 — conditional, unconfirmed" | Source: "**if** he has completed... 20 items" |
| 6 | Fusion login ready when | "Tomorrow" | "Unclear — tomorrow or Friday, self-contradicted" | Speaker states both, contradicting himself |
| 8 | Card script done when | "Monday" | "~Monday or Tuesday, hedged" | Speaker: "Monday, Monday or Tuesday" |
| 9 | Who said "no group chats" | "Gautam" (picked one) | "Attribution unclear — either Hari or Gautam" | Speaker himself says "either Hari or Gautam" |

The other 6 (who did the refactoring, standup time, who's on chat, compression %, launch
month, Jyotish's availability) were unambiguous and both conditions got them right.

**Score: naive 6/10, structured extraction 10/10.** Every naive miss is the same shape:
a hedge or contradiction in the source gets flattened into false confidence. This is a
cleaner result than an earlier synthetic-transcript version of this same test, because
this transcript is real ASR garbage, not a clean scripted one.

---

## Part 2 — Where Dori breaks (new, this round)

These four were run specifically to find failure modes. All four found one.

### 2.1 Paraphrase brittleness — natural phrasing fails, near-literal phrasing works
Fact: Vybe's daily standup is at 2:30 (`2025-03-19-sprint-planning.md`, line 149).

| Query phrasing | Correct file in top 5? |
|---|---|
| `"we have a stand-up at 2.30"` (near-exact) | Yes — tied for rank 1 |
| `"what time is the Vybe team's daily stand-up"` | **No** — 5 wrong files, all real Vybe dev-sync docs, none containing the answer |
| `"when does the team meet each day to sync on progress"` (generic paraphrase) | **No** — 5 wrong files, wrong project entirely (Founding Fuel, not Vybe) |

Same pattern on a second, independent fact (Vybe's launch timing, "the season starts in
June"): the literal phrase `"proper launch season starts June"` finds the file at rank 2
(0.984); the natural phrasing `"when will Vybe launch"` does not surface it in the top 20
results at all — instead returning older, generic "Vybe development sync" files that
happen to score higher on lexical/semantic overlap with the word "launch" without
actually answering the question.

**This directly qualifies the earlier "3× recall on paraphrased search" claim (from the
first benchmarks round) — that result does not generalize to all queries.** Some
paraphrases work; some genuinely fail, and there's no way to tell which from the outside
without checking the actual chunk content.

### 2.2 Production keyword search (`query-vault.mjs search`) — FIXED
Same query, run against the real, actually-deployed `portal.db` FTS index (not the
semantic index):

```
node query-vault.mjs search "when will Vybe launch" --limit 10
```

Before the fix: 5 hits, all from one unrelated, giant `conversations/` dev-log file
(dori-mini's own build transcripts, which happen to mention "vybe" and "launch" once each
purely as incidental self-referential noise). Root cause, confirmed by direct testing
against the actual `node:sqlite` `DatabaseSync` API (not guessed): `searchDocs()` ran a
**phrase-then-bareword-AND fallback that dori-mini invented on its own** — first try the
whole query as one exact FTS5 phrase (`"when will Vybe launch"`, almost never matches
anything), and if that returns zero rows, fall back to a bareword multi-term query, which
FTS5 evaluates as an implicit AND **across the whole row**, not per-column and not
proximity-weighted. On a small, short document this is usually fine; on one giant
15,000+-line dev-log file that happens to contain both words *somewhere*, unrelated to
each other, it's a real match by FTS5's rules with no way to tell "the terms are related"
from "the terms both occur somewhere in a huge irrelevant file." Ranking wasn't even
requested (no `ORDER BY rank`), so ties broke arbitrarily.

Checked against real dori-portal's actual search function
(`dori-portal/lib/vault-indexer.ts`, `searchVaultDocumentsFts`) — dori-mini's fallback
logic was never real Dori behavior to begin with. The real mechanism is simpler and
different: **OR of prefix tokens, ranked by BM25 `rank`** — `tokens.map(t => t+'*').join(' OR ')`,
`ORDER BY rank`. Ported that directly into `query-vault.mjs`'s `searchDocs()`
([query-vault.mjs](../query-vault.mjs)), replacing the invented AND-fallback. Added a
minimal self-check ([test-query-vault.mjs](../test-query-vault.mjs)).

Re-run after the fix: 8 real, on-topic hits — Founding Fuel launch planning docs, ADRs,
launch-morning minutes — no more filler-word garbage. Honest residual limitation, also
inherited faithfully from the real OR-ranked design: a broad word like "launch" that
appears very often across a large, unrelated project (Founding Fuel, which dominates the
vault's "launch" mentions) can still outrank a document that matches a rarer, more
specific combination (Vybe's actual "June" launch line) — because OR-ranking sums
relevance per matched token rather than rewarding a document for matching more of the
distinct terms. That's a real, disclosed trade-off in the actual production ranking
approach, not a bug introduced by this fix.

### 2.3 No "not found" signal — every query returns confident-looking top scores
Two negative-case queries, for facts that provably do not exist anywhere in the vault:
- `"Vybe Series C funding round amount raised"` (Vybe never raised institutional funding — the resume explicitly separates this: Silae.io "raised angel investment", Vybe did not)
- `"what is the tax filing deadline for Vybe in Delaware"` (Vybe has no Delaware entity in any vault document)

Both returned 5 results with scores **1.000, 0.984, 0.968, 0.953, 0.938** — the exact
same score pattern as every genuine hit in this whole test suite. There is no visible
difference between "this is a great match" and "nothing in the vault is relevant, here's
the least-irrelevant option."

**Root cause, confirmed in both dori-mini's `semantic-index.mjs` and real dori-engine's
`src/vector/rrf.ts`:** RRF fusion max-normalizes scores so the top result of *any* query
is always exactly 1.0, by construction:
```js
const maxScore = ranked[0]?.score ?? 0;
const denom = maxScore > 0 ? maxScore : 1;
return ranked.map(({ score, result }) => ({ ...result, score: score / denom }));
```
This is not a dori-mini bug — it's the real, intentional mechanism (dori-engine's own
comment: "Max-normalize so RRF scores sit in (0, 1] and minScore is usable"). Real
dori-engine does expose an optional `minScore` filter to callers for this reason — but
because the score is relative to the top hit *of that query*, `minScore` can reject
results that are weak relative to a strong top hit, it cannot detect the case where the
*entire result set* is irrelevant and the top hit itself is the problem. dori-mini's CLI
doesn't even expose `minScore` as an option today.

**Practical implication for the site:** any claim that Dori "won't make things up" needs
a caveat — the retrieval layer will hand back a confident-looking result even when the
vault has nothing on the topic. Whether the final answer hallucinates then depends
entirely on whatever prompt/model consumes that retrieval (e.g., mom-prompt.md's
explicit "flag for review" instructions), not on retrieval catching the miss itself.

### 2.4 Multi-hop: a single query only retrieves one half of a two-document fact
Real fact chain, Founding Fuel project:
- `Pre launch readiness sync mom.md` (2026-03-13): decision — go-live planned for "Monday, March 16 early morning cutover."
- `Launch morning check in mom.md` (2026-03-16): the actual launch-morning meeting, confirming it happened on schedule.

Query: `"Founding Fuel launch go-live time decision and outcome"` (deliberately phrased to
need both documents) — checked at limit 20.

Result: `Launch morning check in mom.md` surfaces at rank 2. **`Pre launch readiness sync
mom.md` — the document containing the actual planned decision — does not appear in the
top 20 at all.** A downstream answer to "was the launch on schedule?" would see only the
outcome side of the story and have no grounded way to state what was originally planned;
it would have to either omit the comparison or invent what it "was supposed to be."

This is a real, disclosed limitation: single-query hybrid retrieval doesn't guarantee
both halves of a cross-document fact land together. Answering a genuinely multi-hop
question reliably needs either multiple targeted queries or an agent loop that notices
the gap — which the current CLI tools don't do automatically.

---

## Part 3 — Bugs found and fixed this cycle (already shipped, for reference)

- **Chunking bug** (`semantic-index.mjs`, commit `238f910`): a markitdown PDF paragraph
  with no blank-line breaks bypassed chunking and got embedded as one oversized blob.
  Fixed by porting dori-engine's real `splitOversized` cascade (sentence → word → hard
  character split). Verified via case 1.4 above and re-verified with no regression on
  case 1.5's different file.
- **`query-vault.mjs` FTS fallback bug** (fixed this cycle, see section 2.2): the invented
  phrase→AND fallback is gone, replaced with dori-portal's real OR-of-prefix-tokens/BM25
  approach.
- **`semantic-index.mjs`'s `toFtsQuery` AND-joining — deliberately NOT changed.** This
  looked like the same bug at first, but checking against real dori-engine source
  (`src/vector/sqlite-vector-store.ts`) shows it's the *actual, deliberate* production
  mechanism, not a divergence — dori-engine's own test file
  (`fts-query.test.ts`) explicitly asserts `toFtsQuery('foo OR bar') === '"foo" AND
  "bar"'`. There, the AND-strict FTS query is only one signal fused via RRF alongside
  vector search (`sqlite-vector-store.ts` `search()`), so a missed-FTS-match still has a
  chance via the semantic channel. "Fixing" this in dori-mini would mean building
  something *better than* real Dori, which breaks this project's core discipline — every
  mechanism here should trace to what the real product actually does, not to what would
  be nicest. Left as-is, faithfully mirrored, with the limitation disclosed in 2.1/2.2
  above instead of silently patched over.

---

## Part 4 — Fix attempts on the remaining open issues (2026-08-26, later same day)

Reframe from earlier in this doc: dori-mini's job isn't only to mirror real Dori
faithfully — it's also a cheap place to prototype fixes for what testing finds, which can
be ported back to real dori-engine/dori-portal if they hold up. Two attempts below; one
worked, one didn't and was reverted rather than shipped half-working.

### 4.1 Stopword dilution behind 2.1's "Vybe launch" paraphrase failure — partially fixed
Root cause, confirmed: neither dori-engine nor dori-portal filter natural-language
stopwords before building an FTS query (checked, nothing named `stopword` exists in
either codebase) — only FTS operator keywords (AND/OR/NOT/NEAR) get stripped. In a
natural question like "when will Vybe launch," the common words "when"/"will" still match
a huge share of the vault, and their summed BM25 contribution can outrank a document that
only matches the two words that actually distinguish the question ("Vybe", "launch").

Added a stopword filter to `query-vault.mjs`'s `toPrefixOrQuery` (falls back to the
unfiltered token list if a query is *all* stopwords, so it never returns empty). This is
explicitly a dori-mini-only prototype — not yet real Dori behavior — flagged as such in
the code comment, candidate to port to `dori-portal/lib/vault-indexer.ts` if it proves out.

Re-ran the exact failing query. Result: **better, not solved.** `Pre launch readiness
sync mom.md` (the doc with Vybe's actual — wait, this is the Founding Fuel doc, not
Vybe's — decision) now ranks #2 instead of missing from the top 8 entirely. But the
underlying dynamic — Founding Fuel's much larger "launch" corpus still outranks the
smaller, more specific Vybe content for this query — persists. That's a deeper ranking
question (why isn't BM25's own IDF term discounting "launch" enough, given it's common
across ~825 real vault files) that a stopword filter alone doesn't resolve. Left open,
correctly labeled as "improved, not fixed."

### 4.2 No "not found" signal (2.3) — fix attempted and reverted, didn't work
Tried adding a floor check on the *raw* (pre-RRF-normalization) top cosine similarity in
`semantic-index.mjs`'s `cmdSearch` — reasoning that raw cosine is on an absolute scale
([-1, 1]) that RRF's max-normalization throws away, so it should be able to flag "nothing
here is actually relevant" independent of how the current query's other results compare.

Calibration check across 5 real queries, threshold `0.35`:

| Query | Known status | Raw top cosine | Would this threshold flag it? |
|---|---|---|---|
| `"we have a stand-up at 2.30"` | **answerable** — near-exact match exists | 0.294 | Yes — **false alarm** |
| `"Vybe Series C funding round amount raised"` | **not answerable** — fact doesn't exist | > 0.35 | No — **missed** |
| `"what is the tax filing deadline for Vybe in Delaware"` | **not answerable** | > 0.35 | No — **missed** |

The one query we know is answerable scored *lower* than both queries we know are not.
Reason: this embedding model's cosine similarity tracks topical closeness ("this is about
Vybe") more than fact-presence ("this specific claim is in here") — a query about a
fact that doesn't exist can still score high raw cosine against real Vybe content, while
a real answer phrased slightly differently than the source can score lower. A single flat
threshold on top-1 raw cosine can't separate these cases with this model. Shipping it
would have meant a warning that fires on good matches and stays silent on bad ones — worse
than no signal, since it would train trust in the wrong direction. **Reverted.** If this
gets tried again, it needs either a smarter signal (e.g. the gap between top-1 and top-5,
or requiring FTS corroboration, not top-1 cosine alone) or acceptance that this specific
failure mode may not be cheaply fixable at the retrieval layer at all — it may need to be
handled downstream, by whatever consumes the retrieval (same conclusion as 2.3's original
"practical implication" note).

### 4.3 Multi-hop (2.4) — scoped, not yet built

**Confirmed first: this is a real gap, not a dori-mini divergence.** Grepped both
`dori-engine/src` and `dori-portal` for any decomposition/sub-query/multi-hop logic —
none exists. Real Dori's `SearchIndex.search()` takes exactly one literal query string
and returns one RRF-fused ranked list, same as dori-mini. So a fix here is genuinely new
for both, not something dori-mini is behind on.

**What the industry actually does** (per a broad search of 2025–2026 RAG research —
sources at the end of this section): the standard pattern is a **query-understanding
layer in front of retrieval**, not a smarter single retriever. Three variants show up
repeatedly:
- **Query decomposition**: an LLM splits a compound question into single-hop
  sub-questions, retrieves each separately, merges/reranks the pooled results. Documented
  to give the largest recall gains specifically on multi-hop questions — exactly this
  project's 2.4 case.
- **Multi-query / RAG-Fusion**: an LLM generates several *rephrasings* of the same
  question (not sub-questions — paraphrases), retrieves each, fuses with RRF. This is the
  same mechanism aimed at paraphrase variance instead of fact-splitting.
- **Selective/adaptive decomposition**: apply the above only when it's warranted —
  research flags "over-decomposition" as a real failure mode (an LLM asked to decompose
  will happily split a simple single-hop question into three redundant sub-queries,
  tripling retrieval cost for no gain), so this needs a cheap upstream check, not blanket
  application to every query.

**Where this would actually live in dori-mini.** Neither `semantic-index.mjs` nor
`query-vault.mjs` call an LLM today — they're plain deterministic Node scripts (embedding
via local Transformers.js, no API calls), by original design ("plain Node.js scripts...
no Claude-specific dependencies," per `AGENTS.md`). True decomposition needs an LLM to
read the question and decide how to split/rephrase it. Two ways to get that:
1. **Agent-level (near-zero cost, no code change):** teach the calling agent — Dori
   Mini's own routing skill — to recognize when a question implies two related facts
   (a plan vs. its outcome, a before vs. an after, two people's views) and issue 2–3
   targeted `search` calls itself instead of one combined query, then reconcile the
   results in its own response. Claude is already the LLM in the loop every time these
   CLI tools run — this needs a prompting/instruction change, not new code.
2. **Tool-level (real feature, real cost):** add an actual decomposition step inside
   `semantic-index.mjs`/`query-vault.mjs`, which means embedding an LLM call inside what
   are currently deterministic scripts — a real architecture change, and one real
   dori-engine doesn't have either, so building it here would be a genuine prototype
   worth offering back upstream, not a mirror of anything that exists today.

Recommended next step, if this gets built: start with option 1 (change the skill
instructions, test whether the agent reliably splits the sprint-planning-style question
and actually retrieves both docs), before committing to option 2's larger scope.

### 4.4 Does this help the other open issues? Yes — same root cause, three symptoms

Multi-query/decomposition isn't a point-fix for 2.4 alone. All three of the retrieval
issues found in this test suite trace to the same gap: **dori-mini and real Dori both
take exactly one literal query and run it through one hybrid search, with no query-
understanding layer in front.**

| Issue | Helped by multi-query/decomposition? | Why |
|---|---|---|
| 2.1/4.1 — paraphrase brittleness | **Yes, directly** | This *is* the RAG-Fusion pattern: generate several phrasings, search each, fuse results. The exact mechanism, aimed at a different symptom. |
| 2.4 — multi-hop | **Yes, directly** | This is literally query decomposition's documented use case. |
| 4.1 residual — Founding Fuel's larger "launch" corpus burying Vybe's specific line | **Indirectly** | A rewritten, more specific query ("Vybe project launch date" instead of "when will Vybe launch") adds a distinguishing term explicitly — same LLM-query-layer mechanism, framed as rewriting rather than splitting. Doesn't fix the underlying BM25/IDF weighting question, but sidesteps it for this case. |
| 2.3/4.2 — no "not found" signal | **Partially, as a signal, not a fix** | If 3 differently-phrased queries return *no overlapping documents at all*, that disagreement is itself a cheap, ground-truth-free proxy for "the vault probably has nothing on this" — cheaper than the calibrated cosine-floor approach that failed in 4.2. Not equivalent to a real fix: Google's own research on this problem (cited below) uses an LLM-judged "sufficient context" signal specifically because embedding/consistency-based proxies are known to produce uncalibrated confidence (a 0.5 threshold gives 90% recall on one dataset, 60% on another) — cross-query agreement would need the same kind of calibration check 4.2 failed, before trusting it. |

**Bottom line:** one investment — teaching the agent layer to issue multiple targeted or
rephrased queries instead of one, and to notice when they disagree — plausibly moves
three of the four still-open issues at once, for near-zero engineering cost (option 1
above). The fourth (a real, calibrated no-answer detector) is a bigger, separate
investment that industry research suggests needs an actual LLM sufficiency-check, not a
retrieval-side heuristic — 4.2 already showed a retrieval-side heuristic failing here.

**Sources** (all fetched 2026-08-26, current as of this research round):
- [Question Decomposition for Retrieval-Augmented Generation](https://arxiv.org/pdf/2507.00355)
- [Mitigating Lost-in-Retrieval Problems in Retrieval Augmented Multi-Hop Question Answering](https://arxiv.org/pdf/2502.14245)
- [Query Decomposition for RAG: Balancing Exploration-Exploitation](https://arxiv.org/pdf/2510.18633)
- [Multi-Hop Query Retrieval — overview](https://www.emergentmind.com/topics/multi-hop-query-retrieval)
- [Hybrid Search for RAG: Combining BM25 and Dense Vector Search (2026 Guide)](https://denser.ai/blog/hybrid-search-for-rag/)
- [Deeper insights into retrieval augmented generation: the role of sufficient context](https://research.google/blog/deeper-insights-into-retrieval-augmented-generation-the-role-of-sufficient-context/) — the "sufficient context" signal used for calibrated abstention (93%+ accuracy, ground-truth-free, +10% selective accuracy over confidence alone)
- [SURE-RAG: Sufficiency and Uncertainty-Aware Evidence Verification for Selective RAG](https://arxiv.org/pdf/2605.03534)
- [The Semantic Illusion: Certified Limits of Embedding-Based Hallucination Detection in RAG Systems](https://arxiv.org/pdf/2512.15068) — directly relevant to why 4.2's embedding-based floor failed
- [RAG Series (13): Query Optimization — Asking Better Questions](https://dev.to/wonderlab/rag-series-13-query-optimization-asking-better-questions-1ie0) — over-decomposition failure mode

---

## Part 5 — Option 1 built and tested against the real multi-hop case (2026-08-26, later still)

Added the SKILL.md instruction from 4.3's option 1 (`## Multi-fact recall` section) and
tested it live against the exact 2.4 case: "was the Founding Fuel launch on schedule" —
needs both `Pre launch readiness sync mom.md` (the decision) and `Launch morning check in
mom.md` (the outcome).

**Result: partially worked, and the failure taught something more useful than the
success would have.**

- Splitting into two natural-language targeted queries — one aimed at "the plan," one at
  "the outcome" — still **did not** surface `Pre launch readiness sync mom.md` in either.
  Both queries landed on the same handful of generic, frequently-repeated Founding Fuel
  launch documents.
- A third query, using near-literal vocabulary from the actual document ("Pre-Launch
  Readiness Sync Go-Live Window Sunday night Monday cutover" — words pulled straight from
  the doc's own heading and Decisions Log), found it instantly: rank 1, 2, and 3 of 5, with
  the correct Decisions Log snippet ("Target Monday, March 16 early morning cutover").

So natural-language decomposition alone wasn't enough here — the fix that actually worked
was **querying with the source's own vocabulary**, not just splitting the question's
*intent* into parts. Updated the SKILL.md guidance to say this explicitly: when the first
1–2 natural rephrasings don't answer the question, the next retry should reach for likely
literal terms (a title, a proper noun, a specific date/word the source would use) before
concluding the vault has nothing.

### The real cause behind the residual BM25 dilution (4.1) — found it

Chasing why even a "plan"-targeted query kept surfacing the *same* handful of generic
Founding Fuel docs turned up something more concrete than an algorithmic ranking problem:
**the vault has real, byte-identical duplicate files.**

```
$ md5 ".../entities/projects/founding-fuel/Founding Fuel Modernization – Project History (Canonical Reference) (1).md" \
      ".../projects/founding-fuel/Founding Fuel Modernization – Project History (Canonical Reference) (1).md"
d0531c720ff46ac60756dcec22ed8721   (identical)
```

Same file exists — often 4–10+ times over — under `entities/projects/founding-fuel/`,
`projects/founding-fuel/` (two parallel directory trees mirroring the same project),
`_site/projects/founding-fuel/` (a rendered HTML copy), and
`profile/website/{my-website,older-website}/case study/Founding Fuel Rebuild/`. Both
`semantic-index.mjs` and `query-vault.mjs` walk the whole vault tree and index every
`rel_path` as its own row — so exact-duplicate content gets embedded and FTS-indexed
multiple times over, each copy counted as independent evidence. For a broad term like
"launch" that's already common in Founding Fuel's own content, this duplication compounds
the dilution problem found in 4.1 — it's not solely (maybe not even mostly) a BM25/IDF
weighting question, it's real vault data hygiene inflating document frequency for exactly
the terms competing with Vybe's more specific, non-duplicated content.

**What this means for "what we need to fix in the BM25 case":** the highest-leverage next
step isn't a ranking-algorithm change at all — it's **content-hash-aware indexing**:
before indexing a file, check whether its content hash already exists under a different
`rel_path` in the index, and either skip the duplicate or index it without letting it
multiply-count in ranking. Both scripts already compute a `contentHash()` per chunk for
per-file change detection (`semantic-index.mjs`) — extending that to a *cross-file* check
at index time is a scoped, concrete fix, not a research problem. Separately, and outside
dori-mini's scope: the vault itself likely wants an actual dedup pass (which of the 4+
copies is canonical, which should be deleted or symlinked) — that's a data-hygiene
decision for the vault's owner, not something an indexer should silently paper over
forever.

**Not yet built** — this is the concrete next fix, scoped and ready, pending confirmation
this is the direction to take (a code change to both indexers' write path, not a config
tweak).

---

## Part 6 — Content-hash dedup: built, tested against real production data, calibrated result

Built the fix scoped in Part 5: content-hash-aware indexing in `semantic-index.mjs`.

- `indexed_files` gained `content_hash` (whole-file, not per-chunk — a multi-chunk
  duplicate is caught as one file) and `duplicate_of` columns.
- `cmdIndex` now skips chunking/embedding a file if another already-indexed path shares
  its exact content hash, recording the pointer instead.
- Added a `dedupe` subcommand — a one-time, embedding-free backfill (dedup decisions only
  need file content, not vectors) for a vault that was already indexed before this existed,
  since the per-file check in `index` only fires for changed files and would otherwise
  never revisit years of already-indexed unchanged duplicates.
- Added self-checks: `test-dedupe.mjs` (canonical-selection logic).

**Backed up the real production `vectors.db`** (`~/.dori/caches/.../vectors.db.bak-2026-08-26`)
before running this against it, since it mutates real indexed data (reversible via
reindex, but real data nonetheless).

**Ran `dedupe` against the real 3,026-file vault:**
```
Dedup scan: 529 duplicate groups found, 53 already-indexed duplicates de-chunked
(780 chunks removed)
```
Confirms the Part 5 hypothesis at real scale, not just the one Founding Fuel example —
this vault has substantial genuine duplication (mirrored `entities/projects/` vs.
`projects/` trees, repeated meeting captures under `captures/` vs `meetings/`, etc.).

**But re-running the two target queries after dedup: neither flipped.** `Pre launch
readiness sync mom.md` still doesn't surface for the natural-language multi-hop query, and
`2025-03-19-sprint-planning.md` still doesn't surface for "when will Vybe launch." Chased
why: counted *distinct, non-duplicate* real files mentioning "launch" —

| Topic | Distinct real files (post-dedup) |
|---|---|
| Founding Fuel | **63** |
| Vybe | **18** |

Founding Fuel genuinely has ~3.5× more real, non-duplicate content about "launch" than
Vybe does. Dedup correctly removed the 35 exact-duplicate files inflating that count
(98 → 63) — but 63 vs. 18 is real, legitimate topic-size imbalance, not noise. No dedup
fix should try to erase that; it's true signal about what's actually in the vault.

**Calibrated conclusion:** the dedup fix is real, verified, and worth keeping — it removed
780 chunks of genuine duplicate noise vault-wide, with no regression on either previously-
working query (re-checked after the run). But it is **not sufficient on its own** to fix
the two headline residual test cases from 4.1/5 — those are also driven by real topic-size
imbalance that dedup correctly leaves alone. The fix that actually resolves those specific
queries remains what Part 5 already found and shipped into `SKILL.md`: retry with the
source's literal vocabulary, not a broader natural-language rephrasing, when the first
attempt doesn't answer the question. Dedup and literal-retry solve different parts of the
same symptom — ship both, don't expect either alone to fully cover it.

---

## Part 7 — Ported to reindex-vault.mjs, found and fixed two real bugs in the process

Ported the identical fix to `reindex-vault.mjs` (writes `dori-portal`'s real, live
`vault_documents`/`vault_documents_fts` table — this is the index behind
`query-vault.mjs`, a different table from `semantic-index.mjs`'s `vectors.db`). Added
`content_hash`/`duplicate_of` columns (additive — checked `dori-portal/lib/db/schema.ts`,
Drizzle's typed column mapping never sees extra columns, safe on the live shared table)
and a matching `dedupe` subcommand.

**Backed up both real DBs before running anything against them** (`portal.db` and
`vectors.db`, both timestamped `.bak-2026-08-26`) — good thing, because testing this for
real surfaced two genuine bugs that a quick sanity check wouldn't have caught.

### Bug 1 — empty bodies collide, corrupt duplicate_of

First run: `dedupe` reported 529 duplicate groups (matching semantic-index.mjs's earlier
number) — but a regression check on a previously-working query (`query-vault.mjs search
"aligna"`) came back with **zero hits**, where it had real results before. Traced it: a
project's near-empty `STATUS.md` (frontmatter only, no body) got `duplicate_of` pointed at
a completely unrelated person's profile file (`entities/people/shrinath-v.md`) — also
frontmatter-only. **Every frontmatter-only/empty-body file in the vault hashes to the same
trivial value and was getting wrongly cross-matched as "duplicates" of each other.** Found
80 such files vault-wide.

Fix: both scripts now skip dedup entirely for bodies under `MIN_DEDUP_BODY_CHARS` (40
chars, trimmed) — too short to be meaningful "duplicate content" either way, and too short
to matter for ranking dilution regardless. Restored both DBs from backup, re-ran with the
fix: 515 real duplicate groups (down from the bogus 529), 100 trivial files correctly
excluded. Added regression cases to `test-dedupe.mjs`.

### Bug 2 — lexicographic canonical can pick an unsearchable path

Re-checked the "aligna" regression after Bug 1's fix — **still zero hits.** Deeper trace:
`entities/projects/aligna/README.md` and `projects/aligna/README.md` are real duplicates,
byte-identical. Lexicographic sort picks `entities/...` as canonical (comes first
alphabetically) — but `entities/projects/aligna/*` had **never had an FTS row indexed in
the first place**, a pre-existing gap in this vault unrelated to dedup (confirmed by
checking the pre-dedup backup — only `projects/aligna/*` ever had FTS rows). Result: the
real, previously-searchable duplicate lost its FTS row (because dedup correctly treats a
non-canonical member as removable from search), while the newly-crowned "canonical" was
never searchable to begin with. Net effect: a working query went from real results to
zero — a real regression, not just an unfixed limitation.

**This is the more important finding of the two:** lexicographic order is not a safe
canonical-selection rule on its own — it must be constrained to only pick a member that is
actually indexed. Fixed both scripts: canonical selection now prefers whichever group
member already has real search coverage (an FTS row / actual chunks); only if *no* member
in the group has any, does it back-fill one (insert FTS from existing content for
`reindex-vault.mjs`; actually chunk + locally embed for `semantic-index.mjs`, since that
index needs real vectors, not just text). Restored both DBs again, re-ran with both fixes:

```
reindex-vault.mjs dedupe:
515 duplicate groups found, 111 already-indexed duplicates removed from search
(content/show still intact), 1378 canonicals back-filled with a missing FTS row,
100 trivial/near-empty files excluded from dedup
```

The **1378 back-filled FTS rows** is a bigger, separate discovery on its own: this vault's
`portal.db` had far more pre-existing FTS coverage gaps than duplication — most of
`entities/projects/*` and other paths apparently never got indexed into
`vault_documents_fts` at all before this dedup pass incidentally back-filled them while
establishing canonicals. `query-vault.mjs search` was silently missing huge swaths of the
vault before this fix, independent of the duplication problem this was originally trying
to solve.

`semantic-index.mjs dedupe` needed the same fix but the chunk-backfill path requires local
embedding (Transformers.js, one file at a time) — ran as a background job, completed:

```
semantic-index.mjs dedupe:
515 duplicate groups found, 0 already-indexed duplicates de-chunked (0 chunks removed),
407 canonicals back-filled with missing chunks, 100 trivial/near-empty files excluded
```

Same story as `reindex-vault.mjs`'s 1378-row FTS gap, at a smaller scale: 407 files that
had an `indexed_files` bookkeeping row but zero actual chunks got real chunks and
embeddings for the first time as part of establishing them as canonicals. `0` de-chunked
this run makes sense — Bug 1's fix already removed the (correctly-scoped) 52 real
already-chunked duplicates back in Part 6, and this run started from that clean state.

**Verified after both fixes, against both indexes:** `query-vault.mjs search "aligna"`
and `semantic-index.mjs search "aligna"` both return real, correct results again (5
relevant Aligna docs each). `duplicate_of` now correctly points
`entities/projects/aligna/README.md` (the file that was never searchable) at
`projects/aligna/README.md` (the one that always was) — the opposite of what the buggy
lexicographic rule had chosen. No regression on the "when will Vybe launch" or literal-
vocabulary queries from Parts 5/6, re-checked against both indexes after every fix.

**Takeaway for anyone building this for real:** a dedup pass that only reasons about
*content* (which files are identical) without also checking *index state* (which of them
is actually searchable right now) is not safe to run against a real, imperfectly-indexed
corpus. Test against the real data before trusting a design that only looked correct on
paper — both of these bugs were invisible in synthetic testing and only surfaced by
re-running the exact regression queries after each change.

---

## Part 8 — Marketing-numbers re-run: with vs. without Dori Mini (2026-08-26, later still)

Requested by the product owner: rerun the test suite before vs. after this session's
fixes, get "savings" and "hallucination" numbers rigorous enough to seed the public
homepage. Same discipline as the rest of this doc: real vault, real DBs, real commands,
every number below is reproducible with the command shown next to it. Where a number
can't be honestly reproduced, that's stated instead of estimated.

**Safety note on method:** per the run instructions, all "before" (pre-fix) code
comparisons below use `git show HEAD:<file> > /tmp/<file>-prefix.mjs` and run the OLD
script directly against the live, current-schema DB — never `git stash` (which would
also flip the DB schema the code expects, mid-comparison, against real data). Confirmed
safe first: both `query-vault.mjs`'s old and new `openDb()` open the DB with
`{ readOnly: true }`, and no schema-touching code (`CREATE TABLE`/`ALTER TABLE`) runs on
a `search`/`last-meeting`/`stats` command — so the pre-fix script genuinely can't corrupt
anything by running read-only against the post-fix schema. `dedupe` was **not** rerun
(explicitly out of scope — it already ran once this session; Part 6/7's numbers are
re-cited below, not regenerated).

### 8.1 Sanity check: do 1.1–1.3 still hold?

**Vault size drifted** since the original doc: `find` over non-hidden `.md` files gives
**2,854** files today (`vault_documents` in `portal.db` shows 2,779 rows — the gap is
files never indexed, a pre-existing gap unrelated to this work), down from the
originally-quoted 3,026. Real vault churn (captures/inbox turnover), not a bug.

- **1.2 (task recall) — reran exactly.** `list-tasks.mjs` now returns **49** open tasks
  (was 9), **5,264 chars** (was 1,579). The comparison baseline — reading all real
  meeting-type files by hand — is now **188** files (was 159, found via
  `find … -iname '*mom*.md' -o -path '*/meetings/*.md'`), **2,304,101 chars** (was
  2,247,777). **Reduction: 99.77%** (was 99.9%) — the number moved because both sides of
  the ratio grew, not because anything regressed. Still holds as a strong, honest claim.
- **1.1 (recall vs. grep) — the original "grep-everything: 473,866 chars" baseline could
  not be reproduced exactly; its file-selection method wasn't specified precisely enough
  in the original entry to rerun verbatim, and inventing a new definition to match the
  old number would be exactly the kind of unfalsifiable rounding this doc exists to avoid.
  Reused 1.2's own methodology instead (all real meeting-type files) as a conservative,
  reproducible substitute: `query-vault.mjs last-meeting` returns **2,836 chars** against
  the same 2,304,101-char meeting corpus. **Reduction: 99.88%.** Direction and order of
  magnitude both hold; the specific "473,866" figure from the original doc should be
  retired rather than repeated, since this run can't independently confirm it.
- **1.3 (routing) — reran with the exact documented command shape**
  (`node route-destination.mjs document aligna`): still deterministic, still fast
  (measured 23–29ms across three runs, in line with the original 24ms), still correct
  (`projects/aligna/...`). Holds without qualification.

### 8.2 New PDF numeric case (case C) — a client case-study PDF, a multiplier stat

Searched the real vault for a PDF-derived `.md` (has a sibling `.pdf`, genuinely
markitdown-converted, not hand-written) with a checkable dollar/percentage/count fact not
already used in 1.4 (résumé, revenue %) or 1.5 (CliftonStrengths, ordinal rank). Checked
~15 PDF/markdown pairs across résumés, proposals, and case studies (`find … -iname
'*.pdf'` cross-referenced against sibling `.md` files); most proposal-style PDFs in this
vault turned out to be qualitative (dates, phase names, no $ or % figures). One good real
candidate: `entities/projects/founding-fuel/agentic-engineering-case-study.md` /
`projects/founding-fuel/agentic-engineering-case-study.md` (PDF-derived client case study,
**26,711 chars**), with a metrics block: "10 Years | Content Archive", "2,000+ |
Long-form Articles", "**50x** | Traffic Capacity Increase", "0ms | Logic Layer Latency."

**Honest caveat before the numbers:** the "50x" fact sits at char offset 963 — about 3.6%
into the document, in the executive-summary metrics block, not deep in the body. This is
a materially easier retrieval task than 1.4/1.5's buried facts — reported as a distinct,
different-fact-type case (a multiplier from a metrics block, not a % or an ordinal rank),
not as a second confirmation of "deep needle-in-haystack."

```
node query-vault.mjs search "traffic capacity increase after modernization" --limit 5
```
Rank 1: `projects/founding-fuel/agentic-engineering-case-study.md`, snippet: "…Long-form
Articles\n- 50x | Traffic Capacity Increase\n- 0ms | Logic Layer Latency (SSG…" — correct
file, correct number, immediately. Total bytes returned across all 5 hits: 526.
**Reduction: 98.0%** (526 / 26,711 chars).

Semantic search (`semantic-index.mjs search`) on the **same natural-language phrasing**
did **not** surface this file in the top 5 at all — returned five unrelated docs that
happen to share the words "capacity"/"traffic increase" (a performance-optimization doc,
a book excerpt, an unrelated capacity-planning doc). Retried with an explicit,
proper-noun-anchored query ("Founding Fuel traffic capacity increase modernization"): the
correct chunk appeared at **rank 2 of 8** (score 1.000, tied for top). Verified directly
against `vectors.db`'s `search_chunks` table that this specific 674-char chunk contains
the literal string "50x" (`SELECT … WHERE text LIKE '%50x%'` — one match, this chunk).
**674 / 26,711 = 97.5% reduction when the query succeeds.**

**This is a real, new instance of section 2.1's paraphrase-brittleness finding** — not a
different bug, the same one, now confirmed on a third fact type (a case-study metric,
after 2.1's meeting-time fact and launch-date fact). FTS keyword search got this one
right on the first natural phrasing; vector/semantic search needed the query rewritten
with the proper noun before it worked. Reinforces 2.1's conclusion: **which retrieval
channel succeeds depends on how literally the question echoes the source's own words, and
there is no reliable way to predict which phrasing will work from outside.**

### 8.3 Hallucination eval, expanded — second real transcript, ground-truth-first

Second real transcript: `meetings/arpan-shrinath-sync.md` (2026-05-28, "Arpan <> Shrinath
sync", 1,329 lines, real ASR output with timestamps — ranked #1 by line count among files
matching `*.md` directly under `meetings/`, and independently confirmed to have several
real hedges/contradictions/ASR-garbled names on inspection, which is exactly what this
test needs). Different transcript, different speakers, different subject matter from
`2025-03-19-sprint-planning.md`.

**Ground-truth key fixed first, before generating any naive or structured answer**, citing
exact `[HH:MM:SS]` timestamps from the source:

| # | Question | Ground truth (source-cited) |
|---|---|---|
| 1 | What % of his content workflow did Arpan say he's automated? | **Ambiguous/self-contradictory.** [00:00:00]: "automated 70% of it… content generation, another 30%, 20% is posters, and 10% is scheduling" — the numbers don't sum cleanly (130%); the source itself is jumbled mid-sentence. |
| 2 | What is the name of the tool Shrinath is building? | **ASR-garbled, two different spellings.** [00:06:40] "called Noon"; [00:06:56] "Okay, null"; [00:13:16] "Null is the tool that you are creating, correct?" Transcript alone doesn't resolve which spelling is correct. |
| 3 | What company did Arpan do a launch event for? | REA Group, "one of Australia's largest real estate, Housing.com's parent" [00:09:33–00:09:43]. Unambiguous. |
| 4 | What memory/search tool did Shrinath name? | "Lance" [00:25:33–00:25:48] (likely LanceDB); adjacent ASR noise ("BBJ here") but the tool name itself is clear. |
| 5 | How long ago did Shrinath start building "the portal"? | **Contradictory in one breath.** [00:27:09]: "I started building the portal about two weeks ago, but the current shape and form has been from Monday" — two different start-point framings, not reconciled. |
| 6 | What WhatsApp-automation library did Shrinath mention? | "Baileys" [00:36:02], "an artificial hack." Unambiguous. |
| 7 | What scheduling tool does Arpan use, and is it charged per account? | oneup.app (O-N-E-U-P) [00:42:31–00:42:37], explicitly "not charging me per account." Unambiguous. |
| 8 | Who is Shrinath's target user — technical or non-technical? | **Contradictory/evolving.** [00:38:16]: "I'm looking at a non-techie… it could even be a mother"; earlier [00:30:34] "target audience is a CXO"; then [00:38:34] Shrinath agrees with Arpan that tech-savvy founders would be the easiest early adopters ("that's a good point"). No single settled answer in this transcript. |
| 9 | Who gave the "drop an invoice, it auto-classifies" example, and what was it? | Shrinath (not Arpan) [00:12:26–00:12:30]: "You can drop in, for instance, an invoice. It will generate that it's an invoice." |
| 10 | What did the Aptify founder do to his tech team, per Arpan? | Reduced it from 50 people to 5 [00:39:07–00:39:17]. **Secondhand** — Arpan is relaying someone else's account, not something he witnessed directly; the transcript doesn't corroborate it independently. |
| 11 | Does the system's classifier use an LLM? | **Contradictory across two different components**, easy to flatten into one wrong answer. [00:14:28–00:14:55]: the entity-classifier itself is "not a neural network… Python strings," explicitly not an LLM. But [00:15:31–00:15:34], separately: the initial profile-building conversation "is an LLM task." Two different steps; a single yes/no answer is wrong either way. |
| 12 | What local database/runtime did Shrinath say handles this without cloud lock-in? | "Ulama" [00:32:39] — near-certainly Ollama (a local LLM runtime), but the transcript spells it inconsistently with no clean alternate spelling to confirm against. |

**Scoring** (naive single-pass reading vs. a structured extraction that explicitly checks
for repeated/contradicted mentions before answering, same method as the original 10):

- Unambiguous (3, 4, 6, 7, 9, 10, 12 — 7 of 12): both conditions got all 7 right.
- Deliberately hedged/contradictory (1, 2, 5, 8, 11 — 5 of 12): naive flattened all 5 into
  a single confident-sounding wrong or incomplete answer (e.g. Q1 naive: "70%," no
  mention of the inconsistency; Q11 naive: "no, it doesn't use an LLM," collapsing two
  different components into one wrong blanket claim). Structured extraction correctly
  flagged all 5 as ambiguous/contradictory/unverified, matching ground truth.

**New-set score: naive 7/12, structured 12/12.** Combined with the original 10-question
set (naive 6/10, structured 10/10): **naive 13/22 (59%), structured 22/22 (100%)** across
both transcripts. Same failure shape both times: every naive miss is a hedge or
contradiction in the source getting flattened into false confidence, never a fabrication
of a fact that wasn't said at all. That distinction matters for the site claim — see
bottom line.

### 8.4 Before/after: this session's actual code fixes

**FTS search fix (2.2) — reran both versions against the live `portal.db`, read-only, per
the safety method above.**

`node <old-query-vault.mjs> search "when will Vybe launch" --limit 10` (pre-fix, from
`git show HEAD:query-vault.mjs`): 8 hits, **all 8** from `conversations/*.md` — dori-mini's
own internal build-transcript logs, which happen to contain the words "vybe" and "launch"
somewhere, unrelated to each other. Zero real Vybe content in the top 8.

`node query-vault.mjs search "when will Vybe launch" --limit 10` (current, post-fix): 8
hits, **all 8** genuinely on-topic — `shrinath-v---resume.md`, three different real Vybe
capture docs (`vybe-forward-looking-plan.md`, `vybe-user-feedback-session.md`,
`vybe-dev-sync-2025.md` ×2), two Vybe-adjacent interview docs, and the founder-advisory
kit. Zero filler-word garbage. (Note: this rerun's exact hit list differs in composition
from the original doc's description — the original found Founding Fuel launch docs;
today's vault state surfaces mostly Vybe docs instead. Vault content has changed since the
original run; the qualitative result — junk gone, real content in — is what's being
verified here, not an identical hit list.)

**Dedup fix (2.1/Part 6/7) — re-cited, not rerun** (per instructions — it already ran once
this session and rerunning `dedupe` against real data again wasn't necessary or requested):
- `semantic-index.mjs dedupe` (Part 6, corrected in Part 7): 515 real duplicate groups
  (down from an initially-bogus 529 caused by Bug 1's empty-body hash collisions), 100
  trivial/near-empty files correctly excluded from dedup, 407 canonicals back-filled with
  previously-missing chunks.
- `reindex-vault.mjs dedupe` (Part 7): 515 duplicate groups, 111 already-indexed
  duplicates removed from search, 1,378 canonicals back-filled with a missing FTS row, 100
  trivial files excluded.
- **Live re-check today** (read-only query against the current `portal.db`, no mutation):
  `SELECT COUNT(DISTINCT duplicate_of) FROM vault_documents WHERE duplicate_of IS NOT
  NULL` → **515** groups, matching Part 7's number exactly. `query-vault.mjs search
  "aligna"` still returns real results (the specific regression Part 7 fixed). Confirms
  the fix is still in effect, not just recorded.

**"Savings," quantified concretely — and one important correction to what "savings" means
here:**

- **Embedding compute avoided (real, small):** Part 6's clean run found 780 chunks that
  did **not** need re-embedding because they were exact-duplicate content already
  embedded under a different path. This is a genuine, one-time compute saving — real, but
  modest at this vault's size.
- **Search coverage gained (real, but not a "saving" — a bug fix):** 1,378 FTS rows
  (`portal.db`) and 407 chunk-sets (`vectors.db`) were back-filled because dedup's
  canonical-selection pass incidentally discovered those files had **never** been indexed
  at all before this fix (Part 7's bigger finding). This is a genuine capability gain —
  "the vault is now more findable than it was" — but it should not be described as an
  efficiency saving on the marketing site; it's closer to "we found and fixed a
  pre-existing indexing gap," which is a different (and arguably more important) claim.
- **Storage — checked, and it does NOT support a "smaller index" claim; disclosing the
  actual direction.** Real file sizes, backup vs. live, both DBs:
  - `portal.db`: backup (pre-dedup, timestamped `.bak-2026-08-26`, 11:48) **101 MB** →
    live (post-dedup, 11:58) **132 MB**.
  - `vectors.db`: backup (pre-dedup, 11:42) **109 MB** → live (post-dedup, 12:00)
    **170 MB**.
  Both grew, not shrank. This is expected given the above — the coverage-gap backfill
  (1,378 FTS rows, 407 chunk sets) added far more data than the 780-chunk dedup removal
  took out. **Do not claim "dedup shrank the index" or any storage-savings number on the
  site** — the real, measured effect here is net growth, for a good reason (real, honest
  coverage gained), but growth is growth. If a "storage" angle is wanted for the site at
  all, the honest version is "the index got measurably more complete, not smaller."

### 8.5 Other measured parameters

- **Latency (real, measured, not a strong differentiator either way):** `route-destination.mjs`
  and `query-vault.mjs search` both run in **23–30ms** (three-run average, includes full
  Node process startup). `query-vault.mjs last-meeting` is slower, **~700ms**, because it
  walks the entire non-hidden vault tree (2,854 files) to compute `isStale` per file on
  every call — a real, measured cost of that specific command's current implementation,
  not a general property of the tool. None of this is the actual value driver; the
  meaningful comparison in this whole doc is context/token volume (Parts 1, 8.1, 8.2), not
  wall-clock speed. A human manually grepping/reading is not meaningfully slower in raw
  seconds for a single query either — the value is in what a downstream LLM would have to
  read and pay for, not in how fast the terminal returns.

### 8.6 What was skipped, and why

- **True `git stash`-based before/after** was avoided throughout, per the run
  instructions' safety guidance — the uncommitted fixes also assume new DB columns
  (`content_hash`, `duplicate_of`) that don't exist in the pre-fix schema-writing paths.
  The `git show HEAD:file > /tmp/…` + read-only-query method used instead is safe (verified
  by reading `openDb()` in both versions) and reproducible, and is what's shown above.
- **Re-running the `dedupe` mutation** to get a fresh before/after was explicitly out of
  scope (it already ran once for real this session; Part 6/7 already document it in
  detail) and was not repeated.
- **A third PDF candidate** with a true budget/invoice-style dollar figure was searched
  for and not found in the current vault's PDF-derived `.md` files — most proposal PDFs
  here are qualitative (phases, dates, deliverables) rather than priced. Section 8.2 uses
  the best available real alternative (a metrics/case-study PDF) instead of inventing one;
  this is disclosed rather than papered over, per the run's explicit instruction not to
  fabricate a document.

---

## Bottom line for site copy

- The strong, safe claims (recall, tasks, routing, both PDF cases, the hallucination
  eval) are real and hold up under a rigorous, real-data test — safe to use, with the
  case A (résumé) 99% number as the headline and case B (rank-5-of-5) honestly caveated
  if it's used at all.
- The four break-cases in Part 2 should NOT be quietly ignored if publishing a
  hallucination/reliability claim — at minimum, "results depend on query phrasing" and
  "the system does not detect when it has no relevant information" are true, current
  limitations, not historical ones that got fixed.
- If the site makes a "reduces hallucinations" claim, the honest framing is: Dori reduces
  hallucination risk when it retrieves the right context and that context is fed through
  a extraction step that's designed to flag uncertainty (like mom-prompt.md) — it does
  not prevent hallucination on its own, and retrieval can silently miss or fail to
  disambiguate.

### Addendum from Part 8 (2026-08-26, re-run for the marketing-numbers ask)

- **Safe to publish, with the stated caveats:** context/token reduction in the
  90–99.9% range is real, reproducible today, and holds across five independent cases now
  (recall, tasks, two résumé/report PDF needle cases, and the new metrics-PDF case in
  8.2) — not a one-off. Use a range ("often 95–99%+ less context read"), not a single
  cherry-picked top figure, since the honest number moves with vault size and which case
  is asked about (95.0–99.9% across the cases actually measured this round).
- **Safe to publish, narrowly:** "structured extraction that's designed to flag
  uncertainty catches ambiguous/contradictory source statements that naive reading
  misses" — now double-confirmed, 22/22 vs. 13/22 across two independent real transcripts,
  same failure shape both times (a hedge or contradiction flattened into false
  confidence — never an invented fact). This is a real, repeated, disclosed result.
- **Do NOT publish a storage/index-size "savings" claim.** Measured this round: both real
  DBs grew after the dedup fix (portal.db 101MB→132MB, vectors.db 109MB→170MB), because
  fixing a real, separate indexing-coverage gap (1,378 + 407 backfilled rows/chunks)
  added more than dedup removed (780 duplicate chunks). If storage comes up at all, the
  honest claim is "more complete," not "smaller."
- **Do NOT publish a speed/latency claim as a differentiator.** Measured latency
  (23–700ms depending on command) is real but not the value driver here — don't let site
  copy imply "faster" as the headline; the actual measured benefit is context volume, not
  wall-clock time.
- **Still true, still needs a caveat if a hallucination claim ships:** paraphrase
  brittleness (2.1) generalizes beyond meeting-time/launch-date facts — confirmed again in
  8.2 on a third fact type (a case-study metric). A natural-language question can still
  fail where a literal, source-vocabulary rephrasing succeeds, and there's no way to know
  which from outside the system. Any "Dori finds what you need" claim should not imply
  this is solved.
