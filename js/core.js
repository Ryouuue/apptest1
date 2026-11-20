// Core: store, accounts, sound, overlays, router, gamification. Every other file builds on these globals.
'use strict';
const L = window.TempoLogic, esc = L.esc;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => L.dateKey(new Date());
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ACT = {}, PAGES = {};

const ICON = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', board: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  spark: 'M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  quiz: 'M5 4h14v12H10l-5 4zM10 8.5a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.2M12 13.6v.1', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4', bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  play: 'M7 4l13 8-13 8z', pause: 'M7 4h4v16H7zM13 4h4v16h-4z', next: 'M5 4l10 8-10 8zM17 4h2v16h-2z', prev: 'M19 4L9 12l10 8zM5 4h2v16H5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', x: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', undo: 'M9 6L4 11l5 5M4 11h10a5 5 0 0 1 0 10h-3', redo: 'M15 6l5 5-5 5M20 11H10a5 5 0 0 0 0 10h3',
  hand: 'M5 3l14 8-6 2-2 6z', eraser: 'M4 16l9-9 6 6-6 6H8zM9 11l6 6', target: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v4M12 18v4M2 12h4M18 12h4',
  music: 'M9 18V5l10-2v13M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  check: 'M5 12l5 5 9-10', right: 'M5 12h14M13 6l6 6-6 6', left: 'M19 12H5M11 6l-6 6 6 6', bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  graph: 'M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 6.5l8 1.2M7 8l4 8M17 10l-4 6',
  send: 'M4 12l16-8-6 16-3-7z', squig: 'M4 15c3-8 5 6 8-2s5 4 8-3',
  learn: 'M5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 18c6 0 4-6 8-6s2-6 2-6', cards: 'M4 8h12v12H4zM8 8V4h12v12h-4',
  speaker: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11', down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  tree: 'M4 12h5M9 5v14M9 5h4M9 12h4M9 19h4M13 5h7M13 12h7M13 19h7', lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z', expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  todo: 'M4 6.5l1.8 1.8L9 5M4 13.5l1.8 1.8L9 12M11.5 7h8.5M11.5 14h8.5M5 20h.01M11.5 20h8.5', cup: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2 2 0 0 1 0 4H16M8.5 3c-.8 1.3.8 2 0 3.5M12.5 3c-.8 1.3.8 2 0 3.5',
  bag: 'M5 8h14l-1.2 12H6.2zM9 10V7a3 3 0 0 1 6 0v3', arrow: 'M5 19L18 6M10 5.5h8.5V14', image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 8.5h.01',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  eyeoff: 'M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.7 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.9-1.4M10 10a2.8 2.8 0 0 0 4 4',
  focus: 'M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5M12 9.5v5M9.5 12h5', panel: 'M4 4h16v16H4zM9.5 4v16', moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
};
const icon = (n, s = 20, w = 1.8) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

