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
  hybrid vector/FTS search with the same RRF fusion Dori's vector store uses. A full
  reindex also prunes rows for files no longer on disk, mirroring dori-engine's
  `reconcileSearchIndex()`.
- **`sync-vault.mjs`** — `git pull` on the vault repo, then a full reindex of both the
  FTS and semantic caches — mirrors dori-engine's git-sync-triggered reconcile, for when
  someone else's push deletes or edits files your local index doesn't know about yet.
- **`apply-template.mjs`** — additive-only project folder scaffolding, mirroring
  `projects.apply_template`.
- **`self-store.mjs`** — your own profile (name, role, org, projects), stored as a person
  file exactly like anyone else's, just marked `is_self: true` — mirrors real Dori's
  `isSelf` flag. `route-meeting.mjs` excludes whoever is marked this way from attendee-vote
  matching automatically.
- **`brand-store.mjs`** — a brand someone is launching or works for, distinct from the
  legal organization (`org-store.mjs`) behind it — theming fields (colors/fonts/logo,
  borrowed from `dori-portal`'s real `BrandConfig`) in frontmatter, guidelines/positioning
  as free-text body, same shape as every other vault entity. `context` prints the whole
  thing as one block for an agent to read before writing brand-aware copy — no rendering
  pipeline, the brand just feeds the agent's own writing.
- **`clarification-store.mjs` / `list-inbox.mjs` / `resolve-inbox.mjs`** — durable
  pending-decision records, a minimal inbox view, and a resolve command (move a filed
  item into a project, or archive it) for the parts of Dori's routing that need a human
  to decide.
- **`query-vault.mjs`** — recall queries (last meeting with X, recent decisions, info
  already captured about a person or org) against the FTS index without dumping full
  document bodies by default.
- **`org-store.mjs`** — creates/resolves an organization (Account) entity, gated by the
  same affiliation-evidence bar real Dori uses: a structured role/title assertion tying a
  person to the org, not a bare company-name mention — mirrors `accounts.ensure`.
- **`entity-merge.mjs`** — merges a duplicate person or org file into a canonical one:
  unions aliases (and, for orgs, the linked-people list), rewrites every known
  cross-reference vault-wide, archives the losing file instead of deleting it — mirrors
  `entities.merge`/`SqliteEntityStore.merge` (decision 0022).
- **`decision-store.mjs`** — extends decision recall past meeting minutes to any
  captured note: exports the same classification prompt `decisions.capture` uses (run
  by the calling agent, since this mirror has no in-script model call), then files a
  high-confidence result (`>= 0.8`, mirroring the real action's own gate) as a
  `entities/decisions/<slug>.md` entity.
- **`list-tasks.mjs` / `task-store.mjs`** — reads dori-engine's real task store directly
  (open/pending tasks), separate from the inbox below. `task-store.mjs` writes to that
  same store: a direct "add a task", or extracting tasks from a meeting's Action Items
  section — mirrors `tasks.detect`'s real blocking rule (someone else's commitment only
  becomes a task if it blocks one of yours), never guesses an owner.
- **`meeting-prep.mjs`** — assembles a pre-meeting brief (relevant prior meetings, pending
  tasks, known/unknown attendees) from local lookups only, no model call — mirrors
  `meeting.generate_brief` minus the LLM step.
- **`query-ledger.mjs` / `expense-router.mjs` / `attach-receipt.mjs` /
  `check-reimbursement-gaps.mjs` / `close-trip.mjs`** — a personal expense-tracking flow:
  route a plain-text expense message or a photographed/scanned receipt to a trip ledger,
  read totals/outstanding rows back, check a claim for missing dates/amounts/receipts,
  and close out a trip into a reimbursement-package doc (plus a forward-only draft →
  submitted → paid status move) — mirroring Dori's `trip-ledger.ts` and
  `finance-attach-trip-receipt.ts`/consolidate-package logic exactly (idempotent per
  receipt, booking-ref/`supersedes` replacement marks the old row superseded rather than
  deleting it). No zip file: real Dori doesn't produce one either.
- **`fetch-fathom.mjs`** — pulls unfiled meetings straight from the Fathom API (needs
  your own `FATHOM_API_KEY`) and feeds them into the same meeting-routing/minutes flow as
  a pasted transcript.
- **`research-person.mjs`** — looks up a new meeting attendee via Tavily search (needs
  your own `TAVILY_API_KEY`) — fetches only, doesn't auto-file.
- **`research-and-recommend.mjs`** — the same web research placed next to what you
  already have: colleagues already in your vault at that company, an existing org
  relationship (`org-store.mjs`), and related vault docs — a "what do I bring into this
  conversation" brief, not just a bio.
- **`build-site.mjs` / `serve-site.mjs`** — a minimal local mini-site to browse your
  `projects/`/`yt/` vault content in a browser, plus (`build-tables.mjs`, built
  automatically alongside) read-only tables of people, orgs, brands, tasks, and trip
  ledgers — visual patterns borrowed from dori-portal's real UI, no new database.
- **`notify-desktop.mjs`** — macOS desktop notification (`osascript`, no dependency).
- **`send-whatsapp.mjs` / `listen-whatsapp.mjs`** — a self-chat WhatsApp channel (via
  Baileys, on a dedicated secondary number). Outbound sends a message; the listener
  files inbound links/text/media through the same routing everything else uses — no AI
  step, since it runs unattended.
- **`digest.mjs`** — a morning/evening summary (open tasks + inbox) as a static HTML
  page, plus a desktop notification and an optional WhatsApp relay. Scheduled with
  launchd, not a real engine feature (that needs a live scheduler + AI call) — this is
  the mechanical version.
- **`watch-inbox.mjs`** — a passively watched dropbox folder (never the vault itself),
  scoped down from `watcher/index.ts` + `pending-batch-store.ts` to detection/triage
  only: 3s stability window, filename+size+mtime move detection (not a content hash —
  that's a separate real-Dori dedup concern this doesn't need), a 2-minute grace period
  before a missing file counts as a real delete. Scheduled with launchd, same pattern as
  the WhatsApp listener.

- **`credentials-store.mjs` / `credentials-lib.mjs`** — a local encrypted store for API
  keys, tokens, and passwords. AES-256-GCM, encryption key held in the macOS Keychain,
  rows in a SQLite file at `~/.dori/credentials.sqlite`. **macOS-only** (it shells out to
  `security` and `pbcopy`). Designed so an agent can look a secret up for you without
  ever seeing it: `get` copies the value to your clipboard and prints only a length and
  the last four characters, and `getSecret()` lets a script pull one into memory
  directly. `find` searches names plus optional aliases, so a key you'd ask for as
  "the search key" is findable even when its name says "Serper". To add one,
  `add-credential-server.mjs` opens a small local form in your
  browser (localhost-only, behind a one-time token), or `add-credential.mjs` asks in the
  terminal — either way you type the value into that process, not into a chat.

**Not included**: the bulk importer the author uses to load a whole markdown file of
secrets at once — it's keyed to their own vault layout, and the store above covers the
same ground one entry at a time.

## Read this first

[Quick start](https://mini.mydori.app/docs/getting-started) — `setup.sh` opens it in your
browser automatically once it's done. Six copy-paste lines to say to your agent, right
after install. [How it works](https://mini.mydori.app/docs/how-it-works) explains what the
install actually did, and what your vault looks like before and after real use.
[The full guide](https://mini.mydori.app/docs/guide) covers every capture type in depth,
plus how it stays cheap and fast to run. [Cost breakdown](https://mini.mydori.app/docs/cost)
is the deeper technical breakdown of exactly where — and where not — it spends model tokens.

## Setup

Requires Node.js 24+ (uses the built-in `node:sqlite` module).

```bash
curl -fsSL https://mini.mydori.app/install.sh | sh
```

...or clone it directly if you'd rather inspect it first:

```bash
git clone https://github.com/vshrinath/dori-mini dori
cd dori
./setup.sh
```

`setup.sh` will:
1. Install Node 24+ automatically if you don't have it (via `nvm`, `brew`, `apt`, or `pacman`).
2. Run `npm install` (pulls in local embedding model support — a few hundred MB, one-time).
3. Install `yt-dlp` and `markitdown` automatically if missing (via `brew`, `pacman`, or `pip3`
   — `markitdown` isn't in Arch's official repos, so that one always uses `pip3` there), for
   YouTube/document capture.
4. Ask for your Dori vault path (defaults to creating a fresh one) and your name (required
   — used so meeting notes can recognize and skip you when matching attendees).
5. Wire itself into whichever of Claude Code / Codex CLI / Grok Build you have installed,
   so those tools discover it automatically instead of you having to invoke it by hand.
6. On macOS only: offer WhatsApp pairing and automatic digest scheduling, both optional.

## Updating

`install.sh` only handles a fresh install (it refuses to run if `~/dori` already exists) —
to get new scripts/fixes into an existing install:
```bash
cd ~/dori   # or wherever you installed it
./update.sh
```
Refuses to run over uncommitted local changes rather than silently overwriting them,
`git pull --ff-only`s the rest, and re-runs `npm install` only if `package.json` actually
changed. To newly opt into a launchd-scheduled feature that showed up in an update
(WhatsApp, digests, the watched inbox), re-run `./setup.sh` — safe, but it re-asks every
prompt from scratch, so re-enter your real vault path rather than hitting Enter through it.

`setup.sh` also offers (macOS only) to schedule this once a day via launchd
(`update-schedule.plist.template`) — that's the actual answer to "how would I know a
new script landed": it only pings a desktop notification when it pulled real changes,
or when it's blocked and needs you, never on the common no-op day. Logs: `~/.dori/update.log`.

When something did change, `./update.sh` prints the new section(s) of
[`RELEASE_NOTES.md`](./RELEASE_NOTES.md) — plain English, no commit hashes, same
convention real Dori's own release notes use.

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
