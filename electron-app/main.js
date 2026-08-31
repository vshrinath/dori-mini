// Dori Go architecture sketch: single process. The main process IS Node, so
// it holds actions.mjs's registry in memory and dispatches to it directly
// over one IPC channel — no local http server, no port, no second process
// to crash independently, no sidecar (unlike Dori Desktop's Tauri shell,
// which has to spawn/manage a whole Next.js server as a child process).
//
// The IPC channel is generic (action id + input, same shape actions.mjs
// already validates for MCP) rather than one channel per action, so adding
// a screen later means adding an action, not touching this file.
import { app, BrowserWindow, ipcMain } from 'electron';
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