// Ember, the mascot. Pupils follow the pointer (see pointermove below).
// Each instance gets its own gradient id: a shared id breaks when the first copy sits in a hidden container.
let emberN = 0;
// Mood 0 calm, 1 annoyed, 2 mad, 3 furious, 4 raging (lockdown), 5 out (the streak died). Hotter colours, lower brows, then steam; out is grey smoke.
const EMBER_C = [['#ffb347', '#f9480a'], ['#ffa63c', '#f2400a'], ['#ff8a3a', '#e3300c'], ['#ff6a44', '#cc1a14'], ['#ff4a5a', '#9d0a24'], ['#cfcfd8', '#64646f']];
const ember = (s = 64, m = mood()) => {
  const [a, b] = EMBER_C[m], id = 'eg' + ++emberN, ink = 'stroke="#1b1330" stroke-width="2" fill="none" stroke-linecap="round"';
  const eyes = m === 5 ? `<path d="M20 40q5 3.5 10 0M34 40q5 3.5 10 0" ${ink}/>` : `<g class="eyes"><circle cx="25" cy="39" r="5.5" fill="#fff"/><circle cx="39" cy="39" r="5.5" fill="#fff"/><circle class="pupil" cx="25" cy="39" r="2.7" fill="#1b1330"/><circle class="pupil" cx="39" cy="39" r="2.7" fill="#1b1330"/></g>`;
  const brows = m === 1 ? `<path d="M20 31.5h9M35 31.5h9" ${ink}/>` : m >= 2 && m <= 4 ? `<path d="M19 ${32 - m}l10 ${1.5 * m}M45 ${32 - m}l-10 ${1.5 * m}" ${ink} stroke-width="2.6"/>` : '';
  const mouth = ['M28 48q4 3 8 0', 'M28.5 49h7', 'M27.5 50.5q4.5-3.5 9 0', 'M27 51q5-5 10 0', 'M26.5 51.5q5.5-6 11 0', 'M28 50q4-2 8 0'][m];
  const fx = m >= 3 && m <= 4 ? `<g class="steam" stroke="#b9b4c4" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M9 20q-3-3 0-6t0-6"/><path d="M55 20q3-3 0-6t0-6"/></g>`
    : m === 5 ? `<g class="smoke" stroke="#9a9aa6" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M32 16q-4-3 0-6t0-7"/></g>` : '';
  return `<svg class="ember m${m}" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${fx}<g class="eb"><path d="${m === 5 ? 'M32 18c3 8 14 12 14 23a14 14 0 0 1-28 0c0-6 3-9 5-12 1 4 2 5 4 5 0-7 2-11 5-16z' : 'M32 4c4 10 18 16 18 34a18 18 0 0 1-36 0c0-8 4-12 7-16 1 5 3 7 5 7 0-9 2-16 6-25z'}" fill="url(#${id})"/>${m === 5 ? '' : `<path d="M32 26c2 6 10 9 10 17a10 10 0 0 1-20 0c0-7 7-10 10-17z" fill="#ffe08a" opacity="${m >= 3 ? .3 : .5}"/>`}${eyes}${brows}<path d="${mouth}" ${ink} stroke-width="1.8"/></g></svg>`;
};
const SES = uid(); // this app session; the anti-cheat clock check trusts the monotonic clock only inside one session
function mood() {
  if (!S?.profile) return 0;
  if (S.ember.out) return 5;
  return Math.max(L.nagLevel(S.tasks, S.todo.lastDone, Date.now()), Math.min(4, S.ember.qmiss || 0), S.todo.lock ? 4 : 0);
}

