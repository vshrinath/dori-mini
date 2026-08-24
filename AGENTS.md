# Capture Router — local Dori-compatible tooling

For a pasted YouTube link, document (PDF/DOCX/PPTX/XLSX/HTML), or meeting transcript,
and for searching or checking pending items in `~/proto-space/dori/dori-vault`:
check `~/.claude/skills/dori/` first. Read `SKILL.md` there for full usage,
then run the matching script directly via `node <script>.mjs <args>` instead of
reasoning the routing/search from scratch.

- `route-destination.mjs` / `route-meeting.mjs` — where a capture or meeting file goes
- `query-vault.mjs` — vault recall (last meeting, decisions); default output omits full document body
- `reindex-vault.mjs` / `semantic-index.mjs` — keyword / semantic search over the vault
- `apply-template.mjs` — scaffold folders for a project
- `clarification-store.mjs` / `list-inbox.mjs` — pending routing decisions, unrouted captures
- `credentials-store.mjs` / `import-credentials.mjs` / `credentials-lib.mjs` — local encrypted
  key/password store (AES-256-GCM, key in macOS Keychain). For a request like "what is my
  X id/key" or "store this credential", use `credentials-store.mjs get/set/find/list` —
  see the "Credentials store" section in `SKILL.md` before reasoning it from scratch.

These are plain Node.js scripts (Node 24+, no Claude-specific dependencies) — safe to
invoke from any agent with shell access to this filesystem.
