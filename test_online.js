/* Online soukromé stoly – test 2 hráčů proti in-memory mocku (autoritativní jádro online/core.js) */
const { MockServer, MockNet } = require('./online/net.js');
const { makeCore } = require('./online/core.js');
const PE = require('./engine.js');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
const expectErr = async (p, code, m) => { try { await p; ok(false, m + ' (žádná chyba)'); } catch (e) { ok(e.code === code, `${m} → ${e.code}`); } };
(async () => {
  let T = 1e12; const server = new MockServer({ autoTick: false, now: () => T });
  const A = new MockNet(server, 'alice'), B = new MockNet(server, 'bob');
  let CODE = null; const room = () => server.rooms.get(CODE || A.code);
  const C = server.core;
  // založení + připojení
  await expectErr(A.create({ max: 12 }, 'Alice'), 'bad_settings', 'neplatné nastavení odmítnuto');
  let va = await A.create({ max: 2, sb: 1, bb: 2, buyInBB: 100 }, 'Alice');
  ok(/^RED-\d{4}$/.test(va.code), 'kód stolu ' + va.code);
  ok(server.pts('alice') === 800, 'buy-in 200 odečten z virtuálních bodů (800)');
  ok(va.isHost && va.status === 'lobby' && va.seats.filter(Boolean).length === 1, 'lobby s hostitelem');
  await expectErr(B.join('RED-0000', 'Bob'), 'no_room', 'neexistující kód');
  let bUpdates = 0; B.onChange(() => bUpdates++);
  let vb = await B.join(va.code.toLowerCase(), 'Bob<script>');
  ok(vb.seats.filter(Boolean).length === 2 && server.pts('bob') === 800, 'Bob připojen kódem (malá písmena OK), buy-in odečten');
  ok(!JSON.stringify(vb).includes('<script>'), 'jméno očištěno');
  await expectErr(new MockNet(server, 'carol').join(va.code, 'Carol'), 'full', 'plný stůl (2 místa)');
  ok(server.pts('carol') === 1000, 'při plném stole se body nestrhnou');
  await expectErr(B.start(), 'not_host', 'start jen hostitel');
  await A.start();
  ok(bUpdates > 0, 'Bob dostává realtime změny');
  // soukromí karet
  const r = room(), h = r.hand;
  va = await A.state(); vb = await B.state();
  const sa = va.me, sb = vb.me;
  ok(Array.isArray(va.seats[sa].cards) && va.seats[sa].cards.join() === h.holes[sa].join(), 'Alice vidí svoje karty');
  ok(va.seats[sb].cards === 2 && vb.seats[sa].cards === 2, 'cizí karty jsou jen rubem (počet 2)');
  const js = JSON.stringify(va) + JSON.stringify(vb);
  ok(!/deck|holes/.test(js), 'pohled neobsahuje balíček ani cizí karty');
  ok(va.hand.legal === null || vb.hand.legal === null, 'tahy má jen hráč na tahu');
  ok(!('eq' in va.hand) && !('rec' in va.hand) && !JSON.stringify(va).includes('equity'), 'žádné šance ani doporučení u online stolu');
  // validace akcí
  const turnNet = () => room().hand.toAct === sa ? A : B, waitNet = () => room().hand.toAct === sa ? B : A;
  await expectErr(waitNet().act({ t: 'call' }), 'not_your_turn', 'hraje mimo pořadí');
  await expectErr(turnNet().act({ t: 'check' }), 'cannot_check', 'check při sázce soupeře');
  await expectErr(turnNet().act({ t: 'raise', to: 3 }), 'raise_too_small', 'příliš malé navýšení');
  await expectErr(turnNet().act({ t: 'dance' }), 'bad_action', 'neznámá akce');
  await expectErr(turnNet().act({ t: 'raise', to: 'abc' }), 'bad_amount', 'nečíselná částka');
  // časový limit: nikdo nehraje → po 30 s automaticky fold/check
  const noBefore = room().hand.no;
  T += 31000; await A.tick();
  ok(room().hand.done || room().hand.actions.some(a => a.t === 'fold' || a.t === 'check'), 'po vypršení času automatický tah');
  T += 7000; await A.tick();
  ok(room().hand.no === noBefore + 1, 'další ruka se rozdá sama po odpočtu');
  // mnoho rukou s náhodnými legálními akcemi
  let noPts = 0, topup = 0, hands = 0, showdowns = 0, revealOK = 0, chipErr = 0, splits = 0, reviewOK = 0, rebuys = 0, allins = 0;
  const rnd = () => Math.random();
  let expChips = 400;
  for (let k = 0; k < 20000 && hands < 300; k++) {
    const R = room(); if (!R.hand) { T += 7000; await A.tick(); continue; }
    if (R.hand.done) {
      hands++; const res = R.hand.result; const total = R.seats.reduce((s, x) => s + x.stack, 0);
      if (total !== expChips) chipErr++;
      if (res.showdown) { showdowns++; const v = await B.state(); const opp = v.seats[sa];
        if (Array.isArray(opp.cards) && opp.cards.join() === R.hand.holes[sa].join()) revealOK++; }
      if (res.pots.some(p => p.winners.length > 1)) splits++;
      const lv = (await A.state()).last; if (lv && lv.no === R.hand.no && lv.actions.length >= 2 && lv.mine && lv.players.length === 2 && lv.players.reduce((s, p) => s + p.net, 0) === 0) reviewOK++;
      for (const [net, uid] of [[A, 'alice'], [B, 'bob']]) { const s = R.seats[C.seatOf(R, uid)]; if (s.stack < 2) {
        if (server.pts(uid) < R.settings.buyIn - s.stack) { if (!noPts) { noPts = 1; await expectErr(net.rebuy(), 'points', 'dokoupení bez dostatku bodů odmítnuto'); } server.credit(uid, 2000); topup += 2000; }
        expChips += R.settings.buyIn - s.stack; await net.rebuy(); rebuys++; } }
      T += 7000; await A.tick(); continue;
    }
    const net = turnNet(), v = await net.state(), L = v.hand.legal, x = rnd();
    let a;
    if (x < 0.08) a = { t: 'allin' }; else if (x < 0.25 && L.canRaise) a = { t: 'raise', to: L.minTo + Math.floor(rnd() * (L.maxTo - L.minTo + 1)) };
    else if (x < 0.35 && !L.canCheck) a = { t: 'fold' }; else a = { t: L.canCheck ? 'check' : 'call' };
    if (a.t === 'allin') allins++;
    await net.act(a);
    if (R.hand.players.some(p => R.seats[p.seat].stack < 0)) chipErr++;
  }
  ok(hands >= 300, `odehráno ${hands} rukou`);
  ok(chipErr === 0, 'žetony sedí po každé ruce (nic nevzniká ani nemizí), nikdy záporný stack');
  ok(showdowns > 20 && revealOK === showdowns, `ve showdownu se odkryjí karty (${revealOK}/${showdowns})`);
  ok(reviewOK >= hands - 2, `rozbor ruky po každé ruce (${reviewOK}/${hands})`);
  console.log(`     showdowny ${showdowns}, dělené poty ${splits}, all-iny ${allins}, dokoupení ${rebuys}`);
  // odchod → žetony zpět do bodů; součet bodů + žetonů se zachová
  const sumBefore = server.pts('alice') + server.pts('bob') + room().seats.reduce((s, x) => s + (x ? x.stack : 0), 0) + (room().hand && !room().hand.done ? room().hand.players.reduce((s, p) => s + p.total, 0) : 0);
  ok(sumBefore === 2000 + topup, `body + žetony obou hráčů sedí (2000 + testovací doplnění ${topup}) – nic nevzniká ani nemizí`);
  CODE = A.code;
  const ptsA = server.pts('alice'), stA = room().seats[C.seatOf(room(), 'alice')].stack;
  const inPot = room().hand && !room().hand.done ? room().hand.players.find(p => p.uid === 'alice').total : 0;
  await A.leave();
  ok(server.pts('alice') === ptsA + stA, `odchod: žetony (${stA}) zpět do online bodů, rozehraná sázka ${inPot} propadá`);
  ok(room().host === 'bob', 'hostitelem se stává Bob');
  await B.leave(); ok(room().status === 'closed', 'prázdný stůl se zavře');
  // boti doplní místa
  const D = new MockNet(server, 'dana');
  let vd = await D.create({ max: 4, sb: 5, bb: 10, buyInBB: 50, bots: true }, 'Dana');
  ok(server.pts('dana') === 500, 'buy-in 50 BB × 10 = 500');
  await D.start(); vd = await D.state();
  ok(vd.seats.filter(s => s && s.bot).length === 3 && vd.hand, 'boti doplnili 3 místa a ruka běží');
  let dh = 0;
  for (let k = 0; k < 600 && dh < 40; k++) {
    const R = server.rooms.get(vd.code);
    if (!R.hand || R.hand.done) { if (R.hand && R.hand.done) dh++; const s = R.seats[C.seatOf(R, 'dana')]; if (s.stack < 10) { if (server.pts('dana') < 500) server.credit('dana', 1000); await D.rebuy(); } T += 7000; await D.tick(); continue; }
    if (R.hand.toAct === C.seatOf(R, 'dana')) { const L = (await D.state()).hand.legal; await D.act({ t: L.canCheck ? 'check' : 'call' }); }
    else { ok(false, 'čeká se na bota – boti mají hrát sami'); break; }
  }
  ok(dh >= 40, `s boty odehráno ${dh} rukou`);
  // vedlejší poty: 3 hráči all-in s různými stacky (50 / 100 / 200)
  { const core = makeCore({ PE }); let bad = 0;
    for (let n = 0; n < 300; n++) {
      const R = core.createRoom({ uid: 'a', name: 'A', settings: { max: 3 } }); core.join(R, 'b', 'B'); core.join(R, 'c', 'C');
      R.seats[0].stack = 50; R.seats[1].stack = 100; R.seats[2].stack = 200; core.start(R, 'a');
      for (let g = 0; g < 10 && !R.hand.done; g++) { const i = R.hand.toAct; core.act(R, R.seats[i].uid, { t: 'allin' }); }
      const w = R.hand.result.won, tot = Object.values(w).reduce((x, y) => x + y, 0);
      if (!R.hand.done || tot !== R.hand.players.reduce((x, p) => x + p.total, 0) || R.hand.players.find(p => p.seat === 2).total > 100 || (w[0] || 0) > 150 || (w[1] || 0) > 250 || R.seats.reduce((x, y) => x + y.stack, 0) !== 350) bad++;
    }
    ok(bad === 0, 'vedlejší poty (krátký stack vyhraje max. 3×50, střední max. 150+100, velký stack nedá víc, než může někdo pokrýt)'); }
  // kryptografické míchání: rovnoměrnost první karty
  const core = makeCore({ PE }); const cnt = new Array(52).fill(0);
  for (let i = 0; i < 26000; i++) { const r2 = core.createRoom({ uid: 'x', name: 'x', settings: { max: 2 } }); core.addBot(r2, 'x'); core.start(r2, 'x'); cnt[r2.hand.holes[r2.hand.sb][0]]++; }
  const chi = cnt.reduce((s, c) => s + (c - 500) ** 2 / 500, 0);
  ok(chi < 110, `míchání rovnoměrné (χ² = ${chi.toFixed(1)}, 51 st. volnosti)`);
  console.log(fails ? `\nONLINE FAILED: ${fails}` : '\nONLINE OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
