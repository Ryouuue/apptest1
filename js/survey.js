// Onboarding survey: multiple choice only (plus a name), scored into a study profile that drives the whole app.
'use strict';
const QS = L.QUESTIONS, SECS = ['You', 'Rhythm', 'Style', 'Life'];
const SEC_HINT = { You: 'No right answers. Just be honest.', Rhythm: 'This sets your timer and your daily plan.', Style: 'This decides how the tutor explains things.', Life: 'Almost there. This shapes your reminders.' };
let ob = null;
const obEl = () => $('#onboard');
const answered = q => (q.type === 'text' ? !!ob.ans.name?.trim() : ob.ans[q.id] != null);
const obName = () => `<span class="hl">${esc(ob.ans.name || ob.p?.name || 'you')}</span>`;

function startOnboarding(retake) {
  ob = { i: 0, ans: retake && S.profile ? { ...S.profile.answers, name: S.profile.name } : {}, retake, mode: 'q' };
  $('#app').hidden = true; obEl().hidden = false; obQ();
}
function obQ() {
  const q = QS[ob.i], sel = ob.ans[q.id];
  ob.mode = 'q';
  let x = 0;
  const marks = SECS.map(s => { const at = x / QS.length * 100; x += QS.filter(v => v.sec === s).length; return `${at ? `<i style="left:${at}%"></i>` : ''}<span class="${q.sec === s ? 'on' : ''}" style="left:${at}%">${s}</span>`; }).join('');
  obEl().innerHTML = `<div class="ruler" role="progressbar" aria-label="Survey progress" aria-valuemin="0" aria-valuemax="${QS.length}" aria-valuenow="${ob.i}"><b style="width:${ob.i / QS.length * 100}%"></b>${marks}</div>
    <div class="sv"><div><div class="sv-n">${String(ob.i + 1).padStart(2, '0')} / ${QS.length} · ${q.sec}</div>
      <h1 class="sv-q" id="obq">${esc(q.q).replace('{n}', obName())}</h1><div class="sv-side">${ember(54)}<span>${SEC_HINT[q.sec]}</span></div></div>
    <div>${q.type === 'text' ? `<label class="f" for="obname">Your first name</label><input class="inp" id="obname" maxlength="24" value="${esc(ob.ans.name || '')}" style="font-size:20px;padding:16px 18px" autocomplete="given-name">
      ${ob.retake ? '' : '<p class="muted" style="margin-top:18px">Already have an account? <a class="wl" tabindex="0" role="button" data-act="obLogin">Log in</a></p>'}`
    : `<div class="tiles ${q.o.length === 3 ? 'n3' : ''}" role="radiogroup" aria-labelledby="obq">${q.o.map((o, i) => `<button class="tile ${sel === i ? 'on' : ''}" role="radio" aria-checked="${sel === i}" data-act="obPick" data-i="${i}" style="--i:${i}"><span class="em" aria-hidden="true">${o.e}</span>${esc(o.t)}<span class="key" aria-hidden="true">${i + 1}</span></button>`).join('')}</div>`}</div></div>
    <div class="ob-foot"><button class="back" data-act="obBack" ${ob.i ? '' : 'style="visibility:hidden"'}>${icon('left')} Back</button>
    <span class="muted mono">${q.type === 'text' ? 'Enter to continue' : 'Keys 1–' + q.o.length + ' to pick'}</span><button class="btn big" data-act="obNext">Continue ${icon('right')}</button></div>`;
  $('#obname')?.focus();
}
ACT.obPick = el => {
  const q = QS[ob.i]; ob.ans[q.id] = +el.dataset.i; sfx.pick();
  $$('.tile', obEl()).forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
  clearTimeout(ob.auto); ob.auto = setTimeout(ACT.obNext, 380); // one click per question; Back still lets you change it
};
ACT.obNext = () => {
  clearTimeout(ob.auto);
  const q = QS[ob.i], inp = $('#obname');
  if (inp) ob.ans.name = inp.value.trim();
  if (!answered(q)) { replay($('#obq'), 'shake'); sfx.bad(); return inp?.focus(); }
  ++ob.i < QS.length ? obQ() : obAnalyze();
};
ACT.obBack = () => { clearTimeout(ob.auto); if (ob.i > 0) { ob.i--; obQ(); } };
ACT.obLogin = () => openAuth(null, 'login');
addEventListener('keydown', e => {
  if (obEl().hidden || ob?.mode !== 'q' || $('.scrim:not(.out)')) return;
  const q = QS[ob.i];
  if (e.key === 'Enter') { e.preventDefault(); ACT.obNext(); }
  else if (q.o && e.key >= '1' && e.key <= String(q.o.length)) $$('.tile', obEl())[e.key - 1].click();
});

