// Home dashboard: hero + quote, quick stats, today's plan, daily quests, next steps, week chart, and the right rail.
'use strict';
const QUOTES = [
  'Small sessions, stacked daily, beat one heroic night.', 'You do not need more time. You need a start line.', 'Confusion is the feeling of a brain rearranging itself.',
  'Twenty-five honest minutes outrun three distracted hours.', 'Test yourself before the test does.', 'The streak is not the goal. The person it builds is.',
  'If you can explain it simply, you own it.', 'Rest is part of the work, not a break from it.', 'Start ugly. Fix it later.', 'One page today is one page less tomorrow.',
];
let quoteI = Math.floor(Date.now() / 864e5) % QUOTES.length;

function miniCal(st) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), lead = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), evDays = new Set(S.events.map(e => e.d));
  let h = DOW.map(d => `<span>${d[0]}</span>`).join('') + '<i></i>'.repeat(lead);
  for (let d = 1; d <= n; d++) { const k = L.dateKey(new Date(y, m, d)); h += `<button class="${k === st.t ? 'today' : ''} ${st.days.has(k) ? 'lit' : ''} ${evDays.has(k) ? 'has' : ''}" data-act="calDay" data-d="${k}" aria-label="${k}">${d}</button>`; }
  return `<div class="mini">${h}</div>`;
}
ACT.calDay = el => go('calendar', el.dataset.d);
ACT.quote = () => { const q = $('#quote'); quoteI = (quoteI + 1) % QUOTES.length; q.textContent = '“' + QUOTES[quoteI] + '”'; q.style.animation = 'none'; void q.offsetWidth; q.style.animation = 'rise .35s var(--out)'; };
ACT.addBlock = () => { const p = S.profile; S.events.push({ id: uid(), d: today(), time: String(p.hour).padStart(2, '0') + ':00', title: `${p.pomo}-min focus block`, type: 'study' }); save(); sfx.ok(); go('home'); };
ACT.nextLesson = () => go('learn');
// "What should we learn today?": the question goes straight to the AI tutor; chips are shortcuts built from the user's own data.
ACT.homeAsk = el => {
  const t = el?.dataset?.q || $('#haIn')?.value.trim(), pic = el?.dataset?.q ? null : pendingPic;
  if (!t && !pic) { replay($('#haIn'), 'shake'); return sfx.bad(); }
  ACT.askTutor(t || '', pic);
};
// A picture pasted anywhere on Home (outside other text fields) goes into the ask box.
const homePaste = e => { if (cur === 'home' && !e.target.closest?.('input:not(#haIn),textarea,[contenteditable]')) picPaste(e); };
function askChips(st) {
  const due = S.cards.filter(c => c.due <= st.t).length, tp = [...(S.topics || [])].sort((a, b) => b.upd - a.upd)[0], task = S.tasks.find(x => !x.done && x.src === 'note');
  return [
    due && [`🃏 ${due} card${due === 1 ? '' : 's'} due`, '', 'cards'],
    tp && [`❓ Quiz me on ${tp.title}`, `Quiz me with 3 questions on ${tp.title}. Ask one at a time and wait for my answer.`],
    task && [`✏️ ${task.t.slice(0, 34)}`, `Help me with this study task, step by step: ${task.t}`],
    ['🗺️ Plan today', `Plan my study for today: about ${S.profile.daily} minutes in ${S.profile.pomo}-minute blocks.${tp ? ' My latest topic is ' + tp.title + '.' : ''}`],
    ['📝 Make notes', '', 'notes'],
  ].filter(Boolean).slice(0, 4);
}

