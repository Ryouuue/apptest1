// UI themes. Original is built into app.css; Development 1 and 2 are stylesheets loaded on demand.
// A switch fades the screen out (tiny stars on dark screens), loads the theme, checks it applied, then fades back in.
// If anything fails, the previous theme comes back and the user is told.
'use strict';
const UIS = [
  ['original', 'Original', 'Ink, paper and highlighter. Tempo as you know it', ['#0f1012', '#2e323a', '#d6f24e']],
  ['dev1', 'Development 1', 'Soft lavender workspace with lively motion', ['#d6cff9', '#ffffff', '#8b7bff']],
  ['dev2', 'Development 2', 'Quiet graph paper with pencil doodles and widgets', ['#f3f4f6', '#16191f', '#ffe45c']],
];
const UI_ASSETS = {
  dev1: { css: 'css/dev1.css', font: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap', face: '600 16px "Plus Jakarta Sans"' },
  dev2: { css: 'css/dev2.css', font: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Caveat:wght@500;700&display=swap', face: '600 16px "Bricolage Grotesque"' },
};
const uiName = v => UIS.find(u => u[0] === v)?.[1] || v;
// The theme's --bg (a hex colour in every theme); body may paint a gradient, so its background-color can be transparent.
const bgColor = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f1012';
const isDark = () => { const h = bgColor().replace('#', ''), n = parseInt(h.length === 3 ? [...h].map(c => c + c).join('') : h.slice(0, 6), 16); return ((n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) < 128; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const sheets = {};
const loadSheet = href => (sheets[href] ||= new Promise((res, rej) => {
  const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
  l.onload = res; l.onerror = () => { delete sheets[href]; l.remove(); rej(new Error('could not load ' + href)); };
  document.head.append(l);
}));
async function loadUI(ui) {
  const a = UI_ASSETS[ui];
  if (a) {
    loadSheet(a.font).catch(() => {}); // fonts are optional: offline, the theme uses system fonts instead of failing
    await Promise.race([loadSheet(a.css), wait(8000).then(() => { throw new Error('timed out'); })]);
  }
  document.documentElement.dataset.ui = ui;
  if (getComputedStyle(document.documentElement).getPropertyValue('--ui').trim() !== ui) throw new Error('its styles did not apply');
  if (a) await Promise.race([document.fonts.load(a.face).catch(() => {}), wait(1500)]);
}
function veil(boot) {
  const v = document.createElement('div');
  v.className = 'veil' + (boot ? ' on' : ''); v.style.backgroundColor = bgColor();
  v.innerHTML = (isDark() ? Array.from({ length: 70 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--s:${(Math.random() * 1.6 + .6).toFixed(1)}px;--d:${(Math.random() * 3).toFixed(2)}s"></i>`).join('') : '')
    + '<span class="sr" role="status">Loading theme</span>';
  document.body.append(v); return v;
}
const unveil = v => { v.classList.remove('on'); setTimeout(() => v.remove(), 520); };

let switching = false;
async function setUI(next) {
  const prev = document.documentElement.dataset.ui || 'original';
  if (switching || next === prev) return;
  switching = true; sfx.whoosh();
  const v = veil();
  void v.offsetWidth; v.classList.add('on'); // reflow first so the fade-out transition runs (rAF would stall in a hidden window)
  await wait(reduced() ? 0 : 340); // the old look fades out first
  const t0 = performance.now();
  try {
    await loadUI(next);
    S.settings.ui = next; save();
    if (!$('#app').hidden) go(cur); // re-render so theme-aware bits (board ink, Ember) refresh
    await wait(Math.max(0, 420 - (performance.now() - t0)));
  } catch (e) {
    document.documentElement.dataset.ui = prev; S.settings.ui = prev; save();
    if (!$('#app').hidden) go(cur);
    toast(`Something went wrong loading ${uiName(next)} (${e.message}). Switched back to ${uiName(prev)}.`, 'bad');
  }
  unveil(v); switching = false;
}
// On launch (and after logging in) the saved theme loads behind the veil.
async function bootUI() {
  const ui = S.settings.ui || 'original', now = document.documentElement.dataset.ui;
  if (ui === now) return;
  if (ui === 'original') { document.documentElement.dataset.ui = 'original'; return; }
  const v = veil(true);
  try { await loadUI(ui); if (!$('#app').hidden) go(cur); }
  catch (e) { document.documentElement.dataset.ui = 'original'; S.settings.ui = 'original'; save(); toast(`Something went wrong loading ${uiName(ui)} (${e.message}). Switched back to Original.`, 'bad'); }
  unveil(v);
}
ACT.uiPick = el => setUI(el.dataset.v);
const uiCards = () => UIS.map(([v, n, d, sw]) => `<button type="button" class="${(S.settings.ui || 'original') === v ? 'on' : ''}" aria-pressed="${(S.settings.ui || 'original') === v}" data-act="uiPick" data-v="${v}"><div class="sw ui-${v}" style="background:${sw[0]}"><i style="background:${sw[1]}"></i><i style="background:${sw[2]}"></i></div><b>${n}</b><span>${d}</span></button>`).join('');
