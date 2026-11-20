// AI tutor (Claude, Gemini or ChatGPT with the user's own key) and the quiz runner.
'use strict';

// Browser-direct calls: keys are stored on this PC only and sent only to the chosen provider.
// Raw fetch on purpose: this is a no-build static app, so there is no bundler to pull an SDK through.
const aiPost = async (url, headers, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `The AI service answered with an error (${r.status}).`);
  return j;
};
// Message content is a string, or a list of { type: 'text', text } and { type: 'image', mime, data (base64) } parts; each provider maps it to its own shape.
const parts = c => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
const AI = {
  claude: { name: 'Claude', by: 'Anthropic', async call(key, model, system, messages) {
    // Server-side refusal fallback is only accepted on these model families.
    const fb = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
    const msgs = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content
      : parts(m.content).map(p => (p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } } : { type: 'text', text: p.text })) }));
    const j = await aiPost('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true', ...(fb && { 'anthropic-beta': 'server-side-fallback-2026-07-01' }) },
      { model, max_tokens: 16000, system, messages: msgs, ...(fb && { fallbacks: 'default' }) });
    if (j.stop_reason === 'refusal') throw new Error('Claude declined to answer that one.');
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } },
  gemini: { name: 'Gemini', by: 'Google', async call(key, model, system, messages) {
    const j = await aiPost(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key },
      { system_instruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: parts(m.content).map(p => (p.type === 'image' ? { inline_data: { mime_type: p.mime, data: p.data } } : { text: p.text })) })) });
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  } },
  openai: { name: 'ChatGPT', by: 'OpenAI', async call(key, model, system, messages) {
    const msgs = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content
      : parts(m.content).map(p => (p.type === 'image' ? { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data}` } } : { type: 'text', text: p.text })) }));
    const j = await aiPost('https://api.openai.com/v1/chat/completions', { authorization: 'Bearer ' + key }, { model, messages: [{ role: 'system', content: system }, ...msgs] });
    return j.choices?.[0]?.message?.content || '';
  } },
};
function tutorSystem() {
  const p = S.profile;
  return `You are Ember, a friendly study tutor inside the Tempo app. Student: ${p.name}. Learning style: ${p.vak.v}% visual, ${p.vak.a}% auditory, ${p.vak.k}% kinesthetic (dominant: ${p.style}). Study archetype: ${p.archetype}. Goal: ${p.goal}. Comfortable focus span: ${p.pomo} minutes. Favourite hobby: ${p.hobby}.
Adapt to the dominant style: visual means tables, structure and spatial analogies; auditory means a conversational tone, mnemonics and rhythm; kinesthetic means small exercises and real examples to try. Be concise and accurate. Use markdown. Answer in the language the student writes in.`;
}
// Sign-in mode: Puter.js brokers Claude, GPT and Gemini behind one account login, so the app ships no key and needs no server.
// Trade-off: prompts pass through Puter and usage counts against the user's Puter account.
// The script is fetched only once the user chooses to sign in, so an offline start never waits on it.
let puterP = null;
const loadPuter = () => (puterP ||= new Promise((res, rej) => {
  if (window.puter) return res();
  const s = Object.assign(document.createElement('script'), { src: 'https://js.puter.com/v2/' });
  s.onload = () => res(); s.onerror = () => { puterP = null; s.remove(); rej(new Error('Could not reach the sign-in service. Check your connection.')); };
  document.head.append(s);
}));
const aiErr = e => new Error(typeof e === 'string' ? e : e?.error?.message || e?.message || e?.msg || 'The AI request failed. Try signing in again.');
const aiReady = (p = S.settings.ai) => (S.settings.aiMode === 'login' ? !!S.settings.aiUser : !!(user && S.settings.keys[p]));
const aiGate = fn => (S.settings.aiMode === 'key' ? requireLogin(fn) : fn()); // own-key mode still needs a Tempo account
ACT.aiSignIn = async () => {
  try {
    await loadPuter(); await puter.auth.signIn();
    const u = await puter.auth.getUser().catch(() => null);
    S.settings.aiUser = u?.username || 'signed in'; save(); sfx.ok(); toast('Signed in. The tutor is ready.');
    if (cur === 'tutor' || cur === 'settings') go(cur);
  } catch (e) { toast(e?.error === 'auth_window_closed' ? 'Sign-in window closed.' : aiErr(e).message, 'bad'); }
};
ACT.aiSignOut = async () => { try { await loadPuter(); await puter.auth.signOut(); } catch { /* signing out locally is enough */ } S.settings.aiUser = ''; save(); go(cur); toast('Signed out of the AI tutor.'); };
ACT.aiMode = el => { S.settings.aiMode = el.dataset.v; save(); go(cur); };

async function askAI(messages, system = tutorSystem(), prov = S.settings.ai) {
  const s = S.settings; let out;
  if (!navigator.onLine) throw new Error('You are offline. The tutor needs a connection; notes, lessons, quizzes and the board still work.');
  if (s.aiMode === 'login') {
    if (!s.aiUser) throw new Error('Sign in on the AI Tutor page first.');
    await loadPuter();
    // Puter takes a picture as (prompt, imageUrl); a data URL works, so a one-picture request is flattened into that form.
    const pic = messages.flatMap(m => (typeof m.content === 'string' ? [] : m.content)).find(p => p.type === 'image');
    const r = await (pic
      ? puter.ai.chat(system + '\n\n' + messages.map(m => parts(m.content).filter(p => p.type === 'text').map(p => p.text).join('\n')).join('\n\n'), `data:${pic.mime};base64,${pic.data}`, false, { model: s.lmodels[prov] })
      : puter.ai.chat([{ role: 'system', content: system }, ...messages], false, { model: s.lmodels[prov], normalize: true })).catch(e => { throw aiErr(e); });
    const c = r?.message?.content; out = Array.isArray(c) ? c.map(b => b.text || '').join('') : c;
  } else {
    if (!user) throw new Error('Log in to Tempo to use your own API key.');
    if (!s.keys[prov]) throw new Error(`Add your ${AI[prov].name} API key in Settings first.`);
    out = await AI[prov].call(s.keys[prov], s.models[prov], system, messages);
  }
  if (!out) throw new Error(AI[prov].name + ' sent an empty reply. Try again.');
  return out;
}

// ---------- tutor ----------
(() => {
  let busy = false;
  const bubble = (m, cls = '') => `<div class="msg ${m.role} ${cls} ${m.role === 'assistant' ? 'mdv' : ''}">${m.role === 'assistant' ? L.md(m.content) : esc(m.content)}</div>`;
  function paint(extra = '') {
    const box = $('#msgs'); if (!box) return;
    const p = S.profile;
    box.innerHTML = (S.chat.length ? S.chat.map(m => bubble(m)).join('') : `<div class="empty" style="margin:auto">${ember(96)}<h2 style="margin:10px 0 4px;color:var(--text)">Ask me anything, ${esc(p.name)}</h2>
      <p>I explain things the ${p.style.toLowerCase()} way.</p><div class="row" style="justify-content:center;margin-top:16px">
      ${['Make me a 7-day study plan', 'Explain my last note simply', 'Give me a memory trick for a hard term', 'Quiz me with 3 questions'].map(c => `<button class="btn sm ghost" data-act="chatChip">${c}</button>`).join('')}</div></div>`) + extra;
    box.scrollTop = box.scrollHeight;
  }
  async function send(text) {
    text = text.trim(); if (!text || busy) return;
    const last = [...S.notes].sort((a, b) => b.upd - a.upd)[0];
    S.chat.push({ role: 'user', content: text }); save(); busy = true;
    paint('<div class="msg assistant"><span class="typing"><i></i><i></i><i></i></span></div>');
    try {
      let ctx = S.chat.slice(-20); while (ctx[0]?.role !== 'user') ctx = ctx.slice(1); // providers need the first turn to be the user's
      const sys = tutorSystem() + (last ? `\n\nThe student's most recent note, "${last.title}":\n${last.body.slice(0, 4000)}` : '');
      S.chat.push({ role: 'assistant', content: await askAI(ctx, sys) }); S.chat = S.chat.slice(-60); save(); sfx.ok(); paint();
    } catch (e) { paint(`<div class="msg assistant error" role="alert">${esc(e.message)}</div>`); sfx.bad(); }
    busy = false;
  }
  ACT.chatChip = el => { const t = $('#chatIn'); if (!t) return toast('Connect the tutor below to start chatting.'); send(el.textContent); };
  ACT.chatSend = () => { const t = $('#chatIn'); send(t.value); t.value = ''; t.focus(); };
  ACT.chatClear = () => { const old = S.chat; S.chat = []; save(); paint(); toast('Chat cleared.', '', ['Undo', () => { S.chat = old; save(); paint(); }]); };
  ACT.aiProv = el => { S.settings.ai = el.dataset.v; save(); go('tutor'); };
  ACT.aiKey = () => {
    const inp = $('#aikey'), k = inp.value.trim(), p = S.settings.ai;
    if (!k) { replay(inp, 'shake'); return sfx.bad(); }
    requireLogin(() => { S.settings.keys[p] = k; save(); sfx.ok(); go('tutor'); toast(AI[p].name + ' connected.'); });
  };
  PAGES.tutor = {
    render(root) {
      const p = S.settings.ai, a = AI[p], ready = aiReady(p), login = S.settings.aiMode === 'login';
      if (login && ready && navigator.onLine) loadPuter().catch(() => {}); // warm up so the first answer is quick
      root.innerHTML = `<div class="ph"><h1>AI Tutor</h1><div class="seg" role="tablist" aria-label="AI provider">${AI_PICKS.map(([v, n]) => `<button role="tab" aria-selected="${v === p}" class="${v === p ? 'on' : ''}" data-act="aiProv" data-v="${v}">${n}</button>`).join('')}</div>
        ${S.chat.length ? '<button class="btn sm ghost right" data-act="chatClear">Clear chat</button>' : ''}</div>
        <div class="chat"><div class="msgs" id="msgs" aria-live="polite"></div>
        ${ready ? `<div class="composer"><textarea id="chatIn" rows="1" placeholder="Ask ${a.name} about anything you are studying…" aria-label="Message"></textarea><button class="btn" data-act="chatSend" aria-label="Send">${icon('send', 18)}</button></div>`
        : login ? `<div class="card"><h2>Sign in to chat with ${a.name}</h2><p class="muted" style="margin-bottom:14px">No API key needed. A Puter sign-in window opens; Puter provides the ${AI_PICKS.map(x => x[1]).join(', ')} models. Your questions pass through Puter and usage counts against that account.</p>
          <div class="row"><button class="btn big" data-act="aiSignIn">Sign in ${icon('right')}</button><button class="btn ghost" data-act="aiMode" data-v="key">Use my own API key instead</button></div></div>`
        : `<div class="card"><h2>Connect ${a.name}</h2><p class="muted" style="margin-bottom:12px">${user ? '' : 'Own-key mode needs a Tempo account. '}Paste your ${a.by} API key. It is stored on this PC only and sent only to ${a.by}.</p>
          <div class="row"><label class="sr" for="aikey">${a.name} API key</label><input class="inp grow" id="aikey" type="password" placeholder="${a.name} API key" autocomplete="off" style="min-width:200px"><button class="btn" data-act="aiKey">Connect</button><button class="btn ghost" data-act="aiMode" data-v="login">Sign in instead</button></div></div>`}</div>`;
      paint();
      const t = $('#chatIn'); if (!t) return;
      t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ACT.chatSend(); } };
      t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
      t.focus();
    },
  };
})();

