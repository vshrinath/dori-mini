---
title: "Baseline retrieval accuracy — natural-phrasing eval, 2026-08-26"
status: internal (not published to site)
scope: 24 questions over 24 ground-truth facts extracted from 8 real vault documents
  (Lighthouse Media, Meridian Health, Sunrise School), run against the REAL post-prune production
  indexes — portal.db (2,455 documents, independently re-counted read-only) and the
  live vectors.db. Ground truth was written and frozen to disk BEFORE any search ran.
  No synthetic fixtures. No Pulse, no hermes. Read-only: no index/dedupe/reindex.
---

# Baseline retrieval accuracy: what the search tools actually find when you ask normally

This measures the number that Part 13.4 says the contextual-retrieval decision needs and
that did not previously exist anywhere: **how often do the two Dori Mini search tools put
the right document in front of you when the question is phrased the way a person would
actually type it?**

The headline is **20% at rank 1 and 55% at rank 20 (either channel)**, which is low. The
rest of this document is about why that is the honest number, what it does and does not
license anyone to say, and which of the two candidate explanations — bad ranking or bad
question — the evidence actually supports.

---

## 0. Method, and the one rule that mattered most

**Strict order, followed:**

1. **Ground truth first.** Eight real documents were read in full. 24 facts were extracted,
   each with an exact quoted proof string, and each proof string was then verified with a
   single `grep -F` against the file it is attributed to. **All 52 proof strings verified
   present (count = 1) before any search command was issued.** Four negative-control claims
   were verified *absent* by grep across the whole indexed corpus.
2. **Questions written in natural phrasing**, deliberately avoiding the source documents'
   own vocabulary, and **frozen to a file on disk before the first retrieval call**, so
   that no result could retroactively shape a question or an answer key.
3. **Both tools run on every question at limit 20**, with requested-vs-returned asserted.
4. **Misses analysed** and grouped by cause, with a source-vocabulary retry run on every
   both-channel miss to separate "not indexed" from "not ranked."

**Commands (run from `~/.claude/skills/dori`):**

```bash
node semantic-index.mjs search "<question>" 20        # hybrid vector+FTS, vectors.db
node query-vault.mjs   search "<question>" --limit 20 # FTS/BM25, portal.db
```

**Part 12's limit assertion, checked and passing.** 24 questions × 2 tools = 48 runs.
**All 48 returned exactly 20 results for a requested limit of 20.** The `MAX_SEARCH_LIMIT`
clamp that silently truncated Part 9's tests is genuinely gone; every number below was
measured at the depth it claims.

**Corpus is the cleaned one.** `portal.db` re-counted read-only at **2,455 documents**,
matching Part 13.3's post-prune figure exactly. This baseline is therefore measured against
the corpus after `hermes/` and Pulse were removed, as 13.4 requires. (`vectors.db` chunk
count could not be re-verified independently — see §8.)

**Duplicate-path scoring, as instructed.** The vault carries near-copies of project content
under both `projects/…` and `entities/projects/…`. **A hit on either path is scored
correct.** Verified by hash: Meridian Health copies are byte-identical (`phase-1-proposal.md` exists in
**four** identical copies); Lighthouse Media copies differ by exactly one frontmatter line
(`account: lighthouse-media`) and are otherwise identical. Both tools already return the
`entities/…` path as canonical, so in practice the dedup layer is doing its job on this axis.

---

## 1. Ground-truth answer key

All 24 facts, with verified proof strings. Paths are given as `projects/…`; the
`entities/projects/…` copy of each scores identically.

**Document keys:** FF-Pre = `<vault>/projects/lighthouse-media/meetings/Pre launch readiness sync mom.md` (2026-03-13) · FF-Launch = `…/projects/lighthouse-media/meetings/Launch morning check in mom.md` (2026-03-16) · FF-Tax = `…/projects/lighthouse-media/meetings/Taxonomy tech onboarding sync mom.md` (2026-03-09) · FF-Osc = `…/projects/lighthouse-media/meetings/Video production oscars strategy mom.md` (2026-03-11) · FF-Arch = `…/projects/lighthouse-media/meetings/Technical architecture audit arjun.md` (2025-11-27) · SC-EMR = `…/projects/meridian-health/2026-05-19-vision-institute-emr---decision-with-meridian-health-management.md` · SC-P1 = `…/projects/meridian-health/context/phase-1-proposal.md` · SM-EC = `…/captures/2026-06-20-sunrise-school-ec-meeting.md` (2026-06-20)

