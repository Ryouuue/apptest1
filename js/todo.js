// To-do: tasks with due dates (shown on the calendar), a nag ladder that ends in a break-room lockdown,
// honest points (15-minute rule, daily cap, refunds), the frog of the day, AI tasks from a photo, and the Shop.
'use strict';
(() => {
  const DAY_CAP = 20;
  let tick = 0;
  const find = id => S.tasks.find(x => x.id === id);
  const repaint = () => (cur === 'todo' ? go('todo') : refresh());

  // note: id of the note the task was planned from (notes.js adds study steps through this).
  function addTask(text, due = '', time = '', src, note) {
    const t = String(text).trim().replace(/\s+/g, ' ');
    if (t.length < 2) throw new Error('Give the task a few words.');
    if (S.tasks.some(x => !x.done && x.t.toLowerCase() === t.toLowerCase())) throw new Error('That task is already on the list.');
    if (S.tasks.filter(x => !x.done).length >= 200) throw new Error('200 open tasks is the limit. Finish or delete a few first.');
    if (S.tasks.length > 400) S.tasks = S.tasks.filter(x => !x.done || Date.now() - x.done < 30 * 864e5); // forget old finished tasks
    const x = { id: uid(), t: t.slice(0, 140), add: Date.now(), perf: performance.now(), ses: SES, due, time, done: 0, paid: 0, ...(src && { src }), ...(note && { note }) };
    S.tasks.push(x); save(); return x;
  }
  window.addTask = addTask;

  function complete(x, from) {
    const now = Date.now(), t = today(), day = dayState(), frog = S.todo.frog?.d === t && S.todo.frog.id === x.id, early = frog && new Date().getHours() < 12;
    x.prev = { last: S.todo.lastDone, lock: S.todo.lock }; // uncrossing puts both back, so cross-and-uncross cannot reset the nag clock
    x.done = now; S.todo.lastDone = now; day.task = true; S.ember.qmiss = 0;
    if (!x.counted) { x.counted = true; S.todo.doneCount++; if (early) S.todo.frogs++; }
    if (day.tp < DAY_CAP) { const n = Math.min(DAY_CAP - day.tp, early ? 3 : 1); x.paid = n; day.tp += n; award(n, early ? 'Ate the frog before noon' : 'Finished: ' + x.t.slice(0, 40), from); }
    else toast(`Daily cap of ${DAY_CAP} to-do points reached. Finished anyway.`);
    if (S.todo.lock) { S.todo.lock = null; notify('Break room unlocked. See? That was not so hard.', '🔓'); }
    if (early) celebrate('🐸', 'Frog eaten', 'Hardest task done before noon. +3 points');
    checkAch(); save();
  }
  function uncross(x) {
    x.done = 0;
    if (x.paid) { award(-x.paid, 'Uncrossed: ' + x.t.slice(0, 40)); dayState().tp = Math.max(0, dayState().tp - x.paid); x.paid = 0; }
    if (x.prev) { S.todo.lastDone = Math.max(x.prev.last || 0, ...S.tasks.filter(o => o !== x && o.done).map(o => o.done)); S.todo.lock ||= x.prev.lock; delete x.prev; }
    sfx.tap(); save(); repaint();
  }

  ACT.taskCross = el => {
    const x = find(el.dataset.id); if (!x) return;
    if (x.done) return uncross(x);
    const row = el.closest('.task,.ev') || el, wait = L.crossWait(x, Date.now(), performance.now(), SES);
    if (wait) { replay(row, 'shake'); sfx.bad(); return toast(`Too fresh to cross off. ${Math.ceil(wait / 60e3)} more min: a task needs 15 minutes on the list, so points stay honest.`); }
    row.classList.add('crossing'); el.classList.add('on'); sfx.cross();
    complete(x, el);
    setTimeout(repaint, reduced() ? 0 : 820);
  };
  ACT.taskDel = el => {
    const i = S.tasks.findIndex(x => x.id === el.dataset.id); if (i < 0) return;
    const [x] = S.tasks.splice(i, 1); save(); sfx.trash(); repaint();
    toast('Task deleted.' + (S.todo.lock ? ' Deleting does not unlock the break room.' : ''), '', ['Undo', () => { S.tasks.splice(i, 0, x); save(); repaint(); }]);
  };
  ACT.taskFrog = el => {
    const t = today(), on = S.todo.frog?.d === t && S.todo.frog.id === el.dataset.id;
    S.todo.frog = on ? null : { d: t, id: el.dataset.id }; save(); sfx.pick(); repaint();
    if (!on) toast('Frog of the day set. Finish it before noon for +2 bonus points.');
  };

  // ----- photo to tasks (AI) -----
  async function photoTasks(file) {
    if (!file?.type?.startsWith('image/')) return toast('That file is not an image.', 'bad');
    if (!aiReady()) return toast('Sign in to the AI tutor first, then add the photo again.', 'bad', ['Set up', () => go('tutor')]);
    const zone = $('#tDrop'); zone?.classList.add('busy');
    try {
      const c = await shrinkImage(file, 1600), [, data] = c.toDataURL('image/jpeg', .85).split(',');
      const out = await askAI([{ role: 'user', content: [{ type: 'image', mime: 'image/jpeg', data }, { type: 'text', text: `Today is ${today()}. Turn this picture into a to-do list of short, concrete study tasks (homework items, readings, deadlines). Reply with ONLY a JSON array, at most 12 items, each {"t": task text under 100 characters, "due": "YYYY-MM-DD" if the picture gives a date, otherwise ""}.` }] }],
        'You turn photos of homework sheets, syllabi, whiteboards and notes into clear study tasks. Output valid JSON only, no prose and no code fences.');
      const list = L.validTasks(JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]'));
      if (!list.length) throw new Error('No tasks found in that picture. Try a sharper photo.');
      let n = 0; for (const x of list) { try { addTask(x.t, x.due, '', 'ai'); n++; } catch { /* duplicate or limit: skip it */ } }
      sfx.ok(); toast(`Added ${n} task${n === 1 ? '' : 's'} from the photo. They can be crossed off in 15 minutes.`); repaint();
    } catch (e) { toast(e instanceof SyntaxError ? 'The AI reply was not a usable list. Try again.' : e.message, 'bad'); }
    zone?.classList.remove('busy');
  }
  ACT.taskPhoto = () => { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' }); inp.onchange = () => photoTasks(inp.files[0]); inp.click(); };
  const onPaste = e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) { e.preventDefault(); photoTasks(f); } };

  // ----- page -----
  const GROUPS = [['late', 'Overdue', (x, t) => x.due && x.due < t], ['today', 'Today', (x, t) => x.due === t], ['soon', 'Upcoming', (x, t) => x.due > t], ['someday', 'Someday', x => !x.due]];
  function row(x, t) {
    const frog = S.todo.frog?.d === t && S.todo.frog.id === x.id, wait = x.done ? 0 : L.crossWait(x, Date.now(), performance.now(), SES), mins = Math.ceil(wait / 60e3);
    return `<li class="task ${x.done ? 'done' : ''} ${frog ? 'frog' : ''}">
      <button class="tick ${x.done ? 'on' : ''} ${wait ? 'wait' : ''}" data-act="taskCross" data-id="${x.id}" aria-label="${x.done ? 'Uncross' : 'Cross off'}: ${esc(x.t)}${wait ? `, available in ${mins} minutes` : ''}" title="${wait ? `Can be crossed off in ${mins} min` : x.done ? 'Uncross (refunds the points)' : 'Cross off'}">${wait ? `<small>${mins}m</small>` : ''}</button>
      <span class="t-text">${frog ? '<b class="frogb" title="Frog of the day">🐸</b> ' : ''}<span class="t-in">${esc(x.t)}<svg class="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M1 7C14 3 22 9 36 6S62 3 74 7 92 5 99 6"/></svg></span>${x.src === 'ai' ? ' <small class="muted" title="Added from a photo">✨</small>' : ''}</span>
      ${x.note && S.notes.some(n => n.id === x.note) ? `<button class="icb sm" data-act="noteOpen" data-id="${x.note}" title="Open the note this came from" aria-label="Open the note for ${esc(x.t)}">${icon('note', 16)}</button>` : ''}
      ${x.due && !x.done ? `<span class="due ${x.due < t ? 'late' : ''}">${x.due === t ? 'Today' : L.parseKey(x.due).toLocaleDateString('en', { day: 'numeric', month: 'short' })}${x.time ? ' · ' + x.time : ''}</span>` : ''}
      ${x.done ? '' : `<button class="icb sm" data-act="taskFrog" data-id="${x.id}" aria-pressed="${frog}" title="${frog ? 'Unmark frog' : 'Make this the frog of the day'}" aria-label="Frog of the day">🐸</button>`}
      <button class="icb sm" data-act="taskDel" data-id="${x.id}" aria-label="Delete ${esc(x.t)}">${icon('trash', 16)}</button></li>`;
  }
  function render(root, arg) {
    const t = today(), open = S.tasks.filter(x => !x.done), doneToday = S.tasks.filter(x => x.done && L.dateKey(new Date(x.done)) === t), lvl = L.nagLevel(S.tasks, S.todo.lastDone, Date.now()), m = mood(), day = dayState();
    const lock = S.todo.lock, left = lock ? Math.max(0, Math.ceil(30 - lock.used / 60e3)) : 0;
    root.innerHTML = `<div class="ph"><h1>To-do</h1><span class="chip">${open.length} open</span>${lvl ? `<span class="pill lvl${lvl}">${NAG[lvl]}</span>` : ''}
      <span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="go" data-p="calendar">${icon('calendar', 15)} Calendar</button></span></div>
      <div class="todo"><div class="todo-main">
        <form class="t-add card" id="tAdd" novalidate><label class="sr" for="tIn">New task</label><input class="inp grow" id="tIn" maxlength="140" placeholder="Add a task, then press Enter" autocomplete="off" autofocus>
          <label class="sr" for="tDue">Due date</label><input class="inp" id="tDue" type="date" value="${arg?.due || ''}" title="Due date (shows on the calendar)">
          <label class="sr" for="tTime">Time</label><input class="inp" id="tTime" type="time" title="Reminder time">
          <button class="btn" type="submit">${icon('plus', 18)} Add</button><p class="err" role="alert" id="tErr"></p></form>
        <button class="t-drop" id="tDrop" data-act="taskPhoto"><span class="t-drop-i">📷</span><span><b>Photo to tasks</b><br><small class="muted">${aiReady() ? 'Paste (Ctrl V), drop or pick a photo of a worksheet, syllabus or whiteboard. AI writes the tasks.' : 'Sign in to the AI tutor, then paste a photo of a worksheet and AI writes the tasks.'}</small></span></button>
        ${open.length ? GROUPS.map(([k, name, test]) => { const xs = open.filter(x => test(x, t)).sort((a, b) => (a.due + (a.time || '')).localeCompare(b.due + (b.time || '')) || a.add - b.add);
          return xs.length ? `<section class="tgroup"><h2><span class="pill ${k}">${name}</span><small class="muted">${xs.length} task${xs.length === 1 ? '' : 's'}</small></h2><ul class="tlist">${xs.map(x => row(x, t)).join('')}</ul></section>` : ''; }).join('')
        : `<div class="card empty">${ember(80)}<h2 style="margin-top:8px;color:var(--text)">Nothing on the list</h2><p>Add the next thing you need to do. Small and concrete works best.</p></div>`}
        ${doneToday.length ? `<details class="tgroup" open><summary><span class="pill doneg">Done today</span><small class="muted">${doneToday.length} · ${day.tp}/${DAY_CAP} points today</small></summary><ul class="tlist">${doneToday.map(x => row(x, t)).join('')}</ul></details>` : ''}
      </div>
      <aside class="todo-side aux">
        <section class="card t-mood"><div class="t-ember">${ember(92, m)}</div><h2>${m === 5 ? 'Streak lost' : NAG[lvl]}</h2><p class="muted">${esc(m === 5 ? dailyLine(5) : lvl ? dailyLine(lvl) : open.length ? 'Ember is calm. Keep finishing a task a day and it stays that way.' : 'Nothing waiting. Ember approves.')}</p>
          <ol class="ladder">${NAG.slice(1, 5).map((n, i) => `<li class="${i + 1 <= lvl ? 'on' : ''}"><b>Day ${i + 1}</b><span>${n}</span></li>`).join('')}</ol>
          ${lock ? `<p class="ci-lock">${icon('lock', 15)} ${left ? `${left} min of break room left.` : 'Break room locked.'} Finish any task to unlock.</p>` : ''}</section>
        <section class="card"><h2>🐸 Frog of the day</h2><p class="muted">Mark your hardest task with the frog. Finish it before noon for +2 bonus points.</p></section>
        <section class="card"><h2>🪙 Fair points</h2><ul class="rules"><li>1 point per finished task, 5 per achievement.</li><li>A task can be crossed off after 15 minutes on the list.</li><li>Up to ${DAY_CAP} to-do points a day.</li><li>Uncrossing takes the points back.</li><li>Deleting a task never unlocks the break room.</li></ul>
          <button class="btn sm ghost" data-act="go" data-p="shop">Open the shop</button></section>
      </aside></div>`;
    const f = $('#tAdd', root);
    f.onsubmit = e => {
      e.preventDefault();
      try { addTask($('#tIn').value, $('#tDue').value, $('#tTime').value); sfx.drop(); go('todo'); $('#tIn').focus(); }
      catch (err) { $('#tErr').textContent = err.message; replay(f, 'shake'); sfx.bad(); }
    };
    const drop = $('#tDrop', root);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); photoTasks(e.dataTransfer.files[0]); };
    document.addEventListener('paste', onPaste);
    clearInterval(tick); tick = setInterval(() => { if (cur === 'todo' && !document.activeElement?.closest('#tAdd')) go('todo'); }, 60000); // waiting tasks count down
  }
  PAGES.todo = { render, leave() { document.removeEventListener('paste', onPaste); clearInterval(tick); } };

  // ----- shop: the points wallet; the store itself is still being designed -----
  PAGES.shop = {
    render(root) {
      root.innerHTML = `<div class="ph"><h1>Shop</h1><span class="chip">Opening later</span></div><div class="shop">
        <section class="card wallet"><span class="coin" aria-hidden="true">🪙</span><div><b class="mono">${S.pts}</b><span>points saved</span></div>
          <p class="muted">Earn 1 per finished to-do (3 for the frog before noon) and 5 per achievement.</p></section>
        <section class="card"><h2>On the shelves later</h2><p class="muted" style="margin-bottom:14px">Later, still in development. Your points are kept until the shop opens.</p><div class="shelf">
          ${[['🎩', 'Profile accessories', 'Hats, frames and badges for your avatar'], ['🖼️', 'Wallpapers', 'New scenes for the rest screen'], ['🎨', 'Custom UIs', 'Extra themes and colour sets']]
            .map(([e, n, d], i) => `<div class="item" style="--i:${i}"><span class="e">${e}</span><b>${n}</b><small class="muted">${d}</small><span class="soon">${icon('lock', 13, 2.2)} Later, still in dev</span></div>`).join('')}</div></section>
        <section class="card aux"><h2>Points history</h2>${S.ptsLog.length ? S.ptsLog.map(p => `<div class="act"><b class="mono" style="color:${p.n > 0 ? 'var(--good)' : 'var(--bad)'}">${p.n > 0 ? '+' : ''}${p.n}</b><span class="grow">${esc(p.why)}</span><small class="muted">${ago(p.t)}</small></div>`).join('') : '<div class="empty">Finish a to-do to earn your first point.</div>'}</section></div>`;
    },
  };
})();