// ---------- quiz ----------
(() => {
  let qz = null;
  const start = (qs, src) => { qz = { qs, src, i: 0, pick: null, checked: false, score: 0, done: false }; };
  const page = () => $('#page');

  function setup(root) {
    const hist = S.quizzes.slice(-5).reverse();
    root.innerHTML = `<div class="ph"><h1>Quiz</h1></div><div style="max-width:920px"><div class="pick">
      <button data-act="quizStart" data-src="notes"><span style="font-size:30px">📝</span><b>From my notes</b><span>Offline. Built from bold key terms and definitions in your notes.</span></button>
      <button data-act="quizStart" data-src="ai"><span style="font-size:30px">✨</span><b>AI-generated</b><span>Any topic, written by ${AI[S.settings.ai].name}. Type the topic below.</span></button>
      <button data-act="quizStart" data-src="starter"><span style="font-size:30px">🎓</span><b>Study skills</b><span>A warm-up deck that works anywhere.</span></button></div>
      <div class="card" style="margin-top:18px"><label class="f" for="qtopic" style="margin-top:0">Topic for the AI quiz</label><input class="inp" id="qtopic" maxlength="120" placeholder="e.g. Gossen's laws, cell respiration, the past tense in English"></div>
      <div class="card" style="margin-top:18px"><h2>Recent scores</h2>${hist.length ? hist.map(h => `<div class="ev"><time>${h.score}/${h.total}</time><div class="pbar grow"><div><b style="width:${h.score / h.total * 100}%"></b></div></div><small class="muted">${esc(h.src)} · ${ago(h.t)}</small></div>`).join('') : '<div class="empty">No quizzes yet. Pick a deck above.</div>'}</div></div>`;
  }
  function question(root, still) {
    const q = qz.qs[qz.i], ok = qz.pick === q.a, last = qz.i === qz.qs.length - 1;
    root.innerHTML = `<div class="quiz ${still ? 'still' : ''}"><div class="row" style="flex-wrap:nowrap"><span class="muted">${qz.i + 1} / ${qz.qs.length}</span><div class="pbar grow"><div><b style="width:${(qz.i + (qz.checked ? 1 : 0)) / qz.qs.length * 100}%"></b></div></div>
      <button class="icb" data-act="quizQuit" aria-label="Quit quiz">${icon('x')}</button></div>
      <h2 id="qq">${esc(q.q)}</h2><div role="radiogroup" aria-labelledby="qq">${q.o.map((o, k) => `<button class="qo ${qz.checked ? (k === q.a ? 'ok' : k === qz.pick ? 'no' : '') : k === qz.pick ? 'on' : ''}" role="radio" aria-checked="${k === qz.pick}" data-act="quizPick" data-i="${k}" style="--i:${k}" ${qz.checked ? 'disabled' : ''}><span class="key">${k + 1}</span>${esc(o)}</button>`).join('')}</div>
      ${qz.checked ? `<div class="why ${ok ? 'ok' : 'no'}" role="status"><b>${ok ? 'Correct.' : 'Not quite.'}</b> ${esc(q.why || '')}</div>` : ''}
      <div class="row" style="justify-content:space-between"><span class="muted">Keys 1–4 to answer · Enter to ${qz.checked ? 'continue' : 'check'}</span>
      <button class="btn big ${qz.checked && ok ? 'good' : ''}" id="qgo" data-act="quizCheck" ${qz.pick == null ? 'disabled' : ''}>${qz.checked ? (last ? 'Finish' : 'Next') : 'Check'}</button></div></div>`;
  }
  function result(root) {
    const pct = Math.round(qz.score / qz.qs.length * 100), C = 2 * Math.PI * 70;
    root.innerHTML = `<div class="quiz" style="text-align:center"><div class="ring-w"><svg viewBox="0 0 170 170" width="170" height="170" style="transform:rotate(-90deg)"><circle cx="85" cy="85" r="70" stroke="var(--line)"/>
      <circle cx="85" cy="85" r="70" stroke="${pct >= 60 ? 'var(--good)' : 'var(--accent)'}" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1s var(--out)" id="qring"/></svg><b>${qz.score}/${qz.qs.length}</b></div>
      <h2>${pct === 100 ? 'Flawless.' : pct >= 80 ? 'Strong work.' : pct >= 50 ? 'Solid start.' : 'Good to know where the gaps are.'}</h2>
      <p class="muted" style="margin-bottom:22px">${pct >= 80 ? 'This material is sticking.' : 'Review the misses, then run it again tomorrow. Spacing does the rest.'}</p>
      <div class="row" style="justify-content:center"><button class="btn big" data-act="quizQuit">Another quiz</button><button class="btn big ghost" data-act="go" data-p="home">Back home</button></div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => $('#qring')?.setAttribute('stroke-dashoffset', C * (1 - pct / 100))));
    if (pct >= 80) { confetti(); sfx.win(); }
  }
  ACT.quizStart = async el => {
    const src = el.dataset.src;
    if (src === 'starter') start(L.shuffle(L.STARTER).slice(0, 5), 'Study skills');
    else if (src === 'notes') {
      const qs = L.localQuiz(S.notes, 5);
      if (!qs.length) { replay(el, 'shake'); return toast('Not enough material yet. Add 4+ lines with **bold key terms** or “Term: definition” to your notes.', 'bad'); }
      start(qs, 'My notes');
    } else {
      const inp = $('#qtopic'), topic = inp.value.trim();
      if (!topic) { replay(inp, 'shake'); sfx.bad(); return inp.focus(); }
      if (!aiReady()) { go('tutor'); return toast('Connect the AI tutor first, then come back for the quiz.'); }
      const label = el.querySelector('b'); label.textContent = 'Writing your quiz…'; el.disabled = true;
      try {
        const out = await askAI([{ role: 'user', content: `Write 5 multiple-choice questions about: ${topic}\nReply with ONLY a JSON array. Each item: {"q": question, "o": [exactly 4 options], "a": index 0-3 of the correct option, "why": one-sentence explanation}.` }],
          `You write clear, accurate study quizzes for a ${S.profile.style.toLowerCase()} learner. Output valid JSON only, no prose and no code fences.`);
        const qs = L.validQuiz(JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]')); // AI output is untrusted: keep only well-formed questions
        if (!qs.length) throw new Error('The AI reply was not a usable quiz. Try again.');
        start(qs, topic.slice(0, 30));
      } catch (e) { label.textContent = 'AI-generated'; el.disabled = false; return toast(e instanceof SyntaxError ? 'The AI reply was not a usable quiz. Try again.' : e.message, 'bad'); }
    }
    go('quiz');
  };
  ACT.quizPick = el => {
    if (qz.checked) return;
    qz.pick = +el.dataset.i; sfx.pick();
    $$('.qo', page()).forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-checked', b === el); });
    $('#qgo').disabled = false;
  };
  ACT.quizCheck = () => {
    if (qz.pick == null) return;
    if (!qz.checked) {
      const ok = qz.pick === qz.qs[qz.i].a;
      qz.checked = true; qz.score += ok; ok ? sfx.ok() : sfx.bad(); addXp(ok ? 10 : 2);
      question(page(), true); return $('#qgo').focus();
    }
    if (++qz.i < qz.qs.length) { qz.pick = null; qz.checked = false; return question(page()); }
    qz.done = true; S.quizzes.push({ d: today(), t: Date.now(), score: qz.score, total: qz.qs.length, src: qz.src }); save();
    result(page()); checkAch(); chrome();
  };
  ACT.quizQuit = () => { qz = null; go('quiz'); };
  addEventListener('keydown', e => {
    if (cur !== 'quiz' || !qz || qz.done || $('.scrim:not(.out)') || $('#app').hidden || e.target.closest('input,textarea')) return;
    if (e.key === 'Enter') { e.preventDefault(); ACT.quizCheck(); }
    else if (e.key >= '1' && e.key <= '4') $$('.qo', page())[e.key - 1]?.click();
  });
  PAGES.quiz = {
    render(root, arg) {
      if (arg?.from) { // "Quiz me on this" from a note; fall back to all notes when one note is too thin
        const qs = L.localQuiz([arg.from], 5), all = qs.length ? qs : L.localQuiz(S.notes, 5);
        if (all.length) start(all, qs.length ? arg.from.title.slice(0, 30) : 'My notes'); else toast('That note needs 4+ lines with **bold key terms** first.', 'bad');
      }
      if (qz?.done) qz = null;
      qz ? question(root) : setup(root);
    },
  };
})();
