# Credentials: store and look up keys, passwords, IDs

Script paths below are `~/.claude/skills/dori/...`, a link to this repo. Prefer the matching `dori-mini` MCP tool when one exists.

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
