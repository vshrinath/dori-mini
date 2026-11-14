# Notifications, WhatsApp, local mini-site

The `dori` CLI command in `SKILL.md`'s table comes first. The scripts below (`~/.claude/skills/dori/...`, a link to this repo) and their `dori-mini` MCP tools are the fallback, for the gaps that table names.

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

## Mini-site (browse projects/, yt/, and structured records locally)

```bash
node ~/.claude/skills/dori/build-site.mjs
node ~/.claude/skills/dori/serve-site.mjs
```
Then open `http://localhost:8420/`. Serve it — do not open `_site/index.html` via `file://`: YouTube's embed player validates the page's origin/referrer on every load, and `file://` sends neither, which YouTube rejects with "Error 153: Video player configuration error" regardless of query params. Any http(s) origin, including localhost, satisfies the check.

`build-site.mjs` also builds a **Data** section (`build-tables.mjs`, called automatically — no separate command) — read-only HTML tables over people, orgs, brands, tasks, and trip ledgers, at `_site/data/`. Same rule as the rest of the mini-site: nothing here writes back, every row reads straight from the same files the CLI scripts already use. Visual patterns (plain text-first tables, an outlined status pill rather than color-coded, "Waiting on X" as subtext, an invitational empty state instead of "No X found") are borrowed from dori-portal's own real UI (`accounts-table.tsx`, `tasks-workspace.tsx`, `finance-ledger.tsx`, `empty-state.tsx`), not invented.
