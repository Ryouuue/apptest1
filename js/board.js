// Your Big Archive: pan/zoom whiteboard with pen, marker, highlighter, eraser, draggable sticky notes,
// pictures (upload, paste or drop) and pointer arrows that connect notes and pictures.
'use strict';
(() => {
  const COLORS = ['#f3f5f9', '#1b1f2e', '#f96a0a', '#ef4444', '#f5b301', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
  const STICKY = ['#fde68a', '#e2d9fb', '#fcd5c0', '#cdeccd', '#cfe4fb'];
  // Three pointer tools: a straight arrow, a curved arrow, and a connector pinned to fixed side points of both items.
  const TOOLS = [['hand', 'Move (V)', 'hand'], ['line', 'Drag and point (L): straight arrow from a note, node or picture to another', 'arrow'], ['arrow', 'Drag and point, curved (A)', 'curve'],
    ['connect', 'Connect (K): join two items at fixed side points', 'connect'], ['pen', 'Pen (P)', 'squig', 1.5], ['marker', 'Marker (M)', 'squig', 3.5], ['hl', 'Highlighter (H)', 'squig', 6.5], ['eraser', 'Eraser (E)', 'eraser']];
  const WIDTH = { pen: 1, marker: 3.2, hl: 8 }, ALPHA = { pen: 1, marker: .92, hl: .35 }, LINKERS = new Set(['line', 'arrow', 'connect']);
  const NODE_C = ['', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
  const SIDE = { t: [.5, 0, 0, -1], r: [1, .5, 1, 0], b: [.5, 1, 0, 1], l: [0, .5, -1, 0] }; // anchor: fraction of w/h, then the outward normal
  const ANC = Object.keys(SIDE).map(k => `<i class="anc" data-side="${k}"></i>`).join('');
  let tool = 'hand', color, size = 3, wrap, cv, ctx, world, links, live = null, drag = null, erased = null, linking = null, selLink = null, space = false, raf = 0, undo = [], redo = [], zTop = 1, ro, nro, lastPt = null;
  const urls = [];
  const B = () => S.board, V = () => S.board.view;
  const toWorld = (cx, cy) => { const r = wrap.getBoundingClientRect(), v = V(); return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z]; };
  const item = id => B().stickies.find(s => s.id === id) || B().images.find(s => s.id === id);

  // Pictures are blobs in IndexedDB (the shared idb in core.js); the board keeps only their position and size.
  function path(s) {
    const p = s.p;
    ctx.globalAlpha = ALPHA[s.t]; ctx.strokeStyle = s.c; ctx.lineWidth = s.s * WIDTH[s.t]; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    if (p.length === 2) ctx.lineTo(p[0] + .01, p[1]);
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2); // midpoint smoothing
    if (p.length > 2) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  // shortcut: redraws every stroke each frame; fine for a few thousand strokes, add tiling/culling if boards get huge.
  function draw() {
    raf = 0;
    const dpr = devicePixelRatio || 1, v = V(), w = Math.round(wrap.clientWidth * dpr), h = Math.round(wrap.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * v.z, 0, 0, dpr * v.z, dpr * v.x, dpr * v.y);
    for (const s of B().strokes) path(s);
    if (live) path(live);
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
    wrap.style.backgroundSize = `${28 * v.z}px ${28 * v.z}px`; wrap.style.backgroundPosition = `${v.x}px ${v.y}px`;
    $('#bdz').textContent = Math.round(v.z * 100) + '%';
  }
  const redraw = () => { raf ||= requestAnimationFrame(draw); };
  function zoomAt(cx, cy, f) {
    const r = wrap.getBoundingClientRect(), v = V(), mx = cx - r.left, my = cy - r.top, nz = L.clamp(v.z * f, .1, 4);
    v.x = mx - (mx - v.x) * (nz / v.z); v.y = my - (my - v.y) * (nz / v.z); v.z = nz; redraw(); save();
  }

  // ----- pointer arrows -----
  // Arrows live in world space inside .world, so zoom scales line, head and anchors together.
  // Each end is a note/picture id (anchored to the side facing the other end) or a free point.
  const center = e => { const s = e.id && item(e.id); return s ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : e; };
  const nearSide = (s, x, y) => Object.keys(SIDE).reduce((b, k) => { const [fx, fy] = SIDE[k], d = (s.x + s.w * fx - x) ** 2 + (s.y + s.h * fy - y) ** 2; return d < b[1] ? [k, d] : b; }, ['t', Infinity])[0];
  function endPt(e, to) {
    const s = e.id && item(e.id);
    if (!s) return { x: e.x, y: e.y, free: true };
    if (e.side) { const [fx, fy, nx, ny] = SIDE[e.side]; return { x: s.x + s.w * fx, y: s.y + s.h * fy, nx, ny }; }
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2, dx = to.x - cx, dy = to.y - cy;
    if (Math.abs(dx) / s.w > Math.abs(dy) / s.h) return dx > 0 ? { x: s.x + s.w, y: cy, nx: 1, ny: 0 } : { x: s.x, y: cy, nx: -1, ny: 0 };
    return dy > 0 ? { x: cx, y: s.y + s.h, nx: 0, ny: 1 } : { x: cx, y: s.y, nx: 0, ny: -1 };
  }
  function geom(l) {
    const a = endPt(l.a, center(l.b)), b = endPt(l.b, center(l.a)), d = Math.hypot(b.x - a.x, b.y - a.y) || 1, k = L.clamp(d * .4, 24, 180), ux = (b.x - a.x) / d, uy = (b.y - a.y) / d, f = n => n.toFixed(1);
    if (l.k === 'line') { // straight: the line stops at the head's base
      const H = 15, W = 7.5, e = { x: b.x - ux * H, y: b.y - uy * H };
      return { d: `M${f(a.x)} ${f(a.y)}L${f(e.x)} ${f(e.y)}`, head: `M${f(b.x)} ${f(b.y)}L${f(e.x - uy * W)} ${f(e.y + ux * W)}L${f(e.x + uy * W)} ${f(e.y - ux * W)}Z`, at: t => ({ x: a.x + (e.x - a.x) * t, y: a.y + (e.y - a.y) * t }) };
    }
    const c1 = { x: a.x + (a.free ? ux : a.nx) * k, y: a.y + (a.free ? uy : a.ny) * k }, c2 = { x: b.x + (b.free ? -ux : b.nx) * k, y: b.y + (b.free ? -uy : b.ny) * k };
    if (l.k === 'connect') { // leaves and enters each item square to its side; a dot marks both anchors, no head
      const at = t => { const u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }; };
      return { d: `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`, head: '', dots: [a, b], at };
    }
    const tl = Math.hypot(b.x - c2.x, b.y - c2.y) || 1, hx = (b.x - c2.x) / tl, hy = (b.y - c2.y) / tl, H = 15, W = 7.5, e = { x: b.x - hx * H, y: b.y - hy * H }; // the line stops at the head's base
    const at = t => { const u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y }; };
    return { d: `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`, head: `M${f(b.x)} ${f(b.y)}L${f(e.x - hy * W)} ${f(e.y + hx * W)}L${f(e.x + hy * W)} ${f(e.y - hx * W)}Z`, at };
  }
  function drawLinks() {
    if (!links) return;
    B().links = B().links.filter(l => (!l.a.id || item(l.a.id)) && (!l.b.id || item(l.b.id))); // ends whose note was deleted elsewhere
    let h = '';
    for (const l of [...B().links, ...(linking ? [{ ...linking, id: 'live', live: true }] : [])]) {
      const g = geom(l), on = l.id === selLink, m = g.at(.5);
      h += `<g class="lnk ${on ? 'sel' : ''} ${l.live ? 'live' : ''}" data-l="${l.id}" style="--c:${l.c || color}"><path class="hit" d="${g.d}"/><path class="ln" d="${g.d}"/>${g.head ? `<path class="hd" d="${g.head}"/>` : ''}${g.dots ? g.dots.map(p => `<circle class="dt" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"/>`).join('') : ''}${on ? `<g class="ldel" transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})" role="button" aria-label="Delete arrow"><circle r="12"/><path d="M-4.5-4.5L4.5 4.5M4.5-4.5L-4.5 4.5"/></g>` : ''}</g>`;
    }
    links.innerHTML = h;
  }
  function removeLink(id) {
    const l = B().links.find(x => x.id === id); if (!l) return;
    B().links = B().links.filter(x => x !== l); selLink = null;
    undo.push({ k: 'link', add: [], del: [l] }); redo = []; sfx.trash(); save(); drawLinks();
  }

  function eraseAt(e) {
    const [x, y] = toWorld(e.clientX, e.clientY), r = 12 / V().z, keep = [];
    for (const s of B().strokes) {
      let hit = false; const rr = (r + s.s * WIDTH[s.t] / 2) ** 2;
      for (let i = 0; i < s.p.length && !hit; i += 2) hit = (s.p[i] - x) ** 2 + (s.p[i + 1] - y) ** 2 < rr;
      (hit ? erased : keep).push(s);
    }
    if (keep.length !== B().strokes.length) { B().strokes = keep; redraw(); }
    // the eraser also removes arrows it touches
    const gone = B().links.filter(l => { const g = geom(l); for (let t = 0; t <= 1; t += 1 / 20) { const p = g.at(t); if ((p.x - x) ** 2 + (p.y - y) ** 2 < (r + 4) ** 2) return true; } return false; });
    if (gone.length) { B().links = B().links.filter(l => !gone.includes(l)); erased.links = [...(erased.links || []), ...gone]; drawLinks(); }
  }
  function history(fromStack, toStack) {
    const a = fromStack.pop(); if (!a) return;
    if (a.k === 'link') B().links = B().links.filter(l => !a.add.includes(l)).concat(a.del);
    else B().strokes = B().strokes.filter(s => !a.add.includes(s)).concat(a.del);
    toStack.push({ k: a.k, add: a.del, del: a.add }); sfx.tap(); redraw(); drawLinks(); save();
  }
  function setTool(t) {
    tool = t; wrap.dataset.tool = t; selLink = null; drawLinks();
    $$('.tools [data-tool]', wrap).forEach(b => { b.classList.toggle('on', b.dataset.tool === t); b.setAttribute('aria-pressed', b.dataset.tool === t); });
  }

  // ----- moving notes and pictures: a press becomes a drag after 4px, otherwise it stays a click -----
  function dragItem(el, s, e) {
    if (e.button) return;
    e.preventDefault();
    const z = V().z, ox = e.clientX / z - s.x, oy = e.clientY / z - s.y, sx = e.clientX, sy = e.clientY; let lx = sx, on = false;
    const move = ev => {
      if (!on) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        on = true; s.z = ++zTop; el.style.zIndex = s.z; el.classList.remove('settle', 'plop'); el.classList.add('lift'); sfx.pick();
      }
      s.x = ev.clientX / z - ox; s.y = ev.clientY / z - oy; el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
      el.style.setProperty('--tilt', L.clamp((ev.clientX - lx) * 1.2, -12, 12) + 'deg'); lx = ev.clientX; // lean into the motion
      drawLinks();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!on) return;
      el._moved = true; setTimeout(() => (el._moved = false)); // swallow the click that follows a drag
      el.classList.remove('lift'); el.style.setProperty('--tilt', '0deg'); replay(el, 'settle'); sfx.drop(); save();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function dropItem(s, el) {
    const pic = !('t' in s), list = pic ? B().images : B().stickies, i = list.indexOf(s), gone = B().links.filter(l => l.a.id === s.id || l.b.id === s.id);
    list.splice(i, 1); B().links = B().links.filter(l => !gone.includes(l)); sfx.trash(); save(); drawLinks();
    el.animate([{ transform: `rotate(${s.r || 0}deg)` }, { transform: 'scale(1.1) rotate(-6deg)', offset: .25 }, { transform: 'scale(0) rotate(40deg) translateY(60px)', opacity: 0 }], { duration: 320, easing: 'ease-in' }).onfinish = () => el.remove();
    toast(pic ? 'Picture deleted.' : s.k === 'node' ? 'Node deleted.' : 'Sticky note deleted.', '', ['Undo', () => { list.splice(i, 0, s); B().links.push(...gone); world?.append(pic ? imageEl(s) : stickyEl(s)); drawLinks(); save(); }]);
    if (pic) setTimeout(() => { if (!B().images.includes(s)) idb.del(s.id).catch(() => {}); }, 7000); // after the Undo window
  }

  // ----- sticky notes -----
  // A node is a card that grows with its text (markdown, shown rendered until double-clicked). It lives in the stickies list with k: 'node'.
  function nodeEl(s) {
    const el = document.createElement('div');
    el.className = 'bnode'; el.dataset.id = s.id; el.tabIndex = 0;
    el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;--rot:0deg;${s.c ? `--c:${s.c};` : ''}z-index:${s.z || 1}`;
    el.innerHTML = `<div class="nbar" title="Drag to move">${NODE_C.map(c => `<button style="background:${c || 'var(--panel2)'}" data-c="${c}" aria-label="${c ? 'Colour ' + c : 'No colour'}"></button>`).join('')}<button class="del" aria-label="Delete node">${icon('trash', 15)}</button></div>
      <div class="nview mdv"></div><div class="ntext" contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="Node text (markdown)" data-ph="Write… markdown works" hidden></div>${ANC}`;
    const view = $('.nview', el), txt = $('.ntext', el), bar = $('.nbar', el);
    const show = () => { view.innerHTML = s.t.trim() ? L.md(s.t) : '<p class="muted">Double-click to write</p>'; hydrate(view); };
    el._edit = () => {
      view.hidden = true; txt.hidden = false; txt.textContent = s.t; txt.focus();
      const r = document.createRange(); r.selectNodeContents(txt); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    txt.oninput = () => { s.t = txt.innerText; save(); };
    txt.onblur = () => { txt.hidden = true; view.hidden = false; show(); };
    txt.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); txt.blur(); el.focus(); } };
    view.ondblclick = el._edit;
    el.onkeydown = e => { if (e.target !== el) return; if (e.key === 'Enter') { e.preventDefault(); el._edit(); } else if (e.key === 'Delete') dropItem(s, el); };
    bar.onclick = e => {
      const b = e.target.closest('button'); if (!b || el._moved) return;
      if (b.dataset.c != null) { s.c = b.dataset.c; s.c ? el.style.setProperty('--c', s.c) : el.style.removeProperty('--c'); sfx.tap(); return save(); }
      dropItem(s, el);
    };
    el.onpointerdown = e => { if (!e.target.closest('.ntext:not([hidden]),.anc,a,input,summary')) dragItem(el, s, e); };
    show();
    return el;
  }
  function stickyEl(s) {
    if (s.k === 'node') return nodeEl(s);
    const el = document.createElement('div');
    el.className = 'sticky'; el.dataset.id = s.id;
    el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;--c:${s.c};--rot:${s.r}deg;z-index:${s.z || 1}`;
    el.innerHTML = `<i class="tape"></i><div class="sbar" title="Drag to move">${STICKY.map(c => `<button style="background:${c}" data-c="${c}" aria-label="Change colour"></button>`).join('')}<button class="del" aria-label="Delete note">${icon('trash', 16)}</button></div><div class="stext" contenteditable="plaintext-only" role="textbox" aria-label="Sticky note" data-ph="Write something…"></div>${ANC}`;
    const bar = $('.sbar', el), txt = $('.stext', el);
    txt.textContent = s.t;
    txt.oninput = () => { s.t = txt.innerText; save(); };
    el.onpointerup = () => { if (el.offsetWidth !== s.w || el.offsetHeight !== s.h) { s.w = el.offsetWidth; s.h = el.offsetHeight; save(); drawLinks(); } }; // native CSS resize handle
    bar.onclick = e => {
      const b = e.target.closest('button'); if (!b || el._moved) return;
      if (b.dataset.c) { s.c = b.dataset.c; el.style.setProperty('--c', s.c); sfx.tap(); return save(); }
      dropItem(s, el);
    };
    // The whole top strip drags, colour dots included.
    bar.onpointerdown = e => dragItem(el, s, e);
    return el;
  }
  function addSticky(c, x, y, from, k) {
    const s = k === 'node' ? { id: uid(), k, x: Math.round(x), y: Math.round(y), w: 260, h: 90, c: '', t: '', r: 0, z: ++zTop }
      : { id: uid(), x: Math.round(x), y: Math.round(y), w: 190, h: 170, c, t: '', r: +(Math.random() * 5 - 2.5).toFixed(1), z: ++zTop };
    B().stickies.push(s);
    const el = world.appendChild(stickyEl(s));
    if (k === 'node') nro?.observe(el);
    if (from && !reduced()) { // click-to-add: the note flies from the tray on an arc
      const a = from.getBoundingClientRect(), b = el.getBoundingClientRect(), z = V().z, dx = (a.left - b.left) / z, dy = (a.top - b.top) / z;
      el.animate([{ transform: `translate(${dx}px,${dy}px) scale(.3) rotate(-25deg)` }, { transform: `translate(${dx * .35}px,${dy * .35 - 110}px) scale(1.12) rotate(10deg)`, offset: .6 },
        { transform: `translate(0,6px) scale(1.06,.9) rotate(${s.r}deg)`, offset: .85 }, { transform: `rotate(${s.r}deg)` }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
      setTimeout(() => sfx.drop(), 420);
    } else { el.classList.add('plop'); sfx.drop(); }
    save(); checkAch();
    setTimeout(() => { if (tool === 'hand' && el.isConnected) el._edit ? el._edit() : $('.stext', el).focus(); }, from ? 540 : 60); // do not steal focus if the user already moved on
  }
  function trayDrag(pad) {
    pad.onpointerdown = e => {
      e.preventDefault(); pad.setPointerCapture(e.pointerId);
      const c = pad.dataset.c, k = pad.dataset.k, sx = e.clientX, sy = e.clientY; let ghost = null, lx = sx;
      pad.onpointermove = ev => {
        const z = V().z;
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          ghost = document.createElement('div'); ghost.className = k ? 'bnode ghost' : 'sticky ghost'; if (c) ghost.style.setProperty('--c', c); ghost.innerHTML = k ? '' : '<i class="tape"></i>';
          document.body.append(ghost); sfx.pick();
        }
        if (ghost) {
          ghost.style.left = ev.clientX - 95 * z + 'px'; ghost.style.top = ev.clientY - 17 * z + 'px';
          ghost.style.transform = `scale(${z}) rotate(${L.clamp((ev.clientX - lx) * 1.2, -12, 12)}deg)`; lx = ev.clientX;
        }
      };
      pad.onpointerup = pad.onpointercancel = ev => {
        pad.onpointermove = pad.onpointerup = pad.onpointercancel = null;
        setTool('hand');
        if (!ghost) { const r = wrap.getBoundingClientRect(), [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); return addSticky(c, x - 95 + Math.random() * 60 - 30, y - 85 + Math.random() * 60 - 30, pad, k); }
        ghost.remove();
        const r = wrap.getBoundingClientRect(), over = document.elementFromPoint(ev.clientX, ev.clientY);
        if (ev.type === 'pointercancel' || over?.closest('.tray') || ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return sfx.tap(); // dropped back on the tray: cancel
        const z = V().z, [x, y] = toWorld(ev.clientX - 95 * z, ev.clientY - 17 * z);
        addSticky(c, x, y, null, k);
      };
    };
  }

  // ----- pictures -----
  function imageEl(m) {
    const el = document.createElement('figure');
    el.className = 'bimg'; el.dataset.id = m.id; el.tabIndex = 0;
    el.style.cssText = `left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;z-index:${m.z || 1}`;
    el.innerHTML = `<img alt="${esc(m.name || 'Picture')}" draggable="false"><div class="ibar"><button data-k="dl" aria-label="Save picture">${icon('down', 16)}</button><button data-k="del" aria-label="Delete picture">${icon('trash', 16)}</button></div><i class="grip" title="Drag to resize"></i>${ANC}`;
    idb.get(m.id).then(b => { if (!b) return el.classList.add('missing'); const u = URL.createObjectURL(b); urls.push(u); $('img', el).src = u; }).catch(() => el.classList.add('missing'));
    el.onpointerdown = e => { if (!e.target.closest('.ibar,.grip,.anc')) dragItem(el, m, e); };
    $('.ibar', el).onclick = e => {
      const b = e.target.closest('button'); if (!b || el._moved) return;
      if (b.dataset.k === 'del') return dropItem(m, el);
      idb.get(m.id).then(blob => blob ? saveFile((m.name || 'picture').replace(/\.\w+$/, '') + '.' + (blob.type.split('/')[1] || 'png'), blob, blob.type) : toast('That picture is missing.', 'bad'));
    };
    el.onkeydown = e => { if (e.key === 'Delete') dropItem(m, el); };
    // Resize from the corner keeps the picture's proportions.
    $('.grip', el).onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      const z = V().z, sx = e.clientX, w0 = m.w, ratio = m.h / m.w;
      const move = ev => { m.w = Math.round(L.clamp(w0 + (ev.clientX - sx) / z, 60, 2400)); m.h = Math.round(m.w * ratio); el.style.width = m.w + 'px'; el.style.height = m.h + 'px'; drawLinks(); };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); save(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };
    return el;
  }
  async function addImages(files, cx, cy) {
    const pics = [...(files || [])].filter(f => f.type.startsWith('image/'));
    if (!pics.length) return toast('Only pictures can go on the board.', 'bad');
    const [x, y] = toWorld(cx, cy); let n = 0;
    for (const f of pics) {
      try {
        const bmp = await createImageBitmap(f), w0 = bmp.width, h0 = bmp.height; bmp.close?.();
        let blob = f;
        if (Math.max(w0, h0) > 2400 || f.size > 3e6) { const c = await shrinkImage(f, 2400); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .88)); } // keep phone photos light
        const w = Math.min(w0, 360 / V().z), h = w * h0 / w0; // about 360px on screen at the current zoom
        const m = { id: uid(), x: Math.round(x - w / 2 + n * 28), y: Math.round(y - h / 2 + n * 28), w: Math.round(w), h: Math.round(h), z: ++zTop, name: (f.name || 'Pasted picture').slice(0, 60) };
        await idb.put(m.id, blob);
        B().images.push(m); world.appendChild(imageEl(m)).classList.add('plop'); n++;
      } catch { toast(`Could not add ${f.name || 'that picture'}.`, 'bad'); }
    }
    if (n) { sfx.drop(); save(); setTool('hand'); }
  }
  const atCenter = () => { const r = wrap.getBoundingClientRect(); return lastPt || [r.left + r.width / 2, r.top + r.height / 2]; };
  const onPaste = e => {
    const f = [...(e.clipboardData?.files || [])].filter(x => x.type.startsWith('image/'));
    if (!f.length || cur !== 'board') return;
    e.preventDefault(); addImages(f, ...atCenter());
  };

  // Save the whole board (not just the visible part) as a PNG.
  function exportPng() {
    const st = B().stickies, sk = B().strokes, im = B().images;
    if (!st.length && !sk.length && !im.length) return toast('The board is empty.');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of [...st, ...im]) { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); }
    for (const s of sk) for (let i = 0; i < s.p.length; i += 2) grow(s.p[i], s.p[i + 1]);
    for (const l of B().links) for (const e of [l.a, l.b]) if (!e.id) grow(e.x, e.y);
    const pad = 60, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2, k = Math.min(2, 6000 / Math.max(w, h)), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    g.scale(k, k); g.fillStyle = getComputedStyle(wrap).backgroundColor; g.fillRect(0, 0, w, h); g.translate(pad - x0, pad - y0);
    for (const l of B().links) {
      const gm = geom(l); g.strokeStyle = g.fillStyle = l.c || color; g.lineWidth = 3; g.lineCap = 'round'; g.stroke(new Path2D(gm.d));
      if (gm.head) g.fill(new Path2D(gm.head));
      for (const p of gm.dots || []) { g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill(); }
    }
    const css = getComputedStyle(wrap), tok = n => css.getPropertyValue(n).trim();
    for (const s of [...st, ...im].sort((a, b) => (a.z || 0) - (b.z || 0))) {
      if (!('t' in s)) { const img = $(`[data-id="${s.id}"] img`, world); if (img?.naturalWidth) g.drawImage(img, s.x, s.y, s.w, s.h); continue; }
      g.save(); g.translate(s.x + s.w / 2, s.y + s.h / 2); g.rotate(s.r * Math.PI / 180); g.translate(-s.w / 2, -s.h / 2);
      const node = s.k === 'node';
      g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 14; g.shadowOffsetY = 6; g.fillStyle = node ? tok('--panel') : s.c; g.fillRect(0, 0, s.w, s.h); g.shadowColor = 'transparent';
      if (node) { g.fillStyle = s.c || tok('--line'); g.fillRect(0, 0, s.w, 5); }
      g.fillStyle = node ? tok('--text') : '#2a2433'; g.font = '15px "Segoe UI", sans-serif'; g.textBaseline = 'top';
      let y = node ? 18 : 36;
      for (const para of (node ? s.t.split('\n').map(L.plain) : s.t.split('\n'))) { // simple word wrap inside the note
        let line = '';
        for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (line && g.measureText(t).width > s.w - 28) { g.fillText(line, 14, y); y += 21; line = word; } else line = t; }
        g.fillText(line, 14, y); y += 21; if (y > s.h - 12) break;
      }
      g.restore();
    }
    const live2d = ctx; ctx = g; for (const s of sk) path(s); ctx = live2d; // strokes sit above the notes, as on screen
    c.toBlob(b => { saveFile('big-archive.png', b, 'image/png'); toast('Board saved as big-archive.png.'); });
  }

  const key = e => {
    if (e.target.closest('input,textarea,[contenteditable]')) return;
    if (e.code === 'Space') { space = e.type === 'keydown'; wrap.classList.toggle('panning', space); return e.preventDefault(); }
    if (e.type !== 'keydown') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? history(redo, undo) : history(undo, redo); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); return history(redo, undo); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selLink) { e.preventDefault(); return removeLink(selLink); }
    const t = { v: 'hand', l: 'line', a: 'arrow', k: 'connect', p: 'pen', m: 'marker', h: 'hl', e: 'eraser' }[e.key.toLowerCase()];
    if (t && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(t);
  };

  PAGES.board = {
    flush: true,
    render(root) {
      if (!color || color === COLORS[0] || color === COLORS[1]) color = isDark() ? COLORS[0] : COLORS[1];
      root.innerHTML = `<div class="board" data-tool="${tool}"><canvas></canvas><div class="world"><svg class="links" width="1" height="1" aria-hidden="true"></svg></div>
        <div class="bd-title aux"><h2>Your Big Archive</h2><span class="muted">Drag to move · scroll to zoom · paste or drop pictures</span></div>
        <div class="tray aux"><div class="pad nodepad" data-k="node" role="button" tabindex="0" aria-label="Add a node card that grows with its text. Drag onto the board or press Enter."><i></i><i></i><i></i></div><small>Node</small><small>Sticky<br>notes</small>${STICKY.map(c => `<div class="pad" style="--c:${c}" data-c="${c}" role="button" tabindex="0" aria-label="Add sticky note. Drag onto the board or press Enter."></div>`).join('')}<small>drag me</small></div>
        <div class="tools" role="toolbar" aria-label="Drawing tools">${TOOLS.map(([t, label, ic, w]) => `<button class="icb" data-tool="${t}" title="${label}" aria-label="${label}">${icon(ic, 22, w || 1.8)}</button>`).join('')}
          <button class="icb" data-h="img" title="Add pictures (or paste / drop them)" aria-label="Add pictures">${icon('image', 22)}</button>
          <span class="sep"></span>${COLORS.map(c => `<button class="col ${c === color ? 'on' : ''}" style="--c:${c}" data-col="${c}" aria-label="Colour ${c}"></button>`).join('')}
          <span class="sep"></span>${[2, 3, 5].map((s, i) => `<button class="sz ${s === size ? 'on' : ''}" data-size="${s}" aria-label="${['Thin', 'Medium', 'Thick'][i]} line"><i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i></button>`).join('')}
          <span class="sep"></span><button class="icb" data-h="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button><button class="icb" data-h="redo" title="Redo (Ctrl+Y)" aria-label="Redo">${icon('redo')}</button></div>
        <div class="zoom aux"><button class="icb" data-zoom=".8" aria-label="Zoom out">${icon('minus')}</button><b id="bdz"></b><button class="icb" data-zoom="1.25" aria-label="Zoom in">${icon('plus')}</button><button class="icb" data-zoom="0" title="Back to centre" aria-label="Back to centre">${icon('target')}</button><button class="icb" data-png title="Save board as image" aria-label="Save board as image">${icon('down')}</button></div>
        <div class="drophint" aria-hidden="true">${icon('image', 30)}<b>Drop pictures to pin them</b></div></div>`;
      wrap = $('.board', root); cv = $('canvas', wrap); ctx = cv.getContext('2d'); world = $('.world', wrap); links = $('.links', wrap); selLink = linking = null; lastPt = null;
      zTop = Math.max(1, ...B().stickies.map(s => s.z || 1), ...B().images.map(s => s.z || 1));
      // Nodes size themselves to their text; their measured box feeds arrows and the PNG export.
      nro = new ResizeObserver(es => { for (const en of es) { const s = item(en.target.dataset.id); if (s && en.target.isConnected) { s.w = en.target.offsetWidth; s.h = en.target.offsetHeight; } } drawLinks(); });
      for (const s of B().stickies) { const el = world.appendChild(stickyEl(s)); if (s.k === 'node') nro.observe(el); }
      for (const m of B().images) world.append(imageEl(m));
      $$('.pad', wrap).forEach(p => { trayDrag(p); p.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const r = wrap.getBoundingClientRect(), [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); setTool('hand'); addSticky(p.dataset.c, x - 95, y - 85, p, p.dataset.k); } }; });
      setTool(tool);

      $('.tools', wrap).onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tool) setTool(b.dataset.tool);
        else if (b.dataset.col) { color = b.dataset.col; $$('.col', wrap).forEach(x => x.classList.toggle('on', x === b)); if (tool === 'hand' || tool === 'eraser') setTool('pen'); }
        else if (b.dataset.size) { size = +b.dataset.size; $$('.sz', wrap).forEach(x => x.classList.toggle('on', x === b)); }
        else if (b.dataset.h === 'img') { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true }); inp.onchange = () => addImages(inp.files, ...atCenter()); inp.click(); }
        else if (b.dataset.h) b.dataset.h === 'undo' ? history(undo, redo) : history(redo, undo);
      };
      $('.zoom', wrap).onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.png != null) return exportPng();
        const r = wrap.getBoundingClientRect();
        if (+b.dataset.zoom) zoomAt(r.left + r.width / 2, r.top + r.height / 2, +b.dataset.zoom);
        else { Object.assign(V(), { x: 0, y: 0, z: 1 }); redraw(); save(); }
      };
      // Arrows: clicking one selects it; its round button (or Delete) removes it.
      links.onclick = e => {
        if (e.target.closest('.ldel')) return removeLink(selLink);
        const g = e.target.closest('.lnk'); if (!g || tool !== 'hand') return;
        selLink = g.dataset.l; sfx.tap(); drawLinks();
      };
      wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015)); }, { passive: false });
      // The arrow tool runs in the capture phase, so pressing on a note starts an arrow instead of moving or editing it.
      wrap.addEventListener('pointerdown', e => {
        if (!LINKERS.has(tool) || e.button || space || e.target.closest('.tools,.tray,.zoom')) return;
        e.preventDefault(); e.stopPropagation(); document.activeElement?.blur?.(); wrap.setPointerCapture(e.pointerId);
        const hit = e.target.closest('.world [data-id]'), [x, y] = toWorld(e.clientX, e.clientY), side = hit && tool === 'connect' ? e.target.closest('.anc')?.dataset.side || nearSide(item(hit.dataset.id), x, y) : null;
        linking = { a: hit ? { id: hit.dataset.id, ...(side && { side }) } : { x, y }, b: { x, y }, c: color, k: tool === 'arrow' ? undefined : tool, sx: e.clientX, sy: e.clientY };
        drawLinks();
      }, true);
      wrap.onpointerdown = e => {
        if (e.target.closest('.tools,.tray,.zoom,.sticky,.bnode,.bimg,.lnk')) return;
        document.activeElement?.blur?.(); wrap.setPointerCapture(e.pointerId);
        if (selLink) { selLink = null; drawLinks(); }
        const v = V();
        if (tool === 'hand' || space || e.button === 1) { drag = { x: e.clientX - v.x, y: e.clientY - v.y }; wrap.classList.add('panning'); }
        else if (tool === 'eraser') { erased = []; eraseAt(e); }
        else { const [x, y] = toWorld(e.clientX, e.clientY); live = { t: tool, c: color, s: size, p: [Math.round(x * 10) / 10, Math.round(y * 10) / 10] }; sfx.draw(); redraw(); }
      };
      wrap.onpointermove = e => {
        lastPt = [e.clientX, e.clientY];
        if (linking) {
          const [x, y] = toWorld(e.clientX, e.clientY), over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.world [data-id]');
          $$('.world .target', wrap).forEach(el => el !== over && el.classList.remove('target'));
          $$('.anc.hot', wrap).forEach(a => a.classList.remove('hot'));
          const ok = over && over.dataset.id !== linking.a.id, side = ok && linking.k === 'connect' ? nearSide(item(over.dataset.id), x, y) : null;
          if (ok) { over.classList.add('target'); if (side) $(`.anc[data-side="${side}"]`, over)?.classList.add('hot'); }
          linking.b = ok ? { id: over.dataset.id, ...(side && { side }) } : { x, y };
          return drawLinks();
        }
        if (drag) { const v = V(); v.x = e.clientX - drag.x; v.y = e.clientY - drag.y; return redraw(); }
        if (erased) return eraseAt(e);
        if (!live) return;
        for (const ev of e.getCoalescedEvents?.() ?? [e]) {
          const [x, y] = toWorld(ev.clientX, ev.clientY), p = live.p, n = p.length;
          if (Math.hypot(x - p[n - 2], y - p[n - 1]) > 1.2 / V().z) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        }
        redraw();
      };
      wrap.onpointerup = wrap.onpointercancel = e => {
        if (linking) {
          const l = linking; linking = null; $$('.world .target', wrap).forEach(el => el.classList.remove('target')); $$('.anc.hot', wrap).forEach(a => a.classList.remove('hot'));
          const far = Math.hypot(e.clientX - l.sx, e.clientY - l.sy) > 10, same = l.a.id && l.a.id === l.b.id;
          if (e.type === 'pointerup' && far && !same) {
            const nl = { id: uid(), a: l.a, b: l.b, c: l.c, ...(l.k && { k: l.k }) }; B().links.push(nl); undo.push({ k: 'link', add: [nl], del: [] }); redo = []; sfx.drop(); save();
          }
          return drawLinks();
        }
        if (drag) { drag = null; wrap.classList.toggle('panning', space); save(); }
        if (erased) { if (erased.length || erased.links) { undo.push({ add: [], del: erased }); if (erased.links) undo.push({ k: 'link', add: [], del: erased.links }); redo = []; sfx.trash(); save(); } erased = null; }
        if (live) { B().strokes.push(live); undo.push({ add: [live], del: [] }); redo = []; live = null; redraw(); save(); }
      };
      // Drop picture files anywhere on the board.
      wrap.ondragover = e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('dropping'); } };
      wrap.ondragleave = e => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('dropping'); };
      wrap.ondrop = e => { e.preventDefault(); wrap.classList.remove('dropping'); addImages(e.dataTransfer.files, e.clientX, e.clientY); };
      addEventListener('keydown', key); addEventListener('keyup', key); document.addEventListener('paste', onPaste);
      ro = new ResizeObserver(redraw); ro.observe(wrap);
      redraw(); drawLinks();
    },
    leave() {
      removeEventListener('keydown', key); removeEventListener('keyup', key); document.removeEventListener('paste', onPaste);
      ro?.disconnect(); nro?.disconnect(); cancelAnimationFrame(raf); raf = 0; live = drag = erased = linking = null; links = null;
      urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    },
  };
})();
