# Capture: YouTube, documents, meeting transcripts, Fathom, filing

Script paths below are `~/.claude/skills/dori/...`, a link to this repo. Prefer the matching `dori-mini` MCP tool when one exists.

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
node ~/.claude/skills/dori/attach-receipt.mjs "<path-to-receipt-file>" --date <YYYY-MM-DD> --desc "<vendor/description>" [--amount <n>] --thread <threadId>
```
Omit `--thread` if you don't know which trip it belongs to — the script lists open trip ledgers as candidates and records a `ClarificationRecord` (domain `finance.trip_receipt`) instead of guessing; ask the user in the same turn, same discipline as branch 6 below. Starting a brand-new trip: add `--trip "<display name>"` (and `--account <slug>` if relevant) so the seeded ledger carries a real name, not just the thread id. A rebooked/corrected receipt for something already on the ledger: pass `--booking-ref <ref>` (an exact match against an earlier row's ref auto-supersedes it, non-destructively — the old row stays for provenance) or `--supersedes <id>` from that earlier call's own `id` field. The script is idempotent per file — reruns on the same receipt don't duplicate the row. After it appends, reindex the ledger file like any other vault write (see "Vault index" below).

**Same script also files travel tickets, itineraries, and hotel bookings** — not just expense receipts. `--amount` is optional (a ticket usually has no OCR'd total, mirrors real Dori's own fallback to `''`). When the file is a type `convert-document.mjs` actually parses (pdf/docx/pptx/xlsx/odt/rtf/epub/csv), it's also converted to a markdown sidecar stamped with `threadId:` frontmatter and filed alongside the ledger (`withThreadIdFrontmatter`, mirrors `finance-attach-trip-receipt.ts`) — that's what makes the ticket itself, not just its ledger row, answerable from a trip-scoped `query-vault.mjs search` (see below). A plain receipt photo (jpg/png/heic) has no text to convert and stays a raw copy only, as before.

## 3. Meeting transcript (pasted text or a transcript file, with intent to produce minutes)

Write the minutes from the full transcript. Compress first only if it is ≥160,000 characters (a 2-3 hour meeting; `COMPRESS_TRANSCRIPT_TOKEN_THRESHOLD = 40000` in `process-meeting-minutes.mjs`). Compressing every transcript over 6,000 characters, as Dori's engine does, made the minutes thin: the summarizer never saw the examples, reasoning and back-and-forth. For a transcript that long, use the Agent tool with `model: "haiku"` and this exact system prompt:

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