// ---------- store ----------
// shortcut: everything lives in this browser's localStorage (about 5 MB), no server or cloud sync; move to a backend/IndexedDB when sync or huge boards are needed.
const KEY = u => (u ? 'tempo:data:' + u : 'tempo:guest');
const fresh = () => ({
  profile: null,
  // aiMode 'login' = sign in through Puter (no key); 'key' = the user's own provider API key. lmodels are the sign-in model ids.
  settings: { theme: 'dark', sfx: true, notes: 'local', ai: 'claude', aiMode: 'login', keys: {}, models: { claude: 'claude-opus-5-5', gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini' },
    lmodels: { claude: 'claude-sonnet-5', gemini: 'gemini-3.5-flash-lite', openai: 'gpt-5.5' }, spotifyId: '', ui: 'original', tidy: {}, navMini: false, geo: null },
  sessions: [], events: [], notes: [], board: { strokes: [], stickies: [], images: [], links: [], view: { x: 0, y: 0, z: 1 } },
  quizzes: [], courses: [], notifs: [], ach: {}, chat: [], xp: 0, timer: null, spotify: null, nudged: '',
  cards: [], lessons: [], frozen: [], freezes: 1, reviews: 0, chests: 0, day: null, seeded: false, recapWeek: '',
  // To-do: lock = break-room lockdown after 4 idle days, cleared only by finishing a task. pts = shop points.
  tasks: [], todo: { lastDone: 0, lock: null, frog: null, seen: '', doneCount: 0, frogs: 0 }, pts: 0, ptsLog: [], ember: { run: 0, out: false, qmiss: 0 }, wx: null,
});
function load() {
  const raw = localStorage.getItem(KEY(user)), f = fresh();
  if (!raw) return f;
  try {
    const d = JSON.parse(raw);
    const s = d.settings || {}, keys = { ...s.keys };
    return { ...f, ...d, board: { ...f.board, ...d.board }, todo: { ...f.todo, ...d.todo }, ember: { ...f.ember, ...d.ember },
      settings: { ...f.settings, ...s, keys, models: { ...f.settings.models, ...s.models }, lmodels: { ...f.settings.lmodels, ...s.lmodels },
      aiMode: s.aiMode || (Object.keys(keys).length ? 'key' : 'login') } }; // data saved before sign-in existed keeps using its keys
  } catch { localStorage.setItem(KEY(user) + ':corrupt', raw); return f; } // keep the unreadable copy instead of overwriting it
}
let user = localStorage.getItem('tempo:session') || null;
let S = load();
let saveT = 0;
function saveNow() {
  clearTimeout(saveT); saveT = 0;
  try { localStorage.setItem(KEY(user), JSON.stringify(S)); }
  catch { toast('Storage is full. Export a backup in Settings, then clear some drawings.', 'bad'); }
}
const save = () => { saveT ||= setTimeout(saveNow, 300); };
addEventListener('pagehide', () => saveT && saveNow());
const applyTheme = () => { document.documentElement.dataset.theme = S.settings.theme; };

// ---------- accounts (local only; passwords are PBKDF2-hashed, never stored) ----------
const accounts = () => { try { return JSON.parse(localStorage.getItem('tempo:accounts')) || {}; } catch { return {}; } };
async function hashPw(pw, salt) {
  const enc = new TextEncoder(), k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 210000 }, k, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function signup(name, id, pw) {
  id = id.trim().toLowerCase();
  if (id.length < 3) throw new Error('Use at least 3 characters for the email or username.');
  if (pw.length < 8) throw new Error('The password needs at least 8 characters.');
  const acc = accounts();
  if (acc[id]) throw new Error('That account already exists. Try logging in.');
  const salt = crypto.randomUUID();
  acc[id] = { name: name.trim() || id, salt, hash: await hashPw(pw, salt) };
  localStorage.setItem('tempo:accounts', JSON.stringify(acc));
  user = id; localStorage.setItem('tempo:session', id);
  saveNow(); localStorage.removeItem(KEY(null)); // the guest's data moves into the new account
}
async function login(id, pw) {
  id = id.trim().toLowerCase();
  const a = accounts()[id];
  if (!a || a.hash !== await hashPw(pw, a.salt)) throw new Error('Wrong email or password.');
  saveNow(); user = id; localStorage.setItem('tempo:session', id); S = load();
}
function logout() { saveNow(); localStorage.removeItem('tempo:session'); user = null; S = load(); }
const requireLogin = fn => (user ? fn() : openAuth(fn));

function openAuth(done, mode = 'signup') {
  const up = mode === 'signup';
  const m = modal(`<h2>${up ? 'Create your account' : 'Welcome back'}</h2>
    <p class="muted">An account unlocks the online parts: AI tutor, Spotify and vault connections. Your data stays on this PC.</p>
    <div class="seg" style="margin-top:16px"><button type="button" class="${up ? 'on' : ''}" data-m="signup">Sign up</button><button type="button" class="${up ? '' : 'on'}" data-m="login">Log in</button></div>
    <form novalidate>${up ? `<label class="f" for="au-n">Name</label><input class="inp" id="au-n" name="name" value="${esc(S.profile?.name || '')}" autocomplete="name">` : ''}
    <label class="f" for="au-i">Email or username</label><input class="inp" id="au-i" name="id" autocomplete="username" autofocus>
    <label class="f" for="au-p">Password</label><input class="inp" id="au-p" name="pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}">
    <p class="err" role="alert"></p><div class="foot"><button class="btn" type="submit">${up ? 'Create account' : 'Log in'}</button></div></form>`);
  $$('.seg button', m).forEach(b => (b.onclick = () => openAuth(done, b.dataset.m)));
  $('form', m).onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('.btn', f);
    btn.disabled = true;
    try {
      await (up ? signup(f.name.value, f.id.value, f.pw.value) : login(f.id.value, f.pw.value));
      closeModal(); sfx.ok(); enterApp(); toast(up ? 'Account created. Online features unlocked.' : 'Logged in.'); done?.();
    } catch (err) {
      $('.err', f).textContent = err.message; sfx.bad(); replay(m, 'shake'); btn.disabled = false; // loud, unmistakable failure
    }
  };
}

