// Bottom bar: focus timer, offline focus sounds, Spotify remote.
'use strict';

// ---------- focus timer ----------
function initTimer() { const s = (S.profile?.pomo || 25) * 60; S.timer ||= { total: s, left: s, running: false, at: 0, mode: 'focus' }; }
const timerLeft = () => { const t = S.timer; return t.running ? Math.max(0, t.left - (Date.now() - t.at) / 1000) : t.left; };
// A focus block that runs to the end is logged and rolls straight into a break (5 min, or 10 after 45+). Breaks are never logged.
function timerEnd(done) {
  const t = S.timer, mins = Math.round((t.total - timerLeft()) / 60);
  if (t.mode === 'break') {
    const f = t.focus || (S.profile?.pomo || 25) * 60;
    Object.assign(t, { mode: 'focus', total: f, left: f, running: false }); save(); renderPlayer();
    if (done) { sfx.ok(); notify('Break over. Ready for the next block?', '⏰'); }
    return;
  }
  if (done) { const b = (t.total >= 45 * 60 ? 10 : 5) * 60; Object.assign(t, { mode: 'break', focus: t.total, total: b, left: b, running: true, at: Date.now() }); }
  else Object.assign(t, { left: t.total, running: false });
  save(); renderPlayer();
  if (mins < 1) return toast('Under a minute, so nothing was logged.');
  if (done) sfx.win();
  toast(`Logged ${mins} min of focus. +${mins * 2} XP${done ? '. Break time.' : ''}`, '', done ? ['Break room', () => go('break')] : null);
  logSession(mins);
}
function tick() {
  const t = S.timer, el = $('#tmrT'); if (!t || !el) return;
  const left = timerLeft(), s = Math.ceil(left);
  el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  $('#tmrB').style.transform = `scaleX(${1 - left / t.total})`;
  document.title = t.running ? el.textContent + ' · Tempo' : 'Tempo · study in rhythm';
  if ($('#zenT')) { $('#zenT').textContent = el.textContent; $('#zenP').textContent = t.running ? 'Pause' : 'Resume'; $('#zenL').textContent = t.mode === 'break' ? 'BREAK · STEP AWAY FROM THE SCREEN' : 'FOCUS · ONE TASK ONLY'; }
  if (t.running && left <= 0) timerEnd(true);
}
setInterval(tick, 500);
ACT.tToggle = () => {
  const t = S.timer;
  if (t.running) { t.left = timerLeft(); t.running = false; } else { t.at = Date.now(); t.running = true; }
  save(); renderPlayer();
};
ACT.focus = () => ACT.zen();
ACT.tDone = () => timerEnd(false);
ACT.tLen = el => {
  const p = popover(el, `<h3 style="margin-bottom:10px">Focus length</h3><div class="row">${[15, 25, 45, 50].map(m => `<button class="btn sm ${S.timer.total === m * 60 ? '' : 'ghost'}" data-act="tSet" data-m="${m}">${m} min</button>`).join('')}</div>`);
  if (p) p.style.width = 'auto';
};
ACT.tSet = el => { const s = el.dataset.m * 60; Object.assign(S.timer, { mode: 'focus', total: s, left: s, running: false }); save(); $('.pop')?.remove(); renderPlayer(); };

// ---------- offline focus sounds (generated, no files) ----------
const NOISE = [['Brown noise', 'brown'], ['Soft rain', 'pink'], ['White noise', 'white']];
const noise = {
  on: false, i: 0, ctx: null, src: null, g: null,
  start() {
    const c = (this.ctx ||= new AudioContext()); c.resume();
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), kind = NOISE[this.i][1];
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .12; }
      else d[i] = w * .22;
    }
    this.g = c.createGain(); this.g.gain.setValueAtTime(.0001, c.currentTime); this.g.gain.exponentialRampToValueAtTime(.16, c.currentTime + .7); // slow in
    this.src = c.createBufferSource(); this.src.buffer = buf; this.src.loop = true; this.src.connect(this.g).connect(c.destination); this.src.start(); this.on = true;
  },
  stop() {
    if (!this.on) return;
    const t = this.ctx.currentTime; this.g.gain.setValueAtTime(this.g.gain.value, t); this.g.gain.exponentialRampToValueAtTime(.0001, t + .4); this.src.stop(t + .45); this.on = false;
  },
  step(n) { const was = this.on; this.stop(); this.i = (this.i + n + NOISE.length) % NOISE.length; if (was) this.start(); },
};

