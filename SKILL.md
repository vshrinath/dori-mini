---
name: dori
description: Work with the Dori vault through the `dori` CLI (~/proto-space/dori/dori-vault is its git-synced copy). Use ONLY when the message starts with "Dori", or the session is in the vault or dori-mini folder; anywhere else a pasted link, file or transcript belongs to the current project. Covers capture (YouTube, documents, meeting transcripts, receipts and expenses, Fathom pulls), vault recall ("what did I decide", "last meeting with X"), people research and stored credentials.
---

# Dori

Capture into and recall from the Dori vault. Do the work with the `dori` CLI (`~/.local/bin/dori`, signed in to hosted `start.mydori.app` or the local desktop engine; `dori auth status` shows which). The `dori-mini` MCP tools and the scripts under `~/.claude/skills/dori/` are the fallback, only for the jobs the table marks with a gap number, or when the CLI is down or not signed in (exit 3). When you fall back, say so in one line, with the gap number.

Gap numbers are rows of §7 in dori-new `docs/dori-mini-parity.md`; each closes in the §8 step shown: gap 1 → step 3, gap 3 → step 2, gap 4 → step 5, gap 5 → step 4, gap 6 → step 6, gap 7 and 9 → step 7, gap 8 → step 8, gap 10 → step 9, gap 11 → step 10. "Unranked" means the parity map grades it partial or missing without a §7 row.

## When to act: only on "Dori"

Most sessions are project work, not capture, so this skill never acts on its own outside the vault:

- **Anywhere else:** act only when the message starts with "Dori" (case-insensitive, optional comma; strip it, then match normally). A pasted YouTube URL, document, receipt or transcript without the prefix belongs to the current project. Leave it alone and don't offer to capture it.
- **In the vault or dori-mini** (the session's working directory is `~/proto-space/dori/dori-vault` or `~/proto-space/dori-mini`): structural captures (a pasted YouTube URL, an attached document or receipt image, a raw meeting transcript) may run without the prefix. Conversational asks (recall, tasks, free-text expenses, new projects or trips, person research) still need "Dori".

## Which command for which job

Add `--json` to any read you'll parse. Reads are safe to run unasked. Every write files into the shared vault, so write only when the user asks.

| Job | `dori` CLI | dori-mini fallback (gap) | Read first |
| --- | --- | --- | --- |
| Plain note | `dori capture "<text>"` (or `@file`, or piped stdin) | — | — |
| YouTube or web link | `dori capture --link <url> [--title <t>] [--wait]`; Dori fetches and files it | — | `references/capture.md` §1 (local `yt-dlp` when the user wants the transcript here, not filed) |
| Document (PDF, DOCX, PPTX, XLSX), image, audio, receipt photo | `dori capture --file <path> [--wait]` (up to 18 MB; Dori converts and routes it) | Convert-only preview, no filing: `convert_document`. Raw copy at a chosen path: `capture_file` (gap 5) | `references/capture.md` §2 |
| Where would a capture go (dry run) | None usable: `dori call classifyIntake` answers 401 to a CLI sign-in. `dori capture` routes on its own | `route_destination` (unranked) | `references/capture.md` (Destination) |
| Meeting transcript → minutes | `dori capture @<transcript file>` (or piped); the minutes land as an artifact: `dori artifacts list --limit 10`, then `dori artifacts get <id>` | Into a chosen project, or redo minutes for a vault file: `route_meeting`, `file_meeting`, `process_meeting` (gap 3) | `references/capture.md` §3 |
| Recent Fathom meetings | `dori call fathomMeetings '{"limit":10}'`: only the 10 newest, no `since`, no filed flag, dates at midnight UTC | Older, since a date, or "which aren't filed": `list_fathom_meetings` (gap 3) | `references/capture.md` §4 |
| One Fathom meeting | `dori call fathomMeeting '{"recordingId":"<id>"}'` (summary + transcript) | — | `references/capture.md` §4 |
| File a Fathom meeting | Whole sync into `meetings/`: `dori call fileFathomMeetings` | One recording into a chosen project: `file_meeting` (gap 3) | `references/capture.md` §4 |
| Inbox and approvals | Approvals waiting on a Run: `dori call pendingApprovals`; the user approves (`dori respond <runId> approve` in their own terminal, or Dori's Inbox), never you. Suggested to-dos: `dori tasks list --suggested` | Clarifications and watched-folder items: `list_inbox`, `approve_inbox_item`, `ignore_inbox_item`. `dori call inbox` answers 401 to a CLI sign-in (gap 7) | `references/capture.md` (Inbox) |
| Search, "what did I decide", "last meeting with X" | `dori search "<query>" [--limit N]`, then `dori vault read <path>` (vault file) or `dori artifacts get <id>` (minutes, briefs) for the hits that matter | Dated view: `timeline` (gap 8). Connection graph ("who else is connected to X"): `query-vault.mjs related` (no CLI equivalent; not in the parity map) | `references/recall.md` (multi-fact recall: issue several queries, never one) |
| Decisions | `dori facts [<entity id>]` reads current facts; `dori facts add "<text>" --project <p>` keeps a decision under a project | Decision records with status: `list_decisions`, `create_decision` (gap 8) | `references/recall.md` |
| Tasks | `dori tasks list [--status open\|done\|all] [--project <p>]`, `dori tasks get <id>`, `dori tasks add "<title>" [--due YYYY-MM-DD] [--project <p>]`, `dori tasks done <id>` | Tick a `file.md:line` checklist item: `mark_task_done` (unranked) | `references/recall.md` (Tasks) |
| Meeting prep | `dori run meeting.generate_brief '{"title":"…","date":"YYYY-MM-DD","attendees":["…"],"project":"…"}'` writes a brief under `meetings/prep-….md` (edit it with `dori brief edit`). For calendar meetings, use the `prep` skill | — | `references/recall.md` (Meeting prep) |
| Projects | `dori projects list`, `dori projects get <id\|name>` | Linked files and people: `get_project_details`; scaffold from a template: `apply_template`; accounts list: `list_accounts` (gap 6) | — |
| People and organisations | `dori people list [--type person\|organization\|all]`, `dori people get <id>`, `dori facts <id>`, `dori people profile <id>` | — | `references/people-orgs.md` |
| Person research ("who's X from Y", "what do I bring to this") | The `prep` skill's recipe: agent WebSearch, `dori people get`, `dori facts`, `dori search`; save with `dori people add/update`, `dori people link`, `dori people profile <id> @file` | — | `references/people-orgs.md` §5 |
| Org from an affiliation ("Anita, CFO at Meridian") | `dori run accounts.ensure '{"orgName":"…","personId":"…","personName":"…","evidenceText":"Anita Sharma, CFO at Meridian"}'` | — | `references/people-orgs.md` §5b |
| Duplicate person or org | `dori run entities.merge '{"sourceId":"…","targetId":"…"}'` (waits for the user's approval) | — | `references/people-orgs.md` §5b |
| Your profile ("me") | The person with `isSelf: true` in `dori people list --json`; change it with `dori call updateEntity` | `get_profile`, `set_profile` (gap 9) | `references/people-orgs.md` |
| Brands | — | `list_brands`, `get_brand`, `get_brand_context`, `set_brand` (gap 11) | `references/people-orgs.md` |
| Expense, receipt, trip ledger, reimbursement | A receipt file: `dori capture --file <receipt>` (Dori routes it) | Everything else: `route_expense`, `attach_receipt` for "this receipt on this trip", `list_trip_ledgers`, `get_trip_ledger`, `check_reimbursement_gaps`, `close_trip` (gap 10) | `references/money.md` |
| Save edited content at a vault path, list documents | A person's profile: `dori people profile <id> @file`; a meeting brief: `dori brief edit <path> @file` | Any other path: `save_document`; list: `list_documents` (gap 5) | `references/recall.md` (Vault index) |
| Credentials (keys, passwords, account IDs) | — (secrets stay on this machine) | `node ~/.claude/skills/dori/credentials-store.mjs find\|list\|get`, `add-credential-server.mjs`; MCP `find_credentials`, `list_credentials`, `start_credential_server` (gap 4) | `references/credentials.md` (never print a secret) |
| Chat with Dori | `dori call sendMessage '{"text":"…"}'` | — | — |
| Notifications, WhatsApp, local mini-site | — (WhatsApp moved to mailroom) | the scripts in `references/channels.md` | `references/channels.md` |

When unsure whether pasted text is a transcript for minutes or text to save as is, ask one short question.

## Speed

Measured 13 Nov 2026 against hosted: `dori search` took 6–15 s (dori-mini: 1–3 s); every other read took 0.4–1.7 s. Search speed is gap 1. Until step 3 lands, run two well-chosen searches rather than many.

## Vault conventions

- The vault lives in Dori; `~/proto-space/dori/dori-vault` is its git-synced copy on disk. CLI writes land in Dori and reach the disk copy on the next sync. Don't open with "where should this go": `dori capture` routes on its own.
- Before a fallback write to disk, read `dori-vault-conventions.md` in this folder. It covers the two project trees, the trip-ledger shape and a known data-quality issue.
- Captures with no named project go to the inbox; never guess a project. YouTube goes to `yt/`, reference material to `references/clippings/`.
- The engine indexes its own writes. Only after a fallback write to disk, reindex the file (`references/recall.md`, Vault index); `dori search` won't see it until the disk copy syncs back.
