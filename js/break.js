// Break room: chess against three bots, minesweeper, sudoku, and a rest screen (wallpaper, clock, weather and an
// audio visualiser). During a to-do lockdown the room allows 30 minutes in total, then locks until a task is finished.
'use strict';
const G = window.TempoGames;

// ---------- clock and weather (also used by the home widget) ----------
function clocks() {
  const d = new Date();
  $$('[data-clock="t"]').forEach(el => (el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
  $$('[data-clock="d"]').forEach(el => (el.textContent = d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })));
}
setInterval(clocks, 1000);
let wxP = null;
// Weather from Open-Meteo (no key). Location: the city saved in Settings, otherwise the device location, rounded to about 1 km.
async function fetchWeather() {
  if (S.wx && Date.now() - S.wx.t < 30 * 60e3) return S.wx;
  if (!navigator.onLine) throw new Error('offline');
  let g = S.settings.geo;
  if (!g) {
    const pos = await new Promise((res, rej) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 36e5 }) : rej(new Error('no location'))));
    g = { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2), name: '' };
  }
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code&timezone=auto`);
  if (!r.ok) throw new Error('weather ' + r.status);
  const c = (await r.json()).current;
  S.wx = { t: Date.now(), temp: Math.round(c.temperature_2m), code: c.weather_code, name: g.name }; save();
  return S.wx;
}
function paintWeather() {
  const els = $$('[data-wx]'); if (!els.length) return;
  const show = w => els.forEach(el => { const i = L.wxInfo(w.code); el.textContent = `${i.e} ${w.temp}° · ${i.t}${w.name ? ' · ' + w.name : ''}`; });
  if (S.wx) show(S.wx);
  (wxP ||= fetchWeather().finally(() => (wxP = null))).then(show, () => { if (!S.wx) els.forEach(el => (el.textContent = S.settings.geo ? 'Weather unavailable' : 'Set your city for weather')); });
}
ACT.wxSet = () => {
  const m = modal(`<h2>Weather location</h2><p class="muted">For the clock widget and the rest screen. Weather comes from Open-Meteo.</p><form novalidate>
    <label class="f" for="wx-c">City</label><input class="inp" id="wx-c" value="${esc(S.settings.geo?.name || '')}" placeholder="e.g. Jakarta" autocomplete="address-level2" autofocus><p class="err" role="alert"></p>
    <div class="foot"><button type="button" class="btn ghost" id="wx-here">Use this device's location</button><button class="btn" type="submit">Save city</button></div></form>`);
  $('#wx-here', m).onclick = () => { S.settings.geo = null; S.wx = null; save(); closeModal(); paintWeather(); };
  $('form', m).onsubmit = async e => {
    e.preventDefault();
    const q = $('#wx-c', m).value.trim(); if (!q) return replay(m, 'shake');
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(q)), h = r.ok && (await r.json()).results?.[0];
      if (!h) throw new Error('No city found with that name. Check the spelling.');
      S.settings.geo = { lat: +h.latitude.toFixed(2), lon: +h.longitude.toFixed(2), name: h.name }; S.wx = null; save(); closeModal(); sfx.ok(); paintWeather();
    } catch (err) { $('.err', m).textContent = err instanceof TypeError ? 'Could not reach the weather service. Check your connection.' : err.message; replay(m, 'shake'); sfx.bad(); }
  };
};

// ---------- lockdown allowance ----------
const LOCK_MS = 30 * 60e3;
const breakLeft = () => (S.todo.lock ? Math.max(0, LOCK_MS - S.todo.lock.used) : Infinity);
setInterval(() => {
  const l = S.todo.lock, inRoom = $('.rest') || (cur === 'break' && !$('#app').hidden);
  if (!l || document.hidden || !inRoom || l.used >= LOCK_MS) return;
  l.used += 5000; save();
  const left = $('#lockLeft'); if (left) left.lastChild.textContent = ` ${Math.ceil(breakLeft() / 60e3)} min left`;
  if (l.used >= LOCK_MS) { ACT.restExit(); game = null; if (cur === 'break') go('break'); sfx.grumble(); notify('Break time is up. Finish a task to unlock the break room.', '🔒'); }
}, 5000);

