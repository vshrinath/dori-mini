# People, your profile, brands, organizations

The `dori` CLI command in `SKILL.md`'s table comes first. The scripts below (`~/.claude/skills/dori/...`, a link to this repo) and their `dori-mini` MCP tools are the fallback, for the gaps that table names.

## 5. Person research (enrich a new attendee/contact on request)

When the user asks to look up or research a person ("who's Priya Menon from Acme", a new meeting attendee, a thin record), follow the `prep` skill's recipe (§3 Match people, §4 Research, §5 Ask once, then write). In short:

1. **Match first.** `dori people list --type all --json`; match by name, then by `email`/`emails[]`, case-insensitively. For a match: `dori people get <id> --json` (relationships such as `works_for`, `met_with`), `dori facts <id> --json`, `dori people profile <id>`. A person with no `jobTitle` is thin: research them too. Two candidates for one name: ask which.
2. **Research with your own WebSearch** (company pages, the person's own LinkedIn, The Org, talks, articles). Keep each claim's source URL and mark it `confirmed` (a primary page), `from the conversation`, or `inferred`/`unconfirmed`. No people-search sites, never contact details, home addresses or family. Common names collide (a search for a workplace-design architect once returned a same-named textiles professor): note namesakes, and confirm the right person before treating anything as fact. No public trace is a finding.
3. **What you already have** ("what do I bring into this conversation"): colleagues at the same company (`company` in `people list`), the org's links (`dori people get <org id>`), and `dori search "<name> <org>" --limit 8` for earlier minutes, notes and proposals. Read the hits that matter with `dori vault read <path>` or `dori artifacts get <id>`.
4. **Ask once, then write.** Show one numbered batch of every write and wait for "yes". Only `confirmed` and `from the conversation` claims become fields or facts. Write in this order: org (`dori people add "<Org>" --type organization`, or `accounts.ensure` below), person (`dori people add "<Name>" --role … --company … --email …`, or `dori people update <id>`; `--add-email` keeps existing ones), link (`dori people link <person> <org>`), facts (`dori facts add "<sentence>" [--project <p>]`), profile (`dori people profile <id> @<file>` with `## Now`, `## Career`, `## Education`, `## Links`, `## Sources and caveats`; read the current one first and keep what's still true).

**This is not the same as recalling someone already in the vault.** "Tell me about Priya" or "what's the NDA status with Northwind" is recall: `dori people get`, `dori facts`, `dori search` (`references/recall.md`), no web research.

Fallback, only when the CLI is down: `research-person.mjs "Full Name" ["Company"]` and `research-and-recommend.mjs "Full Name" "Company" [--project <slug>]` (Tavily, `TAVILY_API_KEY` in this directory's `.env`; fetch only, no writes).

## Your own profile (self)

**CLI first:** your record is the person with `isSelf: true` in `dori people list --json`; change it with `dori call updateEntity`. The `self-store.mjs` commands below are the fallback (gap 9).

When the user wants to tell the tool about themselves — role, org, or which projects they're on — rather than about someone else:
```bash
node ~/.claude/skills/dori/self-store.mjs set "Your Name" [--role <title>] [--org <company>] [--projects a,b] [--linkedin <url>]
node ~/.claude/skills/dori/self-store.mjs get
```
Mirrors real Dori's `isSelf` flag exactly — your profile is a person file at `entities/people/<slug>.md`, same shape as anyone else's, just marked `is_self: true`. Not a separate file type: `route-meeting.mjs` now excludes whoever is marked `is_self` from attendee-vote matching automatically (mirrors `if (p.isSelf) continue` in the real router), so once this is set you don't need to pass `--self` by name on every call. At most one file carries the mark — `set` clears it off any other file first, same guard real Dori applies. `set` merges onto whatever's already on file, so a call that only passes `--linkedin` won't drop a role/org set earlier. `--linkedin` stores under `links.linkedin`, matching `EntityLinksSchema` in `packages/contracts/src/entities.ts` — the same field every other entity type uses for a LinkedIn URL.

## Brands (a brand someone is launching or works for)

**No CLI equivalent yet (gap 11):** use the `brand-store.mjs` commands below or the `get_brand`/`set_brand` MCP tools.

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

**CLI first:** `dori run accounts.ensure '{"orgName":"Meridian","personId":"<person id>","personName":"Anita Sharma","evidenceText":"Anita Sharma, CFO at Meridian"}'` (same evidence bar; `success: false` with `affiliation_evidence_not_cleared` writes nothing), and for duplicates `dori run entities.merge '{"sourceId":"<dup id>","targetId":"<canonical id>"}'`, which waits for the user's approval in Dori's Inbox. The `org-store.mjs` and `entity-merge.mjs` commands below are the fallback, for when the CLI is down.

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
