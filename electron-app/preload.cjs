// The only trust boundary: contextIsolation is on and nodeIntegration is
// off, so the renderer never sees Node or the raw ipcRenderer — only this
// one narrow `call(actionId, input)` surface. Named .cjs because the
// package is "type": "module" but contextBridge needs CommonJS `require`.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dori', {
  call: (actionId, input) => ipcRenderer.invoke('dori:call', actionId, input),
  // Only meaningful in the mini-capture window — harmless no-op elsewhere.
  closeMini: () => ipcRenderer.send('mini:close'),
});
