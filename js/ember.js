// Ember's personality: advice when clicked, roasts when tasks are ignored, a check-in each time the app opens.
'use strict';
const LINES = {
  good: [
    'Small step now. Future you is already grateful.', 'You do not need to feel ready. You need to start the timer.', 'One focused block today beats a perfect plan for tomorrow.',
    'Pick the smallest task on the list and finish it. Momentum is a cheat code.', 'Progress, not perfection. Ten minutes still counts.', '{n}, you have done hard things before. This is just another one.',
    'Close one tab. Open one book. That is the whole trick.', 'Streaks are built on boring days. Today can be boring and still win.', 'Confused? Good. That is the feeling right before it clicks.',
    'Drink some water, sit up straight, start ugly.', 'Hard topics get easier exactly once: after you practise them.', 'Your brain grows on the reps nobody sees. Do one.',
  ],
  snark: [
    'Oh, you clicked me instead of studying. Bold. Love the commitment to avoidance.', 'Sure, poke the fire. That is definitely on the syllabus.',
    '{k} open tasks. Are you collecting them? Is it a hobby?', 'I would give you advice, but you would admire it and then do nothing.', 'Studying works best when you actually do it. Groundbreaking, I know.',
    'Another click? I am a flame, not a fidget spinner.', 'The plan: open app, click mascot, feel productive. Flawless.', 'The timer button is right there. Big. Bright. Hard to miss.',
    'Fun fact: procrastination burns zero calories. I checked.', 'Your notes called. They miss you.', 'Motivation is loading… it loads faster if you start.', 'Great news: the exam will not study for itself. Wait, that is bad news.',
  ],
  rude: [
    'Advice? Stop clicking me and go study. That is it. That is the advice.', 'Even your browser tabs work harder than you.', 'I have seen houseplants with more drive. At least they grow.',
    'You are not stuck. You are scrolling with extra steps.', 'My flame has more focus than you, and I am literally flickering.', 'Bold strategy: do nothing and hope the exam forgets you too.',
  ],
  1: ['Your to-do list has waited a whole day. It is starting to think you do not like it.', 'Day one of ignoring your tasks. Cute. Let us not make it a series.', 'Friendly reminder: tasks do not finish themselves. I asked.'],
  2: ['Two days, zero ticks. Your to-do list is filing a missing person report.', 'Warning: I am getting hot, and not the good kind.', 'Your tasks have aged like milk. Cross one off before they curdle.'],
  3: ['Three days. At this point your to-do list is a museum exhibit.', 'Final warning before I lock the break room. Yes, I can do that. Try me.', 'I have stopped being disappointed. Now I am just impressed by the avoidance.'],
  4: ['Lockdown. The break room is on a 30-minute leash until you finish something.', 'Congratulations, you unlocked consequences. Cross off a task to get your games back.', 'I am not mad. I am furious. Finish one task and we can talk.'],
  5: ['Your {r}-day streak died. I would hold a funeral, but you would skip that too.', 'The streak is gone, and so is my flame. Hope that scroll was worth it.', '{r} days of work, extinguished. Respectfully: ouch.', 'Streak: deceased. Cause of death: "I will do it tomorrow".'],
};
const NAG = ['All calm', 'Reminder', 'Warning', 'Final warning', 'Lockdown', 'Streak lost'];
const fillLine = s => s.replace('{n}', S.profile?.name || 'friend').replace('{k}', S.tasks.filter(x => !x.done).length).replace('{r}', S.ember.run || 0);
const anyLine = pool => fillLine(pool[Math.floor(Math.random() * pool.length)]);
// The hero line stays the same all day, so the page does not flicker between roasts.
const dailyLine = m => { const pool = LINES[m]; return fillLine(pool[Math.floor(Date.now() / 864e5) % pool.length]); };

// Click Ember: mostly encouragement, sometimes sarcasm, rarely rude. A mad Ember roasts instead.
ACT.emberTalk = el => {
  const m = mood(), r = Math.random(), bub = $('#bubble');
  const kind = m >= 2 ? (r < .5 ? m : r < .85 ? 'snark' : 'good') : r < .63 ? 'good' : r < .93 ? 'snark' : 'rude';
  bub.textContent = anyLine(LINES[kind]); bub.className = 'bubble ' + (kind === 'good' ? 'good' : kind === 'snark' ? 'snark' : 'rude'); bub.hidden = false;
  replay(bub, 'say'); replay(el, kind === 'good' ? 'hop' : 'huff');
  ({ good: sfx.ok, snark: sfx.hmm }[kind] || sfx.grumble)();
  clearTimeout(bub._t); bub._t = setTimeout(() => (bub.hidden = true), 6500);
};

