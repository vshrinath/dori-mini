# Dori Mini homepage — v3 spec

Status: agreed in session 2026-09-02. Supersedes the current `site/index.html` and the
`site/v2.html` draft. Build target: `site/v3.html`.

---

## 1. Who this page is for

A founder, consultant, or business leader **who already has Claude Code or Codex installed**
and is using a fraction of it. Not an engineer, though possibly technical-adjacent.

The page **converts an existing population, it does not create one**. It spends zero words
explaining what Claude Code is. The gate is deliberate: the product cannot run without one.

The emotional beat, in order: *I already own this* → *you understand my week* → *relief* →
*proof* → *this gets better the longer I use it*.

## 2. Voice rules

**Never say:** memory, harness, MCP, skills, tools, markdown, vault, deterministic,
"context bloat", token counts as a headline, "files you can open yourself", Gemini CLI
(not supported), "100% private" (false — model calls go to the agent), "most of it never
calls a model" (reads as a dodge to someone sitting inside a model).

**Say instead:** the boring bits, filing, recall, your knowledge base, one line, no new
subscription, no new company in the loop.

**Jargon is named exactly once**, in the hero sub-line, as the thing you *don't* have to
learn. Never again after that.

**Every example uses the "Dori" wake word**, consistently. The fact that pasted links and
files need no prefix is a day-two discovery, not a rule we teach on day one.

**Naming:** the product is **Dori Mini**. The name you call inside your agent is **Dori**.
State this once, plainly, then be consistent.

## 3. Page structure

### 3.1 Header
Sticky, translucent, backdrop blur. No bottom border until scrolled, then a hairline fades
in. Height ~56px.

- **Left:** one lockup — the script `dori` wordmark (inline SVG, ~22px) with `mini`
  following in body face, muted. One baseline. No rounded-square app icon.
- **Centre:** nav links, 14px, generous spacing.
- **Right:** one quiet *text* CTA ("Get started"). Not a filled button.

### 3.2 Hero — centred, Apple-scale air
> **Got Claude Code?**
> **Now make it work for your business.**

`Claude Code` cycles to `Codex` and `Antigravity` on a soft crossfade. It rests on Claude Code.

Sub-line (this is where jargon is named once and discarded), split across two lines so the
payoff isn't buried at the end of the setup — the second line is larger, full-ink and
semibold, the first stays muted:
> Skills, tools, MCP servers, harnesses. Engineers spend weeks wiring that in.
>
> **Dori Mini does it in one line.**

Two links, Apple pattern: a filled pill `Get started`, a plain text link `See it work`.
**No curl command in the hero.** It moves to the close.

Vertical rhythm: ~120px above headline, 40 to sub-line, 40 to links, 80 to the demo.

Below the fold-line: the chat demo, ~720px, centred, no border, soft wide shadow, typing on
its own loop. This is the product shot.

### 3.3 The plain statement
One unglamorous sentence directly under the hero, so a reader has something to repeat:
> Dori Mini is a set of scripts your agent runs on your own machine, that file and recall
> your business documents.

### 3.4 "When you don't want to" — six frames
Two-column grid on desktop, one on mobile. Compact cards, not full-width bands.

Each card: a **realistic** visual on top, the *when you don't want to* line, then the single
line you type. The visual carries the recognition, so it must look real, not illustrated.

| # | Line | Visual |
|---|---|---|
| 1 | watch a 45 minute video for two key points | video player, `45:12` badge, progress bar untouched |
| 2 | write up the meeting you just sat through | "Call ended · 1h 04m" beside an empty note, cursor blinking |
| 3 | open six folders to find one invoice | file list: `invoice-final.pdf`, `invoice-final-v2.pdf`, `invoice-FINAL-actual.pdf`, `Scan-2026-08-12.pdf` |
| 4 | rebuild a trip's expenses from a fistful of receipts | receipt stack + spreadsheet row with `?` in the amount column |
| 5 | remember who promised what, and by when | transcript scrolled deep, one "I'll get that to you Friday" buried |
| 6 | re-read a 30 page proposal for one number | PDF at 4% scroll, search box open |

**Review note:** build six, cut to four. Frames 1 and 3 are the most viscerally
recognisable and lead.

