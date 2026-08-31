# Changelog

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
