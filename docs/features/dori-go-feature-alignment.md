# Project: Dori Go UI & Feature Alignment

## Architecture
- **Runtime Environment**: Electron 44 with Node.js in-process execution, React 19, Tailwind CSS v4, Base UI, Tiptap Markdown editor, and Lucide React icons.
- **IPC Communication**: Generic single-channel IPC bridge (`ipcMain.handle('dori:call', ...)` in `electron-app/main.js` and `window.dori.call(actionId, input)` in `electron-app/preload.cjs`).
- **Backend Architecture**: Modular Node.js ES modules (`dori-mini`) registered in `actions.mjs` with Zod schema validation and CLI entry (`node actions.mjs run <id> '<json>'`).
- **Styling & Design System**: Centralized design token system (`tokens.css`) using Figtree variable typography, semantic surfaces (`--surface-canvas`, `--surface-panel`, `--surface-field`), universal cards, and native motion curves (`lib/motion.js`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Action Registry Expansion | Register 20+ backend operations in `actions.mjs` with Zod schemas and CLI runner support | M1 | survey_explorer_2, survey_explorer_3 |
| 2 | Timeline Action Expense Ingestion | Enhance `timeline.mjs` to aggregate expense records from `loadLedgers()` | M1 | survey_explorer_3 |
| 3 | Shell & Sidebar Navigation | Add Finance, Timeline, Entities navigation items, create-menu shortcuts, and route handling in `Sidebar.jsx` and `App.jsx` | M2 | survey_explorer_1 |
| 4 | Inbox View Extraction | Modularize `InboxScreen` from `App.jsx` into `InboxView.jsx` | M2 | survey_explorer_1 |
| 5 | Design Tokens & Motion Polish | Unify Figtree typography, semantic surfaces, card borders, skeletons, and empty states across all screens | M2 | survey_explorer_1 |
| 6 | Finance Ledgers Grid & Details | View trip and reimbursement ledgers with itemized rows, status, totals, and incomplete indicators | M3 | survey_explorer_2, survey_explorer_3 |
| 7 | Reimbursement Gap Detection UI | Run reimbursement audit and gap checks on trip ledgers with interactive gap resolution | M3 | survey_explorer_2, survey_explorer_3 |
| 8 | Natural-Language Expense Router | Parse and route natural-language expense statements directly into trip ledgers | M3 | survey_explorer_2, survey_explorer_3 |
| 9 | Receipt Attachment & OCR Metadata | Attach receipt images/PDFs with category, tax, paidBy, reimbursable, and supersede markers | M3 | survey_explorer_2, survey_explorer_3 |
| 10 | Close Trip & Reimbursement Package | Transition trip ledger status and generate structured reimbursement package markdown | M3 | survey_explorer_2, survey_explorer_3 |
| 11 | Fathom Recordings Sync & Status | List unfiled Fathom meeting recordings, sync status, and transcript view | M4 | survey_explorer_2, survey_explorer_3 |
| 12 | Meeting Minutes Generation & Filing | Trigger structured Minutes of Meeting extraction and file with frontmatter into vault | M4 | survey_explorer_2, survey_explorer_3 |
| 13 | Document Conversion Preview | On-device markdown conversion preview for PDF, DOCX, PPTX, XLSX files via `convert_document` | M4 | survey_explorer_2, survey_explorer_3 |
| 14 | YouTube Media Capture Preview | Fetch video metadata, chapters, and uploader transcript for rich note filing | M4 | survey_explorer_2, survey_explorer_3 |
| 15 | Organizations Directory UI | Directory of organizations with affiliation evidence tracking and person linkages | M5 | survey_explorer_2, survey_explorer_3 |
| 16 | Brands Directory & Guidelines | Directory of brands with theme tokens (colors, font, logo) and guidelines prompt context | M5 | survey_explorer_2, survey_explorer_3 |
| 17 | Person Research & Briefing | Web research via Tavily cross-referenced with vault relationships and colleagues | M5 | survey_explorer_2, survey_explorer_3 |
| 18 | Entity Deduplication & Merging | Non-destructive entity merging interface with alias unification and archive redirection | M5 | survey_explorer_2, survey_explorer_3 |
| 19 | Credentials Vault Access | Encrypted credential search and secure browser intake server trigger | M5 | survey_explorer_2, survey_explorer_3 |
| 20 | Timeline & Activity Stream View | Chronological activity feed across meetings, decisions, expenses, and tasks | M6 | survey_explorer_1, survey_explorer_3 |
| 21 | Final E2E, Lint & Build Verification | Pass 100% E2E tests, zero ESLint errors, clean Vite production build, adversarial audit | M7 | survey_explorer_1, survey_explorer_2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Actions & IPC Registry Expansion | `actions.mjs`, `timeline.mjs`: Register 20+ actions with Zod schemas; add expenses to timeline | none | DONE |
| M2 | Core Shell, Navigation & Design Tokens Polish | `electron-app/src/App.jsx`, `Sidebar.jsx`, `InboxView.jsx`, `tokens.css`: Modularize inbox, add nav items, polish tokens | none | DONE |
| M3 | Finance & Trip Ledgers Interface | `electron-app/src/components/FinanceView.jsx`: Ledgers, gap audit, expense router, attach receipt, close trip | M1, M2 | DONE |
| M4 | Meetings, Fathom Sync & Ingestion Interface | `electron-app/src/components/MeetingsView.jsx`, `FileSlideover.jsx`: Fathom sync, MoM prompt, doc conversion | M1, M2 | DONE |
| M5 | Entities, Organizations, Brands & Credentials | `electron-app/src/components/EntitiesView.jsx`, `CredentialsModal.jsx`: Orgs, brands, research, merge, credentials | M1, M2 | DONE |
| M6 | Timeline & Activity Stream View | `electron-app/src/components/TimelineView.jsx`: Chronological event log across meetings, decisions, expenses, tasks | M1, M2 | DONE |
| M7 | Final E2E Integration, Hardening & Audit | Full verification: E2E tests, lint (0 errors), build pass, challenger coverage, forensic audit | M1..M6 | DONE |

## Interface Contracts

### IPC Contract (`electron-app/preload.cjs` ↔ `electron-app/main.js` ↔ `actions.mjs`)
- Frontend invokes: `window.dori.call(actionId, inputPayload)`
- Main dispatches: `getAction(actionId).handler(parsedInput)`
- Action returns: Promise resolving to JSON-serializable output or throwing descriptive error.

### Action Signatures:
1. `list_trip_ledgers`: input `{}`, output `Array<{ threadId, relPath, trip, account, status, rowCount, incompleteCount, total, reimbursableTotal }>`
2. `get_trip_ledger`: input `{ target: string }`, output `{ threadId, relPath, ledger, totals }`
3. `check_reimbursement_gaps`: input `{ target: string }`, output `{ ledgerRelPath, trip, status, claimItems, excludedItems, gaps, complete }`
4. `route_expense`: input `{ message: string, key?: string }`, output `{ action, ledger?, row?, record? }`
5. `attach_receipt`: input `{ filePath, date, desc, amount, thread?, trip?, account?, category?, tax?, paidBy?, reimbursable?, bookingRef?, supersedes?, id? }`, output `{ success, threadId, ledgerPath, id, attachmentPath, supersededId? }`
6. `close_trip`: input `{ target: string, status?: 'submitted' | 'paid' }`, output `{ ledgerRelPath, packageRelPath, status, claimTotal, gaps }`
7. `list_fathom_meetings`: input `{ since?: string }`, output `Array<{ recordingId, title, date, durationMin, url, isFiled }>`
8. `get_fathom_meeting`: input `{ recordingId: string, since?: string }`, output `{ recordingId, title, date, transcript, segments }`
9. `route_meeting`: input `{ attendees: string[], selfName?: string, key?: string }`, output `{ action, projectPath?, record? }`
10. `get_meeting_prep`: input `{ attendees: string[], project?: string }`, output `{ attendees, priorMeetings, openTasks }`
11. `list_orgs`: input `{}`, output `Array<{ name, slug, role, people, evidence }>`
12. `ensure_org`: input `{ orgName, personSlug?, personName?, evidenceText?, role?, requireEvidence? }`, output `{ orgSlug, created, linked }`
13. `list_brands`: input `{}`, output `Array<{ name, slug, owner, company, primary, accent, fontDisplay, fontBody, logo }>`
14. `get_brand`: input `{ name: string }`, output `{ brand, context }`
15. `set_brand`: input `{ name, owner?, company?, primary?, accent?, fontDisplay?, fontBody?, logo? }`, output `{ slug, saved }`
16. `research_person`: input `{ name: string, company?: string, context?: string }`, output `{ summary, sources }`
17. `research_and_recommend`: input `{ name: string, company?: string, context?: string, project?: string }`, output `{ person, org, colleagues, relatedDocs, webSummary }`
18. `merge_entity`: input `{ type: 'person' | 'org', sourceSlug: string, targetSlug: string }`, output `{ success, sourceSlug, targetSlug, updatedFiles }`
19. `list_decisions`: input `{ status?: string }`, output `Array<{ id, summary, decidedAt, owner, status, topics }>`
20. `create_decision`: input `{ summary: string, confidence?: number, owner?: string, topics?: string[], decidedAt?: string, source?: string }`, output `{ id, created }`
21. `timeline`: input `{ limit?: number, since?: string }`, output `Array<{ date, kind: 'meeting' | 'decision' | 'task' | 'expense', label, ref }>`
22. `convert_document`: input `{ filePath: string }`, output `{ markdown: string, metadata?: any }`
23. `list_credentials`: input `{}`, output `Array<{ service, fieldCount, hasPlain }>`
24. `find_credentials`: input `{ query: string }`, output `Array<{ service, label, aliases }>`
25. `start_credential_server`: input `{}`, output `{ url: string }`

## Code Layout
- Backend Actions & Scripts: `/Users/shri/proto-space/dori-mini/` (`actions.mjs`, `*.mjs`)
- Electron Main & Preload: `/Users/shri/proto-space/dori-mini/electron-app/` (`main.js`, `preload.cjs`, `package.json`)
- Frontend Source: `/Users/shri/proto-space/dori-mini/electron-app/src/`
  - `App.jsx`, `main.jsx`, `tokens.css`
  - `components/`: `Sidebar.jsx`, `ChatView.jsx`, `TasksView.jsx`, `ProjectsIndexView.jsx`, `ProjectView.jsx`, `LibraryView.jsx`, `ProfileView.jsx`, `InboxView.jsx`, `FinanceView.jsx`, `MeetingsView.jsx`, `EntitiesView.jsx`, `TimelineView.jsx`, `FileSlideover.jsx`, `SearchModal.jsx`, `SettingsModal.jsx`, `CredentialsModal.jsx`
  - `lib/`: `motion.js`, `utils.js`
