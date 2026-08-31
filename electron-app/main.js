// Dori Go architecture sketch: single process. The main process IS Node, so
// it holds actions.mjs's registry in memory and dispatches to it directly
// over one IPC channel — no local http server, no port, no second process
// to crash independently, no sidecar (unlike Dori Desktop's Tauri shell,
// which has to spawn/manage a whole Next.js server as a child process).
//
// The IPC channel is generic (action id + input, same shape actions.mjs
// already validates for MCP) rather than one channel per action, so adding
// a screen later means adding an action, not touching this file.
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAction } from '../actions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

ipcMain.handle('dori:call', async (_event, actionId, input) => {
  const action = getAction(actionId);
  const parsed = action.inputSchema.parse(input ?? {});
  const result = await action.handler(parsed);
  console.log(`[ipc] ${actionId} ->`, Array.isArray(result) ? `${result.length} items` : result);
  return result;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  win.loadFile(join(__dirname, 'dist/index.html'));
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
const MINI_HEIGHT = 70;
let miniWin = null;

function createMiniWindow() {
  miniWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
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
}

function toggleMiniWindow() {
  if (!miniWin) createMiniWindow();
  if (miniWin.isVisible()) {
    miniWin.hide();
    return;
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const x = Math.round(display.bounds.x + (display.bounds.width - MINI_WIDTH) / 2);
  const y = display.bounds.y + 120;
  miniWin.setPosition(x, y);
  miniWin.show();
  miniWin.focus();
}

ipcMain.on('mini:close', () => miniWin?.hide());

app.whenReady().then(() => {
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
