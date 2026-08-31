# Capture Router — local Dori-compatible tooling

For a pasted YouTube link, document (PDF/DOCX/PPTX/XLSX/HTML), or meeting transcript,
and for searching or checking pending items in `$VAULT_ROOT`:
check `~/.claude/skills/dori/` first. Read `SKILL.md` there for full usage,
then run the matching script directly via `node <script>.mjs <args>` instead of
reasoning the routing/search from scratch.

- `route-destination.mjs` / `route-meeting.mjs` — where a capture or meeting file goes
- `query-vault.mjs` — vault recall (last meeting, decisions, "tell me about <person>", "what's the NDA with <org>"); default output omits full document body. Its `related <person-or-org>` command walks the co-meeting/org graph for a multi-hop question ("who else is connected to X", "who's on Y's team, and what have they been in since") that no single document answers directly.
- `list-tasks.mjs` — open tasks from dori-engine's real task store ("what are my pending tasks")
- `reindex-vault.mjs` / `semantic-index.mjs` — keyword / semantic search over the vault
- `apply-template.mjs` — scaffold folders for a project
- `clarification-store.mjs` / `list-inbox.mjs` — pending routing decisions, unrouted captures
- `notify-desktop.mjs` / `send-whatsapp.mjs` / `listen-whatsapp.mjs` / `digest.mjs` —
  desktop notifications, a self-chat WhatsApp channel (dedicated secondary number,
  Baileys), and a morning/evening digest page. These run unattended (launchd), not
  routed by an agent session — help set them up on request, don't invoke them per-message.
- `credentials-store.mjs` / `import-credentials.mjs` / `credentials-lib.mjs` — local encrypted
  key/password store (AES-256-GCM, key in macOS Keychain), present on this machine but not
  shipped in the public repo. For a request like "what is my X id/key" or "store this
  credential", use `credentials-store.mjs get/set/find/list` — see the "Credentials store"
  section in `SKILL.md` before reasoning it from scratch. If these files aren't present,
  this is a clone of the public repo and the feature is simply unavailable — see README.

These are plain Node.js scripts (Node 24+) — safe to invoke from any agent with shell
access to this filesystem. "No Claude-specific dependencies" means not tied to Claude
Code's own APIs — it does NOT mean avoid npm packages. Prefer a real, well-solved
library (e.g. chokidar for file watching, a real YAML parser) over hand-rolling the same
problem, especially when real Dori (`dori-engine`/`dori-portal`) already solved it with
one — borrow that choice rather than reinventing it. A one-time `npm install` is a fine
cost; a fragile hand-rolled reimplementation is not the goal here.

## When to act without being asked, and when to wait for "Dori"

This tool is usually wired into the same agent session someone uses for real project
work — not a separate chat. Two different message shapes need two different rules, so
an ordinary sentence about the actual coding task never gets mistaken for a capture.

**Structural triggers — act immediately, no prefix needed.** These shapes essentially
never occur in ordinary project conversation, so there's no ambiguity to guard against:
- A YouTube URL pasted in, alone or with a short instruction ("grab this")
- A file attached or dragged in that's a document (PDF/DOCX/PPTX/XLSX) or looks like a
  photographed receipt/bill
- A block of text that's clearly a raw meeting transcript (timestamps, speaker labels)

**Conversational triggers — require an explicit "Dori" prefix.** These are natural-
language asks that could just as easily be about the real project in this same session,
so only act when the message starts with "Dori" (case-insensitive, an optional comma,
e.g. "Dori, ..." or "hey Dori ..."). Strip that prefix, then match the rest normally:
- Recall/search ("Dori, what did I discuss with Priya last time?")
- Task queries ("Dori, what are my pending tasks?", "Dori, anything in my inbox?")
- Free-text expense/ledger statements ("Dori, I spent ₹300 on lunch")
- Starting something new ("Dori, start a new project for me", "Dori, start a trip for
  the Denver conference")
- Person research ("Dori, who's Priya Menon from Acme?")

Rule of thumb: if the message could *only* be about capture (a link, a file, a
transcript), act on it directly. If it's a sentence that could plausibly be about
anything else going on in this session, wait for the "Dori" prefix.
