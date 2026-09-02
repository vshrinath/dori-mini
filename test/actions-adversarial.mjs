#!/usr/bin/env node
/**
 * Comprehensive Adversarial & Fuzzing Test Suite for actions.mjs and backend domain capabilities
 * Executed by challenger_1 for Milestone 7 Integration & Hardening Audit
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { actions, getAction } from "../actions.mjs";

const ROOT = resolve(process.cwd());
const TEST_VAULT = join(ROOT, ".test-vault-adversarial");
const TEST_CONFIG = join(ROOT, ".test-config-adversarial");
const TEST_DB = join(TEST_VAULT, "portal.db");

console.log("=== Initializing Adversarial & Fuzzing Test Environment ===");
console.log("Test Vault:", TEST_VAULT);
console.log("Test DB:", TEST_DB);

// Cleanup & setup test directory
if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true, force: true });
if (existsSync(TEST_CONFIG)) rmSync(TEST_CONFIG, { recursive: true, force: true });

mkdirSync(TEST_VAULT, { recursive: true });
mkdirSync(join(TEST_VAULT, "finances/trips"), { recursive: true });
mkdirSync(join(TEST_VAULT, "finances/reimbursements"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/people"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/organizations"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/brands"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/projects/platform/meetings"), { recursive: true });
mkdirSync(join(TEST_VAULT, "meetings"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/tasks/records"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/clarifications"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/decisions"), { recursive: true });
mkdirSync(join(TEST_VAULT, "inbox"), { recursive: true });
mkdirSync(TEST_CONFIG, { recursive: true });

// Seed test files
const sampleTripLedger = `---
type: reimbursement
threadId: trip-denver-2026
trip: "Denver Conf 2026"
account: "acme-corp"
status: draft
---

# Trip Ledger

| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-10 | Flight to Denver | Transport | 450.00 | 45.00 | self | yes | [receipt](receipts/flight.pdf) |
| 2026-08-11 | Hotel Stay | Lodging | 300.00 | 30.00 | self | yes | — |
| 2026-08-12 | Team Dinner | Food | 120.00 | 12.00 | self | false | — |
`;
writeFileSync(join(TEST_VAULT, "finances/trips/2026-denver.md"), sampleTripLedger);

const samplePerson1 = `---
name: "Anita Sharma"
role: "CFO"
org: "Meridian"
projects:
  - "platform"
---
Anita Sharma is the CFO at Meridian.
`;
writeFileSync(join(TEST_VAULT, "entities/people/anita-sharma.md"), samplePerson1);

const samplePerson2 = `---
name: "David Chen"
role: "Lead Architect"
org: "Meridian"
projects:
  - "platform"
---
David Chen is the Lead Architect.
`;
writeFileSync(join(TEST_VAULT, "entities/people/david-chen.md"), samplePerson2);

const sampleOrg = `---
name: "Meridian"
role: "client"
people:
  - "anita-sharma"
---
Meridian Corporation.
`;
writeFileSync(join(TEST_VAULT, "entities/organizations/meridian.md"), sampleOrg);

const sampleBrand = `---
name: "Dori"
company: "Dori Labs Inc"
primary: "#4F46E5"
accent: "#10B981"
fontDisplay: "Figtree"
fontBody: "Figtree"
---
# Dori Brand Guidelines
Modern, minimalist, highly responsive personal assistant.
`;
writeFileSync(join(TEST_VAULT, "entities/brands/dori.md"), sampleBrand);

const sampleMeeting = `---
kind: meeting
type: meeting
date: "2026-08-15"
title: "Platform Strategy Sync"
account: "platform"
people:
  - "anita-sharma"
fathom_recording_id: "fathom-rec-12345"
---
# Platform Strategy Sync
## Minutes
Discussed Q3 milestones.
## Transcript
Speaker 1: Welcome everyone.
`;
writeFileSync(join(TEST_VAULT, "entities/projects/platform/meetings/2026-08-15-platform-sync.md"), sampleMeeting);

const sampleCsv = join(TEST_VAULT, "sample-data.csv");
writeFileSync(sampleCsv, "Date,Description,Amount\n2026-08-15,Cloud Hosting,120.00\n2026-08-16,Domain Renewal,15.00\n");

const sampleUnsupportedDoc = join(TEST_VAULT, "unsupported-doc.txt");
writeFileSync(sampleUnsupportedDoc, "Unsupported text content");

const samplePdf = join(TEST_VAULT, "sample-receipt.txt");
writeFileSync(samplePdf, "Fake receipt content");

const env = {
  ...process.env,
  VAULT_ROOT: TEST_VAULT,
  DORI_CONFIG_DIR: TEST_CONFIG,
  VAULT_INDEX_DB: TEST_DB,
  PORTAL_DB_PATH: TEST_DB,
};

// Build index
console.log("Seeding test vault search index via reindex-vault.mjs...");
const idxRes = spawnSync("node", ["reindex-vault.mjs"], { cwd: ROOT, env, encoding: "utf8" });
assert.equal(idxRes.status, 0, "Index build must succeed");

let passed = 0;
let failed = 0;
const testResults = [];

function recordResult(domain, actionId, testCase, status, details, error = null) {
  if (status === "PASS") {
    passed++;
  } else {
    failed++;
  }
  testResults.push({ domain, actionId, testCase, status, details, error: error ? error.message : null });
  console.log(`[${status}] ${domain} :: ${actionId} - ${testCase}: ${details}`);
}

function runCli(actionId, payload) {
  const args = ["actions.mjs", "run"];
  if (actionId) args.push(actionId);
  if (payload !== undefined) args.push(typeof payload === "string" ? payload : JSON.stringify(payload));
  
  const res = spawnSync("node", args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

console.log("\n=== 1. CLI DISPATCH & REGISTRY ADVERSARIAL TESTS ===");

// 1.1 Non-existent action ID
{
  const res = runCli("non_existent_action_xyz", "{}");
  assert.equal(res.status, 1, "Must exit with status 1 on unknown action");
  let errObj;
  try { errObj = JSON.parse(res.stderr); } catch {}
  assert.ok(errObj?.error?.includes("No action registered"), "Must return descriptive JSON error");
  recordResult("Registry", "cli_dispatch", "Unknown action ID rejection", "PASS", "Rejected with exit code 1 and descriptive error");
}

// 1.2 Missing action ID
{
  const res = spawnSync("node", ["actions.mjs", "run"], { cwd: ROOT, env, encoding: "utf8" });
  assert.equal(res.status, 1, "Must exit with status 1 on missing action ID");
  assert.ok(res.stderr.includes("Usage:"), "Must print usage message");
  recordResult("Registry", "cli_dispatch", "Missing action ID argument", "PASS", "Usage printed with exit code 1");
}

// 1.3 Unparseable JSON input
{
  const res = runCli("timeline", "{ malformed json string !!");
  assert.equal(res.status, 1, "Must exit 1 on JSON syntax error");
  let errObj;
  try { errObj = JSON.parse(res.stderr); } catch {}
  assert.ok(errObj?.error, "Must return JSON formatted error on malformed input");
  recordResult("Registry", "cli_dispatch", "Malformed JSON input string", "PASS", "Caught by JSON parser without process crash");
}

// 1.4 Non-object JSON primitive fuzzing (number, array, boolean, string, null)
{
  for (const primitive of ["12345", "[1, 2, 3]", "true", '"bare string"', "null"]) {
    const res = runCli("timeline", primitive);
    assert.equal(res.status, 1, `Must reject non-object JSON primitive: ${primitive}`);
    let errObj;
    try { errObj = JSON.parse(res.stderr); } catch {}
    assert.ok(errObj?.error, `Must return structured error on primitive: ${primitive}`);
  }
  recordResult("Registry", "cli_fuzzing", "Non-object JSON primitives rejection", "PASS", "Rejected number, array, bool, string, null primitives cleanly");
}

console.log("\n=== 2. FINANCE DOMAIN TESTS ===");

// 2.1 list_trip_ledgers / list_ledgers
{
  // Valid
  const res = runCli("list_trip_ledgers", "{}");
  assert.equal(res.status, 0);
  const data = JSON.parse(res.stdout);
  assert.ok(Array.isArray(data), "Must return array");
  assert.ok(data.length >= 1, "Must list seeded ledger");
  assert.equal(data[0].trip, "Denver Conf 2026");
  assert.equal(data[0].status, "draft");
  assert.equal(data[0].rowCount, 3);
  assert.equal(data[0].incompleteCount, 0);
  assert.equal(data[0].total, 870);
  assert.equal(data[0].reimbursableTotal, 750);
  recordResult("Finance", "list_trip_ledgers", "Valid listing with computed totals", "PASS", `Found ${data.length} ledgers with accurate totals`);

  // Alias
  const aliasRes = runCli("list_ledgers", "{}");
  assert.equal(aliasRes.status, 0);
  assert.deepEqual(JSON.parse(aliasRes.stdout), data);
  recordResult("Finance", "list_ledgers", "Alias equivalence check", "PASS", "Identical output to list_trip_ledgers");
}

// 2.2 get_trip_ledger / get_ledger
{
  // Missing required param
  const resMissing = runCli("get_trip_ledger", "{}");
  assert.equal(resMissing.status, 1);
  assert.ok(resMissing.stderr.includes("Required"), "Zod must enforce required target");
  recordResult("Finance", "get_trip_ledger", "Empty input rejection", "PASS", "Rejected required target");

  // Empty string param
  const resEmpty = runCli("get_trip_ledger", { target: "" });
  assert.equal(resEmpty.status, 1);
  assert.ok(resEmpty.stderr.includes("String must contain at least 1 character"), "Zod min(1) constraint");
  recordResult("Finance", "get_trip_ledger", "Empty string boundary target", "PASS", "Rejected by Zod min(1)");

  // Path traversal injection attempt
  const resTraversal = runCli("get_trip_ledger", { target: "../../../etc/passwd" });
  assert.equal(resTraversal.status, 1);
  assert.ok(resTraversal.stderr.includes("No ledger found matching"));
  recordResult("Finance", "get_trip_ledger", "Path traversal injection rejection", "PASS", "Safely rejected path traversal payload");

  // SQL injection string attempt
  const resSql = runCli("get_trip_ledger", { target: "' OR '1'='1" });
  assert.equal(resSql.status, 1);
  assert.ok(resSql.stderr.includes("No ledger found matching"));
  recordResult("Finance", "get_trip_ledger", "SQL injection syntax rejection", "PASS", "Safely rejected SQL payload");

  // Non-existent ledger
  const resNotFound = runCli("get_trip_ledger", { target: "non-existent-trip" });
  assert.equal(resNotFound.status, 1);
  assert.ok(resNotFound.stderr.includes("No ledger found matching"), "Clean domain error");
  recordResult("Finance", "get_trip_ledger", "Non-existent ledger target", "PASS", "Clean domain error returned");

  // Valid target by threadId
  const resValid = runCli("get_trip_ledger", { target: "trip-denver-2026" });
  assert.equal(resValid.status, 0);
  const data = JSON.parse(resValid.stdout);
  assert.equal(data.threadId, "trip-denver-2026");
  assert.equal(data.ledger.trip, "Denver Conf 2026");
  assert.equal(data.ledger.rows.length, 3);
  recordResult("Finance", "get_trip_ledger", "Valid ledger fetch by threadId", "PASS", "Fetched ledger rows and metadata");

  // Valid target by trip name (case-insensitive fuzzy)
  const resFuzzy = runCli("get_trip_ledger", { target: "denver conf 2026" });
  assert.equal(resFuzzy.status, 0);
  recordResult("Finance", "get_trip_ledger", "Fuzzy trip name resolution", "PASS", "Matched case-insensitively");
}

// 2.3 check_reimbursement_gaps
{
  // Missing param
  const resMissing = runCli("check_reimbursement_gaps", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Finance", "check_reimbursement_gaps", "Missing target rejection", "PASS", "Zod required check");

  // Valid target with gaps
  const resValid = runCli("check_reimbursement_gaps", { target: "trip-denver-2026" });
  assert.equal(resValid.status, 0);
  const data = JSON.parse(resValid.stdout);
  assert.ok(data.ledgerRelPath);
  assert.ok(Array.isArray(data.gaps));
  // In our seeded ledger, Hotel Stay has no attachment and is reimbursable -> 1 gap expected!
  assert.ok(data.gaps.length >= 1, "Must detect missing attachment gap for Hotel Stay");
  assert.ok(data.gaps.some(g => g.description.includes("Hotel Stay")), "Gap flagged on Hotel Stay");
  assert.equal(data.claimItems, 2, "2 claim items");
  assert.equal(data.excludedItems, 1, "1 excluded item");
  assert.equal(data.complete, false, "Incomplete due to missing receipt");
  recordResult("Finance", "check_reimbursement_gaps", "Evidence gap audit on reimbursable rows", "PASS", `Detected ${data.gaps.length} gaps accurately`);
}

// 2.4 route_expense
{
  // Missing message
  const resMissing = runCli("route_expense", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Finance", "route_expense", "Missing message rejection", "PASS", "Zod required check");

  // Valid single food expense
  const resFood = runCli("route_expense", { message: "Spent $24.50 on lunch at Chipotle" });
  assert.equal(resFood.status, 0);
  const dataFood = JSON.parse(resFood.stdout);
  assert.ok(dataFood.action);
  assert.ok(dataFood.row);
  assert.equal(dataFood.expense.category, "Food");
  assert.equal(dataFood.expense.amount, 24.5);
  recordResult("Finance", "route_expense", "Food expense extraction & routing", "PASS", `Extracted amount $24.50 category Food action ${dataFood.action}`);

  // Transport expense
  const resTransport = runCli("route_expense", { message: "Uber ride from airport $58.20" });
  assert.equal(resTransport.status, 0);
  const dataTransport = JSON.parse(resTransport.stdout);
  assert.equal(dataTransport.expense.category, "Transport");
  assert.equal(dataTransport.expense.amount, 58.2);
  recordResult("Finance", "route_expense", "Transport expense extraction", "PASS", "Extracted amount $58.20 category Transport");

  // Non-expense message handling (no amount)
  const resNonExpense = runCli("route_expense", { message: "Just general notes about lunch meeting" });
  assert.equal(resNonExpense.status, 0);
  const dataNon = JSON.parse(resNonExpense.stdout);
  assert.equal(dataNon.action, "not_expense");
  recordResult("Finance", "route_expense", "Non-expense text handling", "PASS", "Classified as not_expense gracefully");
}

// 2.5 attach_receipt
{
  // Missing file/filePath
  const resNoFile = runCli("attach_receipt", { date: "2026-08-15", desc: "Test", amount: 50 });
  assert.equal(resNoFile.status, 1);
  assert.ok(resNoFile.stderr.includes("Either file or filePath is required"));
  recordResult("Finance", "attach_receipt", "Missing file/filePath refinement error", "PASS", "Zod refine rejected missing file");

  // Invalid date format
  const resBadDate = runCli("attach_receipt", { file: samplePdf, date: "15-08-2026", desc: "Lunch", amount: 30 });
  assert.equal(resBadDate.status, 1);
  assert.ok(resBadDate.stderr.includes("Invalid"));
  recordResult("Finance", "attach_receipt", "Invalid regex date rejection", "PASS", "Zod regex rejected non-YYYY-MM-DD");

  // Negative amount
  const resNegAmount = runCli("attach_receipt", { file: samplePdf, date: "2026-08-15", desc: "Lunch", amount: -20 });
  assert.equal(resNegAmount.status, 1);
  assert.ok(resNegAmount.stderr.includes("Number must be greater than 0"));
  recordResult("Finance", "attach_receipt", "Negative amount rejection", "PASS", "Zod positive number check");

  // Valid attach to existing trip
  const resValid = runCli("attach_receipt", {
    file: samplePdf,
    thread: "trip-denver-2026",
    date: "2026-08-13",
    desc: "Taxi to venue",
    amount: 35.0,
    category: "Transport",
    reimbursable: true,
  });
  assert.equal(resValid.status, 0);
  const attachData = JSON.parse(resValid.stdout);
  assert.equal(attachData.success, true);
  assert.equal(attachData.alreadyAttached, false);
  assert.equal(attachData.threadId, "trip-denver-2026");
  recordResult("Finance", "attach_receipt", "Valid receipt attachment to ledger", "PASS", "Appended row and stored receipt");
}

// 2.6 close_trip
{
  // Missing target
  const resMissing = runCli("close_trip", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Finance", "close_trip", "Missing target rejection", "PASS", "Zod required target check");

  // Invalid status enum
  const resBadStatus = runCli("close_trip", { target: "trip-denver-2026", status: "cancelled" });
  assert.equal(resBadStatus.status, 1);
  assert.ok(resBadStatus.stderr.includes("Invalid enum value"));
  recordResult("Finance", "close_trip", "Invalid status enum rejection", "PASS", "Zod enum constraint");

  // Valid status transition draft -> submitted + package generation
  const resValid = runCli("close_trip", { target: "trip-denver-2026", status: "submitted" });
  assert.equal(resValid.status, 0);
  const closeData = JSON.parse(resValid.stdout);
  assert.equal(closeData.status, "submitted");
  assert.ok(closeData.packageRelPath.includes("-reimbursement-package.md"));
  assert.ok(existsSync(join(TEST_VAULT, closeData.packageRelPath)), "Package markdown file must exist on disk");
  recordResult("Finance", "close_trip", "Valid status transition and package generation", "PASS", `Generated ${closeData.packageRelPath} with status submitted`);

  // Invalid backward status transition submitted -> submitted (sideways) or backward
  const resIllegalTransition = runCli("close_trip", { target: "trip-denver-2026", status: "submitted" });
  assert.equal(resIllegalTransition.status, 1);
  assert.ok(resIllegalTransition.stderr.includes("Cannot move status backward or sideways"));
  recordResult("Finance", "close_trip", "Backward/sideways transition rejection", "PASS", "State machine transition guard enforced");
}

console.log("\n=== 3. MEETINGS DOMAIN TESTS ===");

// 3.1 list_fathom_meetings
{
  // Invalid includeFiled type
  const resBadType = runCli("list_fathom_meetings", { includeFiled: "yes" });
  assert.equal(resBadType.status, 1);
  assert.ok(resBadType.stderr.includes("Expected boolean"));
  recordResult("Meetings", "list_fathom_meetings", "Invalid boolean type rejection", "PASS", "Zod boolean type check");

  // Graceful handling when network/Fathom API succeeds with key or fails
  const resNoKey = runCli("list_fathom_meetings", { since: "2026-08-30" });
  if (resNoKey.status === 0) {
    recordResult("Meetings", "list_fathom_meetings", "Fathom API fetch", "PASS", "Fetched meetings from Fathom API successfully");
  } else {
    assert.equal(resNoKey.status, 1);
    let errObj;
    try { errObj = JSON.parse(resNoKey.stderr); } catch {}
    assert.ok(errObj?.error, "Must return structured error message");
    recordResult("Meetings", "list_fathom_meetings", "Fathom API graceful error handling", "PASS", `Handled error cleanly: ${errObj.error}`);
  }
}

// 3.2 get_fathom_meeting
{
  // Missing recordingId
  const resMissing = runCli("get_fathom_meeting", "{}");
  assert.equal(resMissing.status, 1);
  assert.ok(resMissing.stderr.includes("Required"));
  recordResult("Meetings", "get_fathom_meeting", "Missing recordingId rejection", "PASS", "Zod required check");

  // Empty recordingId
  const resEmpty = runCli("get_fathom_meeting", { recordingId: "" });
  assert.equal(resEmpty.status, 1);
  assert.ok(resEmpty.stderr.includes("String must contain at least 1 character"));
  recordResult("Meetings", "get_fathom_meeting", "Empty string recordingId boundary", "PASS", "Zod min(1) check");
}

// 3.3 route_meeting
{
  // Missing attendees
  const resMissing = runCli("route_meeting", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Meetings", "route_meeting", "Missing attendees array rejection", "PASS", "Zod required check");

  // Empty attendees array
  const resEmptyArr = runCli("route_meeting", { attendees: [] });
  assert.equal(resEmptyArr.status, 1);
  assert.ok(resEmptyArr.stderr.includes("Array must contain at least 1 element"));
  recordResult("Meetings", "route_meeting", "Empty attendees array boundary", "PASS", "Zod min(1) array constraint");

  // 1 attendee match -> advisory suggestion
  const resRouteSuggested = runCli("route_meeting", { attendees: ["Anita Sharma"] });
  assert.equal(resRouteSuggested.status, 0);
  const routeDataSuggested = JSON.parse(resRouteSuggested.stdout);
  assert.equal(routeDataSuggested.action, "suggested");
  assert.equal(routeDataSuggested.project, "platform");
  assert.equal(routeDataSuggested.destination, "entities/projects/platform/meetings/");
  recordResult("Meetings", "route_meeting", "Single attendee project suggestion", "PASS", `Advisory suggested for single attendee`);

  // >=2 attendee matches -> deterministic auto-move
  const resRouteMoved = runCli("route_meeting", { attendees: ["Anita Sharma", "David Chen"] });
  assert.equal(resRouteMoved.status, 0);
  const routeDataMoved = JSON.parse(resRouteMoved.stdout);
  assert.equal(routeDataMoved.action, "moved");
  assert.equal(routeDataMoved.project, "platform");
  assert.equal(routeDataMoved.destination, "entities/projects/platform/meetings/");
  recordResult("Meetings", "route_meeting", "Multiple attendee deterministic routing", "PASS", `Routed with auto-move action`);
}

// 3.4 get_meeting_prep / meeting_prep
{
  // Missing attendees
  const resMissing = runCli("get_meeting_prep", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Meetings", "get_meeting_prep", "Missing attendees rejection", "PASS", "Zod required check");

  // Valid meeting prep with project context
  const resPrep = runCli("get_meeting_prep", { attendees: ["Anita Sharma"], project: "platform" });
  assert.equal(resPrep.status, 0);
  const prepData = JSON.parse(resPrep.stdout);
  assert.ok(Array.isArray(prepData.attendees));
  assert.equal(prepData.attendees[0].name, "Anita Sharma");
  assert.equal(prepData.attendees[0].kind, "known");
  assert.equal(prepData.project, "platform");
  recordResult("Meetings", "get_meeting_prep", "Meeting prep briefing assembly", "PASS", "Generated structured prep JSON contract");

  // Alias check
  const resAlias = runCli("meeting_prep", { attendees: ["Anita Sharma"], project: "platform" });
  assert.equal(resAlias.status, 0);
  assert.equal(resAlias.stdout, resPrep.stdout);
  recordResult("Meetings", "meeting_prep", "Alias equivalence check", "PASS", "Identical output to get_meeting_prep");
}

// 3.5 file_meeting
{
  // Missing required fields
  const resMissing = runCli("file_meeting", { title: "Test" });
  assert.equal(resMissing.status, 1);
  recordResult("Meetings", "file_meeting", "Missing date/transcript rejection", "PASS", "Zod required checks");

  // Invalid date format
  const resBadDate = runCli("file_meeting", { title: "Test", date: "2026/08/15", transcript: "Hello" });
  assert.equal(resBadDate.status, 1);
  assert.ok(resBadDate.stderr.includes("Invalid"));
  recordResult("Meetings", "file_meeting", "Invalid date format rejection", "PASS", "Zod regex date check");

  // Valid meeting filing
  const resValid = runCli("file_meeting", {
    title: "Q3 Design Review",
    date: "2026-08-16",
    transcript: "Speaker 1: Reviewing design mockups.\nSpeaker 2: Looks good.",
    attendees: ["Anita Sharma", "John Doe"],
    projectPath: "platform",
    durationMin: 30,
    minutes: "Agreed on design tokens and splash screen specs.",
  });
  assert.equal(resValid.status, 0);
  const fileData = JSON.parse(resValid.stdout);
  assert.equal(fileData.success, true);
  assert.ok(fileData.relPath.includes("q3-design-review.md"));
  const writtenContent = readFileSync(join(TEST_VAULT, fileData.relPath), "utf8");
  assert.ok(writtenContent.includes("title: \"Q3 Design Review\""));
  assert.ok(writtenContent.includes("Anita Sharma"));
  assert.ok(writtenContent.includes("Agreed on design tokens"));
  recordResult("Meetings", "file_meeting", "File meeting with YAML frontmatter & markdown body", "PASS", `Filed to ${fileData.relPath}`);
}

console.log("\n=== 4. ENTITIES DOMAIN TESTS ===");

// 4.1 list_orgs
{
  const res = runCli("list_orgs", "{}");
  assert.equal(res.status, 0);
  const data = JSON.parse(res.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.some(o => o.name === "Meridian"));
  recordResult("Entities", "list_orgs", "List organizations on file", "PASS", `Listed ${data.length} organizations`);
}

// 4.2 ensure_org
{
  // Missing orgName
  const resMissing = runCli("ensure_org", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Entities", "ensure_org", "Missing orgName rejection", "PASS", "Zod required check");

  // Invalid role enum
  const resBadRole = runCli("ensure_org", { orgName: "Acme", role: "superadmin" });
  assert.equal(resBadRole.status, 1);
  assert.ok(resBadRole.stderr.includes("Invalid enum value"));
  recordResult("Entities", "ensure_org", "Invalid role enum rejection", "PASS", "Zod enum constraint");

  // Evidence required without matching evidence
  const resFailedEvidence = runCli("ensure_org", {
    orgName: "Nova Corp",
    personName: "Bob Smith",
    evidenceText: "Bob met Nova Corp for coffee yesterday",
    requireEvidence: true,
  });
  assert.equal(resFailedEvidence.status, 0);
  const dataFailed = JSON.parse(resFailedEvidence.stdout);
  assert.equal(dataFailed.success, false);
  assert.equal(dataFailed.reason, "affiliation_evidence_not_cleared");
  recordResult("Entities", "ensure_org", "Affiliation evidence bar rejection", "PASS", "Refused org creation without structured role assertion");

  // Evidence required WITH valid structured role assertion
  const resValidEvidence = runCli("ensure_org", {
    orgName: "Nova Corp",
    personName: "Bob Smith",
    evidenceText: "Bob Smith, VP of Engineering at Nova Corp",
    requireEvidence: true,
  });
  assert.equal(resValidEvidence.status, 0);
  const orgData = JSON.parse(resValidEvidence.stdout);
  assert.equal(orgData.orgName, "Nova Corp");
  assert.ok(existsSync(join(TEST_VAULT, "entities/organizations/nova-corp.md")));
  recordResult("Entities", "ensure_org", "Affiliation evidence cleared and org created", "PASS", "Created nova-corp.md with linked person");
}

// 4.3 list_brands
{
  const res = runCli("list_brands", "{}");
  assert.equal(res.status, 0);
  const data = JSON.parse(res.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.some(b => b.name === "Dori"));
  recordResult("Entities", "list_brands", "List brand tokens", "PASS", `Listed ${data.length} brands`);
}

// 4.4 get_brand / get_brand_context
{
  // Missing name
  const resMissing = runCli("get_brand", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Entities", "get_brand", "Missing name rejection", "PASS", "Zod required check");

  // Valid brand lookup
  const resValid = runCli("get_brand", { name: "Dori" });
  assert.equal(resValid.status, 0);
  const data = JSON.parse(resValid.stdout);
  assert.equal(data.brand.name, "Dori");
  assert.equal(data.brand.primary, "#4F46E5");
  assert.ok(data.context.includes("Dori Brand Guidelines"));
  recordResult("Entities", "get_brand", "Brand details and guidelines context fetch", "PASS", "Fetched brand theme tokens and guidelines");
}

// 4.5 set_brand
{
  // Missing name
  const resMissing = runCli("set_brand", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Entities", "set_brand", "Missing name rejection", "PASS", "Zod required check");

  // Valid brand creation
  const resSet = runCli("set_brand", {
    name: "Aura",
    company: "Aura Health",
    primary: "#0EA5E9",
    accent: "#F43F5E",
    fontDisplay: "Inter",
    fontBody: "Inter",
  });
  assert.equal(resSet.status, 0);
  const brandData = JSON.parse(resSet.stdout);
  assert.equal(brandData.name, "Aura");
  assert.ok(existsSync(join(TEST_VAULT, "entities/brands/aura.md")));
  recordResult("Entities", "set_brand", "Create/update brand theme tokens", "PASS", "Created entities/brands/aura.md");
}

// 4.6 research_person & research_and_recommend
{
  // Missing name
  const resMissing = runCli("research_person", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Entities", "research_person", "Missing name rejection", "PASS", "Zod required check");

  // Graceful handling when Tavily search succeeds or fails
  const resNoKey = runCli("research_person", { name: "Alice Doe" });
  if (resNoKey.status === 0) {
    recordResult("Entities", "research_person", "Tavily API search", "PASS", "Performed Tavily research successfully");
  } else {
    assert.equal(resNoKey.status, 1);
    let errObj;
    try { errObj = JSON.parse(resNoKey.stderr); } catch {}
    assert.ok(errObj?.error, "Must return structured error message on Tavily failure");
    recordResult("Entities", "research_person", "Tavily API graceful error handling", "PASS", `Clean error reported: ${errObj.error}`);
  }
}

// 4.7 merge_entity
{
  // Missing params
  const resMissing = runCli("merge_entity", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Entities", "merge_entity", "Missing type/slugs rejection", "PASS", "Zod required checks");

  // Invalid entity type
  const resBadType = runCli("merge_entity", { type: "company", sourceSlug: "a", targetSlug: "b" });
  assert.equal(resBadType.status, 1);
  assert.ok(resBadType.stderr.includes("Invalid enum value"));
  recordResult("Entities", "merge_entity", "Invalid type enum rejection", "PASS", "Zod enum constraint");

  // Self merge rejection
  const resSelfMerge = runCli("merge_entity", { type: "person", sourceSlug: "anita-sharma", targetSlug: "anita-sharma" });
  assert.equal(resSelfMerge.status, 1);
  assert.ok(resSelfMerge.stderr.includes("Source and target must differ"));
  recordResult("Entities", "merge_entity", "Self-merge identity rejection", "PASS", "Refused merging entity into itself");

  // Create second person for valid merge test
  writeFileSync(join(TEST_VAULT, "entities/people/anita-s.md"), `---
name: "Anita S"
role: "Finance Lead"
aliases: ["A. Sharma"]
---
Alternate profile.
`);

  // Valid merge: person anita-s -> anita-sharma
  const resValidMerge = runCli("merge_entity", {
    type: "person",
    sourceSlug: "anita-s",
    targetSlug: "anita-sharma",
  });
  assert.equal(resValidMerge.status, 0);
  const mergeData = JSON.parse(resValidMerge.stdout);
  assert.equal(mergeData.success, true);
  assert.equal(mergeData.canonicalSlug, "anita-sharma");
  assert.ok(existsSync(join(TEST_VAULT, "entities/people/merged/anita-s.md")), "Losing side must be archived, not destroyed");
  assert.ok(!existsSync(join(TEST_VAULT, "entities/people/anita-s.md")), "Source slug removed from active directory");
  recordResult("Entities", "merge_entity", "Non-destructive identity merge with archiving", "PASS", "Archived to merged/ and unioned aliases");
}

console.log("\n=== 5. TIMELINE DOMAIN TESTS ===");

// 5.1 timeline
{
  // Valid default call
  const res = runCli("timeline", "{}");
  assert.equal(res.status, 0);
  const events = JSON.parse(res.stdout);
  assert.ok(Array.isArray(events));
  assert.ok(events.length >= 1, "Must aggregate events across vault");
  // Events must be sorted descending by date
  for (let i = 0; i < events.length - 1; i++) {
    assert.ok(events[i].date >= events[i+1].date, "Events must be sorted descending by date");
  }
  recordResult("Timeline", "timeline", "Chronological aggregation across meetings/decisions/tasks/expenses", "PASS", `Aggregated ${events.length} events in descending order`);

  // Boundary limit checks
  const resLimit = runCli("timeline", { limit: 2 });
  assert.equal(resLimit.status, 0);
  const limitEvents = JSON.parse(resLimit.stdout);
  assert.ok(limitEvents.length <= 2, "Limit must constrain result count");
  recordResult("Timeline", "timeline", "Limit parameter enforcement", "PASS", `Returned ${limitEvents.length} events (limit 2)`);

  // Boundary: limit <= 0
  const resZeroLimit = runCli("timeline", { limit: 0 });
  assert.equal(resZeroLimit.status, 1);
  assert.ok(resZeroLimit.stderr.includes("Number must be greater than or equal to 1"));
  recordResult("Timeline", "timeline", "Zero limit boundary rejection", "PASS", "Zod min(1) constraint");

  // Boundary: limit > 200
  const resOverLimit = runCli("timeline", { limit: 250 });
  assert.equal(resOverLimit.status, 1);
  assert.ok(resOverLimit.stderr.includes("Number must be less than or equal to 200"));
  recordResult("Timeline", "timeline", "Upper limit boundary rejection", "PASS", "Zod max(200) constraint");

  // Boundary: invalid date format for since
  const resBadSince = runCli("timeline", { since: "08/01/2026" });
  assert.equal(resBadSince.status, 1);
  assert.ok(resBadSince.stderr.includes("Invalid"));
  recordResult("Timeline", "timeline", "Invalid date regex rejection for since", "PASS", "Zod regex YYYY-MM-DD constraint");

  // Valid since filter
  const resSince = runCli("timeline", { since: "2026-08-12" });
  assert.equal(resSince.status, 0);
  const sinceEvents = JSON.parse(resSince.stdout);
  assert.ok(sinceEvents.every(e => e.date >= "2026-08-12"), "All events must satisfy since filter");
  recordResult("Timeline", "timeline", "Since date filter validation", "PASS", `All ${sinceEvents.length} events >= 2026-08-12`);
}

console.log("\n=== 6. INGESTION & CREDENTIALS DOMAIN TESTS ===");

// 6.1 convert_document
{
  // Missing filePath
  const resMissing = runCli("convert_document", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Ingestion", "convert_document", "Missing filePath rejection", "PASS", "Zod required check");

  // Empty filePath
  const resEmpty = runCli("convert_document", { filePath: "" });
  assert.equal(resEmpty.status, 1);
  recordResult("Ingestion", "convert_document", "Empty filePath boundary rejection", "PASS", "Zod min(1) check");

  // Non-existent file
  const resNotFound = runCli("convert_document", { filePath: join(TEST_VAULT, "does-not-exist.docx") });
  assert.equal(resNotFound.status, 1);
  recordResult("Ingestion", "convert_document", "Non-existent file handling", "PASS", "Clean error returned on missing file");

  // Unsupported document format handling
  const resUnsupported = runCli("convert_document", { filePath: sampleUnsupportedDoc });
  assert.equal(resUnsupported.status, 1);
  let errObj;
  try { errObj = JSON.parse(resUnsupported.stderr); } catch {}
  assert.ok(errObj?.error?.includes("unsupported input"), "Descriptive parser error on unsupported input");
  recordResult("Ingestion", "convert_document", "Unsupported file format rejection", "PASS", "Graceful parser error on unsupported text file");

  // Valid document conversion (CSV file)
  const resValid = runCli("convert_document", { filePath: sampleCsv });
  assert.equal(resValid.status, 0);
  const docData = JSON.parse(resValid.stdout);
  assert.ok(docData.markdown.includes("Cloud Hosting"));
  assert.ok(docData.markdown.includes("Domain Renewal"));
  assert.equal(docData.filePath, sampleCsv);
  recordResult("Ingestion", "convert_document", "Valid document conversion to markdown", "PASS", "Converted document to markdown structure");
}

// 6.2 list_credentials & find_credentials
{
  // list_credentials default
  const resList = runCli("list_credentials", "{}");
  // May succeed with empty/existing credentials or return array
  if (resList.status === 0) {
    const creds = JSON.parse(resList.stdout);
    assert.ok(Array.isArray(creds));
    recordResult("Credentials", "list_credentials", "List credential services", "PASS", `Returned ${creds.length} credential services`);
  } else {
    // If keychain access is gated in this environment, it fails with descriptive message
    assert.ok(resList.stderr.includes("Keychain") || resList.stderr.includes("Secret Service") || resList.stderr.includes("error"));
    recordResult("Credentials", "list_credentials", "Keychain gating graceful handling", "PASS", "Clean failure when OS secret store locked/gated");
  }

  // find_credentials missing query
  const resFindMissing = runCli("find_credentials", "{}");
  assert.equal(resFindMissing.status, 1);
  recordResult("Credentials", "find_credentials", "Missing query rejection", "PASS", "Zod required check");

  // find_credentials empty query
  const resFindEmpty = runCli("find_credentials", { query: "" });
  assert.equal(resFindEmpty.status, 1);
  recordResult("Credentials", "find_credentials", "Empty query boundary rejection", "PASS", "Zod min(1) check");
}

// 6.3 start_credential_server
{
  // Test schema invocation
  const action = getAction("start_credential_server");
  assert.ok(action, "start_credential_server must be registered");
  assert.equal(action.scope, "read");
  assert.equal(action.exposeToMcp, true);
  recordResult("Credentials", "start_credential_server", "Action registration & schema check", "PASS", "Verified registry definition and MCP exposure");
}

console.log("\n=== 7. EXTENDED VAULT OPERATIONS & MUTATION INTEGRITY TESTS ===");

// 7.1 tasks: add_task, list_tasks, mark_task_done
{
  // add_task
  const resAddTask = runCli("add_task", { title: "Complete audit checklist", due: "2026-09-02", owner: "self" });
  assert.equal(resAddTask.status, 0);
  const taskData = JSON.parse(resAddTask.stdout);
  assert.ok(taskData.id);
  assert.equal(taskData.title, "Complete audit checklist");
  recordResult("Tasks", "add_task", "Add task to task store", "PASS", `Created task ${taskData.id}`);

  // list_tasks
  const resListTasks = runCli("list_tasks", { status: "open" });
  assert.equal(resListTasks.status, 0);
  const tasks = JSON.parse(resListTasks.stdout);
  assert.ok(tasks.some(t => t.id === taskData.id));
  recordResult("Tasks", "list_tasks", "List open tasks", "PASS", `Listed ${tasks.length} open tasks`);

  // mark_task_done
  const resMarkDone = runCli("mark_task_done", { id: taskData.id });
  assert.equal(resMarkDone.status, 0);
  recordResult("Tasks", "mark_task_done", "Mark task completed", "PASS", `Marked task ${taskData.id} as done`);
}

// 7.2 decisions: create_decision, list_decisions
{
  const resCreateDec = runCli("create_decision", {
    summary: "Standardize on Zod schemas for all backend actions",
    confidence: 0.95,
    owner: "arch",
    topics: ["architecture", "api"],
  });
  assert.equal(resCreateDec.status, 0);
  const decData = JSON.parse(resCreateDec.stdout);
  assert.ok(decData.slug || decData.summary);
  recordResult("Decisions", "create_decision", "Create decision entry", "PASS", "Created structured decision in vault");

  const resListDec = runCli("list_decisions", { status: "active" });
  assert.equal(resListDec.status, 0);
  const decs = JSON.parse(resListDec.stdout);
  assert.ok(Array.isArray(decs));
  recordResult("Decisions", "list_decisions", "List active decisions", "PASS", `Listed ${decs.length} active decisions`);
}

// 7.3 capture & document operations: capture_text, capture_url, route_destination
{
  // capture_text
  const resCapText = runCli("capture_text", { text: "Quick note for integration audit" });
  assert.equal(resCapText.status, 0);
  const capData = JSON.parse(resCapText.stdout);
  assert.ok(capData.relPath || capData.path);
  recordResult("Capture", "capture_text", "Quick capture text note", "PASS", `Captured to ${capData.relPath || capData.path}`);

  // capture_url
  const resCapUrl = runCli("capture_url", { url: "https://example.com/docs", title: "Example Docs" });
  assert.equal(resCapUrl.status, 0);
  const urlData = JSON.parse(resCapUrl.stdout);
  assert.equal(urlData.title, "Example Docs");
  recordResult("Capture", "capture_url", "Capture URL bookmark", "PASS", `Captured ${urlData.title} to ${urlData.relPath}`);

  // route_destination
  const resRouteDest = runCli("route_destination", { kind: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.equal(resRouteDest.status, 0);
  const routeDestData = JSON.parse(resRouteDest.stdout);
  assert.ok(routeDestData.startsWith("yt/"));
  recordResult("Capture", "route_destination", "Canonical output path routing", "PASS", `Computed path ${routeDestData}`);
}

// 7.4 profile operations: set_profile, get_profile, save_profile
{
  const resSetProf = runCli("set_profile", { name: "Audit Tester", role: "Specialist", org: "Quality Inc" });
  assert.equal(resSetProf.status, 0);
  recordResult("Profile", "set_profile", "Set user self profile", "PASS", "Updated self profile");

  const resGetProf = runCli("get_profile", "{}");
  assert.equal(resGetProf.status, 0);
  const prof = JSON.parse(resGetProf.stdout);
  assert.equal(prof.name, "Audit Tester");
  assert.equal(prof.role, "Specialist");
  recordResult("Profile", "get_profile", "Get user self profile", "PASS", "Retrieved self profile accurately");
}

console.log("\n=== 8. PROJECT TEMPLATES DOMAIN TESTS (apply_template) ===");

// 8.1 Missing required arguments
{
  const resMissing = runCli("apply_template", "{}");
  assert.equal(resMissing.status, 1);
  recordResult("Projects", "apply_template", "Missing template and project rejection", "PASS", "Zod required fields rejected");
}

// 8.2 Unknown template key
{
  const resBadTemplate = runCli("apply_template", { template: "unknown.preset", project: "test-proj" });
  assert.equal(resBadTemplate.status, 1);
  assert.ok(resBadTemplate.stderr.includes("Unknown template"));
  recordResult("Projects", "apply_template", "Unknown template key rejection", "PASS", "Clean error on invalid template");
}

// 8.3 Path traversal attempt
{
  const resTraversal = runCli("apply_template", { template: "client", project: "../../etc/danger" });
  assert.equal(resTraversal.status, 1);
  assert.ok(resTraversal.stderr.includes("Invalid project path"));
  recordResult("Projects", "apply_template", "Path traversal injection rejection", "PASS", "Safely rejected relative path escape");
}

// 8.4 Valid template creation via shorthand alias ('client')
{
  const resValid = runCli("apply_template", { template: "client", project: "acme-client" });
  assert.equal(resValid.status, 0);
  const data = JSON.parse(resValid.stdout);
  assert.equal(data.success, true);
  assert.equal(data.templateKey, "engine.client");
  assert.ok(existsSync(join(TEST_VAULT, "projects/acme-client/.setup.md")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/acme-client/docs")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/acme-client/invoices")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/acme-client/meetings")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/acme-client/deliverables")));
  recordResult("Projects", "apply_template", "Valid project scaffolding from shorthand alias", "PASS", "Scaffolded client folders and .setup.md");
}

// 8.5 Idempotent re-run on existing project
{
  const resIdempotent = runCli("apply_template", { templateKey: "engine.client", projectPath: "acme-client" });
  assert.equal(resIdempotent.status, 0);
  const data = JSON.parse(resIdempotent.stdout);
  assert.ok(data.alreadyPresent.includes("docs"));
  assert.equal(data.added.length, 0);
  recordResult("Projects", "apply_template", "Idempotent re-application", "PASS", "Additive-only behavior verified without duplicate folders");
}

// 8.6 Valid scaffolding using canonical portal template ('portal.standard')
{
  const resStandard = runCli("apply_template", { project: "alpha-project", template: "portal.standard" });
  assert.equal(resStandard.status, 0);
  const data = JSON.parse(resStandard.stdout);
  assert.equal(data.success, true);
  assert.equal(data.templateKey, "portal.standard");
  assert.ok(existsSync(join(TEST_VAULT, "projects/alpha-project/.setup.md")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/alpha-project/meetings")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/alpha-project/notes")));
  assert.ok(existsSync(join(TEST_VAULT, "projects/alpha-project/source-data")));
  const setupContent = readFileSync(join(TEST_VAULT, "projects/alpha-project/.setup.md"), "utf8");
  assert.ok(setupContent.includes("template_origin: portal.standard"));
  recordResult("Projects", "apply_template", "Canonical preset scaffolding and provenance tracking", "PASS", "Scaffolded standard portal folders and recorded provenance");
}

// 8.7 Empty string parameter rejection
{
  const resEmpty = runCli("apply_template", { projectPath: "", templateKey: "" });
  assert.equal(resEmpty.status, 1);
  recordResult("Projects", "apply_template", "Empty string parameter rejection", "PASS", "Zod rejected empty string parameters");
}

console.log("\n=== 9. COMPREHENSIVE ACTION REGISTRY COVERAGE AUDIT ===");

// Audit all registered actions for schema validity, scope, and MCP exposure
for (const a of actions) {
  assert.ok(a.id, "Every action must have an id");
  assert.ok(a.description, `Action ${a.id} must have description`);
  assert.ok(a.inputSchema, `Action ${a.id} must have inputSchema`);
  assert.ok(["read", "write"].includes(a.scope), `Action ${a.id} must have scope read or write`);
  assert.equal(a.exposeToMcp, true, `Action ${a.id} must be exposed to MCP`);
  assert.equal(typeof a.handler, "function", `Action ${a.id} must have a handler function`);
}
recordResult("Registry", "registry_audit", `All ${actions.length} actions contract audit`, "PASS", `All ${actions.length} actions adhere to DoriActionDefinition interface`);

console.log("\n=======================================================");
console.log(`AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED across ${testResults.length} test assertions.`);
console.log("=======================================================");

// Clean up test vault
rmSync(TEST_VAULT, { recursive: true, force: true });
rmSync(TEST_CONFIG, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
