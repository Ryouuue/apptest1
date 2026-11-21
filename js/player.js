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
  if (done) { const b = (t.total >= 45 * 60 ? 10 : 5) * 60; Object.assign(t, { mode: 'break', focus: t.total, total: b, left: b, running: true, at: Date.now() }); spBreakSync(true); }
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
  if (t.running) { t.left = timerLeft(); t.running = false; } else { t.at = Date.now(); t.running = true; if (t.mode === 'focus') spBreakSync(false); }
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
// PKCE needs no client secret, so Tempo ships its own public Client ID: users only sign in. Settings can override it with their own app.
// The Spotify app must list this page as a redirect URI: http://127.0.0.1:47615/ (desktop app) and the start.bat address. Controls need Premium.
const SPOTIFY_ID = ''; // Tempo's Spotify app Client ID (public by design under PKCE)
const spId = () => S.settings.spotifyId || SPOTIFY_ID;
const SP_SCOPE = 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
const spState = { connected: false, playing: false, title: '', artist: '', art: '', big: '', device: '', uri: '' };
const REDIRECT = location.origin + location.pathname;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function spToken(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: S.spotify?.id || spId(), ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (params.grant_type === 'refresh_token') { S.spotify = null; save(); } throw new Error(j.error_description || 'Spotify sign-in failed.'); }
  // id: a refresh token only works with the Client ID that issued it, so it is kept even if Settings changes later.
  S.spotify = { access: j.access_token, refresh: j.refresh_token || S.spotify?.refresh, exp: Date.now() + j.expires_in * 1000 - 60000, scope: j.scope || S.spotify?.scope || '', id: S.spotify?.id || spId() };
  saveNow();
}
ACT.spConnect = () => requireLogin(async () => {
  if (!spId()) { go('settings'); return toast('Add a Spotify Client ID under Notes and music first.'); }
  const ver = b64u(crypto.getRandomValues(new Uint8Array(48)));
  sessionStorage.setItem('sp_ver', ver);
  sessionStorage.setItem('sp_back', cur);
  const chal = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
  S.spotify = null; saveNow();
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: spId(), response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: chal, scope: SP_SCOPE });
});
ACT.spOff = () => { S.spotify = null; spState.connected = false; save(); renderPlayer(); go(cur === 'music' ? 'music' : 'settings'); toast('Spotify disconnected.'); };
async function spBoot() {
  const q = new URLSearchParams(location.search), code = q.get('code'), ver = sessionStorage.getItem('sp_ver'), back = sessionStorage.getItem('sp_back');
  if (q.has('code') || q.has('error')) history.replaceState(null, '', location.pathname + (back ? '#' + back : location.hash));
  if (q.get('error') === 'access_denied') toast('Spotify sign-in was cancelled.');
  if (code && ver) {
    sessionStorage.removeItem('sp_ver');
    try { await spToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: ver }); toast('Spotify connected.'); if (cur === 'music') go('music'); } catch (e) { toast(e.message, 'bad'); }
  }
  sessionStorage.removeItem('sp_back');
  spPoll();
}
const spErr = (msg, status) => Object.assign(new Error(msg), { status });
// Any Web API call. path is relative to /v1; body is sent as JSON.
async function sp(path, method = 'GET', body) {
  if (!S.spotify) throw spErr('Connect Spotify first.', 401);
  if (Date.now() > S.spotify.exp) await spToken({ grant_type: 'refresh_token', refresh_token: S.spotify.refresh });
  const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: { authorization: 'Bearer ' + S.spotify.access, ...(body && { 'content-type': 'application/json' }) }, body: body && JSON.stringify(body) });
  const player = path.startsWith('/me/player');
  if (r.status === 401) { S.spotify = null; save(); throw spErr('Spotify session expired. Connect again.', 401); }
  if (r.status === 403) throw spErr(player ? 'Spotify Premium is needed for playback controls.' : 'Spotify did not allow this. Reconnect to grant access.', 403);
  if (r.status === 404) throw spErr(player ? 'Open Spotify on a device first.' : 'Not found on Spotify.', 404);
  if (r.status === 429) throw spErr('Spotify is busy. Try again in a moment.', 429);
  if (!r.ok) throw spErr('Spotify did not answer. Try again.', r.status);
  return r.status === 200 ? r.json().catch(() => null) : null;
}
async function spPoll() {
  if (!S.spotify || document.hidden || !navigator.onLine || $('#app').hidden) return;
  const was = JSON.stringify(spState);
  try {
    const j = await sp('/me/player'), im = j?.item?.album?.images || [];
    Object.assign(spState, { connected: true, playing: !!j?.is_playing, title: j?.item?.name || '', artist: j?.item?.artists?.map(a => a.name).join(', ') || '', art: im.at(-1)?.url || '', big: (im[1] || im[0])?.url || '', device: j?.device?.name || '', uri: j?.item?.uri || '' });
    if (spState.connected && noise.on) noise.stop();
  } catch (e) { if (!S.spotify) { spState.connected = false; toast(e.message, 'bad'); } }
  if (was !== JSON.stringify(spState)) { renderPlayer(); if (cur === 'music') PAGES.music.now?.(); }
}
setInterval(spPoll, 5000);
const spDo = async (path, method) => { try { await sp('/me/player' + path, method); setTimeout(spPoll, 450); } catch (e) { toast(e.message, 'bad'); } };
// Start tracks or a playlist. With no active device, wake the first device Spotify knows about.
async function spPlay(body) {
  try { await sp('/me/player/play', 'PUT', body); }
  catch (e) {
    if (e.status !== 404) return toast(e.message, 'bad');
    const d = (await sp('/me/player/devices').catch(() => null))?.devices?.[0];
    if (!d) return toast('Open Spotify on your phone or PC, then press play again.', 'bad');
    try { await sp('/me/player/play?device_id=' + encodeURIComponent(d.id), 'PUT', body); } catch (e2) { return toast(e2.message, 'bad'); }
  }
  setTimeout(spPoll, 600);
}
// "Pause on breaks": pause when a break starts, resume when the next focus block starts (only if Tempo paused it).
function spBreakSync(isBreak) {
  if (!S.settings.spBreak || !spState.connected) return;
  if (isBreak && spState.playing) { spState.autoPaused = true; spDo('/pause', 'PUT'); }
  else if (!isBreak && spState.autoPaused) { spState.autoPaused = false; spDo('/play', 'PUT'); }
}
ACT.spBreak = () => { S.settings.spBreak = !S.settings.spBreak; save(); PAGES.music.now?.(); toast(S.settings.spBreak ? 'Music will pause on breaks.' : 'Music keeps playing on breaks.'); };