PAGES.home = {
  render(root) {
    const p = S.profile, st = stats(), lv = L.levelOf(S.xp), hr = new Date().getHours(), goal = p.daily, day = dayState();
    const greet = hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const todays = S.events.filter(e => e.d === st.t).sort((a, b) => a.time.localeCompare(b.time));
    const exam = S.events.filter(e => e.type === 'exam' && e.d >= st.t).sort((a, b) => a.d.localeCompare(b.d))[0];
    const ws = L.weekStart(st.t), lastNote = [...S.notes].sort((a, b) => b.upd - a.upd)[0], frozen = new Set(S.frozen);
    const course = S.courses.find(c => c.ch.some(x => !x.done)), lesson = course?.ch.find(x => !x.done), due = S.cards.filter(c => c.due <= st.t).length;
    // Ember speaks up when something is at stake (a roast when it is mad); otherwise the daily quote shows.
    const m = mood(), tasksToday = S.tasks.filter(x => !x.done && x.due && x.due <= st.t).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')));
    const said = m ? dailyLine(m) : st.streak && !st.days.has(st.t) && hr >= 18 ? `Your ${st.streak}-day streak ends at midnight. Ten minutes saves it.` : st.todayMin >= goal ? 'Daily goal done. Anything more today is a bonus.' : '';
    const feed = [...S.sessions.map(s => ({ t: s.t, e: s.sub === 'Lesson' ? '🧩' : '⏱️', x: `${s.m} min · ${s.sub.toLowerCase()}` })), ...S.quizzes.map(q => ({ t: q.t, e: '❓', x: `Quiz: ${q.score}/${q.total}` }))].sort((a, b) => b.t - a.t).slice(0, 5);
    const claimed = QUESTS.filter(q => day.claimed[q.id]).length;
    root.innerHTML = `<div class="home"><div class="home-main">
      <section class="hero"><div class="grow"><p class="hdate">${new Date().toLocaleDateString('en', { weekday: 'short', month: 'long', day: 'numeric' })}</p><span class="chip">${p.archetype} · ${p.style} learner</span><h1>${greet}, <span class="hl">${esc(p.name)}</span></h1>
        <p class="quote ${m ? 'mad' : ''}" id="quote">${said ? esc(said) : '“' + QUOTES[quoteI] + '”'}</p>
        <div class="row"><button class="btn big" data-act="focus">${icon('bolt')} Start ${S.timer.total / 60}-min focus</button><button class="btn ghost" data-act="go" data-p="todo">${icon('todo', 18)} To-do</button><button class="btn ghost" data-act="quote">New quote</button></div></div>
        <div class="ember-spot"><div class="bubble" id="bubble" role="status" aria-live="polite" hidden></div><button class="ember-btn" data-act="emberTalk" aria-label="Ask Ember for advice" title="Ask Ember for advice">${ember(132, m)}</button></div></section>
      <section class="stats" aria-label="Quick stats">
        <div class="stat"><span class="flame" style="font-size:22px">🔥</span><div class="big"><span data-n="${st.streak}">0</span> <small>day${st.streak === 1 ? '' : 's'}</small></div><small>Streak · 🧊 ${S.freezes} freeze${S.freezes === 1 ? '' : 's'}</small></div>
        <div class="stat"><span style="font-size:22px">⏱️</span><div class="big"><span data-n="${st.todayMin}">0</span> <small>/ ${goal} min</small></div><div class="bar"><i style="width:${Math.min(100, st.todayMin / goal * 100)}%"></i></div></div>
        <div class="stat"><span style="font-size:22px">⭐</span><div class="big">Level <span data-n="${lv.level}">0</span></div><div class="bar"><i style="width:${lv.into / lv.span * 100}%"></i></div></div>
        <div class="stat"><span style="font-size:22px">🗓️</span><div class="big"><span data-n="${st.weeks}">0</span> <small>week${st.weeks === 1 ? '' : 's'}</small></div><small>Weekly streak · 3 days a week</small></div>
      </section>
      <div class="two">
        <section class="card"><h2>Today's plan <span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="planWeek" title="One focus block a day at your clearest hour">Plan my week</button><button class="btn sm ghost" data-act="evNew" aria-label="Add event">${icon('plus', 15)}</button></span></h2>
          ${tasksToday.map(x => `<div class="ev task-ev"><button class="tick" data-act="taskCross" data-id="${x.id}" aria-label="Cross off ${esc(x.t)}"></button><span class="grow">${esc(x.t)}${x.due < st.t ? ' <small class="late">overdue</small>' : ''}</span>${x.time ? `<time>${x.time}</time>` : ''}</div>`).join('')}
          ${todays.length ? todays.map(e => `<div class="ev"><time>${e.time}</time><i class="dot ${e.type}"></i><span class="grow">${esc(e.title)}</span></div>`).join('')
          : tasksToday.length ? '' : `<div class="empty">Nothing planned. Your head is clearest in the ${p.chrono.toLowerCase()}.<br><button class="btn sm" style="margin-top:12px" data-act="addBlock">Add a ${p.pomo}-min block at ${String(p.hour).padStart(2, '0')}:00</button></div>`}
          ${exam ? `<div class="ev" style="margin-top:8px;background:var(--panel2)"><span style="font-size:20px">🎯</span><span class="grow"><b>${esc(exam.title)}</b><br><small class="muted">in ${Math.round((L.parseKey(exam.d) - L.parseKey(st.t)) / 864e5)} days</small></span></div>` : ''}</section>
        <section class="card"><h2>Daily quests <span class="chip right">${claimed} / ${QUESTS.length}</span></h2>
          ${QUESTS.map(q => { const [a, b] = q.p(st), ok = a >= b; return `<div class="quest ${ok ? 'done' : ''}"><span class="e">${ok ? '✅' : q.e}</span><div class="grow"><b>${q.t()}</b><div class="pbar" style="margin-top:4px"><div><b style="width:${Math.min(100, a / b * 100)}%"></b></div><span>${Math.min(a, b)}/${b}</span></div></div></div>`; }).join('')}
          <p class="muted" style="margin-top:8px;font-size:12px">${day.chest ? '🗝️ Chest opened today. New quests at midnight.' : 'Clear all three for +30 XP and a streak freeze.'}</p></section>
      </div>
      <div class="two pick-row"><section class="card ask-card"><div class="ask-h">${ember(46, m)}<h2>What should we learn today, ${esc(p.name)}?</h2></div>
        <form class="ask-f" id="homeAsk" novalidate><label class="sr" for="haIn">Ask Ember anything you want to learn</label><input class="inp" id="haIn" maxlength="500" placeholder="e.g. Explain ionic bonding, or paste a picture (Ctrl V)" autocomplete="off">
          <button type="button" class="icb ask-pic" data-act="picAdd" title="Add a picture: a worksheet, a diagram, a page of notes (or paste one)" aria-label="Add a picture">${icon('image', 20)}</button><button class="btn" aria-label="Ask Ember">${icon('send', 18)}</button></form>
        <div class="pic-slot"></div>
        <div class="ask-chips">${askChips(st).map(([l, q, page]) => page ? `<button class="nf-chip" data-act="go" data-p="${page}">${esc(l)}</button>` : `<button class="nf-chip" data-act="homeAsk" data-q="${esc(q)}">${esc(l)}</button>`).join('')}</div>
        <small class="muted">${aiReady() ? 'Answers open in the AI Tutor.' : 'Sign in on the AI Tutor page once; then ask from here.'}</small></section>
      <section class="card aux"><h2>Pick up where you left off</h2><div class="pick-grid">
        <button class="next" style="margin:0" data-act="nextLesson"><span style="font-size:26px">🧩</span><span class="grow"><b>${lesson ? esc(lesson.t) : 'Start a course'}</b><br><small class="muted">${course ? esc(course.name) : 'Turn a note into lessons'}</small></span></button>
        <button class="next" style="margin:0" data-act="go" data-p="cards"><span style="font-size:26px">🃏</span><span class="grow"><b>${due ? due + ' cards due' : 'Flashcards'}</b><br><small class="muted">${due ? 'Two minutes of review' : S.cards.length ? 'All caught up' : 'Make them from your notes'}</small></span></button>
        <button class="next" style="margin:0" ${lastNote ? `data-act="noteOpen" data-id="${lastNote.id}"` : 'data-act="go" data-p="notes"'}><span style="font-size:26px">📝</span><span class="grow"><b>${lastNote ? esc(lastNote.title) : 'Notes'}</b><br><small class="muted">${lastNote ? 'Edited ' + ago(lastNote.upd) : 'Write the first one'}</small></span></button>
        <button class="next" style="margin:0" data-act="go" data-p="board"><span style="font-size:26px">🗂️</span><span class="grow"><b>Your Big Archive</b><br><small class="muted">${st.stickies} sticky notes</small></span></button></div></section></div>
      <section class="card aux"><h2>This week <span class="right row" style="gap:10px"><span class="muted" style="font:500 13px var(--font)">${st.totalMin} min all time</span><button class="btn sm ghost" data-act="recap">Weekly recap</button></span></h2>${barChart(7)}</section>
    </div><aside class="rail aux" aria-label="Overview">
      <section class="card now-w"><div class="now-t mono" data-clock="t"></div><div class="muted" data-clock="d"></div><button class="now-wx" data-act="wxSet" data-wx title="Weather location">…</button></section>
      <section class="card"><h2><span class="flame">🔥</span> Week so far</h2><div class="wk">${DOW.map((d, i) => { const k = L.addDays(ws, i), hit = st.days.has(k), ice = frozen.has(k); return `<div class="${hit ? 'hit' : ice ? 'ice' : ''} ${k === st.t ? 'now' : ''}"><i>${hit ? '🔥' : ice ? '🧊' : ''}</i>${d[0]}</div>`; }).join('')}</div></section>
      <section class="card"><h2>${new Date().toLocaleString('en', { month: 'long', year: 'numeric' })}</h2>${miniCal(st)}</section>
      <section class="card"><h2>Recent activity</h2>${feed.length ? feed.map(f => `<div class="act"><span>${f.e}</span><span class="grow">${esc(f.x)}</span><small class="muted">${ago(f.t)}</small></div>`).join('') : '<div class="empty">Your first session will show up here.</div>'}</section>
    </aside></div>`;
    $$('[data-n]', root).forEach(el => countUp(el, +el.dataset.n));
    const ask = $('#homeAsk', root);
    ask.onsubmit = e => { e.preventDefault(); ACT.homeAsk(); };
    ask.ondragover = e => { e.preventDefault(); ask.classList.add('over'); };
    ask.ondragleave = () => ask.classList.remove('over');
    ask.ondrop = e => { e.preventDefault(); ask.classList.remove('over'); const f = picFrom(e); if (f) attachPic(f); };
    document.addEventListener('paste', homePaste); paintPic();
    clocks(); paintWeather();
  },
  leave() { document.removeEventListener('paste', homePaste); },
};
