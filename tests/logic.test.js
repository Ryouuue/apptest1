// Run: node tests/logic.test.js
const assert = require('assert');
const L = require('../js/logic.js');

// survey: night-before + deadline fuel => Deadline Runner; style votes => VAK split summing to 100
const idx = (id, text) => L.QUESTIONS.find(q => q.id === id).o.findIndex(o => o.t.startsWith(text));
const p = L.scoreSurvey({ name: ' Ryo ', mode: 0, start: idx('start', 'The night before'), fuel: idx('fuel', 'A deadline'), chrono: 3, s1: 0, s2: 0, s3: 1, s4: 2 });
assert.equal(p.name, 'Ryo');
assert.equal(p.archetype, 'The Deadline Runner');
assert.equal(p.style, 'Visual');
assert.equal(p.vak.v + p.vak.a + p.vak.k, 100);
assert.deepEqual(p.tags, ['School mode', 'Visual type', 'Night type']);
assert.ok(Object.values(p.traits).every(v => v >= 8 && v <= 100));
assert.equal(L.scoreSurvey({}).name, 'Friend'); // empty survey still yields a usable profile
assert.equal(L.summary(p).length, 4);

// streaks
const days = new Set(['2026-11-13', '2026-11-14', '2026-11-15']);
assert.equal(L.streak(days, '2026-11-15'), 3);
assert.equal(L.streak(days, '2026-11-16'), 3, 'alive until today ends');
assert.equal(L.streak(days, '2026-11-17'), 0, 'broken after a missed day');
assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
assert.equal(L.weekStart('2026-11-15'), '2026-11-09'); // Sunday belongs to the week starting Monday
const wk = new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-16']);
assert.equal(L.weekStreak(wk, '2026-11-16'), 2, 'running week not yet qualified does not break it');
wk.add('2026-11-17'); wk.add('2026-11-18');
assert.equal(L.weekStreak(wk, '2026-11-18'), 3);

// levels
assert.deepEqual(L.levelOf(0), { level: 1, into: 0, span: 100 });
assert.equal(L.levelOf(100).level, 2);
assert.equal(L.levelOf(399).level, 2);
assert.equal(L.levelOf(400).level, 3);

// markdown escapes untrusted input, including inside wikilink attributes
const html = L.md('# Hi <script>alert(1)</script>\n- **bold** [[A"><img src=x onerror=1>]]\n```\n<b>raw</b>\n```');
assert.ok(!/<script|<img/.test(html));
assert.ok(html.includes('<h1>') && html.includes('<li><b>bold</b>') && html.includes('&lt;b&gt;raw'));
assert.deepEqual(L.links('see [[One]] and [[ Two ]]'), ['One', 'Two']);

// quizzes
const notes = [{ body: '**Mitochondria** make most of the cell energy\nOsmosis: movement of water across a membrane\nA ribosome is the place where proteins are built\n- **Nucleus** stores the genetic material' }];
const quiz = L.localQuiz(notes, 4);
assert.equal(quiz.length, 4);
assert.equal(L.validQuiz(quiz).length, 4);
for (const q of quiz) { assert.ok(q.q.includes('_____'), q.q); assert.equal(new Set(q.o).size, 4); }
assert.deepEqual(L.localQuiz([{ body: 'too short' }]), []);
assert.equal(L.validQuiz([{ q: 'x', o: ['a', 'b'], a: 0 }, { q: 'y', o: ['a', 'b', 'c', 'd'], a: 9 }, null]).length, 0);
assert.equal(L.validQuiz(L.STARTER).length, L.STARTER.length);

// courses: the built-in one is valid; a note becomes chapters; AI junk is dropped
assert.equal(L.validCourse(L.COURSE).ch.length, 3);
assert.ok(L.COURSE.ch.every(c => L.validSteps(c.steps).length === c.steps.length));
const course = L.courseFromNote({ title: 'Cells', body: '# Energy\n**Mitochondria** make most of the cell energy\n**ATP** is the energy currency of the cell\n# Control\n**Nucleus** stores the genetic material' });
assert.deepEqual(course.ch.map(c => c.t), ['Energy', 'Control']);
assert.ok(course.ch[0].steps[0].read.startsWith('## Energy'));
assert.equal(course.ch[0].steps.length, 3, 'one read step plus one question per fact');
assert.ok(course.ch[0].steps.slice(1).every(s => s.o.length === 3 && s.o[s.a] && s.q.includes('_____')));
assert.equal(L.courseFromNote({ title: 'Empty', body: '' }), null);
assert.equal(L.validCourse({ name: 'x', ch: [{ t: 'a', steps: [{ q: 'q', o: ['only one'], a: 0 }, { nope: 1 }] }] }), null);
assert.equal(L.validCourse({ name: 'x', ch: [{ t: 'a', steps: [{ read: 'hi' }, { q: 'q', o: ['a', 'b'], a: 5 }] }] }).ch[0].steps.length, 1);

