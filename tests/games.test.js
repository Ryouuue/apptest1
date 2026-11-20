// Run: node tests/games.test.js
const assert = require('assert');
const G = require('../js/games.js');

// chess move generation against known perft counts (covers castling, en passant, promotion, pins and checks)
assert.equal(G.perft(G.fromFen(G.START), 3), 8902);
assert.equal(G.perft(G.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2), 2039); // "Kiwipete"
assert.equal(G.perft(G.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3), 2812);
assert.equal(G.perft(G.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2), 264);

// game end states
let st = G.fromFen(G.START);
for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) st = G.play(st, G.legal(st).find(m => G.sqName(m.f) === f && G.sqName(m.t) === t));
assert.equal(G.status(st), 'mate', "fool's mate");
assert.equal(G.status(G.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'stalemate');
assert.equal(G.status(G.fromFen('7k/8/6K1/8/8/8/8/8 w - - 0 1')), 'draw', 'bare kings');

// every bot returns a legal move; the strong one takes a hanging queen and finds mate in one
const legalIds = s => G.legal(s).map(m => m.f + '-' + m.t);
for (const b of G.BOTS) { const m = G.botMove(G.fromFen(G.START), b.id); assert.ok(legalIds(G.fromFen(G.START)).includes(m.f + '-' + m.t), b.id); }
const hang = G.fromFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
assert.equal(G.sqName(G.botMove(hang, 'oakley').t), 'd5');
const m1 = G.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
const mm = G.botMove(m1, 'oakley'); assert.equal(G.status(G.play(m1, mm)), 'mate', 'back-rank mate in one');

// minesweeper: first click is never a mine and opens an area; counts are right
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const g = G.msNew(9, 9, 10, 40, rnd);
assert.equal(g.mine.filter(Boolean).length, 10);
assert.ok(!g.mine[40] && G.around(40, 9, 9).every(i => !g.mine[i]));
assert.ok(G.msOpen(g, 40).length >= 9);
assert.ok(g.num.every((n, i) => n === G.around(i, 9, 9).filter(j => g.mine[j]).length));
assert.ok(!G.msWon(g));
g.mine.forEach((m, i) => { if (!m) g.open[i] = true; }); assert.ok(G.msWon(g));

// sudoku: the puzzle has exactly one solution, it matches, and the clue count is near the target
for (const clues of [G.SD.easy, G.SD.hard]) {
  const { puz, sol } = G.sdNew(clues, rnd);
  assert.equal(G.count(puz.slice()), 1);
  assert.ok(puz.every((v, i) => !v || v === sol[i]));
  const n = puz.filter(Boolean).length; assert.ok(n >= clues && n <= clues + 6, `clues ${n}`);
  for (let i = 0; i < 81; i++) { const s = sol.slice(); s[i] = 0; assert.equal(G.cands(s, i), 1 << sol[i]); } // the solution is a valid grid
}

console.log('games ok');
