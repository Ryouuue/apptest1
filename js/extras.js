// Small features shared across pages: read aloud, mind map, focus mode, quick capture, weekly recap, planner, calendar export, shortcuts.
'use strict';

function saveFile(name, data, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----- read aloud (uses the voices installed on this PC, works offline) -----
let speakBtn = null;
function speak(text, btn) {
  const sy = window.speechSynthesis;
  if (!sy) return toast('This device has no speech voices.', 'bad');
  const mine = speakBtn === btn && sy.speaking;
  sy.cancel(); speakBtn?.classList.remove('on'); speakBtn = null;
  if (mine) return; // second press on the same button stops
  const u = new SpeechSynthesisUtterance(String(text).replace(/\[\[|\]\]|[#*_`>]/g, '').slice(0, 8000));
  u.onend = u.onerror = () => { if (speakBtn === btn) { btn?.classList.remove('on'); speakBtn = null; } };
  speakBtn = btn; btn?.classList.add('on'); sy.speak(u);
}

// ----- mind map: a tidy left-to-right tree drawn from a note's headings and bullets -----
function mindmap(title, body) {
  const root = L.outline(body, title);
  if (!root.kids.length) return toast('Add headings or bullet points to this note first.');
  const W = 190, GAP = 56, H = 46, nodes = [], links = [];
  let row = 0, deep = 0;
  (function place(n, depth) {
    n.kids.forEach(k => place(k, depth + 1));
    n.y = n.kids.length ? (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2 : row++ * H + 30;
    n.x = depth * (W + GAP) + 8; deep = Math.max(deep, depth); nodes.push(n);
    for (const k of n.kids) links.push(`M${n.x + W} ${n.y}C${n.x + W + GAP / 2} ${n.y} ${k.x - GAP / 2} ${k.y} ${k.x} ${k.y}`);
  })(root, 0);
  const w = (deep + 1) * (W + GAP), h = row * H + 20;
  modal(`<h2>Mind map</h2><p class="muted">${nodes.length} ideas from “${esc(title)}”. Built from headings and bullet points.</p>
    <div style="overflow:auto;max-height:64vh;margin-top:12px" tabindex="0" role="img" aria-label="Mind map of ${esc(title)}"><svg class="mm" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    ${links.map(d => `<path d="${d}"/>`).join('')}${nodes.map((n, i) => `<g class="${n === root ? 'root' : ''}" style="--i:${i}"><title>${esc(n.t)}</title><rect x="${n.x}" y="${n.y - 16}" width="${W}" height="32" rx="9"/><text x="${n.x + 12}" y="${n.y + 4}">${esc(n.t.length > 25 ? n.t.slice(0, 24) + '…' : n.t)}</text></g>`).join('')}</svg></div>`, 'wide');
}

// ----- focus mode: nothing on screen but the clock -----
ACT.zen = () => {
  if ($('.zen')) return;
  if (!S.timer.running) ACT.tToggle();
  const z = document.createElement('div');
  z.className = 'zen dots'; z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', 'Focus mode'); z._prev = document.activeElement;
  z.innerHTML = `<small class="mono muted" id="zenL"></small><div class="zen-ring"><b id="zenT" role="timer"></b></div><p class="muted" style="max-width:420px">“${QUOTES[Math.floor(Math.random() * QUOTES.length)]}”</p>
    <div class="row" style="justify-content:center"><button class="btn ghost" id="zenP" data-act="tToggle">Pause</button><button class="btn" data-act="tDone">Finish and log</button><button class="btn ghost" data-act="zenExit">Exit <kbd style="margin-left:4px">Esc</kbd></button></div>`;
  document.body.append(z); tick(); $('#zenP').focus();
};
ACT.zenExit = () => { const z = $('.zen'); if (z) { z.remove(); z._prev?.focus?.(); } };

// ----- quick capture: catch a thought from anywhere -----
ACT.capture = () => {
  const m = modal(`<h2>Quick capture</h2><p class="muted">Catch the thought now, sort it later.</p><label class="f" for="cap">Thought</label><textarea class="inp" id="cap" maxlength="600" autofocus></textarea>
    <p class="err" role="alert"></p><div class="foot"><button class="btn ghost" data-k="note">Save as note</button><button class="btn" data-k="sticky">Stick on Big Archive <kbd style="margin-left:4px;color:inherit;border-color:currentColor">Ctrl ↵</kbd></button></div>`);
  const put = kind => {
    const t = $('#cap', m).value.trim();
    if (!t) { $('.err', m).textContent = 'Type something first.'; replay(m, 'shake'); return sfx.bad(); }
    if (kind === 'note') S.notes.push({ id: uid(), title: t.split('\n')[0].slice(0, 50), body: t, upd: Date.now() });
    else {
      const v = S.board.view, n = S.board.stickies.length;
      S.board.stickies.push({ id: uid(), x: Math.round((260 + n % 5 * 34 - v.x) / v.z), y: Math.round((150 + n % 5 * 34 - v.y) / v.z), w: 190, h: 170, c: '#fde68a', t, r: +(Math.random() * 5 - 2.5).toFixed(1), z: Math.max(0, ...S.board.stickies.map(s => s.z || 1)) + 1 });
    }
    save(); closeModal(); sfx.drop(); checkAch();
    const page = kind === 'note' ? 'notes' : 'board';
    if (cur === page) go(page);
    toast(kind === 'note' ? 'Saved as a note.' : 'Stuck on the Big Archive.', '', cur === page ? null : ['Open', () => go(page)]);
  };
  $('.foot', m).onclick = e => { const b = e.target.closest('button'); if (b) put(b.dataset.k); };
  $('#cap', m).onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); put('sticky'); } };
};

// ----- weekly recap -----
ACT.recap = () => {
  const t = today(), ws = L.weekStart(t), by = {};
  for (const s of S.sessions) by[s.d] = (by[s.d] || 0) + s.m;
  const week = o => Array.from({ length: 7 }, (_, i) => by[L.addDays(ws, i + o)] || 0), sum = a => a.reduce((x, y) => x + y, 0);
  const now = week(0), tot = sum(now), last = sum(week(-7)), max = Math.max(1, ...now), best = now.indexOf(Math.max(...now)), inWk = d => d >= ws && d <= L.addDays(ws, 6);
  const qz = S.quizzes.filter(q => inWk(q.d)), les = S.lessons.filter(l => inWk(l.d)).length, active = now.filter(Boolean).length;
  const avg = qz.length ? Math.round(sum(qz.map(q => q.score / q.total)) / qz.length * 100) + '%' : 'none yet';
  const delta = last ? `${tot >= last ? 'up' : 'down'} ${Math.abs(Math.round((tot - last) / last * 100))}% on last week` : 'first tracked week';
  const text = `My week in Tempo: ${tot} min studied (${delta}), ${active}/7 active days, ${les} lessons, ${qz.length} quizzes (avg ${avg}), ${stats().streak}-day streak.`;
  const m = modal(`<small class="mono muted">WEEK OF ${ws}</small><h2 style="font-size:30px;margin:6px 0 2px"><span class="hl">${tot} minutes</span> studied</h2><p class="muted">${delta[0].toUpperCase() + delta.slice(1)}.</p>
    <div class="bars" style="height:120px" role="img" aria-label="Minutes per day this week: ${now.join(', ')}">${now.map((v, i) => `<div class="b ${v ? '' : 'zero'}" style="--i:${i}"><em>${v || ''}</em><i style="height:calc((100% - 46px)*${(v / max).toFixed(3)})"></i><span>${DOW[i]}</span></div>`).join('')}</div>
    <div class="keys" style="margin-top:14px"><b class="mono">${active}/7</b><span>active days${tot ? `, best on ${DOW[best]}` : ''}</span><b class="mono">${les}</b><span>lessons finished</span>
      <b class="mono">${qz.length}</b><span>quizzes, average ${avg}</span><b class="mono">${stats().streak}</b><span>day streak right now</span></div>
    <div class="foot"><button class="btn ghost" id="rc-copy">Copy summary</button><button class="btn" data-act="closeModal">Nice</button></div>`);
  $('#rc-copy', m).onclick = () => navigator.clipboard.writeText(text).then(() => toast('Summary copied.'), () => toast('Could not reach the clipboard.', 'bad'));
};

// ----- planning and calendar export -----
ACT.planWeek = () => {
  const p = S.profile, add = L.planWeek(S.events, today(), p.hour, p.pomo).map(e => ({ id: uid(), ...e })), ids = new Set(add.map(e => e.id));
  if (!add.length) return toast('Every day this week already has a focus block.');
  S.events.push(...add); save(); sfx.ok(); refresh();
  toast(`${add.length} focus blocks planned at ${String(p.hour).padStart(2, '0')}:00, your clearest hour.`, '', ['Undo', () => { S.events = S.events.filter(e => !ids.has(e.id)); save(); refresh(); }]);
};
ACT.icsExport = () => {
  if (!S.events.length) return toast('No events to export yet.');
  saveFile('tempo-calendar.ics', L.toICS(S.events), 'text/calendar'); toast('Saved tempo-calendar.ics. Import it into Google Calendar or Outlook.');
};

ACT.keys = () => modal(`<h2>Keyboard shortcuts</h2><div class="keys" style="margin-top:14px">${[['Ctrl K', 'Search and jump anywhere'], ['C', 'Quick capture'], ['F', 'Focused mode: hide everything but the page'], ['Z', 'Zen timer'], ['T', 'To-do'], ['?', 'This list'], ['1 – 4', 'Pick an answer in quizzes and lessons'],
  ['Enter', 'Check or continue'], ['Space', 'Flip a flashcard'], ['V A P M H E', 'Board tools: move, arrow, pen, marker, highlighter, eraser'], ['Ctrl V', 'Paste a picture on the board, or a photo into To-do'], ['Ctrl Z / Y', 'Undo and redo on the board'], ['1 – 9', 'Fill a sudoku cell'], ['Esc', 'Close whatever is open']].map(([k, d]) => `<kbd>${k}</kbd><span>${d}</span>`).join('')}</div>`);
