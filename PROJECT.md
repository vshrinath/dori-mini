# Project: Port dori-portal Visual Design System & Component Architecture to electron-app

## Architecture
- **Layer 1: Presentation & Design System (`electron-app/src/`)**:
  - `tokens.css` / `app/space-shell.css`: Figtree typography scale, CSS variables, space accent palettes (`--space-now`, `--space-work`, `--space-knowledge`, `--space-create`, `--space-personal`, `--space-system`), surface ladder, `.space-card` dot-grid texture.
  - `components/Sidebar.jsx`: 34px calibrated metrics, space categories (`Work`, `Knowledge`, `System`), collapsible groups with animated chevron triggers, collapsed 40px rail.
  - `components/ViewCanvas.jsx`: 60/40 non-modal split, localStorage persistence, document history stack (`openLinkedView`/`goBack`), reader font scaling (0.8-1.6), MOM minutes tabs, fullscreen toggle.
  - Primary Views: `FinanceView.jsx`, `EntitiesView.jsx`, `InboxView.jsx`, `TimelineView.jsx`, `LibraryView.jsx`, `MeetingsView.jsx`, `ChatView.jsx`, `ProjectView.jsx`, `ProjectsIndexView.jsx`.
  - Tiptap Markdown & Tables: `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-header`, `@tiptap/extension-table-cell`, frontmatter tags, wikilinks.
- **Layer 2: Decoupled Client API Adapter (`electron-app/src/lib/api.js`)**:
  - Typed client adapter wrapping all backend actions (`window.dori.call(actionId, params)`).
  - 100% decoupling: No UI component calls raw `window.dori.call` directly.
- **Layer 3: Backend Actions & IPC Transport (`actions.mjs`, `electron-app/src/main/`)**:
  - 56 registered actions in `actions.mjs` adhering to `DoriActionDefinition` Zod schemas.
  - Action handlers dispatching to vault operations, finance ledgers, meeting filers, and entity graphs.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Client API Adapter Completion | Expand `lib/api.js` with all missing helper methods (44+ polymorphic methods covering all 56 actions) | M1 | survey_explorer_3 |
| 2 | Backend Action Registry Hardening | Register `apply_template` in `actions.mjs`, align action parameter schemas with UI needs, and verify with `actions-adversarial.mjs` | M1 | survey_explorer_3 |
| 3 | Design System & Token Integration | Verify and complete Figtree typography hierarchy, space accent tokens (`--space-now`, `--space-work`, `--space-knowledge`, `--space-create`, `--space-personal`, `--space-system`), surface ladder, and `.space-card` dot-grid rules | M2 | survey_spec_miner_1 |
| 4 | Calibrated Sidebar Nav & Space Categories | Add `System` space category (Settings, Credentials, Profile) alongside `Work` and `Knowledge` in `Sidebar.jsx`, 34px item metrics, collapsible groups with animations | M2 | survey_spec_miner_1, survey_explorer_2 |
| 5 | ViewCanvas Split & Document History | 60/40 non-modal resizable canvas, localStorage width persistence, history back stack (`openLinkedView`/`goBack`), reader font scale slider (0.8-1.6), MOM/transcript tabs, fullscreen with Escape | M3 | survey_spec_miner_1 |
| 6 | Tiptap Markdown & Table Extensions | Add `@tiptap/extension-table*` packages to `electron-app/package.json`, configure Tiptap table extensions in `LibraryView.jsx` and `FileSlideover.jsx`, frontmatter tags | M3 | survey_spec_miner_1, survey_explorer_2 |
| 7 | Finance & Ledgers Parity & Decoupling | Refactor `FinanceView.jsx` to consume `lib/api.js` exclusively, itemized trip tables, status badges, gap detection audits (`check_reimbursement_gaps`), receipt attachments | M4 | survey_spec_miner_1, survey_explorer_2 |
| 8 | Entities & Brands Parity & Decoupling | Refactor `EntitiesView.jsx` to consume `lib/api.js` exclusively, orgs directory, person affiliations, brand theme token cards | M4 | survey_spec_miner_1, survey_explorer_2 |
| 9 | Inbox & Timeline Parity & Decoupling | Refactor `InboxView.jsx` and `TimelineView.jsx` to consume `lib/api.js`, action cards (Keep/Move/Clarify/Approve), day-grouped streams | M4 | survey_spec_miner_1, survey_explorer_2 |
| 10 | Project Dashboard & Modals Decoupling | Refactor `ProjectView.jsx`, `ProjectsIndexView.jsx`, `MeetingsView.jsx`, `ChatView.jsx`, and all modal dialogs to use `lib/api.js` exclusively, eliminating 100% of raw `window.dori.call` calls | M4 | survey_spec_miner_1, survey_explorer_2, survey_explorer_3 |
| 11 | E2E Test Suite Creation | Requirement-driven opaque-box E2E test suite across Tiers 1-4 covering all features, publishing `TEST_READY.md` | E2E Track | ORIGINAL_REQUEST |
| 12 | Final Integration & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4), followed by Tier 5 Adversarial Coverage Hardening | M5 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Client API Adapter & Action Registry | `lib/api.js`, `actions.mjs`, `test/actions-adversarial.mjs` | none | DONE |
| M2 | Design Tokens & Space Shell Sidebar | `tokens.css`, `Sidebar.jsx`, `App.jsx`, space categories | M1 | IN_PROGRESS |
| M3 | ViewCanvas & Tiptap Table Extensions | `ViewCanvas.jsx`, `LibraryView.jsx`, `FileSlideover.jsx`, package.json | M1, M2 | PLANNED |
| M4 | View Component Parity & API Decoupling | `FinanceView.jsx`, `EntitiesView.jsx`, `InboxView.jsx`, `TimelineView.jsx`, `MeetingsView.jsx`, `ChatView.jsx`, `ProjectView.jsx`, modals | M1, M2, M3 | PLANNED |
| M5 | Final E2E Test Pass & Hardening | 100% E2E test pass (Tiers 1-4) + Tier 5 adversarial coverage hardening | M1-M4, TEST_READY | PLANNED |
| E2E | E2E Testing Track | Independent opaque-box test runner and test cases (Tiers 1-4), publish `TEST_READY.md` | none (Parallel) | IN_PROGRESS |

