# Changelog

## [2026-09-02] — Fix `get_document` Action Schema to Accept `path` and `relPath` Aliases

**Branch**: `main`

### What changed
- Updated `get_document` action definition in `actions.mjs` to accept either `path` or `relPath` via Zod union refinement, preventing remote call validation crashes.
- Updated `ViewCanvas.jsx` and `ProjectView.jsx` to pass both `path` and `relPath`.
- Ensured both `html` and `renderedHtml` fields are returned by `get_document`.

### Why
`get_document` previously strictly required `{ path: string }`, which caused Zod `invalid_type: Required` validation errors when callers passed `{ relPath: ... }`.

### Files touched
- `actions.mjs` — Relaxed `get_document` schema to accept `path` or `relPath`
- `electron-app/src/components/ViewCanvas.jsx` — Updated `get_document` IPC call
- `electron-app/src/components/ProjectView.jsx` — Updated context document fetch

## [2026-09-02] — Fix Sidebar, ViewCanvas and Project Dashboard Color Contrast with Theme-Aware Tokens

**Branch**: `main`

### What changed
- Replaced hardcoded `text-white/*` and `border-white/*` opacity values in `Sidebar.jsx`, `ViewCanvas.jsx`, and `ProjectView.jsx` with semantic, theme-aware tokens (`text-foreground`, `text-foreground-secondary`, `text-muted-foreground`, `border-border`, and `bg-card`).
- Restored crisp, clear readability across both light and dark themes.

### Why
Hardcoded white text classes on light/canvas backgrounds caused severe contrast failure and rendered sidebar navigation labels unreadable.

### Files touched
- `electron-app/src/components/Sidebar.jsx` — Swapped hardcoded text-white for semantic foreground tokens
- `electron-app/src/components/ViewCanvas.jsx` — Updated toolbar and reader body colors
- `electron-app/src/components/ProjectView.jsx` — Updated cockpit cards and text contrast

## [2026-09-02] — Real Dori Design Alignment: ViewCanvas Workspace, Refined Sidebar & Single-Canvas Project Dashboard

**Branch**: `main`

### What changed
- **Co-Mounted ViewCanvas Workspace (`ViewCanvas.jsx`)**:
  - Replaced the modal slide-over with a persistent, resizable right-docked workspace canvas co-mounted alongside the active route.
  - Implemented interactive drag-to-resize separator with localStorage width persistence (`MIN_WIDTH: 480px`, `MAX_WIDTH: 1300px`, double-click reset).
  - Added dedicated reader toolbar: dynamic text-size scaling (`A-` / `A+`), copy path/link, workspace maximize toggle (`Maximize2` / `Minimize2`), and document navigation history back stack.
- **Refined Sidebar Metrics & Spaces Geometry (`Sidebar.jsx` & `tokens.css`)**:
  - Calibrated navigation row height to $34.4\text{px}$ (`min-h-[2.15rem]`), font size to $13\text{px}$ (`text-[13px]`), border-radius to $10\text{px}$, and Lucide icon stroke-width to $1.55\text{px}$.
  - Added Categorical Space Accent palette tokens (`--space-work`, `--space-now`, `--space-knowledge`, `--space-personal`, `--space-system`).
  - Added collapsible project and space groups with quick-create `+` menu.
- **Single-Canvas Quick-Use Project Dashboard (`ProjectView.jsx`)**:
  - Redesigned project view into a single continuous cockpit: Breadcrumbs + Meta stats + Sub-projects dropdown chip with inline `+ Quick add`.
  - Promoted Context card (`ℹ Context [>]`) with direct ViewCanvas reader trigger, Open Loops tasks with interactive completion toggles, and unified Activity Feed.
  - Integrated scoped chat and assistant composer at the bottom.

### Why
Align Dori Go (`electron-app`) directly with real Dori (`dori-portal`) design tokens, surface geometry, and non-blocking co-mounted reading workflows.

### Files touched
- `electron-app/src/components/ViewCanvas.jsx` — Created co-mounted resizable canvas with reader toolbar and history navigation
- `electron-app/src/components/Sidebar.jsx` — Refined row metrics ($34\text{px}$), $13\text{px}$ typography, and $1.55\text{px}$ icon line-weights
- `electron-app/src/components/ProjectView.jsx` — Replaced tabbed view with single-canvas quick-use cockpit
- `electron-app/src/App.jsx` — Swapped slideover with persistent ViewCanvas
- `electron-app/src/tokens.css` — Added Space Accent palette and sidebar field tokens
- `CHANGELOG.md` — Documented changes

## [2026-09-02] — Two-Phase Automated Background Meeting Minutes Processing Pipeline

**Branch**: `main`

### What changed
- **Two-Phase Meeting Minutes Processor (`process-meeting-minutes.mjs`)**:
  - Implemented hybrid two-phase processing pipeline mirroring `dori-engine` (`src/workflows/meeting-document.ts`).
  - **Phase 1 (Fast Tier / Compression)**: Transcripts >= 6,000 characters (~1,500 tokens threshold) undergo a fast lossless-for-facts compression pass to eliminate conversational filler while preserving all dates, numbers, attributions, and decisions verbatim.
  - **Phase 2 (Reasoning Tier / Extraction)**: Runs `mom-prompt.md` over the structured agenda to produce complete, high-fidelity Executive Summaries, Topics Discussed, Decisions Log, and Action Items.
  - **Phase 3 (Task Extraction & SQLite Reindexing)**: Automatically pushes self-assigned action items to `.dori/tasks/records/` via `task-store.mjs` and re-indexes SQLite `portal.db`.
- **Automated Background Polling Integration (`fathom-poll.mjs`)**:
  - Wired `processMeetingMinutes` into `fathom-poll.mjs` so newly fetched Fathom recordings are automatically summarized into structured MOMs and indexed on arrival with graceful fallback if the AI engine is offline.
- **Action Registry (`actions.mjs`)**:
  - Registered `process_meeting` action exposing the two-phase processor via IPC and MCP.

### Why
Ensure all incoming meeting recordings are automatically processed into executive minutes and tasks on arrival without requiring manual user intervention or choking LLM context windows on long transcripts.

### Files touched
- `process-meeting-minutes.mjs` — Created two-phase meeting processor
- `fathom-poll.mjs` — Automated MOM extraction on new recordings
- `actions.mjs` — Registered `process_meeting` action
- `CHANGELOG.md` — Documented changes

## [2026-09-02] — Clean Timeline & Processed Notes Indexing Pipeline

**Branch**: `main`

### What changed
- **Restored Canonical SQLite Data Pipeline (`timeline.mjs`)**:
  - Removed ad-hoc filesystem scanning and mtime guessing from `timeline.mjs`. All timeline meetings are sourced directly through canonical `listDocs()` from `query-vault.mjs`, preserving authentic meeting dates from frontmatter/filenames.
- **Processed Notes Search & Recall Indexing (`reindex-vault.mjs`)**:
  - Excluded raw verbatim transcript bodies (`## Transcript`) from search index (FTS) and default note content, indexing only the processed note/MOM portion so search and recall index real decisions, actions, and insights.
- **Meeting Slide-Over Tabs (`FileSlideover.jsx`)**:
  - For meeting documents containing transcripts, separated the processed MOM notes and the raw transcript into clean segmented tabs (`[ Minutes of Meeting (MOM) ]` and `[ Full Transcript ]`).

### Why
Maintain the simple, deterministic pipeline without file tampering or fallback date guesswork, keeping processed notes front-and-center.

### Files touched
- `timeline.mjs` — Restored clean canonical `listDocs()` sourcing
- `reindex-vault.mjs` — Index only processed note portion into FTS and rendered HTML
- `electron-app/src/components/FileSlideover.jsx` — Clean MOM vs Transcript tab separation


## [2026-09-01] — Full Vault Meeting Timeline Aggregation & Distinct Card Themes

**Branch**: `main`

### What changed
- **Vault Meeting Discovery (`timeline.mjs`)**:
  - Replaced SQLite-only meeting queries with automatic scanning of real meeting markdown files across `accounts/*/meetings/`, `projects/*/meetings/`, `meetings/`, and `captures/` in the vault ($VAULT_ROOT).
  - Dynamically parses meeting dates from frontmatter, filename patterns (`YYYY-MM-DD`), and file timestamps, and extracts titles and associated organizations.
- **Visual Differentiation of Timeline Event Cards (`TimelineView.jsx`)**:
  - **Distinct Left Border Accents**:
    - **Meetings**: Rich indigo accent (`border-l-4 border-l-indigo-600`), indigo icon bubble, and Organization / Attendee count chips.
    - **Decisions**: Amber accent (`border-l-4 border-l-amber-500`), compass icon bubble, and decision status badge.
    - **Expenses**: Emerald accent (`border-l-4 border-l-emerald-600`), receipt icon bubble, and green amount pill with trip name.
    - **Tasks**: Blue accent (`border-l-4 border-l-blue-600`), check icon bubble, and task status chip.
    - **Notes / Clippings**: Purple accent (`border-l-4 border-l-purple-600`).
  - Added kind-specific metadata chips and high-contrast typography across all chronological groups.