// ---------- wallpapers: whatever is in the wallpaper folder ----------
let wallsP = null;
const walls = () => (wallsP ||= fetch('wallpaper/').then(r => (r.ok ? r.text() : '')).then(t => {
  let names; try { names = JSON.parse(t); } catch { names = [...t.matchAll(/href="([^"?#]+\.(?:jpe?g|png|webp|avif|gif))"/gi)].map(m => decodeURIComponent(m[1]).replace(/^.*\//, '')); } // JSON from the app server, an HTML listing from a dev server
  return names.map(n => 'wallpaper/' + encodeURIComponent(n));
}).catch(() => []));

// ---------- rest screen ----------
let rest = null;
async function pcAudio() { // the PC's sound output (Electron hands over loopback audio; a browser shows its share picker)
  const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  st.getVideoTracks().forEach(t => t.stop());
  if (!st.getAudioTracks().length) throw new Error('No audio was shared. Tick "Share system audio" in the picker.');
  const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .72;
  ac.createMediaStreamSource(st).connect(an);
  return { an, stop: () => { st.getTracks().forEach(t => t.stop()); ac.close(); } };
}
const noiseAudio = () => { if (!noise.on) return null; const an = noise.ctx.createAnalyser(); an.fftSize = 2048; noise.g.connect(an); return { an, stop: () => { try { noise.g.disconnect(an); } catch { /* already gone */ } } }; };
// Bars in the style of the cava terminal visualiser: log-spaced bands, quick rise, slow fall. Without a source it breathes gently.
function cava(cv, src) {
  const g = cv.getContext('2d'), data = src?.an ? new Uint8Array(src.an.frequencyBinCount) : null, bars = []; let raf = 0;
  const frame = t => {
    const dpr = devicePixelRatio || 1, W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const n = Math.max(16, Math.floor(cv.clientWidth / 18)), bw = W / n, top = data ? data.length * .7 : 0;
    if (data) src.an.getByteFrequencyData(data);
    g.clearRect(0, 0, W, H); g.fillStyle = '#fff';
    for (let i = 0; i < n; i++) {
      let v;
      if (data) { const lo = Math.floor(top ** (i / n)), hi = Math.max(lo + 1, Math.floor(top ** ((i + 1) / n))); v = 0; for (let k = lo; k < hi; k++) v = Math.max(v, data[k] / 255); }
      else v = reduced() ? .06 : .07 + .05 * Math.sin(t / 900 + i * .45) + .03 * Math.sin(t / 370 + i * 1.3);
      bars[i] = Math.max(v, (bars[i] || 0) - .02);
      const h = Math.max(2 * dpr, bars[i] * H);
      g.fillRect(i * bw + bw * .18, H - h, bw * .64, h);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
function restSource(src) {
  if (!rest) return src?.stop();
  rest.src?.stop(); rest.stopCava?.();
  rest.src = src; rest.stopCava = cava($('.cava', rest.el), src);
}
ACT.rest = () => {
  if (breakLeft() <= 0) return toast('The break room is locked. Finish a task first.', 'bad');
  if (rest) return;
  const el = document.createElement('div');
  el.className = 'rest'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Rest screen'); el._prev = document.activeElement;
  el.innerHTML = `<div class="rest-bg"></div><div class="rest-c"><div class="rest-t" data-clock="t" role="timer"></div><div class="rest-d" data-clock="d"></div><button class="rest-wx" data-wx data-act="wxSet" title="Weather location">…</button></div>
    <canvas class="cava" aria-hidden="true"></canvas>
    <div class="rest-ui"><button class="icb" data-act="restWall" title="Next wallpaper" aria-label="Next wallpaper">${icon('image')}</button><button class="icb" data-act="restAudio" title="Visualise the PC's sound" aria-label="Visualise the PC's sound">${icon('music')}</button><button class="btn sm ghost" data-act="restExit">Back <kbd>Esc</kbd></button></div>`;
  document.body.append(el); rest = { el };
  clocks(); paintWeather(); restSource(noiseAudio());
  if (/Electron/.test(navigator.userAgent)) pcAudio().then(restSource, () => {}); // the desktop app shares PC audio without a picker
  const wake = () => { el.classList.add('awake'); clearTimeout(rest?.idle); if (rest) rest.idle = setTimeout(() => el.classList.remove('awake'), 2600); };
  el.onpointermove = wake; wake();
  $('[data-act="restExit"]', el).focus();
  ACT.restWall(null, 0);
};
ACT.restWall = async (_, step = 1) => {
  if (!rest) return;
  const list = await walls(), bg = $('.rest-bg', rest.el);
  if (!list.length) return bg.classList.add('ready', 'none');
  const i = S.settings.wall = ((S.settings.wall || 0) + step + list.length) % list.length; save();
  const img = new Image(); img.src = list[i];
  img.decode().then(() => { bg.classList.remove('ready'); void bg.offsetWidth; bg.style.backgroundImage = `url("${list[i]}")`; bg.classList.add('ready'); }, () => bg.classList.add('ready', 'none'));
};
ACT.restAudio = () => pcAudio().then(s => { restSource(s); toast('Visualising the PC sound.'); }, e => toast(e.name === 'NotAllowedError' ? 'Audio sharing was cancelled.' : e.message || 'Could not capture the PC sound.', 'bad'));
ACT.restExit = () => {
  if (!rest) return;
  const { el } = rest; rest.src?.stop(); rest.stopCava?.(); clearTimeout(rest.idle); rest = null;
  el.classList.add('out'); setTimeout(() => el.remove(), 380); el._prev?.focus?.();
};

// ---------- games ----------
let game = null, gTick = 0;
const paint = () => { if (cur !== 'break' || $('#app').hidden) return; const pg = $('#page'); pg.classList.remove('enter'); PAGES.break.render(pg); };
const LEVEL = { easy: 'Easy', inter: 'Intermediate', hard: 'Hard' };
const head = (title, chip) => `<div class="ph"><button class="btn sm ghost" data-act="gameBack">${icon('left', 15)} Break room</button><h1>${title}</h1><span class="chip">${chip}</span>${S.todo.lock ? `<span class="pill lvl4" id="lockLeft">${icon('lock', 13, 2.2)}<span> ${Math.ceil(breakLeft() / 60e3)} min left</span></span>` : ''}</div>`;
ACT.gameBack = () => { game = null; clearInterval(gTick); sfx.tap(); paint(); };
ACT.gameStart = el => {
  if (breakLeft() <= 0) return go('break');
  const k = el.dataset.g, l = el.dataset.l;
  if (k === 'chess') game = { kind: 'chess', bot: l, st: G.fromFen(G.START), sel: -1, last: null, hist: [], over: '', busy: false };
  else if (k === 'ms') { const [rows, cols, n] = G.MS[l]; game = { kind: 'ms', level: l, rows, cols, n, g: null, flag: new Array(rows * cols).fill(false), over: '', t0: 0, t1: 0, boom: -1 }; }
  else { const { puz, sol } = G.sdNew(G.SD[l]); game = { kind: 'sd', level: l, puz, sol, cur: puz.slice(), sel: puz.indexOf(0), miss: 0, over: false, t0: Date.now() }; }
  sfx.pick(); paint();
};

// ----- chess -----
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }, PNAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
function chessEnd(c) {
  const s = G.status(c.st), bot = G.BOTS.find(b => b.id === c.bot);
  if (s === 'mate') {
    const won = c.st.turn === 'b';
    c.over = won ? `Checkmate. You beat ${bot.name}.` : `Checkmate. ${bot.name} wins this one.`;
    if (won) celebrate('♛', 'Checkmate', `You beat ${bot.name} (~${bot.elo})`); else sfx.bad();
  } else if (s === 'stalemate' || s === 'draw') { c.over = s === 'stalemate' ? 'Stalemate. It is a draw.' : 'Draw by the rules.'; sfx.hmm(); }
  return !!c.over;
}
function chessMove(c, m) {
  c.hist.push(c.st); c.st = G.play(c.st, m); c.last = m; c.sel = -1;
  m.x !== '.' ? sfx.drop() : sfx.pick();
  if (chessEnd(c)) return paint();
  c.busy = true; paint();
  setTimeout(() => { // a beat before the reply, so the bot does not feel instant
    if (game !== c) return;
    const bm = G.botMove(c.st, c.bot); c.busy = false;
    if (bm) { c.st = G.play(c.st, bm); c.last = bm; bm.x !== '.' ? sfx.drop() : sfx.tap(); }
    chessEnd(c); paint();
  }, 420);
}
function chessClick(i) {
  const c = game; if (c.over || c.busy || c.st.turn !== 'w') return;
  if (c.sel >= 0) {
    const ms = G.legal(c.st).filter(m => m.f === c.sel && m.t === i);
    if (ms.length) return chessMove(c, ms.find(m => !m.promo || m.promo === 'Q')); // shortcut: pawns always promote to a queen
  }
  const p = c.st.b[i];
  c.sel = p !== '.' && p === p.toUpperCase() && c.sel !== i ? i : -1; sfx.tap(); paint();
  $(`.sq[data-i="${i}"]`)?.focus();
}
ACT.chessUndo = () => { const c = game; if (!c.hist.length || c.busy) return; c.st = c.hist.pop(); c.over = ''; c.last = null; c.sel = -1; sfx.tap(); paint(); };
ACT.chessNew = () => ACT.gameStart({ dataset: { g: 'chess', l: game.bot } });
function chessView(root) {
  const c = game, st = c.st, bot = G.BOTS.find(b => b.id === c.bot), moves = c.over || c.busy ? [] : G.legal(st), to = new Set(moves.filter(m => m.f === c.sel).map(m => m.t));
  const chk = G.inCheck(st) ? st.b.indexOf(st.turn === 'w' ? 'K' : 'k') : -1;
  let sq = '';
  for (let i = 0; i < 64; i++) {
    const p = st.b[i], w = p !== '.' && p === p.toUpperCase();
    sq += `<button class="sq ${((i >> 3) + (i & 7)) % 2 ? 'd' : 'l'} ${i === c.sel ? 'sel' : ''} ${to.has(i) ? (p === '.' ? 'can' : 'cap') : ''} ${c.last && (i === c.last.f || i === c.last.t) ? 'last' : ''} ${i === chk ? 'chk' : ''}" data-i="${i}"
      aria-label="${G.sqName(i)}${p !== '.' ? `, ${w ? 'white' : 'black'} ${PNAME[p.toLowerCase()]}` : ''}${to.has(i) ? ', move here' : ''}">${p !== '.' ? `<span class="pc ${w ? 'w' : 'b'}">${GLYPH[p.toLowerCase()]}&#xFE0E;</span>` : ''}${i % 8 === 0 ? `<i class="rk">${8 - (i >> 3)}</i>` : ''}${i >= 56 ? `<i class="fl">${'abcdefgh'[i & 7]}</i>` : ''}</button>`;
  }
  const status = c.over || (c.busy ? `${bot.name} is thinking…` : chk >= 0 ? 'Check. Your move.' : c.sel >= 0 ? 'Pick a square to move to.' : 'Your move. You play white.');
  root.innerHTML = head('Chess', `vs ${bot.name} · ~${bot.elo} Elo`) + `<div class="chess-wrap"><div class="chess ${c.busy ? 'busy' : ''}" aria-label="Chess board">${sq}</div>
    <aside class="card g-side"><div class="g-bot"><span class="g-ava" aria-hidden="true">♞</span><div><b>${bot.name}</b><br><small class="muted">${bot.d}</small></div></div>
      <p class="g-status" role="status">${status}</p><div class="row"><button class="btn sm ghost" data-act="chessUndo" ${c.hist.length && !c.busy ? '' : 'disabled'}>Take back</button><button class="btn sm" data-act="chessNew">New game</button></div></aside></div>`;
  $('.chess', root).onclick = e => { const b = e.target.closest('.sq'); if (b) chessClick(+b.dataset.i); };
}

// ----- minesweeper -----
function msReveal(m, j) {
  if (m.g.mine[j]) { m.boom = j; m.over = 'lost'; m.t1 = Date.now(); sfx.bad(); return true; }
  G.msOpen(m.g, j, m.flag).length > 4 ? sfx.whoosh() : sfx.tap(); return false;
}
function msClick(i) {
  const m = game; if (m.over || m.flag[i]) return;
  if (!m.g) { m.g = G.msNew(m.rows, m.cols, m.n, i); m.t0 = Date.now(); }
  if (m.g.open[i]) { // chord: a number with all its flags placed opens the rest of its neighbours
    const nb = G.around(i, m.rows, m.cols);
    if (m.g.num[i] && nb.filter(j => m.flag[j]).length === m.g.num[i]) for (const j of nb) if (!m.flag[j] && !m.g.open[j] && msReveal(m, j)) break;
  } else msReveal(m, i);
  if (!m.over && G.msWon(m.g)) { m.over = 'won'; m.t1 = Date.now(); celebrate('🚩', 'Field cleared', `${LEVEL[m.level]} in ${Math.round((m.t1 - m.t0) / 1000)} s`); }
  paint(); $(`.ms [data-i="${i}"]`)?.focus();
}
function msFlag(i) { const m = game; if (m.over || m.g?.open[i]) return; m.flag[i] = !m.flag[i]; sfx.pick(); paint(); $(`.ms [data-i="${i}"]`)?.focus(); }
function msView(root) {
  const m = game, g = m.g, left = m.n - m.flag.filter(Boolean).length;
  let cells = '';
  for (let i = 0; i < m.rows * m.cols; i++) {
    const open = g?.open[i], mine = g?.mine[i], show = open || (m.over && mine), n = g?.num[i];
    cells += `<button class="mc ${open ? 'o n' + n : ''} ${m.flag[i] && !show ? 'f' : ''} ${m.over && mine ? 'mine' : ''} ${i === m.boom ? 'boom' : ''}" data-i="${i}" aria-label="${m.flag[i] && !show ? 'flagged' : show && mine ? 'mine' : open ? n || 'empty' : 'hidden'}">${m.flag[i] && !show ? '🚩' : show && mine ? '💣' : open && n ? n : ''}</button>`;
  }
  root.innerHTML = head('Minesweeper', LEVEL[m.level]) + `<div class="ms-top card"><span>💣 <b class="mono">${left}</b></span><span>⏱️ <b class="mono" id="msT">0</b> s</span>
    <span class="g-status" role="status">${m.over === 'won' ? 'Cleared. Nice sweeping.' : m.over ? 'Boom. Try again?' : 'Click to open, right-click or F to flag.'}</span>
    <button class="btn sm right" data-act="gameStart" data-g="ms" data-l="${m.level}">New game</button></div>
    <div class="ms-wrap"><div class="ms ${m.over ? 'over' : ''}" style="--cols:${m.cols}" aria-label="Minefield, ${m.rows} by ${m.cols}">${cells}</div></div>`;
  const grid = $('.ms', root);
  grid.onclick = e => { const b = e.target.closest('.mc'); if (b) msClick(+b.dataset.i); };
  grid.oncontextmenu = e => { const b = e.target.closest('.mc'); if (b) { e.preventDefault(); msFlag(+b.dataset.i); } };
  grid.onkeydown = e => { const b = e.target.closest('.mc'); if (b && e.key.toLowerCase() === 'f') { e.preventDefault(); msFlag(+b.dataset.i); } };
  clearInterval(gTick);
  const t = () => { const el = $('#msT'); if (el) el.textContent = m.t0 ? Math.round(((m.t1 || Date.now()) - m.t0) / 1000) : 0; };
  t(); if (!m.over) gTick = setInterval(t, 1000);
}

// ----- sudoku -----
function sdSet(v) {
  const s = game; if (s.over || s.sel < 0 || s.puz[s.sel]) return;
  s.cur[s.sel] = v;
  if (v && v !== s.sol[s.sel]) { s.miss++; sfx.bad(); } else sfx.tap();
  if (s.cur.every((x, i) => x === s.sol[i])) { s.over = true; celebrate('🧩', 'Sudoku solved', `${LEVEL[s.level]} in ${Math.round((Date.now() - s.t0) / 60000)} min, ${s.miss} slip${s.miss === 1 ? '' : 's'}`); }
  paint();
  if (v && v !== s.sol[s.sel]) replay($(`.sd [data-i="${s.sel}"]`), 'shake');
}
ACT.sdPad = el => sdSet(+el.dataset.v);
function sdView(root) {
  const s = game, r = Math.floor(s.sel / 9), c = s.sel % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3), v = s.cur[s.sel];
  let cells = '';
  for (let i = 0; i < 81; i++) {
    const ri = Math.floor(i / 9), ci = i % 9, peer = s.sel >= 0 && (ri === r || ci === c || Math.floor(ri / 3) * 3 + Math.floor(ci / 3) === b), x = s.cur[i];
    cells += `<button class="sc ${s.puz[i] ? 'g' : ''} ${i === s.sel ? 'sel' : peer ? 'peer' : ''} ${x && x === v ? 'same' : ''} ${x && x !== s.sol[i] ? 'bad' : ''}" data-i="${i}" aria-label="Row ${ri + 1}, column ${ci + 1}, ${x || 'empty'}${s.puz[i] ? ', given' : ''}">${x || ''}</button>`;
  }
  const left = d => 9 - s.cur.filter(x => x === d).length;
  root.innerHTML = head('Sudoku', LEVEL[s.level]) + `<div class="sd-wrap"><div class="sd" aria-label="Sudoku grid">${cells}</div>
    <aside class="card g-side"><p class="g-status" role="status">${s.over ? 'Solved. Your brain earned that.' : 'Pick a cell, then type 1 to 9. Arrow keys move.'}</p><p class="muted">${s.miss} slip${s.miss === 1 ? '' : 's'} so far</p>
      <div class="sd-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="btn ghost" data-act="sdPad" data-v="${d}" ${left(d) ? '' : 'disabled'}>${d}<small>${left(d)}</small></button>`).join('')}<button class="btn ghost" data-act="sdPad" data-v="0" aria-label="Erase">${icon('eraser', 18)}</button></div>
      <button class="btn sm" data-act="gameStart" data-g="sd" data-l="${s.level}">New puzzle</button></aside></div>`;
  $('.sd', root).onclick = e => { const el = e.target.closest('.sc'); if (el) { s.sel = +el.dataset.i; sfx.tap(); paint(); $(`.sd [data-i="${s.sel}"]`)?.focus(); } };
}
addEventListener('keydown', e => {
  if (cur !== 'break' || game?.kind !== 'sd' || $('.scrim:not(.out)') || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea')) return;
  const s = game, mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (mv) { e.preventDefault(); s.sel = (s.sel + mv + 81) % 81; paint(); return $(`.sd [data-i="${s.sel}"]`)?.focus(); }
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); sdSet(+e.key); $(`.sd [data-i="${s.sel}"]`)?.focus(); }
  else if (['Backspace', 'Delete', '0'].includes(e.key)) { e.preventDefault(); sdSet(0); $(`.sd [data-i="${s.sel}"]`)?.focus(); }
});

// ----- the room -----
PAGES.break = {
  render(root) {
    clearInterval(gTick);
    if (breakLeft() <= 0) {
      game = null;
      return void (root.innerHTML = `<div class="locked card">${ember(110, 4)}<h1>Break room locked</h1><p class="ci-line">${esc(dailyLine(4))}</p>
        <p class="muted">The 30 minutes of lockdown break time are used up. Cross off any task to unlock the room. Deleting tasks does not count.</p><button class="btn big" data-act="go" data-p="todo">${icon('todo')} Open to-do</button></div>`);
    }
    if (game) return { chess: chessView, ms: msView, sd: sdView }[game.kind](root);
    root.innerHTML = `<div class="ph"><h1>Break room</h1>${S.todo.lock ? `<span class="pill lvl4" id="lockLeft">${icon('lock', 13, 2.2)}<span> ${Math.ceil(breakLeft() / 60e3)} min left</span></span>` : ''}<span class="muted right">Ten minutes, then back to it.</span></div>
      <div class="brk">
        <button class="brk-rest" data-act="rest"><span class="rest-prev"></span><span class="rest-copy"><span class="rest-pt" data-clock="t"></span><b>${icon('moon', 18)} Rest</b><span>Wallpaper, clock and weather. Nothing else.</span></span></button>
        <section class="card gcard"><div class="gart" aria-hidden="true">♞</div><h2>Chess</h2><p class="muted">You play white against a bot.</p>
          <div class="lv">${G.BOTS.map((b, i) => `<button class="lvb" data-act="gameStart" data-g="chess" data-l="${b.id}"><b>${['Easy', 'Beginner', 'Intermediate'][i]}</b><small>${b.name} · ~${b.elo} Elo</small></button>`).join('')}
            <button class="lvb" disabled aria-describedby="hard-why"><b>Hard</b><small>Coming soon</small></button></div>
          <p class="soon-note" id="hard-why">Hard needs a full chess engine, and that AI is too big to fit in the app for now.</p></section>
        <section class="card gcard"><div class="gart" aria-hidden="true">💣</div><h2>Minesweeper</h2><p class="muted">The first click is always safe.</p>
          <div class="lv">${Object.entries(G.MS).map(([l, [r, c, n]]) => `<button class="lvb" data-act="gameStart" data-g="ms" data-l="${l}"><b>${LEVEL[l]}</b><small>${r}×${c} · ${n} mines</small></button>`).join('')}</div></section>
        <section class="card gcard"><div class="gart" aria-hidden="true">🧩</div><h2>Sudoku</h2><p class="muted">Every puzzle has exactly one answer.</p>
          <div class="lv">${Object.entries(G.SD).map(([l, n]) => `<button class="lvb" data-act="gameStart" data-g="sd" data-l="${l}"><b>${LEVEL[l]}</b><small>${n} clues</small></button>`).join('')}</div></section>
      </div>`;
    clocks();
    walls().then(list => { const p = $('.rest-prev', root); if (p && list.length) p.style.backgroundImage = `url("${list[(S.settings.wall || 0) % list.length]}")`; });
  },
  leave() { clearInterval(gTick); },
};
