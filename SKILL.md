---
name: dori
description: Route a pasted YouTube link, document, meeting transcript, or expense/bill message to the right conversion — YouTube link -> yt-dlp transcript/download, document (PDF/DOCX/PPTX/XLSX/HTML) -> markitdown conversion to Markdown, meeting transcript -> structured minutes-of-meeting, expense/bill message -> a trip ledger row. Also fetches new meetings straight from Fathom on request. Then asks where to save the result. Answers vault recall ("what did I decide", "last meeting with X") via query-vault.mjs, including multi-hop connection questions ("who else is connected to X", "who's on Y's team") via its `related` command. Also stores/looks up API keys, passwords, and account IDs in a local encrypted credentials store (credentials-store.mjs) — use for "what is my X key/id", "store this credential/password/API key", or a script that needs a stored secret. Use whenever the user pastes a youtube.com/youtu.be URL, attaches or references a document file, pastes/points to a meeting transcript, asks to pull/sync/check Fathom for new meetings, mentions spending money / shares a bill or receipt, asks what they decided or discussed in a past meeting, or asks about a stored credential/key/password/account ID.
---

# Capture Router

Detect what was given, run the matching tool directly via Bash — no subagent, no LLM step for extraction — then ask the user where to save the output if they haven't said. Keep this file as the only thing you load up front; only read `mom-prompt.md` in this same directory when branch 3 applies, never for branches 1 or 2.

## 0. When to act without being asked, vs. waiting for "Dori"

This session is usually also being used for real project work, not just capture — so
two message shapes get two different rules (see also `AGENTS.md`):

- **Structural** (act immediately, no prefix): a pasted YouTube URL, an attached
  document/receipt image, a pasted block that's clearly a raw meeting transcript. These
  shapes don't occur in ordinary conversation, so there's nothing to disambiguate.
- **Conversational** (only act if the message starts with "Dori", case-insensitive,
  optional comma — strip it, then match normally): recall/search, task queries,
  free-text expense statements, starting something new (a project, a trip), person
  research. These are plain sentences that could just as easily be about whatever else
  is going on in this session.

**Canvas refresh:** if `CANVAS_VAULT_ROOT` is set (env var or `.env` in this directory),
a bare `Dori` means refresh that Canvas vault: run its collector with `CANVAS_BASE_URL`,
then run this skill's `reindex-vault.mjs` with `VAULT_ROOT` set to that vault and
`PORTAL_DB_PATH` set to its `dori-mini-index.sqlite`. Report only new or changed material
and any failures. Do not print or request the stored Canvas token. With neither variable
set, a bare `Dori` has no special meaning — treat it as an ordinary message.

**Canvas Google Docs:** when a Canvas item contains a `docs.google.com/document` URL,
include it as an openable Google Docs link in the response. If the user asks to see the
document, open that link in the authenticated school Google account, read it without editing,
and retain the tab as a deliverable.

**Canvas answer sources:** every answer based on the Canvas vault must name its supporting
source (assignment, announcement, module item, file, or external link) and include an
openable link to it when Canvas or the source provides one. Do not invent a link when the
vault has no source URL.

## 1. YouTube link (`youtube.com/...` or `youtu.be/...`)

Transcript only (default, fastest) — `--write-info-json` also lands the uploader's own chapters and description alongside the captions, in the same call:
```bash
yt-dlp --write-auto-sub --skip-download --sub-lang en --convert-subs srt --write-info-json -o "%(title)s" "<url>"
```
Strip SRT numbering/timestamps if the user wants plain prose rather than a captions file.

Then read the sidecar `<title>.info.json` before you write anything up — it carries metadata the captions don't, and re-deriving it by hand is wasted work:
```bash
node -e 'const j=require("./<title>.info.json");
console.log("chapters:", (j.chapters||[]).length);
(j.chapters||[]).forEach(c=>console.log("  ", new Date(c.start_time*1000).toISOString().substr(14,5), c.title));
console.log("upload_date:", j.upload_date, "| duration:", j.duration_string, "| channel:", j.channel);
console.log("---\n" + (j.description||""));'
```
- **Chapters** are the uploader's own section breaks. When present, use them verbatim as headings — never invent your own. When `chapters: 0`, say so in the note's frontmatter (`has_youtube_chapters: false`) and derive headings from the transcript instead, so a later reader knows the structure is inferred.
- **Description** routinely names the host, guests, and an authored summary or "what you'll learn" list. Auto-captions garble proper nouns badly, so the description is the better source for names — prefer its spelling over anything the SRT gives you, and keep its summary as its own section rather than paraphrasing it.

