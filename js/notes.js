// Notes: markdown with [[wikilinks]], backlinks, a link graph, and an optional Obsidian vault (a folder of .md files).
'use strict';
(() => {
  // shortcut: the vault folder handle lives in memory only, so reconnect after each launch; persist it in IndexedDB if that gets annoying.
  let curId = null, q = '', vault = null, wT = 0;
  const handles = new Map(); // lowercased title -> file handle, so edits go back to the file they came from
  const note = () => S.notes.find(n => n.id === curId);
  const byTitle = t => S.notes.find(n => n.title.toLowerCase() === String(t).trim().toLowerCase());
  const fileName = t => t.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'Untitled';
  const aiProv = () => (S.settings.notes === 'gemini' ? 'gemini' : S.settings.ai);

  function newNote(title = 'Untitled', body = '') { const n = { id: uid(), title, body, upd: Date.now() }; S.notes.push(n); save(); checkAch(); return n; }
  async function writeVault(n) {
    if (!vault) return;
    try {
      const k = n.title.toLowerCase(), fh = handles.get(k) || await vault.getFileHandle(fileName(n.title) + '.md', { create: true });
      handles.set(k, fh);
      const w = await fh.createWritable(); await w.write(n.body); await w.close(); n.v = true; n.dirty = false; save();
    } catch (e) { toast('Could not write to the vault: ' + e.message, 'bad'); }
  }
  ACT.vaultConnect = () => requireLogin(async () => {
    if (!window.showDirectoryPicker) return toast('This browser cannot open folders. Use Edge or Chrome.', 'bad');
    let dir; try { dir = await showDirectoryPicker({ mode: 'readwrite' }); } catch { return; } // picker cancelled
    let synced = 0, kept = 0; handles.clear();
    const walk = async (d, depth) => {
      for await (const [name, h] of d.entries()) {
        if (name.startsWith('.')) continue;
        if (h.kind === 'directory') { if (depth < 5) await walk(h, depth + 1); continue; }
        if (!name.toLowerCase().endsWith('.md') || synced + kept >= 500) continue;
        const title = name.slice(0, -3), body = await (await h.getFile()).text(), ex = byTitle(title);
        handles.set(title.toLowerCase(), h);
        if (!ex) { S.notes.push({ id: uid(), title, body, upd: Date.now(), v: true }); synced++; }
        else if (ex.body === body) { ex.v = true; synced++; }
        else if ((ex.v && !ex.dirty) || !ex.body.trim()) { ex.body = body; ex.v = true; synced++; } // vault wins only when Tempo has no unsaved edits
        else kept++; // never overwrite text written in Tempo; it is pushed to the vault on the next edit
      }
    };
    try { await walk(dir, 0); } catch (e) { return toast('Could not read the vault: ' + e.message, 'bad'); }
    vault = dir; S.settings.notes = 'obsidian'; save(); go('notes');
    toast(`Vault “${dir.name}” connected. ${synced} notes in sync${kept ? `, ${kept} kept from Tempo` : ''}.`);
  });

  const TEMPLATES = {
    Blank: '',
    Cornell: '# Topic\n\n## Cues\n- Key question?\n\n## Notes\n- **Key term** is …\n\n## Summary\nTwo sentences in your own words.',
    Feynman: '# Concept\n\n## Explain it simply\nAs if to a younger student.\n\n## Where I got stuck\n- \n\n## Simpler, second try\n',
    'Lab report': '# Experiment\n\n## Question\n\n## Method\n1. \n\n## Results\n- **Result** is …\n\n## Conclusion\n',
  };
  ACT.noteNew = el => {
    // The page button first offers templates; the command palette and the empty state create a blank note directly.
    if (el?.dataset && el.dataset.tpl == null && el.dataset.now == null && cur === 'notes') { popover(el, `<h3 style="margin-bottom:10px">Start from</h3><div style="display:grid;gap:6px">${Object.keys(TEMPLATES).map(t => `<button class="nitem" data-act="noteNew" data-tpl="${t}"><b>${t}</b></button>`).join('')}</div>`); return; }
    $('.pop')?.remove();
    curId = newNote('Untitled', TEMPLATES[el?.dataset?.tpl] || '').id; go('notes'); $('#nt')?.select();
  };
  ACT.noteListen = el => { const n = note(); n?.body.trim() ? speak(n.title + '. ' + n.body, el) : toast('This note is empty.'); };
  ACT.noteMap = () => { const n = note(); if (n) mindmap(n.title, n.body); };
  ACT.noteOpen = el => { curId = el.dataset.id; go('notes'); };
  ACT.wikilink = el => { const t = el.dataset.t; curId = (byTitle(t) || newNote(t, `# ${t}\n`)).id; go('notes'); };
  ACT.noteDel = () => {
    const n = note(), i = S.notes.indexOf(n);
    S.notes.splice(i, 1); curId = null; save(); sfx.trash(); go('notes');
    toast(n.v ? 'Removed from Tempo. The vault file is untouched.' : 'Note deleted.', '', ['Undo', () => { S.notes.splice(i, 0, n); curId = n.id; save(); if (cur === 'notes') go('notes'); }]);
  };
  ACT.noteQuiz = () => go('quiz', { from: note() });
  ACT.noteAI = el => aiGate(async () => {
    const n = note(), sum = el.dataset.k === 'sum';
    if (!n?.body.trim()) return toast('Write something first.');
    const m = modal(`<h2>${sum ? 'Summary' : 'Explained simply'}</h2><div class="mdv" id="aiout" style="padding:10px 0"><span class="typing"><i></i><i></i><i></i></span></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" id="aiadd" disabled>Add to note</button></div>`, 'wide');
    try {
      const out = await askAI([{ role: 'user', content: (sum ? 'Summarise this note in at most 5 bullet points.' : 'Explain this note simply, with one concrete example.') + '\n\n' + n.body }], undefined, aiProv());
      if (!m.isConnected) return;
      $('#aiout', m).innerHTML = L.md(out);
      const add = $('#aiadd', m); add.disabled = false;
      add.onclick = () => { n.body += `\n\n## ${sum ? 'Summary' : 'In simple words'}\n${out}`; n.upd = Date.now(); save(); writeVault(n); closeModal(); go('notes'); };
    } catch (e) { if (m.isConnected) $('#aiout', m).innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  });
  ACT.noteGraph = () => {
    const ns = S.notes, W = 700, H = 440;
    if (!ns.length) return toast('No notes yet.');
    const idx = new Map(ns.map((n, i) => [n.title.toLowerCase(), i])), edges = [];
    ns.forEach((n, i) => { for (const t of L.links(n.body)) { const j = idx.get(t.toLowerCase()); if (j != null && j !== i) edges.push([i, j]); } });
    const pos = ns.map((_, i) => { const a = i / ns.length * Math.PI * 2; return { x: W / 2 + Math.cos(a) * 160, y: H / 2 + Math.sin(a) * 130 }; });
    for (let k = 0; k < 220; k++) { // tiny force layout: everything repels, links pull, all drift to the centre
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, f = 700 / (dx * dx + dy * dy + 60);
        pos[i].x += dx * f; pos[i].y += dy * f; pos[j].x -= dx * f; pos[j].y -= dy * f;
      }
      for (const [a, b] of edges) { // spring with a rest length, so linked notes sit near each other without their labels colliding
        const ex = pos[b].x - pos[a].x, ey = pos[b].y - pos[a].y, d = Math.hypot(ex, ey) || 1, f = (d - 170) / d * .04;
        pos[a].x += ex * f; pos[a].y += ey * f; pos[b].x -= ex * f; pos[b].y -= ey * f;
      }
      for (const p of pos) { p.x = L.clamp(p.x + (W / 2 - p.x) * .012, 50, W - 50); p.y = L.clamp(p.y + (H / 2 - p.y) * .012, 30, H - 30); }
    }
    modal(`<h2>Note graph</h2><p class="muted">${ns.length} notes, ${edges.length} links. Click a note to open it.</p><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Graph of linked notes">
      ${edges.map(([a, b]) => `<line x1="${pos[a].x.toFixed(0)}" y1="${pos[a].y.toFixed(0)}" x2="${pos[b].x.toFixed(0)}" y2="${pos[b].y.toFixed(0)}" stroke="var(--line)" stroke-width="2"/>`).join('')}
      ${ns.map((n, i) => `<g class="gnode" data-act="graphOpen" data-id="${n.id}" tabindex="0"><circle cx="${pos[i].x.toFixed(0)}" cy="${pos[i].y.toFixed(0)}" r="8"/><text x="${pos[i].x.toFixed(0)}" y="${(pos[i].y + 24).toFixed(0)}" text-anchor="middle">${esc(n.title.slice(0, 24))}</text></g>`).join('')}</svg>`, 'wide');
  };
  ACT.graphOpen = el => { closeModal(); ACT.noteOpen(el); };

  PAGES.notes = {
    render(root) {
      if (!note()) curId = [...S.notes].sort((a, b) => b.upd - a.upd)[0]?.id ?? null;
      const n = note(), home = S.settings.notes;
      root.innerHTML = `<div class="ph"><h1>Notes</h1><span class="chip">${vault ? 'Obsidian · ' + esc(vault.name) : home === 'gemini' ? 'Gemini-assisted' : 'Stored in Tempo'}</span>
        ${home === 'obsidian' && !vault ? '<button class="btn sm" data-act="vaultConnect">Connect Obsidian vault</button>' : ''}
        <button class="btn sm ghost right" data-act="noteGraph">${icon('graph', 16)} Graph</button><button class="btn" data-act="noteNew">${icon('plus', 18)} New note</button></div>
        <div class="notes"><div class="card nlist" style="padding:12px"><input class="inp" id="nq" placeholder="Search notes" aria-label="Search notes" value="${esc(q)}"><div id="nl" style="display:grid;gap:4px;margin-top:6px"></div></div>
        ${n ? `<div class="card ned"><input id="nt" value="${esc(n.title)}" aria-label="Note title" maxlength="80">
          <div class="split"><textarea id="nb" aria-label="Note text in markdown" spellcheck="false" placeholder="Write in markdown. **Bold** key terms and link notes with [[double brackets]].">${esc(n.body)}</textarea><div class="mdv" id="nv"></div></div></div>
          <aside class="card" style="overflow:auto"><h2>Linked here</h2><div id="nbk"></div><h2 style="margin-top:20px">Study this note</h2>
          <div style="display:grid;gap:10px"><button class="btn sm ghost" data-act="noteListen">${icon('speaker', 15)} Listen</button><button class="btn sm ghost" data-act="noteMap">${icon('tree', 15)} Mind map</button>
          <button class="btn sm ghost" data-act="noteQuiz">❓ Quiz me on this</button><button class="btn sm ghost" data-act="noteAI" data-k="sum">✨ Summarise</button><button class="btn sm ghost" data-act="noteAI" data-k="eli">✨ Explain simply</button>
          <button class="btn sm ghost" style="margin-top:14px" data-act="noteDel">${icon('trash', 15)} Delete note</button></div></aside>`
        : `<div class="card empty" style="grid-column:2/4;display:grid;place-content:center;justify-items:center;gap:12px">${ember(84)}<h2>No notes yet</h2><button class="btn" data-act="noteNew" data-now>Write the first one</button></div>`}</div>`;
      const list = () => {
        const f = q.toLowerCase();
        $('#nl').innerHTML = [...S.notes].filter(x => (x.title + ' ' + x.body).toLowerCase().includes(f)).sort((a, b) => b.upd - a.upd).map(x =>
          `<button class="nitem ${x.id === curId ? 'on' : ''}" data-act="noteOpen" data-id="${x.id}"><b>${esc(x.title || 'Untitled')}</b><small>${ago(x.upd)}${x.v ? ' · vault' : ''}</small></button>`).join('') || '<div class="empty">Nothing found</div>';
      };
      $('#nq').oninput = e => { q = e.target.value; list(); };
      list();
      if (!n) return;
      const view = () => { $('#nv').innerHTML = L.md(n.body) || '<p class="muted">Preview appears here.</p>'; };
      const changed = () => { n.upd = Date.now(); save(); if (vault) { clearTimeout(wT); wT = setTimeout(() => writeVault(n), 800); } else if (n.v) n.dirty = true; };
      $('#nb').oninput = e => { n.body = e.target.value; view(); changed(); };
      $('#nt').oninput = e => { n.title = e.target.value.trim() || 'Untitled'; $('.nitem.on b').textContent = n.title; changed(); };
      view();
      const back = S.notes.filter(x => x !== n && L.links(x.body).some(t => t.toLowerCase() === n.title.toLowerCase()));
      $('#nbk').innerHTML = back.map(x => `<button class="nitem" data-act="noteOpen" data-id="${x.id}"><b>${esc(x.title)}</b></button>`).join('') || '<p class="muted">No other note links here yet. Type [[' + esc(n.title) + ']] in one.</p>';
    },
  };
})();
