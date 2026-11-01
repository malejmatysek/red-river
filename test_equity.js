const PE = require('./engine.js'); const P = PE.parseCards;
const cases = [
  ['AA vs KK', 'AhAs', 'KdKc', '', 0.82],
  ['AKs vs QQ', 'AhKh', 'QsQd', '', 0.46],
  ['AKo vs 22', 'AhKd', '2s2c', '', 0.47],
  ['JTs vs 22', 'JsTs', '2h2d', '', 0.54],
  ['AA vs 72o', 'AsAd', '7h2c', '', 0.88],
  ['flop: AhKh vs QsQd na Qh7h2c', 'AhKh', 'QsQd', 'Qh7h2c', null],
];
let ok = true;
for (const [n, a, b, bd, exp] of cases) {
  const t = Date.now(); const r = PE.exactHeadsUp(P(a), P(b), P(bd));
  const mc = PE.equity(P(a), P(bd), [{ cards: P(b) }], 20000);
  const pass = exp == null || Math.abs(r.equity - exp) < 0.015;
  ok = ok && pass;
  console.log(`${pass ? 'OK ' : 'ERR'} ${n}: přesně ${(r.equity*100).toFixed(2)} % (výhra ${(r.win*100).toFixed(2)}, remíza ${(r.tie*100).toFixed(2)}, ${r.boards} boardů, ${Date.now()-t} ms) | MC 20k: ${(mc.equity*100).toFixed(2)} %${exp?` | očekáváno ~${exp*100} %`:''}`);
}
// hodnocení rukou
const h = s => PE.handName(P(s));
const hc = [['AsKsQsJsTs2c3d','Čistá postupka'],['Ah2c3d4s5h9c9d','Postupka'],['AhAcAdAs2h3c4d','Poker'],['KhKcKd2s2h3c4d','Full house'],['2h5h9hJhKh2c2d','Barva'],['AhKcQd2s3h7c8d','Vysoká karta'],['AhAcKdKs2h2c4d','Dva páry']];
for (const [s, e] of hc) { const r = h(s); ok = ok && r === e; console.log(`${r===e?'OK ':'ERR'} ${s} → ${r}`); }
console.log('vs náhodná ruka AA:', (PE.equity(P('AhAs'), [], [{}], 30000).equity*100).toFixed(1), '% (očekáváno ~85 %)');
console.log('AA vs 2 náhodné:', (PE.equity(P('AhAs'), [], [{},{}], 30000).equity*100).toFixed(1), '% (očekáváno ~73 %)');
const t=Date.now(); PE.equity(P('AhKd'), P('Qh7h2c'), [{minChen:8},{}], 4000); console.log('MC 4000 iter, 2 soupeři s rozsahem:', Date.now()-t, 'ms');
for (const k of [5, 8]) { const opp = Array.from({ length: k }, (_, i) => (i % 2 ? { minChen: 8 } : {}));
  const it = k <= 5 ? 3500 : 2500; let t0 = Date.now(); const r = PE.equity(P('AhAs'), [], opp, it); const ms = Date.now() - t0;
  console.log(`AA proti ${k} soupeřům (${it} iter): ${(r.equity*100).toFixed(1)} %, ${ms} ms`); if (ms > 150) { ok = false; console.log('ERR příliš pomalé'); } }
// all-in doporučení
const ctx = (o) => Object.assign({ street: 0, board: [], pot: 3, toCall: 1, currentBet: 2, myBet: 1, stack: 19, minRaiseTo: 4, bb: 2, position: 'SB', numOpp: 1, raisesThisStreet: 0, eq: 0.5 }, o);
const chk = (name, r, exp) => { const pass = r.action === exp; ok = ok && pass; console.log(`${pass ? 'OK ' : 'ERR'} ${name}: ${r.action}${r.to ? ' ' + r.to : ''} – ${r.why.slice(0, 90)}…`); };
chk('push 10 BB, SB, A5o', PE.recommend(ctx({ hole: P('As5d'), eff: 20 })), 'allin');
chk('fold 10 BB, UTG (9 hráčů), 85o', PE.recommend(ctx({ hole: P('8s5d'), eff: 20, position: 'UTG', numOpp: 8, toCall: 2, myBet: 0, stack: 20 })), 'fold');
chk('push 12 BB, CO, KJo', PE.recommend(ctx({ hole: P('KsJd'), eff: 24, position: 'CO', numOpp: 3, toCall: 2, myBet: 0, stack: 24 })), 'allin');
chk('100 BB, UTG, KJo → fold (těsná raná pozice)', PE.recommend(ctx({ hole: P('KsJd'), eff: 200, position: 'UTG', numOpp: 8, toCall: 2, myBet: 0, stack: 200 })), 'fold');
chk('100 BB, BTN, KJo → raise', PE.recommend(ctx({ hole: P('KsJd'), eff: 200, position: 'BTN', numOpp: 2, toCall: 2, myBet: 0, stack: 200 })), 'raise');
chk('proti 3-betu s KK → all-in', PE.recommend(ctx({ hole: P('KsKd'), eff: 200, position: 'CO', raisesThisStreet: 2, toCall: 14, currentBet: 20, myBet: 6, stack: 194, pot: 29 })), 'allin');
chk('call all-in: dobrá equity', PE.recommend(ctx({ hole: P('AsQd'), eff: 40, toCall: 38, currentBet: 40, myBet: 2, stack: 38, pot: 43, eq: 0.55 })), 'call');
chk('fold proti all-in: slabá equity', PE.recommend(ctx({ hole: P('7s2d'), eff: 40, toCall: 38, currentBet: 40, myBet: 2, stack: 38, pot: 43, eq: 0.3 })), 'fold');
chk('nízké SPR + silná ruka postflop → all-in', PE.recommend(ctx({ street: 1, hole: P('AsAd'), board: P('Ah7c2d'), pot: 60, toCall: 0, currentBet: 0, myBet: 0, stack: 70, eff: 70, minRaiseTo: 2, eq: 0.9 })), 'allin');
chk('hluboký stack + silná ruka postflop → bet', PE.recommend(ctx({ street: 1, hole: P('AsAd'), board: P('Ah7c2d'), pot: 20, toCall: 0, currentBet: 0, myBet: 0, stack: 190, eff: 190, minRaiseTo: 2, eq: 0.9 })), 'bet');
const g = PE.grade(PE.recommend(ctx({ hole: P('As5d'), eff: 20 })), 'fold', ctx({ hole: P('As5d'), eff: 20 }));
console.log(`${g.level === 'bad' ? 'OK ' : 'ERR'} hodnocení: fold místo pushe → ${g.title}`); ok = ok && g.level === 'bad';
process.exit(ok ? 0 : 1);