Full video download (only if explicitly requested):
```bash
yt-dlp -o "%(title)s.%(ext)s" "<url>"
```

## 2. Document (PDF, DOCX, PPTX, XLSX, or a local file path)

```bash
node ~/.claude/skills/dori/convert-document.mjs "<path>" -o "<output>.md"
```

On-device only (`@firecrawl/pdf-inspector` for PDF, `@firecrawl/anydoc` for everything else) — no Python venv, no document content leaves the machine. A scanned/image PDF needs `PDFIUM_LIB_PATH`/`ORT_DYLIB_PATH` set (see dori-mini's `data/README.md`-equivalent setup notes); without them it throws rather than silently skipping OCR.

**A pasted URL/link is a different capture path, not a local file** — fetch and extract it via `https://markdown.new/<url>` (same service the rest of Dori uses for link capture). This also covers local `.html` files in practice, since HTML capture here is almost always "a link was pasted," not a saved `.html` file on disk; `anydoc` does not support HTML at all.

Don't assume a project-specific convention (e.g. `references/<deck>/` + frontmatter catalog) unless the current directory already has one — check for an existing `references/` dir or import script first.

**A receipt or invoice photo/PDF is different** — it's not converted to prose, it's read for a few fields and filed as a ledger row. Read the image yourself (you're multimodal) and pull out the date, vendor/description, and total amount — this mirrors `finance-attach-trip-receipt.ts`'s real vision-extraction step, just done by you instead of a model call inside the action. Then:
```bash
node ~/.claude/skills/dori/attach-receipt.mjs "<path-to-receipt-file>" --date <YYYY-MM-DD> --desc "<vendor/description>" --amount <n> --thread <threadId>
```
Omit `--thread` if you don't know which trip it belongs to — the script lists open trip ledgers as candidates and records a `ClarificationRecord` (domain `finance.trip_receipt`) instead of guessing; ask the user in the same turn, same discipline as branch 6 below. Starting a brand-new trip: add `--trip "<display name>"` (and `--account <slug>` if relevant) so the seeded ledger carries a real name, not just the thread id. A rebooked/corrected receipt for something already on the ledger: pass `--booking-ref <ref>` (an exact match against an earlier row's ref auto-supersedes it, non-destructively — the old row stays for provenance) or `--supersedes <id>` from that earlier call's own `id` field. The script is idempotent per file — reruns on the same receipt don't duplicate the row. After it appends, reindex the ledger file like any other vault write (see "Vault index" below).

## 3. Meeting transcript (pasted text or a transcript file, with intent to produce minutes)

If the transcript is ≥6000 characters (mirrors dori-engine's `COMPRESS_TRANSCRIPT_TOKEN_THRESHOLD = 1500` tokens, chars/4 estimate — `meeting-document.ts`), compress it first with a cheap model before extracting minutes with the main model — same two-tier split Dori's own engine uses (`fast` tier for compression, `reasoning` tier for extraction). Use the Agent tool with `model: "haiku"` and this exact system prompt (verbatim from `meeting-document.ts`, so behavior matches):

> Compress this raw meeting transcript into a compact structured agenda for a downstream summarizer. This is a lossy-but-lossless-for-facts pass: cut filler, repetition, and small talk, but you MUST preserve every speaker attribution, decision, numeric/date detail, and action item verbatim — the next stage extracts structured minutes from your output alone and cannot see the original transcript. Group by topic. Output plain text, no commentary, no code fences.

Then read `mom-prompt.md` in this skill's directory and follow it exactly to turn the (compressed or original, if under threshold) transcript into structured minutes. Only load `mom-prompt.md` for this branch.

## 4. Fathom sync (fetch new meetings on request)

When the user asks to pull/check/sync Fathom, or asks for minutes of a specific past meeting by name ("new meeting with Alex from Acme Corp") without pasting a transcript:

```bash
node ~/.claude/skills/dori/fetch-fathom.mjs list [--since <ISO date>]
```

This calls Fathom's own REST API directly (`https://api.fathom.ai/external/v1`, personal API key in `.env` in this directory — deliberately not routed through dori-engine's MCP/Universal Actions layer, which exists to gate engine-owned code, not a read-only personal script; see `AGENTS.md` for why) and returns only meetings **not yet filed** — it dedups against any vault `.md` whose frontmatter already has `fathom_recording_id: <id>`. Show the user the unfiled list (title, date, invitees) and ask which to process — never auto-file a batch without confirmation, since these are real, potentially sensitive calls.

For each meeting the user picks:
```bash
node ~/.claude/skills/dori/fetch-fathom.mjs get <recording_id> [--since <ISO date>]
```
Returns `{ title, recorded_at, invitees, url, transcript_text }`. Feed `transcript_text` into branch 3 (`mom-prompt.md`) exactly as if it had been pasted, using `invitees` for the Attendees section. When writing the minutes frontmatter, add `fathom_recording_id: "<recording_id>"` (quoted string) alongside the fields `mom-prompt.md` already specifies — this is what makes the next `list` dedup correctly.

If `FATHOM_API_KEY` isn't set (env var or `.env` in this directory), tell the user how to get one (Fathom → Settings → API Access) rather than guessing or asking them to paste it inline.

**Unattended filing.** The confirmation rule above is about *minutes* — the interpretive
step. Getting a transcript into the vault at all is not, so two scripts do it in bulk
without asking: `file-meetings-backlog.mjs` (one-off, `--dry-run` shows what it would
file) and `fathom-poll.mjs` (launchd, every two hours 9am–7pm; `setup.sh` offers to
install it). Both write raw transcripts under `meetings/` and nothing else — no LLM call,
no summary, nothing leaving the machine. A meeting worth real minutes still comes back
through branch 3.

## 5. Person research (enrich a new attendee/contact on request)

When the user asks to look up or research a person (typically a new meeting attendee with no `entities/people/*.md` file yet, or thin context):

```bash
node ~/.claude/skills/dori/research-person.mjs "Full Name" ["Company/org"] ["extra context"]
```

Calls Tavily's search API directly (`TAVILY_API_KEY` in this directory's `.env` — same key already used by `dori-portal`'s research feature, mirrors `dori-portal/lib/research-bundle.ts`'s `tavilySearch()` exactly: same endpoint, same request shape, same 0.3 relevance-score filter). Returns raw `{title, url, content}` results, deduped across a few name/company/LinkedIn queries — no summarization, no auto-filing.