// ---------- sound (synthesised, no files) ----------
const sfx = (() => {
  let ctx;
  const tone = (f, d, type = 'sine', v = .07, to) => {
    if (!S.settings.sfx) return;
    try {
      ctx ||= new AudioContext(); ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d);
    } catch { /* audio is decoration; never break the UI over it */ }
  };
  const seq = (notes, gap = 90) => notes.forEach((f, i) => setTimeout(() => tone(f, .16, 'triangle', .08), i * gap));
  // A pen scratching across paper: a short noise burst through a rising band-pass filter.
  const scratch = () => {
    if (!S.settings.sfx) return;
    try {
      ctx ||= new AudioContext(); ctx.resume();
      const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * .24), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * (.6 + .4 * Math.sin(i / 900));
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(5200, t + .22); g.gain.value = .22;
      src.connect(f).connect(g).connect(ctx.destination); src.start(t);
    } catch { /* decoration only */ }
  };
  return {
    cross: () => { scratch(); setTimeout(() => seq([784, 1175], 80), 170); }, hmm: () => { tone(330, .12, 'triangle', .07); setTimeout(() => tone(262, .18, 'triangle', .07), 130); },
    grumble: () => tone(120, .35, 'sawtooth', .045, 70), whoosh: () => tone(900, .3, 'sine', .03, 200),
    tap: () => tone(540, .05, 'triangle', .035), pick: () => tone(280, .1, 'sine', .08, 560), drop: () => { tone(380, .13, 'sine', .11, 120); setTimeout(() => tone(900, .04, 'triangle', .03), 60); },
    trash: () => tone(520, .26, 'triangle', .07, 70), ok: () => seq([660, 880]), bad: () => tone(170, .24, 'sawtooth', .05, 85), win: () => seq([523, 659, 784, 1047], 110),
    draw: () => tone(1200, .03, 'sine', .012),
  };
})();

