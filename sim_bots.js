// Simulace botů: N rukou na 6místném stole (jen boti), statistiky podle stylu a úrovně.
// node sim_bots.js [hands=2000] [out.json]
const { makeCore } = require('./online/core.js');
const PE = require(process.env.ENGINE || './engine.js');
const HANDS = +process.argv[2] || 2000, OUT = process.argv[3];
const ARCHS = ['rock', 'tag', 'lag', 'maniac', 'station'];
let T = 1e12; const core = makeCore({ PE, now: () => T, randInt: n => Math.floor(Math.random() * n) });
function run(skill, pro) {
  const st = {}; const S = a => st[a] || (st[a] = { n: 0, vpip: 0, pfr: 0, pfFold: 0, pfFoldFaced: 0, cbF: 0, cbFaced: 0, cbetOpp: 0, cbet: 0, net: 0, sd: 0, sawFlop: 0, agg: 0, pas: 0, limp: 0, vo: 0, voF: 0, vo3: 0 });
  const room = core.createRoom({ uid: 'h', name: 'H', settings: { max: 6, sb: 1, bb: 2, buyInBB: 100, bots: true, botLvl: skill } });
  core.start(room, 'h');   // obsadí boty, rozdá
  // hostitel → taky bot; pevné styly: každý styl jednou + jeden TAG navíc (rotace sedadel)
  const archOf = k => (ARCHS.concat(['tag']))[k];
  let rot = 0;
  const setStyles = () => room.seats.forEach((s, i) => { s.bot = true; s.uid = null; const k = (i + rot) % 6, a = archOf(k), sk = pro && k === 5 ? 2 : skill; if (!s.style || s.style.arch !== a || s.style.skill !== sk) s.style = PE.makeBot(sk, Math.random, a); s.key = pro && k === 5 ? 'PRO' : a; });
  setStyles(); room.hand.players.forEach(p => { p.bot = true; p.uid = null; });
  let hands = 0;
  while (hands < HANDS) {
    core.runBots(room);
    const h = room.hand; if (!h || !h.done) { T += 31000; core.tick(room); continue; }
    hands++;
    // statistiky ruky
    const pfA = new Set(), vp = new Set(), pr = new Set(), pff = new Set(), faced = new Set(); let raised = false, pfAgg = -1;
    for (const a of h.actions) if (a.st === 0 && a.t !== 'sb' && a.t !== 'bb') {
      if (raised || a.t !== 'check') faced.add(a.seat);
      if (a.t === 'call' || a.t === 'raise' || a.t === 'bet' || a.t === 'allin') vp.add(a.seat);
      if (a.t === 'raise' || a.t === 'bet' || (a.t === 'allin' && a.to > 2)) { pr.add(a.seat); raised = true; pfAgg = a.seat; }
      if (a.t === 'call' && !raised) S(room.seats[a.seat].key).limp++;
      if (a.t === 'fold') pff.add(a.seat);
    }
    { let nr = 0; const seen = new Set(); for (const a of h.actions) { if (a.st !== 0 || a.t === 'sb' || a.t === 'bb') continue;
        if (!seen.has(a.seat)) { seen.add(a.seat); if (nr === 1) { const s = S(room.seats[a.seat].key); s.vo++; if (a.t === 'fold') s.voF++; if (a.t === 'raise' || a.t === 'allin') s.vo3++; } }
        if (a.t === 'raise' || a.t === 'bet' || (a.t === 'allin' && a.to > 2)) nr++; } }
    const flop = h.actions.filter(a => a.st === 1);
    const fb = flop.findIndex(a => a.t === 'bet' || a.t === 'raise' || a.t === 'allin');
    const cbet = fb >= 0 && flop[fb].seat === pfAgg;
    const inFlop = new Set(flop.map(a => a.seat));
    if (pfAgg >= 0 && inFlop.has(pfAgg)) { const s = S(room.seats[pfAgg].key); s.cbetOpp++; if (cbet) s.cbet++; }
    if (cbet) { const resp = new Map(); flop.slice(fb + 1).forEach(a => { if (!resp.has(a.seat) && a.seat !== pfAgg) resp.set(a.seat, a.t); });
      resp.forEach((t, seat) => { const s = S(room.seats[seat].key); s.cbFaced++; if (t === 'fold') s.cbF++; }); }
    h.actions.forEach(a => { if (a.st > 0) { const s = S(room.seats[a.seat].key); if (a.t === 'bet' || a.t === 'raise' || a.t === 'allin') s.agg++; else if (a.t === 'call') s.pas++; } });
    h.players.forEach(p => { const s = S(room.seats[p.seat].key); s.n++; if (vp.has(p.seat)) s.vpip++; if (pr.has(p.seat)) s.pfr++; if (pff.has(p.seat)) s.pfFold++; if (faced.has(p.seat)) s.pfFoldFaced++;
      if (inFlop.has(p.seat) || (h.street >= 1 && !p.folded)) s.sawFlop++;
      const r = room.last && room.last.players.find(x => x.seat === p.seat); if (r) s.net += r.net; if (h.result && h.result.showdown && !p.folded) s.sd++; });
    if (hands % 50 === 0) { rot++; }
    room.seats.forEach(s => { s.stack = room.settings.buyIn; });    // stejné stacky (100 BB)
    setStyles();
    T += 31000; core.tick(room);
    if (room.hand && !room.hand.done) room.hand.players.forEach(p => { p.bot = true; });
  }
  return st;
}
const pc = (a, b) => b ? Math.round(a / b * 100) : '–';
const res = {};
if (!process.env.PROONLY) for (const sk of [0, 1, 2]) { res[sk] = run(sk); }
const rows = [];
if (!process.env.PROONLY) for (const sk of [0, 1, 2]) {
  let tn = 0, tv = 0, tp = 0;
  for (const a of ARCHS) { const s = res[sk][a]; if (!s) continue; tn += s.n; tv += s.vpip; tp += s.pfr;
    rows.push({ skill: sk, arch: a, hands: s.n, VPIP: pc(s.vpip, s.n), PFR: pc(s.pfr, s.n), limp: pc(s.limp, s.n), pfFold: pc(s.pfFold, s.pfFoldFaced), cbet: pc(s.cbet, s.cbetOpp), foldVsOpen: pc(s.voF, s.vo), threeBet: pc(s.vo3, s.vo), foldToCbet: pc(s.cbF, s.cbFaced), WTSD: pc(s.sd, s.sawFlop), AF: s.pas ? +(s.agg / s.pas).toFixed(1) : '–', bb100: Math.round(s.net / 2 / s.n * 100) }); }
  rows.push({ skill: sk, arch: 'TABLE', hands: tn, VPIP: pc(tv, tn), PFR: pc(tp, tn) });
  const W = [{ station: 3, rock: 2, maniac: 1, lag: 1, tag: 1 }, { station: 2, rock: 1, maniac: 1, lag: 2, tag: 2 }, { station: 1, rock: 1, maniac: 1, lag: 2, tag: 3 }][sk];
  let ws = 0, wv = 0, wp = 0; for (const a of ARCHS) { const s = res[sk][a]; ws += W[a]; wv += W[a] * s.vpip / s.n; wp += W[a] * s.pfr / s.n; }
  rows.push({ skill: sk, arch: 'MIX (app odds)', VPIP: Math.round(wv / ws * 100), PFR: Math.round(wp / ws * 100) });
}
if (process.env.PRO) { for (const sk of [0, 1]) { const r = run(sk, true), x = r.PRO, base = ARCHS.reduce((m, a) => m + r[a].net, 0) - r.tag.net; rows.push({ skill: 'PRO(2) vs ' + sk, arch: 'tag skill 2', hands: x.n, VPIP: pc(x.vpip, x.n), PFR: pc(x.pfr, x.n), bb100: Math.round(x.net / 2 / x.n * 100) }); } }
console.table(rows);
if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(rows, null, 1));