**Always disambiguate before using results** — common names return unrelated people (verified: a search for a workplace-design architect returned mostly a same-named textiles professor). Confirm the right person with the user, then summarize/append findings into their `entities/people/<slug>.md` file yourself — this script only fetches, it doesn't write.

**This is not the same thing as recalling someone already in the vault.** "Who's Priya Menon from Acme, she just joined a meeting" → this branch (external web lookup, new person). "Tell me about Priya" or "what's the NDA status with Northwind" → vault recall (`query-vault.mjs search`/`last-meeting`, above) — the person already has a file and/or meeting history, you're retrieving what's already captured, not researching them.

**When the ask is "what do I bring into this conversation" rather than just "who is this"** — i.e. research plus your own prior context, not research alone:
```bash
node ~/.claude/skills/dori/research-and-recommend.mjs "Full Name" "Company" ["extra context"] [--project <slug>]
```
Same web research as above, placed next to what you already have: colleagues already in your vault at the same company (`org:` field on `entities/people/*.md`), an existing organization relationship if one's on file (`org-store.mjs`), and any vault docs already touching that company/project (`query-vault.mjs search`). Composes those three rather than duplicating any of them — no dedicated action for this exists in `dori-engine`/`dori-portal` to mirror (checked). Same identity-collision caveat applies, and the same rule: confirm before treating any of it as fact.

## Your own profile (self)

When the user wants to tell the tool about themselves — role, org, or which projects they're on — rather than about someone else:
```bash
node ~/.claude/skills/dori/self-store.mjs set "Your Name" [--role <title>] [--org <company>] [--projects a,b] [--linkedin <url>]
node ~/.claude/skills/dori/self-store.mjs get
```
Mirrors real Dori's `isSelf` flag exactly — your profile is a person file at `entities/people/<slug>.md`, same shape as anyone else's, just marked `is_self: true`. Not a separate file type: `route-meeting.mjs` now excludes whoever is marked `is_self` from attendee-vote matching automatically (mirrors `if (p.isSelf) continue` in the real router), so once this is set you don't need to pass `--self` by name on every call. At most one file carries the mark — `set` clears it off any other file first, same guard real Dori applies. `set` merges onto whatever's already on file, so a call that only passes `--linkedin` won't drop a role/org set earlier. `--linkedin` stores under `links.linkedin`, matching `EntityLinksSchema` in `packages/contracts/src/entities.ts` — the same field every other entity type uses for a LinkedIn URL.

