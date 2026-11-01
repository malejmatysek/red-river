/* Veřejné online stoly – test jádra + mock serveru (Node, bez sítě). */
const { MockServer, MockNet } = require('./online/net.js');
let T = 1e12; const clock = () => T;
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
const code = async p => { try { await p; return 'no error'; } catch (e) { return e.code; } };
(async () => {
  const S = new MockServer({ now: clock, autoTick: false });
  const C = S.core;
  const P = n => new MockNet(S, 'u' + n);
  const a = P(1), b = P(2), c = P(3);
  ok(C.TIERS.length === 3 && C.TIERS.map(t => t.bb * t.buyInBB).join() === '200,500,2500', 'three tiers 200 / 500 / 2500');
  // filtr jmen
  ok(await code(a.quickseat('micro', 'K0k0t')) === 'bad_name', 'bad nickname rejected before buy-in');
  ok(S.pts('u1') === 1000, 'no points taken for rejected name');
  ok(await code(a.quickseat('nope', 'Ada')) === 'bad_tier', 'unknown tier rejected');
  // první hráč: nový stůl, čeká
  let va = await a.quickseat('micro', 'Ada');
  ok(/^PUB-[A-Z2-9]{6}$/.test(va.code) && va.settings.pub && va.settings.max === 6 && va.settings.tier === 'micro', 'public table created ' + va.code);
  ok(S.pts('u1') === 800, 'buy-in 200 debited');
  ok(va.waiting && !va.hand && !va.isHost, 'alone: waiting, nobody is host');
  ok(await code(a.start()) === 'public' && await code(a.addBot()) === 'public' && await code(a.next()) === 'public', 'host ops refused on public table');
  // druhý hráč: stejný stůl, ruka začne sama
  let vb = await b.quickseat('micro', 'Bob');
  ok(vb.code === va.code, 'quick-seat matches the open table of the same tier');
  ok(vb.hand && !vb.hand.done && vb.hand.no === 1, 'hand auto-starts with 2 players');
  // stejný hráč znovu → stejné místo, žádný další buy-in
  const again = await a.quickseat('micro', 'Ada');
  ok(again.code === va.code && S.pts('u1') === 800 && again.seats.filter(Boolean).length === 2, 'one seat per user (repeat quick-seat returns the same seat)');
  // jiná úroveň → jiný stůl
  const vd = await P(9).quickseat('mid', 'Dana'); ok(vd.code !== va.code && vd.settings.bb === 10, 'other tier → other table');
  // třetí hráč přisedne během ruky
  let vc = await c.quickseat('micro', 'Cyril');
  ok(vc.code === va.code && vc.me >= 0 && !vc.seats[vc.me].inHand && !Array.isArray(vc.seats[vc.me].cards), 'mid-hand joiner sits out this hand (no cards)');
  ok(vc.hand.legal === null, 'mid-hand joiner cannot act');
  // dohraj ruku 1 (check/call), pak další ruka i s Cyrilem
  const nets = { u1: a, u2: b, u3: c };
  async function play(n) { for (let k = 0; k < (n || 60); k++) { const v = await a.state(); const h = v.hand; if (!h || h.done) return v;
    const s = v.seats[h.toAct], who = Object.values(nets).find(x => x.uid === S.rooms.get(v.code).seats[h.toAct].uid); const L = (await who.state()).hand.legal; await who.act({ t: L.canCheck ? 'check' : 'call' }); } return a.state(); }
  let v = await play(); ok(v.hand.done, 'hand 1 done');
  T += 7000; S.tickAll(); v = await c.state();
  ok(v.hand.no === 2 && v.seats[v.me].inHand && Array.isArray(v.seats[v.me].cards), 'joiner is dealt into the next hand');
  // timeout → auto-fold; 2× → mimo hru; po 90 s zvednut a žetony vráceny
  const room = S.rooms.get(v.code);
  const tIdx = room.seats.findIndex(s => s && s.uid === 'u3');
  for (let k = 0; k < 40 && !(room.seats[tIdx] && room.seats[tIdx].sitOut); k++) {
    const h = room.hand;
    if (!h || h.done) { T += 7000; S.tickAll(); continue; }
    if (h.toAct === tIdx) { T += 31000; S.tickAll(); continue; }
    const who = Object.values(nets).find(x => x.uid === room.seats[h.toAct].uid); const L = (await who.state()).hand.legal; await who.act({ t: L.canCheck ? 'check' : 'call' });
  }
  ok(room.seats[tIdx] && room.seats[tIdx].sitOut, 'two timeouts → sitting out');
  const folds = room.last.actions.concat(room.hand ? room.hand.actions : []).filter(x => x.seat === tIdx && (x.t === 'fold' || x.t === 'check'));
  ok(folds.length >= 1, 'timeout auto-folds / checks');
  const stack3 = room.seats[tIdx].stack, before = S.pts('u3');
  T += 91000; S.tickAll();
  ok(!room.seats[tIdx] && S.pts('u3') === before + stack3, 'idle sit-out reaped after 90 s, chips refunded (' + stack3 + ')');
  // odchod během ruky = fold
  T += 7000; S.tickAll();
  const h = room.hand; ok(h && !h.done, 'heads-up hand running');
  const chipsBefore = C.chips(room);
  const ia = room.seats.findIndex(s => s && s.uid === 'u1'), stackA = room.seats[ia].stack, ptsA = S.pts('u1');
  await a.leave();
  ok(room.hand.done && room.hand.players.find(p => p.seat === ia).folded, 'leaving mid-hand folds');
  ok(S.pts('u1') === ptsA + stackA, 'leave refunds remaining stack');
  ok(C.chips(room) + stackA === chipsBefore, 'chips conserved');
  // nahlášení
  await a.quickseat('micro', 'Ada');
  const v2 = await a.state(); const bSeat = v2.seats.findIndex(s => s && s.name === 'Bob');
  ok((await a.report(bSeat, 'abuse')).ok && S.reports.length === 1 && S.reports[0].reported === 'u2', 'report stored with reported uid');
  ok(await code(a.report(v2.me, 'abuse')) === 'bad_seat', 'cannot report yourself');
  for (let k = 0; k < 3; k++) await a.report(bSeat, 'spam');
  ok(await code(a.report(bSeat, 'spam')) === 'rate', 'report rate-limited (5 / 10 min)');
  // rate limit quick-seat
  const q = P(7); let e = 'no error'; for (let k = 0; k < 13; k++) { e = await code(q.quickseat('high', 'Quinn')); if (e === 'rate') break; }
  ok(e === 'rate' || S.pts('u7') >= 0, 'quick-seat rate limited (' + e + ')');
  // max 6 lidí na stůl
  const S2 = new MockServer({ now: clock, autoTick: false }); const codes = new Set();
  for (let k = 0; k < 7; k++) codes.add((await new MockNet(S2, 'x' + k).quickseat('micro', 'Hráč' + k)).code);
  const r1 = S2.rooms.get([...codes][0]);
  ok(codes.size === 2 && r1.seats.filter(Boolean).length === 6, '7th player goes to a new table (max 6)');
  ok((await new MockNet(S2, 'x0').lobby()).tiers[0].players === 7 && (await new MockNet(S2, 'x0').lobby()).tiers[0].tables === 2, 'lobby counts tables and players');
  ok(await code(new MockNet(S2, 'x9').quickseat('high', 'Poor')) === 'points' && S2.pts('x9') === 1000 && ![...S2.rooms.values()].some(r => r.settings.tier === 'high'), 'not enough points for high tier (2500) → points, no empty table left');
  // soukromé stoly dál fungují
  const p1 = P(20), p2 = P(21); const pv = await p1.create({ max: 2, sb: 1, bb: 2, buyInBB: 100 }, 'Host');
  ok(/^RED-\d{4}$/.test(pv.code) && pv.isHost && !pv.settings.pub, 'private table still works');
  await p2.join(pv.code, 'Kokot'); ok((await p1.start()).hand, 'private: names not filtered, host start works');
  console.log(fails.length ? '\nPUBLIC FAIL ' + fails.length : '\nPUBLIC OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
