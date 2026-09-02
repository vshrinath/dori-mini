# Master E2E Testing Infrastructure Specification

**Document Version:** 1.0.0  
**Target Project:** `dori-mini` (`electron-app` & backend action subsystems)  
**Author:** E2E Test Writer (`e2e_test_writer`)  
**Scope:** Complete opaque-box, requirement-driven E2E test suite covering all 12 inventoried features in `PROJECT.md` across Tiers 1–4.

---

## 1. Test Philosophy & Opaque-Box Methodology

The `dori-mini` End-to-End (E2E) test infrastructure provides rigorous, requirement-driven verification of the entire application surface. It evaluates both the visual/presentation layers in `electron-app` and the backend action registry/domain subsystems in `actions.mjs` through the typed, decoupled client API contract (`lib/api.js`).

### Core Principles

1. **Opaque-Box Verification**: Tests validate observable behaviors, contract schemas, UI tokens, and output artifacts strictly against the documented specifications (`ORIGINAL_REQUEST.md`, `PROJECT.md`, `survey_spec_miner_1/analysis.md`), without relying on implementation idiosyncrasies.
2. **Decoupled Client API Integration**: All interactions between UI components and backend services are verified through the typed client adapter (`electron-app/src/lib/api.js`). Zero direct invocations of untyped IPC (`window.dori.call`) are permitted.
3. **Hermetic Test Isolation**: Tests run against isolated, temporary test vaults (`.test-vault-e2e-*`) and configuration directories (`.test-config-e2e-*`) created per test run and torn down deterministically.
4. **Deterministic Execution**: Tests operate offline without unmocked external network dependencies (such as live LLMs or remote APIs), ensuring 100% reproducible execution and millisecond turnaround.
5. **Progressive 4-Tier Depth**: The test suite is organized into 4 distinct verification tiers ensuring depth from unit feature isolation to complex multi-step user workflows.

---

## 2. 12-Feature Inventory Coverage Matrix

Every feature defined in `PROJECT.md § Feature Inventory` is mapped to explicit contract assertions across Tier 1 (Happy Path) and Tier 2 (Boundary & Corner Cases):

| # | Feature Name | Source / Scope | Primary Contract & Interfaces | Tier 1 Target (Happy Path) | Tier 2 Target (Edge & Boundary) |
|---|--------------|----------------|-------------------------------|-----------------------------|----------------------------------|
| **F01** | **Client API Adapter Completion** | `lib/api.js` (M1) | Typed client wrapper (`listTripLedgers`, `listPeople`, `saveProfile`, `researchAndRecommend`, `fileMeeting`, `attachReceipt`, `closeTrip`, etc.) | >= 5 assertions | >= 5 assertions |
| **F02** | **Backend Action Registry Hardening** | `actions.mjs` (M1) | 52+ DoriActionDefinition Zod schemas, dispatch handler, `exposeToMcp` | >= 5 assertions | >= 5 assertions |
| **F03** | **Design System & Token Integration** | `tokens.css` (M2) | Figtree typography scale, 6 space accents (`--space-now` through `--space-system`), surface ladder, `.space-card` | >= 5 assertions | >= 5 assertions |
| **F04** | **Calibrated Sidebar Nav & Categories** | `Sidebar.jsx` (M2) | 34px calibrated metrics, Work/Knowledge/System categories, collapsible groups, 40px icon rail | >= 5 assertions | >= 5 assertions |
| **F05** | **ViewCanvas Split & Document History** | `ViewCanvas.jsx` (M3) | 60/40 non-modal split, width persistence, history back stack (`openLinkedView`/`goBack`), reader scaling (0.8-1.6), MOM tabs | >= 5 assertions | >= 5 assertions |
| **F06** | **Tiptap Markdown & Table Extensions** | `LibraryView.jsx` (M3) | `@tiptap/extension-table*`, frontmatter tags, wikilink PUA protection (`protectVaultSyntax`) | >= 5 assertions | >= 5 assertions |
| **F07** | **Finance & Ledgers Parity & Decoupling** | `FinanceView.jsx` (M4) | Exclusive `lib/api.js` consumption, itemized trip tables, INR currency formatting, gap detection audit (`check_reimbursement_gaps`) | >= 5 assertions | >= 5 assertions |
| **F08** | **Entities & Brands Parity & Decoupling** | `EntitiesView.jsx` (M4) | Exclusive `lib/api.js` consumption, orgs directory, person affiliations, brand theme token cards, non-destructive entity merge | >= 5 assertions | >= 5 assertions |
| **F09** | **Inbox & Timeline Parity & Decoupling** | `InboxView.jsx`, `TimelineView.jsx` (M4) | Exclusive `lib/api.js` consumption, Keep/Move/Clarify/Approve cards, day-grouped timeline streams | >= 5 assertions | >= 5 assertions |
| **F10** | **Project Dashboard & Modals Decoupling** | `ProjectView.jsx`, modals (M4) | 100% elimination of raw `window.dori.call`, single-canvas project cockpit, Settings/Credentials/Profile/Search modals | >= 5 assertions | >= 5 assertions |
| **F11** | **E2E Test Suite Creation** | `test/e2e/`, `test/e2e-suite.mjs` | Unified 4-tier runner, reproducible sandbox harness, `TEST_READY.md` | >= 5 assertions | >= 5 assertions |
| **F12** | **Final Integration & Hardening** | Master Suite (M5) | 100% E2E test pass, adversarial resilience, SQL injection / path traversal safety, build & lint verification | >= 5 assertions | >= 5 assertions |

