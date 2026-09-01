#!/usr/bin/env node
// Mirrors dori-engine's accounts.ensure action (accounts-ensure.ts) and the affiliation-evidence
// bar it's gated on (packages/capture/src/processors/affiliation-evidence.ts, decision 0015):
// an `organization` entity is only created — or an existing one resolved and linked to a
// person — when the text clears a structured role/title assertion ("Anita, CFO at Meridian"),
// never on bare co-occurrence or an incidental company-name mention. This is the deliberate
// gate real Dori uses to stop every passing company name from spawning a record.
//
// Storage: entities/organizations/<slug>.md, same one-file-per-entity shape as
// entities/people/*.md (see dori-vault-conventions.md) — not the separate accounts/<slug>/
// ledger folder concept from the engine's Layer B, which is a different "account" meaning
// already covered here by query-ledger.mjs's trip ledgers.
//
// Usage:
//   node org-store.mjs ensure "Meridian" --person "Anita Sharma" --evidence "Anita, CFO at Meridian" [--role vendor] [--person-slug anita-sharma]
//   node org-store.mjs ensure "Meridian" --no-evidence --role client   (already-structured input, e.g. a form — bypasses the bar)
//   node org-store.mjs list
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT_ROOT = process.env.VAULT_ROOT || join(homedir(), 'proto-space/dori/dori-vault');
const ORGS_DIR = join(VAULT_ROOT, 'entities/organizations');
const ACCOUNTS_DIR = join(VAULT_ROOT, 'accounts');
const PEOPLE_DIR = join(VAULT_ROOT, 'entities/people');
const ROLES = ['client', 'vendor', 'partner', 'employer', 'none', 'prospect', 'collaborator', 'founder-advisory'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleNamePattern(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map(escapeRegex).join('\\s+');
}

const ROLE_TOKEN = "([A-Za-z][A-Za-z /&.'-]{1,40}?)";

// Mirrors findAffiliationEvidence exactly — same four patterns, same order.
export function findAffiliationEvidence(text, personName, orgName) {
  const person = flexibleNamePattern(personName);
  const org = flexibleNamePattern(orgName);
  if (!text?.trim() || !person || !org) return null;

  const patterns = [
    new RegExp(`${person}\\s*,\\s*${ROLE_TOKEN}\\s+(?:at|@)\\s+${org}\\b`, 'i'),
    new RegExp(`${person}\\s+is\\s+(?:the\\s+)?${ROLE_TOKEN}\\s+(?:at|of)\\s+${org}\\b`, 'i'),
    new RegExp(`${person}\\s*,\\s*${org}(?:'s|’s)\\s+${ROLE_TOKEN}\\b`, 'i'),
    new RegExp(`${person}\\s+(?:serves|works)\\s+as\\s+${ROLE_TOKEN}\\s+(?:at|for)\\s+${org}\\b`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { role: match[1]?.trim() ?? '', snippet: match[0].trim() };
  }
  return null;
}

export function clearsAffiliationEvidenceBar(text, personName, orgName) {
  return findAffiliationEvidence(text, personName, orgName) !== null;
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

import { parseFrontmatter, asList } from './frontmatter.mjs';

export function loadPeople() {
  if (!existsSync(PEOPLE_DIR)) return [];
  return readdirSync(PEOPLE_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'PEOPLE.md')
    .map((f) => {
      try {
        const raw = readFileSync(join(PEOPLE_DIR, f), 'utf-8');
        const { fm, body } = parseFrontmatter(raw);
        return {
          slug: f.replace(/\.md$/, ''),
          name: (fm.name || f.replace(/\.md$/, '').replace(/-/g, ' ')).replace(/^["']|["']$/g, ''),
          role: fm.role || '',
          org: fm.org || '',
          relationship: fm.relationship || 'contact',
          lastContact: fm['last-contact'] || '',
          projects: asList(fm.projects),
          summary: body?.trim()?.slice(0, 300) || '',
          relPath: `entities/people/${f}`,
          file: f,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function loadAccounts() {
  if (!existsSync(ACCOUNTS_DIR)) return [];
  const dirs = readdirSync(ACCOUNTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const people = loadPeople();

  return dirs.map((slug) => {
    const dirPath = join(ACCOUNTS_DIR, slug);
    const readmePath = join(dirPath, 'README.md');
    const relDocPath = join(dirPath, '.relationship.md');
    
    let raw = '';
    let usedFile = 'README.md';
    if (existsSync(readmePath)) {
      raw = readFileSync(readmePath, 'utf-8');
    } else if (existsSync(relDocPath)) {
      raw = readFileSync(relDocPath, 'utf-8');
      usedFile = '.relationship.md';
    }

    const { fm, body } = raw ? parseFrontmatter(raw) : { fm: {}, body: '' };
    const title = (fm.title || slug.replace(/[-_]/g, ' ')).replace(/^["']|["']$/g, '');
    const accountKind = fm.account_kind || fm.kind || (fm.type === 'account' ? 'client' : 'none');
    const relationshipStatus = fm.relationship_status || fm.status || 'active';
    const domain = fm.domain || '';
    const summary = fm.summary || body?.trim()?.slice(0, 300) || '';
    const website = fm.website || '';

    // Find linked people who belong to this org / account
    const normName = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const linkedPeople = people.filter((p) => {
      const pOrg = (p.org || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return pOrg.includes(normSlug) || (normName.length > 2 && pOrg.includes(normName));
    });

    return {
      slug,
      name: title,
      role: accountKind,
      accountKind,
      relationshipStatus,
      domain,
      summary,
      website,
      isAccount: true,
      people: linkedPeople.map((p) => p.slug),
      peopleDetails: linkedPeople,
      relPath: `accounts/${slug}/${usedFile}`,
      file: usedFile,
    };
  });
}

export function loadOrgs() {
  const accounts = loadAccounts();
  const orgFiles = existsSync(ORGS_DIR)
    ? readdirSync(ORGS_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          try {
            const raw = readFileSync(join(ORGS_DIR, f), 'utf-8');
            const { fm, body } = parseFrontmatter(raw);
            const slug = f.replace(/\.md$/, '');
            return {
              slug,
              name: (fm.name || slug.replace(/-/g, ' ')).replace(/^["']|["']$/g, ''),
              role: fm.role || 'none',
              accountKind: fm.role || 'none',
              relationshipStatus: fm.status || 'active',
              domain: fm.domain || '',
              summary: fm.summary || body?.trim()?.slice(0, 300) || '',
              website: fm.website || '',
              isAccount: false,
              people: asList(fm.people),
              peopleDetails: [],
              relPath: `entities/organizations/${f}`,
              file: f,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];

  const existingSlugs = new Set(accounts.map((a) => a.slug.toLowerCase()));
  const merged = [...accounts];
  for (const org of orgFiles) {
    if (!existingSlugs.has(org.slug.toLowerCase())) {
      merged.push(org);
    }
  }
  return merged;
}

// Inline-array frontmatter (`people: ["a", "b"]`), matching the format entities/people/*.md
// already uses for its own `projects:` field — and what asList()/loadOrgs() expect back.
function writeOrgFile(org) {
  const peopleLine = `people: [${org.people.map((p) => `"${p}"`).join(', ')}]\n`;
  const body = `---\nentityType: organization\nname: "${org.name}"\nrole: ${org.role}\n${peopleLine}---\n`;
  mkdirSync(ORGS_DIR, { recursive: true });
  writeFileSync(join(ORGS_DIR, `${org.slug}.md`), body);
}

// Mirrors accounts.ensure: resolve-or-create, gated by the evidence bar unless the caller
// already holds a structured, non-free-text assertion (requireEvidence: false).
export function ensureOrg({ orgName, personSlug, personName, evidenceText, role = 'none', requireEvidence = true }) {
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(', ')}`);
  if (requireEvidence) {
    if (!evidenceText?.trim() || !personName?.trim()) {
      return { success: false, created: false, reason: 'evidence_and_person_name_required' };
    }
    if (!clearsAffiliationEvidenceBar(evidenceText, personName, orgName)) {
      return { success: false, created: false, reason: 'affiliation_evidence_not_cleared' };
    }
  }

  const orgs = loadOrgs();
  const name = orgName.trim();
  const existing = orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
  const org = existing || { slug: slugify(name), name, role, people: [] };

  let linkedPeople = [];
  if (personSlug && !org.people.includes(personSlug)) {
    org.people = [...org.people, personSlug];
    linkedPeople = [personSlug];
  }

  writeOrgFile(org);
  return { success: true, created: !existing, orgSlug: org.slug, orgName: org.name, linkedPeople };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (key === 'no-evidence') { flags.requireEvidence = false; continue; }
      flags[key] = argv[i + 1];
      i++;
    }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'list') {
    const orgs = loadOrgs();
    if (orgs.length === 0) console.log('No organizations on file.');
    else for (const o of orgs) console.log(`- ${o.name} (${o.role})${o.people.length ? ` — ${o.people.join(', ')}` : ''}`);
  } else if (cmd === 'ensure') {
    const [orgName] = rest;
    if (!orgName) {
      console.error('Usage: node org-store.mjs ensure "<Org Name>" --person "<Full Name>" --evidence "<text>" [--role client|vendor|partner|employer] [--person-slug <slug>]\n   or: node org-store.mjs ensure "<Org Name>" --no-evidence [--role ...]');
      process.exit(1);
    }
    const flags = parseFlags(rest.slice(1));
    const result = ensureOrg({
      orgName,
      personName: flags.person,
      evidenceText: flags.evidence,
      personSlug: flags['person-slug'],
      role: flags.role || 'none',
      requireEvidence: flags.requireEvidence !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exit(1);
  } else {
    console.error('Usage: node org-store.mjs ensure "<Org Name>" ...\n   or: node org-store.mjs list');
    process.exit(1);
  }
}