function obAnalyze() {
  const p = (ob.p = L.scoreSurvey(ob.ans)), C = 2 * Math.PI * 84;
  ob.mode = 'done';
  const steps = [`Reading ${p.name}'s answers`, 'Finding your study rhythm', 'Drawing your learning profile', 'Writing your plan'];
  obEl().innerHTML = `<div class="an"><div class="an-ring"><svg viewBox="0 0 190 190" width="190" height="190" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="95" cy="95" r="84" stroke="var(--line)"/>
    <circle id="anc" cx="95" cy="95" r="84" stroke="var(--accent)" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset .5s var(--out)"/></svg><b id="ann">0%</b></div>
    <h1 id="obh" role="status">${esc(steps[0])}</h1><button class="btn big" id="obsee" data-act="obResult" hidden>See my study profile ${icon('right')}</button></div>`;
  steps.forEach((_, i) => setTimeout(() => {
    sfx.tap(); $('#anc').setAttribute('stroke-dashoffset', C * (1 - (i + 1) / 4)); $('#ann').textContent = (i + 1) * 25 + '%';
    $('#obh').textContent = steps[i + 1] || 'Your study profile is ready';
    if (i === 3) { const b = $('#obsee'); b.hidden = false; b.style.animation = 'popin .5s var(--spring) both'; sfx.ok(); b.focus(); }
  }, 520 * (i + 1)));
}

