// Calendar: month grid + day agenda. Study sessions logged by the timer show up as minutes on each day.
'use strict';
(() => {
  const TYPES = [['study', 'Study'], ['exam', 'Exam'], ['task', 'Task'], ['life', 'Life']];
  let view = null, sel = today();

  function eventModal(date = sel) {
    const m = modal(`<h2>New event</h2><form novalidate>
      <label class="f" for="ev-t">Title</label><input class="inp" id="ev-t" name="title" maxlength="60" placeholder="e.g. Economics chapter 3" autofocus>
      <div class="row" style="flex-wrap:nowrap"><div class="grow"><label class="f" for="ev-d">Date</label><input class="inp" id="ev-d" name="d" type="date" value="${date}"></div>
      <div class="grow"><label class="f" for="ev-h">Time</label><input class="inp" id="ev-h" name="time" type="time" value="${String(S.profile?.hour ?? 16).padStart(2, '0')}:00"></div></div>
      <label class="f">Type</label><div class="seg">${TYPES.map(([v, n], i) => `<button type="button" class="${i ? '' : 'on'}" data-v="${v}">${n}</button>`).join('')}</div>
      <p class="err" role="alert"></p><div class="foot"><button class="btn ghost" type="button" data-act="closeModal">Cancel</button><button class="btn" type="submit">Add event</button></div></form>`);
    let type = 'study';
    $$('.seg button', m).forEach(b => (b.onclick = () => { type = b.dataset.v; $$('.seg button', m).forEach(x => x.classList.toggle('on', x === b)); }));
    $('form', m).onsubmit = e => {
      e.preventDefault();
      const f = e.target, title = f.title.value.trim();
      if (!title || !f.d.value) { $('.err', m).textContent = 'Give it a title and a date.'; replay(m, 'shake'); return sfx.bad(); }
      S.events.push({ id: uid(), d: f.d.value, time: f.time.value || '09:00', title, type });
      sel = f.d.value; save(); closeModal(); sfx.ok(); refresh();
    };
  }
  ACT.evNew = () => eventModal(cur === 'calendar' ? sel : today());
  ACT.evDel = el => {
    const i = S.events.findIndex(e => e.id === el.dataset.id), [gone] = S.events.splice(i, 1);
    save(); sfx.trash(); go('calendar');
    toast('Event deleted.', '', ['Undo', () => { S.events.splice(i, 0, gone); save(); refresh(); }]);
  };
  ACT.calNav = el => { const n = +el.dataset.n; view = n ? new Date(view.getFullYear(), view.getMonth() + n, 1) : null; if (!n) sel = today(); go('calendar', sel); };
  ACT.calSel = el => { sel = el.dataset.d; go('calendar', sel); };
  ACT.calTask = () => go('todo', { due: sel });

  PAGES.calendar = {
    render(root, day) {
      if (day) { sel = day; view ||= L.parseKey(day); }
      view ||= new Date();
      const y = view.getFullYear(), mo = view.getMonth(), t = today(), first = new Date(y, mo, 1), start = L.addDays(L.dateKey(first), -((first.getDay() + 6) % 7));
      const mins = {}; for (const s of S.sessions) mins[s.d] = (mins[s.d] || 0) + s.m;
      const byDay = {}; for (const e of S.events) (byDay[e.d] ||= []).push(e);
      for (const k in byDay) byDay[k].sort((a, b) => a.time.localeCompare(b.time));
      const tasksBy = {}; for (const x of S.tasks) if (x.due) (tasksBy[x.due] ||= []).push(x); // to-dos with a due date live on the calendar too
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const k = L.addDays(start, i), d = L.parseKey(k), ev = byDay[k] || [], tk = tasksBy[k] || [], chips = [...tk.map(x => `<span class="evc todo ${x.done ? 'done' : ''}">${x.done ? '☑' : '☐'} ${esc(x.t)}</span>`), ...ev.map(e => `<span class="evc ${e.type}">${e.time} ${esc(e.title)}</span>`)];
        cells += `<button class="day ${d.getMonth() === mo ? '' : 'off'} ${k === t ? 'today' : ''} ${k === sel ? 'sel' : ''}" data-act="calSel" data-d="${k}" aria-label="${k}, ${ev.length} events, ${tk.length} tasks">
          <b><span>${d.getDate()}</span>${mins[k] ? `<em>${mins[k]}m</em>` : ''}</b>${chips.slice(0, 2).join('')}${chips.length > 2 ? `<span class="muted" style="font-size:10px">+${chips.length - 2} more</span>` : ''}</button>`;
      }
      const list = byDay[sel] || [], tasks = tasksBy[sel] || [], sd = L.parseKey(sel);
      root.innerHTML = `<div class="ph"><h1>${view.toLocaleString('en', { month: 'long', year: 'numeric' })}</h1>
        <button class="icb" data-act="calNav" data-n="-1" aria-label="Previous month">${icon('left')}</button><button class="btn sm ghost" data-act="calNav" data-n="0">Today</button><button class="icb" data-act="calNav" data-n="1" aria-label="Next month">${icon('right')}</button>
        <span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="planWeek" title="One focus block a day at your clearest hour">Plan my week</button><button class="btn sm ghost" data-act="icsExport" title="Save as .ics for Google Calendar or Outlook">${icon('down', 15)} Export</button>
        <button class="btn" data-act="evNew">${icon('plus', 18)} New event</button></span></div>
        <div class="cal"><div class="cal-g">${DOW.map(d => `<span>${d}</span>`).join('')}${cells}</div>
        <aside class="card aux" style="overflow:auto"><h2>${sd.toLocaleString('en', { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
          ${tasks.map(x => `<div class="ev task-ev ${x.done ? 'done' : ''}"><button class="tick ${x.done ? 'on' : ''}" data-act="taskCross" data-id="${x.id}" aria-label="${x.done ? 'Uncross' : 'Cross off'} ${esc(x.t)}"></button><span class="grow">${esc(x.t)}</span>${x.time ? `<time>${x.time}</time>` : ''}</div>`).join('')}
          ${mins[sel] ? `<div class="ev" style="background:var(--panel2);margin-bottom:8px"><span>⏱️</span><span class="grow"><b>${mins[sel]} min studied</b></span></div>` : ''}
          ${list.length ? list.map(e => `<div class="ev"><time>${e.time}</time><i class="dot ${e.type}"></i><span class="grow">${esc(e.title)}</span><button class="icb" style="width:32px;height:32px" data-act="evDel" data-id="${e.id}" aria-label="Delete ${esc(e.title)}">${icon('trash', 16)}</button></div>`).join('')
          : tasks.length ? '' : `<div class="empty">${ember(52)}<br>Free day. Plan something small?</div>`}
          <div class="row" style="margin-top:14px;flex-wrap:nowrap"><button class="btn ghost grow" data-act="evNew">${icon('plus', 18)} Event</button><button class="btn ghost grow" data-act="calTask">${icon('todo', 18)} To-do</button></div></aside></div>`;
    },
  };
})();