### 3.5 The turn
One line, large, on its own, serif italic:
> Dori Mini handles the boring bits of your business.

### 3.6 The three Zeros + the one number
Placed **after** the frames, never before — zero of something you haven't yet been annoyed
by is not a benefit.

> **Zero** digging through folders. It finds the details you want. Quickly.
> **Zero** technical skill to set up. One line, inside the tool you already use.
> **Zero** extra per month. No new subscription, no API key.

Then one line, the only statistic on the page:
> Up to 95% fewer tokens to find something or answer a question. Measured against a real
> working vault of about 2,800 files. [See the numbers →]

### 3.7 The four groups
Full-width alternating bands. Each states **how**, and carries a real `Dori, …` utterance.

1. **Meetings.** Paste a transcript. It writes the minutes, pulls out every decision, and
   turns each action item into a task with the right person's name on it.
   → *"Dori, what did Alan commit to in the last meeting?"*
2. **Money.** Photograph a receipt. It reads the amount, date and category and files it
   against the right client or trip. Business and personal on the same card? You say which
   is which, and only the business ones land on the claim.
   → *"Dori, close out the Denver trip."*
3. **Projects and people.** Say you're starting something new and it builds the whole
   project structure. Paste a transcript and it identifies who was in the room, creates a
   profile for each of them, and maps every future meeting to them.
   → *"Dori, start a project for the Kestrel rebrand."*
4. **Your knowledge base.** Drop in a video, a proposal, a framework, a set of brand
   guidelines. It indexes each one and answers from them, showing the passage it came from.
   → *"Dori, what did that video say about pricing?"*

### 3.7a Watched folder — its own short band

Moved out of the Money group in review: it was unclear there, and it isn't a money feature.
It answers the question a reader has after the four groups — *do I have to hand it
everything by hand?* — so it sits directly after them, centred and compact.

> **Or don't lift a finger at all.**
>
> Don't want to drag and drop files? Ask Dori to watch a folder, and it reads every document
> you put in there, automatically.
>
> → *"Dori, watch my Downloads folder"*

The default is a `~/Dori Inbox` folder, but setup prompts for which folder to watch, so
Downloads is a supported and much stronger example.

### 3.8 Knowledge base — its own full section
Lifted out of the four groups because it is the only part of the page that argues the
product **compounds**. Everything above saves time once.

Headline: **You bookmarked it. You never went back.**

Sub: everything you save is worth something, and none of it is worth anything if you can't
get back into it. Videos, PDFs, links, proposals.

**Frame one — the capture.** Paste a link, get back timestamped jump points you can click,
with the readable transcript underneath. Copy: navigate straight to what was actually
discussed, with the takeaways already pulled out.

Both cards use **real YouTube stills at 16:9** (`img.youtube.com/vi/<id>/hqdefault.jpg`,
`object-fit: cover` to crop the 4:3 letterboxing), with a play button, the real duration
badge, and a link out to the video. Deliberately **not** an iframe embed: two YouTube
players cost ~1MB of script on load, and more importantly this section's whole argument is
that you don't have 45 minutes — inviting the reader to press play undercuts it. The
gradient stays as the background so a blocked or failed image still reads as a video.

Note for previews: the Artifact sandbox blocks images from any non-approved host, so the
stills only appear on the real site, not in an Artifact preview of this page.

Free visual proof, using the two real vault captures:

| Episode | Uploader chapters | What the capture produced |
|---|---|---|
| IST 19 · Simon Taufel · 35:43 | 7 | used verbatim |
| E182 · Blind Spots To Big Bets · 46:08 | 0 | 28 derived jump points |

That side-by-side makes the "structure comes from the capture, not the uploader" point with
no explanatory sentence.

**Frame two — the payoff.** Both videos on screen, then:
> **Dori, what do these two episodes have in common?**
>
> Both land on expertise being where the blind spot starts. Taufel on self-evaluation as a
> discipline at 10:00, Shrinath on expertise as pattern matching at 23:02. Both give advice
> to a younger self, and both got where they went by taking the unfamiliar route.

Closing line: *one is a cricket umpire, the other a product strategist, and nothing in
either title tells you they're having the same conversation.*