---

## 3. 4-Tier Test Architecture & Strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Master E2E Test Suite Architecture                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tier 1: Feature Coverage (Isolation & Happy Path)                           │
│  - >=5 test cases per feature for all 12 inventoried features (>=60 tests)    │
│  - Verifies contract compliance, primary execution paths, schema parsing     │
│                                                                              │
│  Tier 2: Boundary & Corner Cases (Robustness & Fuzzing)                      │
│  - >=5 test cases per feature for all 12 inventoried features (>=60 tests)    │
│  - Null/empty inputs, malformed types, schema violations, injection payloads │
│                                                                              │
│  Tier 3: Cross-Feature Interactions (Pairwise Combinations)                  │
│  - Combinatorial workflows across Finance, Entities, Inbox, Timeline,        │
│    Library, Tasks, and Projects                                              │
│                                                                              │
│  Tier 4: Real-World Workload Scenarios (End-to-End User Journeys)            │
│  - Multi-step realistic application workflows simulating daily operations   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (Happy Paths & Isolation)
- **Objective**: Ensure every single feature and action functions correctly under nominal conditions.
- **Threshold**: Minimum of 5 test cases per feature (>=60 total tests).
- **Scope**:
  - API Client Adapter methods correctly map arguments and unpack responses.
  - Action registry loads and executes valid payloads across read/write scopes.
  - Design system tokens and Figtree scale declarations are present and well-formed.
  - Sidebar navigation renders Work, Knowledge, System categories with 34px geometry.
  - ViewCanvas implements 60/40 non-modal workspace with history back-stack and MOM tabs.
  - Tiptap parser formats Markdown tables and frontmatter tags.
  - Finance, Entities, Inbox, Timeline, and Project views consume `lib/api.js`.

### Tier 2: Boundary & Corner Cases (Edge Cases & Resilience)
- **Objective**: Ensure system stability, safe error recovery, and strict input validation.
- **Threshold**: Minimum of 5 test cases per feature (>=60 total tests).
- **Scope**:
  - Rejection of missing required fields, empty strings, and type mismatches via Zod.
  - Path traversal attempts (`../../etc/passwd`) in document/ledger paths safely blocked.
  - State machine transition guards (e.g. blocking closure of `draft` trip ledgers).
  - Self-merge entity identity rejection (`sourceId === targetId`).
  - Timeline parameter clamping (`limit` 1..200, regex date validation for `since`).
  - Graceful fallback when `window.dori.call` is missing or when documents are empty.
  - Malformed Markdown table and YAML frontmatter error tolerance.