### Why
Ensure all 480+ meetings in the vault appear in the timeline chronologically, and give each activity type an immediate, distinct visual identity so the user can scan the timeline effortlessly.

### Files touched
- `timeline.mjs` — Added vault filesystem scanner for meetings
- `electron-app/src/components/TimelineView.jsx` — Themed left border accents, distinct icon bubbles, and kind-specific metadata chips


## [2026-09-01] — Base Font Sizing & Finance Screen Typography Upgrade

**Branch**: `main`

### What changed
- **Global Base Font Scaling**:
  - Upgraded root `html, body` font-size in `index.html` from `15px` to standard `16px` (`1rem = 16px`), eliminating the global 6.25% down-scaling across all desktop views.
- **Finance & Trip Ledgers View Overhaul (`FinanceView.jsx`)**:
  - **Overview Stat Cards**: Scaled up metrics to `text-2xl font-bold font-mono`, labels to `text-xs font-bold uppercase tracking-wider text-muted-foreground`, and card padding to `p-5 rounded-xl border border-border shadow-xs`.
  - **Quick Expense Router**: Enlarged input to `h-11 px-4 text-sm font-medium`, route button to `h-11 px-5 text-sm font-semibold`, and suggestion pills to `px-3 py-1 text-xs font-medium`.
  - **Status Tabs & Search**: Implemented Shadcn-style segmented tabs (`h-9.5 px-4 text-sm font-semibold rounded-lg`) with badge counters and enlarged search box to `h-10 text-sm`.
  - **Trip Ledger Cards**:
    - Scaled card titles to `text-[17px] font-bold text-foreground tracking-tight`.
    - Upgraded financial metric strip to `text-[16px] font-mono font-bold text-foreground` and `text-emerald-600` with `text-[11.5px] font-bold uppercase` headers.
    - Upgraded action buttons (`View Ledger`, `Audit Gaps`, `+ Receipt`, `Submit` / `Mark Paid`) to `h-8.5 px-3.5 text-xs font-bold`.

### Why
Resolve difficult-to-read micro-typography and undersized controls on large desktop screens by setting proper 16px root font scaling and upgrading Finance view cards, inputs, and buttons.

### Files touched
- `electron-app/index.html` — Set root font-size to 16px
- `electron-app/src/components/FinanceView.jsx` — Overhauled typography, stat cards, tabs, and ledger cards


## [2026-09-01] — Shadcn/Base UI Layout Polish, High Contrast, and Typography Scaling

**Branch**: `main`

### What changed
- **Design Tokens & High Contrast**:
  - Darkened and sharpened semantic light-mode text hierarchy in `tokens.css`: `--foreground` (`#0f172a`, deep slate-900), `--foreground-secondary` (`#334155`, slate-700), `--muted-foreground` (`#475569`, slate-600) with crisp structural borders (`--border` `#cbd5e1`).
  - Increased font weight hierarchy across headings (`font-bold` / `font-semibold`), metadata chips, and body text for effortless legibility.
- **Sidebar Project Tree Tuning**:
  - Replaced busy nested folder icons with clean root folder glyphs and minimalist indented hierarchy dots with active rings.
- **Shadcn/Base UI Card & Tab Layouts**:
  - Elevated cards across `EntitiesView.jsx`, `ProjectsIndexView.jsx`, and `TimelineView.jsx` with `rounded-xl border border-border bg-card p-5 shadow-xs hover:border-foreground/25 hover:shadow-md`.
  - Replaced small filter chips with Shadcn-style Segmented Tabs and Pill Buttons with bold active states and badge counters.
  - Scaled up minimum text sizes across cards, summaries, and metadata chips (`text-sm` base body, `text-[17px]` card titles, `text-[13px]` metadata).

### Why
Refine cards, tabs, and sidebar layout to match modern Shadcn/Base UI design patterns, improve text contrast and weight, and eliminate cramped micro-typography.

### Files touched
- `electron-app/src/tokens.css` — High contrast text and border tokens, enhanced font weights
- `electron-app/src/components/Sidebar.jsx` — Cleaned up project tree icons and active states
- `electron-app/src/components/EntitiesView.jsx` — Shadcn-style cards, tab lists, and bold typography
- `electron-app/src/components/ProjectsIndexView.jsx` — Elevated project cards, borders, and typography
- `electron-app/src/components/TimelineView.jsx` — Elevated timeline cards, filter tabs, and search bar


## [2026-09-01] — Real Vault Accounts Discovery & Desktop UI Alignment in Entities

**Branch**: `main`

### What changed
- Enhanced `org-store.mjs` to discover and load all client and prospect accounts directly from `accounts/<slug>/` in addition to `entities/organizations/`, and to parse people entities from `entities/people/`.
- Exposed `list_accounts` and `list_people` in `actions.mjs`.
- Redesigned `electron-app/src/components/EntitiesView.jsx`:
  - Upgraded font and button sizing to standard desktop scale (`text-sm` base body font, `text-lg` headings, `h-9`/`h-10` inputs and buttons).
  - Implemented rich Accounts & Organizations cards with relationship status badges (`Client`, `Proposal Sent`, `Active`, `Discovery`), kind badges, summaries, domains, and interactive linked contacts rosters.
  - Added full People Directory tab displaying all 33+ contacts from `entities/people/` with quick research triggers.
  - Standardized layout, filters, search bars, and card styles to match `ProjectsIndexView.jsx` and `FinanceView.jsx`.

### Why
Fix missing organizations and accounts by connecting to the real `accounts/` directory in the vault, and align UI sizing, typography, and presentation density with the rest of the Dori product screens.

### Files touched
- `org-store.mjs` — Added `loadAccounts` and `loadPeople` discovery logic
- `actions.mjs` — Registered `list_accounts` and `list_people`
- `electron-app/src/components/EntitiesView.jsx` — Redesigned UI with desktop typography, rich accounts cards, and people directory


## [2026-09-01] — Milestone 5: Entities, Organizations, Brands & Credentials Interface (R4, R7)

**Branch**: `main`

### What changed
- Implemented complete Entities Directory UI (`electron-app/src/components/EntitiesView.jsx`):
  - **Organizations Tab**:
    - Lists organization entities with roles, linked people tags, and affiliation evidence text loaded via `window.dori.call('list_orgs', {})`.
    - Role badge filtering (`All`, `Client`, `Vendor`, `Partner`, `Employer`, `None`) with semantic badge color coding.
    - Live search across organization names, roles, linked people, and affiliation evidence.
    - "Add Organization" modal calling `window.dori.call('ensure_org', payload)` supporting person name/slug linkage, affiliation evidence text validation, and strict evidence gate toggle.
    - Direct actions for jumping to person research and viewing organization markdown files in vault.
  - **Brands Tab**:
    - Lists brand entities loaded via `window.dori.call('list_brands', {})` with company, owner, logo/monogram, and interactive color palette swatches (Primary, Accent) with hex codes.
    - Typography specification cards showing display font and body font.
    - "Brand Guidelines & Voice" drawer fetching prompt context via `window.dori.call('get_brand', { name })` with copyable prompt block for AI writing in brand voice.
    - "Create / Edit Brand" modal calling `window.dori.call('set_brand', payload)` with integrated color pickers and typography configurations.
  - **People & Research Tab**:
    - Person research and contextual meeting briefing console supporting both full vault & web synthesis (`research_and_recommend`) and public web search (`research_person` via Tavily).
    - Multi-stage loading state and structured briefing output featuring:
      - Existing vault relationship status banner (Known vs Cold company)
      - Known vault colleagues roster
      - Related vault documents list with click-to-open slideover navigation
      - Web research hits with title, link, and content snippets
      - One-click "Copy Briefing" markdown action
  - **Entity Merging Tab**:
    - Non-destructive deduplication and canonicalization interface for Person and Organization entities.
    - Source entity and canonical target entity selection with live impact preview.
    - Confirmation dialog warning before execution and non-destructive guarantee (moving source file to `merged/` with redirection, unioning aliases/people, and rewriting cross-references).
    - Executes `window.dori.call('merge_entity', payload)` with detailed result breakdown card.
- Implemented Credentials Vault Modal (`electron-app/src/components/CredentialsModal.jsx`):
  - Searchable service credentials list via `window.dori.call('list_credentials', {})` and `find_credentials` with encryption indicators (AES-256-GCM).
  - Expandable field breakdown inspecting registered service fields without exposing secret cleartext to the renderer.
  - "Add Credential Securely" button that invokes `window.dori.call('start_credential_server', {})` to launch ephemeral token intake server and open the intake form in the system browser.
  - Ephemeral intake server banner displaying active endpoint URL, copy link, and expiration notice.