## Brands (a brand someone is launching or works for)

When the user wants to track a brand — their own, or one they're building — distinct from the legal organization behind it (a company can have several brands; a person can be shaping one before any company exists):
```bash
node ~/.claude/skills/dori/brand-store.mjs set "Dori" [--owner <person-or-org-slug>] [--company <legal name>] [--primary <#hex>] [--accent <#hex>] [--font-display <name>] [--font-body <name>] [--logo <path-or-url>]
node ~/.claude/skills/dori/brand-store.mjs get "Dori"
node ~/.claude/skills/dori/brand-store.mjs context "Dori"
node ~/.claude/skills/dori/brand-store.mjs list
```
No vault entity for this exists in `dori-engine` to mirror (checked `entities.ts` — no `brand` type). The only real "brand" concept is `dori-portal`'s `BrandConfig` (`lib/brand.ts`) — pure document/slide theming (colors/fonts/logo), stored outside the vault, no guidelines or description. This borrows those exact field names for the theming half, stored instead at `entities/brands/<slug>.md` alongside everything else. `set` only ever touches the frontmatter block and merges onto whatever's already there — it never drops a field you set earlier just because this call didn't mention it, and never touches the body.

**The actual guidelines/positioning/voice belong in the file's body, not a flag** — same frontmatter-plus-prose shape as every other vault entity. Edit `entities/brands/<slug>.md` directly for that; `set` seeds a placeholder "## Guidelines" heading the first time, nothing more.

