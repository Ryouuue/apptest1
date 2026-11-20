// Desktop shell. The app is served from a fixed loopback port instead of file://, because a stable http origin is what
// keeps saved data (localStorage), the AI sign-in popup and the Spotify redirect working between launches.
const { app, BrowserWindow, Menu, shell, dialog, session, desktopCapturer, ipcMain } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const T0 = Date.now(), steps = [[0, 'main process started']], step = s => steps.push([Date.now() - T0, s]); // shown in the loading screen's F3 log

const PORT = 47615, ORIGIN = `http://127.0.0.1:${PORT}`, ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };
const WALL = /\.(jpe?g|png|webp|avif|gif)$/i;
// Wallpapers: a "wallpaper" folder next to Tempo.exe wins (add your own pictures there), else the ones packed into the app.
const wallDir = () => [process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'wallpaper'), path.join(ROOT, 'wallpaper')].find(d => d && fs.existsSync(d));
let win;

// Note files: every note mirrors to Documents\Tempo Notes. Only .txt/.md paths inside that folder are accepted, and only from the app's own page.
const NOTES = () => path.join(app.getPath('documents'), 'Tempo Notes');
function notePath(rel) {
  if (typeof rel !== 'string' || rel.length > 600 || rel.includes('\0')) throw new Error('Bad note path.');
  const base = NOTES(), p = path.resolve(base, rel);
  if (!p.startsWith(base + path.sep) || !/\.(txt|md)$/i.test(p)) throw new Error('Bad note path.');
  return p;
}
const own = e => { if (!(e.senderFrame?.url || '').startsWith(ORIGIN + '/')) throw new Error('Not allowed.'); };
ipcMain.handle('notes:write', async (e, rel, text) => {
  own(e); const p = notePath(rel);
  await fs.promises.mkdir(path.dirname(p), { recursive: true }); await fs.promises.writeFile(p, String(text ?? ''), 'utf8'); return true;
});
ipcMain.handle('notes:remove', async (e, rel) => {
  own(e); const p = notePath(rel);
  await fs.promises.rm(p, { force: true });
  for (let d = path.dirname(p); d.startsWith(NOTES() + path.sep); d = path.dirname(d)) { try { await fs.promises.rmdir(d); } catch { break; } } // tidy folders left empty
  return true;
});
ipcMain.handle('notes:reveal', async (e, rel) => {
  own(e);
  if (!rel) { await fs.promises.mkdir(NOTES(), { recursive: true }); const err = await shell.openPath(NOTES()); if (err) throw new Error(err); return true; }
  const p = notePath(rel);
  if (!fs.existsSync(p)) throw new Error('The file is not written yet.');
  shell.showItemInFolder(p); return true;
});
ipcMain.handle('boot:info', e => { own(e); return { versions: process.versions, modules: process.moduleLoadList || [], steps, packaged: app.isPackaged, notes: NOTES() }; });

function serve() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p; try { p = decodeURIComponent(new URL(req.url, ORIGIN).pathname); } catch { p = '/'; }
      if (p === '/') p = '/index.html';
      const wd = p.startsWith('/wallpaper/') && wallDir();
      if (p === '/wallpaper/') { // the break room asks which wallpapers exist
        const list = wd ? fs.readdirSync(wd).filter(f => WALL.test(f)) : [];
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(list));
      }
      // Only the app's own front-end files and wallpaper pictures are reachable; nothing else in the package is served.
      const name = wd && path.basename(p);
      if (wd && !(WALL.test(name) && p === '/wallpaper/' + name)) { res.writeHead(404); return res.end(); }
      if (!wd && !/^\/(index\.html|(css|js)\/[\w-]+\.(css|js))$/.test(p)) { res.writeHead(404); return res.end(); }
      fs.readFile(wd ? path.join(wd, name) : path.join(ROOT, p), (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()], 'cache-control': wd ? 'max-age=3600' : 'no-store' }); res.end(data);
      });
    });
    srv.once('error', reject);
    srv.listen(PORT, '127.0.0.1', () => { step(`file server listening on ${ORIGIN}`); resolve(srv); });
  });
}

function open() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 880, minHeight: 600, backgroundColor: '#05060a', title: 'Tempo', show: !process.env.TEMPO_SMOKE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  step('window created');
  // Permissions (folder access for the Obsidian vault, clipboard) go to the app's own pages only, never to a popup or remote site.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(wc.getURL().startsWith(ORIGIN + '/')));
  // The rest screen's visualiser listens to the PC's sound output (Windows loopback). No picker; only the app's own page may ask.
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    if (!req.securityOrigin?.startsWith(ORIGIN)) return cb({});
    desktopCapturer.getSources({ types: ['screen'] }).then(s => cb(s[0] ? { video: s[0], audio: 'loopback' } : {})).catch(() => cb({}));
  });
  // The AI sign-in popup must stay in the app to hand its result back to the page; any other new window opens in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([\w-]+\.)*puter\.com(\/|$)/.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 740, autoHideMenuBar: true } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // The main window only ever shows the app itself, plus the Spotify consent page on its way back to the app.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/') || url.startsWith('https://accounts.spotify.com/')) return;
    e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url);
  });
  win.loadURL(ORIGIN + '/'); step('page requested');
  if (process.env.TEMPO_SMOKE) { // packaging self-check: load the page, report what it sees, exit
    win.webContents.once('did-finish-load', async () => {
      const r = await win.webContents.executeJavaScript(`(async () => { let files = 'no bridge'; if (window.tempoApp) { try { await tempoApp.notes.write('_smoke/check.txt', 'ok'); await tempoApp.notes.remove('_smoke/check.txt'); files = 'ok'; } catch (e) { files = e.message; } } return JSON.stringify({ logic: !!window.TempoLogic, pages: Object.keys(PAGES).length, survey: !document.querySelector('#onboard').hidden || !document.querySelector('#app').hidden, files }); })()`).catch(e => 'ERR ' + e.message);
      console.log('TEMPO_SMOKE ' + r); app.quit();
    });
  }
}

Menu.setApplicationMenu(null);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    step(`electron ready (${app.isPackaged ? 'packaged' : 'dev'})`);
    try { await serve(); } catch (e) {
      dialog.showErrorBox('Tempo could not start', `Port ${PORT} is being used by another program. Close it and start Tempo again.\n\n${e.message}`);
      return app.quit();
    }
    open();
  });
}
