#!/usr/bin/env node
// A/B harness: re-runs the baseline eval's Founding Fuel questions against the (now
// partly contextualized) index and compares rank-of-target against the recorded baseline.
// Baseline ranks are transcribed from docs/baseline-retrieval-eval-2026-08-26.md.
// '-' means the target did not appear within limit 20.
//
// READ BEFORE INTERPRETING THE OUTPUT (Part 14.3 of research-benchmarks-2026-08-26.md):
// `contextualize` writes to dori-engine's vectors.db; query-vault.mjs reads dori-portal's
// portal.db, which the pass never touches. The fts column is therefore byte-identical by
// construction, and the fused `either` column is NOT a valid A/B — it averages a treated
// channel with an untreated one. The semantic column is the only real measurement here.
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';

const LIMIT = 20;
const SKILL = homedir() + '/.claude/skills/dori';

// target key -> substring that identifies the target document's path
const DOC = {
  'FF-Pre': 'Pre launch readiness sync mom',
  'FF-Launch': 'Launch morning check in mom',
  'FF-Tax': 'Taxonomy tech onboarding sync mom',
  'FF-Osc': 'Video production oscars strategy mom',
  'FF-Arch': 'Technical architecture audit achyut',
};

// [id, question, [targets], baselineSemantic, baselineFts]  ('-' = miss)
const Q = [
  ['Q1', 'what time of night were we going to push the new site live', ['FF-Pre'], 2, 2],
  ['Q2', 'why did we skip load balancing for the new site', ['FF-Pre'], 1, 9],
  ['Q3', 'we renamed one of the site sections right before going live, what did it become', ['FF-Pre'], '-', 8],
  ['Q4', 'what were we going to use to get alerted if the site went down', ['FF-Pre'], '-', 7],
  ['Q5', "why doesn't the front page keep loading more stories as you scroll", ['FF-Launch'], 14, '-'],
  ['Q6', 'which topic did we put at the top of the homepage on launch day', ['FF-Launch'], '-', 1],
  ['Q7', 'roughly how many old stories are sitting in the archive', ['FF-Tax'], '-', '-'],
  ['Q8', 'what are we using to send the sign-in emails', ['FF-Tax'], '-', '-'],
  ['Q9', 'who writes our film awards coverage', ['FF-Osc'], 1, '-'],
  ['Q10', 'who was the original developer we asked to look over the new setup', ['FF-Arch'], '-', '-'],
  ['Q15', 'what share of our pages does the new search engine handle', ['FF-Arch'], '-', '-'],
  ['Q16', 'how many failed AI pilots did the soft drinks company have', ['FF-Arch'], '-', '-'],
  ['Q17', 'we had a mess with stories written by two people, did that get sorted before launch', ['FF-Tax', 'FF-Launch'], '-', '-'],
  ['Q18', 'Charles was going to narrate the site tour video, is that what actually happened', ['FF-Osc', 'FF-Launch'], '-', 2],
  ['Q19', 'old articles had dead audio players, what did we decide to do and who was finding them', ['FF-Tax', 'FF-Pre'], 3, 16],
  ['Q20', 'we agreed a time to flip the switch, did the site actually go live that morning', ['FF-Pre', 'FF-Launch'], '-', '-'],
];

function rankOf(lines, needle) {
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return '-';
}
// worst rank across all required targets; '-' if any target missing (multi-hop needs BOTH)
function scoreMulti(lines, targets) {
  let worst = 0;
  for (const t of targets) {
    const r = rankOf(lines, DOC[t]);
    if (r === '-') return '-';
    worst = Math.max(worst, r);
  }
  return worst;
}

function semanticRanks(q) {
  const out = execFileSync('node', ['semantic-index.mjs', 'search', q, String(LIMIT)],
    { cwd: SKILL, encoding: 'utf8', maxBuffer: 32e6 });
  return out.split('\n').filter((l) => l.startsWith('['));
}
function ftsRanks(q) {
  const out = execFileSync('node', ['query-vault.mjs', 'search', q, '--limit', String(LIMIT)],
    { cwd: SKILL, encoding: 'utf8', maxBuffer: 32e6 });
  return [...out.matchAll(/"rel_path":\s*"([^"]+)"/g)].map((m) => m[1]);
}

// which target docs are actually contextualized — an uncontextualized target can't
// show an effect, and reporting it as a null result would be misleading
const db = new DatabaseSync(homedir() + '/.dori/caches/feb98dfba3cf1b58/vectors.db', { readOnly: true });
const ctxState = {};
for (const [k, sub] of Object.entries(DOC)) {
  const r = db.prepare('SELECT contextualized_at FROM indexed_files WHERE source_path LIKE ? AND contextualized_at IS NOT NULL').get('%' + sub + '%');
  ctxState[k] = !!r;
}
console.log('target docs contextualized:', Object.entries(ctxState).map(([k, v]) => `${k}=${v ? 'Y' : 'N'}`).join(' '));
console.log();

const hit = (r) => r !== '-';
let bS = 0, aS = 0, bF = 0, aF = 0, bE = 0, aE = 0;
console.log('Q     semantic(base->now)   fts(base->now)     either');
for (const [id, q, targets, baseS, baseF] of Q) {
  const s = scoreMulti(semanticRanks(q), targets);
  const f = scoreMulti(ftsRanks(q), targets);
  bS += hit(baseS) ? 1 : 0; aS += hit(s) ? 1 : 0;
  bF += hit(baseF) ? 1 : 0; aF += hit(f) ? 1 : 0;
  const be = hit(baseS) || hit(baseF), ae = hit(s) || hit(f);
  bE += be ? 1 : 0; aE += ae ? 1 : 0;
  const flag = !be && ae ? '  <== RECOVERED' : be && !ae ? '  <== LOST' : '';
  console.log(`${id.padEnd(5)} ${String(baseS).padStart(3)} -> ${String(s).padStart(3)}          ${String(baseF).padStart(3)} -> ${String(f).padStart(3)}        ${be ? 'hit' : 'miss'} -> ${ae ? 'hit' : 'miss'}${flag}`);
}
const n = Q.length;
console.log();
console.log(`semantic hits: ${bS}/${n} -> ${aS}/${n}   <- the only valid A/B`);
console.log(`fts hits:      ${bF}/${n} -> ${aF}/${n}   (portal.db untreated; unchanged by construction)`);
console.log(`either:        ${bE}/${n} (${(100*bE/n).toFixed(0)}%) -> ${aE}/${n} (${(100*aE/n).toFixed(0)}%)  (NOT evidence: mixes treated + untreated)`);
