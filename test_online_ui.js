/* Online stoly – UI test se 2 hráči proti lokálnímu mocku (bez sítě).
   Hostitel hraje přes UI, druhý hráč („Eva“) přes RRNet.MockNet na stejném mock serveru. */
const { chromium } = require(process.env.PW || 'playwright-core');
const SHOTS = !!process.env.SHOTS;
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [], fails = [], net = [];
  const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:')) net.push(r.url()); });
  await page.addInitScript(() => { window.__RR_MOCK = true; window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1');
    if (!localStorage.getItem('pt_settings')) localStorage.setItem('pt_settings', JSON.stringify({ lang: 'cs', level: 0, sound: false, vibrate: false })); });
  const url = 'file://' + __dirname + '/index.html';
  await page.goto(url); await page.waitForTimeout(300);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `screenshots/online-${n}.png` }); };
  const txt = sel => page.$eval(sel, e => e.innerText).catch(() => '');
  const cur = () => page.evaluate(() => __nav.cur);
  const V = () => page.evaluate(() => OnlineUI.state.view);
  const G = (fn, ...a) => page.evaluate(([f, a]) => window.__g[f](...a), [fn, a]);   // druhý hráč

  // 1) Domů → Hrát s kamarády
  ok(/Hrát s kamarády/.test(await txt('#homeOnline')), 'home tile "Hrát s kamarády"');
  await page.click('#homeOnline'); await page.waitForTimeout(150);
  ok(await cur() === 'online', 'online screen opens');
  ok(/UKÁZKA/.test(await txt('#onBody')), 'demo (mock) badge shown');
  ok(/1\s?000/.test(await txt('#onBody .pts-hero')), 'online points 1000 at start');
  await shot('1-home');

  // 2) Založit stůl: 2 hráči, blindy 1/2, 100 BB, bez botů
  await page.click('#onCreate'); await page.waitForTimeout(150);
  ok(await cur() === 'oncreate', 'create screen');
  await page.click('#ocMax [data-v="2"]'); await page.click('#ocBl [data-v="0"]'); await page.click('#ocBuy [data-v="100"]');
  if (await page.$eval('#ocBots', e => e.checked)) await page.click('.on-check');
  await page.fill('#ocName', 'Matyáš');
  ok(/200/.test(await txt('#ocCost')), 'cost shown (100 BB × 2 = 200)');
  await shot('2-create');
  await page.click('#ocGo'); await page.waitForTimeout(200);
  ok(await cur() === 'lobby', 'lobby after create');
  const code = (await txt('#lbCode')).trim();
  ok(/^RED-\d{4}$/.test(code), 'room code format ' + code);
  ok(await page.evaluate(() => OnlineUI.state.points) === 800, 'buy-in debited from online points (1000 → 800)');
  ok(/hostitel/.test(await txt('#lobbyBody')) && !!(await page.$('#lbStart')), 'host sees Start + crown');

  // 3) druhý hráč se připojí kódem
  await page.evaluate(async c => { window.__g = new RRNet.MockNet(RRNet.mockServer(), 'guest-eva'); await window.__g.join(c, 'Eva'); }, code);
  await page.waitForTimeout(150);
  ok(/Eva/.test(await txt('#lobbyBody')), 'lobby updates live when Eva joins');
  ok(await page.evaluate(() => OnlineUI.state.view.seats.filter(Boolean).length) === 2, '2 seats taken');
  await shot('3-lobby');
  let err = await page.evaluate(async () => { try { await window.__g.start(); return 'no error'; } catch (e) { return e.code; } });
  ok(err === 'not_host', 'guest cannot start (not_host)');

  // 4) start → stůl
  await page.click('#lbStart'); await page.waitForTimeout(250);
  ok(await cur() === 'ontable', 'table screen after start');
  ok(await page.$$eval('#otHero .card:not(.back):not(.ghost)', e => e.length) === 2, 'own 2 hole cards face up');
  ok(await page.$$eval('#otOpps .mini .card.back', e => e.length) === 2, "opponent's cards face down");
  ok(await page.$$eval('#otOpps .mini .card:not(.back)', e => e.length) === 0, "no opponent card face up");
  ok(!(await page.$('#scr-ontable #odds')) && !(await page.$('#scr-ontable .rec')) && !/Výhra|%/.test(await txt('#scr-ontable')), 'no hints / win % at online table');
  const v1 = await V();
  ok(!('deck' in v1) && !v1.hand.holes && v1.seats.filter(s => s && !s.me).every(s => s.cards === 2), 'host view: no deck, opponent cards hidden');
  const gv = await G('state');
  const hostSeat = v1.me;
  ok(gv.seats[hostSeat].cards === 2 && Array.isArray(gv.seats[gv.me].cards), "guest view: host's cards hidden, own visible");
  await shot('4-table');

  // 5) dohrát ruku: hostitel přes tlačítka, Eva přes síť
  async function playHand(maxSteps) {
    for (let k = 0; k < (maxSteps || 40); k++) {
      const v = await V(); if (!v.hand || v.hand.done) return v;
      if (v.hand.toAct === v.me) { await page.click('#oaCall'); }
      else { const g = await G('state'); const L = g.hand.legal; if (L) await G('act', { t: L.canCheck ? 'check' : 'call' }); }
      await page.waitForTimeout(80);
    }
    return V();
  }
  let v = await playHand();
  ok(v.hand.done, 'hand 1 finished');
  ok(/vyhráv/i.test(await txt('#otStatus')), 'result line shown: ' + (await txt('.on-result')));
  ok(v.hand.result.showdown && Object.keys(v.hand.result.reveal).length === 2, 'check-down → showdown reveals both hands');
  ok(await page.$$eval('#otOpps .mini .card:not(.back)', e => e.length) === 2, "opponent's cards revealed at showdown");
  const chips = v.seats.filter(Boolean).reduce((s, x) => s + x.stack, 0);
  ok(chips === 400, 'chips conserved (400) after hand');
  await shot('5-showdown');
  await page.click('#otReview'); await page.waitForTimeout(120);
  const rv = await txt('#sheet');
  ok(/Rozbor ruky #1/.test(rv) && /Preflop/i.test(rv) && /Eva/.test(rv), 'post-hand review sheet');
  await shot('6-review');
  await page.evaluate(() => RR.closeSheet());

  // 6) další ruka (hostitel hned rozdá) + raise přes velikosti
  await page.click('#otDeal'); await page.waitForTimeout(200);
  v = await V(); ok(v.hand.no === 2 && !v.hand.done, 'host deals hand 2');
  for (let k = 0; k < 6 && (await V()).hand.toAct !== (await V()).me; k++) { const g = await G('state'); if (g.hand.legal) await G('act', { t: g.hand.legal.canCheck ? 'check' : 'call' }); await page.waitForTimeout(80); }
  await page.click('#oaRaise'); await page.waitForTimeout(80);
  ok(!(await page.$eval('#otRaise', e => e.hidden)), 'raise panel opens (min / ½ pot / pot / all-in)');
  await page.click('#otRaise [data-to]:nth-child(3)'); await page.waitForTimeout(50);
  await shot('7-raise');
  const to = await page.evaluate(() => OnlineUI.state.raiseTo);
  await page.click('#orGo'); await page.waitForTimeout(150);
  const g2 = await G('state');
  ok(g2.seats[hostSeat].last && /raise|bet|allin/.test(g2.seats[hostSeat].last.t) && g2.seats[hostSeat].bet === to, 'raise to ' + to + ' reached the server');
  err = await page.evaluate(async () => { try { await window.__g.act({ t: 'raise', to: 3 }); return 'no error'; } catch (e) { return e.code; } });
  ok(err === 'raise_too_small' || err === 'cannot_raise', 'server rejects too-small raise: ' + err);
  await G('act', { t: 'fold' }); await page.waitForTimeout(150);
  v = await V(); ok(v.hand.done && !v.hand.result.showdown && Object.keys(v.hand.result.reveal).length === 0, 'fold win: no cards revealed');

  // 7) EN
  await page.evaluate(() => __poker.setLang('en')); await page.waitForTimeout(100);
  ok(/Hand review/.test(await txt('#otStatus')) && /wins|You win/.test(await txt('#otStatus')), 'English texts at the table');
  await page.evaluate(() => __poker.setLang('cs'));

  // 8) odchod: žetony zpět na body
  const myStack = (await V()).seats[hostSeat].stack;
  await page.click('#otMenu'); await page.click('#omLeave'); await page.click('#lvYes'); await page.waitForTimeout(200);
  ok(await cur() === 'online', 'back on online screen after leave');
  ok(await page.evaluate(() => OnlineUI.state.points) === 800 + myStack, 'stack refunded to points (' + (800 + myStack) + ')');

  // 9) Připojit kódem přes UI (stůl založila Eva)
  const code2 = await page.evaluate(async () => (await window.__g.leave(), (await window.__g.create({ max: 4, sb: 5, bb: 10, buyInBB: 50, bots: false }, 'Eva')).code));
  await page.click('#onJoin'); await page.waitForTimeout(120);
  await page.fill('#ojCode', '12'); await page.click('#ojGo'); await page.waitForTimeout(100);
  ok(await cur() === 'onjoin', 'invalid code rejected client-side');
  await page.fill('#ojCode', code2.slice(4)); await shot('8-join');
  await page.click('#ojGo'); await page.waitForTimeout(200);
  ok(await cur() === 'lobby' && /Eva/.test(await txt('#lobbyBody')) && !(await page.$('#lbStart')), 'joined Eva\'s table by code (not host → no Start)');
  ok(/Čeká se, až hostitel/.test(await txt('#lobbyBody')), 'waiting-for-host message');
  await page.evaluate(() => window.__g.addBot()); await page.waitForTimeout(100);
  ok(/bot/.test(await txt('#lobbyBody')), 'bot added by host shows in lobby');
  await shot('9-lobby-guest');
  await page.evaluate(() => window.__g.start()); await page.waitForTimeout(250);
  ok(await cur() === 'ontable', 'guest auto-moves to table when host starts');
  // nesprávný tah mimo pořadí
  v = await V();
  if (v.hand.toAct !== v.me) { err = await page.evaluate(async () => { try { await OnlineUI.state.net.act({ t: 'call' }); return 'no'; } catch (e) { return e.code; } }); ok(err === 'not_your_turn', 'out-of-turn action rejected'); }
  else ok(true, 'host-side turn order (skip out-of-turn check)');

  // 10) pozvánka ?join=
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
  await p2.goto(url + '?join=' + code2 + '&mock=1'); await p2.waitForTimeout(400);
  ok(await p2.evaluate(() => __nav.cur) === 'onjoin' && await p2.$eval('#ojCode', e => e.value) === code2.slice(4), 'invite link ?join= opens Join with code prefilled');
  ok(await p2.evaluate(() => window.__RR_MOCK === true), '?mock=1 kept after URL cleanup');
  ok(await p2.evaluate(() => location.search === ''), 'URL cleaned');

  ok(net.filter(u => /supabase|esm\.sh/.test(u)).length === 0, 'no network calls to Supabase in mock mode');
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  console.log(fails.length ? `ONLINE UI FAIL (${fails.length})` : 'ONLINE UI OK');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
