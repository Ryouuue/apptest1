// Profile: who you are in Tempo. Screen time today, achievements as medals, your numbers and personal records, a 24-hour
// study clock, and the locker for cosmetics (a title and banners work now; shop items arrive with the shop).
'use strict';
(() => {
  const GOLD = ['s7', 'h10', 'course', 'perfect', 'todo25', 'quests', 'lvl5', 'cards'], SILVER = ['s3', 'w2', 'h1', 'frog', 'arch', 'chap', 'owl', 'lark'];
  const tier = id => (GOLD.includes(id) ? 'gold' : SILVER.includes(id) ? 'silver' : 'bronze');
  // Banners unlock with levels; the shop adds more later. [id, name, level needed]
  const BANNERS = [['dawn', 'Dawn', 1], ['mint', 'Mint grid', 2], ['dusk', 'Dusk', 4], ['stars', 'Night sky', 6], ['ember', 'Ember glow', 9], ['candy', 'Candy pop', 12]];
  const SHOP = [['🖼️', 'Avatar frame'], ['🔥', 'Ember skin'], ['✨', 'Profile effect'], ['🏷️', 'Name colour']];
  const hm = sec => { const m = Math.round(sec / 60); return m < 60 ? `${m}<small> min</small>` : `${Math.floor(m / 60)}<small> h</small> ${m % 60}<small> min</small>`; };
  const persona = h => (h < 0 ? ['🌱', 'Just getting started'] : h >= 5 && h < 12 ? ['🐦', 'Morning lark'] : h >= 12 && h < 18 ? ['☀️', 'Afternoon ace'] : h >= 18 && h < 22 ? ['🌆', 'Evening engine'] : ['🦉', 'Night owl']);
  function bestStreak(days) { let best = 0, run = 0, prev = null; for (const k of [...days].sort()) { run = prev && L.addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; } return best; }

  // 24 bars around a dial: minutes studied in each hour of the day, all time.
  function clock() {
    const by = Array(24).fill(0); for (const s of S.sessions) by[s.h] = (by[s.h] || 0) + s.m;
    const max = Math.max(...by), peak = max ? by.indexOf(max) : -1, [e, name] = persona(peak);
    const bars = by.map((m, h) => {
      const a = (h / 24) * Math.PI * 2 - Math.PI / 2, r0 = 52, r1 = r0 + (max ? 6 + m / max * 34 : 6), c = Math.cos(a), s = Math.sin(a);
      return `<line x1="${(100 + c * r0).toFixed(1)}" y1="${(100 + s * r0).toFixed(1)}" x2="${(100 + c * r1).toFixed(1)}" y2="${(100 + s * r1).toFixed(1)}" class="${h === peak ? 'pk' : m ? 'on' : ''}" style="--i:${h}"><title>${String(h).padStart(2, '0')}:00 · ${m} min</title></line>`;
    }).join('');
    const ticks = [0, 6, 12, 18].map(h => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; return `<text x="${(100 + Math.cos(a) * 40).toFixed(1)}" y="${(104 + Math.sin(a) * 40).toFixed(1)}">${String(h).padStart(2, '0')}</text>`; }).join('');
    return `<div class="pf-clock"><svg viewBox="0 0 200 200" role="img" aria-label="Minutes studied by hour of day${peak >= 0 ? ', peak at ' + peak + ':00' : ''}">${bars}${ticks}</svg>
      <div><span class="pf-big" aria-hidden="true">${e}</span><b>${name}</b><p class="muted">${peak >= 0 ? `You study most around <b>${String(peak).padStart(2, '0')}:00</b>. Plan the hard stuff there.` : 'Finish a focus block and your clock starts to fill in.'}</p></div></div>`;
  }

  PAGES.profile = {
    render(root) {
      const p = S.profile, st = stats(), lv = L.levelOf(S.xp), t = st.t, acc = user && accounts()[user];
      const look = S.look, banner = BANNERS.find(b => b[0] === look.banner && lv.level >= b[2]) || BANNERS[0];
      const title = L.ACH.find(a => a.id === look.title && S.ach[a.id]);
      const used = S.usage[t] || 0, week = Array.from({ length: 7 }, (_, i) => L.addDays(t, i - 6)), wkUse = week.reduce((n, k) => n + (S.usage[k] || 0), 0), maxU = Math.max(60, ...week.map(k => S.usage[k] || 0));
      const got = L.ACH.filter(a => S.ach[a.id]), avg = S.quizzes.length ? Math.round(S.quizzes.reduce((n, q) => n + q.score / q.total, 0) / S.quizzes.length * 100) : null;
      const byDay = {}; for (const s of S.sessions) byDay[s.d] = (byDay[s.d] || 0) + s.m;
      const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0], longest = Math.max(0, ...S.sessions.map(s => s.m)), bestQ = Math.max(-1, ...S.quizzes.map(q => Math.round(q.score / q.total * 100)));
      const since = [...st.days].sort()[0];
      const nums = [['⏱️', st.totalMin, 'minutes focused'], ['🎯', st.sessions, 'focus sessions'], ['📝', st.notes, 'notes written'], ['🃏', st.reviews, 'cards reviewed'], ['❓', st.quizzes, `quizzes${avg == null ? '' : ` · ${avg}% avg`}`],
        ['🧩', st.lessons, 'lessons finished'], ['✏️', st.tasksDone, 'to-dos crossed off'], ['🐸', st.frogs, 'frogs eaten'], ['🗂️', S.boards.length, 'archive boards'], ['🪙', S.pts, 'shop points']];
      const recs = [['🔥', bestStreak(st.days) + ' days', 'Longest streak'], ['⌛', longest ? longest + ' min' : '–', 'Longest session'], ['📅', bestDay ? bestDay[1] + ' min' : '–', bestDay ? 'Best day · ' + L.parseKey(bestDay[0]).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : 'Best day'], ['💯', bestQ >= 0 ? bestQ + '%' : '–', 'Best quiz']];
      root.innerHTML = `<div class="pf">
        <section class="pf-hero card bn-${banner[0]}"><div class="pf-banner" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="pf-id"><span class="pf-ava">${esc((p.name || '?')[0].toUpperCase())}<span class="pf-lv" title="Level ${lv.level}">${lv.level}</span></span>
            <div class="grow"><h1>${esc(p.name)}</h1>${title ? `<span class="pf-title">${title.e} ${esc(title.n)}</span>` : '<span class="pf-title none">No title yet · pick one in the locker</span>'}
              <p class="muted">${esc(p.archetype)} · ${esc(p.style)} learner${since ? ` · studying since ${L.parseKey(since).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}</p></div>
            <div class="pf-acc">${user ? `<small class="muted">${esc(acc?.name || user)} · signed in</small><button class="btn sm ghost" data-act="go" data-p="settings">${icon('sliders', 15)} Settings</button>` : '<small class="muted">Guest on this PC</small><button class="btn sm" data-act="account">Create account</button>'}</div></div>
          <div class="pf-xp"><span class="mono">LV ${lv.level}</span><div class="bar"><i style="width:${lv.into / lv.span * 100}%"></i></div><span class="mono muted">${lv.into} / ${lv.span} XP</span></div></section>

        <div class="pf-row">
          <section class="card pf-today"><h2>Today</h2><div class="pf-time"><div><span class="pf-num">${hm(used)}</span><small class="muted">in Tempo today</small></div><div><span class="pf-num">${st.todayMin}<small> min</small></span><small class="muted">focused · goal ${p.daily}</small></div></div>
            <div class="pf-week" role="img" aria-label="Time in Tempo, last 7 days">${week.map(k => `<div class="${k === t ? 'now' : ''}" title="${k}: ${Math.round((S.usage[k] || 0) / 60)} min"><i style="height:${Math.max(4, (S.usage[k] || 0) / maxU * 100)}%"></i><span>${DOW[(L.parseKey(k).getDay() + 6) % 7][0]}</span></div>`).join('')}</div>
            <p class="muted pf-note">${Math.round(wkUse / 60)} min in Tempo this week${used && st.todayMin ? ` · ${Math.min(100, Math.round(st.todayMin * 60 / used * 100))}% of today’s time was focus` : ''}</p></section>
          <section class="card"><h2>Study clock</h2>${clock()}</section></div>

        <section class="card"><h2>Medals <span class="chip right">${got.length} / ${L.ACH.length}</span></h2>
          <div class="pbar" style="margin-bottom:16px"><div><b style="width:${got.length / L.ACH.length * 100}%"></b></div><span>${Math.round(got.length / L.ACH.length * 100)}%</span></div>
          <div class="medals">${L.ACH.map((a, i) => { const on = !!S.ach[a.id]; return `<button class="medal ${on ? tier(a.id) : 'lock'}" style="--i:${i}" data-act="medalPeek" data-id="${a.id}" aria-label="${esc(a.n)}: ${on ? 'won' : 'locked'}. ${esc(a.d)}">
            <span class="rib" aria-hidden="true"></span><span class="coin" aria-hidden="true">${on ? a.e : '?'}</span><b>${esc(a.n)}</b><small>${on ? tier(a.id) : 'locked'}</small></button>`; }).join('')}</div></section>

        <div class="pf-row">
          <section class="card"><h2>Your numbers</h2><div class="pf-nums">${nums.map(([e, n, l], i) => `<div style="--i:${i}"><span aria-hidden="true">${e}</span><b class="mono" data-n="${n}">0</b><small class="muted">${l}</small></div>`).join('')}</div></section>
          <section class="card"><h2>Personal records</h2><div class="pf-recs">${recs.map(([e, v, l]) => `<div><span class="pf-tro" aria-hidden="true">${e}</span><b>${v}</b><small class="muted">${l}</small></div>`).join('')}</div></section></div>

        <section class="card pf-locker"><h2>Locker <span class="chip right">Shop items soon</span></h2><p class="muted" style="margin-bottom:14px">Cosmetics for your profile. Titles come from medals, banners unlock with levels, and the shop will stock the rest.</p>
          <div class="lk-grid">
            <button class="lk-slot" data-act="lookTitle"><span class="lk-i">${title ? title.e : '🏷️'}</span><b>Title</b><small class="muted">${title ? esc(title.n) : got.length ? 'Pick from your medals' : 'Win a medal first'}</small></button>
            <button class="lk-slot" data-act="lookBanner"><span class="lk-i bn-${banner[0]}"><i></i></span><b>Banner</b><small class="muted">${banner[1]} · ${BANNERS.filter(b => lv.level >= b[2]).length} of ${BANNERS.length} unlocked</small></button>
            ${SHOP.map(([e, n]) => `<div class="lk-slot soon"><span class="lk-i">${e}</span><b>${n}</b><small class="muted">${icon('lock', 12, 2.2)} In the shop, later</small></div>`).join('')}</div></section></div>`;
      $$('[data-n]', root).forEach(el => countUp(el, +el.dataset.n));
    },
  };

  ACT.medalPeek = el => {
    const a = L.ACH.find(x => x.id === el.dataset.id); if (!a) return;
    const on = S.ach[a.id], tr = tier(a.id);
    popover(el, `<div class="pf-peek"><span class="coin ${on ? tr : 'lock'}" aria-hidden="true">${on ? a.e : '?'}</span><div><b>${esc(a.n)}</b><p class="muted">${esc(a.d)}</p><small>${on ? `${tr[0].toUpperCase() + tr.slice(1)} medal · won ${new Date(on).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not won yet'}</small>
      ${on ? `<button class="btn sm ghost" style="margin-top:10px" data-act="lookSet" data-k="title" data-v="${a.id}">${S.look.title === a.id ? 'Your title now' : 'Use as my title'}</button>` : ''}</div></div>`);
  };
  ACT.lookSet = el => { S.look[el.dataset.k] = el.dataset.v; save(); $('.pop')?.remove(); sfx.pick(); go('profile'); };
  ACT.lookTitle = el => {
    const got = L.ACH.filter(a => S.ach[a.id]);
    if (!got.length) { replay(el, 'shake'); return toast('Win a medal first. Your first focus session does it.'); }
    popover(el, `<h3 style="margin-bottom:8px">Title</h3><div class="menu lk-menu">${got.map(a => `<button data-act="lookSet" data-k="title" data-v="${a.id}" class="${S.look.title === a.id ? 'on' : ''}">${a.e} ${esc(a.n)}</button>`).join('')}<button data-act="lookSet" data-k="title" data-v="">${icon('x', 15)} No title</button></div>`);
  };
  ACT.lookBanner = el => {
    const lv = L.levelOf(S.xp).level;
    popover(el, `<h3 style="margin-bottom:8px">Banner</h3><div class="bn-pick">${BANNERS.map(([id, n, need]) => lv >= need
      ? `<button class="bn-${id} ${S.look.banner === id || (!S.look.banner && id === 'dawn') ? 'on' : ''}" data-act="lookSet" data-k="banner" data-v="${id}"><i></i><span>${n}</span></button>`
      : `<button class="bn-${id} lock" disabled><i></i><span>${icon('lock', 12, 2.2)} Level ${need}</span></button>`).join('')}</div>`);
  };
})();