The two closing lines sit **side by side in two columns**, not stacked in a narrow left
measure — stacked, they left half the section's width empty against the two-card grid
directly above. Emotional line left in serif italic at display size, rational line right,
smaller and muted. Collapses to one column on mobile.

Then the honest differentiator (specific, not absolute):
> You could have found that yourself. After watching both episodes end to end. That's 82
> minutes before you can even start looking.

### 3.9 No new company in the loop

Two columns, heading left and the three lines right. The heading previously carried a hard
`max-width: 16ch`, which forced an arbitrary break and left the right half of the section
empty. Never cap a heading in `ch` to shape its break — set the column and let
`text-wrap: balance` do it at every screen size.
Replaces the false "100% private" claim. Answers the real question: *am I taking on new risk?*

> **No new company in the loop.**
> Dori Mini has no server and no account. There's nobody on our end, because there is no
> our end.
> Everything sits in a folder on your own machine.
> The only thing that ever reads it is the agent you already chose.

### 3.10 WhatsApp
Keeps its own band. Phone mockup, real exchange, links to `/docs/whatsapp`.

The thread uses WhatsApp's own **colours** so it's recognised instantly — beige ground
`#efeae2`, outgoing bubbles `#d9fdd3`, incoming white, ink `#111b21`; dark mode `#0b141a` /
`#005c4b` / `#202c33`. Tails on the correct corners, outgoing right-aligned.

Deliberately **not** WhatsApp's actual doodle wallpaper, which is their artwork. The texture
is a generic tile of abstract marks at ~5% opacity, and the colour does the recognising.
Note: a `var()` inside a data URI never resolves, so the doodle's stroke colour and opacity
are baked into two SVGs and the whole `url()` is swapped via `--wa-doodle` per theme.

### 3.11 Your first five minutes
Fixes the empty-room problem: every group above assumes you've already fed it something.

**Three ways in, each with a mock visual**, then one question below them. Three inputs and
one question is a cleaner shape than two inputs and an output, which is what it was.

| # | Step | Mock visual |
|---|---|---|
| 01 | Paste your last meeting transcript. | four lines of speaker dialogue |
| 02 | Point Dori at a folder full of invoices. | four PDF filenames |
| 03 | Paste a link. | a URL bar with a real YouTube link |

Then, centred underneath: *Then just ask.* followed by
> Dori, what did Alan promise in the last meeting? By when did he say he will do it?

Uses Alan, already established two sections up as the person who commits to things in
meetings, rather than introducing a new name for one line.

### 3.12 Closing panel
Anatomy borrowed from the reference emailer: illustration, problem-first headline, one
sentence with a bolded phrase, two parallel lines, a flat summary line, one button.

> **Stop being your own filing system**
>
> One line inside Claude Code sets up **meetings, invoices, expenses and recall**.
>
> Boring bits? Handled on your machine.
> Real decisions? Still yours.
>
> No new subscription. Just setup.
>
> `[ Get started ]`

The install line lives here, in full, with the Windows variant beneath it.
Just above the panel: *Call Dori inside Claude Code or Codex, and let it handle the boring bits.*

**Hand-drawn marks, not emoji.** Emoji work in email because email has no design system;
on a composed page they cheapen it and are a standard generated-design tell.

## 4. Visual system

**Two registers, each with a job.**
- **Realism** belongs to the pain (the six frames, the video captures). Recognition requires
  it to look like a real screen.
- **Hand-drawn**, in the same hand as the script logo, belongs to the connective tissue and
  the closing panel, where warmth matters more than recognition.

**De-box everything.** The current site separates things with hairline borders on rounded
cards. Replace with soft shadow, background tint, and whitespace. Apple almost never draws a
border. This is the single biggest driver of "designed by an engineer".

**Type scale widens.** Headings get noticeably bigger, body stays where it is.

**Motion:** reveal-on-scroll (fade + slight rise) per band. The hero demo types on a loop.
The agent name crossfades. Nothing else moves. Respect `prefers-reduced-motion`.

**Palette:** navy ink, cream paper, amber accent used once per screen, echoing the dot on
the `i`. One green, only in the WhatsApp band.