## Interface Contracts
### `lib/api.js` ↔ UI Components
- `api.listTripLedgers()` -> `Promise<{ ledgers: Array<TripLedger> }>`
- `api.getTripLedger({ tripName })` -> `Promise<TripLedger>`
- `api.routeExpense({ ... })` -> `Promise<{ success: boolean, ... }>`
- `api.checkReimbursementGaps({ tripName })` -> `Promise<{ gaps: Array<Gap> }>`
- `api.attachReceipt({ ... })` -> `Promise<{ success: boolean }>`
- `api.closeTrip({ tripName })` -> `Promise<{ success: boolean }>`
- `api.listOrgs()` -> `Promise<{ orgs: Array<Org> }>`
- `api.listPeople()` -> `Promise<{ people: Array<Person> }>`
- `api.listBrands()` -> `Promise<{ brands: Array<Brand> }>`
- `api.getBrand({ brandId })` -> `Promise<Brand>`
- `api.setBrand({ brandId, theme })` -> `Promise<{ success: boolean }>`
- `api.ensureOrg({ name, aliases })` -> `Promise<{ success: boolean }>`
- `api.mergeEntity({ sourceId, targetId })` -> `Promise<{ success: boolean }>`
- `api.researchAndRecommend({ entityName })` -> `Promise<{ recommendations: Array<any> }>`
- `api.listInbox()` -> `Promise<{ items: Array<InboxItem> }>`
- `api.approveInboxItem({ id, destination })` -> `Promise<{ success: boolean }>`
- `api.ignoreInboxItem({ id })` -> `Promise<{ success: boolean }>`
- `api.listTimeline({ since, limit })` -> `Promise<{ events: Array<TimelineEvent> }>`
- `api.listFathomMeetings({ includeFiled, since })` -> `Promise<{ meetings: Array<Meeting> }>`
- `api.getFathomMeeting({ meetingId })` -> `Promise<MeetingDetail>`
- `api.getMeetingPrep({ meetingId })` -> `Promise<MeetingPrep>`
- `api.routeMeeting({ meetingId, destination })` -> `Promise<{ destination: string }>`
- `api.fileMeeting({ meetingId, project, notes })` -> `Promise<{ success: boolean }>`
- `api.applyTemplate({ templateName, targetDir, vars })` -> `Promise<{ success: boolean }>`
- `api.captureFile({ sourcePath, destination })` -> `Promise<{ success: boolean }>`
- `api.captureUrl({ url })` -> `Promise<{ success: boolean }>`
- `api.getProfile()` -> `Promise<Profile>`
- `api.saveProfile({ profile })` -> `Promise<{ success: boolean }>`
- `api.getEngineConfig()` -> `Promise<EngineConfig>`
- `api.setEngineConfig({ config })` -> `Promise<{ success: boolean }>`
- `api.listCredentials()` -> `Promise<{ credentials: Array<Credential> }>`
- `api.findCredentials({ query })` -> `Promise<{ matches: Array<Credential> }>`
- `api.startCredentialServer()` -> `Promise<{ status: string, port?: number }>`
- `api.searchVault({ query })` -> `Promise<{ results: Array<SearchResult> }>`

## Code Layout
- `electron-app/src/lib/api.js`: Decoupled typed API client adapter
- `actions.mjs`: Backend action definitions and schema registry
- `electron-app/src/tokens.css`: Design system tokens, Figtree fonts, and space colors
- `electron-app/src/components/Sidebar.jsx`: Sidebar navigation with Work, Knowledge, System categories
- `electron-app/src/components/ViewCanvas.jsx`: 60/40 non-modal canvas, history stack, scaling slider
- `electron-app/src/components/LibraryView.jsx`: Tiptap Markdown & table extensions
- `electron-app/src/components/FinanceView.jsx`: Finance, trip ledgers, receipt attachment, gap audits
- `electron-app/src/components/EntitiesView.jsx`: Organizations, people affiliations, brand token cards
- `electron-app/src/components/InboxView.jsx`: Inbox decision cards
- `electron-app/src/components/TimelineView.jsx`: Activity timeline streams
- `electron-app/src/components/MeetingsView.jsx`: Meeting routing, prep, and filing
- `electron-app/src/components/ProjectView.jsx`: Project dashboard cockpit
- `electron-app/src/components/ChatView.jsx`: Chat stream & file/url capture
- `electron-app/src/components/*Modal.jsx`: Settings, Credentials, Profile, Search modals
