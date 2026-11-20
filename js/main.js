// Boot, command palette, global keys, reminders.
'use strict';

function enterApp() {
  applyTheme(); closeModal();
  if (!S.profile) return startOnboarding();
  if (!S.seeded) { S.seeded = true; S.courses.unshift({ id: uid(), ...structuredClone(L.COURSE) }); save(); } // everyone starts with one ready-made course
  $('#onboard').hidden = true; $('#app').hidden = false; $('#app').classList.toggle('mini', !!S.settings.navMini);
  initTimer(); S.timer.mode ||= 'focus'; dayState(); bootUI();
  // A missed yesterday is covered by a streak freeze when one is in reserve.
  const fz = L.applyFreeze(stats().days, S.frozen, S.freezes, today());
  if (fz.used) { S.frozen = fz.frozen; S.freezes = fz.freezes; save(); notify(`A streak freeze covered ${fz.used}. Your streak is safe.`, '🧊'); }
  emberCheck(); renderPlayer();
  go(location.hash.slice(1) || 'home');
  nudges(); checkIn();
}

// Once a day: today's events, a streak reminder, and on a new week the recap.
function nudges() {
  const st = stats(); if (S.nudged === st.t) return;
  S.nudged = st.t;
  for (const e of S.events.filter(e => e.d === st.t)) notify(`Today at ${e.time}: ${e.title}`, e.type === 'exam' ? '🎯' : '🗓️', true);
  if (st.streak && !st.days.has(st.t)) notify(`Your ${st.streak}-day streak is waiting. Five minutes keeps it alive.`, '🔥');
  const ws = L.weekStart(st.t);
  if (S.recapWeek !== ws) { if (S.recapWeek && S.sessions.length) notify('A new week starts. Last week\'s recap is under Progress.', '📊', true); S.recapWeek = ws; }
  save();
}
// Event reminder at its start time (checked every 30 s while the app is open).
setInterval(() => {
  if ($('#app').hidden) return;
  const d = new Date(), t = today(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  for (const e of S.events) if (e.d === t && e.time === hm && !e.rang) { e.rang = true; sfx.ok(); notify(`Starting now: ${e.title}`, '⏰'); }
  for (const x of S.tasks) if (!x.done && x.due === t && x.time === hm && !x.rang) { x.rang = true; sfx.ok(); notify(`To-do now: ${x.t}`, '✏️'); }
}, 30000);

ACT.palette = () => {
  const cmds = [
    ...NAV.flatMap(([, items]) => items.map(([id, label, ic]) => ({ label: 'Go to ' + label, ic, run: () => go(id) }))),
    { label: 'Focused mode (hide everything else)', ic: 'focus', run: ACT.focused }, { label: 'Start zen timer', ic: 'bolt', run: ACT.zen }, { label: 'Rest screen', ic: 'moon', run: ACT.rest },
    { label: 'Hide side panels on this page', ic: 'eye', run: ACT.tidy }, { label: 'Ask Ember for advice', ic: 'spark', run: () => { go('home'); ACT.emberTalk($('.ember-btn')); } },
    { label: 'Quick capture', ic: 'plus', run: ACT.capture }, { label: 'New note', ic: 'note', run: () => ACT.noteNew() }, { label: 'New event', ic: 'calendar', run: ACT.evNew },
    ...UIS.map(([v, n]) => ({ label: 'UI theme: ' + n, ic: 'sliders', run: () => setUI(v) })),
    { label: 'New course', ic: 'learn', run: () => ACT.courseNew() }, { label: 'Plan my week', ic: 'calendar', run: ACT.planWeek }, { label: 'Weekly recap', ic: 'chart', run: ACT.recap }, { label: 'Keyboard shortcuts', ic: 'sliders', run: ACT.keys },
    ...THEMES.map(([v, n]) => ({ label: 'Theme: ' + n, ic: 'sliders', run: () => { S.settings.theme = v; save(); applyTheme(); if (cur === 'settings') go(cur); } })),
    ...S.notes.map(n => ({ label: 'Note: ' + n.title, ic: 'note', run: () => ACT.noteOpen({ dataset: { id: n.id } }) })),
  ];
  const m = modal('<label class="sr" for="pal-in">Command palette</label><input id="pal-in" placeholder="Type a command or a note title…" autofocus><div class="pal-l" role="listbox" aria-label="Results"></div>', 'pal');
  const inp = $('input', m), list = $('.pal-l', m); let hits = [], at = 0;
  const draw = () => {
    const q = inp.value.toLowerCase().trim();
    hits = cmds.filter(c => c.label.toLowerCase().includes(q)).slice(0, 8); at = L.clamp(at, 0, Math.max(0, hits.length - 1));
    list.innerHTML = hits.map((c, i) => `<button role="option" aria-selected="${i === at}" class="${i === at ? 'on' : ''}" data-i="${i}">${icon(c.ic, 18)} ${esc(c.label)}</button>`).join('') || '<div class="empty">No matches</div>';
  };
  const run = i => { const c = hits[i]; if (c) { closeModal(); c.run(); } };
  inp.oninput = () => { at = 0; draw(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % (hits.length || 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(at); }
  };
  list.onclick = e => { const b = e.target.closest('button'); if (b) run(+b.dataset.i); };
  draw();
};

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('.pop') || $('.scrim:not(.out)')) { $('.pop')?.remove(); closeModal(); }
    else if ($('.rest')) ACT.restExit(); else if ($('.zen')) ACT.zenExit(); else if ($('#app.focused')) ACT.focused();
    return;
  }
  if ($('#app').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return ACT.palette(); }
  // Single-key shortcuts only when nothing is being typed and no overlay owns the keyboard.
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable]') || $('.scrim:not(.out)') || $('.lesson') || $('.zen') || $('.rest')) return;
  if (cur === 'break' && game) return; // games use the keyboard
  const k = e.key.toLowerCase();
  if (k === 'c') { e.preventDefault(); ACT.capture(); } else if (k === 'f') { e.preventDefault(); ACT.focused(); } else if (k === 'z') { e.preventDefault(); ACT.zen(); }
  else if (k === 't') { e.preventDefault(); go('todo'); } else if (e.key === '?') ACT.keys();
});
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (!$('#app').hidden && PAGES[id] && id !== cur) go(id); });

spBoot(); // reads ?code= from a Spotify redirect before the router rewrites the URL
enterApp();
