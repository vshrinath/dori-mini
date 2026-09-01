// Dori Go architecture sketch: single process. The main process IS Node, so
// it holds actions.mjs's registry in memory and dispatches to it directly
// over one IPC channel — no local http server, no port, no second process
// to crash independently, no sidecar (unlike Dori Desktop's Tauri shell,
// which has to spawn/manage a whole Next.js server as a child process).
//
// The IPC channel is generic (action id + input, same shape actions.mjs
// already validates for MCP) rather than one channel per action, so adding
// a screen later means adding an action, not touching this file.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getAction } from '../actions.mjs';
import { sendChatMessage } from '../chat-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Must be called before app.whenReady() to take effect on macOS.
app.setName('Dori');
app.name = 'Dori';

function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: 'Dori',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,',
                click: (_item, focusedWindow) => {
                  focusedWindow?.webContents?.send('open-settings');
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getAppIconPath() {
  const distIcon = join(__dirname, 'dist/assets/icon.png');
  const publicIcon = join(__dirname, 'public/assets/icon.png');
  if (existsSync(distIcon)) return distIcon;
  if (existsSync(publicIcon)) return publicIcon;
  return null;
}

ipcMain.handle('dori:call', async (event, actionId, input) => {
  const action = getAction(actionId);
  const parsed = action.inputSchema.parse(input ?? {});
  // chat_send bypasses the generic handler here (but keeps it for CLI/MCP
  // callers) so it can stream chunks back over 'chat:delta' as they arrive,
  // instead of the renderer blocking on the whole CLI call with no feedback.
  const result =
    actionId === 'chat_send'
      ? await sendChatMessage({
          ...parsed,
          onDelta: parsed.requestId
            ? (text) => event.sender.send('chat:delta', { requestId: parsed.requestId, text })
            : undefined,
        })
      : await action.handler(parsed);
  console.log(`[ipc] ${actionId} ->`, Array.isArray(result) ? `${result.length} items` : result);
  return result;
});

function createWindow() {
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    backgroundColor: '#ffffff',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  win.loadFile(join(__dirname, 'dist/index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('console-message', (_e, level, message) => {
    console.log(`[renderer:${level}]`, message);
  });
}

// Real Dori's minibar is a second always-on-top Tauri window opened by a
// global shortcut, talking to a live engine over HTTP (summary pills, voice
// recording, OS selection-grab, attachments — see dori-engine/desktop/src/mini/).
// Scoped down to what was actually asked for here: quick text capture only,
// via the same in-process actions.mjs dispatch the main window uses — no
// HTTP, no engine process, no voice/selection/attachment machinery.
const MINI_WIDTH = 440;
const MINI_HEIGHT = 84;
let miniWin = null;

// Remembers where the user dragged the mini window to, across app restarts.
// Not localStorage — this is a separate BrowserWindow/renderer with nothing
// shared with the main app's storage, so it needs its own small file.
const MINI_POSITION_FILE = join(app.getPath('userData'), 'mini-position.json');
let settingPositionProgrammatically = false;

function loadSavedPosition() {
  try {
    if (!existsSync(MINI_POSITION_FILE)) return null;
    const { x, y } = JSON.parse(readFileSync(MINI_POSITION_FILE, 'utf-8'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

function saveMiniPosition() {
  if (!miniWin) return;
  const [x, y] = miniWin.getPosition();
  try {
    writeFileSync(MINI_POSITION_FILE, JSON.stringify({ x, y }));
  } catch (err) {
    console.error('[mini] failed to save window position:', err.message);
  }
}

// Default: bottom-center, one-fifth of the screen height above the bottom
// edge — used only until the user drags the window somewhere else once.
function defaultMiniPosition() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round(display.bounds.x + (display.bounds.width - MINI_WIDTH) / 2);
  const bottomMargin = Math.round(display.bounds.height / 5);
  const y = display.bounds.y + display.bounds.height - MINI_HEIGHT - bottomMargin;
  return { x, y };
}

function createMiniWindow() {
  miniWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    // Electron gives transparent windows a rectangular native drop shadow
    // by default — with rounded CSS content that shows as a jagged gray
    // halo around the corners. mini.html draws its own box-shadow on the
    // capsule; the native one is redundant. Real Dori's own mini window
    // (dori-engine's tauri.conf.json) sets `"shadow": false` for the same
    // reason.
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  miniWin.loadFile(join(__dirname, 'mini.html'));
  miniWin.on('blur', () => miniWin.hide());
  // Fires once at the end of a user drag on macOS — guarded so our own
  // programmatic setPosition() calls (on every toggle-open) don't get
  // persisted as if the user had dragged it there.
  miniWin.on('moved', () => {
    if (settingPositionProgrammatically) return;
    saveMiniPosition();
  });
}

function toggleMiniWindow() {
  if (!miniWin) createMiniWindow();
  if (miniWin.isVisible()) {
    miniWin.hide();
    return;
  }
  const { x, y } = loadSavedPosition() ?? defaultMiniPosition();
  settingPositionProgrammatically = true;
  miniWin.setPosition(x, y);
  settingPositionProgrammatically = false;
  miniWin.show();
  miniWin.focus();
}

ipcMain.on('mini:close', () => miniWin?.hide());

app.whenReady().then(() => {
  setupApplicationMenu();
  // BrowserWindow's icon option is a no-op for the Dock on macOS (it only
  // affects the Windows taskbar / Linux window manager) -- app.dock.setIcon()
  // is the actual mechanism macOS uses.
  if (process.platform === 'darwin') {
    const iconPath = getAppIconPath();
    if (iconPath) app.dock?.setIcon(iconPath);
  }
  createWindow();
  createMiniWindow();
  const registered = globalShortcut.register('CommandOrControl+Shift+Space', toggleMiniWindow);
  if (!registered) console.error('[mini] failed to register global shortcut — already in use by another app');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
