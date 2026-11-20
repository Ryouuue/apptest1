// Pure logic shared by the browser (window.TempoLogic) and tests/logic.test.js (node).
(function (root) {
  'use strict';
  const TRAITS = ['drive', 'consistency', 'focus', 'calm', 'motivation', 'independence', 'load', 'urgency'];

  // Each option may carry: fx (trait deltas), vak (learning-style vote), set (profile fields).
  const QUESTIONS = [
    { id: 'name', sec: 'You', type: 'text', q: "Hi, I'm Ember. What should I call you?" },
    { id: 'mode', sec: 'You', q: 'What is {n} studying for?', o: [
      { e: '🏫', t: 'School', set: { mode: 'School' } },
      { e: '🎓', t: 'University', set: { mode: 'Campus' }, fx: { load: 8 } },
      { e: '📝', t: 'A big exam or certification', set: { mode: 'Exam' }, fx: { urgency: 10, drive: 10 } },
      { e: '🛠️', t: 'Skills for myself', set: { mode: 'Self-taught' }, fx: { independence: 15, motivation: 8 } }] },
    { id: 'goal', sec: 'You', q: "What is {n}'s main goal right now?", o: [
      { e: '📈', t: 'Get better grades', set: { goal: 'better grades' }, fx: { drive: 15 } },
      { e: '🎯', t: 'Pass one important exam', set: { goal: 'passing the big exam' }, fx: { drive: 20, urgency: 8 } },
      { e: '🧠', t: 'Truly understand the material', set: { goal: 'deep understanding' }, fx: { motivation: 15, focus: 8 } },
      { e: '🌱', t: 'Build a steady study habit', set: { goal: 'a steady habit' }, fx: { consistency: 10, drive: 5 } }] },
    { id: 'daily', sec: 'You', q: 'How much time can {n} study on a normal day?', o: [
      { e: '⏱️', t: '15 minutes', set: { daily: 15 }, fx: { load: -5 } },
      { e: '🕧', t: '30 minutes', set: { daily: 30 } },
      { e: '🕐', t: '1 hour', set: { daily: 60 }, fx: { drive: 5 } },
      { e: '🕑', t: '2 hours or more', set: { daily: 120 }, fx: { drive: 10, load: 8 } }] },

    { id: 'chrono', sec: 'Rhythm', q: "When is {n}'s head clearest?", o: [
      { e: '🌅', t: 'Early morning · 05.00–09.00', set: { chrono: 'Morning', hour: 6 }, fx: { consistency: 5 } },
      { e: '☀️', t: 'Midday · 10.00–14.00', set: { chrono: 'Midday', hour: 10 } },
      { e: '🌇', t: 'Afternoon · 15.00–18.00', set: { chrono: 'Afternoon', hour: 16 } },
      { e: '🌙', t: 'Evening · 19.00–24.00', set: { chrono: 'Night', hour: 20 } }] },
    { id: 'start', sec: 'Rhythm', q: 'A task is due in one week. When does {n} start?', o: [
      { e: '⚡', t: 'The same day', fx: { urgency: -20, consistency: 15 } },
      { e: '🗓️', t: 'I plan it and spread it out', fx: { urgency: -10, consistency: 20, calm: 5 } },
      { e: '⏳', t: 'When the pressure builds', fx: { urgency: 20, consistency: -10 } },
      { e: '🌃', t: 'The night before', fx: { urgency: 35, consistency: -20, calm: -10 } }] },
    { id: 'span', sec: 'Rhythm', q: 'How long can {n} focus before drifting?', o: [
      { e: '🐇', t: 'About 10 minutes', set: { pomo: 15 }, fx: { focus: -25 } },
      { e: '🍅', t: 'About 25 minutes', set: { pomo: 25 } },
      { e: '🎧', t: 'About 45 minutes', set: { pomo: 45 }, fx: { focus: 20 } },
      { e: '🤿', t: '90 minutes or more', set: { pomo: 50 }, fx: { focus: 35 } }] },
    { id: 'often', sec: 'Rhythm', q: 'How often does {n} study right now?', o: [
      { e: '📆', t: 'Every day', fx: { consistency: 25 } },
      { e: '🔁', t: 'A few times a week', fx: { consistency: 8 } },
      { e: '🚨', t: 'Only before exams', fx: { consistency: -15, urgency: 15 } },
      { e: '🌫️', t: 'Rarely', fx: { consistency: -25, motivation: -10 } }] },

    { id: 's1', sec: 'Style', q: 'A brand-new topic. What does {n} reach for first?', o: [
      { e: '🎬', t: 'A video, diagram or picture', vak: 'v' },
      { e: '🎙️', t: 'Someone explaining it out loud', vak: 'a' },
      { e: '🧪', t: 'Trying it hands-on right away', vak: 'k' }] },
    { id: 's2', sec: 'Style', q: 'What helps {n} remember things best?', o: [
      { e: '🖍️', t: 'Colour-coded notes and sketches', vak: 'v' },
      { e: '🗣️', t: 'Saying it out loud or teaching a friend', vak: 'a' },
      { e: '✍️', t: 'Writing, building or acting it out', vak: 'k' }] },
    { id: 's3', sec: 'Style', q: 'What sticks most from a class?', o: [
      { e: '📊', t: 'The slides and what was on the board', vak: 'v' },
      { e: '👂', t: "The teacher's voice and stories", vak: 'a' },
      { e: '🔧', t: 'The exercises and experiments', vak: 'k' }] },
    { id: 's4', sec: 'Style', q: '{n} needs to get somewhere new. How?', o: [
      { e: '🗺️', t: 'Look at a map', vak: 'v' },
      { e: '💬', t: 'Ask someone for directions', vak: 'a' },
      { e: '🚶', t: 'Start walking and figure it out', vak: 'k' }] },

    { id: 'sport', sec: 'Life', q: "What is {n}'s favourite way to move?", o: [
      { e: '⚽', t: 'Team sports · football, basketball', vak: 'k', set: { sport: 'team sports' }, fx: { motivation: 5 } },
      { e: '🏃', t: 'Running, gym or swimming', vak: 'k', set: { sport: 'training' }, fx: { consistency: 8 } },
      { e: '🎮', t: 'Esports and gaming', vak: 'v', set: { sport: 'gaming' }, fx: { focus: 5 } },
      { e: '🛋️', t: 'Not really a sports person', set: { sport: 'none' } }] },
    { id: 'hobby', sec: 'Life', q: 'And the favourite hobby?', o: [
      { e: '🎵', t: 'Music · listening or playing', vak: 'a', set: { hobby: 'music' } },
      { e: '🎨', t: 'Drawing, design or photography', vak: 'v', set: { hobby: 'art' } },
      { e: '🧩', t: 'Games, crafts or building things', vak: 'k', set: { hobby: 'making' } },
      { e: '📚', t: 'Reading or writing', set: { hobby: 'reading' }, fx: { focus: 8 } }] },
    { id: 'nerves', sec: 'Life', q: 'The day before a test, {n} feels…', o: [
      { e: '😌', t: 'Calm', fx: { calm: 30 } },
      { e: '🙂', t: 'A bit nervous', fx: { calm: 10 } },
      { e: '😬', t: 'Stressed', fx: { calm: -15 } },
      { e: '😱', t: 'Total panic', fx: { calm: -30, urgency: 5 } }] },
    { id: 'load', sec: 'Life', q: 'How heavy is the workload right now?', o: [
      { e: '🪶', t: 'Light', fx: { load: -25 } },
      { e: '⚖️', t: 'Manageable', fx: { load: -5 } },
      { e: '🏋️', t: 'Heavy', fx: { load: 20 } },
      { e: '🌊', t: 'I am drowning', fx: { load: 35, calm: -10 } }] },
    { id: 'stuck', sec: 'Life', q: 'Stuck on a problem. What happens next?', o: [
      { e: '🧗', t: 'Keep at it alone', fx: { independence: 30 } },
      { e: '🔎', t: 'Search online', fx: { independence: 15 } },
      { e: '🤖', t: 'Ask an AI', fx: { independence: 5 } },
      { e: '🙋', t: 'Ask a friend or teacher', fx: { independence: -20 } }] },
    { id: 'fuel', sec: 'Life', q: 'What keeps {n} going?', o: [
      { e: '🔥', t: 'Streaks and rewards', fx: { motivation: 15 } },
      { e: '📈', t: 'Seeing my progress on a graph', fx: { motivation: 10, drive: 10 } },
      { e: '⏰', t: 'A deadline', fx: { urgency: 15, motivation: -5 } },
      { e: '✨', t: 'Pure curiosity', fx: { motivation: 25, independence: 5 } }] },
  ];

  const ARCH = {
    urgency: ['The Deadline Runner', 'does the best work when the clock is loud. Pressure is fuel; the trick is starting the engine a little earlier.'],
    consistency: ['The Steady Builder', 'shows up again and again. Small bricks, laid daily, build the tallest walls.'],
    focus: ['The Deep Diver', 'can sink into a topic for a long time. Protect those long blocks and the rest follows.'],
    calm: ['The Cool Head', 'stays level when exams get close. That calm is an edge; pair it with a clear plan.'],
    motivation: ['The Spark Chaser', 'runs on curiosity and small wins. Keep the sparks coming with visible progress.'],
    independence: ['The Lone Explorer', 'likes to crack problems solo. Great for depth; just ask for help before an hour is lost.'],
    load: ['The Juggler', 'is carrying a lot at once. Fewer, sharper sessions beat long tired ones.'],
    drive: ['The Goal Hunter', 'has a target and wants it badly. Break it into weekly checkpoints and hunt them one by one.'],
  };
  const STYLE = {
    v: ['Visual', ['Turn each chapter into a mind map on the Big Archive', 'Colour-code sticky notes by topic', 'Ask the tutor for tables and diagrams']],
    a: ['Auditory', ['Read key ideas out loud, then explain them to the tutor', 'Study with low-key instrumental music', 'Say a one-minute summary after every session']],
    k: ['Kinesthetic', ['Start with practice questions before the theory', 'Drag and regroup sticky notes while revising', 'Use short blocks and move during breaks']],
  };

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function scoreSurvey(ans) {
    const traits = Object.fromEntries(TRAITS.map(k => [k, 50])), votes = { v: 0, a: 0, k: 0 };
    const p = { mode: 'School', goal: 'better grades', daily: 30, pomo: 25, chrono: 'Afternoon', hour: 16, sport: 'none', hobby: 'reading' };
    for (const q of QUESTIONS) {
      const o = q.o && q.o[ans[q.id]];
      if (!o) continue;
      for (const k in o.fx || {}) traits[k] += o.fx[k];
      if (o.vak) votes[o.vak]++;
      Object.assign(p, o.set);
    }
    for (const k of TRAITS) traits[k] = clamp(traits[k], 8, 100);
    const total = votes.v + votes.a + votes.k;
    const v = total ? Math.round(votes.v / total * 100) : 34, a = total ? Math.round(votes.a / total * 100) : 33;
    const vak = { v, a, k: 100 - v - a };
    const sk = ['v', 'a', 'k'].reduce((m, k) => (vak[k] > vak[m] ? k : m), 'v');
    const sorted = [...TRAITS].sort((x, y) => traits[y] - traits[x]);
    const top = sorted[0], low = sorted[sorted.length - 1];
    return {
      ...p, name: String(ans.name || '').trim().slice(0, 24) || 'Friend', traits, vak, styleKey: sk, style: STYLE[sk][0], tips: STYLE[sk][1],
      top, low, archetype: ARCH[top][0], blurb: ARCH[top][1],
      tags: [p.mode + ' mode', STYLE[sk][0] + ' type', p.chrono + ' type'],
    };
  }

  function summary(p) {
    return [
      `${p.name} ${p.blurb}`,
      `Learning style: ${p.vak.v}% visual, ${p.vak.a}% auditory, ${p.vak.k}% kinesthetic. ${p.style} input lands best, so Tempo leans on it.`,
      `Strongest signal is ${p.top}; the one to grow is ${p.low}.`,
      `Plan: ${p.pomo}-minute focus blocks, ${p.daily} minutes a day, starting around ${String(p.hour).padStart(2, '0')}.00 when the head is clearest. Goal: ${p.goal}.`,
    ];
  }

  // ----- dates, streaks, levels -----
  const dateKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const weekStart = k => addDays(k, -((parseKey(k).getDay() + 6) % 7)); // Monday

  // A streak survives until the end of today: if today is empty, count from yesterday.
  function streak(days, today) {
    let d = days.has(today) ? today : addDays(today, -1), n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  // Consecutive weeks with at least `need` study days; the running week counts once it qualifies.
  function weekStreak(days, today, need = 3) {
    const c = {};
    for (const d of days) { const w = weekStart(d); c[w] = (c[w] || 0) + 1; }
    let w = weekStart(today), n = (c[w] || 0) >= need ? 1 : 0;
    for (w = addDays(w, -7); (c[w] || 0) >= need; w = addDays(w, -7)) n++;
    return n;
  }
  function levelOf(xp) {
    const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, base = 100 * (level - 1) ** 2;
    return { level, into: xp - base, span: 100 * level ** 2 - base };
  }

  const ACH = [
    { id: 'first', e: '🌱', n: 'First spark', d: 'Finish a focus session', ok: s => s.sessions >= 1 },
    { id: 's3', e: '🔥', n: 'Warming up', d: '3-day streak', ok: s => s.streak >= 3 },
    { id: 's7', e: '🌋', n: 'On fire', d: '7-day streak', ok: s => s.streak >= 7 },
    { id: 'w2', e: '🗓️', n: 'Weekly rhythm', d: '2-week streak', ok: s => s.weeks >= 2 },
    { id: 'h1', e: '⏳', n: 'First hour', d: '60 minutes studied', ok: s => s.totalMin >= 60 },
    { id: 'h10', e: '🏔️', n: 'Ten hours', d: '600 minutes studied', ok: s => s.totalMin >= 600 },
    { id: 'quiz', e: '❓', n: 'Quiz taker', d: 'Finish a quiz', ok: s => s.quizzes >= 1 },
    { id: 'perfect', e: '💯', n: 'Flawless', d: 'Perfect quiz score', ok: s => s.perfect },
    { id: 'arch', e: '🗂️', n: 'Archivist', d: '10 sticky notes on the Big Archive', ok: s => s.stickies >= 10 },
    { id: 'writer', e: '📝', n: 'Note maker', d: 'Write 5 notes', ok: s => s.notes >= 5 },
    { id: 'owl', e: '🦉', n: 'Night owl', d: 'Study after 22.00', ok: s => s.night },
    { id: 'lark', e: '🐦', n: 'Early bird', d: 'Study before 08.00', ok: s => s.early },
    { id: 'chap', e: '📖', n: 'Chapter closer', d: 'Finish a course chapter', ok: s => s.chapters >= 1 },
    { id: 'course', e: '🎓', n: 'Graduate', d: 'Finish a whole course', ok: s => s.coursesDone >= 1 },
    { id: 'lvl5', e: '⭐', n: 'Level 5', d: 'Reach level 5', ok: s => s.level >= 5 },
    { id: 'lesson', e: '🧩', n: 'First lesson', d: 'Finish a lesson on the Learn path', ok: s => s.lessons >= 1 },
    { id: 'cards', e: '🃏', n: 'Card shark', d: 'Review 50 flashcards', ok: s => s.reviews >= 50 },
    { id: 'quests', e: '🗝️', n: 'Quest keeper', d: 'Clear all daily quests 3 times', ok: s => s.chests >= 3 },
    { id: 'todo1', e: '✏️', n: 'Crossed off', d: 'Finish your first to-do', ok: s => s.tasksDone >= 1 },
    { id: 'todo25', e: '🗡️', n: 'List slayer', d: 'Finish 25 to-dos', ok: s => s.tasksDone >= 25 },
    { id: 'frog', e: '🐸', n: 'Frog eater', d: 'Finish the frog of the day before noon 3 times', ok: s => s.frogs >= 3 },
  ];

  // ----- markdown (escape first: note bodies and AI replies are untrusted) -----
  function md(src) {
    const inl = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/\[\[([^\]]+)\]\]/g, '<a class="wl" data-act="wikilink" data-t="$1">$1</a>');
    let out = '', list = '', code = false;
    const close = () => { if (list) { out += `</${list}>`; list = ''; } };
    for (const line of String(src || '').split('\n')) {
      let m;
      if (line.startsWith('```')) { close(); out += code ? '</pre>' : '<pre>'; code = !code; }
      else if (code) out += esc(line) + '\n';
      else if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`; }
      else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inl(m[1])}</li>`; }
      else if ((m = line.match(/^>\s?(.*)/))) { close(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
      else if (!line.trim()) close();
      else { close(); out += `<p>${inl(line)}</p>`; }
    }
    close();
    return out + (code ? '</pre>' : '');
  }
  const links = body => [...String(body || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());

  // ----- quizzes -----
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const validQuiz = arr => (Array.isArray(arr) ? arr : []).filter(q => q && typeof q.q === 'string' && Array.isArray(q.o) && q.o.length === 4
    && q.o.every(x => typeof x === 'string') && Number.isInteger(q.a) && q.a >= 0 && q.a < 4);

  // Key facts in notes: **bold terms**, "Term: definition" and "X is Y" lines. Feeds quizzes, flashcards and lessons.
  function facts(notes) {
    const out = new Map();
    for (const nt of notes || []) for (const raw of String(nt.body || '').split(/\n+/)) {
      if (/^\s*#/.test(raw)) continue; // headings are titles, not facts
      const line = raw.replace(/^(?:[>\-\s]|\d+\.\s|\*\s)+/, '').trim();
      if (line.length < 12) continue;
      const bold = line.match(/\*\*([^*]{2,40})\*\*/);
      const m = bold || line.match(/^([^:]{2,40}):\s+(.{8,})$/) || line.match(/^(?:an?\s+|the\s+)?(.{2,40}?)\s+(?:is|are|means|adalah|merupakan)\s+(.{8,})$/i);
      if (m) { const term = m[1].trim(); if (!out.has(term.toLowerCase())) out.set(term.toLowerCase(), { term, text: line.replace(/\*\*/g, '') }); }
    }
    return [...out.values()];
  }
  const cloze = (f, pool, max = 4) => {
    const o = shuffle([f.term, ...shuffle(pool.filter(x => x.term !== f.term)).slice(0, max - 1).map(x => x.term)]);
    return { q: f.text.replace(f.term, '_____'), o, a: o.indexOf(f.term), why: f.text };
  };
  // Offline quiz: needs four facts so every question has four options.
  function localQuiz(notes, n = 5) {
    const all = facts(notes);
    return all.length < 4 ? [] : shuffle(all).slice(0, n).map(f => cloze(f, all));
  }

  // ----- courses: a chapter is a list of steps, either { read } or { q, o, a, why } -----
  const validSteps = steps => (Array.isArray(steps) ? steps : []).filter(s => s && (typeof s.read === 'string' && s.read.trim()
    || typeof s.q === 'string' && Array.isArray(s.o) && s.o.length >= 2 && s.o.length <= 4 && s.o.every(x => typeof x === 'string') && Number.isInteger(s.a) && s.a >= 0 && s.a < s.o.length));
  // AI output is untrusted: keep only well-formed chapters and steps.
  function validCourse(c) {
    if (!c || typeof c.name !== 'string' || !Array.isArray(c.ch)) return null;
    const ch = c.ch.filter(x => x && typeof x.t === 'string').map(x => ({ t: x.t.slice(0, 80), done: false, steps: validSteps(x.steps) })).filter(x => x.steps.length).slice(0, 12);
    return ch.length ? { name: c.name.slice(0, 60), ch } : null;
  }
  // A note becomes a course: each heading section is a chapter (read it, then answer cloze questions on its facts).
  function courseFromNote(note) {
    const secs = []; let cur = null;
    for (const line of String(note.body || '').split('\n')) {
      const m = line.match(/^#{1,3}\s+(.*)/);
      if (m || !cur) secs.push(cur = { t: m ? m[1].trim() : note.title, lines: [] });
      if (!m) cur.lines.push(line);
    }
    const pool = facts([note]);
    const ch = secs.map(s => {
      const body = s.lines.join('\n').trim(), fs = facts([{ body }]);
      return { t: s.t, done: false, steps: [...(body ? [{ read: `## ${s.t}\n${body}` }] : []), ...(pool.length >= 2 ? fs.map(f => cloze(f, pool)) : [])] };
    }).filter(c => c.steps.length);
    return ch.length ? { name: note.title, ch } : null;
  }

  // ----- flashcards: Leitner boxes. grade 0 = again, 1 = good, 2 = easy -----
  const SRS_DAYS = [0, 1, 3, 7, 16, 35];
  const srs = (card, grade, today) => { const box = grade ? clamp((card.box || 0) + grade, 1, 5) : 0; return { ...card, box, due: addDays(today, SRS_DAYS[box]) }; };

  // ----- mind map: headings and bullets of a note as a tree -----
  function outline(src, title) {
    const root = { t: title, kids: [] }, stack = [{ lvl: 0, n: root }];
    for (const line of String(src || '').split('\n')) {
      let m, lvl;
      if ((m = line.match(/^(#{1,3})\s+(.*)/))) lvl = m[1].length;
      else if ((m = line.match(/^(\s*)[-*]\s+(.*)/))) lvl = 4 + Math.floor(m[1].length / 2);
      else continue;
      const t = m[2].replace(/\*\*|\[\[|\]\]|`/g, '').trim(); if (!t) continue;
      while (stack.length > 1 && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const n = { t, kids: [] }; stack[stack.length - 1].n.kids.push(n); stack.push({ lvl, n });
    }
    return root.kids.length === 1 && root.kids[0].kids.length ? root.kids[0] : root; // a lone H1 is the real root
  }

  // ----- planning -----
  // One focus block per day for the next week, skipping days that already have a study block.
  function planWeek(events, today, hour, pomo, days = 7) {
    const has = new Set(events.filter(e => e.type === 'study').map(e => e.d)), out = [];
    for (let i = 0; i < days; i++) { const d = addDays(today, i); if (!has.has(d)) out.push({ d, time: String(hour).padStart(2, '0') + ':00', title: `${pomo}-min focus block`, type: 'study' }); }
    return out;
  }
  // A streak freeze covers exactly one missed day (yesterday) when the day before it was a study day.
  function applyFreeze(days, frozen, freezes, today) {
    const all = new Set([...days, ...frozen]), y = addDays(today, -1);
    return freezes > 0 && !all.has(today) && !all.has(y) && all.has(addDays(today, -2)) ? { frozen: [...frozen, y], freezes: freezes - 1, used: y } : { frozen, freezes, used: null };
  }
  // iCalendar export, so events can be imported into Google Calendar or Outlook.
  function toICS(events) {
    const t = s => String(s).replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tempo//Study//EN', ...events.flatMap(e => ['BEGIN:VEVENT', `UID:${e.id}@tempo`, `DTSTAMP:${e.d.replace(/-/g, '')}T000000Z`,
      `DTSTART:${e.d.replace(/-/g, '')}T${e.time.replace(':', '')}00`, 'DURATION:PT30M', `SUMMARY:${t(e.title)}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
  }

  // ----- to-do: nag ladder and anti-cheat -----
  const DAY = 864e5, MIN_AGE = 15 * 60e3;
  // Whole days without progress while tasks wait: 0 calm, 1 reminder, 2-3 warnings, 4 lockdown.
  // The clock starts at the later of the last finished task and the oldest open one, so adding a new task never resets it.
  function nagLevel(tasks, lastDone, now) {
    const open = (tasks || []).filter(t => !t.done);
    if (!open.length) return 0;
    return clamp(Math.floor((now - Math.max(lastDone || 0, Math.min(...open.map(t => t.add)))) / DAY), 0, 4);
  }
  // Milliseconds until a task may be crossed off. Within the session that added it the monotonic clock must agree too,
  // so pushing the PC clock forward does not skip the wait.
  function crossWait(task, now, perfNow, session) {
    return Math.max(0, task.add + MIN_AGE - now, task.ses === session ? task.perf + MIN_AGE - perfNow : 0);
  }
  // AI output is untrusted: keep only short text tasks with an optional valid date.
  const validTasks = arr => (Array.isArray(arr) ? arr : []).filter(x => x && typeof x.t === 'string' && x.t.trim().length >= 2)
    .map(x => ({ t: x.t.trim().slice(0, 140), due: typeof x.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.due) && dateKey(parseKey(x.due)) === x.due ? x.due : '' })).slice(0, 20);
  // Open-Meteo weather codes (WMO) to an icon and a label.
  function wxInfo(code) {
    const c = +code, T = [[0, '☀️', 'Clear'], [2, '⛅', 'Partly cloudy'], [3, '☁️', 'Cloudy'], [48, '🌫️', 'Fog'], [57, '🌦️', 'Drizzle'], [67, '🌧️', 'Rain'], [77, '❄️', 'Snow'], [82, '🌦️', 'Showers'], [86, '🌨️', 'Snow showers'], [99, '⛈️', 'Thunderstorm']];
    const hit = T.find(([max]) => c <= max);
    return hit ? { e: hit[1], t: hit[2] } : { e: '🌡️', t: 'Weather' };
  }

  const COURSE = { name: 'Learn how to learn', ch: [
    { t: 'Recall beats re-reading', steps: [
      { read: '## Why re-reading fools you\nReading a page twice feels productive because the page gets **familiar**. Familiar is not the same as known.\n\nThe honest test: close the page and say what was on it. Whatever you cannot say, you do not know yet.' },
      { q: 'Re-reading a chapter mostly builds…', o: ['Familiarity', 'Recall', 'Speed', 'Focus'], a: 0, why: 'It feels like knowing, but it is only recognition.' },
      { read: '## Active recall\nPull the idea **out** of your head instead of pushing it in again. Cover the notes, answer a question, write down what you remember, then check.\n\nEvery pull makes the next one easier.' },
      { q: 'Which one is active recall?', o: ['Highlighting the chapter', 'Answering questions with the book closed', 'Copying notes neatly', 'Listening to the lecture again'], a: 1, why: 'Recall means producing the answer yourself, without looking.' },
      { read: '## The Feynman check\nExplain the idea in plain words, as if to a younger student. The spot where you get stuck, or reach for jargon, is exactly the gap to review.' },
      { q: 'You get stuck while explaining an idea simply. That means…', o: ['You should memorise harder', 'The topic is too hard for you', 'You found the gap to review', 'You need longer sentences'], a: 2, why: 'Getting stuck is the technique working: it shows you what to study next.' }] },
    { t: 'Space it out', steps: [
      { read: '## Forgetting is part of the plan\nMemory fades fast after you learn something. Reviewing **just as it starts to fade** rebuilds it stronger than before.\n\nThat is why three short reviews across a week beat one long night.' },
      { q: 'When is the best moment to review?', o: ['Right after learning, five times in a row', 'Just as the memory starts to fade', 'Only the night before the test', 'Whenever it feels easy'], a: 1, why: 'A little forgetting makes the review effortful, and effort is what strengthens memory.' },
      { read: '## Mix it up\n**Interleaving** means mixing related topics in one session instead of finishing one before the next. It feels harder, and that is the point: your brain has to choose the right method each time.' },
      { q: 'Interleaving feels harder than studying one topic at a time. Is it worth it?', o: ['No, harder means worse', 'Yes, choosing the method is the practice', 'Only for languages', 'Only with a tutor'], a: 1, why: 'Tests mix topics too, so practising the choice pays off.' },
      { read: '## Sleep saves your work\nDuring sleep the brain replays the day and files it into long-term memory. Trading sleep for late study throws away part of what you just learned.' },
      { q: 'What does sleep do for studying?', o: ['Nothing, it is lost time', 'It moves learning into long-term memory', 'It only helps with maths', 'It replaces reviewing'], a: 1, why: 'Consolidation happens while you sleep.' }] },
    { t: 'Protect your focus', steps: [
      { read: '## One block, one task\nAttention switches cost more than they seem. A **focus block** is a short stretch with one task and nothing else: no tabs, no chat, phone out of reach.\n\nStart with a length you can actually finish.' },
      { q: 'What makes a focus block work?', o: ['Doing two subjects at once', 'One task and no interruptions', 'Background videos', 'Checking messages every five minutes'], a: 1, why: 'Every switch leaves part of your attention behind.' },
      { read: '## Breaks are part of the block\nAfter a block, step away properly: stand up, drink water, look far away. A real break refills attention. Scrolling a feed does not.' },
      { q: 'Which break actually restores focus?', o: ['Scrolling a feed', 'Starting a new subject', 'Standing up and moving a little', 'Skipping the break'], a: 2, why: 'Moving and resting your eyes recovers attention; feeds keep spending it.' },
      { read: '## Make starting tiny\nThe hardest minute is the first one. Shrink the start: open the book, set a ten-minute timer, do one question. Momentum takes care of the rest.' },
      { q: 'You do not feel like studying. What is the best first move?', o: ['Wait for motivation', 'Plan a four-hour session', 'Do one tiny, ten-minute start', 'Tidy your whole room first'], a: 2, why: 'Action comes first; motivation usually follows it.' }] }] };

  const STARTER = [
    { q: 'Which habit beats one long cram session?', o: ['Short sessions spread over days', 'Re-reading the night before', 'Highlighting everything', 'Studying only when motivated'], a: 0, why: 'Spaced practice gives memory time to consolidate between sessions.' },
    { q: 'What is the most reliable way to check you know something?', o: ['Feeling familiar with the page', 'Recalling it without looking', 'Reading it twice', 'Copying the notes neatly'], a: 1, why: 'Active recall exposes gaps that re-reading hides.' },
    { q: 'A 25-minute focus block followed by a short break is called…', o: ['Flow state', 'Deep work', 'The Pomodoro technique', 'Interleaving'], a: 2, why: 'Pomodoro uses fixed blocks and breaks to keep attention fresh.' },
    { q: 'Mixing different topics in one session is known as…', o: ['Chunking', 'Interleaving', 'Cramming', 'Mapping'], a: 1, why: 'Interleaving forces the brain to pick the right method each time.' },
    { q: 'Explaining a topic in simple words to find gaps is the…', o: ['Feynman technique', 'Leitner system', 'Cornell method', 'SQ3R method'], a: 0, why: 'If you cannot explain it simply, you have found what to review.' },
    { q: 'What helps memory most after a study session?', o: ['Scrolling social media', 'An energy drink', 'Starting a new subject at once', 'Sleep'], a: 3, why: 'Sleep is when the brain consolidates what it learned.' },
  ];

  const api = { TRAITS, QUESTIONS, ACH, STARTER, STYLE, COURSE, esc, clamp, scoreSurvey, summary, dateKey, parseKey, addDays, weekStart, streak, weekStreak, levelOf, md, links, shuffle, validQuiz, localQuiz,
    facts, validSteps, validCourse, courseFromNote, srs, outline, planWeek, applyFreeze, toICS, nagLevel, crossWait, validTasks, wxInfo, MIN_AGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TempoLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
