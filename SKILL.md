---
name: dori
description: Work with the Dori vault (~/proto-space/dori/dori-vault). Use ONLY when the message starts with "Dori", or the session is in the vault or dori-mini folder; anywhere else a pasted link, file or transcript belongs to the current project. Covers capture (YouTube, documents, meeting transcripts, receipts and expenses, Fathom pulls), vault recall ("what did I decide", "last meeting with X") and stored credentials.
---

# Dori

Capture into and recall from the Dori vault. Do the work with the `dori-mini` MCP tools; the scripts under `~/.claude/skills/dori/` (a link to `~/proto-space/dori-mini`) are the fallback. Read the reference file for a job before doing it the first time in a session.

The MCP tools come first even where a reference file shows a script command: the scripts are a fallback, for use only when the MCP server is down or has no tool for the job. When you fall back, say so in one line. To index a new file, write it, then call `save_document` with the same content; that reindexes it. (MCP-first trial started 2026-10-23. If it holds up, the duplicate scripts get deleted.)

## When to act: only on "Dori"

Most sessions are project work, not capture, so this skill never acts on its own outside the vault:

- **Anywhere else:** act only when the message starts with "Dori" (case-insensitive, optional comma; strip it, then match normally). A pasted YouTube URL, document, receipt or transcript without the prefix belongs to the current project. Leave it alone and don't offer to capture it.
- **In the vault or dori-mini** (the session's working directory is `~/proto-space/dori/dori-vault` or `~/proto-space/dori-mini`): structural captures (a pasted YouTube URL, an attached document or receipt image, a raw meeting transcript) may run without the prefix. Conversational asks (recall, tasks, free-text expenses, new projects or trips, person research) still need "Dori".

## Which tool for which job

| Job | MCP tools | Read first |
| --- | --- | --- |
| YouTube link | `capture_url` | `references/capture.md` §1 |
| Document (PDF, DOCX, PPTX, XLSX, HTML) | `convert_document`, `save_document`, `capture_file` | `references/capture.md` §2 |
| Meeting transcript → minutes | `process_meeting`, `file_meeting`, `route_meeting` | `references/capture.md` §3, and `mom-prompt.md` |
| Pull new Fathom meetings | `list_fathom_meetings`, `get_fathom_meeting` | `references/capture.md` §4 |
| Where a capture goes | `route_destination`, `route_meeting` | `references/capture.md` (Destination) |
| Inbox and pending clarifications | `list_inbox`, `approve_inbox_item`, `ignore_inbox_item` | `references/capture.md` (Inbox) |
| Plain note | `capture_text` | — |
| Recall, "what did I decide", "last meeting with X" | `search_vault`, `timeline`, `list_decisions`, `get_document` | `references/recall.md` (multi-fact recall: issue several queries, never one) |
| Decisions and tasks | `create_decision`, `list_decisions`, `add_task`, `list_tasks`, `mark_task_done` | `references/recall.md` |
| Meeting prep | `meeting_prep`, `get_meeting_prep` | `references/recall.md` |
| Projects | `list_projects`, `get_project_details`, `apply_template` | — |
| People, orgs, brands, your profile | `research_person`, `research_and_recommend`, `list_people`, `ensure_org`, `list_orgs`, `merge_entity`, `get_brand`, `set_brand`, `get_profile`, `set_profile` | `references/people-orgs.md` |
| Expense, receipt, trip ledger, reimbursement | `route_expense`, `attach_receipt`, `list_trip_ledgers`, `get_trip_ledger`, `check_reimbursement_gaps`, `close_trip` | `references/money.md` |
| Credentials (keys, passwords, account IDs) | `find_credentials`, `list_credentials`, `start_credential_server`; a secret's value only via `node ~/.claude/skills/dori/credentials-store.mjs get <service> [field]`, which copies it to the clipboard | `references/credentials.md` (never print a secret) |
| Notifications, WhatsApp, local mini-site | `chat_send` | `references/channels.md` |

When unsure whether pasted text is a transcript for minutes or text to save as is, ask one short question.

## Vault conventions

- The vault is `~/proto-space/dori/dori-vault`, and it is the default destination; don't open with "where should this go".
- Before filing anything, read `dori-vault-conventions.md` in this folder. It covers the two project trees, the trip-ledger shape and a known data-quality issue.
- Captures with no named project go to `inbox/`; never guess a project. YouTube goes to `yt/`, reference material to `references/clippings/`.
- After writing a file into the vault, reindex it (`references/recall.md`, Vault index).
