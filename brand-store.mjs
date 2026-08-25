#!/usr/bin/env node
// A brand someone is launching or works for — distinct from an organization (org-store.mjs):
// a company can have several brands, and a person can be building a brand before any company
// is registered. No vault entity for this exists in dori-engine to mirror (checked entities.ts
// — no 'brand' entityType); the only real "brand" concept is dori-portal's BrandConfig
// (lib/brand.ts) — pure visual theming (colors/fonts/logo) for its document/slide preview
// feature, stored outside the vault in a single JSON file, no guidelines or description at
// all. This borrows those exact field names for the theming half (so a brand set here is
// already shaped right if this vault is ever opened by real dori-portal), and adds what that
// config has no room for: an owner link and a free-text guidelines/description body — same
// frontmatter-plus-prose shape every other vault entity already uses.
//
// Storage: entities/brands/<slug>.md
//
// Usage:
//   node brand-store.mjs set "Dori" [--owner <person-or-org-slug>] [--company <legal name>]
//     [--primary <#hex>] [--accent <#hex>] [--font-display <name>] [--font-body <name>] [--logo <path-or-url>]
//   node brand-store.mjs get "Dori"
//   node brand-store.mjs context "Dori"   # frontmatter + guidelines body, as a prompt block
//   node brand-store.mjs list
//
// The guidelines/description prose isn't a CLI flag — like every other vault file, edit the
// body of entities/brands/<slug>.md directly; `set` only ever touches the frontmatter block.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const BRANDS_DIR = join(VAULT_ROOT, 'entities/brands');

// Same field names as dori-portal's BrandConfigSchema (lib/brand.ts), theming subset only —
// bodyBg/bodyText/muted/border/surface/primaryLight are preset-derived there, not
// hand-authored, so they're left out here rather than faked.
const THEME_FIELDS = {
  company: 'company',
  primary: 'primary',
  accent: 'accent',
  'font-display': 'fontDisplay',
  'font-body': 'fontBody',
  logo: 'logo',
};

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z]+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: m[2] };
}

export function loadBrands() {
  if (!existsSync(BRANDS_DIR)) return [];
  return readdirSync(BRANDS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { fm } = parseFrontmatter(readFileSync(join(BRANDS_DIR, f), 'utf-8'));
      return { slug: f.replace(/\.md$/, ''), ...fm };
    });
}

export function getBrand(name) {
  const norm = name.trim().toLowerCase();
  return loadBrands().find((b) => (b.name || b.slug).toLowerCase() === norm) || null;
}

// Full frontmatter + guidelines body, formatted as a ready-to-paste prompt block — for an
// agent asked to "write in this brand's voice" to read before generating text. No renderer,
// no theming pipeline: brand-aware content generation here just means feeding this into the
// agent's own context, not injecting theme tokens into a rendered document like dori-portal does.
export function getBrandContext(name) {
  const brand = getBrand(name);
  if (!brand) return null;
  const raw = readFileSync(join(BRANDS_DIR, `${brand.slug}.md`), 'utf-8');
  const { body } = parseFrontmatter(raw);
  const facts = Object.entries(brand)
    .filter(([k]) => k !== 'slug')
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return `# Brand: ${brand.name}\n\n${facts}\n${body}`.trim() + '\n';
}

// Merges onto whatever frontmatter already exists — a `set` that only passes --logo must
// not silently drop owner/company/colors/fonts set by an earlier call. Body is left alone
// entirely; this only ever touches the frontmatter block.
export function setBrand(name, fields = {}) {
  const slug = slugify(name);
  const full = join(BRANDS_DIR, `${slug}.md`);
  const existing = existsSync(full) ? parseFrontmatter(readFileSync(full, 'utf-8')) : { fm: {}, body: '\n## Guidelines\n\n(add positioning, voice, and anything else worth remembering here)\n' };

  const merged = { ...existing.fm, name, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null)) };
  const orderedKeys = ['name', 'owner', ...Object.values(THEME_FIELDS)];
  const lines = orderedKeys.filter((k) => merged[k] != null).map((k) => `${k}: "${merged[k]}"`);
  const body = `---\n${lines.join('\n')}\n---\n${existing.body}`;

  mkdirSync(BRANDS_DIR, { recursive: true });
  writeFileSync(full, body);
  return { slug, name };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'list') {
    const brands = loadBrands();
    if (brands.length === 0) console.log('No brands on file.');
    else for (const b of brands) console.log(`- ${b.name}${b.owner ? ` (owner: ${b.owner})` : ''}`);
  } else if (cmd === 'get') {
    const [name] = rest;
    if (!name) { console.error('Usage: node brand-store.mjs get "<Brand Name>"'); process.exit(1); }
    const brand = getBrand(name);
    console.log(brand ? JSON.stringify(brand, null, 2) : `No brand named "${name}" on file.`);
  } else if (cmd === 'context') {
    const [name] = rest;
    if (!name) { console.error('Usage: node brand-store.mjs context "<Brand Name>"'); process.exit(1); }
    const ctx = getBrandContext(name);
    console.log(ctx || `No brand named "${name}" on file.`);
  } else if (cmd === 'set') {
    const [name] = rest;
    if (!name) {
      console.error('Usage: node brand-store.mjs set "<Brand Name>" [--owner <slug>] [--company <name>] [--primary <#hex>] [--accent <#hex>] [--font-display <name>] [--font-body <name>] [--logo <path>]');
      process.exit(1);
    }
    const flags = parseFlags(rest.slice(1));
    const fields = { owner: flags.owner };
    for (const [flag, fmKey] of Object.entries(THEME_FIELDS)) fields[fmKey] = flags[flag];
    const result = setBrand(name, fields);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('Usage: node brand-store.mjs set "<Brand Name>" ...\n   or: node brand-store.mjs get "<Brand Name>"\n   or: node brand-store.mjs context "<Brand Name>"\n   or: node brand-store.mjs list');
    process.exit(1);
  }
}
