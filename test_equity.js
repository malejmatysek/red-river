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
process.exit(ok ? 0 : 1);
