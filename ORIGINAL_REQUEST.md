# Original User Request

## 2026-09-02T05:30:10Z

Port and adopt the complete visual design system, surfaces, and component architecture from `dori-portal` into `dori-mini`'s Electron application (`electron-app`), backed by the decoupled `lib/api.js` client adapter.

Working directory: `/Users/shri/proto-space/dori-mini`
Integrity mode: development

## Requirements

### R1. Surface & Layout Adoption
Port the canonical Space Shell layout from `dori-portal` (`app/space-shell.css`, `ViewCanvas`, `SidebarNav`, `SpaceCard`):
- Non-modal 60/40 resizable ViewCanvas with document history stack and reader scaling.
- Calibrated 34px sidebar metrics, space categories (Work, Knowledge, System), and collapsible groups.
- Single-canvas project dashboard cockpit with context cards, open loops, and integrated bottom composer.

### R2. View-by-View Component Parity
Systematically align all primary views with `dori-portal` equivalents:
- **Finance & Ledgers:** Itemized trip tables, status badges, missing field indicators, and gap detection audits.
- **Entities & Brands:** Organizations directory, person affiliation links, and brand theme token cards.
- **Inbox & Timeline:** Routing action cards (Keep / Move / Clarify) and chronological activity streams.
- **Library & Reader:** Tiptap 3 Markdown rendering, table extensions, and document frontmatter tags.

### R3. Decoupled Client API Integration
Ensure all ported components consume the typed `lib/api.js` client adapter rather than raw IPC strings, keeping the UI layer 100% portable.

## Acceptance Criteria

### Visual & Functional Parity
- [ ] Every screen (Chat, Inbox, Tasks, Projects, Finance, Timeline, Entities, Library, ViewCanvas) matches `dori-portal` styling, typography (`Figtree`), and space accent tokens.
- [ ] Document reading in ViewCanvas supports resizable split-view, text scaling, MOM/transcript tabs, and history back navigation.
- [ ] All forms, task toggles, and expense routings execute cleanly through `lib/api.js`.

### Build & Code Quality
- [ ] `pnpm --prefix electron-app run lint` passes with 0 errors.
- [ ] `pnpm --prefix electron-app run build` completes successfully.
- [ ] `node test/actions-adversarial.mjs` passes all 83 backend assertions.
