// Learn: courses as a winding path of lessons. A lesson is played step by step (read, then answer); missed questions come back.
'use strict';
(() => {
  let sel = null, ls = null; // selected course id, running lesson
  const OFF = [0, 16, 24, 16, 0, -16, -24, -16], ROW = 124; // horizontal sway of the path in %, row height in px
  const course = () => S.courses.find(c => c.id === sel) || S.courses[0];
  const curIdx = c => { const i = c.ch.findIndex(x => !x.done); return i < 0 ? c.ch.length : i; };
  const any = a => a[Math.floor(Math.random() * a.length)];

  // The course shelf: a rounded side panel of pill-shaped courses (cover, name, progress ring), scrolling when there are many.
  let cq = '';
  const pct = c => (c.ch.length ? Math.round(c.ch.filter(x => x.done).length / c.ch.length * 100) : 0);
  const pill = (x, on, i) => `<button class="co-pill ${on ? 'on' : ''}" style="--i:${i}" data-act="courseSel" data-c="${x.id}" ${on ? 'aria-current="true"' : ''} title="${esc(x.name)}">
    <span class="co-cov">${coverArt({ id: x.id + x.name, title: x.name, cover: x.cover })}</span><span class="grow"><b>${esc(x.name)}</b><small class="muted">${x.ch.filter(y => y.done).length} of ${x.ch.length} lessons</small></span>
    <span class="co-ring" style="--p:${pct(x)}" aria-label="${pct(x)}% done">${pct(x) === 100 ? '🏆' : pct(x) + '%'}</span></button>`;
  const shelf = c => {
    const f = cq.toLowerCase(), list = S.courses.filter(x => !f || x.name.toLowerCase().includes(f));
    return `<aside class="co-side" aria-label="Your courses"><div class="co-h"><b>Courses</b><small class="muted">${S.courses.length}</small>
      <button class="icb sm right" data-act="courseNew" title="New course" aria-label="New course">${icon('plus', 18)}</button></div>
      ${S.courses.length > 4 ? `<label class="sr" for="coQ">Find a course</label><input class="inp co-q" id="coQ" placeholder="Find a course" value="${esc(cq)}" autocomplete="off">` : ''}
      <nav class="co-list" aria-label="Courses">${list.map((x, i) => pill(x, x === c, i)).join('') || '<p class="muted co-none">No course matches.</p>'}
      <button class="co-pill add" data-act="courseNew"><span class="co-cov">${icon('plus', 20)}</span><span class="grow"><b>New course</b><small class="muted">From a note, with AI, or a checklist</small></span></button></nav></aside>`;
  };
  const wire = root => { const qi = $('#coQ', root); if (qi) qi.oninput = () => { cq = qi.value; const at = qi.selectionStart; go('learn'); const n = $('#coQ'); n?.focus(); n?.setSelectionRange(at, at); }; $('.co-pill.on', root)?.scrollIntoView({ block: 'nearest' }); hydrate(root); };

  PAGES.learn = {
    render(root) {
      const c = course();
      if (!c) { root.innerHTML = `<div class="ph"><h1>Learn</h1></div><div class="learn">${shelf(null)}<div class="co-main"><div class="card empty" style="display:grid;justify-items:center;gap:12px;padding:50px">${ember(84)}<h2>No courses yet</h2><p>Turn a note into lessons, or let the tutor write a course.</p><button class="btn" data-act="courseNew">${icon('plus', 18)} New course</button></div></div></div>`; return wire(root); }
      sel = c.id;
      const n = c.ch.length, at = curIdx(c), done = c.ch.filter(x => x.done).length, pts = c.ch.map((_, i) => [50 + OFF[i % 8], 62 + i * ROW]);
      const d = pts.map(([x, y], i) => (i ? `C${pts[i - 1][0]} ${pts[i - 1][1] + ROW / 2} ${x} ${y - ROW / 2} ${x} ${y}` : `M${x} ${y}`)).join(' ');
      root.innerHTML = `<div class="ph"><h1>Learn</h1><button class="btn right" data-act="courseNew">${icon('plus', 18)} New course</button></div>
        <div class="learn">${shelf(c)}<div class="co-main">
        <section class="unit"><div class="grow" style="min-width:200px"><small class="mono">COURSE · ${done} OF ${n} LESSONS</small><h2>${esc(c.name)}</h2>
          <div class="pbar" style="margin-top:8px"><div><b style="width:${done / n * 100}%"></b></div><span>${Math.round(done / n * 100)}%</span></div></div>
          ${at < n ? `<button class="btn big" data-act="lessonGo" data-i="${at}">${done ? 'Continue' : 'Start'} ${icon('right')}</button>` : '<span style="font-size:40px" title="Course complete">🏆</span>'}
          <button class="icb" style="color:inherit" data-act="courseDel" data-c="${c.id}" aria-label="Delete course ${esc(c.name)}">${icon('trash', 18)}</button></section>
        <div class="path" style="height:${n * ROW + 40}px"><svg viewBox="0 0 100 ${n * ROW + 40}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>
        ${c.ch.map((x, i) => {
          const [px, py] = pts[i], steps = x.steps?.length, st = x.done ? 'done' : i === at ? 'cur' : steps ? 'lock' : '', left = OFF[i % 8] > 0;
          return `${i === at ? `<span class="pstart" style="left:${px}%;top:${py}px" aria-hidden="true">START</span>` : ''}
            <button class="pnode ${st}" style="left:${px}%;top:${py}px;--i:${i}" data-act="lessonGo" data-i="${i}" aria-label="Lesson ${i + 1}: ${esc(x.t)}, ${x.done ? 'done' : st === 'lock' ? 'locked' : 'ready'}">${x.done ? icon('check', 28, 3) : st === 'lock' ? icon('lock', 24) : i + 1}</button>
            <div class="plabel ${left ? 'l' : ''}" style="top:${py}px;${left ? `right:calc(${100 - px}% + 52px)` : `left:calc(${px}% + 52px)`}">${esc(x.t)}<small>${steps ? steps + ' steps' : 'checklist'}${x.best != null ? ' · best ' + x.best + '%' : ''}</small></div>`;
        }).join('')}</div></div></div>`;
      wire(root);
    },
  };
  ACT.courseSel = el => { sel = el.dataset.c; go('learn'); };
  ACT.courseDel = el => {
    const i = S.courses.findIndex(c => c.id === el.dataset.c), [gone] = S.courses.splice(i, 1);
    sel = null; save(); sfx.trash(); go('learn');
    toast('Course deleted.', '', ['Undo', () => { S.courses.splice(i, 0, gone); sel = gone.id; save(); if (cur === 'learn') go('learn'); }]);
  };
  ACT.lessonGo = el => {
    const c = course(), i = +el.dataset.i, ch = c.ch[i];
    if (!ch.steps?.length) { // checklist chapter: just tick it
      ch.done = !ch.done; save(); ch.done ? sfx.ok() : sfx.tap();
      if (ch.done && !ch.xp) { ch.xp = true; addXp(15); }
      checkAch(); return go('learn');
    }
    if (i > curIdx(c)) { replay(el, 'shake'); sfx.bad(); return toast('Finish the lesson before this one first.'); }
    startLesson(c, i);
  };

  // ----- lesson player -----
  function startLesson(c, i) {
    const ch = c.ch[i], el = document.createElement('div');
    el.className = 'lesson'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Lesson: ' + ch.t);
    document.body.append(el);
    ls = { c, ch, el, queue: ch.steps.map(s => ({ ...s })), total: ch.steps.length, n: 0, pick: null, checked: false, right: 0, t0: Date.now(), prev: document.activeElement };
    step();
  }
  function step() {
    const s = ls.queue[0], isQ = !!s.q, ok = ls.pick === s.a;
    ls.el.innerHTML = `<div class="l-top"><button class="icb" data-act="lessonQuit" aria-label="Leave lesson">${icon('x')}</button>
      <div class="lbar" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="${ls.total}" aria-valuenow="${ls.n}"><b style="width:${ls.n / ls.total * 100}%"></b></div><span class="mono muted">${Math.min(ls.n + 1, ls.total)} / ${ls.total}</span></div>
      <div class="l-body"><div class="l-card ${ls.checked ? 'still' : ''}">${isQ ? `<small class="mono muted">${s.again ? 'ONE MORE TRY' : 'CHECK YOURSELF'}</small><h2 id="lq">${esc(s.q)}</h2><div role="radiogroup" aria-labelledby="lq">${s.o.map((o, k) =>
        `<button class="qo ${ls.checked ? (k === s.a ? 'ok' : k === ls.pick ? 'no' : '') : k === ls.pick ? 'on' : ''}" role="radio" aria-checked="${k === ls.pick}" data-act="lessonPick" data-i="${k}" style="--i:${k}" ${ls.checked ? 'disabled' : ''}><span class="key">${k + 1}</span>${esc(o)}</button>`).join('')}</div>`
      : `<div class="mdv">${L.md(s.read)}</div>`}</div></div>
      <div class="l-foot ${ls.checked ? (ok ? 'ok' : 'no') : ''}">${ls.checked ? `<div class="fb" role="status"><b>${ok ? any(['Nice.', 'Exactly.', 'You got it.']) : 'Not quite.'}</b>${esc(ok ? s.why || '' : `Answer: ${s.o[s.a]}. ${s.why || ''}`)}</div>`
      : `${isQ ? '' : `<button class="btn ghost" data-act="lessonListen">${icon('speaker', 18)} Listen</button>`}<span class="grow muted mono">${isQ ? `Keys 1–${s.o.length} · Enter to check` : 'Enter to continue'}</span>`}
      <button class="btn big ${ls.checked && ok ? 'good' : ''}" id="lgo" data-act="lessonNext" ${isQ && ls.pick == null ? 'disabled' : ''}>${!isQ || ls.checked ? 'Continue' : 'Check'} ${icon('right')}</button></div>`;
    ($('#lgo:not(:disabled)', ls.el) || $('.qo', ls.el)).focus();
  }
  ACT.lessonListen = el => speak(ls.queue[0].read, el);
  ACT.lessonPick = el => {
    if (ls.checked) return;
    ls.pick = +el.dataset.i; sfx.pick();
    $$('.qo', ls.el).forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
    $('#lgo', ls.el).disabled = false;
  };
  ACT.lessonNext = () => {
    if (!ls || ls.done) return;
    const s = ls.queue[0];
    if (s.q && !ls.checked) {
      if (ls.pick == null) return;
      ls.checked = true;
      if (ls.pick === s.a) { if (!s.again) ls.right++; sfx.ok(); } else sfx.bad();
      return step();
    }
    window.speechSynthesis?.cancel(); ls.queue.shift();
    if (s.q && ls.pick !== s.a && (s.again || 0) < 2) ls.queue.push({ ...s, again: (s.again || 0) + 1 }); // a missed question comes back at the end
    else ls.n++;
    ls.pick = null; ls.checked = false;
    ls.queue.length ? step() : finish();
  };
  function finish() {
    const { c, ch } = ls, qn = ch.steps.filter(s => s.q).length, acc = qn ? Math.round(ls.right / qn * 100) : 100, stars = acc >= 90 ? 3 : acc >= 60 ? 2 : 1;
    const first = !ch.done, mins = Math.max(1, Math.round((Date.now() - ls.t0) / 60000)), xp = first ? 20 + ls.right * 2 : 5;
    ls.done = true; ls.courseDone = first && c.ch.every(x => x === ch || x.done);
    ch.done = true; ch.best = Math.max(ch.best || 0, acc);
    S.lessons.push({ d: today(), t: Date.now(), c: c.name, ch: ch.t }); dayState().lessons++;
    ls.el.innerHTML = `<div class="l-body"><div class="l-card" style="text-align:center"><div class="stars" role="img" aria-label="${stars} of 3 stars">${[0, 1, 2].map(i => `<span class="${i < stars ? '' : 'off'}" style="--i:${i}">⭐</span>`).join('')}</div>
      <h1 style="margin:14px 0 6px">Lesson <span class="hl">complete</span></h1><p class="muted">${esc(ch.t)}</p>
      <div class="stats" style="grid-template-columns:repeat(3,1fr);margin:26px 0;text-align:left"><div class="stat"><small>Accuracy</small><div class="big">${acc}%</div></div><div class="stat"><small>Earned</small><div class="big">+${xp + mins * 2} <small>XP</small></div></div><div class="stat"><small>Time</small><div class="big">${mins} <small>min</small></div></div></div>
      <button class="btn big" id="lgo" data-act="lessonClose">Continue ${icon('right')}</button></div></div>`;
    $('#lgo', ls.el).focus(); sfx.win(); confetti(); addXp(xp); logSession(mins, 'Lesson');
  }
  ACT.lessonClose = () => {
    if (!ls) return;
    const { c, courseDone, prev } = ls;
    window.speechSynthesis?.cancel(); ls.el.remove(); ls = null; prev?.focus?.();
    if (cur === 'learn') go('learn');
    if (courseDone) { celebrate('🎓', c.name, 'Course complete'); notify('Course complete: ' + c.name, '🎓', true); checkAch(); }
  };
  ACT.lessonQuit = () => {
    if (!ls) return;
    if (ls.done) return ACT.lessonClose();
    const m = modal(`<h2>Leave this lesson?</h2><p class="muted">Progress inside the lesson is not saved. Finished lessons stay finished.</p>
      <div class="foot"><button class="btn" data-act="closeModal" autofocus>Keep learning</button><button class="btn ghost" id="l-leave">Leave</button></div>`);
    $('#l-leave', m).onclick = () => { closeModal(); ACT.lessonClose(); };
  };
  addEventListener('keydown', e => {
    if (!ls || $('.scrim:not(.out)')) return;
    if (e.key === 'Escape') { e.stopImmediatePropagation(); return ACT.lessonQuit(); }
    if (e.key === 'Enter') { e.preventDefault(); return ls.done ? ACT.lessonClose() : ACT.lessonNext(); }
    const s = ls.queue[0];
    if (!ls.done && s.q && !ls.checked && e.key >= '1' && e.key <= String(s.o.length)) $$('.qo', ls.el)[e.key - 1].click();
  });

  // ----- new course: from a note (offline), written by the AI tutor, or a plain checklist -----
  ACT.courseNew = (el, e, tab = S.notes.length ? 'note' : 'list') => {
    const body = {
      note: S.notes.length ? `<label class="f" for="co-note">Note</label><select class="inp" id="co-note" name="note">${[...S.notes].sort((a, b) => b.upd - a.upd).map(n => `<option value="${n.id}">${esc(n.title)}</option>`).join('')}</select>
        <p class="muted" style="margin-top:10px">Works offline. Each heading becomes a lesson; lines with a **bold term** become questions.</p>` : '<p class="muted" style="margin-top:14px">Write a note first, then turn it into lessons here.</p>',
      ai: `<label class="f" for="co-topic">Topic</label><input class="inp" id="co-topic" name="topic" maxlength="120" placeholder="e.g. Consumer behaviour in economics">
        <p class="muted" style="margin-top:10px">Ember writes four short lessons with questions. Needs the AI tutor to be connected.</p>`,
      list: `<label class="f" for="co-n">Course name</label><input class="inp" id="co-n" name="name" maxlength="50" placeholder="e.g. Biology, semester 1">
        <label class="f" for="co-c">Chapters</label><textarea class="inp" id="co-c" name="ch" placeholder="One per line, or separated by commas. Or just a number, like 8."></textarea>`,
    };
    const m = modal(`<h2>New course</h2><div class="seg" role="tablist" style="margin-top:10px">${[['note', 'From a note'], ['ai', 'With AI'], ['list', 'Checklist']].map(([k, n]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <form novalidate>${body[tab]}<p class="err" role="alert"></p><div class="foot"><button class="btn" type="submit">Create course</button></div></form>`);
    $$('.seg button', m).forEach(b => (b.onclick = () => ACT.courseNew(null, null, b.dataset.t)));
    const fail = msg => { $('.err', m).textContent = msg; replay(m, 'shake'); sfx.bad(); };
    const add = c => { const id = uid(); S.courses.push({ id, ...c }); sel = id; save(); closeModal(); sfx.ok(); go('learn'); };
    $('form', m).onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target, btn = $('.btn', f);
      if (tab === 'note') {
        const c = f.note && L.courseFromNote(S.notes.find(n => n.id === f.note.value));
        return c ? add(c) : fail('That note has no text to learn from yet.');
      }
      if (tab === 'list') {
        const name = f.name.value.trim(), raw = f.ch.value.trim();
        // Liberal input: a bare number means "that many chapters"; otherwise split on lines, commas or semicolons.
        const ch = (/^\d{1,2}$/.test(raw) ? Array.from({ length: L.clamp(+raw, 1, 40) }, (_, i) => 'Chapter ' + (i + 1)) : raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)).slice(0, 40);
        return name && ch.length ? add({ name, ch: ch.map(t => ({ t, done: false })) }) : fail('Add a name and at least one chapter.');
      }
      const topic = f.topic.value.trim();
      if (!topic) return fail('Type a topic first.');
      btn.disabled = true; btn.textContent = 'Writing lessons…';
      try {
        const out = await askAI([{ role: 'user', content: `Create a short course about: ${topic}\nReply with ONLY a JSON object: {"name": course title, "ch": [4 chapters, each {"t": chapter title, "steps": [6 steps that alternate teaching and testing: {"read": 60 to 100 words of markdown teaching one idea} followed by {"q": a question about it, "o": [4 options], "a": index 0-3 of the correct option, "why": one sentence}]}]}` }],
          `You write clear, accurate mini-courses for a ${S.profile.style.toLowerCase()} learner. Output valid JSON only, no prose and no code fences.`);
        const c = L.validCourse(JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || 'null'));
        if (!c) throw new SyntaxError();
        if (m.isConnected) add(c);
      } catch (err) { btn.disabled = false; btn.textContent = 'Create course'; fail(err instanceof SyntaxError ? 'The AI reply was not a usable course. Try again.' : err.message); }
    };
  };
})();