**Brand-aware text generation**: when the user asks to write copy, a prompt, or any other text "in brand" or "in the Dori voice", run `context` first and read it before writing, don't paraphrase the brand from memory. Real Dori's own "brand-aware" feature (`dori-portal`'s Marp/documents-render pipeline) injects `BrandConfig` as CSS theme tokens into a rendered HTML document — that renderer doesn't exist in this repo. Here, "brand-aware" means the brand's guidelines feed the agent's own writing directly, no rendering step.

## 5b. Organization / account (only on a structured affiliation assertion)

When a message ties a person to a company with an actual role or title — "Anita, CFO at Meridian", "Anita is the CFO at Meridian" — not a bare mention of a company name in passing:

```bash
node ~/.claude/skills/dori/org-store.mjs ensure "Meridian" --person "Anita Sharma" --evidence "Anita Sharma, CFO at Meridian" --role vendor --person-slug anita-sharma
node ~/.claude/skills/dori/org-store.mjs list
```

Mirrors `dori-engine`'s `accounts.ensure` action and the affiliation-evidence bar it's gated on (decision 0015) — the same four regex patterns real Dori uses to decide whether text actually asserts an affiliation, not just co-occurrence. **This is the whole point of the gate**: if `--evidence` doesn't clear the bar, `ensure` returns `affiliation_evidence_not_cleared` and writes nothing — every passing company name in a transcript must not spawn a record. `--role` is one of `client`/`vendor`/`partner`/`employer`/`none`. Skip `--evidence`/`--person` entirely with `--no-evidence` only when the input is already structured (e.g. a form field), not as a way around the bar.

Resolves to an existing org by name if one exists (case-insensitive) and appends the linked person instead of duplicating — stored at `entities/organizations/<slug>.md`, same one-file-per-entity shape as `entities/people/*.md`. This is a different "account" than `query-ledger.mjs`'s trip ledgers — that's money, this is a company entity.

**Duplicate person or org (two files for the same real-world entity — e.g. a name typo, or `ensure`'s exact-name match missed a variant)**: merge them, don't leave both on file.
```bash
node ~/.claude/skills/dori/entity-merge.mjs merge person <duplicate-slug> <canonical-slug>
node ~/.claude/skills/dori/entity-merge.mjs merge org <duplicate-slug> <canonical-slug>
```
Mirrors `entities.merge`/`SqliteEntityStore.merge` (decision 0022: hard-to-reverse identity merge) for this vault's one-file-per-entity shape: the losing entity's display name is added to the survivor's `aliases`, an org merge unions both `people` lists, and every known cross-reference is rewritten vault-wide (`org-store.mjs`'s `people:` arrays, `brand-store.mjs`'s `owner:` field — the only two places a person/org slug is referenced anywhere in this vault). The losing file is never deleted — it's moved to `entities/<type>/merged/<slug>.md` with a `redirectTo:` field added, so nothing is lost and it simply stops appearing in any listing (every existing loader does a plain, non-recursive `readdir` of the parent directory). Pick the canonical slug carefully — this can't be undone by re-running it the other way, since the source is no longer where callers expect it.

## 6. Expense/bill message (mentions spending money, no document attached)

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

## Decisions (any captured note, not just meeting minutes)

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

## 7. Credentials (store or look up a key, password, ID, token, etc.)

Local encrypted key/value store — `credentials-store.mjs`, `import-credentials.mjs`, `credentials-lib.mjs` (this directory). AES-256-GCM (`node:crypto`), key held in the macOS Keychain (service `dori-credentials-store`), rows in plain `node:sqlite` at `~/.dori/credentials.sqlite`. Schema is `(service, field)` → secret (encrypted) or plaintext.

**Lookup** ("what is my X", "get me the Y key"):
```bash
node ~/.claude/skills/dori/credentials-store.mjs find "<text>"          # search slug + label + aliases when you don't know the exact service
node ~/.claude/skills/dori/credentials-store.mjs list                   # one line per service (label + field count), never shows secret values
node ~/.claude/skills/dori/credentials-store.mjs list <service>         # full field list for one service
node ~/.claude/skills/dori/credentials-store.mjs get <service>          # field is optional — with one secret field it resolves itself; several, it lists them and you pick
node ~/.claude/skills/dori/credentials-store.mjs get <service> <field>  # secret: copies to clipboard, prints only a confirmation + last 4 chars. Plaintext field: prints directly.
```
Users know a credential by its name, never by its field — "what's the OpenAI key" is the shape to expect. So `find "<text>"` → `get <service>` is the normal two-step, and you should not ask which field they mean unless `get` itself reports several. Field names vary by entry (`value`, `vps_root_password`, ...) and are an implementation detail.

`find` scores entries by how many query words hit the slug, label, or aliases, and prints only the best-scoring tier — so "the web search key" lands on the entry tagged `search` rather than every entry containing "key". A product name often doesn't contain the word someone searches by ("Serper API key" vs. "search"), so when a `find` misses and you locate the entry another way, offer to tag it:
```bash
node ~/.claude/skills/dori/credentials-store.mjs set <service> aliases "search, web" --plain
```
Aliases are deliberately plaintext — they're search terms, not secrets — and don't affect `get`'s single-secret resolution.

Never pass `--reveal` on `get` unless the user explicitly asks to see the plaintext — that's the one thing that puts a secret in your own output/transcript. Everything else in this store is designed so you never see the value.

**Storing a new value** — on "add a secret/credential/key" (or similar), default to spinning up the local browser form yourself, no need to ask which method first:
```bash
node ~/.claude/skills/dori/add-credential-server.mjs   # prints http://127.0.0.1:<port>/<random-token>
open "<that URL>"                                       # macOS: launches it in the user's REAL browser
```
It's a server bound to `127.0.0.1` only, behind a one-time random token so nothing else on the machine can guess the URL. Always `open` the URL rather than navigating your own Browser pane to it — `open` hands it to Safari/Chrome, a surface you have no tool to inspect; your Browser pane is a surface you could read back, which defeats the point. The form POSTs straight to that local process; the value never touches your own output, only a confirmation with length + last 4 is logged. Tell the user in chat that a tab just opened for them to fill in. The server exits after one save, or after a 10-minute idle timeout.

Other ways to store a value, for when the user asks for them specifically:
- Terminal wizard, no browser: `node ~/.claude/skills/dori/add-credential.mjs` — plain prompts (name, field, secret?, value), typed straight into that process. Tell the user to open Terminal (Cmd+Space, type "Terminal") and paste that line in.
- Clipboard, for a fast one-off: user copies the value (Cmd+C, not into chat), then you run `node ~/.claude/skills/dori/credentials-store.mjs set-from-clipboard <service> <field> [--plain]` — reads `pbpaste` directly, never becomes a tool argument.
- Manual `set`, if the user wants to type the whole command themselves in their own terminal: `node ~/.claude/skills/dori/credentials-store.mjs set <service> <field> "<value>" [--plain]` — only safe when *they* type it, not you (a value passed as your own tool argument means you saw it).

`--plain` only for genuinely non-secret fields (an account ID, a label) where plaintext-in-sqlite is fine — those are low-risk enough to just type in chat.

**Bulk import** from a markdown file the user maintains themselves (`# Name` headers, body is either free text or `KEY=value` lines — see file for exact parsing rules): run `import-credentials.mjs [file] [--delete-after]` with no path to use the default inbox at `~/proto-space/dori/scratch/credentials-inbox.md`. This script's stdout is header/field *names* only, never values — safe to run directly. Idempotent (upsert on `service`+`field`) — rerunning after edits updates changed values, adds new ones; it never deletes entries for removed/renamed headers, clean those up manually with `delete`.

**Using a stored secret inside a script you write** (e.g. calling an API that needs a key): import `getSecret` from `credentials-lib.mjs` and call it in-process — the value never needs to pass through your own output at all:
```js
import { getSecret } from '<path-to>/credentials-lib.mjs';
const key = getSecret('tavily-api-key', 'value');
// use key directly in the fetch/header — don't console.log it
```

Portable beyond this agent: plain Node stdlib + macOS `security`/`pbcopy`, no Claude-specific dependency — works from any tool that can run `node` as the same macOS user.

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

## Ambiguous input

If it's unclear whether pasted text is a transcript meant for minutes vs. just text to convert/save as-is, ask in one short question rather than guessing.

## Destination

`dori-vault` is the default destination — do not ask "where should this go" as a first move. Read `dori-vault-conventions.md` in this skill's directory (covers the two-project-tree split and a known data-quality issue), then:

- **Branches 1 & 2 (YouTube/document, not meeting-routed):** run
  ```bash
  node ~/.claude/skills/dori/route-destination.mjs <youtube|url|document|text> [projectPath]
  ```
  and save there directly — no question needed. This mirrors Dori's own `canonicalOutputPath`: YouTube goes to `yt/` (or `yt/<project>/`), other reference-worthy kinds go to `references/clippings/`, an explicit project goes to `projects/<path>/`, otherwise `inbox/` (Dori's real default — it never guesses a project for a bare capture, so neither should this).
- **Branch 3 (meeting minutes):** run
  ```bash
  node ~/.claude/skills/dori/route-meeting.mjs "Attendee One,Attendee Two" "" "<stable meeting key, e.g. its title>"
  ```
  and act on `action` exactly as `dori-vault-conventions.md` describes: `moved` → auto-file, no question; `suggested` → tell the user the candidate and confirm; `conflict`/`none` → a `ClarificationRecord` is written automatically (durable, survives across sessions — see below), but still ask the user in the same turn rather than leaving it silently pending.
- Only fall back to asking outright when the user's request itself is ambiguous about destination in a way neither script resolves (e.g. they name a project that doesn't exist in either tree).

