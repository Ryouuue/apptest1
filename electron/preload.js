// The page's only doors into the desktop shell: note files (Documents\Tempo Notes), boot details for the loading screen,
// the window frame (title bar colours, full screen) and what is playing on this PC.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const listen = ch => fn => { ipcRenderer.on(ch, (_, v) => fn(v)); };
contextBridge.exposeInMainWorld('tempoApp', {
  notes: {
    write: (rel, text) => ipcRenderer.invoke('notes:write', rel, text),
    remove: rel => ipcRenderer.invoke('notes:remove', rel),
    reveal: rel => ipcRenderer.invoke('notes:reveal', rel),
  },
  boot: () => ipcRenderer.invoke('boot:info'),
  win: {
    theme: (bg, fg) => ipcRenderer.invoke('win:theme', bg, fg),
    full: toggle => ipcRenderer.invoke('win:full', !!toggle),
    onFull: listen('win:full'),
  },
  media: {
    state: () => ipcRenderer.invoke('media:state'),
    cmd: c => ipcRenderer.invoke('media:cmd', c),
    on: listen('media:state'),
  },
});
