#!/usr/bin/env node
// Measures the ported cross-encoder reranker (Part 17) against the same 20-question +
// 4-negative-control set as the baseline eval (docs/baseline-retrieval-eval-2026-08-26.md).
// Runs `semantic-index.mjs search` at limit 20 with RERANK=1 (default) vs RERANK=0, and
// records the rank of each target document in both, plus hit@20 for both.
//
// Usage: node docs/eval-rerank-2026-08-26.mjs
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const SKILL = homedir() + '/.claude/skills/dori';
const LIMIT = 20;

const DOC = {
  'FF-Pre': 'Pre launch readiness sync mom',
  'FF-Launch': 'Launch morning check in mom',
  'FF-Tax': 'Taxonomy tech onboarding sync mom',
  'FF-Osc': 'Video production oscars strategy mom',
  'FF-Arch': 'Technical architecture audit achyut',
  'SC-EMR': 'lvpei-emr---decision-with-sceh-management',
  'SC-P1': 'phase-1-proposal',
  'SM-EC': '2026-06-20-shishu-mandir-ec-meeting',
};

const Q = [
  ['Q1', 'what time of night were we going to push the new site live', ['FF-Pre']],
  ['Q2', 'why did we skip load balancing for the new site', ['FF-Pre']],
  ['Q3', 'we renamed one of the site sections right before going live, what did it become', ['FF-Pre']],
  ['Q4', 'what were we going to use to get alerted if the site went down', ['FF-Pre']],
  ['Q5', "why doesn't the front page keep loading more stories as you scroll", ['FF-Launch']],
  ['Q6', 'which topic did we put at the top of the homepage on launch day', ['FF-Launch']],
  ['Q7', 'roughly how many old stories are sitting in the archive', ['FF-Tax']],
  ['Q8', 'what are we using to send the sign-in emails', ['FF-Tax']],
  ['Q9', 'who writes our film awards coverage', ['FF-Osc']],
  ['Q10', 'who was the original developer we asked to look over the new setup', ['FF-Arch']],
  ['Q11', 'what database is the hospital records system we are evaluating built on', ['SC-EMR']],
  ['Q12', 'how much of my week did I commit to the eye hospital advisory work', ['SC-P1']],
  ['Q13', 'when is the school society annual general meeting happening', ['SM-EC']],
  ['Q14', 'how many people do they want on the governing committee now', ['SM-EC']],
  ['Q15', 'what share of our pages does the new search engine handle', ['FF-Arch']],
  ['Q16', 'how many failed AI pilots did the soft drinks company have', ['FF-Arch']],
  ['Q17', 'we had a mess with stories written by two people, did that get sorted before launch', ['FF-Tax', 'FF-Launch']],
  ['Q18', 'Charles was going to narrate the site tour video, is that what actually happened', ['FF-Osc', 'FF-Launch']],
  ['Q19', 'old articles had dead audio players, what did we decide to do and who was finding them', ['FF-Tax', 'FF-Pre']],
  ['Q20', 'we agreed a time to flip the switch, did the site actually go live that morning', ['FF-Pre', 'FF-Launch']],
  ['N1', 'what are we paying Gowtham per month', []],
  ['N2', 'what uptime did we promise after the launch', []],
  ['N3', 'which investor put money into Founding Fuel', []],
  ['N4', 'how many newsletter subscribers did Founding Fuel have at launch', []],
];

function search(query, rerankOn) {
  const out = execFileSync('node', ['semantic-index.mjs', 'search', query, String(LIMIT)], {
    cwd: SKILL, encoding: 'utf8', maxBuffer: 32e6,
    env: { ...process.env, RERANK: rerankOn ? '1' : '0' },
  });
  return out.split('\n').filter((l) => l.startsWith('['));
}

function rankOf(lines, needle) {
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return '-';
}
function scoreMulti(lines, targets) {
  if (targets.length === 0) return 'n/a';
  let worst = 0;
  for (const t of targets) {
    const r = rankOf(lines, DOC[t]);
    if (r === '-') return '-';
    worst = Math.max(worst, r);
  }
  return worst;
}

console.log(`rerank eval — semantic channel only, k=${LIMIT}, ${Q.length} questions\n`);
console.log('Q     rank(no-rerank -> reranked)      hit(before -> after)');
let hitsBefore = 0, hitsAfter = 0, promoted = 0, demoted = 0;
const nonNeg = Q.filter((q) => q[2].length > 0).length;

for (const [id, q, targets] of Q) {
  const before = scoreMulti(search(q, false), targets);
  const after = scoreMulti(search(q, true), targets);
  const hitB = before !== '-' && before !== 'n/a';
  const hitA = after !== '-' && after !== 'n/a';
  if (targets.length > 0) {
    hitsBefore += hitB ? 1 : 0;
    hitsAfter += hitA ? 1 : 0;
  }
  let flag = '';
  if (hitB && hitA && typeof before === 'number' && typeof after === 'number') {
    if (after < before) { flag = `  <== promoted (+${before - after})`; promoted++; }
    else if (after > before) { flag = `  <== demoted (-${after - before})`; demoted++; }
  } else if (!hitB && hitA) { flag = '  <== RECOVERED'; promoted++; }
  else if (hitB && !hitA) { flag = '  <== LOST'; demoted++; }
  console.log(`${id.padEnd(5)} ${String(before).padStart(3)} -> ${String(after).padStart(3)}                       ${hitB ? 'hit' : 'miss'} -> ${hitA ? 'hit' : 'miss'}${flag}`);
}

console.log(`\nhit@${LIMIT} (real questions only, n=${nonNeg}): ${hitsBefore}/${nonNeg} (${(100*hitsBefore/nonNeg).toFixed(0)}%) -> ${hitsAfter}/${nonNeg} (${(100*hitsAfter/nonNeg).toFixed(0)}%)`);
console.log(`rank movement among still-hit questions: ${promoted} promoted/recovered, ${demoted} demoted/lost`);
