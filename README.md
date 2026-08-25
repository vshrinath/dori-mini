# Dori Mini

[![GitHub](https://img.shields.io/badge/github-vshrinath%2Fdori--mini-1a1f4e)](https://github.com/vshrinath/dori-mini)

A local, portable mirror of [Dori](https://github.com/) engine's real capture-routing,
meeting-routing, search, and inbox logic — implemented as plain Node.js scripts, so any
agent with shell access (Claude Code, Codex CLI, Grok Build, or a plain terminal) can use
it identically. No Dori server required.

Every script mirrors specific Dori engine source — not a simplified guess at what Dori
does. See the comment at the top of each `.mjs` file for exactly what it mirrors.

## What it does

- **`route-destination.mjs` / `route-meeting.mjs`** — decide where a capture or meeting
  file belongs, using the same folder conventions and attendee-vote logic as Dori's real
  `canonicalOutputPath` and `meeting-router.ts` (including its deliberate rule: never
  auto-pick an ambiguous destination).
- **`reindex-vault.mjs`** — full-text search cache (SQLite FTS5), schema-matched to
  Dori's own `vault_documents` table.
- **`semantic-index.mjs`** — local embeddings (no API key, runs via Transformers.js) +
  hybrid vector/FTS search with the same RRF fusion Dori's vector store uses.
- **`apply-template.mjs`** — additive-only project folder scaffolding, mirroring
  `projects.apply_template`.
- **`clarification-store.mjs` / `list-inbox.mjs` / `resolve-inbox.mjs`** — durable
  pending-decision records, a minimal inbox view, and a resolve command (move a filed
  item into a project, or archive it) for the parts of Dori's routing that need a human
  to decide.
- **`query-vault.mjs`** — recall queries (last meeting with X, recent decisions, info
  already captured about a person or org) against the FTS index without dumping full
  document bodies by default.
- **`list-tasks.mjs`** — reads dori-engine's real task store directly (open/pending
  tasks), separate from the inbox below.
- **`query-ledger.mjs` / `expense-router.mjs` / `check-reimbursement-gaps.mjs`** — a
  personal expense-tracking flow: route a plain-text expense message to a trip ledger,
  read totals/outstanding rows back, and check a claim for missing dates/amounts/receipts
  before you mark it submitted — mirroring Dori's `trip-ledger.ts` and consolidate-package
  gap logic.
- **`fetch-fathom.mjs`** — pulls unfiled meetings straight from the Fathom API (needs
  your own `FATHOM_API_KEY`) and feeds them into the same meeting-routing/minutes flow as
  a pasted transcript.
- **`research-person.mjs`** — looks up a new meeting attendee via Tavily search (needs
  your own `TAVILY_API_KEY`) — fetches only, doesn't auto-file.
- **`build-site.mjs` / `serve-site.mjs`** — a minimal local mini-site to browse your
  `projects/`/`yt/` vault content in a browser.
- **`notify-desktop.mjs`** — macOS desktop notification (`osascript`, no dependency).
- **`send-whatsapp.mjs` / `listen-whatsapp.mjs`** — a self-chat WhatsApp channel (via
  Baileys, on a dedicated secondary number). Outbound sends a message; the listener
  files inbound links/text/media through the same routing everything else uses — no AI
  step, since it runs unattended.
- **`digest.mjs`** — a morning/evening summary (open tasks + inbox) as a static HTML
  page, plus a desktop notification and an optional WhatsApp relay. Scheduled with
  launchd, not a real engine feature (that needs a live scheduler + AI call) — this is
  the mechanical version.

**Not included**: a local encrypted credentials/secrets store this repo's author also
built for themself — deliberately left out here since it's macOS-only (Keychain-backed)
and not something to hand out even in sanitized form.

## Read this first

[`docs/getting-started.html`](docs/getting-started.html) — `setup.sh` opens it in your
browser automatically once it's done. It explains what the install actually did, what
your vault looks like before and after real use, and seven things to try first.
[`docs/guide.html`](docs/guide.html) covers every capture type in depth, plus how it
stays cheap and fast to run. [`docs/cost.html`](docs/cost.html) is the deeper technical
breakdown of exactly where — and where not — it spends model tokens.

## Setup

Requires Node.js 24+ (uses the built-in `node:sqlite` module).

```bash
git clone https://github.com/vshrinath/dori-mini dori
cd dori
./setup.sh
```

`setup.sh` will:
1. Check your Node version.
2. Run `npm install` (pulls in local embedding model support — a few hundred MB, one-time).
3. Check for `yt-dlp` and `markitdown`, and offer to install them (via `brew` or `pip3`)
   if you want YouTube/document capture. Everything else works without them.
4. Ask for your Dori vault path — or create an empty one if you don't have one yet.
5. Wire itself into whichever of Claude Code / Codex CLI / Grok Build you have installed,
   so those tools discover it automatically instead of you having to invoke it by hand.

## Usage

Source the generated config once per shell (or add it to your shell profile):

```bash
source ~/.dori-env
```

Then either invoke scripts directly:

```bash
node route-destination.mjs youtube
node route-meeting.mjs "Attendee One,Attendee Two" "" "meeting-title-as-key"
node list-inbox.mjs
```

...or just use the agent tool you already have installed — if `setup.sh` wired it in,
it'll discover and use this on its own for YouTube links, documents, meeting transcripts,
and vault search. See `AGENTS.md` for the exact routing rules an agent follows.

## Design notes

- Every local cache/store this creates (`~/.dori/vault-index.sqlite`,
  `~/.dori/vault-vectors.db`, `~/.dori/clarifications/`) lives outside the vault itself
  and outside this repo — disposable, rebuildable, never the source of truth. Your vault's
  Markdown files stay canonical, exactly like real Dori.
- Nothing here writes to a live Dori engine's own internal state
  (`.dori/engine.db`, `store/*.json` if you have Dori itself installed) — only to your
  vault's Markdown, which Dori itself would also read.
- See `dori-vault-conventions.md` for the folder/frontmatter conventions this mirrors,
  and why two project-tree shapes exist in a Dori vault.
