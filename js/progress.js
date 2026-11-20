// Progress (graphs, heatmap, profile, momentum, achievements) and Settings.
'use strict';
(() => {
  function heat() {
    const t = today(), start = L.addDays(L.weekStart(t), -77), goal = S.profile.daily, by = {};
    for (const s of S.sessions) by[s.d] = (by[s.d] || 0) + s.m;
    let h = '';
    for (let i = 0; i < 84; i++) { const k = L.addDays(start, i), m = by[k] || 0; h += k > t ? '<i style="opacity:.3"></i>' : `<i class="${m >= goal ? 'l3' : m >= goal / 2 ? 'l2' : m ? 'l1' : ''}" title="${k}: ${m} min"></i>`; }
    return `<div class="heat" role="img" aria-label="Study minutes for the last 12 weeks">${h}</div>`;
  }
  ACT.retake = () => startOnboarding(true);

  PAGES.progress = {
    render(root) {
      const p = S.profile, st = stats(), lv = L.levelOf(S.xp), got = L.ACH.filter(a => S.ach[a.id]).length;
      const avg = S.quizzes.length ? Math.round(S.quizzes.reduce((n, q) => n + q.score / q.total, 0) / S.quizzes.length * 100) : null;
      root.innerHTML = `<div class="ph"><h1>Progress</h1><span class="chip">Level ${lv.level} · ${lv.into} / ${lv.span} XP</span><span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="recap">Weekly recap</button><button class="btn sm ghost" data-act="retake">Retake survey</button></span></div>
        <section class="stats" style="margin-bottom:18px"><div class="stat"><span class="flame" style="font-size:22px">🔥</span><div class="big">${st.streak} <small>days</small></div><small>Daily streak</small></div>
          <div class="stat"><span style="font-size:22px">⏱️</span><div class="big">${st.totalMin} <small>min</small></div><small>${st.sessions} study sessions</small></div>
          <div class="stat"><span style="font-size:22px">❓</span><div class="big">${avg == null ? '–' : avg + '%'}</div><small>${st.quizzes} quizzes, average score</small></div>
          <div class="stat"><span style="font-size:22px">🗓️</span><div class="big">${st.weeks} <small>weeks</small></div><small>Weekly streak</small></div></section>
        <div class="grid2"><section class="card"><h2>Last 14 days <span class="muted right" style="font:500 13px var(--font)">goal ${p.daily} min a day</span></h2>${barChart(14)}</section>
          <section class="card"><h2>Last 12 weeks</h2>${heat()}<p class="muted" style="margin-top:12px">Darker squares are days closer to the daily goal. Weeks run top to bottom, Monday first.</p></section></div>
        <div class="grid2"><section class="card"><h2>${p.archetype} <span class="chip right">${p.style} learner</span></h2><div style="display:grid;justify-items:center">${radar(p, 330)}</div>${vakBars(p)}</section>
          <section class="card"><h2>Momentum</h2>
            <div class="quest"><span class="e">🧊</span><div class="grow"><b>${S.freezes} of 2 streak freezes</b><br><small class="muted">A freeze covers one missed day automatically. Clear all daily quests to earn one.</small></div></div>
            <div class="quest"><span class="e">🗝️</span><div class="grow"><b>${S.chests} quest chests opened</b><br><small class="muted">Three small quests reset every midnight.</small></div></div>
            <div class="quest"><span class="e">🧩</span><div class="grow"><b>${st.lessons} lessons finished</b><br><small class="muted">${st.chapters} chapters done across ${S.courses.length} course${S.courses.length === 1 ? '' : 's'}.</small></div></div>
            <div class="quest"><span class="e">🃏</span><div class="grow"><b>${st.reviews} flashcard reviews</b><br><small class="muted">${S.cards.filter(c => c.box >= 4).length} cards in long-term boxes.</small></div></div>
            <div class="row" style="margin-top:10px"><button class="btn sm" data-act="go" data-p="learn">Open Learn</button><button class="btn sm ghost" data-act="keys">Keyboard shortcuts</button></div></section></div>
        <section class="card"><h2>Achievements <span class="muted right" style="font:500 13px var(--font)">${got} of ${L.ACH.length}</span></h2>
          <div class="achs">${L.ACH.map(a => `<div class="ach ${S.ach[a.id] ? '' : 'lock'}" title="${S.ach[a.id] ? 'Unlocked ' + ago(S.ach[a.id]) : 'Locked'}"><span class="e">${a.e}</span><b>${a.n}</b><small>${a.d}</small></div>`).join('')}</div></section>`;
    },
  };

  // ---------- settings ----------
  ACT.sfxTog = el => { S.settings.sfx = !S.settings.sfx; el.setAttribute('aria-checked', S.settings.sfx); save(); sfx.ok(); };
  ACT.setGoal = el => { S.profile.daily = +el.dataset.v; save(); go('settings'); };
  ACT.logout = () => { noise.stop(); logout(); enterApp(); toast('Logged out. Your account data stays on this PC.'); };
  ACT.login = () => openAuth(null, 'login');
  ACT.keysSave = () => {
    const vals = $$('[data-key]').map(i => [i.dataset.key, i.value.trim()]), models = $$('[data-model]').map(i => [i.dataset.model, i.value.trim()]), lm = $$('[data-lmodel]').map(i => [i.dataset.lmodel, i.value.trim()]), spid = $('#spid').value.trim();
    const apply = () => {
      for (const [k, v] of vals) if (v) S.settings.keys[k] = v; // an empty field keeps the saved key
      for (const [k, v] of models) if (v) S.settings.models[k] = v;
      for (const [k, v] of lm) if (v) S.settings.lmodels[k] = v;
      S.settings.spotifyId = spid; save(); sfx.ok(); go('settings'); toast('Saved.');
    };
    vals.some(([, v]) => v) || spid !== S.settings.spotifyId ? requireLogin(apply) : apply(); // keys and Spotify need a Tempo account; model ids do not
  };
  ACT.keysForget = () => { S.settings.keys = {}; save(); go('settings'); toast('API keys removed from this PC.'); };
  ACT.exportData = () => {
    // Secrets never leave in a backup file.
    saveFile(`tempo-backup-${today()}.json`, JSON.stringify({ ...S, settings: { ...S.settings, keys: {} }, spotify: null }, null, 1), 'application/json');
    toast('Backup saved (API keys left out).');
  };
  ACT.importData = () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      let d; try { d = JSON.parse(await inp.files[0].text()); } catch { return toast('That file is not a Tempo backup.', 'bad'); }
      if (!d || typeof d !== 'object' || !d.settings || !Array.isArray(d.sessions)) return toast('That file is not a Tempo backup.', 'bad');
      const m = modal(`<h2>Replace current data?</h2><p class="muted">Importing replaces the notes, board, sessions and profile in this account with the backup. This cannot be undone.</p>
        <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="imp-go">Replace with backup</button></div>`);
      $('#imp-go', m).onclick = () => { const keys = S.settings.keys, spot = S.spotify; localStorage.setItem(KEY(user), JSON.stringify(d)); S = load(); S.settings.keys = keys; S.spotify = spot; saveNow(); closeModal(); enterApp(); toast('Backup imported.'); };
    };
    inp.click();
  };
  ACT.resetData = () => {
    const m = modal(`<h2>Erase everything?</h2><p class="muted">This deletes the profile, notes, board, courses, cards, sessions and streaks ${user ? 'in this account' : 'on this PC'}. It cannot be undone. Export a backup first if unsure.</p>
      <div class="foot"><button class="btn ghost" data-act="closeModal" autofocus>Keep my data</button><button class="btn danger" id="rst-go">Erase everything</button></div>`);
    $('#rst-go', m).onclick = () => { noise.stop(); clearTimeout(saveT); saveT = 0; localStorage.removeItem(KEY(user)); S = load(); closeModal(); enterApp(); };
  };

  PAGES.settings = {
    render(root) {
      const s = S.settings, acc = user && accounts()[user], login = s.aiMode === 'login';
      root.innerHTML = `<div class="ph"><h1>Settings</h1><button class="btn sm ghost right" data-act="keys">Keyboard shortcuts</button></div><div class="set">
        <section class="card"><h2>Look and feel</h2><label class="f" style="margin-top:0">UI theme</label><div class="pick">${uiCards()}</div>
          <label class="f">Colour${s.ui === 'dev1' ? ' <span class="muted" style="text-transform:none;letter-spacing:0">· Development 1 keeps its own lavender palette</span>' : ''}</label><div class="pick">${pickCards('theme', THEMES)}</div>
          <div class="row" style="margin-top:18px"><span class="grow"><b>Sound effects</b><br><small class="muted">Taps, sticky-note drops and celebration chimes</small></span><button class="tgl" role="switch" aria-label="Sound effects" aria-checked="${s.sfx}" data-act="sfxTog"></button></div>
          <div class="row" style="margin-top:14px"><span class="grow"><b>Weather location</b><br><small class="muted">${s.geo ? esc(s.geo.name) : 'This device’s location'} · for the clock widget and the rest screen</small></span><button class="btn sm ghost" data-act="wxSet">Change</button></div></section>
        <section class="card"><h2>Account and plan</h2>
          ${user ? `<div class="row"><span class="ava">${esc((acc?.name || user)[0].toUpperCase())}</span><span class="grow"><b>${esc(acc?.name || user)}</b><br><small class="muted">${esc(user)} · Tempo account on this PC</small></span><button class="btn sm ghost" data-act="logout">Log out</button></div>`
          : `<p class="muted">No Tempo account. One keeps separate profiles on this PC and unlocks Spotify, vault and own-key connections.</p><div class="row" style="margin-top:12px"><button class="btn sm" data-act="account">Create account</button><button class="btn sm ghost" data-act="login">Log in</button></div>`}
          <label class="f" style="margin-top:20px">Daily study goal</label><div class="seg">${[15, 30, 60, 120].map(v => `<button class="${S.profile.daily === v ? 'on' : ''}" aria-pressed="${S.profile.daily === v}" data-act="setGoal" data-v="${v}">${v} min</button>`).join('')}</div>
          <div style="margin-top:18px"><button class="btn sm ghost" data-act="retake">Retake the study survey</button></div></section>
        <section class="card"><h2>AI tutor</h2><div class="pick">${pickCards('ai', AI_PICKS)}</div>
          <label class="f">How to connect</label><div class="seg"><button class="${login ? 'on' : ''}" aria-pressed="${login}" data-act="aiMode" data-v="login">Sign in, no key</button><button class="${login ? '' : 'on'}" aria-pressed="${!login}" data-act="aiMode" data-v="key">My own API key</button></div>
          ${login ? `<div class="row" style="margin-top:14px"><span class="grow">${s.aiUser ? `<b>Signed in</b> <span class="ok-chip">· ${esc(s.aiUser)}</span>` : '<b>Not signed in</b>'}<br><small class="muted">Sign-in runs through Puter, which provides the models. Questions pass through Puter and usage counts against that account.</small></span>
              <button class="btn sm ${s.aiUser ? 'ghost' : ''}" data-act="${s.aiUser ? 'aiSignOut' : 'aiSignIn'}">${s.aiUser ? 'Sign out' : 'Sign in'}</button></div>
            <label class="f">Model ids (advanced)</label><div class="row">${AI_PICKS.map(([v, n]) => `<input class="inp" style="width:auto;flex:1;min-width:150px" data-lmodel="${v}" value="${esc(s.lmodels[v])}" aria-label="${n} sign-in model id" title="${n}">`).join('')}</div>`
          : AI_PICKS.map(([v, n]) => `<label class="f" for="k-${v}">${n} API key ${s.keys[v] ? '<span class="ok-chip">· saved</span>' : ''}</label><div class="row" style="flex-wrap:nowrap"><input class="inp grow" id="k-${v}" type="password" data-key="${v}" placeholder="${s.keys[v] ? '•••••••• (leave empty to keep)' : 'Paste key'}" autocomplete="off"><input class="inp" style="width:170px" data-model="${v}" value="${esc(s.models[v])}" aria-label="${n} model id" title="Model id"></div>`).join('')
            + '<p class="muted" style="margin-top:12px;font-size:12px">Keys stay in this app\'s storage on this PC and are sent only to their provider.</p>'}
          <div class="row" style="margin-top:14px"><button class="btn sm" data-act="keysSave">Save</button>${login ? '' : '<button class="btn sm ghost" data-act="keysForget">Forget keys</button>'}</div></section>
        <section class="card"><h2>Notes and music</h2><label class="f" style="margin-top:0">Notes home</label><div class="pick">${pickCards('notes', NOTE_HOMES)}</div>
          <div style="margin-top:12px"><button class="btn sm ghost" data-act="vaultConnect">Connect an Obsidian vault folder</button></div>
          <label class="f" for="spid" style="margin-top:20px">Spotify Client ID ${S.spotify ? '<span class="ok-chip">· connected</span>' : ''}</label><input class="inp" id="spid" value="${esc(s.spotifyId)}" placeholder="From developer.spotify.com/dashboard" autocomplete="off">
          <p class="muted" style="margin-top:8px;font-size:12px">Create a Spotify app, add <b>${esc(REDIRECT)}</b> as its redirect URI, paste the Client ID, save, then connect. Play and skip need Spotify Premium.</p>
          <div class="row" style="margin-top:12px"><button class="btn sm" data-act="keysSave">Save</button>${S.spotify ? '<button class="btn sm ghost" data-act="spOff">Disconnect Spotify</button>' : '<button class="btn sm ghost" data-act="spConnect">Connect Spotify</button>'}</div></section>
        <section class="card" style="grid-column:1/-1"><h2>Your data</h2><p class="muted">Everything is stored on this PC. Back it up before moving to another computer.</p>
          <div class="row" style="margin-top:12px"><button class="btn sm ghost" data-act="exportData">Export backup</button><button class="btn sm ghost" data-act="importData">Import backup</button><button class="btn sm ghost right" style="color:var(--bad)" data-act="resetData">Erase everything</button></div></section></div>`;
    },
  };
})();
