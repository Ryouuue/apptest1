// Flashcards with spaced repetition (Leitner boxes). Cards come from key terms in notes or are added by hand.
'use strict';
(() => {
  let rv = null; // running review: { queue }
  const due = () => S.cards.filter(c => c.due <= today());
  const NEXT = ['today', 'tomorrow', '3 days', '1 week', '16 days', '5 weeks'];

  ACT.cardsMake = () => {
    const have = new Set(S.cards.map(c => c.a.toLowerCase())), fs = L.facts(S.notes).filter(f => !have.has(f.term.toLowerCase()));
    if (!fs.length) return toast('No new key terms found. Bold a term in a note, like **osmosis**, and try again.');
    for (const f of fs) S.cards.push({ id: uid(), q: f.text.replace(f.term, '_____'), a: f.term, box: 0, due: today() });
    save(); sfx.ok(); go('cards'); toast(`${fs.length} card${fs.length === 1 ? '' : 's'} made from your notes.`);
  };
  ACT.cardNew = () => {
    const m = modal(`<h2>New flashcard</h2><form novalidate><label class="f" for="fc-q">Front (question)</label><textarea class="inp" id="fc-q" name="q" maxlength="300" autofocus></textarea>
      <label class="f" for="fc-a">Back (answer)</label><input class="inp" id="fc-a" name="a" maxlength="200"><p class="err" role="alert"></p><div class="foot"><button class="btn" type="submit">Add card</button></div></form>`);
    $('form', m).onsubmit = e => {
      e.preventDefault();
      const q = e.target.q.value.trim(), a = e.target.a.value.trim();
      if (!q || !a) { $('.err', m).textContent = 'A card needs both sides.'; replay(m, 'shake'); return sfx.bad(); }
      S.cards.push({ id: uid(), q, a, box: 0, due: today() }); save(); closeModal(); sfx.ok(); go('cards');
    };
  };
  ACT.cardDel = el => {
    const i = S.cards.findIndex(c => c.id === el.dataset.id), [gone] = S.cards.splice(i, 1);
    save(); sfx.trash(); go('cards');
    toast('Card deleted.', '', ['Undo', () => { S.cards.splice(i, 0, gone); save(); if (cur === 'cards') go('cards'); }]);
  };
  ACT.cardsStart = () => { rv = { queue: L.shuffle(due()), flipped: false }; go('cards'); };
  ACT.cardsStop = () => { rv = null; go('cards'); };
  ACT.cardFlip = () => {
    rv.flipped = !rv.flipped; sfx.pick();
    $('.fcard').classList.toggle('flip', rv.flipped); $('.fcard').setAttribute('aria-pressed', rv.flipped);
    $('.fc-grade').hidden = !rv.flipped; $('#fc-hint').hidden = rv.flipped;
  };
  ACT.cardGrade = el => {
    const g = +el.dataset.g, c = rv.queue.shift(), real = S.cards.find(x => x.id === c.id);
    if (real) Object.assign(real, L.srs(real, g, today()));
    if (!g) rv.queue.push(c); // "again" stays in today's pile
    S.reviews++; dayState().reviews++; addXp(g ? 3 : 1); g ? sfx.ok() : sfx.tap();
    rv.flipped = false; save();
    if (!rv.queue.length) { rv = null; celebrate('🃏', 'Pile cleared', 'Nothing left to review today'); }
    checkAch(); go('cards');
  };
  addEventListener('keydown', e => {
    if (cur !== 'cards' || !rv || $('.scrim:not(.out)') || $('#app').hidden || e.target.closest('input,textarea')) return;
    if (rv.flipped && e.key >= '1' && e.key <= '3') $$('.fc-grade button')[e.key - 1].click();
    else if ((e.key === ' ' || e.key === 'Enter') && document.activeElement !== $('.fcard')) { e.preventDefault(); ACT.cardFlip(); }
  });

  PAGES.cards = {
    render(root) {
      if (rv && !rv.queue.length) rv = null;
      if (rv) {
        const c = rv.queue[0], box = S.cards.find(x => x.id === c.id)?.box || 0;
        root.innerHTML = `<div class="ph"><h1>Flashcards</h1><span class="chip">${rv.queue.length} left</span><button class="btn sm ghost right" data-act="cardsStop">Stop reviewing</button></div>
          <div class="fc-wrap"><button class="fcard" data-act="cardFlip" aria-pressed="false" aria-label="Flashcard. Press Space to flip."><div class="fc-face"><small>Front</small>${esc(c.q)}</div><div class="fc-face fc-back"><small>Back</small>${esc(c.a)}</div></button>
          <p class="muted mono" id="fc-hint" style="text-align:center;margin-top:26px">Say the answer, then press Space to flip</p>
          <div class="fc-grade" hidden>${[['Again', 'bad', 0, 0], ['Good', 'ghost', 1, Math.min(5, Math.max(1, box + 1))], ['Easy', 'good', 2, Math.min(5, Math.max(1, box + 2))]].map(([n, cls, g, nb], i) =>
            `<button class="btn ${cls === 'bad' ? 'danger' : cls}" data-act="cardGrade" data-g="${g}">${n}<small>${i + 1} · ${NEXT[nb]}</small></button>`).join('')}</div></div>`;
        return void $('.fcard').focus();
      }
      const d = due().length, boxes = [0, 1, 2, 3, 4, 5].map(b => S.cards.filter(c => (c.box || 0) === b).length), max = Math.max(1, ...boxes);
      root.innerHTML = `<div class="ph"><h1>Flashcards</h1><button class="btn sm ghost right" data-act="cardsMake">${icon('spark', 15)} Make from my notes</button><button class="btn" data-act="cardNew">${icon('plus', 18)} New card</button></div>
        <div class="grid2"><section class="card" style="display:grid;gap:12px;align-content:start"><h2>Due today</h2>
          <div class="serif" style="font-size:54px;font-weight:700;line-height:1"><span class="hl">${d}</span> <span style="font-size:18px" class="muted">of ${S.cards.length} cards</span></div>
          <p class="muted">${d ? 'Cards you get right move to a later box and come back less often.' : S.cards.length ? 'All caught up. Come back tomorrow.' : 'No cards yet. Make them from your notes in one click.'}</p>
          <div><button class="btn big" data-act="${S.cards.length ? 'cardsStart' : 'cardsMake'}" ${S.cards.length && !d ? 'disabled' : ''}>${S.cards.length ? `Review ${d} card${d === 1 ? '' : 's'}` : 'Make cards from my notes'} ${icon('right')}</button></div></section>
        <section class="card"><h2>Memory boxes</h2><div class="boxes" role="img" aria-label="Cards per box: ${boxes.join(', ')}">${boxes.map((n, b) => `<div><span>${n}</span><i style="height:${n / max * 44}px"></i>${b ? 'Box ' + b : 'New'}</div>`).join('')}</div>
          <p class="muted" style="margin-top:12px">Box 5 cards are reviewed every five weeks. Missing a card sends it back to the start.</p></section></div>
        <section class="card"><h2>All cards</h2>${S.cards.length ? S.cards.map(c => `<div class="ev"><span class="grow">${esc(c.q)}</span><b>${esc(c.a)}</b><small class="muted mono">${c.box ? 'box ' + c.box : 'new'}</small>
          <button class="icb" style="width:32px;height:32px" data-act="cardDel" data-id="${c.id}" aria-label="Delete card ${esc(c.a)}">${icon('trash', 15)}</button></div>`).join('') : '<div class="empty">Cards you make appear here.</div>'}</section>`;
    },
  };
})();
