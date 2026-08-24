#!/usr/bin/env node
// Mirrors dori-portal/lib/research-bundle.ts's tavilySearch() exactly (same endpoint, same
// request shape, same 0.3 score filter) — Dori's own "Person Research" quick action never
// actually calls this; it just files a blank capture note (see AGENTS.md). This script is
// the real fetch, standalone, for enriching a meeting attendee on request.
//
// Usage: node research-person.mjs "Full Name" ["Company/org"] ["extra context"]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const TAVILY_API = 'https://api.tavily.com/search';
const MIN_SCORE = 0.3;

function loadApiKey() {
  if (process.env.TAVILY_API_KEY) return process.env.TAVILY_API_KEY;
  const envPath = join(SKILL_DIR, '.env');
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf-8').match(/^TAVILY_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error(`TAVILY_API_KEY not set — export it, or put "TAVILY_API_KEY=..." in ${envPath}`);
}

async function tavilySearch(query, maxResults = 5) {
  const res = await fetch(TAVILY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: loadApiKey(),
      query,
      search_depth: 'advanced',
      max_results: maxResults,
    }),
  });
  if (!res.ok) throw new Error(`Tavily API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results || [])
    .filter((r) => (r.score ?? 1) >= MIN_SCORE)
    .map(({ title, url, content }) => ({ title, url, content }));
}

function defaultQueries(name, company) {
  const base = company ? `${name} ${company}` : name;
  return [base, `${name} linkedin`, company ? `${company} company overview` : `${name} background`];
}

export async function researchPerson(name, company, context) {
  const queries = defaultQueries(name, company).concat(context ? [`${name} ${context}`] : []);
  const resultSets = await Promise.all(queries.map((q) => tavilySearch(q)));
  const seen = new Set();
  const results = [];
  for (const set of resultSets) {
    for (const r of set) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        results.push(r);
      }
    }
  }
  return { name, company: company || null, queries, results, searchedAt: new Date().toISOString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , name, company, context] = process.argv;
  if (!name) {
    console.error('Usage: node research-person.mjs "Full Name" ["Company/org"] ["extra context"]');
    process.exit(1);
  }
  const bundle = await researchPerson(name, company, context);
  console.log(JSON.stringify(bundle, null, 2));
}