// ---------- overlays ----------
const layer = () => $('#layer');
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function toast(text, kind = '', action) {
  const box = $('.toasts') || layer().appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }));
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.setAttribute('role', 'status'); t.textContent = text;
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
  if (action) { const b = document.createElement('button'); b.textContent = action[0]; b.onclick = () => { action[1](); kill(); }; t.append(b); }
  if (kind === 'bad') sfx.bad();
  box.append(t); setTimeout(kill, action ? 6000 : 3400);
}
function notify(text, e = '🔔', quiet) {
  S.notifs.unshift({ id: uid(), t: Date.now(), text, e, read: false });
  S.notifs.length = Math.min(S.notifs.length, 30);
  save(); if (!quiet) toast(e + '  ' + text);
  if (!$('#app').hidden) chrome();
}
function modal(html, cls = '') {
  closeModal();
  const s = document.createElement('div');
  s.className = 'scrim'; s._prev = document.activeElement;
  s.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}<button class="x" data-act="closeModal" aria-label="Close">${icon('x', 18)}</button></div>`;
  s.addEventListener('pointerdown', e => e.target === s && closeModal());
  layer().append(s);
  (s.querySelector('[autofocus]') || s.querySelector('input,textarea,button:not(.x)'))?.focus();
  return s.firstElementChild;
}
function closeModal() {
  const s = $('.scrim:not(.out)'); if (!s) return;
  s.classList.add('out'); s._prev?.focus?.(); setTimeout(() => s.remove(), 160);
}
ACT.closeModal = closeModal;
function popover(anchor, html) {
  const old = $('.pop'); if (old) { old.remove(); if (old._a === anchor) return null; }
  const p = document.createElement('div'), r = anchor.getBoundingClientRect(), up = r.top > innerHeight / 2;
  p.className = 'pop'; p.innerHTML = html; p._a = anchor;
  p.style.right = Math.max(12, innerWidth - r.right) + 'px';
  p.style[up ? 'bottom' : 'top'] = (up ? innerHeight - r.top : r.bottom) + 10 + 'px';
  p.style.transformOrigin = (up ? 'bottom' : 'top') + ' right';
  layer().append(p); return p;
}
document.addEventListener('pointerdown', e => { const p = $('.pop'); if (p && !p.contains(e.target) && !p._a.contains(e.target)) p.remove(); });
function celebrate(e, title, sub = '') {
  $('.cele')?.remove();
  const c = document.createElement('div');
  c.className = 'cele'; c.innerHTML = `<div><span class="e">${e}</span><b>${esc(title)}</b><span class="muted">${esc(sub)}</span></div>`;
  layer().append(c); sfx.win(); confetti(); setTimeout(() => c.remove(), 2400);
}
// Particles fly on arcs: launch velocity up and out, then gravity takes over.
function confetti(x = innerWidth / 2, y = innerHeight / 2.6, n = 44) {
  if (reduced()) return;
  const cols = ['#d6f24e', '#ff7a45', '#5b9dff', '#2fbf71', '#ff9dbd', '#f7e7a6'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'), a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260, dx = Math.cos(a) * v, dy = Math.sin(a) * v - 180;
    p.className = 'confetti'; p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]}`;
    layer().append(p);
    p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx * .6}px,${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .35 },
      { transform: `translate(${dx}px,${dy + 460}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1200 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => p.remove();
  }
}
function countUp(el, to, ms = 700) {
  if (reduced() || !to) return void (el.textContent = to);
  const t0 = performance.now();
  (function step(t) { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); })(t0);
}
// Downscales a picture onto a canvas (longest side <= max); callers export it as a blob or base64.
async function shrinkImage(file, max = 1600) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return c;
}
const ago = t => { const m = (Date.now() - t) / 60000; return m < 1 ? 'just now' : m < 60 ? Math.floor(m) + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };

// ---------- global interaction feedback ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('.btn,.icb,.nav,.tile,.qo,.pick button,.pnode');
  if (!b) return;
  sfx.tap();
  if (!b.classList.contains('btn')) return;
  const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height) * 2;
  s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.append(s); setTimeout(() => s.remove(), 600);
});
let mm = 0;
addEventListener('pointermove', e => {
  if (mm) return;
  mm = requestAnimationFrame(() => {
    mm = 0;
    for (const m of $$('.ember')) {
      const r = m.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * .6), d = Math.hypot(dx, dy) || 1;
      m.style.setProperty('--px', (dx / d * 2.3).toFixed(2) + 'px'); m.style.setProperty('--py', (dy / d * 2.3).toFixed(2) + 'px');
    }
  });
});

// ---------- study data ----------
function stats() {
  const t = today(), days = new Set([...S.sessions.map(s => s.d), ...S.quizzes.map(q => q.d)]);
  const sum = f => S.sessions.reduce((n, s) => n + (f(s) ? s.m : 0), 0);
  const chapters = S.courses.reduce((n, c) => n + c.ch.filter(x => x.done).length, 0);
  return {
    t, days, streak: L.streak(new Set([...days, ...S.frozen]), t), weeks: L.weekStreak(days, t), todayMin: sum(s => s.d === t), totalMin: sum(() => true),
    lessons: S.lessons.length, reviews: S.reviews, chests: S.chests,
    sessions: S.sessions.length, quizzes: S.quizzes.length, perfect: S.quizzes.some(q => q.score === q.total), stickies: S.board.stickies.length,
    notes: S.notes.length, night: S.sessions.some(s => s.h >= 22 || s.h < 4), early: S.sessions.some(s => s.h >= 4 && s.h < 8),
    chapters, coursesDone: S.courses.filter(c => c.ch.length && c.ch.every(x => x.done)).length, level: L.levelOf(S.xp).level,
    tasksDone: S.todo.doneCount, frogs: S.todo.frogs,
  };
}
// Shop points. Every change is logged so the balance can be explained.
function award(n, why, from) {
  S.pts = Math.max(0, S.pts + n); S.ptsLog.unshift({ t: Date.now(), n, why }); S.ptsLog.length = Math.min(S.ptsLog.length, 40); save();
  const chip = $('#ptsChip'); if (chip) { $('b', chip).textContent = S.pts; replay(chip, 'bump'); }
  if (n > 0 && from) floatText(from, '+' + n);
}
function floatText(el, text) {
  if (reduced() || !el?.isConnected) return;
  const r = el.getBoundingClientRect(), f = document.createElement('span');
  f.className = 'floatpt'; f.textContent = text; f.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`;
  layer().append(f); setTimeout(() => f.remove(), 1100);
}
function addXp(n) {
  const before = L.levelOf(S.xp).level;
  S.xp += n; save();
  const lv = L.levelOf(S.xp).level;
  if (lv > before) { celebrate('⭐', 'Level ' + lv, 'Keep the tempo'); notify('You reached level ' + lv, '⭐', true); }
}
// ----- daily quests: three small goals, reset at midnight. Clearing all three pays a chest (XP + a streak freeze). -----
function dayState() {
  const t = today(), p = S.day;
  if (p?.d === t) return p;
  // Ember counts days with no quest claimed and no to-do finished; days the app was never opened count too.
  if (p) S.ember.qmiss = (Object.keys(p.claimed).length || p.task ? 0 : S.ember.qmiss + 1) + Math.max(0, Math.round((L.parseKey(t) - L.parseKey(p.d)) / 864e5) - 1);
  return (S.day = { d: t, reviews: 0, lessons: 0, claimed: {}, tp: 0 });
}
const QUESTS = [
  { id: 'min', e: '⏱️', t: () => `Study ${S.profile.daily} minutes`, p: st => [st.todayMin, S.profile.daily] },
  { id: 'learn', e: '🧩', t: () => 'Finish a lesson or a quiz', p: st => [dayState().lessons + S.quizzes.filter(q => q.d === st.t).length, 1] },
  { id: 'cards', e: '🃏', t: () => 'Review 5 flashcards', p: () => [dayState().reviews, 5] },
];
function checkQuests() {
  if (!S.profile) return;
  const st = stats(), day = dayState();
  for (const q of QUESTS) { const [a, b] = q.p(st); if (a >= b && !day.claimed[q.id]) { day.claimed[q.id] = true; S.ember.qmiss = 0; addXp(15); toast(`Quest done: ${q.t()}. +15 XP`); sfx.ok(); } }
  if (!day.chest && QUESTS.every(q => day.claimed[q.id])) {
    day.chest = true; S.chests++; S.freezes = Math.min(2, S.freezes + 1); addXp(30);
    celebrate('🗝️', 'All quests cleared', '+30 XP and a streak freeze'); notify('All daily quests cleared. +30 XP and a streak freeze.', '🗝️', true);
  }
}
function checkAch() {
  checkQuests();
  const s = stats(); let shown = false;
  for (const a of L.ACH) if (!S.ach[a.id] && a.ok(s)) {
    S.ach[a.id] = Date.now(); notify('Achievement unlocked: ' + a.n + '. +5 points', a.e, true); award(5, 'Achievement: ' + a.n);
    if (!shown) { celebrate(a.e, a.n, a.d); shown = true; }
  }
  save();
}
function logSession(mins, sub = 'Focus') {
  const a = stats(), goal = S.profile?.daily || 30;
  S.sessions.push({ d: today(), m: mins, h: new Date().getHours(), t: Date.now(), sub });
  addXp(mins * 2);
  const b = stats();
  if (b.streak > a.streak) { celebrate('🔥', b.streak + '-day streak', 'You showed up today'); notify(b.streak + '-day streak. Come back tomorrow to keep it.', '🔥', true); }
  if (a.todayMin < goal && b.todayMin >= goal) notify(`Daily goal reached: ${b.todayMin} of ${goal} min`, '🎯');
  checkAch(); emberCheck(); save(); refresh();
}
function barChart(n) {
  const by = {}; for (const s of S.sessions) by[s.d] = (by[s.d] || 0) + s.m;
  const t = today(), keys = Array.from({ length: n }, (_, i) => L.addDays(t, i - n + 1)), max = Math.max(S.profile?.daily || 30, ...keys.map(k => by[k] || 0));
  return `<div class="bars" role="img" aria-label="Minutes studied per day">${keys.map((k, i) => {
    const m = by[k] || 0, d = L.parseKey(k);
    return `<div class="b ${m ? '' : 'zero'} ${k === t ? 'today' : ''}" style="--i:${i}" title="${k}: ${m} min"><em>${m || ''}</em><i style="height:calc((100% - 46px)*${(m / max).toFixed(3)})"></i><span>${n > 7 ? d.getDate() : DOW[(d.getDay() + 6) % 7]}</span></div>`;
  }).join('')}</div>`;
}

