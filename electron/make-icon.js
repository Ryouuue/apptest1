// One-off: renders the Ember mascot on a lime tile to build/icon.png for the installer. Run with: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#f9480a"/></linearGradient></defs>
<rect width="64" height="64" rx="14" fill="#d6f24e"/><g transform="translate(6.4 6.4) scale(.8)"><path d="M32 4c4 10 18 16 18 34a18 18 0 0 1-36 0c0-8 4-12 7-16 1 5 3 7 5 7 0-9 2-16 6-25z" fill="url(#g)"/>
<path d="M32 26c2 6 10 9 10 17a10 10 0 0 1-20 0c0-7 7-10 10-17z" fill="#ffe08a" opacity=".5"/><circle cx="25" cy="39" r="5.5" fill="#fff"/><circle cx="39" cy="39" r="5.5" fill="#fff"/>
<circle cx="25" cy="39" r="2.7" fill="#1b1330"/><circle cx="39" cy="39" r="2.7" fill="#1b1330"/><path d="M28 48q4 3 8 0" stroke="#1b1330" stroke-width="1.8" fill="none" stroke-linecap="round"/></g></svg>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  await w.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent;overflow:hidden">${svg}</body>`));
  await new Promise(r => setTimeout(r, 300));
  const png = (await w.webContents.capturePage()).resize({ width: 512, height: 512 }).toPNG();
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, png);
  console.log('icon written', out, png.length); app.quit();
});
