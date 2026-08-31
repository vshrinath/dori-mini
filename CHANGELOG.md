# Changelog

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
