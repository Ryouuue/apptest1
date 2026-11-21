// Music: Spotify search, your playlists and what is playing. Sign-in, API calls and playback live in player.js (sp, spPlay).
'use strict';
(() => {
  const MOODS = [['Lo-fi', 'lofi study'], ['Classical', 'classical focus'], ['Ambient', 'ambient focus'], ['Jazz', 'jazz study'], ['Piano', 'peaceful piano'], ['Rain', 'rain sounds']];
  let q = '', res = null, lists = null, seq = 0, timer = 0;
  const here = () => cur === 'music' && $('#mu-body');
  const dur = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const art = (u, cls = '') => u ? `<img class="mu-art ${cls}" src="${esc(u)}" alt="" loading="lazy">` : `<span class="mu-art ${cls} none">${icon('music', 18)}</span>`;
  const pick = im => (im?.find(i => i.width && i.width <= 320) || im?.[0])?.url || '';
  const total = p => p.tracks?.total ?? p.items?.total; // the API has used both names
  const skel = n => Array.from({ length: n }, () => '<div class="mu-card sk" aria-hidden="true"><span class="mu-art"></span><b></b><small></small></div>').join('');

  const card = p => `<button class="mu-card" data-act="muList" data-uri="${esc(p.uri)}" aria-label="Play playlist ${esc(p.name)}">
    <span class="mu-cov">${art(pick(p.images))}<span class="mu-go">${icon('play', 20)}</span></span><b>${esc(p.name)}</b><small class="muted">${total(p) != null ? total(p) + ' songs' : esc(p.owner?.display_name || '')}</small></button>`;
  const row = (t, i) => `<li><button class="mu-row ${t.uri === spState.uri ? 'on' : ''}" data-act="muTrack" data-i="${i}" aria-label="Play ${esc(t.name)} by ${esc(t.artists.map(a => a.name).join(', '))}">
    <span class="mu-n mono">${t.uri === spState.uri && spState.playing ? '<span class="eq"><i></i><i></i><i></i></span>' : i + 1}</span>${art(t.album?.images?.at(-1)?.url, 'sm')}
    <span class="grow"><b>${esc(t.name)}</b><small class="muted">${esc(t.artists.map(a => a.name).join(', '))}</small></span><span class="mono muted mu-d">${dur(t.duration_ms)}</span></button></li>`;

  function body() {
    const el = here(); if (!el) return;
    const st = $('#mu-st');
    if (q) {
      if (!res) { el.innerHTML = `<h2 class="mu-h">Searching</h2><div class="mu-grid">${skel(5)}</div>`; return; }
      const tr = res.tracks?.items?.filter(Boolean) || [], pl = res.playlists?.items?.filter(Boolean) || [];
      st.textContent = `${tr.length} songs and ${pl.length} playlists for ${q}`;
      el.innerHTML = tr.length + pl.length ? `${tr.length ? `<h2 class="mu-h">Songs</h2><ol class="mu-list">${tr.map(row).join('')}</ol>` : ''}
        ${pl.length ? `<h2 class="mu-h">Playlists</h2><div class="mu-grid">${pl.map(card).join('')}</div>` : ''}`
        : `<div class="empty">${ember(52)}<br>Nothing for “${esc(q)}”. Try fewer words.</div>`;
      return;
    }
    st.textContent = '';
    const mine = lists === 'scope' ? `<div class="mu-note"><span class="grow">Your playlists need one more permission.</span><button class="btn sm ghost" data-act="spConnect">Reconnect</button></div>`
      : !lists ? `<div class="mu-grid">${skel(6)}</div>`
      : lists.length ? `<div class="mu-grid">${lists.map(card).join('')}</div>` : '<div class="empty">No playlists yet. Search above to find some.</div>';
    el.innerHTML = `<h2 class="mu-h">Your playlists</h2>${mine}`;
  }

  function now() {
    const el = cur === 'music' && $('#mu-now'); if (!el || !S.spotify) return;
    const s = spState, idle = !s.title;
    el.className = `mu-now card ${s.playing ? 'playing' : ''}`;
    el.innerHTML = `<div class="mu-disc" aria-hidden="true">${s.big ? `<img src="${esc(s.big)}" alt="">` : ''}<i></i></div>
      <div class="grow mu-meta"><small class="mono muted">${idle ? 'NOTHING PLAYING' : s.playing ? 'NOW PLAYING' : 'PAUSED'}${s.device ? ' · ' + esc(s.device.toUpperCase()) : ''}</small>
      <b class="serif">${esc(s.title || 'Pick something below')}</b><span class="muted">${esc(s.artist || 'Open Spotify on any device, then press play here.')}</span></div>
      <div class="mu-ctl"><button class="icb" data-act="mPrev" aria-label="Previous">${icon('prev')}</button>
      <button class="playb" data-act="mPlay" aria-label="${s.playing ? 'Pause' : 'Play'}">${icon(s.playing ? 'pause' : 'play', 22)}</button>
      <button class="icb" data-act="mNext" aria-label="Next">${icon('next')}</button></div>
      <button class="mu-sw ${S.settings.spBreak ? 'on' : ''}" data-act="spBreak" role="switch" aria-checked="${!!S.settings.spBreak}" title="Pause Spotify when a timer break starts, resume with the next focus block"><i></i>Pause on breaks</button>`;
    $$('.mu-row', $('#mu-body')).forEach(b => {
      const t = res?.tracks?.items?.filter(Boolean)[+b.dataset.i]; if (!t) return;
      b.classList.toggle('on', t.uri === s.uri);
      $('.mu-n', b).innerHTML = t.uri === s.uri && s.playing ? '<span class="eq"><i></i><i></i><i></i></span>' : +b.dataset.i + 1;
    });
  }

  async function loadLists() {
    if (!S.spotify?.scope?.includes('playlist-read-private')) { lists = 'scope'; return body(); }
    try { lists = (await sp('/me/playlists?limit=50'))?.items?.filter(Boolean) || []; }
    catch (e) { lists = e.status === 403 ? 'scope' : []; if (e.status !== 403) toast(e.message, 'bad'); }
    body();
  }
  async function search(text) {
    q = text.trim(); res = null; const n = ++seq;
    if (!q) return body();
    body();
    try { const r = await sp('/search?' + new URLSearchParams({ q, type: 'track,playlist', limit: 10 })); if (n === seq) { res = r || {}; body(); } }
    catch (e) { if (n === seq) { res = {}; body(); toast(e.message, 'bad'); } }
  }

  ACT.muTrack = el => { const tr = res?.tracks?.items?.filter(Boolean) || [], i = +el.dataset.i; spPlay({ uris: tr.slice(i).map(t => t.uri) }); }; // the rest of the results queue up behind it
  ACT.muList = el => spPlay({ context_uri: el.dataset.uri });
  ACT.muMood = el => { const inp = $('#mu-q'); inp.value = el.dataset.q; search(inp.value); inp.focus(); };

  PAGES.music = {
    now,
    render(root) {
      if (!S.spotify) {
        lists = res = null; q = ''; // next account starts clean
        root.innerHTML = `<div class="ph"><h1>Music</h1></div>
          <section class="mu-hero card dots"><div class="mu-vinyl" aria-hidden="true"><i></i></div>
          <h2>Bring your music in</h2><p class="muted">Connect Spotify to search, play your playlists and keep the timer and your music in step. You sign in on Spotify’s own page; Tempo never sees your password.</p>
          <button class="btn big" data-act="spConnect">${icon('music', 18)} Connect Spotify</button><small class="muted">Playing and skipping need Spotify Premium.</small></section>`;
        return;
      }
      root.innerHTML = `<div class="ph"><h1>Music</h1>
        <form class="mu-search right" role="search"><label class="sr" for="mu-q">Search Spotify</label>${icon('search', 18)}<input id="mu-q" type="search" placeholder="Songs, artists, playlists" value="${esc(q)}" autocomplete="off"></form>
        <button class="icb" data-act="spOff" title="Disconnect Spotify" aria-label="Disconnect Spotify">${icon('x', 18)}</button></div>
        <div id="mu-now"></div>
        <div class="mu-moods" role="group" aria-label="Quick moods">${MOODS.map(([n, s]) => `<button class="tagc" data-act="muMood" data-q="${s}">${n}</button>`).join('')}</div>
        <p class="sr" id="mu-st" role="status" aria-live="polite"></p><div id="mu-body"></div>`;
      const inp = $('#mu-q', root);
      inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => search(inp.value), 350); };
      $('.mu-search', root).onsubmit = e => { e.preventDefault(); clearTimeout(timer); search(inp.value); };
      now(); body();
      if (!lists || lists === 'scope') loadLists();
      spPoll();
    },
    leave() { clearTimeout(timer); },
  };
})();