// Runs on launch and every minute: streak death and relight, the to-do nag ladder and the break-room lockdown.
function emberCheck() {
  if (!S.profile) return;
  const st = stats(), e = S.ember, t = st.t;
  if (st.streak > 0) { if (e.out) { e.out = false; notify('Ember is lit again. Do not make me go out twice.', '🔥'); } e.run = st.streak; }
  else if (e.run >= 2 && !e.out) { e.out = true; notify(fillLine(LINES[5][Math.floor(Math.random() * LINES[5].length)]), '🪦'); }
  const lvl = L.nagLevel(S.tasks, S.todo.lastDone, Date.now());
  if (lvl >= 4 && !S.todo.lock) S.todo.lock = { since: Date.now(), used: 0 };
  if (lvl && S.todo.seen !== t + ':' + lvl) { S.todo.seen = t + ':' + lvl; notify(`${NAG[lvl]}: ${dailyLine(lvl)}`, ['', '🔔', '⚠️', '⚠️', '🔒'][lvl]); }
  save();
}
setInterval(() => { if (!$('#app').hidden) { const before = mood(); emberCheck(); if (mood() !== before) refresh(); } }, 60000);

// Each launch: what is due, what is planned, and how annoyed Ember is about it.
function checkIn() {
  if (!S.profile) return;
  const t = today(), open = S.tasks.filter(x => !x.done), due = open.filter(x => x.due && x.due <= t), evs = S.events.filter(e => e.d === t).sort((a, b) => a.time.localeCompare(b.time)), m = mood();
  if (!open.length && !evs.length && m < 5) return;
  const lvl = L.nagLevel(S.tasks, S.todo.lastDone, Date.now()), list = [...due, ...open.filter(x => !due.includes(x))].slice(0, 5);
  const title = m === 5 ? 'Your streak went out' : lvl ? NAG[lvl] : 'Here is today';
  const line = m === 5 ? dailyLine(5) : lvl ? dailyLine(lvl) : `${open.length} task${open.length === 1 ? '' : 's'} on the list${evs.length ? ` and ${evs.length} thing${evs.length === 1 ? '' : 's'} on the calendar` : ''}. Pick one and start small.`;
  const md = modal(`<div class="ci"><div class="ci-e">${ember(76, m)}</div><div><small class="muted">Ember's check-in</small><h2>${title}</h2><p class="ci-line">${esc(line)}</p></div></div>
    ${lvl ? `<ol class="ladder" aria-label="Nag level ${lvl} of 4">${NAG.slice(1, 5).map((n, i) => `<li class="${i + 1 <= lvl ? 'on' : ''}"><b>Day ${i + 1}</b><span>${n}</span></li>`).join('')}</ol>` : ''}
    ${S.todo.lock ? `<p class="ci-lock">${icon('lock', 15)} Break room: ${Math.max(0, Math.ceil(30 - S.todo.lock.used / 60e3))} min left until you finish a task.</p>` : ''}
    ${evs.length ? `<h3 style="margin-top:14px">Calendar today</h3>${evs.map(e => `<div class="ev"><time>${e.time}</time><i class="dot ${e.type}"></i><span class="grow">${esc(e.title)}</span></div>`).join('')}` : ''}
    ${list.length ? `<h3 style="margin-top:14px">To-do</h3>${list.map(x => `<div class="ev"><span class="grow">${esc(x.t)}</span>${x.due ? `<small class="${x.due < t ? 'late' : 'muted'}">${x.due < t ? 'overdue' : x.due === t ? 'today' : x.due}</small>` : ''}</div>`).join('')}` : ''}
    <div class="foot"><button class="btn ghost" data-act="closeModal">Later</button><button class="btn" id="ci-go">Open to-do</button></div>`, 'checkin');
  $('#ci-go', md).onclick = () => { closeModal(); go('todo'); };
  if (m >= 2) sfx.grumble();
}