**Contrast is a token rule, not a per-element fix.** Every text colour must clear WCAG AA
(4.5:1 normal, 3:1 for large) against *all three* grounds it can sit on — `--paper`,
`--paper-2` and `--raise` — because the same muted token is reused across bands. `--paper-2`
is the darkest ground and therefore the binding constraint. An audit on 2026-09-02 found 47
failures across the page; every single one was `--ink-3`, which was `#8a8fa8` (3.11:1). It is
now `#666b88`, which passes on all three grounds. Amber-as-text uses `--amber-deep`
(`#b87d14`); `--amber` itself stays bright because its other uses are decoration
(underline strokes, dots, rules), which carry no contrast requirement.

Re-run the audit after any palette change: walk every text-bearing element, composite the
alpha stack to get the true background, and compare. Check all three theme states — bare
`:root`, `prefers-color-scheme: dark`, and `[data-theme="dark"]`.

**Section heads are always centred, and a subhead inherits its head's alignment.** Mixed
alignment across sections reads as an accident, not a rhythm. Every `h2` that opens a section
sits in a `.sechead` block: centred, `max-width:60ch`, with its `.sub` centred beneath it.
This cost two earlier two-column layouts (the trust list and the WhatsApp panel, both of which
had heading-left / content-right); both are now centred head over centred content. Card-level
`h3`s inside the alternating feature groups stay left-aligned — they are card content, not
section heads.

**The ground stays warm.** Pure white was evaluated and rejected on 2026-09-02. It does not
help contrast (it would have moved the failing token from 3.11 to 3.19 against a 4.5
requirement, so the ink was always the real problem). All 29 raised surfaces carry their own
border or shadow, so nothing structurally depends on the cream — but on white the raised
white cards lose their perceived lift and the page reads more generic. The warmth also ties
the page to the script logo.

## 5. Claims register — what is defensible

| Claim | Verdict | Source |
|---|---|---|
| Up to 95% fewer tokens | ✅ safe | research doc authorises 95–99.9%; ~97% is the honest video figure |
| 99% less reading | ⚠️ leans on a snippet measure the doc says overstates | use 95% instead |
| 22 of 22 answers right | ⚠️ homepage-unsafe | reads as one use case; belongs on benchmarks page with caveats |
| 3× recall | ❌ drop | measured on the 12-file test vault, not the real one |
| Speed / latency (23–30ms) | ❌ drop | research doc explicitly says do not publish as a differentiator |
| Uploader chapters | ⚠️ qualify | only 11 of 14 real videos have them |
| Derived jump points | ✅ stronger claim | 100% of captures, avg one per 99s vs 146s uploader avg |
| "46 minutes → 3 minutes" | ❌ never | no human was ever timed; no measured time saving exists |
| 82 minutes to find the overlap yourself | ✅ | 35:43 + 46:08, arithmetic |
| 100% private | ❌ false | model calls go to the agent's provider |
| Requires Node.js 24+ | ❌ remove from site | `setup.sh` installs Node via nvm/brew/apt/pacman |
| Works with Gemini CLI | ❌ false | installer covers Claude Code, Codex, Antigravity only |
| "N past meetings linked" | ❌ false | nothing backfills existing meetings onto a new person. Linking is forward-only, which the body copy already said ("maps every future meeting to them") |
| "Details researched online and updated" | ❌ don't use | `research-person.mjs` fetches via Tavily but never writes back to the profile, so "updated" is false — and it needs a `TAVILY_API_KEY`, which contradicts the "no API key" line in the Zeros |
| "Dori classifies business vs personal bills for you" | ❌ not built | `expense-router.mjs`'s classifier is keyword-based and only assigns Food / Transport / Lodging / Travel. There is no business-vs-personal inference anywhere in the repo |
| "You say which is which, and only the business ones land on the claim" | ✅ true | the ledger has a `Reimbursable` column; `attach-receipt.mjs` takes `--reimbursable true\|false` and `actions.mjs` exposes it. Set explicitly, never guessed |

## 6. Open items

- **Social proof.** Both reference sites lead with it; we have none. Three real user lines
  would outweigh another feature. Decide deliberately rather than leaving a gap.
- **Real art** for the six frames and the closing panel illustration. v3 ships with
  HTML/CSS mockups that stand in convincingly; commission once the structure is signed off.
- **The script `dori` wordmark as SVG.** Only a raster app icon exists today.
