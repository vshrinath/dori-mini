#!/usr/bin/env node
// Measures `semantic-index.mjs verify` against the frozen question set from
// docs/baseline-retrieval-eval-2026-08-26.md — 20 real questions plus 4 negative controls
// whose answers were verified ABSENT from the corpus by grep before any retrieval ran.
//
// Usage: node docs/eval-sufficiency-2026-08-26.mjs [k]     (k = passages shown, default 5)
//
// The metric that matters is NOT accuracy. It is the 2x2 below, because the two error types
// have opposite costs and a single accuracy number hides the trade:
//
//                     | target doc(s) retrieved | target doc(s) NOT retrieved
//   claims an answer  | true positive           | FALSE POSITIVE  <- the failure 2.3 exists to kill
//   says insufficient | FALSE NEGATIVE          | true negative
//                       ^ a good answer we suppressed: the price of the check
//
// A negative control has no target by construction, so any claimed answer there is a false
// positive. `unverified` (the check itself failed to run) is counted separately and never
// folded into either column — it is a fact about the checker, not about the vault.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const SKILL = homedir() + '/.claude/skills/dori';
const K = Number(process.argv[2] || 5);

// distinctive filename substrings — source_path in the index is vault-relative and the
// meeting notes live under entities/projects/..., so match on the filename, not the prefix
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

function runVerify(question, k) {
  const raw = execFileSync('node', ['semantic-index.mjs', 'verify', question, String(k)],
    { cwd: SKILL, encoding: 'utf8', maxBuffer: 32e6 });
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('no JSON in output: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(s, e + 1));
}

const rows = [];
let tp = 0, fp = 0, fn = 0, tn = 0, unver = 0, downgrades = 0, review = 0;
const latencies = [];
const reviewNotes = [];

console.log(`sufficiency eval — k=${K}, ${Q.length} questions\n`);
for (const [id, question, targets] of Q) {
  let r;
  try {
    r = runVerify(question, K);
  } catch (err) {
    rows.push([id, 'ERROR', '-', '-', err.message.slice(0, 40)]);
    unver++;
    continue;
  }
  latencies.push(r.elapsed_ms ?? 0);
  if (r.downgraded_from) downgrades++;

  const passages = r.passages ?? [];
  const present = targets.filter((t) => passages.some((p) => p.includes(DOC[t])));
  const coverage = targets.length === 0 ? 'n/a'
    : present.length === targets.length ? 'full'
    : present.length > 0 ? 'some' : 'none';

  const claims = r.verdict === 'sufficient' || r.verdict === 'partial';
  let cell;
  if (r.verdict === 'unverified') { cell = 'UNVERIFIED'; unver++; }
  else if (targets.length === 0) {
    // A negative control's answer was verified ABSENT from the whole corpus by grep, so
    // there is no document anywhere that could ground it. Any claimed answer here really
    // is a false positive, with no adjudication needed.
    cell = claims ? 'FALSE POS' : 'true neg';
    claims ? fp++ : tn++;
  } else if (coverage === 'none') {
    // NOT automatically a false positive. The ground-truth key names ONE canonical document
    // per question, but the vault covers several of these facts in more than one place
    // (Q4's alerting plan is also in tech docs/MONITORING_SETUP.md; Q19's audio-player
    // decision is also in a Sveta/Indrajit/Charles/Ramnath meeting note). Scoring "the
    // document I named was not retrieved" as a false positive would have counted two
    // correctly-grounded answers as hallucinations. Whether the quote actually answers the
    // question asked cannot be decided mechanically — flag for adjudication instead of
    // guessing, and record the verdict in the research doc, not here.
    cell = claims ? 'REVIEW' : 'true neg';
    claims ? review++ : tn++;
  } else { cell = claims ? 'true pos' : 'FALSE NEG'; claims ? tp++ : fn++; }

  rows.push([id, r.verdict, coverage, `${r.quotes_verified ?? 0}/${r.quotes_claimed ?? 0}`, cell]);
  if (cell === 'REVIEW') {
    for (const qt of r.quotes ?? []) {
      reviewNotes.push(`  ${id} [${qt.verified ? 'verified' : qt.check}] ${qt.source}\n       "${qt.quote.slice(0, 150)}"`);
    }
  }
}

console.log('Q     verdict        target      quotes  outcome');
for (const [id, v, cov, q, cell] of rows) {
  console.log(`${id.padEnd(5)} ${String(v).padEnd(14)} ${String(cov).padEnd(11)} ${String(q).padEnd(7)} ${cell}`);
}

const nonNeg = Q.filter((q) => q[2].length > 0).length;
const neg = Q.length - nonNeg;
const sorted = [...latencies].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

console.log(`\n--- outcomes (k=${K}) ---`);
console.log(`true positive  ${tp}   (named target retrieved, answer claimed — correct)`);
console.log(`true negative  ${tn}   (nothing to answer from, refused — correct)`);
console.log(`FALSE POSITIVE ${fp}   <- claimed an answer whose fact is absent from the whole corpus`);
console.log(`FALSE NEGATIVE ${fn}   <- suppressed an answer the passages did contain`);
console.log(`REVIEW         ${review}   <- answered from a non-target document; adjudicate below`);
console.log(`unverified     ${unver}   (check failed to run; not counted either way)`);
console.log(`quote downgrades ${downgrades}  (verdict voided because no quote matched its source)`);
if (reviewNotes.length) {
  console.log(`\n--- REVIEW cases: does the quote answer the question ASKED? ---`);
  console.log(reviewNotes.join('\n'));
}
console.log(`\nnegative controls: ${neg} — false-positive rate ${rows.filter((r) => r[0].startsWith('N') && r[4] === 'FALSE POS').length}/${neg}`);
// Times the sufficiency call ONLY. Retrieval and the one-time Transformers.js model load sit
// on top of this, so it is a floor on the per-query cost, not the whole of it.
console.log(`latency (LLM call only, excludes retrieval): median ${median} ms, max ${Math.max(0, ...latencies)} ms, total ${(latencies.reduce((a, b) => a + b, 0) / 1000).toFixed(0)} s`);
