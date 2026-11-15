/* v1.9: avatar u místa + Ukázat / Zahodit po výhře foldem (sdílené jádro online/core.js přes mock) */
const { MockServer, MockNet } = require('./online/net.js');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
(async () => {
  const server = new MockServer({ autoTick: false, now: () => 1e12 });
  const A = new MockNet(server, 'alice'), B = new MockNet(server, 'bob');
  global.window = undefined;
  let va = await A.create({ max: 2, sb: 1, bb: 2, buyInBB: 100 }, 'Alice');
  await B.join(va.code, 'Bob'); await A.start();
  const room = server.rooms.get(va.code); room.seats[0].av = 'robot'; room.seats[1].av = 'bad id!';   // jádro čistí avatar při join; tady ruční test pohledu
  let v = await A.state(); ok(v.seats[0].av === 'robot', 'avatar in seat view');
  // kdo je na tahu, složí → druhý vyhraje foldem
  const who = v.hand.toAct === v.me ? A : B, win = who === A ? B : A;
  await who.act({ t: 'fold' });
  let vw = await win.state(), vl = await who.state();
  ok(vw.hand.canShow === true && !vl.hand.canShow, 'only the fold-winner can show');
  ok(Object.keys(vw.hand.result.reveal).length === 0, 'nothing revealed before choice');
  await win.show([false, true]);
  vl = await who.state(); const ws = vw.me, rv = vl.hand.result.reveal[ws];
  ok(rv && rv[0] === null && typeof rv[1] === 'number', 'loser sees only the chosen 2nd card');
  ok(Array.isArray(vl.seats[ws].cards) && vl.seats[ws].cards[0] === null, 'seat view carries partial reveal');
  vw = await win.state(); ok(!vw.hand.canShow, 'cannot show twice');
  ok(vl.last.result.reveal[ws][1] === rv[1], 'hand review has the shown card');
  try { await who.show([true, true]); ok(false, 'loser show rejected'); } catch (e) { ok(true, 'loser show rejected → ' + e.code); }
  console.log(fails ? 'SHOW FAIL ' + fails : 'SHOW OK'); process.exit(fails ? 1 : 0);
})();