// flashcards: again resets, good climbs, boxes cap at 5
assert.deepEqual(L.srs({ box: 3 }, 0, '2026-11-16'), { box: 0, due: '2026-11-16' });
assert.deepEqual(L.srs({ box: 0 }, 1, '2026-11-16'), { box: 1, due: '2026-11-17' });
assert.deepEqual(L.srs({ box: 1 }, 2, '2026-11-16'), { box: 3, due: '2026-11-23' });
assert.equal(L.srs({ box: 5 }, 2, '2026-11-16').box, 5);
assert.equal(L.facts(notes).length, 4);

// mind map tree
const tree = L.outline('# Root\n## A\n- a1\n  - a1x\n- a2\n## B', 'Note');
assert.equal(tree.t, 'Root');
assert.deepEqual(tree.kids.map(k => k.t), ['A', 'B']);
assert.equal(tree.kids[0].kids[0].kids[0].t, 'a1x');
assert.equal(L.outline('plain text', 'Note').kids.length, 0);

// planner, freeze, calendar export
const plan = L.planWeek([{ d: '2026-11-17', type: 'study' }, { d: '2026-11-18', type: 'exam' }], '2026-11-16', 9, 25);
assert.equal(plan.length, 6);
assert.ok(!plan.some(e => e.d === '2026-11-17') && plan[0].time === '09:00');
const fz = L.applyFreeze(new Set(['2026-11-13', '2026-11-14']), [], 1, '2026-11-16');
assert.deepEqual([fz.used, fz.freezes], ['2026-11-15', 0]);
assert.equal(L.streak(new Set(['2026-11-13', '2026-11-14', ...fz.frozen]), '2026-11-16'), 3, 'frozen day keeps the streak');
assert.equal(L.applyFreeze(new Set(['2026-11-12']), [], 1, '2026-11-16').used, null, 'two missed days are not covered');
assert.equal(L.applyFreeze(new Set(['2026-11-14']), [], 0, '2026-11-16').used, null);
const ics = L.toICS([{ id: 'a1', d: '2026-11-25', time: '08:00', title: 'Exam; part 1, maths' }]);
assert.ok(ics.includes('DTSTART:20261125T080000') && ics.includes('SUMMARY:Exam\\; part 1\\, maths') && ics.endsWith('END:VCALENDAR'));

// achievements only read fields the app supplies
const zero = { sessions: 0, streak: 0, weeks: 0, totalMin: 0, quizzes: 0, perfect: false, stickies: 0, notes: 0, night: false, early: false, chapters: 0, coursesDone: 0, level: 1, lessons: 0, reviews: 0, chests: 0, tasksDone: 0, frogs: 0 };
assert.ok(L.ACH.every(a => !a.ok(zero)));
assert.ok(L.ACH.find(a => a.id === 's3').ok({ ...zero, streak: 3 }));

// to-do nag ladder: days without progress while tasks wait; adding a task never resets the clock
const H = 36e5, T0 = Date.UTC(2026, 10, 20, 9);
assert.equal(L.nagLevel([], 0, T0), 0, 'nothing open, nothing to nag about');
assert.equal(L.nagLevel([{ add: T0 - 5 * H }], 0, T0), 0);
assert.equal(L.nagLevel([{ add: T0 - 25 * H }], 0, T0), 1, 'day 1: reminder');
assert.equal(L.nagLevel([{ add: T0 - 50 * H }, { add: T0 - H }], 0, T0), 2, 'a fresh task does not reset the clock');
assert.equal(L.nagLevel([{ add: T0 - 30 * 24 * H }], 0, T0), 4, 'caps at lockdown');
assert.equal(L.nagLevel([{ add: T0 - 30 * 24 * H }], T0 - 2 * H, T0), 0, 'a recent finish counts as progress');
assert.equal(L.nagLevel([{ add: T0 - 99 * H, done: T0 }], 0, T0), 0, 'done tasks do not nag');
// anti-cheat: 15 minutes by the wall clock and, in the same session, by the monotonic clock
const task = { add: T0, perf: 1000, ses: 'a' };
assert.equal(L.crossWait(task, T0 + 5 * 60e3, 1000 + 5 * 60e3, 'a'), 10 * 60e3);
assert.equal(L.crossWait(task, T0 + 16 * 60e3, 1000 + 16 * 60e3, 'a'), 0);
assert.ok(L.crossWait(task, T0 + 99 * 60e3, 1000 + 60e3, 'a') > 0, 'moving the PC clock forward does not help');
assert.equal(L.crossWait(task, T0 + 16 * 60e3, 5, 'b'), 0, 'another session trusts the wall clock');
assert.deepEqual(L.validTasks([{ t: ' Read ch. 3 ', due: '2026-11-21' }, { t: 'x' }, { t: 'Bad date', due: '2026-02-31' }, null, { t: 5 }]),
  [{ t: 'Read ch. 3', due: '2026-11-21' }, { t: 'Bad date', due: '' }]);
assert.equal(L.wxInfo(0).t, 'Clear'); assert.equal(L.wxInfo(63).t, 'Rain'); assert.equal(L.wxInfo(95).t, 'Thunderstorm');

console.log('logic ok');