## Vault index (search cache)

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

## Tasks

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

When the user asks to prep for a meeting ("what should I know before the call with Anita and Sam", "prep me for the Meridian sync"):
```bash
node ~/.claude/skills/dori/meeting-prep.mjs "Attendee One,Attendee Two" [--project <slug>]
```
Mirrors `dori-engine`'s `meeting.generate_brief` action minus the LLM step — it assembles the same three lookups (prior meetings relevant to these attendees, pending tasks scoped to the project/attendees, which attendees are already known) and prints a brief directly, no model call. Same cross-project isolation the real action enforces: no `--project` means no prior meetings are cited at all (fail closed, never guess which project a meeting belongs to) and tasks fall back to attendee-owned only, never the whole vault.

## Notifications and WhatsApp channel

Local delivery primitives, not capture types — nothing here does any AI reasoning
itself, since these run unattended (cron/launchd), not inside a chat session:

- `notify-desktop.mjs "<message>" ["title"]` — macOS notification (`osascript`, no
  dependency, no config).
- `send-whatsapp.mjs "<message>"` — outbound self-chat message via Baileys (paired once
  by QR scan; use a **dedicated secondary number**, not the user's primary one).
- `listen-whatsapp.mjs` — long-lived inbound listener (same Baileys session). Files
  whatever arrives — link, text, or media — through `route-destination.mjs`'s normal
  rules, same as a pasted link or dropped file. No AI, no summarizing; ambiguous/no-
  project captures land in `inbox/` like everything else. Meant to run continuously via
  `whatsapp-listener.plist.template` (launchd), not invoked on demand.
- `digest.mjs [morning|evening] [--whatsapp]` — gathers open tasks + inbox into a static
  HTML page (opened directly, no localhost server needed), pings a desktop notification,
  and optionally relays a one-line summary over WhatsApp. Scheduled via
  `digest-schedule.plist.template` (launchd `StartCalendarInterval`) — to change the
  time, edit the installed plist's Hour/Minute and reload it.
- `watch-inbox.mjs watch` — long-lived poll loop over a real dropbox folder (Downloads,
  a scanner's save folder — never the vault itself, that's rejected outright). Mirrors
  `watcher/index.ts` + `pending-batch-store.ts`'s detection/triage half only: a file
  isn't treated as arrived until it stops changing for 3s (same `stableMs` default real
  Dori uses), and a same-name file reappearing at a verified-gone path is recognized as
  a move rather than filed as a duplicate — not a content hash, an identity-proxy match
  on filename+size+mtime, exactly like the real mechanism. It never files anything
  itself; that's still `route-destination.mjs`/`attach-receipt.mjs`'s job. Scheduled via
  `watch-inbox.plist.template` (launchd), `DORI_WATCH_DIR` sets which folder.

