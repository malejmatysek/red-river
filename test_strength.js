// Ukazatel síly ruky: známé ruce → skóre, stupeň a equity musí dávat smysl (node test_strength.js)
const PE = require('./engine.js');
const C = s => PE.parseCards(s);
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const L = ['Slabá', 'Průměrná', 'Dobrá', 'Silná', 'Monstrum'];
// stará verze (v1.8.4) pro porovnání: preflop pásma z (chen-1)/19, postflop vždy proti 3 náhodným rukám
function oldStrength(h, b) {
  let v; if (b.length < 3) v = Math.max(0, Math.min(1, (PE.chen(h[0], h[1]) - 1) / 19)); else v = PE.equity(h, b, [{}, {}, {}], 4000, rng).equity;
  const tier = b.length < 3 ? (v >= 0.72 ? 4 : v >= 0.5 ? 3 : v >= 0.36 ? 2 : v >= 0.22 ? 1 : 0) : (v >= 0.8 ? 4 : v >= 0.58 ? 3 : v >= 0.42 ? 2 : v >= 0.25 ? 1 : 0);
  return { v, tier };
}
const cases = [
  ['AA preflop', 'As Ah', '', 5, t => t === 4],
  ['72o preflop', '7c 2d', '', 5, t => t === 0],
  ['3-5s preflop', '3d 5d', '', 5, t => t <= 1],
  ['AKs preflop', 'Ah Kh', '', 5, t => t === 4],
  ['JTs preflop', 'Jc Tc', '', 5, t => t === 2],
  ['flush draw (nut) 1 opp', 'Ah 9h', 'Kh 7h 2c', 1, t => t >= 2],
  ['flush draw 4 opps', 'Ah 9h', 'Kh 7h 2c', 4, t => t >= 1],
  ['top pair good kicker 1 opp', 'Ks Qd', 'Kh 7c 2d', 1, t => t >= 3],
  ['top pair good kicker 4 opps', 'Ks Qd', 'Kh 7c 2d', 4, t => t >= 2],
  ['air (high card) 3 opps', '9s 4d', 'Kh Qc 2d', 3, t => t === 0],
  ['set 2 opps', '7s 7d', 'Kh 7c 2d', 2, t => t === 4],
];
let fail = 0;
for (const [name, h, b, n, ok] of cases) {
  const hole = C(h), board = b ? C(b) : [];
  const o = oldStrength(hole, board), r = PE.strength(hole, board, 6000, rng, n);
  const eq = PE.equity(hole, board, Array.from({ length: n }, () => ({})), 6000, rng).equity;
  const score = board.length < 3 ? ` síla ${r.score}/20` : '';
  const pass = ok(r.tier); if (!pass) fail++;
  console.log(`${pass ? 'OK ' : 'ERR'} ${name.padEnd(28)}${score.padEnd(13)} vs ${n}: win ${(eq * 100).toFixed(0).padStart(2)} % (fér ${(100 / (n + 1)).toFixed(0)} %) | dřív: ${L[o.tier]} → teď: ${L[r.tier]}`);
}
if (fail) { console.log(fail + ' selhalo'); process.exit(1); } else console.log('vše OK');