### Tier 3: Cross-Feature Interactions (Pairwise Combinations)
- **Objective**: Verify seamless data flow and contract interoperability between distinct domains.
- **Scenarios**:
  1. *Finance ↔ Inbox*: Incoming expense captures in Inbox routed directly into Trip Ledgers, updating gap audit status.
  2. *Entities ↔ Meetings*: Filing meeting minutes automatically resolves attendee affiliations and updates organization graphs.
  3. *Tasks ↔ Projects*: Tasks assigned to a project appear in both global `listTasks` and project open loops.
  4. *Library ↔ ViewCanvas*: Opening markdown notes with `type: meeting` dynamically activates MOM structured projection in ViewCanvas.
  5. *Timeline ↔ Finance & Tasks*: Completed tasks, logged expenses, and filed meetings emit structured activity events.
  6. *Brand ↔ Design Tokens*: Creating brand presets updates brand cards with matching color swatches and typography tokens.
  7. *Projects ↔ Template Scaffolding*: Applying `engine.software` template creates standardized directories and records provenance.

### Tier 4: Real-World Workload Scenarios (Application-Level Workflows)
- **Objective**: Simulate end-to-end user journeys encompassing multi-step operational lifecycles.
- **Workflows**:
  1. *Scenario 1: Executive Trip & Expense Lifecycle*: Create trip → route expenses → audit evidence gaps → attach receipts → close trip package → verify timeline log.
  2. *Scenario 2: Meeting Intake to MOM Projection & Task Execution*: Ingest meeting → route to project → file MOM notes → verify ViewCanvas rendering → extract action items → complete tasks.
  3. *Scenario 3: Entity Research & Non-Destructive Account Consolidation*: Register organization & contact → research background context → detect duplicate → execute non-destructive entity merge → verify alias union.
  4. *Scenario 4: Project Scaffolding, Spec Authoring & Vault Discovery*: Initialize project → apply folder template → author spec with Markdown tables → view in resizable ViewCanvas → search vault index.
  5. *Scenario 5: Inbox Triage, Clarification Approval & Activity Stream Audit*: Ingest heterogeneous captures → review inbox decision cards → approve clarification → dismiss noise → audit chronological activity stream.

---

## 4. Test Infrastructure Architecture & Harness

### File Layout
```
test/
├── e2e-suite.mjs                # Master test runner orchestrating all tiers
└── e2e/
    ├── harness.mjs              # Test sandbox environment, temporary vault seeding & teardown
    ├── tier1-feature-coverage.mjs   # Tier 1: >=60 feature coverage test cases
    ├── tier2-boundary-cases.mjs     # Tier 2: >=60 boundary and edge test cases
    ├── tier3-cross-feature.mjs      # Tier 3: Pairwise domain interaction scenarios
    └── tier4-workload-scenarios.mjs # Tier 4: Real-world multi-step workflow scenarios
```

### Sandbox Harness Lifecycle
1. **Setup**: Creates isolated temporary directories `.test-vault-e2e-<timestamp>` and `.test-config-e2e-<timestamp>`, configuring `process.env.VAULT_ROOT` and `process.env.DORI_CONFIG_DIR`.
2. **Seeding**: Seeds initial directory hierarchies (finances, entities, projects, tasks, inbox, decisions).
3. **Execution**: Executes test assertions with isolated state.
4. **Teardown**: Cleans up temporary directories, ensuring zero persistent artifacts.

---

## 5. Execution Protocol & Commands

### Single Master Command
```bash
node test/e2e-suite.mjs
```

### Individual Tier Execution
```bash
node test/e2e/tier1-feature-coverage.mjs
node test/e2e/tier2-boundary-cases.mjs
node test/e2e/tier3-cross-feature.mjs
node test/e2e/tier4-workload-scenarios.mjs
```

### Exit Codes & Reporting
- Exit Code `0`: All tests across all tiers passed.
- Exit Code `1`: One or more test assertions failed (with detailed failure diagnostics and line numbers).

---

## 6. QA & Defect Escalation Policy

As test writers operating under QA constraints:
- **Test Code Only**: Only files in `test/e2e/` and `test/e2e-suite.mjs` may be modified.
- **No Implementation Workarounds**: If a legitimate defect is discovered in `electron-app/` or `actions.mjs`, write an honest failing test or document the defect for escalation to the implementing agent.
- **Publication**: Upon completing and passing the test suite, author and publish `TEST_READY.md`.
