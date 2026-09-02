#!/usr/bin/env node
/**
 * Master E2E Test Suite Runner for Dori Mini
 * Executes all 4 tiers of the requirement-driven E2E test suite covering 12 features.
 * 
 * Usage:
 *   node test/e2e-suite.mjs              # Run all 4 tiers
 *   node test/e2e-suite.mjs tier1        # Run Tier 1 only
 *   node test/e2e-suite.mjs tier2        # Run Tier 2 only
 *   node test/e2e-suite.mjs tier3        # Run Tier 3 only
 *   node test/e2e-suite.mjs tier4        # Run Tier 4 only
 */
import tier1Runner from './e2e/tier1-feature-coverage.mjs';
import tier2Runner from './e2e/tier2-boundary-cases.mjs';
import tier3Runner from './e2e/tier3-cross-feature.mjs';
import tier4Runner from './e2e/tier4-workload-scenarios.mjs';

const targetTier = process.argv[2]?.toLowerCase();

console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║                   DORI MINI MASTER E2E TEST SUITE                         ║');
console.log('║         Requirement-Driven, Opaque-Box 4-Tier Verification                ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

const suiteStart = Date.now();
const results = [];

const tiersToRun = [];
if (!targetTier || targetTier === 'all') {
  tiersToRun.push(
    { name: 'Tier 1: Feature Coverage (Isolation & Happy Path)', runner: tier1Runner },
    { name: 'Tier 2: Boundary & Corner Cases (Edge Cases & Robustness)', runner: tier2Runner },
    { name: 'Tier 3: Cross-Feature Interactions (Pairwise Combinations)', runner: tier3Runner },
    { name: 'Tier 4: Real-World Workload Scenarios (End-to-End Journeys)', runner: tier4Runner },
  );
} else if (targetTier === 'tier1' || targetTier === '1') {
  tiersToRun.push({ name: 'Tier 1: Feature Coverage', runner: tier1Runner });
} else if (targetTier === 'tier2' || targetTier === '2') {
  tiersToRun.push({ name: 'Tier 2: Boundary & Corner Cases', runner: tier2Runner });
} else if (targetTier === 'tier3' || targetTier === '3') {
  tiersToRun.push({ name: 'Tier 3: Cross-Feature Interactions', runner: tier3Runner });
} else if (targetTier === 'tier4' || targetTier === '4') {
  tiersToRun.push({ name: 'Tier 4: Real-World Workload Scenarios', runner: tier4Runner });
} else {
  console.error(`Unknown tier: "${targetTier}". Valid options: tier1, tier2, tier3, tier4, all`);
  process.exit(1);
}

let totalPassed = 0;
let totalFailed = 0;

for (const { name, runner } of tiersToRun) {
  const passed = await runner.run();
  totalPassed += runner.passed;
  totalFailed += runner.failed;
  results.push({
    name,
    passed: runner.passed,
    failed: runner.failed,
    ok: passed,
  });
}

const totalDuration = ((Date.now() - suiteStart) / 1000).toFixed(2);

console.log('═════════════════════════════════════════════════════════════════════════════');
console.log('                          FINAL E2E EXECUTION SUMMARY                        ');
console.log('═════════════════════════════════════════════════════════════════════════════');
for (const r of results) {
  const statusBadge = r.ok ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${statusBadge.padEnd(8)} ${r.name.padEnd(60)} (${r.passed} passed, ${r.failed} failed)`);
}
console.log('─────────────────────────────────────────────────────────────────────────────');
console.log(`  TOTAL ASSERTIONS: ${totalPassed + totalFailed}`);
console.log(`  PASSED:           ${totalPassed}`);
console.log(`  FAILED:           ${totalFailed}`);
console.log(`  DURATION:         ${totalDuration}s`);
console.log('═════════════════════════════════════════════════════════════════════════════');

if (totalFailed > 0) {
  console.error(`\n❌ E2E TEST SUITE FAILED: ${totalFailed} assertions failed.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ E2E TEST SUITE PASSED: 100% of ${totalPassed} assertions succeeded.\n`);
  process.exit(0);
}
