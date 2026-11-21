// Notes. The front page ("Note page front") holds Ember's AI box that writes notes, and the topic blocks with covers.
// Inside a topic ("sub Note page") the app chrome hides: a tree of notes on the left, a docs-style toolbar on top, and one
// writing surface with Obsidian-style live preview (a block shows rendered until clicked, then shows its markdown).
// In the desktop app every note is also a real file: Documents\Tempo Notes\<account>\<topic>\…\<note>.txt (or .md).
'use strict';
(() => {
  let view = null, q = '', listView = false, vault = null, wT = 0, doc = null, recall = false, aiBusy = false, fontsOn = false, wl = null;
  const handles = new Map(); // Obsidian vault: lowercased title -> file handle
  const desk = window.tempoApp?.notes; // the desktop shell's file mirror; absent in a plain browser
  const topicOf = id => S.topics.find(t => t.id === id), noteOf = id => (id ? S.notes.find(n => n.id === id) : null);
  const kids = (tid, pid = null) => S.notes.filter(n => n.topic === tid && (noteOf(n.parent) ? n.parent : null) === pid).sort((a, b) => (a.ord || 0) - (b.ord || 0));
  const below = (n, d = 0) => (d > 12 ? [] : kids(n.topic, n.id).flatMap(k => [k, ...below(k, d + 1)]));
  const aiProv = () => (S.settings.notes === 'gemini' ? 'gemini' : S.settings.ai);
  const aiOpen = () => S.settings.noteAI !== false;
  const count = tp => S.notes.filter(n => n.topic === tp.id).length;

  // Notes saved before topics existed (and quick captures) land in an Inbox topic.
  function migrate() {
    const lost = S.notes.filter(n => !topicOf(n.topic));
    if (!lost.length) return;
    let inbox = S.topics.find(t => t.inbox);
    if (!inbox) S.topics.push(inbox = { id: uid(), title: 'Inbox', inbox: true, upd: Date.now(), chat: [] });
    for (const n of lost) { n.topic = inbox.id; delete n.parent; }
    save();
  }
  function newTopic(title, cover = null) {
    const t = { id: uid(), title: String(title).trim().replace(/\s+/g, ' ').slice(0, 80) || 'Untitled topic', cover, upd: Date.now(), chat: [] };
    S.topics.unshift(t); save(); return t;
  }
  function newNote(tid, title = 'Untitled', body = '', parent = null) {
    const n = { id: uid(), topic: tid, parent, title: String(title).slice(0, 80) || 'Untitled', body, upd: Date.now(), ord: Date.now() + Math.random(), ext: 'txt' };
    S.notes.push(n); touch(n); checkAch(); return n;
  }

  // ---------- files: each note mirrors to a .txt/.md file (desktop app only) ----------
  const fname = t => { const x = String(t).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 80) || 'Untitled'; return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(x) ? '_' + x : x; };
  function relPath(n) {
    const parts = [];
    for (let p = noteOf(n.parent), k = 0; p && k < 8; p = noteOf(p.parent), k++) parts.unshift(fname(p.title));
    const twin = S.notes.some(o => o !== n && o.topic === n.topic && (o.parent || null) === (n.parent || null) && fname(o.title).toLowerCase() === fname(n.title).toLowerCase());
    return [fname(user || 'Guest'), fname(topicOf(n.topic)?.title || 'Inbox'), ...parts, fname(n.title) + (twin ? ` (${n.id.slice(0, 4)})` : '')].join('/') + '.' + (n.ext === 'md' ? 'md' : 'txt');
  }
  const mT = new Map();
  let warned = false;
  function mirror(n, now) {
    if (!desk) return;
    clearTimeout(mT.get(n.id));
    mT.set(n.id, setTimeout(async () => {
      mT.delete(n.id);
      if (!S.notes.includes(n)) return;
      const rel = relPath(n);
      try {
        await desk.write(rel, n.body);
        if (n.file && n.file !== rel) await desk.remove(n.file).catch(() => {});
        if (n.file !== rel) { n.file = rel; save(); }
        status('Saved');
      } catch (e) { status('Not saved to file'); if (!warned) { warned = true; toast('Could not save the note file: ' + e.message, 'bad'); } }
    }, now ? 0 : 700));
  }
  const unmirror = n => { if (desk && n.file) desk.remove(n.file).catch(() => {}); };
  const status = t => { const el = $('#nsSave'); if (el) el.textContent = t; };
  function touch(n) {
    n.upd = Date.now(); const tp = topicOf(n.topic); if (tp) tp.upd = n.upd;
    save(); mirror(n); status(desk ? 'Saving…' : 'Saved in Tempo');
    if (vault && n.v) { clearTimeout(wT); wT = setTimeout(() => writeVault(n), 800); } else if (n.v) n.dirty = true;
  }
  ACT.notesFolder = () => desk?.reveal('').catch(e => toast(e.message, 'bad'));

  // ---------- Obsidian vault (import .md files, write edits back) ----------
  // shortcut: the vault folder handle lives in memory only, so reconnect after each launch; persist it in IndexedDB if that gets annoying.
  async function writeVault(n) {
    if (!vault) return;
    try {
      const k = n.title.toLowerCase(), fh = handles.get(k) || await vault.getFileHandle(fname(n.title) + '.md', { create: true });
      handles.set(k, fh);
      const w = await fh.createWritable(); await w.write(n.body); await w.close(); n.v = true; n.dirty = false; save();
    } catch (e) { toast('Could not write to the vault: ' + e.message, 'bad'); }
  }
  ACT.vaultConnect = () => requireLogin(async () => {
    if (!window.showDirectoryPicker) return toast('This browser cannot open folders. Use Edge or Chrome.', 'bad');
    let dir; try { dir = await showDirectoryPicker({ mode: 'readwrite' }); } catch { return; } // picker cancelled
    let synced = 0, kept = 0; handles.clear();
    const tp = S.topics.find(t => t.title === 'Vault · ' + dir.name) || newTopic('Vault · ' + dir.name);
    const walk = async (d, depth) => {
      for await (const [name, h] of d.entries()) {
        if (name.startsWith('.')) continue;
        if (h.kind === 'directory') { if (depth < 5) await walk(h, depth + 1); continue; }
        if (!name.toLowerCase().endsWith('.md') || synced + kept >= 500) continue;
        const title = name.slice(0, -3), body = await (await h.getFile()).text(), ex = S.notes.find(n => n.title.toLowerCase() === title.toLowerCase());
        handles.set(title.toLowerCase(), h);
        if (!ex) { const n = newNote(tp.id, title, body); n.v = true; n.ext = 'md'; synced++; }
        else if (ex.body === body) { ex.v = true; synced++; }
        else if ((ex.v && !ex.dirty) || !ex.body.trim()) { ex.body = body; ex.v = true; synced++; } // vault wins only when Tempo has no unsaved edits
        else kept++; // never overwrite text written in Tempo; it is pushed to the vault on the next edit
      }
    };
    try { await walk(dir, 0); } catch (e) { return toast('Could not read the vault: ' + e.message, 'bad'); }
    vault = dir; S.settings.notes = 'obsidian'; save(); go('notes');
    toast(`Vault “${dir.name}” connected. ${synced} notes in sync${kept ? `, ${kept} kept from Tempo` : ''}.`);
  });

  const coverHTML = coverArt; // shared with Quiz, Learn and the Big Archive (core.js)

  // ---------- "Add to-do list": Ember splits the note into checkpoints, the student ticks the ones they want, then pushes them ----------
  // Nothing reaches the to-do list on its own; a long note no longer floods it.
  const ckLabel = (n, t) => `${n.title.slice(0, 30)} · ${t}`.slice(0, 140);
  const onList = full => S.tasks.some(x => !x.done && x.t.toLowerCase() === full.toLowerCase());
  async function ckSuggest(n) {
    if (aiReady(aiProv())) {
      try {
        const out = await askAI([{ role: 'user', content: `Topic: ${topicOf(n.topic)?.title || ''}\nNote: ${n.title}\n\n${(n.body || '').slice(0, 8000) || '(no text yet: plan from the title)'}\n\nBreak this note into 4 to 10 checkpoints: concrete things to learn or do, in order, from the basics to the harder parts. Example for ionic bonding: "What an ion is", "How electrons transfer between atoms", "Write the formula of an ionic compound". Reply with ONLY a JSON array of {"t": checkpoint under 80 characters}.` }],
          'You turn study notes into clear checkpoints. Output valid JSON only, no prose and no code fences.', aiProv());
        const list = L.validTasks(JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]')).map(x => x.t).slice(0, 10);
        if (list.length) return { list, ai: true };
      } catch (e) { toast(e instanceof SyntaxError ? 'The AI reply was not a usable list. Used the note headings instead.' : e.message, 'bad'); }
    }
    return { list: L.studySteps(n.body, 10), ai: false };
  }
  async function checkpoints(n) {
    if (doc?.ed) commit();
    const m = modal(`<h2>${icon('todo', 22)} Add to your to-do list</h2><p class="muted ck-sub">Ember is reading “${esc(n.title)}” and marking the checkpoints…</p>
      <div class="ck-bar"><button type="button" class="nf-chip" data-k="all" disabled>Select all</button><span class="muted ck-n" role="status">0 selected</span>
        <label class="ck-due right"><span class="muted">Due</span><input class="inp" type="date" id="ckDue" aria-label="Due date for the pushed tasks"></label></div>
      <ol class="ck-list" aria-label="Checkpoints">${'<li class="ck sk" aria-hidden="true"><i></i><b></b></li>'.repeat(5)}</ol>
      <button type="button" class="nf-chip ck-add" data-k="add">${icon('plus', 14)} Add your own</button>
      <div class="foot"><button type="button" class="btn ghost" data-k="again" disabled>${icon('undo', 16)} Ask again</button><button type="button" class="btn" data-k="push" disabled>${icon('pushup', 17)} Push to to-do list</button></div>`, 'wide ck-modal');
    const list = $('.ck-list', m), sub = $('.ck-sub', m);
    const row = (t, i) => { const full = ckLabel(n, t), have = onList(full); return `<li class="ck ${have ? 'have' : ''}" style="--i:${i}"><label class="ck-tick"><input type="checkbox" ${have ? 'checked disabled' : ''} aria-label="Push “${esc(t)}”"><span aria-hidden="true">${icon('check', 15, 3)}</span></label>
      <input class="ck-t" value="${esc(t)}" maxlength="100" aria-label="Checkpoint ${i + 1}">${have ? '<small class="ck-have">on your list</small>' : ''}</li>`; };
    const picks = () => $$('.ck:not(.have)', list).filter(li => $('input[type=checkbox]', li).checked && $('.ck-t', li).value.trim());
    const sync = () => {
      const k = picks().length, free = $$('.ck:not(.have) input[type=checkbox]', list);
      $('.ck-n', m).textContent = `${k} selected`;
      const push = $('[data-k=push]', m); push.disabled = !k; push.innerHTML = `${icon('pushup', 17)} Push ${k || ''} to to-do list`;
      $('[data-k=all]', m).textContent = free.length && free.every(c => c.checked) ? 'Clear all' : 'Select all';
    };
    const load = async () => {
      $$('button[data-k]', m).forEach(b => (b.disabled = b.dataset.k !== 'add'));
      const r = await ckSuggest(n); if (!m.isConnected) return;
      sub.textContent = r.list.length ? `${r.ai ? 'Ember split the note into checkpoints.' : 'Made from the note’s headings and key terms (AI is off).'} Tick what you need, then push.` : 'No checkpoints found yet. Add your own below.';
      list.innerHTML = r.list.map(row).join(''); $$('button[data-k]', m).forEach(b => (b.disabled = false)); sync(); sfx.pick();
    };
    list.onchange = e => { if (e.target.matches('input[type=checkbox]')) { e.target.closest('.ck').classList.toggle('on', e.target.checked); sfx.tap(); sync(); } };
    list.oninput = sync;
    m.onclick = e => {
      const k = e.target.closest('button[data-k]')?.dataset.k; if (!k) return;
      if (k === 'again') return load();
      if (k === 'all') { const free = $$('.ck:not(.have) input[type=checkbox]', list), on = !free.every(c => c.checked); free.forEach(c => { c.checked = on; c.closest('.ck').classList.toggle('on', on); }); sfx.pick(); return sync(); }
      if (k === 'add') { list.insertAdjacentHTML('beforeend', row('', list.children.length)); const li = list.lastElementChild; $('input[type=checkbox]', li).checked = true; li.classList.add('on'); $('.ck-t', li).focus(); return sync(); }
      if (k === 'push') {
        const due = $('#ckDue', m).value, added = [];
        for (const li of picks()) { try { added.push(addTask(ckLabel(n, $('.ck-t', li).value.trim()), due, '', 'note', n.id)); } catch { /* duplicate or the list is full */ } }
        save(); closeModal();
        if (!added.length) return toast('Those checkpoints are already on your list.');
        sfx.drop(); toast(`Pushed ${added.length} checkpoint${added.length === 1 ? '' : 's'} to your to-do list.`, '', ['Open', () => go('todo')]);
      }
    };
    $('.ck-add', m).disabled = false;
    load();
  }

  // ---------- front page ----------
  const card = (t, i) => `<article class="nf-card" style="--i:${i}"><button class="nf-cov" data-act="topicOpen" data-id="${t.id}" tabindex="-1" aria-hidden="true">${coverHTML(t)}</button>
    <div class="nf-meta"><button class="nf-title" data-act="topicOpen" data-id="${t.id}">${esc(t.title)}</button><small class="muted">${count(t)} note${count(t) === 1 ? '' : 's'} · ${ago(t.upd)}</small></div>
    <button class="icb sm nf-more" data-act="topicMenu" data-id="${t.id}" aria-label="Options for ${esc(t.title)}">${icon('more', 18)}</button></article>`;
  const grid = () => {
    const f = q.toLowerCase(), list = S.topics.filter(t => !f || (t.title + ' ' + S.notes.filter(n => n.topic === t.id).map(n => n.title).join(' ')).toLowerCase().includes(f)).sort((a, b) => b.upd - a.upd);
    return list.map(card).join('') || `<div class="empty">${q ? 'Nothing matches that search.' : 'No topics yet. Ask Ember above, or add one yourself.'}</div>`;
  };
  function front(root) {
    const ready = aiReady(aiProv());
    root.innerHTML = `<div class="nfront">
      <section class="nf-top"><div class="nf-hi"><span class="nf-ember">${ember(88)}</span><h1>What do you want to learn today?</h1></div>
        <form class="nf-ask" id="nfAsk" novalidate><label class="sr" for="nfIn">Tell Ember what to write notes about, or paste material to summarise</label>
          <textarea id="nfIn" rows="2" maxlength="20000" placeholder="Make notes on ionic bonding for my chemistry test…  or paste a chapter to summarise"></textarea>
          <div class="nf-row"><button type="button" class="nf-chip c1" data-act="nfFile">${icon('upload', 15)} Upload .txt / .md</button><button type="button" class="nf-chip c2" data-act="nfPhoto">${icon('camera', 15)} From a photo</button>
            <span class="nf-state muted" id="nfState">${ready ? 'Ember writes the notes and splits them into sub-notes.' : 'AI is off. Sign in on the AI Tutor page; until then Ember makes an empty topic.'}</span>
            <button class="nf-send" aria-label="Make notes" title="Make notes (Enter)">${icon('send', 18)}</button></div></form></section>
      <button class="nf-add" data-act="topicNew"><span class="nf-plus">${icon('plus', 26)}</span><span><b>Add a topic</b><small>A title, and a cover photo if you like</small></span></button>
      <section class="nf-list" aria-label="Topics"><div class="nf-head"><h2>Topics <small class="muted">${S.topics.length}</small></h2>
        <span class="right row"><label class="sr" for="nfQ">Search topics and notes</label><input class="inp nf-q" id="nfQ" placeholder="Search topics and notes" value="${esc(q)}">
          <button class="btn sm ghost" data-act="noteGraph">${icon('graph', 15)} Graph</button>
          ${desk ? `<button class="btn sm ghost" data-act="notesFolder" title="Open the folder with your note files">${icon('folder', 15)} Files</button>` : ''}
          ${S.settings.notes === 'obsidian' && !vault ? '<button class="btn sm ghost" data-act="vaultConnect">Connect Obsidian vault</button>' : ''}
          <div class="seg" role="group" aria-label="Layout"><button class="${listView ? '' : 'on'}" aria-pressed="${!listView}" data-act="nfView" data-v="">Gallery</button><button class="${listView ? 'on' : ''}" aria-pressed="${listView}" data-act="nfView" data-v="1">List</button></div></span></div>
        <div class="nf-grid ${listView ? 'list' : ''}" id="nfGrid">${grid()}</div></section></div>`;
    hydrate(root);
    const form = $('#nfAsk', root), inp = $('#nfIn', root);
    form.onsubmit = e => { e.preventDefault(); ask(inp.value.trim()); };
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    inp.oninput = () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 220) + 'px'; };
    form.ondragover = e => { e.preventDefault(); form.classList.add('over'); };
    form.ondragleave = () => form.classList.remove('over');
    form.ondrop = e => { e.preventDefault(); form.classList.remove('over'); importFiles(e.dataTransfer.files); };
    $('#nfQ', root).oninput = e => { q = e.target.value; $('#nfGrid').innerHTML = grid(); hydrate($('#nfGrid')); };
    if (desk) S.notes.filter(n => !n.file).forEach(n => mirror(n)); // notes written before files existed get theirs now
  }
  ACT.nfView = el => { listView = !!el.dataset.v; go('notes'); };
  const busy = (on, text) => { const f = $('#nfAsk'); if (!f) return; f.classList.toggle('busy', on); $('.nf-send', f).disabled = on; $('#nfState').innerHTML = on ? `<span class="typing"><i></i><i></i><i></i></span> ${esc(text)}` : esc(text || ''); };
  function noteSystem() {
    const p = S.profile;
    return `You are Ember, the note writer inside the Tempo study app. Student: ${p.name}, ${p.style} learner, goal: ${p.goal}.
Write accurate, well-structured study notes in Obsidian markdown: ## headings, short bullet lists, **bold** for key terms (each bold term becomes a flashcard, so bold it inside a sentence that defines it), tables when comparing things, > [!tip] callouts for memory tricks, $...$ for formulas, - [ ] checkboxes for practice tasks, and a \`\`\`mermaid flowchart only when a process really has steps.
Reply with ONLY JSON, no code fences: {"title": "short topic title", "notes": [{"title": "note title", "body": "markdown", "kids": [{"title": "...", "body": "..."}]}]}. Write 3 to 6 notes; the first is an overview. Use kids only for real subtopics. Answer in the language the student writes in.`;
  }
  async function ask(text, image) {
    if (!text && !image) { replay($('#nfIn'), 'shake'); return sfx.bad(); }
    if (!aiReady(aiProv())) { // offline: a line becomes a topic, a long paste becomes its first note
      const long = text.length > 280, tp = newTopic(long ? text.split('\n')[0].slice(0, 60) : text);
      newNote(tp.id, long ? 'Pasted notes' : tp.title, long ? text : '');
      sfx.ok(); return openTopic(tp);
    }
    busy(true, 'Ember is writing your notes…');
    try {
      const prompt = image ? `Turn this picture into study notes.${text ? ' Focus: ' + text : ''}` : text.length > 400 ? `Summarise this material into study notes:\n\n${text}` : `Write study notes about: ${text}`;
      const out = await askAI([{ role: 'user', content: image ? [{ type: 'image', mime: 'image/jpeg', data: image }, { type: 'text', text: prompt }] : prompt }], noteSystem(), aiProv());
      const o = L.validNotes(JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || 'null'));
      if (!o.notes.length) throw new Error('Ember’s reply was not usable notes. Try again.');
      const tp = newTopic(o.title || text.slice(0, 60) || 'Notes from a photo');
      const add = (arr, parent) => arr.forEach(x => { const n = newNote(tp.id, x.title, x.body, parent); add(x.kids, n.id); });
      add(o.notes, null);
      sfx.win(); addXp(10);
      openTopic(tp);
    } catch (e) { busy(false, e instanceof SyntaxError ? 'Ember’s reply was not usable notes. Try again.' : e.message); sfx.bad(); }
  }
  async function importFiles(files) {
    const txt = [...(files || [])].filter(f => /\.(txt|md|markdown)$/i.test(f.name) && f.size < 2e6);
    if (!txt.length) return toast('Only .txt and .md files can be imported.', 'bad');
    let tp = null;
    for (const f of txt) {
      const title = f.name.replace(/\.\w+$/, ''); tp ||= newTopic(txt.length > 1 ? 'Imported notes' : title);
      const n = newNote(tp.id, title, await f.text()); n.ext = /\.txt$/i.test(f.name) ? 'txt' : 'md';
    }
    sfx.ok(); toast(`Imported ${txt.length} file${txt.length === 1 ? '' : 's'}.`); openTopic(tp);
  }
  ACT.nfFile = () => { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.txt,.md,.markdown,text/plain,text/markdown', multiple: true }); inp.onchange = () => importFiles(inp.files); inp.click(); };
  ACT.nfPhoto = () => {
    if (!aiReady(aiProv())) return toast('Reading photos needs the AI. Sign in on the AI Tutor page first.', 'bad', ['Set up', () => go('tutor')]);
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.onchange = async () => { const f = inp.files[0]; if (!f?.type.startsWith('image/')) return; const c = await shrinkImage(f, 1600); ask($('#nfIn')?.value.trim() || '', c.toDataURL('image/jpeg', .85).split(',')[1]); };
    inp.click();
  };

  ACT.topicNew = () => {
    let cover = null;
    const m = modal(`<h2>Add a topic</h2><p class="muted">It becomes a block on the Notes page. Click it to start writing.</p><form novalidate>
      <label class="f" for="tp-t">Topic title</label><input class="inp" id="tp-t" name="t" maxlength="80" placeholder="e.g. Ionic bonding" autofocus>
      <label class="f">Cover photo <span class="muted">(optional)</span></label><button type="button" class="tp-cov" id="tpCov">${coverHTML({ id: 'preview', title: '?' })}<span>${icon('image', 18)} Choose a photo</span></button>
      <p class="err" role="alert"></p><div class="foot"><button class="btn" type="submit">${icon('plus', 16)} Add topic</button></div></form>`);
    const t = $('#tp-t', m), cv = $('#tpCov', m);
    t.oninput = () => { if (!cover) cv.firstElementChild.outerHTML = coverHTML({ id: t.value || 'preview', title: t.value || '?' }); };
    cv.onclick = async () => { try { const id = await pickImage(); if (!id) return; cover = id; cv.firstElementChild.outerHTML = `<img class="cov" data-img="${id}" alt="">`; hydrate(cv); } catch { toast('Could not read that picture.', 'bad'); } };
    $('form', m).onsubmit = e => {
      e.preventDefault();
      if (!t.value.trim()) { $('.err', m).textContent = 'Give the topic a title.'; replay(m, 'shake'); return sfx.bad(); }
      const tp = newTopic(t.value, cover); newNote(tp.id, tp.title, '');
      closeModal(); sfx.drop();
      if (cur === 'notes' && !view) { go('notes'); $('.nf-card')?.classList.add('fresh'); }
    };
  };
  const openTopic = tp => { view = { topic: tp.id, note: tp.last }; go('notes'); };
  ACT.topicOpen = el => { const tp = topicOf(el.dataset.id); if (tp) openTopic(tp); };
  ACT.topicMenu = el => {
    const tp = topicOf(el.dataset.id); if (!tp) return;
    const p = popover(el, `<div class="menu"><button data-k="ren">${icon('note', 16)} Rename</button><button data-k="cov">${icon('image', 16)} ${tp.cover ? 'Change' : 'Add'} cover photo</button>${tp.cover ? `<button data-k="nocov">${icon('x', 16)} Remove cover</button>` : ''}
      ${desk ? `<button data-k="dir">${icon('folder', 16)} Show files</button>` : ''}<button data-k="del" class="bad">${icon('trash', 16)} Delete topic</button></div>`);
    if (!p) return;
    p.onclick = async e => {
      const k = e.target.closest('button')?.dataset.k; if (!k) return; p.remove();
      if (k === 'ren') return renameTopic(tp);
      if (k === 'cov') { try { const id = await pickImage(); if (id) { tp.cover = id; save(); go('notes'); } } catch { toast('Could not read that picture.', 'bad'); } }
      if (k === 'nocov') { tp.cover = null; save(); go('notes'); }
      if (k === 'dir') { const n = S.notes.find(x => x.topic === tp.id && x.file); desk.reveal(n ? n.file : '').catch(() => {}); }
      if (k === 'del') delTopic(tp);
    };
  };
  function renameTopic(tp) {
    const m = modal(`<h2>Rename topic</h2><form novalidate><label class="f" for="rt">Title</label><input class="inp" id="rt" maxlength="80" value="${esc(tp.title)}" autofocus><div class="foot"><button class="btn">Rename</button></div></form>`);
    $('#rt', m).select();
    $('form', m).onsubmit = e => { e.preventDefault(); const v = $('#rt', m).value.trim(); if (v) { tp.title = v.slice(0, 80); delete tp.inbox; save(); S.notes.filter(n => n.topic === tp.id).forEach(n => mirror(n)); } closeModal(); go('notes'); };
  }
  function delTopic(tp) {
    const ns = S.notes.filter(n => n.topic === tp.id), i = S.topics.indexOf(tp);
    S.topics.splice(i, 1); S.notes = S.notes.filter(n => n.topic !== tp.id); ns.forEach(unmirror);
    if (view?.topic === tp.id) view = null;
    save(); sfx.trash(); go('notes');
    toast(`Deleted “${tp.title}” and ${ns.length} note${ns.length === 1 ? '' : 's'}.`, '', ['Undo', () => { S.topics.splice(i, 0, tp); S.notes.push(...ns); ns.forEach(n => mirror(n)); save(); if (cur === 'notes') go('notes'); }]);
  }

  // ---------- inside a topic ----------
  const STYLES = [['p', 'Normal text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['quote', 'Quote'], ['code', 'Code block']];
  const FONTS = [['', 'Theme font', ''], ['sans', 'Clean sans', "'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif"], ['serif', 'Book serif', "'Sitka Text','Iowan Old Style',Georgia,serif"],
    ['mono', 'Typewriter', "'Cascadia Mono',Consolas,monospace"], ['hand', 'Handwriting', "'Caveat','Segoe Print',cursive", 'Caveat:wght@500;700'], ['round', 'Rounded', "'Nunito','Segoe UI',sans-serif", 'Nunito:wght@400;700'],
    ['slab', 'Slab serif', "'Roboto Slab',Rockwell,serif", 'Roboto+Slab:wght@400;700']];
  const PAPERS = [['plain', 'Plain'], ['lined', 'Lined'], ['dotted', 'Dotted'], ['grid', 'Grid'], ['legal', 'Legal pad']];
  const HRS = [['line', 'Line'], ['dashed', 'Dashed'], ['dotted', 'Dots'], ['wave', 'Wave'], ['stars', 'Stars'], ['double', 'Double'], ['fade', 'Fade']];
  const WIDTHS = [['read', 'Readable'], ['wide', 'Wide'], ['full', 'Full width']];
  const STARTS = {
    Cornell: '## Cues\n- Key question?\n\n## Notes\n- **Key term** is …\n\n## Summary\nTwo sentences in your own words.',
    Feynman: '## Explain it simply\nAs if to a younger student.\n\n## Where I got stuck\n- \n\n## Simpler, second try\n',
    'Lab report': '## Question\n\n## Method\n1. \n\n## Results\n| Trial | Value |\n| --- | --- |\n| 1 |  |\n\n## Conclusion\n',
    Lecture: '> [!info] Lecture\n> Course, chapter, speaker\n\n## Key points\n- \n\n## Questions to ask\n- [ ] ',
    Vocabulary: '| Word | Meaning | Example |\n| --- | --- | --- |\n| **term** |  |  |',
  };
  const COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#64748b', '#111827'];
  const HLS = ['#fef08a', '#fde68a', '#fecaca', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8', '#e5e7eb'];
  const CALLOUTS = [['note', 'Note'], ['tip', 'Tip'], ['info', 'Info'], ['success', 'Success'], ['question', 'Question'], ['warning', 'Warning'], ['danger', 'Danger'], ['example', 'Example'], ['quote', 'Quote'], ['todo', 'To-do'], ['summary', 'Summary']];
  const SNIP = {
    chart: '```chart\ntype: bar\nMonday: 3\nTuesday: 5\nWednesday: 2\n```',
    mermaid: '```mermaid\nflowchart LR\n  A[Start] --> B{Question}\n  B -- yes --> C[Answer]\n  B -- no --> D[Look it up]\n```',
    math: '$$\nE = mc^2\n$$', code: '```python\nprint("hello")\n```',
  };

  const fontFam = n => (n.font?.startsWith('c:') ? `'TempoFont-${n.font.slice(2)}'` : FONTS.find(f => f[0] === n.font)?.[2] || '');
  const useFont = k => { const f = FONTS.find(x => x[0] === k); if (f?.[3]) loadSheet(`https://fonts.googleapis.com/css2?family=${f[3]}&display=swap`).catch(() => {}); };
  async function fontsInit() {
    if (fontsOn) return; fontsOn = true;
    for (const f of S.fonts) { try { const b = await idb.get('font:' + f.id); if (b) { const ff = new FontFace('TempoFont-' + f.id, await b.arrayBuffer()); await ff.load(); document.fonts.add(ff); } } catch { /* a broken font file just falls back */ } }
  }
  const look = n => `paper-${n.paper || 'plain'} hr-${n.hr || 'line'} w-${n.width || 'wide'}${recall ? ' recall' : ''}`;
  const docStyle = n => `${fontFam(n) ? `font-family:${fontFam(n)};` : ''}font-size:${n.size || 16}px`;

  function tree(tid, pid, d, curId) {
    const ks = kids(tid, pid);
    return ks.length ? `<ul class="${d ? 'sub' : 'ns-tree'}">${ks.map(x => {
      const sub = kids(tid, x.id).length, open = !x.fold;
      return `<li><div class="ti ${x.id === curId ? 'on' : ''}" style="--d:${d}">${sub ? `<button class="tw" data-act="noteFold" data-id="${x.id}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(x.title)}">${icon(open ? 'chevD' : 'chevR', 14, 2.2)}</button>` : '<span class="tw"></span>'}
        <button class="tl" data-act="noteOpen" data-id="${x.id}" ${x.id === curId ? 'aria-current="page"' : ''}>${esc(x.title || 'Untitled')}</button>
        <button class="ta" data-act="noteAdd" data-parent="${x.id}" title="Add a sub-note" aria-label="Add a sub-note to ${esc(x.title)}">${icon('plus', 14, 2.2)}</button><button class="ta" data-act="noteMenu" data-id="${x.id}" aria-label="Options for ${esc(x.title)}">${icon('more', 14, 2.6)}</button></div>
        ${sub && open ? tree(tid, x.id, d + 1, curId) : ''}</li>`;
    }).join('')}</ul>` : d ? '' : '<p class="muted ns-none">No notes yet.</p>';
  }
  const TB = (act, inner, label, extra = '') => `<button class="tb" data-act="${act}" ${extra} title="${label}" aria-label="${label}">${inner}</button>`;
  function toolbar(n) {
    const g = s => `<span class="tg">${s}</span>`;
    return `<div class="ns-tools" role="toolbar" aria-label="Formatting">
      ${g(TB('edUndo', icon('undo', 17), 'Undo (Ctrl Z)') + TB('edRedo', icon('redo', 17), 'Redo (Ctrl Y)'))}
      ${g(`<label class="sr" for="tbStyle">Text style</label><select id="tbStyle" class="tsel" title="Text style">${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`)}
      ${g(`<label class="sr" for="tbFont">Font</label><select id="tbFont" class="tsel" title="Font">${FONTS.map(([v, l]) => `<option value="${v}" ${(n.font || '') === v ? 'selected' : ''}>${l}</option>`).join('')}${S.fonts.map(f => `<option value="c:${f.id}" ${n.font === 'c:' + f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__add">Add your own font…</option></select>
        ${TB('edSize', '−', 'Smaller text', 'data-d="-1"')}<span class="tsz" id="tbSize" aria-label="Text size">${n.size || 16}</span>${TB('edSize', '+', 'Bigger text', 'data-d="1"')}`)}
      ${g(TB('edWrap', '<b>B</b>', 'Bold (Ctrl B)', 'data-w="**"') + TB('edWrap', '<i>I</i>', 'Italic (Ctrl I)', 'data-w="*"') + TB('edWrap', '<u>U</u>', 'Underline (Ctrl U)', 'data-w="<u>" data-w2="</u>"') + TB('edWrap', '<s>S</s>', 'Strikethrough', 'data-w="~~"') + TB('edWrap', '<span class="tmk">H</span>', 'Highlight', 'data-w="=="') + TB('edWrap', icon('code', 17), 'Inline code', 'data-w="`"'))}
      ${g(TB('edColor', '<span class="tca">A<i></i></span>', 'Text colour', 'data-k="color"') + TB('edColor', icon('palette', 17), 'Highlight colour', 'data-k="hl"'))}
      ${g(TB('edLine', icon('list', 17), 'Bulleted list', 'data-p="- "') + TB('edLine', icon('olist', 17), 'Numbered list', 'data-p="1. "') + TB('edLine', icon('checksq', 17), 'Checklist', 'data-p="- [ ] "') + TB('edLine', icon('quote', 17), 'Quote', 'data-p="> "'))}
      ${g(TB('edLink', icon('link', 17), 'Link to a note [[ ]]') + TB('edImage', icon('image', 17), 'Insert picture') + TB('edTable', icon('table', 17), 'Insert table') + TB('edInsert', icon('chart', 17), 'Insert chart', 'data-k="chart"')
        + TB('edInsert', icon('flow', 17), 'Insert diagram', 'data-k="mermaid"') + TB('edInsert', icon('sigma', 17), 'Insert math', 'data-k="math"') + TB('edInsert', '<span class="tcb">{ }</span>', 'Insert code block', 'data-k="code"')
        + TB('edCallout', icon('callout', 17), 'Insert callout') + TB('edDivider', icon('divider', 17), 'Insert divider') + TB('edFoot', icon('footnote', 17), 'Insert footnote'))}
      ${g(TB('edLook', icon('layout', 17) + '<span class="tbl">Template</span>', 'Template, paper and dividers'))}
      ${g(TB('edRecall', icon(recall ? 'eye' : 'eyeoff', 17) + `<span class="tbl" id="tbRecall">Recall</span>`, 'Recall mode: hide key terms and test yourself', `aria-pressed="${recall}"`) + TB('edStudy', icon('learn', 17) + '<span class="tbl">Study</span>', 'Study this note'))}
      ${g(`<button class="tb tb-todo" data-act="edTodo" title="Pick checkpoints from this note and push them to your to-do list">${icon('todo', 17)}<span class="tbl">Add to-do list</span></button>`)}
    </div>`;
  }
  ACT.edTodo = () => { if (doc?.n) checkpoints(doc.n); };
  const QUICK = [['sum', 'Summarise'], ['eli', 'Explain simply'], ['cards', 'Make flashcards', 1], ['todo', 'Add to-do list', 1], ['subs', 'Suggest sub-notes'], ['quiz', 'Quiz me', 1]];
  function aiPanel(tp, n) {
    const ready = aiReady(aiProv());
    return `<div class="ai-h"><button class="icb" data-act="aiToggle" aria-label="Hide the assistant" title="Hide">${icon('chevR', 20, 2.2)}</button><span class="ai-e">${ember(30)}</span><div><b>Assistant</b><small class="muted">${n ? 'Reading “' + esc(n.title) + '”' : 'Ask about ' + esc(tp.title)}</small></div></div>
      <div class="ai-quick">${QUICK.map(([k, l, off]) => `<button class="nf-chip" data-act="aiQuick" data-k="${k}" ${n ? '' : 'disabled'} ${!ready && !off ? 'disabled title="Sign in to the AI tutor first"' : ''}>${l}</button>`).join('')}</div>
      <div class="ai-msgs" id="aiMsgs" aria-live="polite"></div>
      ${ready ? `<form class="ai-comp" id="aiComp"><label class="sr" for="aiIn">Ask the assistant</label><textarea id="aiIn" rows="1" placeholder="Ask about this note…"></textarea><button class="btn sm" aria-label="Send">${icon('send', 16)}</button></form>`
        : `<div class="ai-off"><p class="muted">Sign in to the AI tutor to chat about your notes. Flashcards and to-dos work without it.</p><button class="btn sm" data-act="aiSignIn">Sign in</button></div>`}`;
  }
  function paintMsgs() {
    const box = $('#aiMsgs'), tp = topicOf(view?.topic); if (!box || !tp) return;
    box.innerHTML = (tp.chat || []).map((m, i) => m.role === 'assistant'
      ? `<div class="am a"><div class="mdv">${L.md(m.content)}</div>${doc ? `<button class="ai-ins" data-act="aiInsert" data-i="${i}">${icon('down', 14)} Add to note</button>` : ''}</div>` : `<div class="am u">${esc(m.content)}</div>`).join('')
      || `<div class="ai-empty muted">Ask me to summarise, explain, quiz you or split this note into parts. I read the open note.</div>`;
    if (aiBusy) box.insertAdjacentHTML('beforeend', '<div class="am a"><span class="typing"><i></i><i></i><i></i></span></div>');
    hydrate(box); box.scrollTop = box.scrollHeight;
  }

  function sub(root) {
    const tp = topicOf(view.topic);
    if (!tp) { view = null; return front(root); }
    let n = noteOf(view.note);
    if (!n || n.topic !== tp.id) n = kids(tp.id)[0] || null;
    view.note = n?.id; tp.last = n?.id;
    $('#app').classList.add('notesfull'); root.classList.add('nfull');
    if (n?.font) useFont(n.font);
    root.innerHTML = `<div class="nsub ${aiOpen() ? 'ai-open' : ''}">
      <header class="ns-top"><div class="ns-bar"><button class="icb" data-act="notesHome" aria-label="Back to all topics" title="All topics">${icon('left')}</button>
        <nav class="crumbs" aria-label="Breadcrumb"><button data-act="notesHome">Notes</button><i aria-hidden="true">/</i><span>${esc(tp.title)}</span>${n ? `<i aria-hidden="true">/</i><b id="crumbN">${esc(n.title)}</b>` : ''}</nav><span class="right"></span>
        ${n ? `<span class="ns-save muted" id="nsSave" role="status">${desk ? 'Saved' : 'Saved in Tempo'}</span><button class="ns-file" data-act="noteFile" title="File type and location">.${n.ext === 'md' ? 'md' : 'txt'} ${icon('chevD', 13, 2.2)}</button>` : ''}
        <button class="btn sm ghost" data-act="noteGraph">${icon('graph', 15)} Graph</button>
        <button class="btn sm ${aiOpen() ? '' : 'ghost'} ns-aib" data-act="aiToggle" aria-pressed="${aiOpen()}">${icon('spark', 15)} Assistant</button></div>
        ${n ? toolbar(n) : ''}</header>
      <aside class="ns-side" aria-label="Notes in ${esc(tp.title)}"><div class="ns-tp">${coverHTML(tp)}<b>${esc(tp.title)}</b></div>
        <button class="btn sm ns-addb" data-act="noteAdd">${icon('plus', 16)} Add note</button>
        <nav class="ns-scroll" aria-label="Notes">${tree(tp.id, null, 0, n?.id)}</nav></aside>
      <main class="ns-main" id="nsMain">${n ? `<article class="doc ${look(n)}" id="doc" style="${docStyle(n)}"><input class="doc-title" id="docTitle" value="${esc(n.title)}" aria-label="Note title" maxlength="80" spellcheck="false">
        <div class="doc-body" id="docBody"></div><div class="doc-end" id="docEnd" title="Click to keep writing"></div><section class="doc-back" id="docBack"></section></article>`
        : `<div class="empty ns-empty">${ember(80)}<h2>An empty topic</h2><p>Add the first note, or ask the assistant to plan the parts.</p><button class="btn" data-act="noteAdd">${icon('plus', 16)} Add the first note</button></div>`}</main>
      <aside class="ns-ai" aria-label="Assistant">${aiPanel(tp, n)}</aside></div>`;
    hydrate(root); paintMsgs();
    const comp = $('#aiComp', root);
    if (comp) {
      const t = $('#aiIn', comp);
      comp.onsubmit = e => { e.preventDefault(); const v = t.value.trim(); if (v) { t.value = ''; aiSend(v); } };
      t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); comp.requestSubmit(); } };
      t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; };
    }
    if (n) openDoc(n);
  }

  // ---------- the writing surface: blocks render until clicked, then show their markdown ----------
  function openDoc(n) {
    doc = { n, bl: [], total: 0, ed: null, hist: [], fut: [] };
    paintDoc();
    const tools = $('.ns-tools'), ti = $('#docTitle'), main = $('#nsMain');
    tools.onpointerdown = e => { if (e.target.closest('button')) e.preventDefault(); }; // keep the caret in the block being edited
    $('#tbStyle').onchange = e => applyStyle(e.target.value);
    $('#tbFont').onchange = e => setFont(e.target.value);
    ti.oninput = () => {
      n.title = ti.value.trim() || 'Untitled'; touch(n); below(n).forEach(d => mirror(d));
      const tl = $(`.tl[data-id="${n.id}"]`); if (tl) tl.textContent = n.title; const c = $('#crumbN'); if (c) c.textContent = n.title;
    };
    ti.onkeydown = e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); doc.bl.length ? editBlock(0, 0) : newBlockAt(null); } };
    $('#docBody').onclick = onDocClick;
    // A press on another block blurs the open one first; the click then commits and opens the target with the line mapping.
    $('#docBody').onpointerdown = e => { doc.press = !e.target.closest('.blk.editing'); };
    $('#docEnd').onclick = () => { if (recall) return; if (doc.ed) commit(); doc.bl.length ? editBlock(doc.bl.length - 1, 'end') : newBlockAt(null); };
    main.onclick = e => { if (doc?.ed && e.target.isConnected && !e.target.closest('.blk.editing,#docBody,#docEnd,.doc-title')) commit(); }; // a block just swapped for its editor is detached: not an outside click
    main.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); main.classList.add('drop'); } };
    main.ondragleave = e => { if (!main.contains(e.relatedTarget)) main.classList.remove('drop'); };
    main.ondrop = e => { e.preventDefault(); main.classList.remove('drop'); addPics(e.dataTransfer.files); };
    if (!n.body.trim() && n.title === 'Untitled') ti.select();
  }
  function paintDoc() {
    const n = doc.n, body = $('#docBody'); if (!body) return;
    doc.bl = L.blocks(n.body); doc.total = n.body.split('\n').length;
    const defs = L.footDefs(n.body), fns = [];
    body.innerHTML = doc.bl.map((b, i) => `<div class="blk" data-i="${i}">${L.md(b.t, { defs, fns })}</div>`).join('')
      || '<div class="blk ph" data-i="-1"><p>Start writing. Type # for a heading, - for a list, **bold** for a key term, [[ to link a note.</p></div>';
    if (fns.length) body.insertAdjacentHTML('beforeend', `<section class="fns"><ol>${fns.map(f => `<li>${f}</li>`).join('')}</ol></section>`);
    hydrate(body); enhance(body); backlinks(); recallCount();
  }
  function backlinks() {
    const n = doc.n, el = $('#docBack'); if (!el) return;
    const t = n.title.toLowerCase(), back = S.notes.filter(x => x !== n && L.links(x.body).some(l => l.toLowerCase() === t));
    el.innerHTML = back.length ? `<h4>Linked here</h4><div class="row">${back.map(x => `<button class="nf-chip" data-act="noteOpen" data-id="${x.id}">${icon('link', 13)} ${esc(x.title)}</button>`).join('')}</div>` : '';
  }
  function onDocClick(e) {
    doc.press = false;
    const t = e.target, blk = t.closest('.blk');
    if (!blk || blk.classList.contains('editing')) return;
    const cb = t.closest('input[type=checkbox][data-line]');
    if (cb) return toggleTask(blk, +cb.dataset.line);
    if (recall) { const h = t.closest('b,mark,.math,:not(pre)>code,.tag'); if (h) { h.classList.toggle('peek'); sfx.tap(); recallCount(); } return; }
    if (t.closest('a,summary,.fn')) return;
    const i = +blk.dataset.i;
    if (i < 0) return newBlockAt(null);
    editStale(doc.bl[i].s, caretGuess(blk, e, doc.bl[i].t));
  }
  // Block indexes come from the last paint; committing the open block can shift later lines, so map the old start line first.
  function editStale(s0, pos) {
    let s = s0;
    if (doc.ed) { const e = doc.ed, before = doc.total; commit(); if (s0 > e.s) s += doc.total - before; }
    const i = doc.bl.findIndex(b => b.s === s);
    if (i >= 0) editBlock(i, pos);
  }
  // Where the click landed in the rendered text, found again in the raw markdown by matching the text just before it.
  function caretGuess(blk, e, raw) {
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!r || !blk.contains(r.startContainer)) return 'end';
    const pre = document.createRange(); pre.setStart(blk, 0); pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString(), ratio = before.length / Math.max(1, blk.textContent.length);
    if (!before) return 0;
    for (const k of [16, 8, 4, 2, 1]) {
      const tail = before.slice(-k); let best = -1, bd = Infinity;
      for (let i = raw.indexOf(tail); i >= 0; i = raw.indexOf(tail, i + 1)) { const d = Math.abs(i / Math.max(1, raw.length) - ratio); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) return best + tail.length;
    }
    return 'end';
  }
  function editBlock(i, pos = 'end') { const b = doc.bl[i], el = $(`#docBody .blk[data-i="${i}"]`); if (b && el) mount(el, b.s, b.e - b.s, b.t, pos); }
  function mount(el, s, cnt, text, pos) {
    const t = document.createElement('textarea'), w = document.createElement('div');
    t.className = 'blk-ed'; t.value = text; t.rows = 1; t.setAttribute('aria-label', 'Edit this part of the note (markdown)');
    w.className = 'blk editing'; w.append(t); el.replaceWith(w);
    doc.ed = { s, cnt, ta: t, body0: doc.n.body, text0: text };
    grow(t); t.focus({ preventScroll: true });
    const p = pos === 'end' ? text.length : L.clamp(pos, 0, text.length); t.setSelectionRange(p, p);
    const r = t.getBoundingClientRect(); if (r.bottom > innerHeight - 40 || r.top < 120) t.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    t.oninput = onEdInput; t.onkeydown = onEdKey; t.onblur = onEdBlur; t.onkeyup = t.onmouseup = syncStyle; t.onpaste = onEdPaste;
    syncStyle();
  }
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  function onEdInput() {
    const e = doc.ed, t = e.ta, lines = doc.n.body.split('\n'), nl = t.value.split('\n');
    lines.splice(e.s, e.cnt, ...nl); e.cnt = nl.length; doc.n.body = lines.join('\n'); grow(t); touch(doc.n); wlCheck();
  }
  const onEdBlur = () => {
    const t = doc?.ed?.ta;
    setTimeout(() => {
      if (doc?.press) { doc.press = false; return; }
      if (doc?.ed?.ta === t && document.activeElement !== t && !document.activeElement?.closest('.ns-tools,.pop,.scrim,.wl-pop')) commit();
    }, 0);
  };
  function commit() {
    const e = doc?.ed; if (!e) return null;
    doc.ed = null; wlClose();
    const n = doc.n; let s = e.s, after = e.s + e.cnt;
    if (!e.ta.value.trim()) { // an emptied block disappears with one of its blank separators
      const lines = n.body.split('\n'); lines.splice(s, e.cnt);
      if (s > 0 && !lines[s - 1]?.trim() && (s >= lines.length || !lines[s]?.trim())) { lines.splice(s - 1, 1); s--; }
      n.body = lines.join('\n'); after = s;
    }
    n.body = n.body.replace(/\s+$/, '');
    if (n.body !== e.body0) { pushHist(e.body0); touch(n); }
    paintDoc();
    return { s, after };
  }
  function newBlockAt(line) {
    const n = doc.n; let lines = n.body.split('\n');
    if (!n.body.trim()) { lines = ['']; line = 0; }
    else if (line == null || line >= lines.length) { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('', ''); line = lines.length - 1; }
    else { lines.splice(line, 0, '', ''); line += 1; }
    const body0 = n.body.replace(/\s+$/, '');
    n.body = lines.join('\n'); paintDoc();
    $('#docBody .blk.ph')?.remove();
    const prev = [...doc.bl].reverse().find(b => b.e <= line), el = document.createElement('div'), anchor = prev && $(`#docBody .blk[data-i="${doc.bl.indexOf(prev)}"]`);
    anchor ? anchor.after(el) : $('#docBody').prepend(el);
    mount(el, line, 1, '', 0);
    doc.ed.body0 = body0;
  }
  const fenceOpen = v => (v.match(/^\s*(```|~~~)/gm) || []).length % 2 === 1 || (v.match(/^\s*\$\$\s*$/gm) || []).length % 2 === 1;
  function onEdKey(ev) {
    const t = ev.target, v = t.value, a = t.selectionStart, b = t.selectionEnd, mod = ev.ctrlKey || ev.metaKey;
    if (wl && wlKey(ev)) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); commit(); return; }
    if (mod && !ev.shiftKey && !ev.altKey && /^[biu]$/i.test(ev.key)) { ev.preventDefault(); const k = ev.key.toLowerCase(); return k === 'u' ? wrap('<u>', '</u>') : wrap(k === 'b' ? '**' : '*'); }
    if (ev.key === 'ArrowUp' && a === b && !v.slice(0, a).includes('\n')) {
      const prev = [...doc.bl].reverse().find(x => x.e <= doc.ed.s); if (!prev) return;
      ev.preventDefault(); commit(); return editBlock(doc.bl.findIndex(x => x.s === prev.s), 'end');
    }
    if (ev.key === 'ArrowDown' && a === b && !v.slice(b).includes('\n')) {
      if (!doc.n.body.split('\n').slice(doc.ed.s + doc.ed.cnt).some(l => l.trim())) return;
      ev.preventDefault(); const r = commit(), next = doc.bl.findIndex(x => x.s >= r.after); if (next >= 0) editBlock(next, 0); return;
    }
    if (ev.key === 'Backspace' && a === 0 && b === 0) {
      const prev = [...doc.bl].reverse().find(x => x.e <= doc.ed.s); if (!prev) return;
      ev.preventDefault();
      const e = doc.ed, lines = doc.n.body.split('\n');
      lines.splice(prev.e, e.s - prev.e); // drop the blank lines between, so the two blocks become one
      doc.n.body = lines.join('\n').replace(/\s+$/, ''); doc.ed = null; pushHist(e.body0); touch(doc.n); paintDoc();
      return editBlock(doc.bl.findIndex(x => x.s === prev.s), v.trim() ? prev.t.length + 1 : 'end');
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const ls = v.lastIndexOf('\n', a - 1) + 1;
      if (!ev.shiftKey) { t.setSelectionRange(ls, ls); document.execCommand('insertText', false, '\t'); t.setSelectionRange(a + 1, b + 1); }
      else { const k = v[ls] === '\t' ? 1 : v.startsWith('    ', ls) ? 4 : 0; if (k) { t.setSelectionRange(ls, ls + k); put(''); t.setSelectionRange(Math.max(ls, a - k), Math.max(ls, b - k)); } }
      return;
    }
    if (ev.key === 'Enter' && !ev.shiftKey && !mod && a === b) {
      const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', a), end = le < 0 ? v.length : le, line = v.slice(ls, end);
      const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/);
      if (m && a === end && !fenceOpen(v)) { // lists continue themselves; an empty item ends the list
        ev.preventDefault();
        if (line.length === m[0].length) { t.setSelectionRange(ls, end); put(''); return; }
        document.execCommand('insertText', false, '\n' + m[1] + (m[3] ? `${+m[3] + 1}${m[4]}` : m[2]) + ' ' + (m[5] ? '[ ] ' : ''));
        return;
      }
      if (a === v.length && v.endsWith('\n') && !fenceOpen(v)) { // Enter on an empty last line starts a new block
        ev.preventDefault(); t.value = v.slice(0, -1); onEdInput(); const r = commit(); newBlockAt(r.after); return;
      }
    }
  }
  function onEdPaste(e) { const fs = [...(e.clipboardData?.files || [])]; if (fs.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addPics(fs); } }
  function toggleTask(blk, local) {
    let s = doc.bl[+blk.dataset.i].s;
    if (doc.ed) { const e = doc.ed, before = doc.total, s0 = s; commit(); if (s0 > e.s) s += doc.total - before; }
    const lines = doc.n.body.split('\n'), at = s + local;
    if (!/\[[ xX]\]/.test(lines[at] || '')) return paintDoc();
    pushHist(doc.n.body);
    const on = /\[ \]/.test(lines[at]); lines[at] = lines[at].replace(/\[[ xX]\]/, on ? '[x]' : '[ ]');
    doc.n.body = lines.join('\n'); touch(doc.n); paintDoc(); on ? sfx.cross() : sfx.tap();
  }
  const pushHist = b => { doc.hist.push(b); if (doc.hist.length > 100) doc.hist.shift(); doc.fut = []; };
  function undoDoc(redo) {
    const from = redo ? doc.fut : doc.hist, to = redo ? doc.hist : doc.fut;
    if (doc.ed) commit();
    if (!from.length) return toast(redo ? 'Nothing to redo.' : 'Nothing to undo.');
    to.push(doc.n.body); doc.n.body = from.pop(); touch(doc.n); paintDoc(); sfx.tap();
  }
  // Inside a block the textarea's own undo runs; otherwise whole-note snapshots step back and forth.
  ACT.edUndo = () => { const e = doc?.ed; if (e && e.ta.value !== e.text0) { e.ta.focus(); document.execCommand('undo'); } else if (doc) undoDoc(false); };
  ACT.edRedo = () => { const e = doc?.ed; if (e) { e.ta.focus(); document.execCommand('redo'); } else if (doc) undoDoc(true); };

  // ---------- toolbar helpers: they act on the block being edited, or start a new block at the end ----------
  const ed = () => { if (!doc) return null; if (!doc.ed) newBlockAt(null); doc.ed.ta.focus(); return doc.ed.ta; };
  const put = text => document.execCommand(text ? 'insertText' : 'delete', false, text); // keeps the textarea's undo history; an empty insert would be a no-op
  function wrap(pre, post = pre) {
    const t = ed(); if (!t) return;
    const a = t.selectionStart, b = t.selectionEnd, v = t.value, sel = v.slice(a, b);
    if (v.slice(a - pre.length, a) === pre && v.slice(b, b + post.length) === post) { t.setSelectionRange(a - pre.length, b + post.length); put(sel); t.setSelectionRange(a - pre.length, b - pre.length); return; }
    put(pre + sel + post); t.setSelectionRange(a + pre.length, a + pre.length + sel.length);
  }
  const span = t => { const v = t.value, a = v.lastIndexOf('\n', t.selectionStart - 1) + 1, e = v.indexOf('\n', t.selectionEnd); return [a, e < 0 ? v.length : e]; };
  function eachLine(fn) {
    const t = ed(); if (!t) return;
    const [a, b] = span(t), out = t.value.slice(a, b).split('\n').map(fn).join('\n');
    t.setSelectionRange(a, b); put(out); t.setSelectionRange(a, a + out.length); syncStyle();
  }
  const PRE = /^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;
  ACT.edWrap = el => wrap(el.dataset.w, el.dataset.w2 || el.dataset.w);
  ACT.edLine = el => {
    const p = el.dataset.p, t = ed(); if (!t) return;
    const [a, b] = span(t), kind = s => (s || '').trim().replace(/^\d+[.)]$/, '1.').replace(/\[[xX]\]/, '[ ]');
    const all = t.value.slice(a, b).split('\n').every(l => kind(l.match(PRE)[2]) === kind(p));
    let k = 0;
    eachLine(l => { const m = l.match(PRE), rest = l.slice(m[0].length); return m[1] + (all ? '' : p === '1. ' ? `${++k}. ` : p) + rest; });
  };
  function applyStyle(v) {
    if (v === 'code') { const t = ed(); if (!t) return; const [a, b] = span(t); t.setSelectionRange(a, b); put('```\n' + t.value.slice(a, b) + '\n```'); }
    else eachLine(l => { const m = l.match(PRE), rest = l.slice(m[0].length); return m[1] + (v === 'p' ? '' : v === 'quote' ? '> ' : '#'.repeat(+v[1]) + ' ') + rest; });
    doc?.ed?.ta.focus();
  }
  function syncStyle() {
    const sel = $('#tbStyle'), t = doc?.ed?.ta; if (!sel || !t) return;
    const [a] = span(t), e = t.value.indexOf('\n', a), line = t.value.slice(a, e < 0 ? undefined : e), h = line.match(/^(#{1,6})\s/);
    sel.value = h ? 'h' + h[1].length : /^>\s?/.test(line) ? 'quote' : /^\s*(```|~~~)/.test(line) ? 'code' : 'p';
  }
  function insBlock(text) {
    const t = ed(); if (!t) return;
    const v = t.value, pre = v.slice(0, t.selectionStart), post = v.slice(t.selectionEnd);
    const lead = !pre || pre.endsWith('\n\n') ? '' : pre.endsWith('\n') ? '\n' : '\n\n', tail = !post || post.startsWith('\n\n') ? '' : post.startsWith('\n') ? '\n' : '\n\n';
    put(lead + text + tail);
  }
  ACT.edInsert = el => insBlock(SNIP[el.dataset.k]);
  ACT.edFoot = () => { const t = ed(); if (!t) return; put('^[]'); t.setSelectionRange(t.selectionStart - 1, t.selectionStart - 1); };
  ACT.edSize = el => { const n = doc?.n; if (!n) return; n.size = L.clamp((n.size || 16) + +el.dataset.d, 12, 26); save(); $('#doc').style.fontSize = n.size + 'px'; $('#tbSize').textContent = n.size; };
  async function setFont(v) {
    const n = doc?.n, sel = $('#tbFont'); if (!n) return;
    if (v === '__add') {
      sel.value = n.font || '';
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.ttf,.otf,.woff,.woff2' });
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        if (!/\.(ttf|otf|woff2?)$/i.test(f.name) || f.size > 10e6) return toast('Pick a .ttf, .otf, .woff or .woff2 file under 10 MB.', 'bad');
        const id = uid();
        try { const ff = new FontFace('TempoFont-' + id, await f.arrayBuffer()); await ff.load(); document.fonts.add(ff); await idb.put('font:' + id, f); }
        catch { return toast('That file is not a font Tempo can read.', 'bad'); }
        S.fonts.push({ id, name: f.name.replace(/\.\w+$/, '').slice(0, 40) }); n.font = 'c:' + id; save(); sfx.ok(); toast(`Font “${f.name}” added. Every note can use it now.`); go('notes');
      };
      return inp.click();
    }
    n.font = v; useFont(v); save(); $('#doc').style.fontFamily = fontFam(n); doc.ed?.ta.focus();
  }
  ACT.edColor = el => {
    const hl = el.dataset.k === 'hl', list = hl ? HLS : COLORS;
    const p = popover(el, `<h3 style="margin-bottom:10px">${hl ? 'Highlight' : 'Text colour'}</h3><div class="swatches">${list.map(c => `<button data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
      <div class="row" style="margin-top:12px"><label class="f" for="cpk" style="margin:0">Custom</label><input type="color" id="cpk" value="${hl ? '#fef08a' : '#2563eb'}"><button class="btn sm ghost" data-c="" style="margin-left:auto">Remove colour</button></div>`);
    if (!p) return;
    const apply = c => {
      p.remove();
      if (!c) { const t = ed(); if (!t) return; const a = t.selectionStart, out = t.value.slice(a, t.selectionEnd).replace(/<span style="color:[^"]*">|<\/span>|<mark style="background:[^"]*">|<\/?mark>/g, ''); put(out); t.setSelectionRange(a, a + out.length); return; }
      if (!/^#[0-9a-f]{6}$/i.test(c)) return;
      hl ? wrap(`<mark style="background:${c}">`, '</mark>') : wrap(`<span style="color:${c}">`, '</span>');
    };
    p.onclick = e => { const b = e.target.closest('[data-c]'); if (b) apply(b.dataset.c); };
    $('#cpk', p).onchange = e => apply(e.target.value);
  };
  ACT.edTable = el => {
    const p = popover(el, `<h3 style="margin-bottom:10px">Table size <span class="muted" id="tsz">3 × 3</span></h3><div class="tgrid">${Array.from({ length: 48 }, (_, i) => `<button data-r="${Math.floor(i / 8) + 1}" data-c="${i % 8 + 1}" aria-label="${Math.floor(i / 8) + 1} rows, ${i % 8 + 1} columns"></button>`).join('')}</div>`);
    if (!p) return;
    p.onpointerover = e => { const b = e.target.closest('[data-r]'); if (!b) return; $('#tsz', p).textContent = `${b.dataset.r} × ${b.dataset.c}`; $$('.tgrid button', p).forEach(x => x.classList.toggle('on', +x.dataset.r <= +b.dataset.r && +x.dataset.c <= +b.dataset.c)); };
    p.onclick = e => {
      const b = e.target.closest('[data-r]'); if (!b) return; p.remove();
      const r = +b.dataset.r, c = +b.dataset.c, row = x => '| ' + Array.from({ length: c }, (_, i) => x(i)).join(' | ') + ' |';
      insBlock([row(i => `Column ${i + 1}`), row(() => '---'), ...Array.from({ length: Math.max(1, r - 1) }, () => row(() => ' '))].join('\n'));
    };
  };
  ACT.edCallout = el => {
    const p = popover(el, `<h3 style="margin-bottom:10px">Callout</h3><label class="row" style="margin-bottom:10px;gap:8px"><input type="checkbox" id="cfold"> Collapsible</label><div class="clist">${CALLOUTS.map(([k, l]) => `<button class="callout-pick" data-c="${k}">${l}</button>`).join('')}</div>`);
    if (!p) return;
    p.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; const f = $('#cfold', p).checked; p.remove(); insBlock(`> [!${b.dataset.c}]${f ? '-' : ''} ${CALLOUTS.find(c => c[0] === b.dataset.c)[1]}\n> `); };
  };
  ACT.edDivider = el => {
    const n = doc?.n; if (!n) return;
    const p = popover(el, `<h3 style="margin-bottom:10px">Divider style</h3><div class="hrlist">${HRS.map(([k, l]) => `<button class="hr-${k} ${(n.hr || 'line') === k ? 'on' : ''}" data-h="${k}"><hr><span>${l}</span></button>`).join('')}</div>`);
    if (!p) return;
    p.onclick = e => { const b = e.target.closest('[data-h]'); if (!b) return; p.remove(); n.hr = b.dataset.h; save(); $('#doc').className = 'doc ' + look(n); insBlock('---'); };
  };
  ACT.edLook = el => {
    const n = doc?.n; if (!n) return;
    const row = (k, list, curV) => `<div class="looks">${list.map(([v, l]) => `<button class="lk ${k}-${v} ${curV === v ? 'on' : ''}" data-k="${k}" data-v="${v}"><i></i><span>${l}</span></button>`).join('')}</div>`;
    const p = popover(el, `<h3>Paper</h3>${row('paper', PAPERS, n.paper || 'plain')}<h3>Dividers</h3>${row('hr', HRS, n.hr || 'line')}<h3>Width</h3>${row('w', WIDTHS, n.width || 'wide')}
      <h3>Start from</h3><div class="row" style="gap:6px">${Object.keys(STARTS).map(s => `<button class="nf-chip" data-s="${s}">${s}</button>`).join('')}</div>`);
    if (!p) return;
    p.classList.add('lookpop');
    p.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.s) { p.remove(); return insBlock(STARTS[b.dataset.s]); }
      n[{ paper: 'paper', hr: 'hr', w: 'width' }[b.dataset.k]] = b.dataset.v; save(); sfx.tap();
      $$(`[data-k="${b.dataset.k}"]`, p).forEach(x => x.classList.toggle('on', x === b));
      $('#doc').className = 'doc ' + look(n);
    };
  };
  ACT.edLink = el => {
    const tid = doc?.n.topic, list = [...S.notes].sort((a, b) => (b.topic === tid) - (a.topic === tid) || b.upd - a.upd);
    const p = popover(el, `<label class="f" for="lkq" style="margin-top:0">Link to a note</label><input class="inp" id="lkq" placeholder="Search or type a new title" autocomplete="off"><div class="lklist" id="lkl"></div>`);
    if (!p) return;
    const draw = () => {
      const raw = $('#lkq', p).value.trim(), f = raw.toLowerCase();
      $('#lkl', p).innerHTML = list.filter(n => n !== doc.n && n.title.toLowerCase().includes(f)).slice(0, 8).map(n => `<button data-t="${esc(n.title)}">${esc(n.title)}<small class="muted">${esc(topicOf(n.topic)?.title || '')}</small></button>`).join('')
        + (raw ? `<button data-t="${esc(raw)}">${icon('plus', 14)} New note “${esc(raw)}”</button>` : '');
    };
    const pick = t => { p.remove(); if (ed()) put(`[[${t}]]`); };
    $('#lkq', p).oninput = draw; $('#lkq', p).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const b = $('#lkl button', p); if (b) pick(b.dataset.t); } };
    $('#lkl', p).onclick = e => { const b = e.target.closest('[data-t]'); if (b) pick(b.dataset.t); };
    draw(); $('#lkq', p).focus();
  };
  async function addPics(files) {
    const pics = [...(files || [])].filter(f => f.type.startsWith('image/'));
    if (!pics.length) return toast('Only pictures can be dropped into a note.', 'bad');
    let out = '';
    for (const f of pics) {
      try {
        const c = await shrinkImage(f, 1600), png = f.type === 'image/png', blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', .88)), id = uid();
        await idb.put(id, blob); out += `![${(f.name || 'picture').replace(/\.\w+$/, '').replace(/[[\]()]/g, '').slice(0, 40)}](tempo-img:${id})\n`;
      } catch { toast(`Could not add ${f.name || 'that picture'}.`, 'bad'); }
    }
    if (out) { insBlock(out.trim()); sfx.drop(); }
  }
  ACT.edImage = () => { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true }); inp.onchange = () => addPics(inp.files); inp.click(); };

  // [[ autocomplete: typing "[[" lists matching notes under the block.
  function wlCheck() {
    const t = doc?.ed?.ta; if (!t) return;
    const m = t.value.slice(0, t.selectionStart).match(/\[\[([^\]\n|]{0,40})$/);
    if (!m) return wlClose();
    const f = m[1].toLowerCase(), items = S.notes.filter(n => n !== doc.n && n.title.toLowerCase().includes(f)).sort((a, b) => (b.topic === doc.n.topic) - (a.topic === doc.n.topic)).slice(0, 7);
    if (!items.length) return wlClose();
    wl = { items, at: wl?.at < items.length ? wl.at : 0, from: t.selectionStart - m[1].length };
    let box = $('.wl-pop');
    if (!box) { box = document.createElement('div'); box.className = 'wl-pop'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Notes to link'); box.onpointerdown = e => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) wlPick(+b.dataset.i); }; layer().append(box); }
    const r = t.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = Math.min(innerHeight - 260, r.bottom + 6) + 'px';
    box.innerHTML = items.map((n, i) => `<button role="option" aria-selected="${i === wl.at}" class="${i === wl.at ? 'on' : ''}" data-i="${i}">${esc(n.title)}<small class="muted">${esc(topicOf(n.topic)?.title || '')}</small></button>`).join('');
  }
  function wlKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); wl.at = (wl.at + (e.key === 'ArrowDown' ? 1 : -1) + wl.items.length) % wl.items.length; wlCheck(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); wlPick(wl.at); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); wlClose(); return true; }
    return false;
  }
  function wlPick(i) {
    const t = doc?.ed?.ta, n = wl?.items[i]; if (!t || !n) return;
    t.setSelectionRange(wl.from, t.selectionStart); put(n.title + (t.value.slice(t.selectionEnd, t.selectionEnd + 2) === ']]' ? '' : ']]')); wlClose();
  }
  const wlClose = () => { wl = null; $('.wl-pop')?.remove(); };

  // ---------- the surprise: recall mode hides key terms (bold, highlights, formulas) so the note becomes a self-test ----------
  ACT.edRecall = el => {
    if (doc?.ed) commit();
    recall = !recall; sfx.whoosh();
    $('#doc')?.classList.toggle('recall', recall);
    el.setAttribute('aria-pressed', recall); el.innerHTML = icon(recall ? 'eye' : 'eyeoff', 17) + '<span class="tbl" id="tbRecall">Recall</span>';
    $$('#docBody .peek').forEach(x => x.classList.remove('peek'));
    recallCount();
    if (recall) toast($$('#docBody b, #docBody mark, #docBody .math').length ? 'Key terms hidden. Say each one out loud, then click to check.' : 'Bold or highlight key terms first; recall mode hides them.');
  };
  function recallCount() {
    const el = $('#tbRecall'); if (!el) return;
    const all = $$('#docBody b, #docBody mark, #docBody .math, #docBody :not(pre)>code, #docBody .tag').length, seen = $$('#docBody .peek').length;
    el.textContent = recall && all ? `Recall ${seen}/${all}` : 'Recall';
    if (recall && all && seen === all) { celebrate('🧠', 'All recalled', 'Every key term checked'); addXp(5); }
  }
  ACT.edStudy = el => {
    const n = doc?.n; if (!n) return;
    const p = popover(el, `<div class="menu"><button data-k="quiz">❓ Quiz me on this note</button><button data-k="cards">🃏 Make flashcards</button><button data-k="map">${icon('tree', 16)} Mind map</button><button data-k="todo">${icon('todo', 16)} Add to-do list</button></div>`);
    if (!p) return;
    p.onclick = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; p.remove(); studyDo(k, n); };
  };
  function studyDo(k, n) {
    if (doc?.ed) commit();
    if (k === 'quiz') return go('quiz', { from: n });
    if (k === 'map') return mindmap(n.title, n.body);
    if (k === 'todo') return checkpoints(n);
    if (k === 'cards') return makeCards(n);
  }
  async function makeCards(n) {
    const tp = topicOf(n.topic), r = cardsFromNotes([n]);
    if (r.n) return toast(`${r.n} flashcard${r.n === 1 ? '' : 's'} added to the “${r.deck.name}” deck.`, '', ['Open', () => go('cards', { deck: r.deck.id })]);
    if (!aiReady(aiProv())) return toast('No key terms found. Bold a term in a sentence that defines it, like **osmosis** is …', 'bad');
    toast('Ember is writing flashcards…');
    try {
      const out = await askAI([{ role: 'user', content: `Write 6 flashcards from this note. Reply with ONLY a JSON array of {"q": question, "a": short answer}.\n\n${n.title}\n${n.body.slice(0, 8000)}` }], 'You write accurate study flashcards. Output valid JSON only.', aiProv());
      const list = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]').filter(c => c && typeof c.q === 'string' && typeof c.a === 'string').map(c => ({ q: c.q.slice(0, 300), a: c.a.slice(0, 200) }));
      const deck = deckFor(tp), k = addCards(deck, list);
      toast(k ? `${k} flashcards added to the “${deck.name}” deck.` : 'The AI reply had no usable cards.', k ? '' : 'bad', k ? ['Open', () => go('cards', { deck: deck.id })] : null);
    } catch (e) { toast(e instanceof SyntaxError ? 'The AI reply had no usable cards.' : e.message, 'bad'); }
  }

  // ---------- assistant ----------
  ACT.aiToggle = () => {
    S.settings.noteAI = !aiOpen(); save(); sfx.whoosh();
    const ns = $('.nsub'); if (!ns) return;
    ns.classList.toggle('ai-open', aiOpen());
    const b = $('.ns-aib'); b?.classList.toggle('ghost', !aiOpen()); b?.setAttribute('aria-pressed', aiOpen());
    if (aiOpen()) { paintMsgs(); $('#aiIn')?.focus(); } else b?.focus();
  };
  async function aiSend(text, label) {
    const tp = topicOf(view?.topic), n = doc?.n; if (!tp || aiBusy) return;
    tp.chat ||= []; tp.chat.push({ role: 'user', content: label || text }); aiBusy = true; paintMsgs();
    try {
      const sys = tutorSystem() + `\n\nYou sit beside the student's notes on "${tp.title}" (notes: ${S.notes.filter(x => x.topic === tp.id).map(x => x.title).join(', ').slice(0, 600)}).` + (n ? `\n\nThe open note, "${n.title}":\n${n.body.slice(0, 8000)}` : '') + '\nWrite in Obsidian markdown so your answer can be pasted into the note.';
      let ctx = tp.chat.slice(-12, -1).concat({ role: 'user', content: text }); while (ctx[0]?.role !== 'user') ctx = ctx.slice(1);
      const out = await askAI(ctx, sys, aiProv());
      tp.chat.push({ role: 'assistant', content: out }); tp.chat = tp.chat.slice(-40); save(); sfx.ok();
    } catch (e) { tp.chat.push({ role: 'assistant', content: '> [!danger] ' + e.message }); sfx.bad(); }
    aiBusy = false; paintMsgs();
  }
  ACT.aiQuick = async el => {
    const n = doc?.n, tp = topicOf(view?.topic), k = el.dataset.k; if (!n || !tp) return;
    if (k === 'cards' || k === 'todo' || k === 'quiz') return studyDo(k, n);
    if (k === 'sum') return aiSend('Summarise the open note in at most 6 bullet points. Bold the key terms.', 'Summarise this note');
    if (k === 'eli') return aiSend('Explain the open note simply, with one concrete everyday example.', 'Explain it simply');
    if (k === 'subs') {
      if (aiBusy) return;
      tp.chat ||= []; aiBusy = true; tp.chat.push({ role: 'user', content: 'Suggest sub-notes' }); paintMsgs();
      try {
        const out = await askAI([{ role: 'user', content: `Suggest 3 to 5 sub-notes that break "${n.title}" into parts worth studying on their own. Reply with ONLY a JSON array of {"title": short title, "body": 2 to 5 lines of markdown to start the note}.\n\n${n.body.slice(0, 6000)}` }], noteSystem(), aiProv());
        const list = L.validNotes({ notes: JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]') }).notes;
        if (!list.length) throw new Error('The AI reply had no usable sub-notes.');
        list.forEach(x => newNote(tp.id, x.title, x.body, n.id)); n.fold = false;
        tp.chat.push({ role: 'assistant', content: `Added ${list.length} sub-notes under **${n.title}**:\n${list.map(x => `- [[${x.title}]]`).join('\n')}` }); save(); sfx.ok();
      } catch (e) { tp.chat.push({ role: 'assistant', content: '> [!danger] ' + (e instanceof SyntaxError ? 'The AI reply had no usable sub-notes.' : e.message) }); sfx.bad(); }
      aiBusy = false; if (doc?.ed) commit(); go('notes');
    }
  };
  ACT.aiInsert = el => {
    const m = topicOf(view?.topic)?.chat?.[+el.dataset.i]; if (!m || !doc) return;
    if (doc.ed) commit();
    pushHist(doc.n.body);
    doc.n.body = (doc.n.body.trim() ? doc.n.body.replace(/\s+$/, '') + '\n\n' : '') + m.content.trim();
    touch(doc.n); paintDoc(); sfx.drop(); toast('Added to the end of the note.');
    $('#docEnd')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'end' });
  };

  // ---------- notes: add, open, fold, menu ----------
  ACT.noteAdd = el => {
    const tp = topicOf(view?.topic); if (!tp) return ACT.noteNew();
    if (doc?.ed) commit();
    const parent = el?.dataset?.parent || null, n = newNote(tp.id, 'Untitled', '', parent);
    if (parent) { const p = noteOf(parent); if (p) p.fold = false; }
    view.note = n.id; sfx.drop(); go('notes'); $('#docTitle')?.select();
  };
  ACT.noteNew = () => {
    migrate();
    if (!topicOf(view?.topic)) view = { topic: (S.topics.find(t => t.inbox) || newTopic('Inbox')).id };
    ACT.noteAdd();
  };
  ACT.noteOpen = el => {
    migrate();
    const n = noteOf(el.dataset.id); if (!n) return toast('That note no longer exists.');
    if (doc?.ed) commit();
    view = { topic: n.topic, note: n.id }; go('notes');
  };
  ACT.notesHome = () => { if (doc?.ed) commit(); view = null; go('notes'); };
  ACT.noteFold = el => { const n = noteOf(el.dataset.id); if (!n) return; if (doc?.ed) commit(); n.fold = !n.fold; save(); go('notes'); };
  ACT.wikilink = el => {
    const t = el.dataset.t.toLowerCase(), here = view?.topic;
    const n = S.notes.find(x => x.topic === here && x.title.toLowerCase() === t) || S.notes.find(x => x.title.toLowerCase() === t);
    if (n) return ACT.noteOpen({ dataset: { id: n.id } });
    if (!here || cur !== 'notes') return toast('No note called “' + el.dataset.t + '” yet.');
    if (doc?.ed) commit();
    const m = newNote(here, el.dataset.t, ''); view.note = m.id; sfx.drop(); go('notes'); toast(`Created “${m.title}”.`);
  };
  ACT.noteMenu = el => {
    const n = noteOf(el.dataset.id); if (!n) return;
    const p = popover(el, `<div class="menu"><button data-k="ren">${icon('note', 16)} Rename</button><button data-k="sub">${icon('plus', 16)} Add a sub-note</button><button data-k="ext">${icon('down', 16)} Save as .${n.ext === 'md' ? 'txt' : 'md'}</button>
      ${desk ? `<button data-k="dir">${icon('folder', 16)} Show the file</button>` : ''}<button data-k="del" class="bad">${icon('trash', 16)} Delete note</button></div>`);
    if (!p) return;
    p.onclick = e => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; p.remove();
      if (k === 'ren') { if (doc?.n !== n) ACT.noteOpen({ dataset: { id: n.id } }); setTimeout(() => $('#docTitle')?.select()); }
      if (k === 'sub') ACT.noteAdd({ dataset: { parent: n.id } });
      if (k === 'ext') { n.ext = n.ext === 'md' ? 'txt' : 'md'; mirror(n, true); save(); go('notes'); toast(`Saved as .${n.ext}.`); }
      if (k === 'dir') desk.reveal(n.file || relPath(n)).catch(() => toast('The file is not written yet.', 'bad'));
      if (k === 'del') delNote(n);
    };
  };
  function delNote(n) {
    if (doc?.ed) commit();
    const i = S.notes.indexOf(n), moved = kids(n.topic, n.id);
    moved.forEach(k => (k.parent = n.parent || null)); // sub-notes move up a level instead of vanishing
    S.notes.splice(i, 1); unmirror(n); moved.forEach(k => mirror(k));
    if (view?.note === n.id) view.note = null;
    if (doc?.n === n) doc = null;
    save(); sfx.trash(); go('notes');
    toast(n.v ? 'Removed from Tempo. The vault file is untouched.' : 'Note deleted.', '', ['Undo', () => { S.notes.splice(i, 0, n); moved.forEach(k => (k.parent = n.id)); [n, ...moved].forEach(k => mirror(k)); save(); if (cur === 'notes') { view = { topic: n.topic, note: n.id }; go('notes'); } }]);
  }
  ACT.noteFile = el => {
    const n = doc?.n; if (!n) return;
    const p = popover(el, `<h3 style="margin-bottom:8px">Note file</h3><div class="seg" role="group" aria-label="File type"><button class="${n.ext !== 'md' ? 'on' : ''}" data-x="txt">.txt</button><button class="${n.ext === 'md' ? 'on' : ''}" data-x="md">.md</button></div>
      <p class="muted" style="margin:10px 0;font-size:12.5px;word-break:break-all">${desk ? `Documents › Tempo Notes › ${esc(relPath(n).replace(/\//g, ' › '))}` : 'Files are written by the desktop app. In the browser, notes live inside Tempo.'}</p>
      <div class="row">${desk ? `<button class="btn sm ghost" data-k="dir">${icon('folder', 15)} Show in folder</button>` : ''}<button class="btn sm ghost" data-k="dl">${icon('down', 15)} Download a copy</button></div>`);
    if (!p) return;
    p.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x) { n.ext = b.dataset.x; save(); mirror(n, true); p.remove(); $('.ns-file').innerHTML = `.${n.ext} ${icon('chevD', 13, 2.2)}`; return toast(`This note now saves as .${n.ext}.`); }
      if (b.dataset.k === 'dir') desk.reveal(n.file || relPath(n)).catch(() => toast('The file is not written yet.', 'bad'));
      if (b.dataset.k === 'dl') saveFile(fname(n.title) + '.' + (n.ext === 'md' ? 'md' : 'txt'), n.body, 'text/plain');
      p.remove();
    };
  };

  // ---------- rich bits loaded on demand: math (KaTeX), code colours (highlight.js), diagrams (Mermaid); offline they stay as source text ----------
  const LIB = {
    katex: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js', katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    hljs: 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js', mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  };
  const scripts = {};
  const loadScript = src => (scripts[src] ||= new Promise((res, rej) => { const s = Object.assign(document.createElement('script'), { src }); s.onload = res; s.onerror = () => { delete scripts[src]; s.remove(); rej(new Error('offline')); }; document.head.append(s); }));
  const mmCache = new Map();
  window.mdEnhance = root => enhance(root); // Big Archive nodes render notes the same way
  async function enhance(root) {
    const math = $$('.math[data-tex]', root), code = $$('pre code[class*="language-"]', root), mm = $$('.mermaid-src', root);
    if (math.length) try { await Promise.all([loadScript(LIB.katex), loadSheet(LIB.katexCss)]); for (const el of math) try { katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('blk'), throwOnError: false }); } catch { /* bad TeX stays as text */ } } catch { /* offline */ }
    if (code.length) try { await loadScript(LIB.hljs); code.forEach(c => { if (c.isConnected && !c.dataset.highlighted) hljs.highlightElement(c); }); } catch { /* offline */ }
    if (mm.length) try {
      await loadScript(LIB.mermaid);
      if (!window.mermaid._tempo) { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, theme: isDark() ? 'dark' : 'neutral', fontFamily: getComputedStyle(document.body).fontFamily }); mermaid._tempo = true; }
      for (const el of mm) {
        const src = el.dataset.src; let svg = mmCache.get(src);
        if (!svg) { try { svg = (await mermaid.render('mm' + uid(), src)).svg; mmCache.set(src, svg); } catch { continue; } }
        if (!el.isConnected) continue;
        el.innerHTML = svg; el.classList.add('done');
        const sv = $('svg', el), b = sv?.getBBox(); // Mermaid's own viewBox can be offset; refit it to what was really drawn
        if (b?.width) { sv.setAttribute('viewBox', `${b.x - 8} ${b.y - 8} ${b.width + 16} ${b.height + 16}`); sv.style.maxWidth = '100%'; sv.style.width = Math.round((b.width + 16) * 1.35) + 'px'; sv.style.height = 'auto'; }
      }
    } catch { /* offline */ }
  }

  // ---------- graph: every topic and note as a dot; drag to pan, scroll to zoom, hover to peek, click to open ----------
  ACT.noteGraph = () => {
    migrate();
    if (doc?.ed) commit();
    if (!S.notes.length) return toast('No notes yet.');
    $('.ngraph')?.remove();
    const nodes = [], at = new Map(), edges = [];
    for (const t of S.topics) { at.set('t:' + t.id, nodes.length); nodes.push({ id: t.id, tp: true, title: t.title, h: hue(t.id), r: 14 }); }
    for (const n of S.notes) { at.set(n.id, nodes.length); nodes.push({ id: n.id, title: n.title, h: hue(n.topic), r: 6, n }); }
    const byTitle = new Map(); for (const n of S.notes) if (!byTitle.has(n.title.toLowerCase())) byTitle.set(n.title.toLowerCase(), n);
    for (const n of S.notes) {
      const i = at.get(n.id), p = noteOf(n.parent) ? at.get(n.parent) : at.get('t:' + n.topic);
      if (p != null) edges.push([i, p, 0]);
      for (const l of new Set(L.links(n.body).map(x => x.toLowerCase()))) { const m = S.notes.find(x => x.topic === n.topic && x.title.toLowerCase() === l) || byTitle.get(l); if (m && m !== n) edges.push([i, at.get(m.id), 1]); }
    }
    const nb = nodes.map(() => new Set()); edges.forEach(([a, b]) => { nb[a].add(b); nb[b].add(a); });
    nodes.forEach((d, i) => { if (!d.tp) d.r = 5 + Math.min(7, nb[i].size * 1.4); });
    const W = innerWidth, H = innerHeight, tc = S.topics.length || 1;
    nodes.forEach((d, i) => {
      if (d.tp) { const a = i / tc * Math.PI * 2; d.x = W / 2 + Math.cos(a) * Math.min(W, H) * .28; d.y = H / 2 + Math.sin(a) * Math.min(W, H) * .28; }
      else { const t = nodes[at.get('t:' + d.n.topic)] || { x: W / 2, y: H / 2 }; d.x = t.x + (Math.random() - .5) * 120; d.y = t.y + (Math.random() - .5) * 120; }
      d.vx = d.vy = 0;
    });
    const g = document.createElement('div');
    g.className = 'ngraph'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true'); g.setAttribute('aria-label', 'Note graph'); g._prev = document.activeElement;
    g.innerHTML = `<header><b>Graph</b><span class="muted">${S.notes.length} notes · ${edges.filter(e => e[2]).length} links · drag to pan, scroll to zoom, click a dot to open</span>
      <label class="sr" for="gq">Find a note</label><input class="inp" id="gq" placeholder="Find a note" autocomplete="off"><button class="icb" data-k="fit" title="Back to centre" aria-label="Back to centre">${icon('target')}</button><button class="icb" data-k="x" aria-label="Close graph">${icon('x')}</button></header>
      <svg class="gsv" width="100%" height="100%"><g class="vp"><g class="ge">${edges.map(([a, b, k]) => `<line class="${k ? 'lk' : ''}" data-a="${a}" data-b="${b}"/>`).join('')}</g>
      <g class="gn">${nodes.map((d, i) => `<g class="gd ${d.tp ? 'tp' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${d.tp ? 'Topic' : 'Note'}: ${esc(d.title)}" style="--h:${d.h}"><circle r="${d.r}"/><text y="${d.r + 14}" text-anchor="middle">${esc(d.title.slice(0, 28))}</text></g>`).join('')}</g></g></svg>
      <div class="gtip" hidden></div>`;
    layer().append(g);
    const svg = $('.gsv', g), vp = $('.vp', g), tip = $('.gtip', g), lines = $$('.ge line', g), dots = $$('.gd', g), cam = { x: 0, y: 0, k: 1 };
    let alpha = 1, raf = 0, drag = null, pan = null, hover = -1;
    const place = () => {
      vp.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${cam.k})`); g.classList.toggle('near', cam.k > .85);
      dots.forEach((el, i) => el.setAttribute('transform', `translate(${nodes[i].x.toFixed(1)} ${nodes[i].y.toFixed(1)})`));
      lines.forEach(el => { const a = nodes[+el.dataset.a], b = nodes[+el.dataset.b]; el.setAttribute('x1', a.x.toFixed(1)); el.setAttribute('y1', a.y.toFixed(1)); el.setAttribute('x2', b.x.toFixed(1)); el.setAttribute('y2', b.y.toFixed(1)); });
    };
    // shortcut: O(n²) repulsion per frame; fine for a few hundred notes, add a quadtree if vaults get huge.
    const step = () => {
      raf = 0;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 40, f = (a.tp && b.tp ? 5200 : 1400) / d2 * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const [i, j, k] of edges) {
        const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - (k ? 120 : 70)) / d * .05 * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const d of nodes) {
        if (d === drag?.d) continue;
        d.vx += (W / 2 - d.x) * .0025 * alpha; d.vy += (H / 2 - d.y) * .0025 * alpha;
        d.vx *= .82; d.vy *= .82; d.x += d.vx; d.y += d.vy;
      }
      place(); alpha = Math.max(0, alpha * .985);
      if (alpha > .02 || drag) raf = requestAnimationFrame(step);
    };
    const heat = () => { alpha = Math.max(alpha, .5); raf ||= requestAnimationFrame(step); };
    if (reduced()) { for (let k = 0; k < 300; k++) step(); cancelAnimationFrame(raf); raf = 0; } else heat();
    place();
    const focusOn = i => {
      hover = i; g.classList.toggle('gfoc', i >= 0);
      dots.forEach((el, k) => el.classList.toggle('on', i >= 0 && (k === i || nb[i].has(k))));
      lines.forEach(el => el.classList.toggle('on', i >= 0 && (+el.dataset.a === i || +el.dataset.b === i)));
      if (i < 0) return void (tip.hidden = true);
      const d = nodes[i], r = dots[i].getBoundingClientRect(), tps = d.tp ? null : topicOf(d.n.topic);
      tip.innerHTML = d.tp ? `<b>${esc(d.title)}</b><small class="muted">Topic · ${S.notes.filter(n => n.topic === d.id).length} notes</small><span>Click to open the topic</span>`
        : `<small class="muted">${esc(tps?.title || '')}</small><b>${esc(d.title)}</b><p>${esc(L.plain(d.n.body).slice(0, 170)) || '<i class="muted">Empty note</i>'}</p><span>${nb[i].size} connection${nb[i].size === 1 ? '' : 's'} · click to open</span>`;
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = L.clamp(r.right + 12, 8, innerWidth - tw - 8) + 'px'; tip.style.top = L.clamp(r.top - th / 2, 60, innerHeight - th - 8) + 'px';
    };
    const close = () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); g.remove(); g._prev?.focus?.(); };
    const open = i => { const d = nodes[i]; close(); if (d.tp) openTopic(topicOf(d.id)); else ACT.noteOpen({ dataset: { id: d.id } }); };
    const toW = (cx, cy) => [(cx - cam.x) / cam.k, (cy - cam.y) / cam.k];
    svg.onpointerdown = e => {
      const el = e.target.closest('.gd'); svg.setPointerCapture(e.pointerId);
      if (el) { const d = nodes[+el.dataset.i], [x, y] = toW(e.clientX, e.clientY); drag = { d, i: +el.dataset.i, ox: d.x - x, oy: d.y - y, sx: e.clientX, sy: e.clientY, moved: false }; heat(); }
      else pan = { x: e.clientX - cam.x, y: e.clientY - cam.y };
    };
    svg.onpointermove = e => {
      if (drag) { const [x, y] = toW(e.clientX, e.clientY); drag.d.x = x + drag.ox; drag.d.y = y + drag.oy; drag.d.vx = drag.d.vy = 0; drag.moved ||= Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4; focusOn(drag.i); heat(); return; }
      if (pan) { cam.x = e.clientX - pan.x; cam.y = e.clientY - pan.y; place(); tip.hidden = true; return; }
      const el = e.target.closest('.gd'), i = el ? +el.dataset.i : -1; if (i !== hover) focusOn(i);
    };
    svg.onpointerup = () => { const d = drag; drag = pan = null; if (d && !d.moved) open(d.i); };
    svg.onwheel = e => { e.preventDefault(); const k = L.clamp(cam.k * Math.exp(-e.deltaY * .0015), .2, 4); cam.x = e.clientX - (e.clientX - cam.x) * (k / cam.k); cam.y = e.clientY - (e.clientY - cam.y) * (k / cam.k); cam.k = k; place(); tip.hidden = true; };
    g.addEventListener('focusin', e => { const el = e.target.closest('.gd'); if (el) focusOn(+el.dataset.i); });
    g.addEventListener('keydown', e => { const el = e.target.closest('.gd'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(+el.dataset.i); } });
    $('header', g).onclick = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (k === 'x') close(); if (k === 'fit') { Object.assign(cam, { x: 0, y: 0, k: 1 }); place(); } };
    const gq = $('#gq', g);
    gq.oninput = () => { const f = gq.value.trim().toLowerCase(); dots.forEach((el, i) => el.classList.toggle('match', !!f && nodes[i].title.toLowerCase().includes(f))); };
    gq.onkeydown = e => { if (e.key === 'Enter') { const i = dots.findIndex(el => el.classList.contains('match')); if (i >= 0) { const d = nodes[i]; cam.k = 1.4; cam.x = W / 2 - d.x * cam.k; cam.y = H / 2 - d.y * cam.k; place(); focusOn(i); } } };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    addEventListener('keydown', onKey, true);
    gq.focus();
  };

  // ---------- page ----------
  // Copying across rendered blocks copies their markdown, so a paste into a Big Archive node (or another note) keeps the formatting.
  document.addEventListener('copy', e => {
    if (cur !== 'notes' || !doc || doc.ed) return;
    const sel = getSelection(), body = $('#docBody'); if (!sel?.rangeCount || sel.isCollapsed || !body?.contains(sel.anchorNode)) return;
    const r = sel.getRangeAt(0), hit = $$('#docBody .blk[data-i]', body).filter(b => r.intersectsNode(b) && +b.dataset.i >= 0);
    if (!hit.length || (hit.length === 1 && sel.toString().trim().length < hit[0].textContent.trim().length)) return; // part of one block stays plain text
    e.preventDefault(); e.clipboardData.setData('text/plain', hit.map(b => doc.bl[+b.dataset.i].t).join('\n\n'));
  });
  addEventListener('keydown', e => {
    if (cur !== 'notes' || !doc || $('#app').hidden || $('.scrim:not(.out)') || $('.ngraph')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); mirror(doc.n, true); return toast(desk ? 'Saved to the note file.' : 'Saved in Tempo.'); }
    if (doc.ed || e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); undoDoc(k === 'y' || e.shiftKey); }
    else if (k === 'enter' && !mod) { e.preventDefault(); doc.bl.length ? editBlock(doc.bl.length - 1, 'end') : newBlockAt(null); }
  });
  PAGES.notes = {
    render(root, arg) {
      migrate(); fontsInit();
      if (arg?.note) { const n = noteOf(arg.note); if (n) view = { topic: n.topic, note: n.id }; }
      if (view) sub(root); else { front(root); $('#app').classList.remove('notesfull'); }
    },
    leave() {
      if (doc?.ed) commit();
      doc = null; wlClose(); $('.ngraph')?.remove();
      $('#app').classList.remove('notesfull');
    },
  };
})();
