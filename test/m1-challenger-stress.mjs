#!/usr/bin/env node
/**
 * Empirical Challenger Stress & Adversarial Test Suite for Milestone 1
 * Focus: apply_template robustness, action registry schema fuzzing,
 * and api.js client adapter parameter polymorphism & safety.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { actions, getAction } from "../actions.mjs";
import { api } from "../electron-app/src/lib/api.js";

const ROOT = resolve(process.cwd());
const TEST_VAULT = join(ROOT, ".test-vault-challenger");
const TEST_CONFIG = join(ROOT, ".test-config-challenger");
const TEST_DB = join(TEST_VAULT, "portal.db");

console.log("=== EMPIRICAL CHALLENGER STRESS HARNESS (M1) ===");

// Setup sandbox environment
if (existsSync(TEST_VAULT)) rmSync(TEST_VAULT, { recursive: true, force: true });
if (existsSync(TEST_CONFIG)) rmSync(TEST_CONFIG, { recursive: true, force: true });

mkdirSync(TEST_VAULT, { recursive: true });
mkdirSync(join(TEST_VAULT, "projects"), { recursive: true });
mkdirSync(join(TEST_VAULT, "finances/trips"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/people"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/organizations"), { recursive: true });
mkdirSync(join(TEST_VAULT, "entities/brands"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/tasks/records"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/clarifications"), { recursive: true });
mkdirSync(join(TEST_VAULT, ".dori/decisions"), { recursive: true });
mkdirSync(join(TEST_VAULT, "inbox"), { recursive: true });
mkdirSync(TEST_CONFIG, { recursive: true });

// Seed a trip ledger
writeFileSync(
  join(TEST_VAULT, "finances/trips/2026-audit.md"),
  `---
type: reimbursement
threadId: trip-audit-2026
trip: "Audit Conf 2026"
account: "acme-corp"
status: draft
---
# Audit Ledger
| Date | Description | Category | Amount | Tax | Payer | Reimbursable | Attachment |
|------|-------------|----------|--------|-----|-------|---------------|------------|
| 2026-08-20 | Flight | Transport | 300.00 | 30.00 | self | yes | — |
`
);

// Seed documents for save_document and get_document
writeFileSync(join(TEST_VAULT, "inbox/doc1.md"), "# Original Doc 1\n");
writeFileSync(join(TEST_VAULT, "inbox/doc2.md"), "# Original Doc 2\n");

const env = {
  ...process.env,
  VAULT_ROOT: TEST_VAULT,
  DORI_CONFIG_DIR: TEST_CONFIG,
  VAULT_INDEX_DB: TEST_DB,
  PORTAL_DB_PATH: TEST_DB,
  FATHOM_API_KEY: "mock_key_for_testing",
};

let passed = 0;
let failed = 0;
const testRecords = [];

function record(section, title, fn) {
  try {
    fn();
    passed++;
    testRecords.push({ section, title, status: "PASS" });
    console.log(`  [PASS] ${section} :: ${title}`);
  } catch (err) {
    failed++;
    testRecords.push({ section, title, status: "FAIL", error: err.message });
    console.error(`  [FAIL] ${section} :: ${title} -> ${err.message}`);
  }
}

async function asyncRecord(section, title, fn) {
  try {
    await fn();
    passed++;
    testRecords.push({ section, title, status: "PASS" });
    console.log(`  [PASS] ${section} :: ${title}`);
  } catch (err) {
    failed++;
    testRecords.push({ section, title, status: "FAIL", error: err.message });
    console.error(`  [FAIL] ${section} :: ${title} -> ${err.message}`);
  }
}

function runCli(actionId, payload) {
  const args = ["actions.mjs", "run", actionId];
  if (payload !== undefined) {
    args.push(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  const res = spawnSync("node", args, { cwd: ROOT, env, encoding: "utf8" });
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    json: () => {
      try { return JSON.parse(res.stdout); } catch { return null; }
    },
    errorJson: () => {
      try { return JSON.parse(res.stderr); } catch { return null; }
    }
  };
}

console.log("\n--- SECTION 1: ADVERSARIAL STRESS ON apply_template ---");

// 1.1 Fuzzing invalid payloads
record("apply_template", "reject null payload", () => {
  const res = runCli("apply_template", "null");
  assert.equal(res.status, 1);
});

record("apply_template", "reject array payload", () => {
  const res = runCli("apply_template", "[1, 2, 3]");
  assert.equal(res.status, 1);
});

record("apply_template", "reject number primitive payload", () => {
  const res = runCli("apply_template", "9999");
  assert.equal(res.status, 1);
});

record("apply_template", "reject boolean primitive payload", () => {
  const res = runCli("apply_template", "true");
  assert.equal(res.status, 1);
});

record("apply_template", "reject empty object payload", () => {
  const res = runCli("apply_template", "{}");
  assert.equal(res.status, 1);
});

record("apply_template", "reject missing project", () => {
  const res = runCli("apply_template", { template: "engine.software" });
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes("project"));
});

record("apply_template", "reject missing template", () => {
  const res = runCli("apply_template", { project: "my-project" });
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes("template"));
});

record("apply_template", "reject whitespace-only template key", () => {
  const res = runCli("apply_template", { template: "   ", project: "my-project" });
  assert.equal(res.status, 1);
});

record("apply_template", "reject whitespace-only project name", () => {
  const res = runCli("apply_template", { template: "engine.software", project: "   " });
  assert.equal(res.status, 1);
});

record("apply_template", "reject unknown template name", () => {
  const res = runCli("apply_template", { template: "non.existent.template", project: "my-proj" });
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes("Unknown template"));
});

// 1.2 Path traversal and sanitization attacks
const pathTraversalAttacks = [
  "../secret",
  "../../etc/passwd",
  "projects/../../../etc/shadow",
  "foo/../../bar",
  "/absolute/path/escape/..",
  "..",
  "./..",
  "projects/..",
];

for (const maliciousPath of pathTraversalAttacks) {
  record("apply_template_security", `reject path traversal: "${maliciousPath}"`, () => {
    const res = runCli("apply_template", { template: "client", project: maliciousPath });
    assert.equal(res.status, 1);
    assert.ok(res.stderr.includes("Invalid project path") || res.stderr.includes("error"));
  });
}

// 1.3 Case insensitivity and shorthand aliases
const aliasTests = [
  { input: "software", expected: "engine.software", folders: ["docs", "notes", "source", "tests"] },
  { input: "SOFTWARE", expected: "engine.software", folders: ["docs", "notes", "source", "tests"] },
  { input: "client", expected: "engine.client", folders: ["docs", "invoices", "meetings", "deliverables"] },
  { input: "Client", expected: "engine.client", folders: ["docs", "invoices", "meetings", "deliverables"] },
  { input: "research", expected: "engine.research", folders: ["notes", "papers", "drafts", "references"] },
  { input: "default", expected: "engine.default", folders: ["docs", "notes", "references"] },
  { input: "standard", expected: "portal.standard", folders: ["meetings", "notes", "source-data"] },
  { input: "minimal", expected: "portal.minimal", folders: [] },
  { input: "full", expected: "portal.full", folders: ["meetings", "notes", "source-data", "research", "decisions", "content", "assets"] },
  { input: "engine.software", expected: "engine.software", folders: ["docs", "notes", "source", "tests"] },
  { input: "portal.standard", expected: "portal.standard", folders: ["meetings", "notes", "source-data"] },
];

for (const { input, expected, folders } of aliasTests) {
  record("apply_template_aliases", `resolve "${input}" -> "${expected}"`, () => {
    const projName = `proj-alias-${input.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const res = runCli("apply_template", { template: input, project: projName });
    assert.equal(res.status, 0, `Failed: ${res.stderr}`);
    const data = res.json();
    assert.equal(data.success, true);
    assert.equal(data.templateKey, expected);
    
    const projDir = join(TEST_VAULT, "projects", projName);
    assert.ok(existsSync(projDir));
    assert.ok(existsSync(join(projDir, ".setup.md")));
    
    const setupContent = readFileSync(join(projDir, ".setup.md"), "utf8");
    assert.ok(setupContent.includes(`template_origin: ${expected}`));

    for (const f of folders) {
      assert.ok(existsSync(join(projDir, f)), `Folder ${f} missing`);
    }
  });
}

// 1.4 Parameter polymorphism across property names in apply_template
const polyTests = [
  { payload: { templateKey: "engine.client", projectPath: "poly-1" }, desc: "templateKey + projectPath" },
  { payload: { templateName: "engine.software", targetDir: "poly-2" }, desc: "templateName + targetDir" },
  { payload: { template: "engine.default", target: "poly-3" }, desc: "template + target" },
  { payload: { templateKey: "portal.minimal", project: "poly-4" }, desc: "templateKey + project" },
  { payload: { template: "client", targetDir: "nested/sub/poly-5", vars: { custom: "val" } }, desc: "nested path + vars" },
];

for (const { payload, desc } of polyTests) {
  record("apply_template_poly", `polymorphism: ${desc}`, () => {
    const res = runCli("apply_template", payload);
    assert.equal(res.status, 0, `Failed for ${desc}: ${res.stderr}`);
    const data = res.json();
    assert.equal(data.success, true);
  });
}

// 1.5 Additive-only / Non-destructive behavior
record("apply_template_integrity", "additive-only non-destructive scaffolding", () => {
  const projName = "additive-safety-test";
  const projDir = join(TEST_VAULT, "projects", projName);
  mkdirSync(join(projDir, "docs"), { recursive: true });
  writeFileSync(join(projDir, "docs/custom-readme.md"), "# Custom Content Never Deleted", "utf8");
  writeFileSync(join(projDir, ".setup.md"), "---\nproject: \"Custom Title\"\nstatus: active\n---\n# Custom Title\n", "utf8");

  const res = runCli("apply_template", { template: "software", project: projName });
  assert.equal(res.status, 0);
  const data = res.json();
  assert.equal(data.success, true);
  assert.ok(data.alreadyPresent.includes("docs"));
  assert.ok(data.added.includes("source"));

  const customContent = readFileSync(join(projDir, "docs/custom-readme.md"), "utf8");
  assert.equal(customContent, "# Custom Content Never Deleted");

  const updatedSetup = readFileSync(join(projDir, ".setup.md"), "utf8");
  assert.ok(updatedSetup.includes('project: "Custom Title"'));
  assert.ok(updatedSetup.includes('template_origin: engine.software'));
});

console.log("\n--- SECTION 2: SCHEMA FUZZING & ERROR HANDLING ON ACTIONS ---");

// 2.1 save_document
record("save_document", "reject missing path and relPath", () => {
  const res = runCli("save_document", { content: "some text" });
  assert.equal(res.status, 1);
});

record("save_document", "reject non-existent document", () => {
  const res = runCli("save_document", { path: "inbox/non-existent.md", content: "some text" });
  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes("Document not found"));
});

record("save_document", "support path and relPath alias on existing files", () => {
  const res1 = runCli("save_document", { path: "inbox/doc1.md", content: "Updated 1" });
  assert.equal(res1.status, 0);
  assert.equal(readFileSync(join(TEST_VAULT, "inbox/doc1.md"), "utf8"), "Updated 1");

  const res2 = runCli("save_document", { relPath: "inbox/doc2.md", content: "Updated 2" });
  assert.equal(res2.status, 0);
  assert.equal(readFileSync(join(TEST_VAULT, "inbox/doc2.md"), "utf8"), "Updated 2");
});

// 2.2 route_expense
record("route_expense", "support targetLedger alias", () => {
  const res = runCli("route_expense", { message: "Spent $50 on taxi", targetLedger: "trip-audit-2026" });
  assert.equal(res.status, 0);
  const data = res.json();
  assert.ok(data.action === "suggested" || data.action === "moved" || data.expense?.amount === 50);
});

record("route_expense", "support key alias", () => {
  const res = runCli("route_expense", { message: "Spent $75 on lunch", key: "trip-audit-2026" });
  assert.equal(res.status, 0);
  const data = res.json();
  assert.ok(data.action === "suggested" || data.action === "moved" || data.expense?.amount === 75);
});

// 2.3 add_task
record("add_task", "support dueDate alias", () => {
  const res = runCli("add_task", { title: "Test task alias", dueDate: "2026-09-30" });
  assert.equal(res.status, 0);
  const data = res.json();
  assert.ok(data.id || data.title);
});

record("add_task", "support due alias", () => {
  const res = runCli("add_task", { title: "Test task due", due: "2026-10-15" });
  assert.equal(res.status, 0);
  const data = res.json();
  assert.ok(data.id || data.title);
});

// 2.4 ensure_org
record("ensure_org", "reject missing orgName", () => {
  const res = runCli("ensure_org", {});
  assert.equal(res.status, 1);
});

// 2.5 close_trip
record("close_trip", "reject invalid status transitions", () => {
  const res = runCli("close_trip", { target: "trip-audit-2026", status: "invalid_status" });
  assert.equal(res.status, 1);
});

console.log("\n--- SECTION 3: PARAMETER POLYMORPHISM ON client api.js ---");

// Setup mock window.dori.call bridge
let lastCall = null;
const callHistory = [];

globalThis.window = {
  dori: {
    call: async (actionId, params) => {
      const entry = { actionId, params };
      lastCall = entry;
      callHistory.push(entry);
      return { mockSuccess: true, actionId, params };
    },
    getFilePath: (file) => file?.path || "/mock/path/" + (file?.name || "file.txt"),
    onOpenSettings: (cb) => { cb(); return () => {}; },
    onChatDelta: (cb) => { cb("chunk"); return () => {}; },
    closeMini: () => "closed",
  },
};

// 3.1 Documents & Vault
await asyncRecord("api_client", "getDocument: string path", async () => {
  await api.getDocument("notes/my-note.md");
  assert.equal(lastCall.actionId, "get_document");
  assert.equal(lastCall.params.path, "notes/my-note.md");
});

await asyncRecord("api_client", "getDocument: object { path }", async () => {
  await api.getDocument({ path: "notes/my-note2.md" });
  assert.equal(lastCall.actionId, "get_document");
  assert.equal(lastCall.params.path, "notes/my-note2.md");
});

await asyncRecord("api_client", "getDocument: object { relPath }", async () => {
  await api.getDocument({ relPath: "notes/my-note3.md" });
  assert.equal(lastCall.actionId, "get_document");
  assert.equal(lastCall.params.relPath, "notes/my-note3.md");
});

await asyncRecord("api_client", "saveDocument: path + content arguments", async () => {
  await api.saveDocument("notes/test.md", "# Test Content");
  assert.equal(lastCall.actionId, "save_document");
  assert.equal(lastCall.params.path, "notes/test.md");
  assert.equal(lastCall.params.content, "# Test Content");
});

await asyncRecord("api_client", "saveDocument: object { path, content }", async () => {
  await api.saveDocument({ path: "notes/test.md", content: "# Object Content" });
  assert.equal(lastCall.actionId, "save_document");
  assert.equal(lastCall.params.path, "notes/test.md");
  assert.equal(lastCall.params.content, "# Object Content");
});

await asyncRecord("api_client", "saveDocument: object { relPath, content }", async () => {
  await api.saveDocument({ relPath: "notes/test.md", content: "# RelPath Content" });
  assert.equal(lastCall.actionId, "save_document");
  assert.equal(lastCall.params.path, "notes/test.md");
  assert.equal(lastCall.params.content, "# RelPath Content");
});

await asyncRecord("api_client", "listDocuments: number limit", async () => {
  await api.listDocuments(50);
  assert.equal(lastCall.actionId, "list_documents");
  assert.equal(lastCall.params.limit, 50);
});

await asyncRecord("api_client", "listDocuments: object filter", async () => {
  await api.listDocuments({ limit: 25 });
  assert.equal(lastCall.actionId, "list_documents");
  assert.equal(lastCall.params.limit, 25);
});

await asyncRecord("api_client", "searchVault: string query", async () => {
  await api.searchVault("design review", 15);
  assert.equal(lastCall.actionId, "search_vault");
  assert.equal(lastCall.params.query, "design review");
  assert.equal(lastCall.params.limit, 15);
});

await asyncRecord("api_client", "searchVault: object { query, limit }", async () => {
  await api.searchVault({ query: "architecture", limit: 10 });
  assert.equal(lastCall.actionId, "search_vault");
  assert.equal(lastCall.params.query, "architecture");
  assert.equal(lastCall.params.limit, 10);
});

await asyncRecord("api_client", "convertDocument: string filePath", async () => {
  await api.convertDocument("uploads/spec.pdf");
  assert.equal(lastCall.actionId, "convert_document");
  assert.equal(lastCall.params.filePath, "uploads/spec.pdf");
});

await asyncRecord("api_client", "convertDocument: object { sourcePath }", async () => {
  await api.convertDocument({ sourcePath: "uploads/doc.docx" });
  assert.equal(lastCall.actionId, "convert_document");
  assert.equal(lastCall.params.filePath, "uploads/doc.docx");
});

await asyncRecord("api_client", "routeDestination: options object", async () => {
  await api.routeDestination({ kind: "youtube", url: "https://youtu.be/xyz" });
  assert.equal(lastCall.actionId, "route_destination");
  assert.equal(lastCall.params.kind, "youtube");
});

// 3.2 Quick Capture
await asyncRecord("api_client", "captureText: string", async () => {
  await api.captureText("Note to self");
  assert.equal(lastCall.actionId, "capture_text");
  assert.equal(lastCall.params.text, "Note to self");
});

await asyncRecord("api_client", "captureText: object { text }", async () => {
  await api.captureText({ text: "Note object" });
  assert.equal(lastCall.actionId, "capture_text");
  assert.equal(lastCall.params.text, "Note object");
});

await asyncRecord("api_client", "captureFile: object { sourcePath }", async () => {
  await api.captureFile({ sourcePath: "receipt.png" });
  assert.equal(lastCall.actionId, "capture_file");
  assert.equal(lastCall.params.sourcePath, "receipt.png");
});

await asyncRecord("api_client", "captureUrl: positional args and object payload", async () => {
  await api.captureUrl("https://example.com", "Example", "proj-a");
  assert.equal(lastCall.actionId, "capture_url");
  assert.equal(lastCall.params.url, "https://example.com");
  assert.equal(lastCall.params.title, "Example");
  assert.equal(lastCall.params.projectPath, "proj-a");

  await api.captureUrl({ url: "https://dori.local", title: "Dori", project: "proj-b" });
  assert.equal(lastCall.actionId, "capture_url");
  assert.equal(lastCall.params.url, "https://dori.local");
  assert.equal(lastCall.params.projectPath, "proj-b");
});

// 3.3 Projects & Templates
await asyncRecord("api_client", "listProjects: call without params", async () => {
  await api.listProjects();
  assert.equal(lastCall.actionId, "list_projects");
});

await asyncRecord("api_client", "getProjectDetails: string path & object", async () => {
  await api.getProjectDetails("clients/acme");
  assert.equal(lastCall.actionId, "get_project_details");
  assert.equal(lastCall.params.projectPath, "clients/acme");

  await api.getProjectDetails({ path: "internal/portal" });
  assert.equal(lastCall.actionId, "get_project_details");
  assert.equal(lastCall.params.projectPath, "internal/portal");
});

await asyncRecord("api_client", "applyTemplate: positional args", async () => {
  await api.applyTemplate("software", "my-app", { env: "prod" });
  assert.equal(lastCall.actionId, "apply_template");
  assert.equal(lastCall.params.template, "software");
  assert.equal(lastCall.params.project, "my-app");
  assert.deepEqual(lastCall.params.vars, { env: "prod" });
});

await asyncRecord("api_client", "applyTemplate: object { templateName, targetDir }", async () => {
  await api.applyTemplate({ templateName: "client", targetDir: "clients/acme", vars: { tier: "enterprise" } });
  assert.equal(lastCall.actionId, "apply_template");
  assert.equal(lastCall.params.template, "client");
  assert.equal(lastCall.params.project, "clients/acme");
  assert.deepEqual(lastCall.params.vars, { tier: "enterprise" });
});

await asyncRecord("api_client", "applyTemplate: object { templateKey, projectPath }", async () => {
  await api.applyTemplate({ templateKey: "portal.standard", projectPath: "alpha" });
  assert.equal(lastCall.actionId, "apply_template");
  assert.equal(lastCall.params.template, "portal.standard");
  assert.equal(lastCall.params.project, "alpha");
});

// 3.4 Tasks & Inbox
await asyncRecord("api_client", "listTasks: default / string status", async () => {
  await api.listTasks();
  assert.equal(lastCall.actionId, "list_tasks");
  assert.equal(lastCall.params.status, "open");

  await api.listTasks("done");
  assert.equal(lastCall.actionId, "list_tasks");
  assert.equal(lastCall.params.status, "done");
});

await asyncRecord("api_client", "markTaskDone: string id & object { id }", async () => {
  await api.markTaskDone("task-123");
  assert.equal(lastCall.actionId, "mark_task_done");
  assert.equal(lastCall.params.id, "task-123");

  await api.markTaskDone({ id: "task-456" });
  assert.equal(lastCall.actionId, "mark_task_done");
  assert.equal(lastCall.params.id, "task-456");
});

await asyncRecord("api_client", "addTask: positional args", async () => {
  await api.addTask("Write report", "2026-09-10", "alice");
  assert.equal(lastCall.actionId, "add_task");
  assert.equal(lastCall.params.title, "Write report");
  assert.equal(lastCall.params.due, "2026-09-10");
  assert.equal(lastCall.params.owner, "alice");
});

await asyncRecord("api_client", "addTask: object { title, dueDate, owner }", async () => {
  await api.addTask({ title: "Fix bug", dueDate: "2026-09-15", owner: "bob" });
  assert.equal(lastCall.actionId, "add_task");
  assert.equal(lastCall.params.title, "Fix bug");
  assert.equal(lastCall.params.due, "2026-09-15");
  assert.equal(lastCall.params.owner, "bob");
});

await asyncRecord("api_client", "listInbox / approveInboxItem / ignoreInboxItem", async () => {
  await api.listInbox("detected");
  assert.equal(lastCall.actionId, "list_inbox");
  assert.equal(lastCall.params.status, "detected");

  await api.approveInboxItem({ id: "clar-123", destination: "projects/core" });
  assert.equal(lastCall.actionId, "approve_inbox_item");
  assert.equal(lastCall.params.clarificationId, "clar-123");
  assert.equal(lastCall.params.choiceId, "projects/core");

  await api.ignoreInboxItem({ id: "clar-123" });
  assert.equal(lastCall.actionId, "ignore_inbox_item");
  assert.equal(lastCall.params.clarificationId, "clar-123");
});

// 3.5 Finance & Trips
await asyncRecord("api_client", "listTripLedgers / listTrips", async () => {
  await api.listTripLedgers();
  assert.equal(lastCall.actionId, "list_trip_ledgers");

  await api.listTrips();
  assert.equal(lastCall.actionId, "list_trip_ledgers");
});

await asyncRecord("api_client", "getTripLedger: string target and object { tripName }", async () => {
  await api.getTripLedger("trip-denver");
  assert.equal(lastCall.actionId, "get_trip_ledger");
  assert.equal(lastCall.params.target, "trip-denver");

  await api.getTripLedger({ tripName: "Denver 2026" });
  assert.equal(lastCall.actionId, "get_trip_ledger");
  assert.equal(lastCall.params.target, "Denver 2026");
});

await asyncRecord("api_client", "checkReimbursementGaps: object { tripName }", async () => {
  await api.checkReimbursementGaps({ tripName: "trip-sf" });
  assert.equal(lastCall.actionId, "check_reimbursement_gaps");
  assert.equal(lastCall.params.target, "trip-sf");
});

await asyncRecord("api_client", "routeExpense: string vs object { message, targetLedger }", async () => {
  await api.routeExpense("Uber $30", "trip-1");
  assert.equal(lastCall.actionId, "route_expense");
  assert.equal(lastCall.params.message, "Uber $30");
  assert.equal(lastCall.params.key, "trip-1");

  await api.routeExpense({ message: "Dinner $60", targetLedger: "trip-2" });
  assert.equal(lastCall.actionId, "route_expense");
  assert.equal(lastCall.params.message, "Dinner $60");
  assert.equal(lastCall.params.key, "trip-2");
});

await asyncRecord("api_client", "attachReceipt: pass-through payload", async () => {
  await api.attachReceipt({ file: "receipt.pdf", amount: 45.0, date: "2026-08-12", desc: "Lunch" });
  assert.equal(lastCall.actionId, "attach_receipt");
  assert.equal(lastCall.params.amount, 45.0);
});

await asyncRecord("api_client", "closeTrip: object { tripName, status }", async () => {
  await api.closeTrip({ tripName: "trip-paris", status: "submitted" });
  assert.equal(lastCall.actionId, "close_trip");
  assert.equal(lastCall.params.target, "trip-paris");
  assert.equal(lastCall.params.status, "submitted");
});

// 3.6 Meetings
await asyncRecord("api_client", "listFathomMeetings: boolean vs object { unfiledOnly, since }", async () => {
  await api.listFathomMeetings(true);
  assert.equal(lastCall.actionId, "list_fathom_meetings");
  assert.equal(lastCall.params.includeFiled, true);

  await api.listFathomMeetings({ unfiledOnly: true, since: "2026-08-01" });
  assert.equal(lastCall.actionId, "list_fathom_meetings");
  assert.equal(lastCall.params.includeFiled, false);
  assert.equal(lastCall.params.since, "2026-08-01");
});

await asyncRecord("api_client", "getFathomMeeting: object { meetingId }", async () => {
  await api.getFathomMeeting({ meetingId: "fathom-999" });
  assert.equal(lastCall.actionId, "get_fathom_meeting");
  assert.equal(lastCall.params.recordingId, "fathom-999");
});

await asyncRecord("api_client", "routeMeeting: array vs object { attendees, destination }", async () => {
  await api.routeMeeting(["alice@corp.com", "bob@corp.com"]);
  assert.equal(lastCall.actionId, "route_meeting");
  assert.deepEqual(lastCall.params.attendees, ["alice@corp.com", "bob@corp.com"]);

  await api.routeMeeting({ attendees: ["carol@corp.com"], destination: "proj-x" });
  assert.equal(lastCall.actionId, "route_meeting");
  assert.deepEqual(lastCall.params.attendees, ["carol@corp.com"]);
  assert.equal(lastCall.params.key, "proj-x");
});

await asyncRecord("api_client", "processMeeting: string relPath and force flag", async () => {
  await api.processMeeting("meetings/sync.md", true);
  assert.equal(lastCall.actionId, "process_meeting");
  assert.equal(lastCall.params.relPath, "meetings/sync.md");
  assert.equal(lastCall.params.force, true);
});

await asyncRecord("api_client", "getMeetingPrep: array & object", async () => {
  await api.getMeetingPrep(["alice@meridian.com"], "platform");
  assert.equal(lastCall.actionId, "get_meeting_prep");
  assert.deepEqual(lastCall.params.attendees, ["alice@meridian.com"]);
  assert.equal(lastCall.params.project, "platform");
});

await asyncRecord("api_client", "fileMeeting: object mapping", async () => {
  await api.fileMeeting({
    title: "Sync",
    date: "2026-08-25",
    transcript: "Hello",
    project: "proj-alpha",
    meetingId: "fathom-rec-1",
    notes: "Minutes notes",
  });
  assert.equal(lastCall.actionId, "file_meeting");
  assert.equal(lastCall.params.title, "Sync");
  assert.equal(lastCall.params.projectPath, "proj-alpha");
  assert.equal(lastCall.params.fathomRecordingId, "fathom-rec-1");
  assert.equal(lastCall.params.minutes, "Minutes notes");
});

// 3.7 Entities, Orgs, Brands
await asyncRecord("api_client", "listOrgs / listAccounts / listPeople", async () => {
  await api.listOrgs();
  assert.equal(lastCall.actionId, "list_orgs");
  await api.listAccounts();
  assert.equal(lastCall.actionId, "list_accounts");
  await api.listPeople();
  assert.equal(lastCall.actionId, "list_people");
});

await asyncRecord("api_client", "ensureOrg: string vs object", async () => {
  await api.ensureOrg("Acme Corp");
  assert.equal(lastCall.actionId, "ensure_org");
  assert.equal(lastCall.params.orgName, "Acme Corp");

  await api.ensureOrg({ name: "Beta LLC", role: "vendor" });
  assert.equal(lastCall.actionId, "ensure_org");
  assert.equal(lastCall.params.orgName, "Beta LLC");
  assert.equal(lastCall.params.role, "vendor");
});

await asyncRecord("api_client", "listBrands / getBrand / getBrandContext / setBrand", async () => {
  await api.listBrands();
  assert.equal(lastCall.actionId, "list_brands");

  await api.getBrand({ brandId: "aura" });
  assert.equal(lastCall.actionId, "get_brand");
  assert.equal(lastCall.params.name, "aura");

  await api.getBrandContext({ brandId: "aura" });
  assert.equal(lastCall.actionId, "get_brand_context");
  assert.equal(lastCall.params.name, "aura");

  await api.setBrand("dori", { primary: "#000", accent: "#fff" });
  assert.equal(lastCall.actionId, "set_brand");
  assert.equal(lastCall.params.name, "dori");
  assert.equal(lastCall.params.primary, "#000");

  await api.setBrand({ brandId: "nova", primary: "#111" });
  assert.equal(lastCall.actionId, "set_brand");
  assert.equal(lastCall.params.name, "nova");
  assert.equal(lastCall.params.primary, "#111");
});

await asyncRecord("api_client", "researchPerson / researchAndRecommend", async () => {
  await api.researchPerson("Anita Sharma", "Meridian", "CFO");
  assert.equal(lastCall.actionId, "research_person");
  assert.equal(lastCall.params.name, "Anita Sharma");

  await api.researchAndRecommend("Tesla");
  assert.equal(lastCall.actionId, "research_and_recommend");
  assert.equal(lastCall.params.name, "Tesla");

  await api.researchAndRecommend({ entityName: "Apple", project: "tech" });
  assert.equal(lastCall.actionId, "research_and_recommend");
  assert.equal(lastCall.params.name, "Apple");
  assert.equal(lastCall.params.project, "tech");
});

await asyncRecord("api_client", "mergeEntity: sourceId/targetId mapping", async () => {
  await api.mergeEntity({ type: "person", sourceId: "john-doe", targetId: "john-smith" });
  assert.equal(lastCall.actionId, "merge_entity");
  assert.equal(lastCall.params.type, "person");
  assert.equal(lastCall.params.sourceSlug, "john-doe");
  assert.equal(lastCall.params.targetSlug, "john-smith");
});

// 3.8 Decisions, Credentials, Timeline, Chat
await asyncRecord("api_client", "listDecisions / createDecision", async () => {
  await api.listDecisions("active");
  assert.equal(lastCall.actionId, "list_decisions");
  assert.equal(lastCall.params.status, "active");

  await api.createDecision({ summary: "Decision test" });
  assert.equal(lastCall.actionId, "create_decision");
  assert.equal(lastCall.params.summary, "Decision test");
});

await asyncRecord("api_client", "listCredentials / findCredentials / startCredentialServer", async () => {
  await api.listCredentials("aws");
  assert.equal(lastCall.actionId, "list_credentials");
  assert.equal(lastCall.params.service, "aws");

  await api.findCredentials("token");
  assert.equal(lastCall.actionId, "find_credentials");
  assert.equal(lastCall.params.query, "token");

  await api.startCredentialServer();
  assert.equal(lastCall.actionId, "start_credential_server");
});

await asyncRecord("api_client", "listTimeline / getTimeline", async () => {
  await api.listTimeline({ limit: 50 });
  assert.equal(lastCall.actionId, "timeline");
  assert.equal(lastCall.params.limit, 50);

  await api.getTimeline({ since: "2026-08-01" });
  assert.equal(lastCall.actionId, "timeline");
  assert.equal(lastCall.params.since, "2026-08-01");
});

await asyncRecord("api_client", "chatSend", async () => {
  await api.chatSend({ message: "Hello" });
  assert.equal(lastCall.actionId, "chat_send");
  assert.equal(lastCall.params.message, "Hello");
});

// 3.9 System, Engine Config & Profile
await asyncRecord("api_client", "getProfile / setProfile / saveProfile", async () => {
  await api.getProfile();
  assert.equal(lastCall.actionId, "get_profile");

  await api.setProfile({ name: "Dev" });
  assert.equal(lastCall.actionId, "set_profile");
  assert.equal(lastCall.params.name, "Dev");

  await api.saveProfile({ profile: { name: "Alice", role: "Dev" } });
  assert.equal(lastCall.actionId, "save_profile");
  assert.equal(lastCall.params.name, "Alice");
});

await asyncRecord("api_client", "getEngineConfig / setEngineConfig", async () => {
  await api.getEngineConfig();
  assert.equal(lastCall.actionId, "get_engine_config");

  await api.setEngineConfig("claude");
  assert.equal(lastCall.actionId, "set_engine_config");
  assert.equal(lastCall.params.replyCli, "claude");

  await api.setEngineConfig({ config: { replyCli: "codex" } });
  assert.equal(lastCall.actionId, "set_engine_config");
  assert.equal(lastCall.params.replyCli, "codex");
});

// 3.10 Preload Bridge Helpers & Graceful Fallback
await asyncRecord("api_bridge", "preload bridge helpers & fallback when window is undefined", async () => {
  // Test with bridge present
  const filePath = api.getFilePath({ path: "/custom/file.txt" });
  assert.equal(filePath, "/custom/file.txt");

  let settingsOpened = false;
  const unsubSettings = api.onOpenSettings(() => { settingsOpened = true; });
  assert.equal(settingsOpened, true);
  assert.equal(typeof unsubSettings, "function");

  let deltaReceived = "";
  const unsubDelta = api.onChatDelta((chunk) => { deltaReceived = chunk; });
  assert.equal(deltaReceived, "chunk");
  assert.equal(typeof unsubDelta, "function");

  const closeRes = api.closeMini();
  assert.equal(closeRes, "closed");

  // Test without bridge (window undefined)
  const origWindow = globalThis.window;
  try {
    delete globalThis.window;
    const res = await api.listProjects();
    assert.equal(res, null, "Should return null when window is undefined");

    const path = api.getFilePath({ name: "fallback.txt" });
    assert.equal(path, "fallback.txt");

    const unsub = api.onOpenSettings(() => {});
    assert.equal(typeof unsub, "function");
    unsub();

    const unsubD = api.onChatDelta(() => {});
    assert.equal(typeof unsubD, "function");
    unsubD();

    const closed = api.closeMini();
    assert.equal(closed, undefined);
  } finally {
    globalThis.window = origWindow;
  }
});

console.log("\n=======================================================");
console.log(`CHALLENGER STRESS COMPLETE: ${passed} PASSED, ${failed} FAILED across ${testRecords.length} assertions.`);
console.log("=======================================================");

// Cleanup
rmSync(TEST_VAULT, { recursive: true, force: true });
rmSync(TEST_CONFIG, { recursive: true, force: true });

if (failed > 0) {
  console.error("FAILURES DETECTED:");
  for (const r of testRecords.filter(t => t.status === "FAIL")) {
    console.error(`- [${r.section}] ${r.title}: ${r.error}`);
  }
  process.exit(1);
} else {
  process.exit(0);
}