- Visual Polish & Token Consistency:
  - Centralized design tokens with Figtree typography, `--surface-canvas` background, universal card styling (`universal-card`), loading skeletons, and interactive empty states.

### Why
Provide a comprehensive, native-grade entity management interface in Dori Go, enabling users to organize organizations with affiliation evidence bars, configure brand design themes and voice guidelines, research people and synthesize meeting briefings, safely merge duplicate identities, and manage encrypted credentials.

### Files touched
- `electron-app/src/components/EntitiesView.jsx` — Implemented 4-tab entity directory (Organizations, Brands, People & Research, Entity Merging).
- `electron-app/src/components/CredentialsModal.jsx` — Implemented credentials vault modal with search and secure ephemeral intake server launcher.

## [2026-09-01] — Milestone 4: Meetings, Fathom Sync & Ingestion Interface (R3, R6)

**Branch**: `main`

### What changed
- Created Meetings & Fathom Sync UI (`electron-app/src/components/MeetingsView.jsx`):
  - Fathom Recordings Sync & Directory:
    - Lists meeting recordings via `window.dori.call('list_fathom_meetings', { includeFiled: true })` displaying meeting title, date, duration, Fathom URL, and `Filed in Vault` vs `Unfiled` status badges.
    - Interactive filter chips (`All Recordings`, `Unfiled`, `Filed in Vault`) with live count indicators and live text search across titles, dates, and attendee names.
    - Graceful error banner and configuration guide when `FATHOM_API_KEY` is not set, with direct link to Fathom API settings.
  - Meeting Detail & Transcript Viewer:
    - Detailed drawer/slideout fetching speaker-labeled transcript segments via `window.dori.call('get_fathom_meeting', { recordingId })`.
    - Segment cards with speaker avatars, formatted timestamps, and speech text.
    - One-click "Copy Transcript" action with visual confirmation feedback.
  - Meeting Routing & Minutes of Meeting (MoM) Filing:
    - Automatically computes project routing recommendation via `window.dori.call('route_meeting', { attendees, key })` with match confidence indicator (`High Confidence`, `Suggested`, `Unbound`).
    - Destination project selector populated from `list_projects` with custom project entry support.
    - Integrated structured MoM markdown template editor with summary, key decisions, and action items.
    - Files meeting notes into vault via `window.dori.call('file_meeting', payload)` with automatic reindexing and direct "View Filed Note" button.
  - Meeting Prep & Context Briefing:
    - Generates meeting briefing via `window.dori.call('get_meeting_prep', { attendees, project })`.
    - Displays attendee classification (`Known`, `Ambiguous`, `Newly seen`), prior related meeting history, and open tasks (Your tasks vs Others' tasks).
    - One-click "Copy Brief" action.
  - Visual Polish & Token Consistency:
    - Styled with Figtree typography, `--surface-canvas` background, universal cards, loading skeletons, and interactive empty states.
- Enhanced File Slideover Drawer (`electron-app/src/components/FileSlideover.jsx`):
  - Document Markdown Conversion Preview:
    - Detects non-markdown document formats (PDF, DOCX, PPTX, XLSX, CSV, EPUB, RTF, ODT).
    - Provides a prominent "Preview as Markdown" / "Convert Now" action invoking `window.dori.call('convert_document', { filePath })`.
    - Renders converted markdown in the Tiptap viewer with loading spinner skeleton, error recovery with retry, and full editing/saving support.
  - YouTube Media Capture Rich Preview:
    - Detects YouTube capture notes and renders dedicated header card with video title, channel/uploader metadata, published date, duration badge, and direct YouTube video link.
    - Renders interactive Uploader Chapters list with timestamp badges (`00:00`, `04:12`).
    - Renders Uploader Description metadata card in monospace format.

### Why
Provide a complete meeting capture and ingestion workflow in Dori Go, enabling users to sync Fathom recordings, review speaker transcripts, file structured meeting minutes into destination projects, generate attendee prep briefings, preview non-markdown documents as markdown, and inspect YouTube media notes with uploader chapters.

### Files touched
- `electron-app/src/components/MeetingsView.jsx` — Complete Meetings and Fathom Sync view component.
- `electron-app/src/components/FileSlideover.jsx` — Enhanced with on-device document markdown conversion preview and rich YouTube media capture cards.


## [2026-09-01] — Milestone 3: Finance & Trip Ledgers Interface (R2)

**Branch**: `main`

### What changed
- Implemented full-featured Finance & Trip Ledgers UI (`electron-app/src/components/FinanceView.jsx`):
  - Overview Header & Stat Metrics Cards:
    - Displays Total Spent, Reimbursable Total, Active / Open Trips count, and Audit Health (missing receipts/dates) with real-time aggregation.
    - Integrated quick actions for Refresh (with spinning state) and Attach Receipt modal trigger.
  - Quick Expense Natural-Language Router:
    - Input bar to parse and route natural-language expense statements ("spent $50 on dinner in Tokyo") via `window.dori.call('route_expense', { message })`.
    - Real-time decision feedback cards with status badges (`moved`, `suggested`, `conflict`, `none`, `not_expense`), candidate selectors, and auto-refresh on route.
    - Quick example prompt chips for rapid testing.
  - Ledgers Grid & List Workspace:
    - Filter chips for status (`All`, `Drafts`, `Submitted`, `Paid`) with live count indicators.
    - Live text search filtering across trip names, account labels, and paths.
    - Responsive 2-column ledger cards showing trip title, account badge, status badge (`draft`, `submitted`, `paid`), financial summary (Total, Reimbursable, Rows), incomplete item alert badge, and quick action buttons.
  - Itemized Ledger Detail Drawer / Modal:
    - Fetches full ledger breakdown via `window.dori.call('get_trip_ledger', { target })`.
    - Displays trip overview, key metrics strip, quick action toolbar, and itemized expenses table (Date, Description, Category, Amount, Tax, Paid By, Reimbursable, Attachments with slideover preview links, Incomplete alert flags).
  - Reimbursement Gap Detection Modal:
    - Triggers audit check via `window.dori.call('check_reimbursement_gaps', { target })`.
    - Displays audit health hero banner (Green Check for clean submission readiness vs Amber Alert for missing evidence), claim vs excluded item counts, and line-by-line findings with direct "Attach" remediation buttons.
  - Attach Receipt Modal:
    - Modal supporting drag-and-drop or file picker for receipt images (PNG, JPG, WEBP) and PDFs.
    - Resolves filesystem path via `window.dori.getFilePath(file)`.
    - Form fields: Trip/Thread selector, Date, Description/Vendor, Amount, Category dropdown, Tax, Paid By, Reimbursable checkbox, Booking Ref, Supersedes ID.
    - Calls `window.dori.call('attach_receipt', payload)` and displays confirmation with generated ledger path.
  - Close Trip & Reimbursement Package Modal:
    - Status transition forward selector (draft -> submitted -> paid).
    - Pre-flight gap check warning.
    - Invokes `window.dori.call('close_trip', { target, status })` to generate structured Markdown package (`*-reimbursement-package.md`) and transition status.
    - Direct action button to open generated reimbursement package in `FileSlideover`.
  - Visual Polish & Token Consistency:
    - Figtree typography, semantic surface tokens (`--surface-canvas`, `--surface-panel`, `--surface-field`), card styling (`universal-card`), loading skeletons, and interactive empty states.

### Why
Provide a complete, native-grade finance management and expense reconciliation interface in Dori Go, empowering users to track trip expenses, route plain-text receipts, audit evidence gaps, and assemble formal reimbursement packages.

### Files touched
- `electron-app/src/components/FinanceView.jsx` — Complete Finance and Trip Ledgers UI implementation.

## [2026-09-01] — Milestone 6: Timeline & Activity Stream View

**Branch**: `main`

### What changed
- Implemented full-featured Timeline & Activity Stream view (`electron-app/src/components/TimelineView.jsx`):
  - Activity Stream Feed: loads chronological events via `window.dori.call('timeline', { limit: 100 })` with refresh action and animated spin indicator.
  - Event Types & Semantic Badges:
    - `meeting`: calendar icon (`Calendar`), blue badge styling.
    - `decision`: compass icon (`Compass`), purple badge styling.
    - `task`: check-circle icon (`CheckCircle2`), emerald badge styling.
    - `expense`: receipt icon (`Receipt`), amber badge styling.
  - Interactive Filter Chips & Search:
    - Filter chips for `All`, `Meetings`, `Decisions`, `Expenses`, `Tasks` displaying real-time event counts for each category.
    - Live text search filtering across event titles, document references, event kinds, and dates with clear search button.
  - Chronological Date Groupings:
    - Grouped timeline events into chronological buckets (`Today`, `Yesterday`, `This Week`, `Last Week`, `Earlier`) with event count indicators and divider rules.
  - Navigation & Reference Integration:
    - Card click and dedicated "Open" action buttons trigger `onOpenFile(event.ref)` / `onSelectDocument(event.ref)` to open documents in `FileSlideover`.
    - Dedicated "Copy" reference button copying path to clipboard with temporary "Copied" feedback badge.
  - Visual Polish & Token Consistency:
    - Styled with Figtree typography, `--surface-canvas` background, universal cards (`.universal-card`) with hover lift, `.anim-stagger` entrance animation, loading skeletons, and interactive empty states with filter reset actions.

### Why
Provide a unified, chronological activity stream in Dori Go across meetings, architectural decisions, task completions, and expenses with rich filtering, date grouping, and document inspection.

### Files touched
- `electron-app/src/components/TimelineView.jsx` — Complete Timeline and Activity Stream view component.

## [2026-09-01] — Milestone 1: Backend Actions & IPC Registry Expansion

**Branch**: `main`

### What changed
- Action Registry Expansion (`actions.mjs`):
  - Registered 30 new action handlers with validated Zod schemas (`inputSchema`), scope annotations (`read`/`write`), and MCP tool exposure (`exposeToMcp: true`).
  - Added Finance actions: `list_trip_ledgers` (and `list_ledgers` alias), `get_trip_ledger` (and `get_ledger` alias), `check_reimbursement_gaps`, `route_expense`, `attach_receipt`, `close_trip`.
  - Added Meetings & Fathom actions: `list_fathom_meetings`, `get_fathom_meeting`, `route_meeting`, `get_meeting_prep` (and `meeting_prep` alias), `file_meeting`.
  - Added Entities, Organizations & Brands actions: `list_orgs`, `ensure_org`, `list_brands`, `get_brand`, `get_brand_context`, `set_brand`, `research_person`, `research_and_recommend`, `merge_entity`.
  - Added Decision and Task actions: `list_decisions`, `create_decision`, `add_task`.
  - Added Document Conversion action: `convert_document`.
  - Added Credentials store actions: `list_credentials`, `find_credentials`, `start_credential_server`.
  - Updated action registry self-test count assertion to 52 actions.
- Timeline Expense Aggregation (`timeline.mjs`):
  - Imported `loadLedgers` from `./query-ledger.mjs` in `timeline.mjs`.
  - Aggregated itemized expense rows formatted as `{ date, kind: 'expense', label, ref }` sorted chronologically alongside meetings, decisions, and tasks.

### Why
Provide a complete, type-safe, IPC-callable action surface in `actions.mjs` and a unified activity stream in `timeline.mjs` powering Dori Go's frontend screens.

### Files touched
- `actions.mjs` — Registered 30 new actions with Zod schemas mapping to backend scripts.
- `timeline.mjs` — Integrated `loadLedgers()` to aggregate expenses in `buildTimeline()`.

## [2026-09-01] — Milestone 2: Core Shell, Navigation & Design Tokens Polish

**Branch**: `main`

### What changed
- Extracted `InboxView` (`electron-app/src/components/InboxView.jsx`):
  - Modularized `InboxScreen` from `App.jsx` into a dedicated full-featured component.
  - Implemented Figtree typography, semantic surfaces (`--surface-canvas`, `--surface-panel`), card classes (`universal-card`), loading skeletons, and informative empty states.
  - Added filter chips with badge counters, live search, destination selector for clarifications, and preview triggers for unrouted captures.
- Expanded Navigation & Create Menu (`electron-app/src/components/Sidebar.jsx`):
  - Added primary navigation items: `New chat` (`SquarePen`), `Inbox` (`Inbox`), `Tasks` (`Check`), `Projects` (`FolderKanban`), `Finance` (`Receipt`), `Timeline` (`Clock`), `Entities` (`Users`), and `Library` (`Library`).
  - Added create-menu action shortcuts: "New Note", "New Task", "New Expense", "New Entity", "New Project".
  - Integrated live inbox count badge in the sidebar navigation.
- Clean Application Routing & Shell Fallbacks (`electron-app/src/App.jsx`):
  - Wired routes across all primary views: `chat`, `inbox`, `tasks`, `projects`, `finance`, `timeline`, `entities`, `library`, `profile`, and `project:<path>`.
  - Added initial component shells for `FinanceView.jsx`, `TimelineView.jsx`, and `EntitiesView.jsx` so all screens render smoothly and compile without errors.

### Why
Provide a polished desktop shell, comprehensive navigation across all core capabilities, and modularized inbox experience aligned with real Dori product design tokens.

### Files touched
- `electron-app/src/components/InboxView.jsx` — Modular inbox view with filter chips, search, skeletons, and approval actions.
- `electron-app/src/components/Sidebar.jsx` — Expanded navigation items and create-menu action shortcuts.
- `electron-app/src/App.jsx` — Clean routing across all primary views with modular imports.
- `electron-app/src/components/FinanceView.jsx` — Initial component shell for finance and trip ledgers.
- `electron-app/src/components/TimelineView.jsx` — Initial component shell for chronological timeline stream.
- `electron-app/src/components/EntitiesView.jsx` — Initial component shell for organizations and brands directory.

## [2026-09-01] — New "dori" Wordmark Brand: Animated Splash, Hero, and App Icon

**Branch**: `main`

### What changed
- New brand assets (`electron-app/public/assets/`):
  - `dori-wordmark.png` / `dori-wordmark.webm` — SignPainter cursive wordmark, navy `#1a1f4e` with a gold `#d99b24` i-dot; the WebM is a 1.9s alpha-transparent handwriting reveal.
  - `icon.png` — dock/Cmd-Tab/favicon replaced with a white squircle carrying the full wordmark (was the gold "∞" tile).
- Splash screen (`index.html`): the pulsing icon + "Dori" text replaced by the animated wordmark video; bare on the canvas in light mode, on a white card in dark mode (the navy wordmark needs it there). React mount (`src/main.jsx`) now waits for the video's `ended` event, capped at 2.4s, so the reveal is never cut off and a stalled video can never block startup.
- Home hero (`ChatView.jsx`, `tokens.css`): icon tile swapped for the bare wordmark at 3.5rem on the warm-gray canvas.
- Generator scripts committed under `scripts/brand/` (geometry, frame renderer, icon builder, mask-coverage QA) with a regeneration README; deps are one-off (`npm i --no-save`), not in package.json.

### Notes
- The `.dark` class in `tokens.css` is defined but never toggled by the app; the hero always renders on the light canvas. If dark mode is ever wired up, the hero and splash need the periwinkle/gold dark wordmark variant (generator supports it: `PALETTES.dark`).

## [2026-08-31] — Extract Markdown Action Items Attributed to People and Sync Task Status

**Branch**: `main`

### What changed
- Action Item Extraction (`query-vault.mjs`):
  - Added `extractActionItems` to scan meetings and project markdown files for checklist items (`- [ ]`, `- [x]`) under `# Action Items` / `# Tasks`.
  - Parsed assigned person attribution (`**Person Name**`, `@person`), deadlines (`| Deadline: ...`), and dependencies (`| Depends on: ...`).
  - Added `toggleMarkdownTask` to toggle markdown checklist checkboxes on disk when completing tasks in the UI.
- Supported Markdown Checklist Tasks in Actions (`actions.mjs`):
  - Updated `mark_task_done` action to seamlessly handle both engine task store records and file-based markdown checklist tasks (`<relPath>:<line>`).
- Person-Attributed Tasks Tab (`ProjectView.jsx`):
  - Grouped project tasks by assigned person with circular avatar badges and task count headers.
  - Displayed source document links (e.g. `2026-08-07 MoM`), due dates, and dependency pills.
  - Enabled inline completion toggling directly from the project tasks tab.

### Why
Attributed action items to their assigned people (e.g. Preethi Gopinath, Durgaprasad Shanmugam, Shrinath V) across meeting notes and project documents, allowing direct tracking and completion from the project view.

### Files touched
- `query-vault.mjs` — Added `extractActionItems` and `toggleMarkdownTask`.
- `actions.mjs` — Updated `mark_task_done` to support markdown checklist tasks.
- `electron-app/src/components/ProjectView.jsx` — Grouped and rendered tasks attributed to people.

## [2026-08-31] — Deduplicate Linked People and Enhance Slideover HTML Typography (17px)

**Branch**: `main`

### What changed
- Normalized Person Deduplication (`query-vault.mjs`):
  - Deduplicated people extracted from meeting attendee lists against known entity profiles using normalized slug matching (`durgaprasad-shanmugam` matches `Durgaprasad Shanmugam`).
  - Automatically prioritized rich entity files in `entities/people/` over plain meeting participant badges.
  - Filtered out self (`shrinath-v`, `shrinath-vignesh`, `shrinath.v@gmail.com`).
- Upgraded Slideover HTML Typography (`FileSlideover.jsx`):
  - Increased font size to `17px` (`text-[17px] leading-[1.8]`) with clear heading hierarchies (`text-2xl`, `text-xl`, `text-lg`), strong contrast, and spacious paragraph spacing.
  - Matched editor styling to 17px body font for seamless viewing and editing.

### Why
Prevent duplicate person chips across meeting attendees and entities, and ensure document contents are easily readable with crisp 17px publication-quality HTML typography.

### Files touched
- `query-vault.mjs` — Added normalized slug deduplication and self-filtering for people.
- `electron-app/src/components/FileSlideover.jsx` — Upgraded HTML typography and editor to 17px leading-[1.8].

## [2026-08-31] — 50% Slideover Width, Person Linked Meetings, and Scannable Brief Highlights

**Branch**: `main`

### What changed
- Scannable Project Brief Cards (`ProjectView.jsx`): parsed context notes into structured key-value badges (Type, Status, Contact, Key References) and clean summary paragraphs instead of raw markdown syntax strings.
- 50% Slideover Layout (`FileSlideover.jsx`): expanded the slideover panel width to 50% on desktop (`w-full md:w-1/2 max-w-none`), giving a balanced reading split view with the background blurred.
- Linked Meetings in Slideover (`FileSlideover.jsx` & `query-vault.mjs`):
  - Added `findMeetingsForPerson` in `query-vault.mjs` to resolve all meetings where a person is tagged as attendee or participant across `meetings/`, `captures/`, and `projects/<path>/meetings/`.
  - Displayed interactive Linked Meeting cards inside the person slideover with click-to-open navigation.
  - Added direct discovery of `projects/<path>/meetings/` subfolders in `getProjectDetails`.

### Why
Provide a readable, scannable overview on project pages and complete relational context (linked meetings) on person slideover drawers with a 50% screen split.

### Files touched
- `query-vault.mjs` — Added `findMeetingsForPerson` and `projects/<path>/meetings` scanning.
- `electron-app/src/components/ProjectView.jsx` — Implemented structured brief highlights.
- `electron-app/src/components/FileSlideover.jsx` — Set 50% width and added linked meeting cards.

## [2026-08-31] — Strip Frontmatter from Rendered HTML and Add Metadata Property Grid to Slideover

**Branch**: `main`

### What changed
- Frontmatter Stripping in `get_document` (`actions.mjs`): parsed and separated YAML frontmatter from document body before sending content to `renderMarkdownToHtml`, eliminating raw `---` lines and unformatted key-value text paragraphs from rendered HTML.
- Structured Metadata Grid in `FileSlideover.jsx`: added a clean property card displaying parsed fields (Role, Organization, Relationship, Projects, Last Contact, Attendees, Status) as styled badges above the document article.
- Enhanced Document Typography: rendered article body using clean `prose dark:prose-invert` styling with readable line heights and heading styles.

### Why
Present entity profiles and documents with proper formatting matching Dori Portal, replacing raw YAML text with a structured metadata grid and clean markdown HTML body.

### Files touched
- `actions.mjs` — Separated frontmatter from body in `get_document`.
- `electron-app/src/components/FileSlideover.jsx` — Added metadata property block and styled typography.

## [2026-08-31] — Complete Action Registry Verification for URL Captures and Profile Updates

**Branch**: `main`

### What changed
- Registered `capture_url` in `actions.mjs`: enables capturing web links and YouTube videos directly into the vault from `AddToProfileModal` and `ChatView` quick-capture modals.
- Registered `save_profile` in `actions.mjs`: added direct alias for `set_profile` ensuring compatibility with `SettingsModal` and MCP clients.
- Exported `isYouTubeUrl` helper from `route-destination.mjs`.
- Verified all 22 actions across frontend IPC callers and test suites with 100% pass rate.

### Why
Close all loose ends across IPC action dispatch, ensuring every user modal and renderer call maps to an authoritative handler.

### Files touched
- `actions.mjs` — Registered `capture_url` and `save_profile` with Zod validation.
- `route-destination.mjs` — Exported `isYouTubeUrl`.

## [2026-08-31] — Enable Direct Filesystem Document Resolution for Slideover and Viewer

**Branch**: `main`

### What changed
- Enhanced `getDocument` in `query-vault.mjs`:
  - Added direct filesystem resolution for `needle` and `${needle}.md` under `$VAULT_ROOT`.
  - Parses frontmatter and returns full document content and metadata even for files in `entities/people/`, `research/`, `projects/`, or newly saved markdown files that have not yet been indexed into SQLite `portal.db`.

### Why
Fix "Document could not be loaded" error when opening entity files (like `entities/people/durgaprasad-shanmugam.md` or `entities/people/preethi-gopinath.md`) in the slideover viewer.

### Files touched
- `query-vault.mjs` — Implemented filesystem check in `getDocument`.

## [2026-08-31] — Fix Breadcrumb Home Icon Alignment and Entity Frontmatter Parsing

**Branch**: `main`

### What changed
- Fixed Breadcrumbs Home Icon Alignment: updated `BreadcrumbLink` in `breadcrumbs.jsx` to `inline-flex items-center gap-1.5` so the `<Home>` icon and "Home" label stay horizontally aligned on a single row.
- Fixed Linked People Resolution:
  - Imported `readFileSync` and `parseFrontmatter` properly in `query-vault.mjs` to parse YAML multiline list frontmatter (`projects: [ - dsource-ai ]`).
  - Correctly resolved Preethi Gopinath and Durgaprasad Shanmugam for `dsource-ai` as linked entities.

### Why
Fix breadcrumb layout wrapping and ensure all people linked in `entities/people/*.md` appear in project headers and people tabs.

### Files touched
- `electron-app/src/components/ui/breadcrumbs.jsx` — Inline-flex alignment for breadcrumb links.
- `query-vault.mjs` — Fixed imports and YAML parser for disk people resolution.

## [2026-08-31] — Filter Internal Files, Extract Linked People from Transcripts, and Add Sticky d-source Tab

**Branch**: `main`

### What changed
- Cleaned Project Files: excluded internal dotfiles (`.setup.md`, `.DS_Store`) and config artifacts (`mempalace.yaml`, `entities.json`, `config.yaml`) so only real user documents and markdown files (`README.md`, `STATUS.md`, notes, PDFs, data) appear in the Files list.
- Linked People Extraction:
  - Scanned `entities/people/` on disk for project associations.
  - Automatically extracted external attendees from linked meeting transcripts (e.g. `kashyapnitin@gmail.com` -> `Nitin Kashyap`) and surfaced them under Linked People.
- Added Sticky `d-source` Tab above Composer:
  - Added `.chat-context-shelf` and `.chat-context-segment` in `tokens.css` and `ProjectView.jsx` directly above the docked composer capsule showing `[Folder Icon] d-source: projects/<projectPath>` matching Dori Portal.

### Why
Eliminate internal scaffolding noise from project views, accurately link attendees as project contacts, and anchor the composer with Dori's signature sticky `d-source` context tab.

### Files touched
- `query-vault.mjs` — Filtered internal files and added meeting attendee people extraction.
- `electron-app/src/tokens.css` — Added `.chat-context-shelf` styles.
- `electron-app/src/components/ProjectView.jsx` — Connected sticky `d-source` tab above docked composer.

## [2026-08-31] — Enable Dual Filesystem and Index Resolution for Project Details

**Branch**: `main`

### What changed
- Enhanced `getProjectDetails` in `query-vault.mjs`:
  - Added direct filesystem scanning of `projects/<projectPath>/` to discover all documents (`.setup.md`, `README.md`, `STATUS.md`, `mempalace.yaml`, `entities.json`, etc.) regardless of whether they have been indexed into `portal.db`.
  - Added fallback directory scans for `meetings/` and `captures/` to reliably detect related transcripts.

### Why
Ensure project folders with un-indexed or freshly created files display their complete file inventory and connected documents immediately.

### Files touched
- `query-vault.mjs` — Implemented dual filesystem and SQLite resolution in `getProjectDetails`.

## [2026-08-31] — Surface Linked Meetings, Linked People, and Docked Project Composer

**Branch**: `main`

### What changed
- Added `get_project_details` action in `actions.mjs` and `query-vault.mjs`: resolves all project files, meetings in `meetings/` linked via frontmatter `project`/`projects`, and people in `people/` or `research/` linked to the project.
- Rebuilt `ProjectView.jsx` Workspace:
  - Removed duplicate home idle hero stage ("Where should we begin?", big logo, prompt starter chips).
  - Added **Linked People** section and dedicated `People` tab with circular initials badges and role metadata.
  - Added **Linked Meetings** section and dedicated `Meetings` tab with meeting dates, titles, and attendee lists.
  - Added sleek **Docked Project Composer** fixed at the bottom of the page for contextual notes, questions, and captures.
  - Rendered conversation stream inline in the overview when messages are sent.

### Why
Provide authentic 1:1 Dori Portal project knowledge graph experience connecting people, meetings, files, and loops with a clean docked composer.

### Files touched
- `query-vault.mjs` — Added `getProjectDetails` query resolving files, linked meetings, and linked people.
- `actions.mjs` — Registered `get_project_details` action.
- `electron-app/src/components/ProjectView.jsx` — Surfaced linked meetings, people cards, and docked bottom composer.

## [2026-08-31] — Complete Project Detail Parity with Shadcn Attachments, Tabs, Files, and Projects Index

**Branch**: `main`

### What changed
- Added Shadcn Primitives:
  - `Attachment.jsx`: 1:1 ported Shadcn Attachment primitive matching Dori Portal (`Attachment`, `AttachmentGroup`, `AttachmentMedia`, `AttachmentContent`, `AttachmentTitle`, `AttachmentDescription`, `AttachmentActions`) supporting file type icons (Markdown, PDF, Image, Spreadsheet, etc.).
  - `Tabs.jsx`: accessible multi-tab switcher (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`).
  - `Breadcrumbs.jsx`: accessible hierarchy breadcrumb navigation (`Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`).
- Rebuilt Project Detail Page (`ProjectView.jsx`):
  - Added interactive breadcrumbs trail (`Home > Projects > [Parent] > [Project Title]`).
  - Added multi-tab workspace (`Overview`, `Files`, `Tasks`, `Context Chat`):
    - **Overview Tab**: Project context preview card (`.setup.md`, `context.md`, `project.md`, `README.md`) with slideover open CTA, recent files attachment grid, open loops / action items with checkboxes, and subprojects.
    - **Files Tab**: All documents and attachments under `projects/<projectPath>/` with extension icons, relative dates, and slideover preview on click.
    - **Tasks Tab**: All project-specific tasks with toggleable completion states and priority badges.
    - **Chat Tab**: Full-height contextual AI conversation workspace.
- Added Projects Index Workspace (`ProjectsIndexView.jsx`):
  - Displays all initiatives in a responsive card grid with file counts, open loop counts, subproject counts, and search filter.
  - Added `Projects` space to the main Sidebar navigation.

### Why
Bring full 1:1 feature and visual parity for Projects to Dori Go, using authentic Shadcn attachment cards, file listings, tasks, and tabs.

### Files touched
- `electron-app/src/components/ui/attachment.jsx` — Ported Shadcn Attachment primitives.
- `electron-app/src/components/ui/tabs.jsx` — Ported Shadcn Tabs primitives.
- `electron-app/src/components/ui/breadcrumbs.jsx` — Ported Shadcn Breadcrumb primitives.
- `electron-app/src/components/ProjectsIndexView.jsx` — Projects index workspace with situation cards.
- `electron-app/src/components/ProjectView.jsx` — Project detail page with tabs, files, tasks, and breadcrumbs.
- `electron-app/src/components/Sidebar.jsx` — Added Projects to primary nav.
- `electron-app/src/App.jsx` — Wired Projects index and project routes.

## [2026-08-31] — Enlarge Center Composer Bar, Hero Title, and Starter Prompt Chips

**Branch**: `main`

### What changed
- Center Composer Capsule:
  - Scaled height to `60px` (`min-h-[3.75rem]`), padding to `px-4.5 py-3`, and border-radius to `28px` (`rounded-[28px]`).
  - Upgraded input typography to `16.8px` (`1.05rem / font-size: 1.05rem`) with `1.5` line-height and `16.3px` placeholder.
  - Upgraded leading `+` action button to `38px` (`size={20}` icon) and trailing navy circular send button to `40px` (`size={16}` paper plane).
- Hero Stage:
  - Enlarged Dori logo to `4.25rem` (68px) with diffused brand shadow.
  - Scaled "Good evening" time-aware kicker to `15.2px` (`0.95rem`) and "Where should we begin?" headline to `clamp(2.2rem, 4vw, 3rem) font-semibold`.
- Starter Prompt Chips:
  - Scaled prompt chips to `15px` (`0.9375rem font-medium`), padding to `px-5 py-2.5`, and gap to `12px` (`gap-3 mt-7`).

### Why
Eliminate the disproportionately narrow/shallow composer slot and provide a spacious, luxurious home canvas matching Dori Portal.

### Files touched
- `electron-app/src/tokens.css` — Updated composer container dimensions, input font sizes, button diameters, and hero title clamping.
- `electron-app/src/components/ChatView.jsx` — Updated icon sizes and container spacing.

## [2026-08-31] — Interactive Draggable Sidebar Boundary and Enlarged Navigation Scale

**Branch**: `main`

### What changed
- Added Draggable Sidebar Resizing: built interactive right boundary drag handle (`.sidebar-resize-handle`) allowing smooth real-time resizing between 240px and 500px, persisting chosen width in `localStorage` (`dori.sidebar.width`), and double-click to reset to default 320px.
- Enlarged Spaces Navigation:
  - Upgraded nav links to `16px font-semibold text-foreground` (`text-[16px]`), `size={21}` icons, and `min-h-[2.85rem]` (46px).
- Enlarged Projects Tree:
  - Upgraded project rows to `15.5px font-medium text-foreground` (`text-[15.5px]`), `size={20}` amber gold folder icons, and `min-h-[2.65rem]`.
- Enlarged Profile Card:
  - Upgraded initials avatar to 44px badge (`h-11 w-11`), `16px font-semibold` user name, and `13px` role.

### Why
Allow full user customization of sidebar width via drag-and-drop while providing generous readability and touch-friendly desktop targets.

### Files touched
- `electron-app/src/components/Sidebar.jsx` — Implemented pointer drag resizing, localStorage persistence, and enlarged 16px navigation hierarchy.
- `electron-app/src/tokens.css` — Added `.sidebar-resize-handle` styling and active resize cursor rules.

## [2026-08-31] — Enrich Sidebar Typography, Contrast, and Brand Personality

**Branch**: `main`

### What changed
- Brand Header: styled `Dori` brand in `20px font-bold text-foreground` (`#1a1f4e`) with executive navy `+` create button (`bg-[var(--brand-primary)] text-white`).
- Search Bar: elevated to a crisp pure-white card (`bg-card border border-[var(--space-sidebar-border)] shadow-2xs`) with `14.5px font-medium` text and refined `/` keycap.
- Spaces Navigation: upgraded nav links to `15px font-bold text-foreground` on active and `15px font-medium` on idle, with active tint `bg-[var(--space-sidebar-field)]` and tinted icons.
- Projects Tree: upgraded project titles to `14.5px font-medium text-foreground`, added warm amber gold folder icons (`text-[var(--brand-accent)]`) matching Dori's signature brand style, and indented active subprojects.
- Profile Footer: wrapped in an elevated card (`bg-card border shadow-2xs rounded-panel p-3`) with 40px executive navy initials avatar, `15px font-semibold` name, and clean settings gear icon.

### Why
Eliminate washed-out, diminutive appearance and achieve full 1:1 visual richness, contrast, and elegance matching Dori Portal.

### Files touched
- `electron-app/src/components/Sidebar.jsx` — Enriched sidebar typography, amber folder accents, elevated profile card, and navy CTA.

## [2026-08-31] — Widen Sidebar and Polish Navigation Item Sizing

**Branch**: `main`

### What changed
- Widened Sidebar: increased desktop sidebar width from `w-64` (16rem / 256px) to `w-72` (18rem / 288px) with `min-w-[18rem]` and updated `--app-sidebar-width: 18rem;` in `tokens.css`.
- Expanded Interactive Hierarchy:
  - Header: increased padding to `px-5 py-4` with `text-lg font-bold` brand title and `h-8 w-8` create button.
  - Search: increased height to `min-h-[2.6rem]`, padding to `px-3.5`, with larger `size={18}` search icon.
  - Navigation Links: increased interactive target height to `min-h-[2.75rem]` (44px), padding to `px-4 py-2.5`, with `size={20}` icons.
  - Project Tree: increased row height to `min-h-[2.5rem]` with `size={18}` icons.
  - Profile Footer: upgraded avatar to 40px initials badge (`h-10 w-10`), `size={18}` settings gear, and expanded `p-3` container.

### Why
Provide generous desktop breathing room and touch-friendly 44px interactive targets matching Dori Portal's responsive desktop layout.

### Files touched
- `electron-app/src/components/Sidebar.jsx` — Widened sidebar container to `w-72`, enlarged navigation targets, and expanded profile footer.
- `electron-app/src/tokens.css` — Updated `--app-sidebar-width` to `18rem`.

## [2026-08-31] — Elevate Typography Scale Across All Views to 1:1 Dori Standards

**Branch**: `main`

### What changed
- Replaced cramped `text-xs` (12px) and `text-micro` (10px) throughout the UI with Dori's standard typography hierarchy:
  - Sidebar: upgraded nav links and project rows to `text-sm font-medium` (14px) and search to `text-sm`.
  - Chat & Home: upgraded hero headline to `text-3xl sm:text-4xl`, greeting to `text-sm`, and chat message bubbles to `text-sm leading-relaxed` (15px).
  - Decision Cards (Inbox): upgraded titles to `text-base font-semibold` (16px) and descriptions to `text-sm`.
  - Library: upgraded card titles to `text-base font-semibold` (16px) and paths/snippets to `text-sm`.
  - Tasks: upgraded task titles to `text-sm font-medium` (14px) and filter chips to `text-sm`.
  - Profile: upgraded name to `text-2xl font-bold`, role to `text-sm font-semibold`, and bio to `text-sm`.
- Updated `.chat-runtime-trigger` from `0.72rem` (11.5px) to standard `0.8125rem` / `text-xs font-semibold`.

### Why
Eliminate diminutive typography and bring Dori Go to the exact same visual weight, readability, and editorial clarity as Dori Portal.

### Files touched
- `electron-app/src/components/Sidebar.jsx` — Elevated navigation, search, and profile footer typography.
- `electron-app/src/components/ChatView.jsx` — Elevated chat bubble, kicker, and hero headline sizes.
- `electron-app/src/components/DecisionCard.jsx` — Elevated card title, description, and action button sizes.
- `electron-app/src/components/LibraryView.jsx` — Elevated card title and snippet sizes.
- `electron-app/src/components/TasksView.jsx` — Elevated task row and filter chip sizes.
- `electron-app/src/components/ProfileView.jsx` — Elevated identity header, bio, and company typography.

## [2026-08-31] — Fix Figtree Font Loading, Typography Scale, and SettingsModal 1:1 Parity

**Branch**: `main`

### What changed
- Fixed Font Loading: registered `@font-face` for `Figtree` variable font in `index.html` and updated root typography in `tokens.css` so `font-family: 'Figtree', system-ui, -apple-system, sans-serif;` is applied as the default sans font across all screens instead of falling back to system San Francisco.
- Adjusted Typography Scale: updated base body font size to 15px with relaxed line-heights matching Dori Portal's editorial density.
- Rebuilt SettingsModal to 1:1 Dori Portal Parity: upgraded from a narrow box to a full master-detail dialogue (`h-[80vh] w-[80vw] max-w-4xl min-w-[32rem]`) with vertical left sidebar (`w-60` for `General`, `AI Providers`, `Shortcuts`) and wide right content panel (`p-8`).

### Why
Ensure Dori Go has the exact same spacious font rendering, warm Figtree geometry, and master-detail Settings layout as Dori Portal.

### Files touched
- `electron-app/index.html` — Registered Figtree `@font-face` and base font styles.
- `electron-app/src/components/SettingsModal.jsx` — 1:1 master-detail dialog matching Dori Portal.

## [2026-08-31] — Complete UX Overhaul: Profile, "My Work", Mini Bar, and Composer Polish

**Branch**: `main`

### What changed
- Composer Capsule Polish: centered the send button paper plane icon vertically and horizontally; built contextual action menu on the `+` button (`Attach File / Document`, `Capture Link / YouTube`, `Search Vault Notes`).
- Sidebar Header Polish: added quick create dropdown menu to the `+` button (`New Note`, `New Chat`, `Profile Space`).
- Upgraded Profile to Executive Canvas: built 64px avatar initials badge, role headline, bio tagline, email, location, and interactive SVG social link badges (`LinkedIn`, `X`, `Website`).
- Added Company / Venture Panel: elevated organization card with `Building2` icon and industry pill badge.
- Added "My Work & References" Grid: displays personal documents and references stored in `profile/` or recent outputs, opening in `FileSlideover` on click.
- Built `EditProfileModal.jsx`: non-destructive dialog for editing personal and company details.
- Built `AddToProfileModal.jsx`: tabbed dialog (`Note`, `Link`, `File`) for adding content straight into the vault.
- Frosted Acrylic Mini Quick Capture (`mini.html`): applied `backdrop-filter: blur(28px) saturate(1.8)`, specular highlight borders, centered send button, and keyboard hints.
- Card & Surface Rhythm: improved `LibraryView.jsx` grid spacing and previews, added tag and priority badges to `TasksView.jsx`, and enhanced `SearchModal.jsx` results display.

### Why
Bring Dori Go to world-class UX polish, ensuring complete alignment with Dori Portal's executive workspace feel, non-destructive modal editing, and flawless button alignments.

### Files touched
- `electron-app/src/components/ChatView.jsx` — Centered send icon and functional `+` popover menu.
- `electron-app/src/components/Sidebar.jsx` — Header `+` dropdown menu.
- `electron-app/src/components/ProfileView.jsx` — Executive identity header, company panel, and "My Work" card grid.
- `electron-app/src/components/EditProfileModal.jsx` — Profile editing dialog modal.
- `electron-app/src/components/AddToProfileModal.jsx` — Tabbed profile add dialog.
- `electron-app/src/components/LibraryView.jsx` — Responsive grid and card lift.
- `electron-app/src/components/TasksView.jsx` — Task rows, project tags, and priority badges.
- `electron-app/src/components/SearchModal.jsx` — Search results and command palette polish.
- `electron-app/mini.html` — Frosted glass acrylic styling and centered send button.
- `electron-app/src/App.jsx` — Wired `ProfileView` document selection and search openers.

## [2026-08-31] — Complete Native macOS Binary Rebranding to "Dori.app"

**Branch**: `main`

### What changed
- Rebranded unpackaged Electron dev binary bundle on macOS: renamed `Electron.app` to `Dori.app`, renamed internal executable `Contents/MacOS/Electron` to `Contents/MacOS/Dori`, and updated `node_modules/electron/path.txt` to point to `Dori.app/Contents/MacOS/Dori`.
- Patched `Info.plist` with `CFBundleExecutable: Dori`, `CFBundleName: Dori`, `CFBundleDisplayName: Dori`, and `CFBundleIdentifier: app.mydori.mini`.
- Registered `Dori.app` with macOS LaunchServices via `lsregister -f`.

### Why
macOS WindowServer and Dock identify processes by the physical `.app` directory and Mach-O executable name rather than JS runtime properties alone. Renaming the bundle and executable ensures the OS displays "Dori" in the Menu Bar, Dock, App Switcher (Cmd+Tab), and Activity Monitor.

### Files touched
- `electron-app/scripts/patch-electron-name.mjs` — Bundle rename, executable rename, path.txt rewrite, and Info.plist patching.

## [2026-08-31] — Fix Application Name to "Dori" Across macOS Command Bar, Dock, and Menu

**Branch**: `main`

### What changed
- Configured macOS Application Menu in `main.js`: built native menu bar with `Dori` app menu (`About Dori`, `Settings... (Cmd+,)`, `Services`, `Hide Dori`, `Quit Dori`), `Edit`, `View`, and `Window` menus.
- Set `app.setName('Dori')` and `app.name = 'Dori'` before `app.whenReady()`.
- Updated `electron-app/package.json` to `"name": "dori"` and `"productName": "Dori"`.
- Updated `patch-electron-name.mjs` to patch Electron's `Info.plist` with `CFBundleName: Dori`, `CFBundleDisplayName: Dori`, and `CFBundleIdentifier: app.mydori.mini`, registering with macOS `lsregister`.
- Added `open-settings` IPC channel from macOS Application Menu into React `App.jsx` to open the Settings modal.

### Why
Ensure the application consistently displays "Dori" across the macOS Menu Bar, Dock tile, Command Bar, app switcher, and system dialogs during local development.

### Files touched
- `electron-app/main.js` — App name `Dori` and native macOS application menu template.
- `electron-app/package.json` — `name` and `productName` set to `dori` / `Dori`.
- `electron-app/preload.cjs` — Added `onOpenSettings` bridge listener.
- `electron-app/scripts/patch-electron-name.mjs` — Patched `Info.plist` and registered `Dori` with LaunchServices.
- `electron-app/src/App.jsx` — Connected native menu bar `Settings...` to open `SettingsModal`.

## [2026-08-31] — Polish Inbox Screen Layout and DecisionCard Styling

**Branch**: `dori-go-visual-overhaul`

### What changed
- Focused Inbox container width to `max-w-3xl` (`page-frame max-w-3xl`) matching Dori Portal's editorial layout.
- Upgraded `DecisionCard.jsx`: applied `universal-card` elevation, circular icon avatar with `--surface-tint`, uppercase pill type badges, and clear typography hierarchy.
- Updated Inbox copy and header to real Dori Portal strings (`"Everything waiting on you — approve, file, or dismiss."`, `"[N] waiting"` pill badge, and `"Nothing needs you right now"` empty state).

### Why
Bring the Inbox screen to the same standard of visual polish, proportional width, and card lift as the Tasks and Library screens.

### Files touched
- `electron-app/src/App.jsx` — Centered `max-w-3xl` container, waiting pill badge, and empty state copy in `InboxScreen`.
- `electron-app/src/components/DecisionCard.jsx` — Refined card elevation, icon tint, and eyebrow badge styling.

## [2026-08-31] — 1:1 Visual & UX Identity Parity with Dori Portal

**Branch**: `dori-go-visual-overhaul`

### What changed
- Restored surface canvas hierarchy in `tokens.css`: set `--surface-canvas: #fafaf8` and `--background: #fafaf8` so pure white cards (`#ffffff`) lift off the canvas with subtle hairlines (`#e3e4e8`) and diffused shadows.
- Built authentic Dori composer capsule: 20px pill capsule (`.chat-dock-composer`), floating shadow, borderless auto-growing textarea (`.quick-capture-input`), embedded AI Engine trigger, leading `+` action button, and circular navy send button.
- Added editorial Home Chat canvas (`home-focus`): `"Where should we begin?"` Figtree headline, time-aware greeting kicker, and prompt starter chips.
- Added `RouteHeader.jsx` component and `.page-frame` container across all screens (`LibraryView`, `TasksView`, `ProjectView`, `InboxScreen`), replacing cramped 40px toolbars with spacious headers and descriptions.
- Rebuilt `Sidebar.jsx`: brand header with `+` quick create trigger, styled `/` search pill, collapsible **Projects** accordion with count pills and nested tree styling, and bottom profile footer card with popover settings access.
- Built `SettingsModal.jsx` matching Dori Portal: multi-tab dialog (`General`, `AI Engine / Intelligence`, `Shortcuts`) accessible via `Cmd+,` keyboard shortcut and profile menu.
- Added subtle Mac desktop scrollbars (`*::-webkit-scrollbar`).

### Why
Eliminate the raw prototype feel and achieve full visual, component, and UX parity between Dori Go and Dori Portal.

### Files touched
- `electron-app/src/tokens.css` — Warm canvas tokens, RouteHeader classes, composer capsule styles, and scrollbars.
- `electron-app/src/components/ui/RouteHeader.jsx` — Reusable RouteHeader component.
- `electron-app/src/components/SettingsModal.jsx` — Multi-tab Settings dialog (`Cmd+,`).
- `electron-app/src/components/Sidebar.jsx` — Refined brand header, `/` search pill, Projects accordion, and profile footer.
- `electron-app/src/components/ChatView.jsx` — Signature 20px composer capsule and editorial idle hero stage.
- `electron-app/src/components/LibraryView.jsx` — Upgraded to `page-frame` with `RouteHeader` and elevated card grid.
- `electron-app/src/components/TasksView.jsx` — Upgraded to `page-frame` with `RouteHeader` and elevated table panel.
- `electron-app/src/components/ProjectView.jsx` — Upgraded to `page-frame` with `RouteHeader` and contextual chat.
- `electron-app/src/App.jsx` — Mounted `SettingsModal`, registered `Cmd+,` shortcut, and upgraded `InboxScreen`.

## [2026-08-31] — Implement Dori Go Slice 3 (Shell Polish)

**Branch**: `electron-frontend-experiment`

### What changed
- Configured app icon: added `electron-app/public/assets/icon.png` and wired into `main.js` (`BrowserWindow` icon) and HTML favicons for `index.html` and `mini.html` (`dori-go.shell.app-icon`, `constraint.shell.icon-and-splash-asset-location`).
- Added branded launch/splash loading shell in `electron-app/index.html` with Dori logo and pulse animation, paired with `show: false` and `ready-to-show` window handler in `main.js` to eliminate blank/white window flashes on launch (`dori-go.shell.splash-screen`).
- Applied native screen transition motion: added `anim-rise` screen switch animations to `electron-app/src/App.jsx` using shared motion duration/easing constants (`dori-go.shell.native-motion`, `constraint.shell.shared-motion-constants`).
- Verified design token consistency across `ProjectView`, `TasksView`, `ProfileView`, `ChatView`, `FileSlideover`, and `SearchModal` (`dori-go.shell.design-consistency`, `constraint.shell.tokens-css-is-sole-design-token-source`).
- Added automated test suite `test/shell-polish.mjs` verifying icon assets, splash markup, window creation, motion tokens, and design token consistency.

### Why
Bring Dori Go to full desktop visual finish with branded app icon, splash loading shell, smooth native transitions, and design token fidelity matching real Dori.

### Files touched
- `electron-app/public/assets/icon.png` — Dori app icon asset.
- `electron-app/main.js` — App icon resolution, `show: false`, `backgroundColor`, and `ready-to-show` launch handler.
- `electron-app/index.html` — Favicon link and initial branded splash loading shell in `#root`.
- `electron-app/mini.html` — Favicon link.
- `electron-app/src/App.jsx` — Screen switch motion container using `anim-rise`.
- `docs/features/dori-go-shell-polish/verification-record.yaml` — Updated all 4 criteria to `done` with fingerprint and test citations.
- `test/shell-polish.mjs` — Automated unit test verifying shell polish constraints.

## [2026-08-31] — Implement Dori Go Slice 1 & Slice 2

**Branch**: `electron-frontend-experiment`

### What changed
- Built FileSlideover (`dori-go-file-slideover`): in-context slideover panel drawer, WYSIWYG editing via minimal Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `tiptap-markdown`), explicit `Cmd+S` saving, dirty close confirmation dialog, and server-derived write path in `save-document.mjs` with dual non-fatal reindexing (`reindex-vault.mjs` + `semantic-index.mjs`).
- Built Global Search (`dori-go-global-search`): `SearchModal` command palette querying `search_vault` only, keyboard navigation (`Cmd+K`, `/`), and selecting results opening directly in `FileSlideover`.
- Built Engine Picker (`dori-go-engine-picker`): `EnginePicker` dropdown in UI, shared config accessor `engine-config.mjs` managing `~/.dori/whatsapp-config.json`'s `replyCli` enum (`claude`, `codex`, `none`).
- Built Composer Chat (`dori-go-composer-chat`): `ChatView` conversation stream on Home screen, contextual project scoping in `ProjectView`, headless CLI execution via `chat-runner.mjs`, registered actions execution, and explicit unconfigured & error state handling.
- Registered `save_document`, `get_engine_config`, `set_engine_config`, and `chat_send` actions in `actions.mjs` (19 total MCP-exposed actions).
- Added test suites `test/save-document.mjs`, `test/engine-config.mjs`, and `test/chat-runner.mjs`.

### Why
Bring Dori Go desktop experience to feature parity with conversational AI chat, in-context file viewing/editing, global search modal, and local AI engine configuration, adhering to contract constraints and verification records.

### Files touched
- `actions.mjs` — Registered `save_document`, `get_engine_config`, `set_engine_config`, and `chat_send` actions.
- `save-document.mjs` — Server-derived vault file saving with dual non-fatal reindexing.
- `engine-config.mjs` — Shared single accessor for `whatsapp-config.json` engine settings.
- `chat-runner.mjs` — Headless CLI invocation runner for chat with actions support.
- `electron-app/src/lib/motion.js` — Shared motion duration and transition constants.
- `electron-app/src/components/FileSlideover.jsx` — Slideover drawer with Tiptap editor and discard confirmation.
- `electron-app/src/components/SearchModal.jsx` — Global search modal querying `search_vault`.
- `electron-app/src/components/EnginePicker.jsx` — Engine picker dropdown.
- `electron-app/src/components/ChatView.jsx` — Conversation pane with composer and state handling.
- `electron-app/src/components/Sidebar.jsx` — Added Search and Chat entries to sidebar navigation.
- `electron-app/src/components/LibraryView.jsx` — Wired document cards to open `FileSlideover`.
- `electron-app/src/components/ProjectView.jsx` — Embedded contextual `ChatView` for project scope.
- `electron-app/src/App.jsx` — Mounted `SearchModal`, `FileSlideover`, global shortcuts, and default Home chat.
- `test/save-document.mjs` — Unit test for `save-document.mjs` and `save_document` action.
- `test/engine-config.mjs` — Unit test for engine configuration accessor and validation.
- `test/chat-runner.mjs` — Unit test for chat runner error boundaries.