| # | Fact | Doc | Verified proof string |
|---|---|---|---|
| F1 | Go-live window was Sunday night Mar 15 / Monday early morning Mar 16, between midnight and 1 AM | FF-Pre | `between 12:00 AM and 1:00 AM` |
| F2 | Vertical scaling + multi-layer caching chosen; load balancing explicitly deferred | FF-Pre | `Horizontal scaling/load-balancing is deferred` |
| F3 | The "Videos" category was renamed "Podcasts" | FF-Pre | `"Videos" label changed to "Podcasts"` |
| F4 | PagerDuty was the tool being explored for downtime alerting | FF-Pre | `exploring **PagerDuty** integration for real-time downtime alerts` |
| F5 | Infinite scroll deliberately disabled on the homepage so the footer stays reachable | FF-Launch | `disabled for the Homepage` |
| F6 | Middle East War was moved to the #1 collection slot on launch morning | FF-Launch | `1. Middle East War` |
| F7 | The legacy archive is ~2,500 articles | FF-Tax | `2,500-article archive` |
| F8 | AWS SES powers magic-link login and the 5-email onboarding sequence | FF-Tax | `AWS SES** configuration for Magic Link logins and the 5-email onboarding sequence` |
| F9 | Ronan Roy is the Oscars-coverage contributor | FF-Osc | `contributor **Ronan Roy**` |
| F10 | Arjun Nayak, the platform's original architect, did the peer-review audit | FF-Arch | `Arjun Nayak (AN)** — Original Architect` |
| F11 | The VISION-INSTITUTE EMR backend uses MongoDB | SC-EMR | `backend they are using the MongoDB` |
| F12 | The Meridian Health advisory commitment is ~2 days per week | SC-P1 | `~2 days per week of engagement` |
| F13 | The Sunrise School AGM is on 18 July | SM-EC | `which is on the 18th of July` |
| F14 | KPMG proposed raising EC membership from 7 to 9 | SM-EC | `increase the number of EC members from 7 to 9` |
| F15 | Meilisearch serves 90% of non-article pages | FF-Arch | `Meilisearch now serves 90% of non-article pages` |
| F16 | Pepsi had 125+ failed AI POCs (Arjun's cautionary example) | FF-Arch | `Pepsi's 125+ failed POCs` |
| F17 | ~18 archive articles had complex co-author chains; name-only placeholders planned | FF-Tax | `~18 articles with complex co-author chains` / `GM will create "name-only" profile placeholders` |
| F18 | Multi-author byline support shipped; migration script to run on legacy joint stories | FF-Launch | `Support for multiple authors is now in place` |
| F19 | Product-tour video was planned with **CA** doing voiceover + PIP bubbles | FF-Osc | `CA providing voiceover and "bubbles" (PIP) commentary` |
| F20 | That reversed: Daniel proposed voiceover-only, IJ insisted on face-on-screen via PIP | FF-Launch | `IJ insisted on having the face on screen (via PIP)` |
| F21 | Policy: broken embeds get disabled/removed, not fixed, for Phase 1 | FF-Tax | `Broken embeds will be identified and disabled/removed from active views` |
| F22 | GM's script finds them; RN removes/hides them from published articles | FF-Pre | `GM's script will flag archival articles with broken YouTube/SoundCloud embeds` |
| F23 | Decision logged: target Monday March 16 early-morning cutover | FF-Pre | `Target Monday, March 16 early morning cutover` |
| F24 | It happened: launch-morning meeting confirms collections live | FF-Launch | `All collections are currently live.` |

### Negative controls — verified ABSENT

Each checked with a case-insensitive regex `grep -l` across all 2,702 indexed `.md` files
(the full vault minus `hermes/` and Pulse, which Part 13 removed from both indexes).

| # | Claim | Corpus hits |
|---|---|---|
| N1 | Neel's monthly pay / developer retainer rate | **0** |
| N2 | Any uptime or SLA commitment made after launch | **0** |
| N3 | Any investor or funding round for Lighthouse Media | **0** |
| N4 | Lighthouse Media newsletter-subscriber count at launch | **0** |

---

## 2. The question list

Written before retrieval, frozen to disk. The design goal was to *not* echo source
vocabulary — so F3's question never says "Videos" or "Podcasts", F16's never says "Pepsi"
or "POC", F12's never says "engagement" or "days per week."

| # | Type | Question (verbatim as run) | Target |
|---|---|---|---|
| Q1 | single | what time of night were we going to push the new site live | FF-Pre |
| Q2 | single | why did we skip load balancing for the new site | FF-Pre |
| Q3 | single | we renamed one of the site sections right before going live, what did it become | FF-Pre |
| Q4 | single | what were we going to use to get alerted if the site went down | FF-Pre |
| Q5 | single | why doesn't the front page keep loading more stories as you scroll | FF-Launch |
| Q6 | single | which topic did we put at the top of the homepage on launch day | FF-Launch |
| Q7 | single | roughly how many old stories are sitting in the archive | FF-Tax |
| Q8 | single | what are we using to send the sign-in emails | FF-Tax |
| Q9 | single | who writes our film awards coverage | FF-Osc |
| Q10 | single | who was the original developer we asked to look over the new setup | FF-Arch |
| Q11 | single | what database is the hospital records system we are evaluating built on | SC-EMR |
| Q12 | single | how much of my week did I commit to the eye hospital advisory work | SC-P1 |
| Q13 | number/date | when is the school society annual general meeting happening | SM-EC |
| Q14 | number/date | how many people do they want on the governing committee now | SM-EC |
| Q15 | number | what share of our pages does the new search engine handle | FF-Arch |
| Q16 | number | how many failed AI pilots did the soft drinks company have | FF-Arch |
| Q17 | multi-hop | we had a mess with stories written by two people, did that get sorted before launch | FF-Tax **+** FF-Launch |
| Q18 | multi-hop | Daniel was going to narrate the site tour video, is that what actually happened | FF-Osc **+** FF-Launch |
| Q19 | multi-hop | old articles had dead audio players, what did we decide to do and who was finding them | FF-Tax **+** FF-Pre |
| Q20 | multi-hop | we agreed a time to flip the switch, did the site actually go live that morning | FF-Pre **+** FF-Launch |
| N1 | negative | what are we paying Neel per month | — none — |
| N2 | negative | what uptime did we promise after the launch | — none — |
| N3 | negative | which investor put money into Lighthouse Media | — none — |
| N4 | negative | how many newsletter subscribers did Lighthouse Media have at launch | — none — |

---

## 3. Results

### 3.1 Rank of the target document (`-` = absent from top 20)

Multi-hop rows show both required documents; the question scores as a hit only if **both**
appear within k.

| # | semantic-index | query-vault (FTS) |
|---|---|---|
| Q1 | **2** | **2** |
| Q2 | **1** | 9 |
| Q3 | – | 8 |
| Q4 | – | 7 |
| Q5 | 14 | – |
| Q6 | – | **1** |
| Q7 | – | – |
| Q8 | – | – |
| Q9 | **1** | – |
| Q10 | – | – |
| Q11 | – | – |
| Q12 | – | – |
| Q13 | – | **4** |
| Q14 | **1** | **1** |
| Q15 | – | – |
| Q16 | – | – |
| Q17 | – / 9 → **miss** | – / – → **miss** |
| Q18 | 7 / – → **miss** | **1 / 2 → hit@2** |
| Q19 | **1 / 3 → hit@3** | 9 / 16 → hit@16 |
| Q20 | 6 / – → **miss** | 6 / – → **miss** |

### 3.2 Hit rate at k — all 20 fact questions

| k | semantic-index | query-vault (FTS) | Either channel |
|---|---|---|---|
| **k=1** | 3/20 = **15%** | 2/20 = **10%** | 4/20 = **20%** |
| **k=5** | 5/20 = **25%** | 5/20 = **25%** | 8/20 = **40%** |
| **k=10** | 5/20 = **25%** | 8/20 = **40%** | 10/20 = **50%** |
| **k=20** | 6/20 = **30%** | 9/20 = **45%** | 11/20 = **55%** |

### 3.3 By question type

| Slice | Tool | k=1 | k=5 | k=10 | k=20 |
|---|---|---|---|---|---|
| Single-fact (n=12) | semantic | 17% | 25% | 25% | 33% |
| | FTS | 8% | 17% | 42% | 42% |
| | either | 25% | 33% | 50% | **58%** |
| Number/date/name (n=4) | semantic | 25% | 25% | 25% | 25% |
| | FTS | 25% | 50% | 50% | 50% |
| | either | 25% | 50% | 50% | **50%** |
| Multi-hop, both docs (n=4) | semantic | 0% | 25% | 25% | 25% |
| | FTS | 0% | 25% | 25% | 50% |
| | either | 0% | 50% | 50% | **50%** |

**Channel disagreement is the dominant pattern, and it reproduces Part 11.4 a fifth time.**
Of the 11 fact questions solved by at least one channel at k=20, only **4 were solved by
both** (Q1, Q14, Q18, Q19). Seven were solved by exactly one channel — and which one is not
predictable from the question. Q9 is semantic-only at rank 1; Q6 is FTS-only at rank 1.
Nothing about the two questions tells you in advance which tool to reach for.

### 3.4 A second, uncounted failure: the hit does not carry the answer

Part 11.4's byte-methodology correction reproduces here, and it qualifies every number
above. A "hit" in §3.2 means the **right document was retrieved** — not that the returned
text contained the answer. Spot-checking six FTS hits against their own snippets:

| Q | Snippet returned for the correct document | Answer inside it? |
|---|---|---|
| Q6 | `…due to its current topicality. The top three will be:  1. Middle…` | **No** — truncated one word before "East War" |
| Q14 | `…we want any criteria for people to be members how many categories…` | **No** — different part of the transcript entirely |
| Q3 | `…archive remediation 72 hours before "Go-Live."  ## Attendees…` | **No** |
| Q13 | `…We stopped the school. **Speaker 1**: can't have that happening…` | **No** |
| Q1 | `…timeline, infrastructure scaling, and archive remediation…` | **No** |
| Q2 | `…Horizontal scaling/load-balancing is deferred as traffic patterns…` | **Yes** |

**1 of 6.** The snippet locates; it does not answer. Per Part 11.4, the honest unit for any
downstream reduction claim is the enclosing chunk or note section, not `bytes.returned` —
**no reduction figure is reported in this document**, because measuring one correctly was
not the assignment and the snippet-based one would be wrong.

---

## 4. Miss analysis, grouped by cause

### Cause 1 — Register mismatch. **Dominant, and demonstrated rather than asserted.** (7 of 9 both-channel misses)

Q7, Q8, Q10, Q11, Q12, Q15, Q16 were missed by *both* channels at depth 20. The obvious
competing explanation is a coverage gap — the document isn't indexed. It was tested. Each
question was re-run once using the source document's own vocabulary:

| Q | Source-vocabulary retry | semantic | FTS |
|---|---|---|---|
| Q7 | `2,500-article archive SoundCloud broken embeds legacy stories` | **1** | **2** |
| Q8 | `AWS SES Magic Link logins 5-email onboarding sequence` | 6 | **1** |
| Q10 | `Arjun Nayak original architect technical architecture audit` | **3** | **1** |
| Q11 | `MongoDB Angular Azure microservices EMR architecture` | 11 | 6 |
| Q12 | `~2 days per week of engagement in-person visits weekly sync-ups` | **2** | **1** |
| Q15 | `Meilisearch serves 90% of non-article pages RDS load` | **2** | **1** |
| Q16 | `Pepsi 125+ failed POCs agentic AI production control` | **2** | **1** |

**7 of 7 recovered. 6 of 7 into the top 3 on at least one channel.** Every one of these
documents is indexed, reachable, and rankable — the natural-language question simply does
not reach it. This is section 2.1 / 10.1's register-mismatch finding reproduced on a fresh,
multi-project, ground-truth-first set, and it is now the measured majority cause of failure
rather than a case study.

**The circularity caveat from 11.4 applies unchanged and should never be dropped from any
copy that cites the retry numbers:** to write `Pepsi 125+ failed POCs` you must already know
the answer. The retry strategy is real and it works; it is not retrieval succeeding.

### Cause 2 — Chunk dilution consuming the result budget. **Newly quantified.** (contributing factor in ~5 questions)

Semantic results are chunk-level and are not collapsed per document. Across all 24
questions, `semantic-index.mjs` returned a mean of **14.33 distinct files per 20 slots**
(FTS: **19.20**). Worst cases:

| Q | Distinct files in semantic top-20 |
|---|---|
| Q11 | **7** — `Meridian Health-Data-Strategy-Fixed.md` alone occupies 8 slots |
| Q9 | 8 |
| Q12 | 9 |
| Q14 | 9 |
| Q5 | 10 |

So a caller asking `semantic-index` for 20 results is effectively getting a top-14 by
document. On Q11 the target was not merely out-ranked; it was crowded out — 18 of 20 slots
went to four Meridian Health *data-strategy* documents while the EMR meeting transcript that actually
names MongoDB never appeared. Note this is **not** the `projects/` vs `entities/projects/`
duplication — the dedup layer is collapsing that correctly, and every returned path was the
canonical `entities/…` one. This is repeated chunks of a single file.

### Cause 3 — Topic-size imbalance (Q15, Q16, Q12, Q11)

A short meeting note competes against long, dense documents that are *about* the query's
topic without containing its answer. Q15 ("what share of our pages does the search engine
handle") returned SEO audits, sitemap docs and a Google Custom Search deployment note; Q16
("failed AI pilots at the soft drinks company") returned AI-strategy decks and a Hemingway
short-story collection. The single sentence that answers each sits inside a 5 KB meeting
note that never ranks against them.

### Cause 4 — Multi-hop retrieval reaches one half, never both (Q17, Q20)

**Q20 is section 2.4's canonical case, re-tested with independent phrasing — and it fails
with the polarity reversed.** Part 2.4 reported `Launch morning check in mom.md` at rank 2
with `Pre launch readiness sync mom.md` absent. Here, asking "we agreed a time to flip the
switch, did the site actually go live that morning": **both channels return `Pre launch
readiness sync mom.md` at rank 6, and neither returns `Launch morning check in mom.md` at
all.** The limitation is confirmed and sharpened: single-query retrieval reliably surfaces
*one* half of a two-document fact, and **which half you get depends on your phrasing**. A
downstream answer would have had the plan and no way to know the outcome — the exact
inverse of the risk 2.4 described, from the same document pair.

Q17 fails the same way (semantic finds only the outcome, FTS neither half). Q18 and Q19 are
the counter-examples: both halves land, but on *different* channels — FTS got Q18 at ranks
1–2, semantic got Q19 at ranks 1–3, and neither tool got both questions.

### Cause 5 — Not indexed: **zero occurrences**

No miss in this eval was a coverage gap. Every target document was demonstrably retrievable
(§4 Cause 1 for the seven hard misses; the remaining targets appeared at rank 1–9 on at
least one channel for some question). The pruned index is not missing this content.

### Cause 6 — Duplicate-canonical issues: **zero occurrences**

Both tools consistently returned the `entities/projects/…` canonical path. No question was
scored a miss because the answer surfaced under an unexpected duplicate path.

---

## 5. Negative controls — the "not found" signal is still absent, verbatim

All four negative controls returned **20 results each** on both channels. None signalled
absence in any way.

**`semantic-index.mjs` top-5 score ladder, negative controls:**

| Q | Scores | Top hit |
|---|---|---|
| N1 | `1.000 0.984 0.968 0.953 0.938` | `references/kindle/Briggman-Kickstarter Launch Formula.md` |
| N2 | `1.000 0.984 0.968 0.953 0.938` | `…/lighthouse-media/meetings/Pre launch readiness sync mom.md` |
| N3 | `1.000 0.984 0.968 0.953 0.938` | `entities/people/daniel-cross.md` |
| N4 | `1.000 0.984 0.968 0.953 0.938` | `entities/people/daniel-cross.md` |

**The same ladder, from three of this eval's genuine rank-1 successes:**

| Q | Scores |
|---|---|
| Q2 (correct doc at rank 1) | `1.000 0.984 0.968 0.953 0.938` |
| Q9 (correct doc at rank 1) | `1.000 0.984 0.968 0.953 0.938` |
| Q14 (correct doc at rank 1) | `1.000 0.984 0.968 0.953 0.938` |

**Character-for-character identical.** Section 2.3 reproduces exactly: RRF max-normalization
pins the top result of any query to 1.000 by construction, so the score carries zero
information about whether the vault contains the answer. `query-vault.mjs` is worse in one
respect — its JSON hit objects expose **no score field at all** (`rel_path`, `title`,
`date`, `type`, `snippet`), so there is not even an uncalibrated number to inspect.

**N2 is the dangerous shape, and it is worth quoting in any internal discussion of this
risk.** Asked what uptime was promised after launch — a commitment that appears **nowhere**
in the corpus — `semantic-index` returns `Pre launch readiness sync mom.md` at score
**1.000**. That is a real, recent, highly relevant-looking launch document from the right
project. It was confirmed by grep to contain **zero** matches for `uptime`, `SLA`, or
`99.x%`. An LLM handed that context and asked the question sees a top-scoring, on-topic,
authoritative-looking source and has nothing whatsoever telling it the answer is not in
there. Whether it then invents an SLA depends entirely on the consuming prompt, not on
retrieval.

---

## 6. My own bias, stated plainly

**I wrote both the questions and the answer key. That is the single largest limitation of
this eval and it cuts in a specific, knowable direction.**

- I chose the phrasings. I was *trying* to avoid source vocabulary, and I was doing so with
  full knowledge of what the source vocabulary was — which is not a position a real user is
  ever in. It is entirely possible I over-corrected and wrote questions harder than a real
  half-remembering user would produce, which would bias the measured rate **downward**.
  I cannot rule this out and did not attempt to.
- Equally, I picked facts that were crisp and quotable, which tends to favour retrievable
  content and biases **upward**.
- These two biases are not measured, and they do not obviously cancel. **The honest reading
  is that this number is an estimate with unquantified phrasing sensitivity, not a
  measurement with an error bar.**
- The mitigation actually applied is procedural, not statistical: ground truth was extracted
  and every proof string verified before any search ran, and the question list was written
  to disk before the first retrieval call. That rules out the worst failure mode — an answer
  key quietly reshaped by what the tools happened to return — but it does not rule out
  authorship bias in the phrasings themselves.
- **The fix is a real user study**, not a bigger self-authored set. Questions collected from
  the vault owner, unprompted and before seeing the sources, would settle this. Until that
  exists, this number should be described as a first internal baseline.

Sample size is also small: **n=20** fact questions, of which only 4 multi-hop and 4 numeric.
Sub-slice percentages in §3.3 move by 25 percentage points per question and should be read
as directional only.

---

## 7. Safe to claim / needs a caveat / do not claim

### Safe to claim
- **Corpus hygiene is done and verifiable.** `portal.db` independently re-counted at 2,455
  documents, matching Part 13's post-prune figure.
- **The result-limit bug is genuinely fixed.** 48/48 runs returned exactly the requested 20.
- **Register mismatch is the dominant failure mode, and it is a ranking problem, not a
  coverage problem.** 7 of 7 both-channel misses were recovered by source-vocabulary retry,
  6 into the top 3. Every target document is indexed and reachable. This is now measured
  across three independent projects, not inferred from one case study.
- **The two channels fail on different questions.** 11 questions solved by at least one
  channel; only 4 by both. Running both and merging is strictly better than either alone.
- **Semantic results are chunk-diluted**: mean 14.33 distinct documents per 20 returned
  slots, versus 19.20 for FTS. This is a concrete, cheap, index-time-adjacent fix.

### Needs a caveat
- **"55% of questions surface the right document in the top 20"** — true, but only with all
  of: *natural phrasing, self-authored questions, n=20, both channels merged, and "surfaced"
  meaning the document appeared, not that the answer text was returned.* Drop any one of
  those and the sentence becomes false or misleading.
- **The source-vocabulary retry numbers (7/7 recovered)** must always ship with the
  circularity caveat: you have to know the answer to write the query.
- **"Both indexes contain the answer"** — true here, and it is the good news buried in a low
  number. But it is only demonstrated for the 24 facts tested.

### Do not claim
- **Do not put 55% — or any k-level figure from this document — on a public marketing page.**
  It is a self-authored n=20 internal baseline with unquantified phrasing bias. It is fit for
  deciding whether to build an index-time improvement. It is not fit for a claim a stranger
  will read as a benchmark.
- **Do not claim any "won't make things up" / "knows what it doesn't know" property.**
  §5 shows the retrieval layer returning a real, on-topic, rank-1, score-1.000 document for a
  fact that does not exist anywhere in the vault. Section 2.3 is not merely unfixed; it is
  reproduced here on fresh data with an identical score ladder.
- **Do not quote a byte- or token-reduction figure sourced from this eval.** None was
  measured, deliberately — `bytes.returned` is snippet bytes, and §3.4 shows 5 of 6 checked
  snippets did not contain the answer they were retrieved for.
- **Do not claim multi-hop works.** 2 of 4, both by accident of channel, and the one
  documented case (Q20) failed again — with the retrieved half flipped by phrasing alone.
- **Do not cite the Pulse paraphrase example.** Retired by Part 13.2; that content is no
  longer indexed.

---

## 8. What could not be measured, and why

- **`vectors.db` chunk count could not be independently re-verified.** The database lives at
  `~/.dori/caches/feb98dfba3cf1b58/vectors.db` and would not open under a strict read-only
  SQLite URI (it needs the `sqlite-vec` extension and its WAL sidecar). Rather than open it
  writable — which risks mutating a real production index for a cosmetic confirmation — the
  figure is taken from Part 13.3 (23,701 chunks) on trust. `portal.db` **was** re-counted
  directly and matches, which is reasonable circumstantial evidence the same prune landed on
  both.
- **Whether a real user would phrase these questions this way.** See §6. This is the largest
  open item and cannot be closed by anything I write myself.
- **Answer accuracy end-to-end.** This eval measures document retrieval only. Whether an LLM
  handed the retrieved context produces a correct answer — and how often the §3.4
  snippet-without-answer case causes a wrong one — is a separate eval that was not run.
- **Whether `search-multi` (Part 10) improves this baseline.** Not tested; the assignment was
  to baseline the two single-query tools. Part 10.1's finding that fusion helps only with
  well-differentiated *source-vocabulary* phrasings suggests it would inherit this
  document's circularity problem, but that is an inference, not a measurement.
- **Statistical confidence.** n=20 with binary outcomes. No confidence intervals are reported
  because at this sample size they would be wide enough to be actively misleading in a table.

---

## 9. Consequence for the index-time decision

Part 13.4 framed the open question as whether to pay a one-time contextual-indexing cost
(now 5.99M tokens post-prune, payback ~13 recall queries). This baseline is the missing
input, and it argues **for** building it, for a specific reason:

**The failure is not coverage and it is not truncation — both were ruled out here.** It is
that a natural question and the source's own wording live in different vocabulary registers,
and nothing in the current pipeline bridges them. Contextual indexing attacks exactly that
gap at index time, and the retry experiment in §4 is direct evidence the gap is bridgeable:
the documents are already there and rank at 1–3 the moment the query speaks the document's
language. Something has to speak it *for* the user, because §4's circularity caveat means the
user cannot.

Two cheaper things should be done first regardless, because both are small and both are
measured here:
1. **Collapse semantic results per document.** Recovering ~6 of 20 wasted slots costs nothing
   at index time and is the single highest-leverage change in this document.
2. **Always run both channels and merge.** 4/20 → 11/20 at k=20 comes free from merging two
   tools that already exist.