// ---------- Spotify remote (Authorization Code + PKCE, no secret) ----------
// Needs the user's own Spotify app Client ID with this page registered as redirect URI, and Premium for controls.
const spState = { connected: false, playing: false, title: '', artist: '', art: '' };
const REDIRECT = location.origin + location.pathname;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function spToken(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: S.settings.spotifyId, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || 'Spotify sign-in failed.');
  S.spotify = { access: j.access_token, refresh: j.refresh_token || S.spotify?.refresh, exp: Date.now() + j.expires_in * 1000 - 60000 };
  saveNow();
}
ACT.spConnect = () => requireLogin(async () => {
  if (!S.settings.spotifyId) { go('settings'); return toast('Paste your Spotify Client ID under Integrations first.'); }
  const ver = b64u(crypto.getRandomValues(new Uint8Array(48)));
  sessionStorage.setItem('sp_ver', ver);
  const chal = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
  saveNow();
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: S.settings.spotifyId, response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: chal, scope: 'user-read-playback-state user-modify-playback-state' });
});
ACT.spOff = () => { S.spotify = null; spState.connected = false; save(); renderPlayer(); go('settings'); toast('Spotify disconnected.'); };
async function spBoot() {
  const q = new URLSearchParams(location.search), code = q.get('code'), ver = sessionStorage.getItem('sp_ver');
  if (q.has('code') || q.has('error')) history.replaceState(null, '', location.pathname + location.hash);
  if (code && ver) {
    sessionStorage.removeItem('sp_ver');
    try { await spToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: ver }); toast('Spotify connected.'); } catch (e) { toast(e.message, 'bad'); }
  }
  spPoll();
}
async function sp(path, method = 'GET') {
  if (Date.now() > S.spotify.exp) await spToken({ grant_type: 'refresh_token', refresh_token: S.spotify.refresh });
  const r = await fetch('https://api.spotify.com/v1/me/player' + path, { method, headers: { authorization: 'Bearer ' + S.spotify.access } });
  if (r.status === 401) { S.spotify = null; save(); throw new Error('Spotify session expired. Connect again.'); }
  if (r.status === 403) throw new Error('Spotify Premium is needed for playback controls.');
  if (r.status === 404) throw new Error('Open Spotify on a device first.');
  return r.status === 200 ? r.json().catch(() => null) : null;
}
async function spPoll() {
  if (!S.spotify || document.hidden || !navigator.onLine || $('#app').hidden) return;
  const was = JSON.stringify(spState);
  try {
    const j = await sp('');
    Object.assign(spState, { connected: true, playing: !!j?.is_playing, title: j?.item?.name || '', artist: j?.item?.artists?.map(a => a.name).join(', ') || '', art: j?.item?.album?.images?.at(-1)?.url || '' });
    if (spState.connected && noise.on) noise.stop();
  } catch (e) { if (!S.spotify) { spState.connected = false; toast(e.message, 'bad'); } }
  if (was !== JSON.stringify(spState)) renderPlayer();
}
setInterval(spPoll, 5000);
const spDo = async (path, method) => { try { await sp(path, method); setTimeout(spPoll, 450); } catch (e) { toast(e.message, 'bad'); } };

ACT.mPlay = () => { if (spState.connected) return spDo(spState.playing ? '/pause' : '/play', 'PUT'); noise.on ? noise.stop() : noise.start(); renderPlayer(); };
ACT.mNext = () => { if (spState.connected) return spDo('/next', 'POST'); noise.step(1); renderPlayer(); };
ACT.mPrev = () => { if (spState.connected) return spDo('/previous', 'POST'); noise.step(-1); renderPlayer(); };

function renderPlayer() {
  const sp = spState, t = S.timer, playing = sp.connected ? sp.playing : noise.on;
  $('#player').innerHTML = `<div class="trk">${sp.connected && sp.art ? `<img class="art" src="${esc(sp.art)}" alt="">` : `<div class="art">${playing ? '<div class="eq"><i></i><i></i><i></i></div>' : icon('music')}</div>`}
    <div class="grow"><b>${esc(sp.connected ? sp.title || 'Nothing playing' : NOISE[noise.i][0])}</b><span class="muted">${esc(sp.connected ? sp.artist || 'Open Spotify on any device' : 'Focus sound · works offline')}</span></div>
    ${sp.connected ? '' : `<button class="btn sm ghost" data-act="spConnect">${icon('music', 15)} Connect Spotify</button>`}</div>
    <div class="ctl"><button class="icb" data-act="mPrev" aria-label="Previous">${icon('prev')}</button>
    <button class="playb" data-act="mPlay" aria-label="${playing ? 'Pause' : 'Play'}">${icon(playing ? 'pause' : 'play', 22)}</button>
    <button class="icb" data-act="mNext" aria-label="Next">${icon('next')}</button></div>
    <div class="tmr ${t.running ? 'run' : ''} ${t.mode === 'break' ? 'brk' : ''}"><span class="muted">${t.mode === 'break' ? 'Break' : 'Focus'}</span><button class="tmr-t" id="tmrT" data-act="tLen" title="Change focus length" aria-label="Timer, change focus length"></button>
    <button class="btn sm" data-act="tToggle">${t.running ? 'Pause' : 'Start'}</button>
    <button class="icb" data-act="tDone" title="${t.mode === 'break' ? 'Skip break' : 'Finish and log'}" aria-label="${t.mode === 'break' ? 'Skip break' : 'Finish and log session'}">${icon('check')}</button>
    <button class="icb" data-act="zen" title="Zen timer (Z)" aria-label="Zen timer">${icon('expand')}</button></div><i class="tmr-bar" id="tmrB"></i>`;
  tick();
}