function radar(p, size = 380) {
  const c = 190, R = 112, T = L.TRAITS, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / T.length; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  const pts = f => T.map((t, i) => pt(i, f(t)).map(v => v.toFixed(1)).join(',')).join(' ');
  return `<svg class="radar" viewBox="0 0 380 380" width="${size}" height="${size}" role="img" aria-label="Study profile: ${T.map(t => t + ' ' + p.traits[t]).join(', ')}">
    ${[.25, .5, .75, 1].map(f => `<polygon class="ring" points="${pts(() => R * f)}"/>`).join('')}
    ${T.map((_, i) => { const [x, y] = pt(i, R); return `<line class="ax" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
    <polygon class="shape" points="${pts(t => R * p.traits[t] / 100)}"/>
    ${T.map((t, i) => { const [x, y] = pt(i, R * p.traits[t] / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`; }).join('')}
    ${T.map((t, i) => { const [x, y] = pt(i, R + 20), dx = x - c; return `<text class="${t === p.top ? 'top' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" dominant-baseline="middle" text-anchor="${Math.abs(dx) < 20 ? 'middle' : dx > 0 ? 'start' : 'end'}">${t[0].toUpperCase() + t.slice(1)}</text>`; }).join('')}</svg>`;
}
const profileCard = p => `<div class="pcard"><div class="pcard-top"><small>Study profile · ${esc(p.name)}</small><h1><span class="hl">${p.archetype}</span></h1>${p.tags.map((t, i) => `<span class="stamp" style="--i:${i}">${esc(t)}</span>`).join('')}</div><div class="pcard-b">${radar(p)}</div></div>`;
const vakBars = p => `<div class="vak">${[['v', '👁️ Visual'], ['a', '👂 Auditory'], ['k', '✋ Kinesthetic']].map(([k, n]) =>
  `<div class="r ${k} ${p.styleKey === k ? 'win' : ''}"><span>${n}</span><div class="t"><i style="width:${p.vak[k]}%"></i></div><span>${p.vak[k]}%</span></div>`).join('')}</div>`;

ACT.obResult = () => {
  const p = ob.p;
  obEl().innerHTML = `<div class="result">${profileCard(p)}<div style="display:grid;gap:18px">
    <div class="card"><h2>How ${esc(p.name)} learns</h2>${vakBars(p)}</div>
    <div class="card"><h2>What the answers say</h2>${L.summary(p).map(s => `<p style="margin-bottom:8px">${esc(s)}</p>`).join('')}</div>
    <div class="card"><h2>${p.style} study moves</h2><ul class="tips">${p.tips.map(t => `<li>✦ ${esc(t)}</li>`).join('')}</ul></div>
    <div><button class="btn big" data-act="obSetup">${icon('bolt')} ${ob.retake ? 'Save my profile' : 'Start studying'}</button></div></div></div>`;
  obEl().scrollTop = 0; confetti();
};

// Persist the profile and, on first run, seed a starter note pair and today's first focus block.
function obCommit() {
  const first = !S.profile, p = ob.p;
  S.profile = { ...p, answers: ob.ans }; S.timer = null;
  if (first) {
    S.notes.push({ id: uid(), title: 'Welcome to Tempo', upd: Date.now(), body: `# Welcome, ${p.name}\nWrite in plain markdown and link ideas with double brackets, like [[Study techniques]].\n\n- Drag sticky notes onto the Big Archive and draw around them\n- Start a focus block from the bar at the bottom\n- Open Quiz to test yourself on your own notes` },
      { id: uid(), title: 'Study techniques', upd: Date.now() - 1, body: `# Study techniques\nBold the key term in a line and the offline quiz can use it.\n\n- **Active recall** is testing yourself instead of re-reading\n- **Spaced repetition** is reviewing at growing intervals\n- **Interleaving** is mixing related topics in one session\n- **The Feynman technique** is explaining an idea in simple words to find gaps\n- **Pomodoro** is a short focus block followed by a break\n\nBack to [[Welcome to Tempo]].` });
    S.events.push({ id: uid(), d: today(), time: String(p.hour).padStart(2, '0') + ':00', title: `${p.pomo}-min focus block`, type: 'study' });
    notify(`Profile ready: ${p.archetype}. Your best window is the ${p.chrono.toLowerCase()}.`, '🧭', true);
  }
  saveNow();
}
ACT.obSetup = () => {
  if (ob.retake) { obCommit(); enterApp(); return toast('Profile updated.'); }
  ob.mode = 'setup';
  obEl().innerHTML = `<div class="ob-body" style="max-width:880px"><div class="sv-side">${ember(54)}<span class="mono">LAST STEP</span></div><h1 class="sv-q">Make Tempo yours, ${obName()}.</h1>
    <label class="f">Theme</label><div class="pick pick4">${pickCards('theme', THEMES)}</div>
    <label class="f">Where should notes live?</label><div class="pick">${pickCards('notes', NOTE_HOMES)}</div>
    <label class="f">Which AI tutor?</label><div class="pick">${pickCards('ai', AI_PICKS)}</div>
    <div class="row" style="margin-top:28px;justify-content:space-between"><span class="muted">All of this can change later in Settings.</span><button class="btn big" data-act="obAccount">Continue ${icon('right')}</button></div></div>`;
};
ACT.obAccount = () => {
  obCommit();
  if (user) return obEnter();
  obEl().innerHTML = `<div class="ob-body"><div class="sv-side">${ember(54)}<span class="mono">OPTIONAL</span></div><h1 class="sv-q">Want a <span class="hl">Tempo account</span>?</h1>
    <p class="muted" style="font-size:15px">An account keeps separate profiles on this PC and unlocks Spotify, vault and own-key connections. Everything else works without one, and you can sign up later.</p>
    <div class="row" style="margin-top:26px"><button class="btn big" data-act="obSign">Create account</button><button class="btn big ghost" data-act="obEnter">Continue without</button></div></div>`;
};
ACT.obSign = () => openAuth(() => confetti());
function obEnter() { enterApp(); confetti(); sfx.win(); }
ACT.obEnter = obEnter;
