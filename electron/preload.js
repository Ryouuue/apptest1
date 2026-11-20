// The page's only doors into the desktop shell: note files (Documents\Tempo Notes) and boot details for the loading screen.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tempoApp', {
  notes: {
    write: (rel, text) => ipcRenderer.invoke('notes:write', rel, text),
    remove: rel => ipcRenderer.invoke('notes:remove', rel),
    reveal: rel => ipcRenderer.invoke('notes:reveal', rel),
  },
  boot: () => ipcRenderer.invoke('boot:info'),
});