// ---------- settings pick cards (used by onboarding and Settings) ----------
const THEMES = [['dark', 'Ink', 'Dark, easy on late-night eyes', ['#0f1012', '#2e323a', '#d6f24e']], ['light', 'Paper', 'Light, warm and crisp', ['#f3f0e7', '#d6d1c1', '#d6f24e']], ['rose', 'Rose', 'Soft and warm', ['#fbe8ee', '#efc2d0', '#ff9dbd']]];
const NOTE_HOMES = [['local', 'In Tempo', 'Stored on this PC, works offline'], ['obsidian', 'Obsidian vault', 'Reads and writes .md files in your vault folder'], ['gemini', 'Gemini', 'Notes in Tempo; Gemini summarises and quizzes them']];
const AI_PICKS = [['claude', 'Claude', 'by Anthropic'], ['gemini', 'Gemini', 'by Google'], ['openai', 'ChatGPT', 'by OpenAI']];
const pickCards = (k, list) => list.map(([v, b, d, sw]) => `<button type="button" class="${S.settings[k] === v ? 'on' : ''}" aria-pressed="${S.settings[k] === v}" data-act="setPick" data-k="${k}" data-v="${v}">${sw ? `<div class="sw" style="background:${sw[0]}"><i style="background:${sw[1]}"></i><i style="background:${sw[2]}"></i></div>` : ''}<b>${b}</b><span>${d}</span></button>`).join('');
ACT.setPick = el => {
  S.settings[el.dataset.k] = el.dataset.v; save(); applyTheme(); sfx.pick();
  for (const b of el.parentElement.children) { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }
  el.style.animation = 'pop .4s var(--spring)'; setTimeout(() => (el.style.animation = ''), 420);
};

