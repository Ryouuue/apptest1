// Pure game logic for the Break room: chess (full rules + three bots), minesweeper and sudoku.
// Shared by the browser (window.TempoGames) and tests/games.test.js (node).
(function (root) {
  'use strict';
  const now = () => Date.now();
  const shuffle = (a, rnd = Math.random) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ================= chess =================
  // Board: 64 chars, index 0 = a8 … 63 = h1. White is upper case, '.' is empty.
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const isW = p => p >= 'A' && p <= 'Z';
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function fromFen(f) {
    const [pos, turn, castle, ep] = f.split(' '), b = [];
    for (const ch of pos.replace(/\//g, '')) /\d/.test(ch) ? b.push(...'.'.repeat(+ch)) : b.push(ch);
    return { b, turn, castle: castle === '-' ? '' : castle, ep: ep && ep !== '-' ? (8 - +ep[1]) * 8 + ep.charCodeAt(0) - 97 : -1, half: 0 };
  }
  const sqName = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));

  // Is square sq attacked by the given side?
  function attacked(b, sq, byWhite) {
    const r = sq >> 3, c = sq & 7, at = (rr, cc) => (on(rr, cc) ? b[rr * 8 + cc] : null), mine = s => (byWhite ? s : s.toLowerCase());
    for (const dc of [-1, 1]) if (at(r + (byWhite ? 1 : -1), c + dc) === mine('P')) return true; // a white pawn attacks upward, so it sits one row below
    for (const [a, d] of KN) if (at(r + a, c + d) === mine('N')) return true;
    for (const [a, d] of KG) if (at(r + a, c + d) === mine('K')) return true;
    for (const [dirs, set] of [[DIAG, 'BQ'], [ORTH, 'RQ']]) for (const [a, d] of dirs) {
      for (let rr = r + a, cc = c + d; on(rr, cc); rr += a, cc += d) {
        const p = b[rr * 8 + cc]; if (p === '.') continue;
        if (isW(p) === byWhite && set.includes(p.toUpperCase())) return true;
        break;
      }
    }
    return false;
  }
  const inCheck = st => { const w = st.turn === 'w'; return attacked(st.b, st.b.indexOf(w ? 'K' : 'k'), !w); };

  function pseudo(st) {
    const { b } = st, w = st.turn === 'w', out = [];
    const mine = p => p !== '.' && isW(p) === w, theirs = p => p !== '.' && isW(p) !== w;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!mine(p)) continue;
      const r = i >> 3, c = i & 7, t = p.toUpperCase(), add = (to, extra) => out.push({ f: i, t: to, p, x: b[to], ...extra });
      if (t === 'P') {
        const dir = w ? -1 : 1, r1 = r + dir, last = w ? 0 : 7;
        const push = to => (r1 === last ? 'QRBN'.split('').forEach(q => add(to, { promo: w ? q : q.toLowerCase() })) : add(to));
        if (on(r1, c) && b[r1 * 8 + c] === '.') { push(r1 * 8 + c); if (r === (w ? 6 : 1) && b[(r + 2 * dir) * 8 + c] === '.') add((r + 2 * dir) * 8 + c, { dbl: true }); }
        for (const dc of [-1, 1]) {
          if (!on(r1, c + dc)) continue;
          const to = r1 * 8 + c + dc;
          if (theirs(b[to])) push(to); else if (to === st.ep) add(to, { ep: true, x: w ? 'p' : 'P' });
        }
      } else if (t === 'N' || t === 'K') {
        for (const [a, d] of t === 'N' ? KN : KG) if (on(r + a, c + d) && !mine(b[(r + a) * 8 + c + d])) add((r + a) * 8 + c + d);
        const home = w ? 60 : 4;
        if (t === 'K' && i === home && !attacked(b, home, !w)) {
          const R = w ? 'R' : 'r';
          if (st.castle.includes(w ? 'K' : 'k') && b[home + 1] === '.' && b[home + 2] === '.' && b[home + 3] === R && !attacked(b, home + 1, !w) && !attacked(b, home + 2, !w)) add(home + 2, { castle: 'k' });
          if (st.castle.includes(w ? 'Q' : 'q') && b[home - 1] === '.' && b[home - 2] === '.' && b[home - 3] === '.' && b[home - 4] === R && !attacked(b, home - 1, !w) && !attacked(b, home - 2, !w)) add(home - 2, { castle: 'q' });
        }
      } else {
        for (const [a, d] of t === 'B' ? DIAG : t === 'R' ? ORTH : [...DIAG, ...ORTH]) {
          for (let rr = r + a, cc = c + d; on(rr, cc); rr += a, cc += d) { const to = rr * 8 + cc; if (mine(b[to])) break; add(to); if (b[to] !== '.') break; }
        }
      }
    }
    return out;
  }
  function play(st, m) {
    const b = st.b.slice(), w = st.turn === 'w';
    b[m.t] = m.promo || m.p; b[m.f] = '.';
    if (m.ep) b[m.t + (w ? 8 : -8)] = '.';
    if (m.castle) { const rf = m.castle === 'k' ? m.t + 1 : m.t - 2, rt = m.castle === 'k' ? m.t - 1 : m.t + 1; b[rt] = b[rf]; b[rf] = '.'; }
    let castle = st.castle;
    if (m.p === 'K') castle = castle.replace(/[KQ]/g, ''); else if (m.p === 'k') castle = castle.replace(/[kq]/g, '');
    for (const [sq, f] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.f === sq || m.t === sq) castle = castle.replace(f, '');
    return { b, turn: w ? 'b' : 'w', castle, ep: m.dbl ? (m.f + m.t) / 2 : -1, half: m.p.toUpperCase() === 'P' || m.x !== '.' ? 0 : st.half + 1 };
  }
  const legal = st => { const w = st.turn === 'w'; return pseudo(st).filter(m => { const n = play(st, m); return !attacked(n.b, n.b.indexOf(w ? 'K' : 'k'), !w); }); };
  // shortcut: no threefold-repetition rule; add a position history if games start looping.
  function status(st) {
    const rest = st.b.filter(p => p !== '.' && p.toUpperCase() !== 'K');
    if (!legal(st).length) return inCheck(st) ? 'mate' : 'stalemate';
    if (st.half >= 100 || !rest.length || (rest.length === 1 && 'NBnb'.includes(rest[0]))) return 'draw';
    return inCheck(st) ? 'check' : 'play';
  }
  const perft = (st, d) => (d ? legal(st).reduce((n, m) => n + perft(play(st, m), d - 1), 0) : 1);

  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  // Material plus small bonuses for central minor pieces and advanced pawns; from white's point of view.
  function evaluate(b) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (p === '.') continue;
      const t = p.toUpperCase(), w = isW(p), r = i >> 3, c = i & 7, cen = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - c));
      const v = VAL[t] + (t === 'P' ? (w ? 6 - r : r - 1) * 8 + (c >= 2 && c <= 5 ? cen * 4 : 0) : t === 'N' || t === 'B' ? cen * 10 : t === 'Q' ? cen * 3 : 0);
      s += w ? v : -v;
    }
    return s;
  }
  const order = ms => ms.sort((a, b) => ((b.x !== '.' ? VAL[b.x.toUpperCase()] * 10 - VAL[b.p.toUpperCase()] : 0) + (b.promo ? 800 : 0)) - ((a.x !== '.' ? VAL[a.x.toUpperCase()] * 10 - VAL[a.p.toUpperCase()] : 0) + (a.promo ? 800 : 0)));
  const MATE = 1e5;
  function quiesce(st, alpha, beta, cx, qd) {
    if (++cx.nodes % 512 === 0 && now() > cx.end) throw cx;
    const stand = (st.turn === 'w' ? 1 : -1) * evaluate(st.b);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd >= 4) return alpha;
    for (const m of order(legal(st).filter(m => m.x !== '.' || m.promo))) {
      const v = -quiesce(play(st, m), -beta, -alpha, cx, qd + 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function search(st, depth, alpha, beta, ply, cx, rootMoves) {
    if (++cx.nodes % 512 === 0 && now() > cx.end) throw cx;
    const ms = rootMoves || legal(st);
    if (!ms.length) return inCheck(st) ? -MATE + ply : 0;
    if (depth <= 0) return quiesce(st, alpha, beta, cx, 0);
    if (!rootMoves) order(ms);
    for (const m of ms) {
      const v = -search(play(st, m), depth - 1, -beta, -alpha, ply + 1, cx);
      if (v > alpha) { alpha = v; if (!ply) cx.best = m; }
      if (alpha >= beta) break;
    }
    return alpha;
  }
  // Three bots. Elo figures are rough targets, not measured ratings.
  const BOTS = [
    { id: 'twig', name: 'Twig', elo: 250, d: 'Moves almost at random and grabs loose pieces' },
    { id: 'bramble', name: 'Bramble', elo: 500, d: 'Greedy: takes material, misses most tactics' },
    { id: 'oakley', name: 'Oakley', elo: 1300, d: 'Looks three moves ahead and punishes blunders' },
  ];
  function botMove(st, level, rnd = Math.random, budget = 1200) {
    const ms = legal(st); if (!ms.length) return null;
    const pick = a => a[Math.floor(rnd() * a.length)];
    if (level === 'twig') { const caps = ms.filter(m => m.x !== '.'); return caps.length && rnd() < .35 ? pick(caps) : pick(ms); }
    if (level === 'bramble') {
      if (rnd() < .2) return pick(ms);
      const sgn = st.turn === 'w' ? 1 : -1; let best = ms[0], bv = -Infinity;
      for (const m of ms) {
        const n = play(st, m), v = !legal(n).length && inCheck(n) ? MATE : sgn * evaluate(n.b) + (rnd() - .5) * 120;
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
    // oakley: iterative deepening alpha-beta (to depth 3) with a capture search, inside a time budget
    const root = order(shuffle(ms, rnd)), cx = { nodes: 0, end: now() + budget, best: null };
    let best = root[0];
    for (let d = 1; d <= 3; d++) {
      try {
        cx.best = null; search(st, d, -Infinity, Infinity, 0, cx, root);
        if (cx.best) { best = cx.best; root.splice(root.indexOf(best), 1); root.unshift(best); } // search the last best first next round
      } catch (e) { if (e !== cx) throw e; break; }
    }
    return best;
  }

  // ================= minesweeper =================
  const MS = { easy: [9, 9, 10], inter: [16, 16, 40], hard: [16, 30, 99] };
  const around = (i, rows, cols) => { const r = Math.floor(i / cols), c = i % cols, o = []; for (const [a, d] of KG) if (r + a >= 0 && r + a < rows && c + d >= 0 && c + d < cols) o.push((r + a) * cols + c + d); return o; };
  // Mines are placed on the first click, never on or next to it, so the first click always opens an area.
  function msNew(rows, cols, n, safe, rnd = Math.random) {
    const ban = new Set([safe, ...around(safe, rows, cols)]), mine = new Array(rows * cols).fill(false);
    for (const i of shuffle([...mine.keys()].filter(i => !ban.has(i)), rnd).slice(0, n)) mine[i] = true;
    return { rows, cols, n, mine, num: mine.map((_, i) => around(i, rows, cols).filter(j => mine[j]).length), open: new Array(rows * cols).fill(false) };
  }
  // Opens a cell (flood-filling zeros) and returns the newly opened cells.
  function msOpen(g, i, flags = []) {
    const out = [], stack = [i];
    while (stack.length) {
      const j = stack.pop(); if (g.open[j] || flags[j]) continue;
      g.open[j] = true; out.push(j);
      if (!g.mine[j] && !g.num[j]) stack.push(...around(j, g.rows, g.cols));
    }
    return out;
  }
  const msWon = g => g.mine.every((m, i) => m || g.open[i]);

  // ================= sudoku =================
  const SD = { easy: 40, inter: 32, hard: 26 };
  const bits = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };
  function cands(g, i) {
    const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3; let m = 0;
    for (let k = 0; k < 9; k++) m |= 1 << g[r * 9 + k] | 1 << g[k * 9 + c] | 1 << g[(br + Math.floor(k / 3)) * 9 + bc + k % 3];
    return ~m & 0x3fe;
  }
  // Most-constrained cell first. fill() leaves a solution in g; count() stops at `limit` solutions.
  function mrv(g) { let best = -1, bm = 0, bn = 10; for (let i = 0; i < 81; i++) if (!g[i]) { const m = cands(g, i), n = bits(m); if (n < bn) { bn = n; best = i; bm = m; if (!n) break; } } return [best, bm, bn]; }
  function fill(g, rnd) {
    const [i, m, n] = mrv(g); if (i < 0) return true; if (!n) return false;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(v => m >> v & 1), rnd)) { g[i] = v; if (fill(g, rnd)) return true; }
    g[i] = 0; return false;
  }
  function count(g, limit = 2) {
    const [i, m, n] = mrv(g); if (i < 0) return 1; if (!n) return 0;
    let total = 0;
    for (let v = 1; v <= 9 && total < limit; v++) if (m >> v & 1) { g[i] = v; total += count(g, limit - total); }
    g[i] = 0; return total;
  }
  // A full random grid, then clues are removed while the puzzle still has exactly one solution.
  function sdNew(clues, rnd = Math.random) {
    const sol = new Array(81).fill(0); fill(sol, rnd);
    const puz = sol.slice(); let left = 81;
    for (const i of shuffle([...puz.keys()], rnd)) {
      if (left <= clues) break;
      const v = puz[i]; puz[i] = 0;
      if (count(puz.slice()) !== 1) puz[i] = v; else left--;
    }
    return { puz, sol };
  }

  const api = { START, fromFen, sqName, attacked, inCheck, pseudo, play, legal, status, perft, evaluate, botMove, BOTS, MS, around, msNew, msOpen, msWon, SD, sdNew, count, cands };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TempoGames = api;
})(typeof window !== 'undefined' ? window : globalThis);
