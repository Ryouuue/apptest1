// Flashcards with spaced repetition (Leitner boxes), kept in decks: one per note topic, plus decks made by hand.
// Cards come from key terms in notes or are added by hand.
'use strict';
(() => {
  let rv = null, open = null; // rv: running review { queue, deck }; open: the deck being viewed
  const NEXT = ['today', 'tomorrow', '3 days', '1 week', '16 days', '5 weeks'];
  const deckOf = id => S.decks.find(d => d.id === id);
  const inDeck = id => S.cards.filter(c => c.deck === id);
  const dueIn = id => S.cards.filter(c => (!id || c.deck === id) && c.due <= today());
  const mkDeck = (name, topic) => { const d = { id: uid(), name: String(name).trim().slice(0, 60) || 'New deck', topic: topic || null, hue: Math.floor(Math.random() * 360), upd: Date.now() }; S.decks.push(d); save(); return d; };

  // Cards made before decks existed go into "General".
  function migrate() {
    const lost = S.cards.filter(c => !deckOf(c.deck));
    if (!lost.length) return;
    const g = S.decks.find(d => d.name === 'General' && !d.topic) || mkDeck('General');
    lost.forEach(c => (c.deck = g.id)); save();
  }
  // Used by Notes too: each note topic owns one deck, named after it.
  window.deckFor = tp => (tp && (S.decks.find(d => d.topic === tp.id) || mkDeck(tp.title, tp.id))) || S.decks.find(d => d.name === 'General' && !d.topic) || mkDeck('General');
  window.addCards = (deck, list) => {
    const have = new Set(S.cards.map(c => c.deck + '|' + c.a.toLowerCase())); let n = 0;
    for (const c of list) if (c.q && c.a && !have.has(deck.id + '|' + c.a.toLowerCase())) { S.cards.push({ id: uid(), q: c.q, a: c.a, box: 0, due: today(), deck: deck.id }); have.add(deck.id + '|' + c.a.toLowerCase()); n++; }
    if (n) { deck.upd = Date.now(); save(); }
    return n;
  };
  // Key terms of each note go into its topic's deck. Returns how many cards were added and the (last) deck used.
  window.cardsFromNotes = notes => {
    let n = 0, deck = null;
    for (const nt of notes) { deck = deckFor(S.topics.find(t => t.id === nt.topic)); n += addCards(deck, L.facts([nt]).map(f => ({ q: f.text.replace(f.term, '_____'), a: f.term }))); }
    return { n, deck };
  };

  ACT.cardsMake = () => {
    const r = cardsFromNotes(open && deckOf(open)?.topic ? S.notes.filter(n => n.topic === deckOf(open).topic) : S.notes);
    if (!r.n) return toast('No new key terms found. Bold a term in a note, like **osmosis**, and try again.');
    sfx.ok(); go('cards'); toast(`${r.n} card${r.n === 1 ? '' : 's'} made from your notes, each in its topic's deck.`);
  };
  ACT.deckNew = () => {
    const m = modal(`<h2>New deck</h2><form novalidate><label class="f" for="dk-n">Deck name</label><input class="inp" id="dk-n" maxlength="60" placeholder="e.g. Spanish verbs" autofocus><p class="err" role="alert"></p><div class="foot"><button class="btn">Create deck</button></div></form>`);
    $('form', m).onsubmit = e => {
      e.preventDefault(); const v = $('#dk-n', m).value.trim();
      if (!v) { $('.err', m).textContent = 'Give the deck a name.'; replay(m, 'shake'); return sfx.bad(); }
      open = mkDeck(v).id; closeModal(); sfx.drop(); go('cards');
    };
  };
  ACT.deckOpen = el => { open = el.dataset.id; sfx.pick(); go('cards'); };
  ACT.deckBack = () => { open = null; go('cards'); };
  ACT.deckRename = () => {
    const d = deckOf(open); if (!d) return;
    const m = modal(`<h2>Rename deck</h2><form novalidate><label class="f" for="dk-r">Deck name</label><input class="inp" id="dk-r" maxlength="60" value="${esc(d.name)}" autofocus><div class="foot"><button class="btn">Rename</button></div></form>`);
    $('#dk-r', m).select();
    $('form', m).onsubmit = e => { e.preventDefault(); const v = $('#dk-r', m).value.trim(); if (v) { d.name = v.slice(0, 60); save(); } closeModal(); go('cards'); };
  };
  ACT.deckDel = () => {
    const d = deckOf(open); if (!d) return;
    const i = S.decks.indexOf(d), cards = inDeck(d.id);
    S.decks.splice(i, 1); S.cards = S.cards.filter(c => c.deck !== d.id); open = null; save(); sfx.trash(); go('cards');
    toast(`Deleted “${d.name}” and ${cards.length} card${cards.length === 1 ? '' : 's'}.`, '', ['Undo', () => { S.decks.splice(i, 0, d); S.cards.push(...cards); open = d.id; save(); if (cur === 'cards') go('cards'); }]);
  };
  ACT.cardNew = () => {
    const pick = open || S.decks[0]?.id;
    const m = modal(`<h2>New flashcard</h2><form novalidate><label class="f" for="fc-d">Deck</label><select class="inp" id="fc-d" name="d">${S.decks.map(d => `<option value="${d.id}" ${d.id === pick ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="__new">New deck…</option></select>
      <label class="f" for="fc-q">Front (question)</label><textarea class="inp" id="fc-q" name="q" maxlength="300" autofocus></textarea>
      <label class="f" for="fc-a">Back (answer)</label><input class="inp" id="fc-a" name="a" maxlength="200"><p class="err" role="alert"></p><div class="foot"><button class="btn" type="submit">Add card</button></div></form>`);
    $('form', m).onsubmit = e => {
      e.preventDefault();
      const f = e.target, q = f.q.value.trim(), a = f.a.value.trim();
      if (!q || !a) { $('.err', m).textContent = 'A card needs both sides.'; replay(m, 'shake'); return sfx.bad(); }
      const d = f.d.value === '__new' || !deckOf(f.d.value) ? mkDeck('New deck') : deckOf(f.d.value);
      S.cards.push({ id: uid(), q, a, box: 0, due: today(), deck: d.id }); d.upd = Date.now(); save(); closeModal(); sfx.ok(); open = d.id; go('cards');
    };
  };
  ACT.cardDel = el => {
    const i = S.cards.findIndex(c => c.id === el.dataset.id), [gone] = S.cards.splice(i, 1);
    save(); sfx.trash(); go('cards');
    toast('Card deleted.', '', ['Undo', () => { S.cards.splice(i, 0, gone); save(); if (cur === 'cards') go('cards'); }]);
  };
  const moveCard = el => { const c = S.cards.find(x => x.id === el.dataset.id), d = deckOf(el.value); if (c && d) { c.deck = d.id; save(); sfx.drop(); go('cards'); toast(`Moved to “${d.name}”.`); } };
  ACT.cardsStart = el => { const deck = el?.dataset?.deck || null; rv = { queue: L.shuffle(dueIn(deck)), flipped: false, deck }; go('cards'); };
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
    if (cur !== 'cards' || !rv || $('.scrim:not(.out)') || $('#app').hidden || e.target.closest('input,textarea,select')) return;
    if (rv.flipped && e.key >= '1' && e.key <= '3') $$('.fc-grade button')[e.key - 1].click();
    else if ((e.key === ' ' || e.key === 'Enter') && document.activeElement !== $('.fcard')) { e.preventDefault(); ACT.cardFlip(); }
  });

  const boxes = cards => { const b = [0, 1, 2, 3, 4, 5].map(k => cards.filter(c => (c.box || 0) === k).length), max = Math.max(1, ...b); return `<div class="boxes" role="img" aria-label="Cards per box: ${b.join(', ')}">${b.map((n, k) => `<div><span>${n}</span><i style="height:${n / max * 44}px"></i>${k ? 'Box ' + k : 'New'}</div>`).join('')}</div>`; };
  // A deck is drawn as a little stack of cards; the top card wears the deck colour.
  const deckCard = (d, i) => {
    const cs = inDeck(d.id), due = cs.filter(c => c.due <= today()).length, learnt = cs.filter(c => c.box >= 3).length;
    return `<button class="deck" data-act="deckOpen" data-id="${d.id}" style="--h:${d.hue ?? 210};--i:${i}" aria-label="${esc(d.name)}: ${cs.length} cards, ${due} due">
      <span class="dk-stack" aria-hidden="true"><i></i><i></i><i>${d.topic ? icon('note', 16) : icon('deck', 16)}</i></span>
      <b>${esc(d.name)}</b><small class="muted">${cs.length} card${cs.length === 1 ? '' : 's'}${d.topic ? ' · from notes' : ''}</small>
      <span class="dk-foot">${due ? `<span class="dk-due">${due} due</span>` : '<span class="muted">All caught up</span>'}<span class="dk-bar"><i style="width:${cs.length ? learnt / cs.length * 100 : 0}%"></i></span></span></button>`;
  };

  PAGES.cards = {
    render(root, arg) {
      migrate();
      if (arg?.deck && deckOf(arg.deck)) { open = arg.deck; rv = null; }
      if (open && !deckOf(open)) open = null;
      if (rv && !rv.queue.length) rv = null;
      if (rv) {
        const c = rv.queue[0], box = S.cards.find(x => x.id === c.id)?.box || 0, d = deckOf(S.cards.find(x => x.id === c.id)?.deck);
        root.innerHTML = `<div class="ph"><h1>Flashcards</h1><span class="chip">${rv.queue.length} left</span>${d ? `<span class="chip dkchip" style="--h:${d.hue ?? 210}">${esc(d.name)}</span>` : ''}<button class="btn sm ghost right" data-act="cardsStop">Stop reviewing</button></div>
          <div class="fc-wrap"><button class="fcard" data-act="cardFlip" aria-pressed="false" aria-label="Flashcard. Press Space to flip."><div class="fc-face"><small>Front</small>${esc(c.q)}</div><div class="fc-face fc-back"><small>Back</small>${esc(c.a)}</div></button>
          <p class="muted mono" id="fc-hint" style="text-align:center;margin-top:26px">Say the answer, then press Space to flip</p>
          <div class="fc-grade" hidden>${[['Again', 'bad', 0, 0], ['Good', 'ghost', 1, Math.min(5, Math.max(1, box + 1))], ['Easy', 'good', 2, Math.min(5, Math.max(1, box + 2))]].map(([n, cls, g, nb], i) =>
            `<button class="btn ${cls === 'bad' ? 'danger' : cls}" data-act="cardGrade" data-g="${g}">${n}<small>${i + 1} · ${NEXT[nb]}</small></button>`).join('')}</div></div>`;
        return void $('.fcard').focus();
      }
      if (open) {
        const d = deckOf(open), cs = inDeck(d.id), due = cs.filter(c => c.due <= today()).length;
        root.innerHTML = `<div class="ph"><button class="icb" data-act="deckBack" aria-label="All decks" title="All decks">${icon('left')}</button><h1>${esc(d.name)}</h1><span class="chip">${cs.length} cards</span>
          <span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="deckRename">Rename</button><button class="btn sm ghost" data-act="deckDel">${icon('trash', 15)} Delete deck</button>
          ${d.topic ? `<button class="btn sm ghost" data-act="cardsMake">${icon('spark', 15)} Update from notes</button>` : ''}<button class="btn" data-act="cardNew">${icon('plus', 18)} New card</button></span></div>
          <div class="grid2"><section class="card dk-hero" style="--h:${d.hue ?? 210}"><h2>Due today</h2>
            <div class="serif" style="font-size:54px;font-weight:700;line-height:1"><span class="hl">${due}</span> <span style="font-size:18px" class="muted">of ${cs.length} cards</span></div>
            <p class="muted">${due ? 'Cards you get right move to a later box and come back less often.' : cs.length ? 'All caught up in this deck.' : 'This deck is empty. Add a card, or bold key terms in its notes.'}</p>
            <div><button class="btn big" data-act="cardsStart" data-deck="${d.id}" ${due ? '' : 'disabled'}>Review ${due} card${due === 1 ? '' : 's'} ${icon('right')}</button></div></section>
          <section class="card"><h2>Memory boxes</h2>${boxes(cs)}<p class="muted" style="margin-top:12px">Box 5 cards come back every five weeks. Missing a card sends it back to the start.</p></section></div>
          <section class="card"><h2>Cards</h2>${cs.length ? cs.map(c => `<div class="ev"><span class="grow">${esc(c.q)}</span><b>${esc(c.a)}</b><small class="muted mono">${c.box ? 'box ' + c.box : 'new'}</small>
            ${S.decks.length > 1 ? `<label class="sr" for="mv-${c.id}">Move to deck</label><select class="inp dk-mv" id="mv-${c.id}" data-id="${c.id}" title="Move to another deck"><option value="">Move…</option>${S.decks.filter(x => x.id !== d.id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}
            <button class="icb" style="width:32px;height:32px" data-act="cardDel" data-id="${c.id}" aria-label="Delete card ${esc(c.a)}">${icon('trash', 15)}</button></div>`).join('') : '<div class="empty">No cards in this deck yet.</div>'}</section>`;
        $$('.dk-mv', root).forEach(s => (s.onchange = () => moveCard(s)));
        return;
      }
      const all = dueIn(null).length, decks = [...S.decks].sort((a, b) => dueIn(b.id).length - dueIn(a.id).length || (b.upd || 0) - (a.upd || 0));
      root.innerHTML = `<div class="ph"><h1>Flashcards</h1><span class="chip">${S.decks.length} deck${S.decks.length === 1 ? '' : 's'}</span>
        <span class="right row" style="gap:8px"><button class="btn sm ghost" data-act="cardsMake">${icon('spark', 15)} Make from my notes</button><button class="btn sm ghost" data-act="deckNew">${icon('plus', 15)} New deck</button><button class="btn" data-act="cardNew">${icon('plus', 18)} New card</button></span></div>
        <section class="card dk-all"><div class="grow"><h2>Due today across all decks</h2><p class="muted">${all ? 'Mixing decks in one session helps memory (interleaving).' : S.cards.length ? 'All caught up. Come back tomorrow.' : 'No cards yet. Make them from your notes in one click.'}</p></div>
          <div class="serif dk-n"><span class="hl">${all}</span></div><button class="btn big" data-act="${S.cards.length ? 'cardsStart' : 'cardsMake'}" ${S.cards.length && !all ? 'disabled' : ''}>${S.cards.length ? `Review all ${all}` : 'Make cards from my notes'} ${icon('right')}</button></section>
        <div class="decks">${decks.map(deckCard).join('')}<button class="deck add" data-act="deckNew"><span class="dk-stack" aria-hidden="true"><i></i><i></i><i>${icon('plus', 18)}</i></span><b>New deck</b><small class="muted">For cards that are not from notes</small></button></div>`;
    },
  };
})();