// ---------- shell + router ----------
let cur = 'home';
const NAV = [['Study', [['home', 'Home', 'home'], ['todo', 'To-do', 'todo'], ['learn', 'Learn', 'learn'], ['board', 'Big Archive', 'board'], ['calendar', 'Calendar', 'calendar'], ['notes', 'Notes', 'note']]],
  ['Practice', [['cards', 'Flashcards', 'cards'], ['quiz', 'Quiz', 'quiz'], ['tutor', 'AI Tutor', 'spark'], ['progress', 'Progress', 'chart']]],
  ['Unwind', [['break', 'Break room', 'cup'], ['shop', 'Shop', 'bag']]], ['App', [['settings', 'Settings', 'sliders']]]];
function chrome() {
  const st = stats(), lv = L.levelOf(S.xp), name = S.profile?.name || 'You', unread = S.notifs.filter(n => !n.read).length;
  const cnt = { cards: S.cards.filter(c => c.due <= st.t).length, todo: S.tasks.filter(x => !x.done && x.due && x.due <= st.t).length }, locked = S.todo.lock;
  const extra = id => (cnt[id] ? `<span class="cnt">${cnt[id]}</span>` : id === 'break' && locked ? `<span class="cnt lockc" title="Ember locked the break room">${icon('lock', 13, 2.2)}</span>` : '');
  // Labels sit in .lbl so the sidebar can collapse to icons; title keeps the name on hover.
  $('#side').innerHTML = `<div class="logo">${ember(34)}<span class="lbl">Tempo</span><button class="icb sidetog" data-act="navMini" aria-label="${S.settings.navMini ? 'Expand' : 'Collapse'} sidebar" title="${S.settings.navMini ? 'Expand' : 'Collapse'} sidebar">${icon('panel', 18)}</button></div><nav aria-label="Main" style="display:contents">` + NAV.map(([h, items]) => `<div class="nav-h">${h}</div>` + items.map(([id, label, ic]) =>
    `<button class="nav ${cur === id ? 'on' : ''}" ${cur === id ? 'aria-current="page"' : ''} data-act="go" data-p="${id}" title="${label}" aria-label="${label}${cnt[id] ? `, ${cnt[id]} due` : id === 'break' && locked ? ', locked' : ''}">${icon(ic)}<span class="lbl">${label}</span>${extra(id)}</button>`).join('')).join('')
    + `</nav><button class="side-promo" data-act="go" data-p="break"><b>Need a breather?</b><span>Chess, sudoku and a quiet clock are one click away.</span></button>
    <button class="me" data-act="account" title="Account"><span class="ava">${esc(name[0].toUpperCase())}</span><span class="grow"><b>${esc(name)}</b><br><small class="muted">${user ? esc(user) : 'No account · log in'}</small></span></button>`;
  const tidy = !!S.settings.tidy[cur], hasAux = !!$('#page .aux');
  $('#top').innerHTML = `<button class="search" data-act="palette" aria-label="Search or jump to">${icon('search', 18)}<span class="lbl2">Search or jump to…</span><kbd>Ctrl K</kbd></button><span class="right"></span>
    <button class="btn sm ghost" data-act="capture" title="Quick capture (C)" aria-label="Quick capture">${icon('plus', 15)}<span class="lbl2">Capture</span></button>
    <button class="tagc" data-act="go" data-p="progress" title="Day streak · ${S.freezes} freeze${S.freezes === 1 ? '' : 's'} in reserve" aria-label="${st.streak} day streak, ${S.freezes} streak freezes"><span class="flame">🔥</span>${st.streak}<span aria-hidden="true" style="opacity:.6">🧊${S.freezes}</span></button>
    <button class="tagc" data-act="go" data-p="progress" title="${lv.into} / ${lv.span} XP" aria-label="Level ${lv.level}">LV ${lv.level}</button>
    <button class="tagc" id="ptsChip" data-act="go" data-p="shop" title="Points for the shop" aria-label="${S.pts} points">🪙<b>${S.pts}</b></button>
    ${hasAux ? `<button class="icb ${tidy ? 'on' : ''}" data-act="tidy" aria-pressed="${tidy}" title="${tidy ? 'Show' : 'Hide'} side panels on this page" aria-label="Hide side panels on this page">${icon(tidy ? 'eyeoff' : 'eye')}</button>` : ''}
    <button class="icb" data-act="focused" title="Focused mode (F)" aria-label="Focused mode">${icon('focus')}</button>
    <button class="icb" data-act="notifs" aria-label="Notifications, ${unread} unread">${icon('bell')}${unread ? `<span class="badge">${unread}</span>` : ''}</button>`;
}
function go(id, arg) {
  if (!PAGES[id]) id = 'home';
  PAGES[cur]?.leave?.(); cur = id; window.speechSynthesis?.cancel(); $('.pop')?.remove();
  const pg = $('#page');
  pg.className = PAGES[id].flush ? 'flush' : ''; pg.innerHTML = ''; pg.scrollTop = 0;
  pg.classList.toggle('tidy', !!S.settings.tidy[id]);
  PAGES[id].render(pg, arg);
  void pg.offsetWidth; pg.classList.add('enter');
  chrome(); history.replaceState(null, '', '#' + id);
}
const refresh = () => { if ($('#app').hidden) return; ['home', 'progress', 'calendar', 'todo'].includes(cur) ? go(cur) : chrome(); };
// Declutter: "tidy" hides a page's side panels (marked .aux) and is remembered per page; focused mode hides all chrome for this session.
ACT.tidy = () => { const on = S.settings.tidy[cur] = !S.settings.tidy[cur]; save(); $('#page').classList.toggle('tidy', on); sfx.whoosh(); chrome(); };
ACT.navMini = () => { S.settings.navMini = !S.settings.navMini; save(); $('#app').classList.toggle('mini', S.settings.navMini); sfx.whoosh(); chrome(); };
ACT.focused = () => {
  const app = $('#app'), on = !app.classList.contains('focused');
  app.classList.toggle('focused', on); sfx.whoosh();
  $('.fexit')?.remove();
  if (on) {
    const b = Object.assign(document.createElement('button'), { className: 'fexit', innerHTML: `${icon('focus', 16)} Exit focused mode <kbd>Esc</kbd>` });
    b.onclick = ACT.focused; layer().append(b);
  }
};
ACT.go = el => go(el.dataset.p);
ACT.account = () => (user ? go('settings') : openAuth());
ACT.notifs = el => {
  const p = popover(el, `<div class="row" style="margin-bottom:8px"><h3>Notifications</h3></div>` + (S.notifs.length ? S.notifs.map(n =>
    `<div class="ntf ${n.read ? '' : 'new'}"><span style="font-size:20px">${n.e}</span><div>${esc(n.text)}<small>${ago(n.t)}</small></div></div>`).join('') : `<div class="empty">${ember(48)}<br>All quiet. Study a little and I will have news.</div>`));
  if (!p) return;
  S.notifs.forEach(n => (n.read = true)); save(); $('.badge', el)?.remove();
};
