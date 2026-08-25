#!/usr/bin/env node
// "Research and recommend" — the thing "who's Priya Menon from Acme" is actually asking for:
// not just web results (that's research-person.mjs alone), but web research placed next to
// whatever you already have on this company — a known org relationship (org-store.mjs), a
// colleague already in your vault at the same company, or a doc that already mentions them —
// so you get a real answer to "what do I bring into this conversation," not just a bio.
//
// No matching action exists in dori-engine/dori-portal to mirror (checked: research-person.ts
// is web-only, meeting-generate-brief.ts's attendee classification is known/unknown/ambiguous
// only, no company cross-reference) — this composes three things that already exist here
// (research-person.mjs, org-store.mjs, query-vault.mjs) rather than duplicating any of them.
//
// Usage: node research-and-recommend.mjs "Full Name" "Company" ["extra context"] [--project <slug>]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { researchPerson } from './research-person.mjs';
import { loadOrgs } from './org-store.mjs';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

// Colleagues already in the vault at the same company — entities/people/*.md's own `org:`
// field (a plain string, e.g. "SCEH"), not org-store.mjs's structured records, since most
// people files predate org-store and were never linked to one.
function colleaguesAt(company) {
  if (!company || !existsSync(PEOPLE_DIR)) return [];
  const norm = company.toLowerCase().trim();
  return readdirSync(PEOPLE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ fm: parseFrontmatter(readFileSync(join(PEOPLE_DIR, f), 'utf-8')), file: f }))
    .filter(({ fm }) => (fm.org || '').toLowerCase().trim() === norm)
    .map(({ fm, file }) => ({ name: fm.name || file.replace(/\.md$/, ''), role: fm.role || null }));
}

// Existing organization relationship, if this company already cleared the affiliation-
// evidence bar before (org-store.mjs) — tells you whether this is a client/vendor/partner
// you already have a track record with, not a cold company.
function knownOrg(company) {
  if (!company) return null;
  const norm = company.toLowerCase().trim();
  return loadOrgs().find((o) => o.name.toLowerCase().trim() === norm) || null;
}

// Prior vault docs already mentioning this company/project — shells out to query-vault.mjs
// rather than reimplementing FTS search; that script is CLI-only (prints, doesn't export),
// so this is the same interface any other caller gets.
function relatedVaultDocs(query, limit = 5) {
  if (!query?.trim()) return [];
  try {
    const out = execFileSync(
      process.execPath,
      [join(SKILL_DIR, 'query-vault.mjs'), 'search', query, '--limit', String(limit)],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const payload = JSON.parse(out);
    return payload.hits || [];
  } catch {
    return []; // no index yet, or nothing found — not fatal, just an empty section
  }
}

export async function researchAndRecommend(name, company, context, project) {
  const [research, colleagues, org] = [
    await researchPerson(name, company, context),
    colleaguesAt(company),
    knownOrg(company),
  ];
  const vaultDocs = relatedVaultDocs([company, project].filter(Boolean).join(' '));
  return { name, company: company || null, project: project || null, research, colleagues, org, vaultDocs };
}

function renderBrief({ name, company, research, colleagues, org, vaultDocs }) {
  const lines = [`# ${name}${company ? ` — ${company}` : ''}`, ''];

  if (org) {
    lines.push(`**You already have a ${org.role} relationship with ${org.name}.**`, '');
  } else if (company) {
    lines.push(`No prior organization on file for ${company} — this is a cold company as far as your vault knows.`, '');
  }

  if (colleagues.length > 0) {
    lines.push('## People you already know there', '');
    for (const c of colleagues) lines.push(`- ${c.name}${c.role ? ` (${c.role})` : ''}`);
    lines.push('');
  }

  if (vaultDocs.length > 0) {
    lines.push('## Related to something you already have', '');
    for (const d of vaultDocs) lines.push(`- ${d.title || d.rel_path}${d.date ? ` (${d.date})` : ''}`);
    lines.push('');
  }

  lines.push('## Web research', '');
  if (research.results.length === 0) {
    lines.push('No results found.');
  } else {
    for (const r of research.results.slice(0, 5)) {
      lines.push(`- **${r.title}** — ${r.url}`);
      if (r.content) lines.push(`  ${r.content.slice(0, 200).trim()}${r.content.length > 200 ? '…' : ''}`);
    }
  }
  lines.push('', '[Unverified web search — confirm identity before treating any of this as fact; common names collide.]');

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const project = projectIdx !== -1 ? args[projectIdx + 1] : undefined;
  const positional = args.filter((a, i) => a !== project && args[i - 1] !== '--project' && a !== '--project');
  const [name, company, context] = positional;
  if (!name) {
    console.error('Usage: node research-and-recommend.mjs "Full Name" "Company" ["extra context"] [--project <slug>]');
    process.exit(1);
  }
  const result = await researchAndRecommend(name, company, context, project);
  console.log(renderBrief(result));
}