"Dori, anything new in my inbox folder?":
```bash
node ~/.claude/skills/dori/watch-inbox.mjs list [--status detected|approved|ignored]
```
Read what a `detected` item's `suggestedDestination` says, tell the user what you'd do with it, then route it through the normal branch for that file type (document/receipt/expense above) — `approve`/`ignore` just mark it reviewed, they don't move or file anything:
```bash
node ~/.claude/skills/dori/watch-inbox.mjs approve <id>
node ~/.claude/skills/dori/watch-inbox.mjs ignore <id>
```

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

## Mini-site (browse projects/, yt/, and structured records locally)

```bash
node ~/.claude/skills/dori/build-site.mjs
node ~/.claude/skills/dori/serve-site.mjs
```
Then open `http://localhost:8420/`. Serve it — do not open `_site/index.html` via `file://`: YouTube's embed player validates the page's origin/referrer on every load, and `file://` sends neither, which YouTube rejects with "Error 153: Video player configuration error" regardless of query params. Any http(s) origin, including localhost, satisfies the check.

`build-site.mjs` also builds a **Data** section (`build-tables.mjs`, called automatically — no separate command) — read-only HTML tables over people, orgs, brands, tasks, and trip ledgers, at `_site/data/`. Same rule as the rest of the mini-site: nothing here writes back, every row reads straight from the same files the CLI scripts already use. Visual patterns (plain text-first tables, an outlined status pill rather than color-coded, "Waiting on X" as subtext, an invitational empty state instead of "No X found") are borrowed from dori-portal's own real UI (`accounts-table.tsx`, `tasks-workspace.tsx`, `finance-ledger.tsx`, `empty-state.tsx`), not invented.

## Inbox and clarifications

A minimal mirror of Dori's `buildInboxProjection` — only the two sources that translate to a synchronous, per-invocation skill (no job queue, no filesystem watcher): files sitting in vault `inbox/`, and pending `ClarificationRecord`s (mirrors `dori-engine/src/clarification/store.ts` exactly, content-addressed dedup included). Check it proactively — not just when the user asks:
```bash
node ~/.claude/skills/dori/list-inbox.mjs
```
Records are created automatically by `route-meeting.mjs` and `expense-router.mjs` on `conflict`/`none`. To resolve one after the user answers:
```bash
node ~/.claude/skills/dori/clarification-store.mjs resolve <id> --choice <candidateId>
node ~/.claude/skills/dori/clarification-store.mjs dismiss <id>
```
That covers clarifications — the OTHER inbox source (`inbox_file` items, bare captures with no project) has its own resolve command, `resolve-inbox.mjs`. Once the user says where a filed item goes (or that it should be dropped):
```bash
node ~/.claude/skills/dori/resolve-inbox.mjs move <inbox-filename> <projectPath>
node ~/.claude/skills/dori/resolve-inbox.mjs archive <inbox-filename>
```
`move` relocates the file into `projects/<projectPath>/` — and if it has a `media:` sidecar (e.g. a WhatsApp photo capture), moves that too and rewrites the reference. `archive` moves it to `inbox/.archive/` (reversible, not deleted) rather than removing it outright.