// ---------- now playing on this PC (desktop app): the song from any app (Spotify, a browser, a player), no account needed ----------
const sysMedia = { on: false }, deskMedia = window.tempoApp?.media;
const appName = id => { const k = String(id || '').split('!')[0].replace(/\.exe$/i, '').replace(/_[a-z0-9]{10,}$/i, '').split('.').pop(); return { chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', spotify: 'Spotify', zunemusic: 'Media Player', vlc: 'VLC' }[k.toLowerCase()] || k; };
if (deskMedia) {
  const set = s => {
    const was = JSON.stringify(sysMedia);
    Object.assign(sysMedia, { on: false, title: '', artist: '', art: '', app: '', playing: false, next: false, prev: false }, s);
    if (JSON.stringify(sysMedia) === was) return;
    if (sysMedia.playing && noise.on) noise.stop(); // one soundtrack at a time
    if (S.timer) renderPlayer();
  };
  deskMedia.on(set); deskMedia.state().then(set).catch(() => {});
}
const useSys = () => !spState.connected && sysMedia.on;
const sysDo = c => { deskMedia.cmd(c); if (c === 'toggle') { sysMedia.playing = !sysMedia.playing; renderPlayer(); } }; // the next report confirms it

ACT.mPlay = () => { if (spState.connected) return spDo(spState.playing ? '/pause' : '/play', 'PUT'); if (useSys()) return sysDo('toggle'); noise.on ? noise.stop() : noise.start(); renderPlayer(); };
ACT.mNext = () => { if (spState.connected) return spDo('/next', 'POST'); if (useSys()) return sysDo('next'); noise.step(1); renderPlayer(); };
ACT.mPrev = () => { if (spState.connected) return spDo('/previous', 'POST'); if (useSys()) return sysDo('prev'); noise.step(-1); renderPlayer(); };

function renderPlayer() {
  const sp = spState, t = S.timer, sys = useSys(), playing = sp.connected ? sp.playing : sys ? sysMedia.playing : noise.on;
  const art = sp.connected ? sp.art : sys ? sysMedia.art : '';
  const title = sp.connected ? sp.title || 'Nothing playing' : sys ? sysMedia.title : NOISE[noise.i][0];
  const sub = sp.connected ? sp.artist || 'Open Spotify on any device' : sys ? [sysMedia.artist, appName(sysMedia.app)].filter(Boolean).join(' · ') : 'Focus sound · works offline';
  const pl = $('#player'); pl.classList.toggle('np', sp.connected || sys); pl.classList.toggle('on', playing);
  pl.innerHTML = `<div class="trk">${art ? `<span class="art pic ${playing ? 'spin' : ''}"><img src="${esc(art)}" alt=""></span>` : `<div class="art">${playing ? '<div class="eq"><i></i><i></i><i></i></div>' : icon('music')}</div>`}
    <div class="grow"><b title="${esc(title)}">${esc(title)}</b><span class="muted">${esc(sub)}</span></div>
    ${sp.connected || sys ? '' : `<button class="btn sm ghost" data-act="spConnect">${icon('music', 15)} Connect Spotify</button>`}</div>
    <div class="ctl"><button class="icb" data-act="mPrev" aria-label="Previous" ${sys && !sysMedia.prev ? 'disabled' : ''}>${icon('prev')}</button>
    <button class="playb" data-act="mPlay" aria-label="${playing ? 'Pause' : 'Play'}">${icon(playing ? 'pause' : 'play', 22)}</button>
    <button class="icb" data-act="mNext" aria-label="Next" ${sys && !sysMedia.next ? 'disabled' : ''}>${icon('next')}</button></div>
    <div class="tmr ${t.running ? 'run' : ''} ${t.mode === 'break' ? 'brk' : ''}"><span class="muted">${t.mode === 'break' ? 'Break' : 'Focus'}</span><button class="tmr-t" id="tmrT" data-act="tLen" title="Change focus length" aria-label="Timer, change focus length"></button>
    <button class="btn sm" data-act="tToggle">${t.running ? 'Pause' : 'Start'}</button>
    <button class="icb" data-act="tDone" title="${t.mode === 'break' ? 'Skip break' : 'Finish and log'}" aria-label="${t.mode === 'break' ? 'Skip break' : 'Finish and log session'}">${icon('check')}</button>
    <button class="icb" data-act="zen" title="Zen timer (Z)" aria-label="Zen timer">${icon('expand')}</button></div><i class="tmr-bar" id="tmrB"></i>`;
  tick();
}
