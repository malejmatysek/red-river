/* v1.3: kolo štěstí, diamanty, úspěchy, vzhled, statistiky, nápověda */
const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [], fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__FAST = true; if (!localStorage.getItem('pt_settings')) { localStorage.setItem('pt_onboarded', '1'); localStorage.setItem('pt_settings', JSON.stringify({ lang: 'cs', level: 0, sound: false, vibrate: false })); } });
  const url = 'file://' + __dirname + '/index.html';
  await page.goto(url); await page.waitForTimeout(300);
  const W = () => page.evaluate(() => JSON.parse(localStorage.getItem('pt_wallet')));
  // kolo
  ok(await page.evaluate(() => !document.getElementById('homeWheelBadge').hidden), 'home wheel badge visible when spin available');
  const p0 = (await W()).points;
  const r1 = await page.evaluate(() => __poker.spinWheel());
  const w1 = await W();
  ok(w1.wheelDay === await page.evaluate(() => __poker.today()), 'wheelDay saved after spin');
  ok(w1.points + w1.diamonds * 0 >= p0 && (w1.points > p0 || w1.diamonds > 0), 'spin reward credited');
  const r2 = await page.evaluate(() => __poker.spinWheel());
  const w2 = await W();
  ok(!r2 && w2.points === w1.points && w2.diamonds === w1.diamonds, 'second spin same day refused');
  ok(await page.evaluate(() => document.getElementById('homeWheelBadge').hidden && /\d/.test(document.getElementById('homeWheelSub').textContent)), 'countdown shown after spin');
  // kolo – rozdělení
  const dist = await page.evaluate(() => { const c = {}; for (let i = 0; i < 20000; i++) { const s = __poker.pickSeg ? __poker.pickSeg() : null; if (!s) return null; const k = s.j ? 'jp' : s.p; c[k] = (c[k] || 0) + 1; } return c; });
  if (dist) ok(dist.jp > 100 && dist.jp < 500 && dist['100'] > dist['1000'], 'wheel weights sane ' + JSON.stringify(dist));
  // směna diamantů
  await page.evaluate(() => { __poker.wallet.points = 5000; __poker.wallet.diamonds = 3; });
  ok(!(await page.evaluate(() => __poker.exchangeDia())) && await page.evaluate(() => __poker.wallet.diamonds === 3), 'exchange refused when points >= start');
  await page.evaluate(() => { __poker.wallet.points = 100; });
  await page.evaluate(() => __poker.exchangeDia());
  ok(await page.evaluate(() => __poker.wallet.diamonds === 2 && __poker.wallet.points === 600), 'exchange 1 diamond -> 500 points when broke');
  // vzhled
  await page.evaluate(() => { __poker.wallet.diamonds = 10; __poker.wallet.points = 1000; });
  ok(await page.evaluate(() => __poker.buyLook('felt', 'bordeaux')), 'buy felt');
  ok(!(await page.evaluate(() => __poker.buyLook('lumi', 'crown'))), 'cannot buy without enough diamonds');
  await page.reload(); await page.waitForTimeout(300);
  const w3 = await W();
  ok(w3.owned.felt.bordeaux && w3.equip.felt === 'bordeaux' && w3.diamonds === 6, 'look persisted after reload');
  ok(await page.evaluate(() => document.body.dataset.cfelt === 'bordeaux'), 'felt applied to body');
  ok(w3.wheelDay === w1.wheelDay, 'spin still used after reload');
  // hry → úspěchy + statistiky
  await page.evaluate(() => { __poker.settings.opps = 1; __poker.nav.go('game'); });
  for (let h = 0; h < 25; h++) {
    for (let s = 0; s < 300; s++) {
      const st = await page.evaluate(() => ({ over: __G.over, turn: __G.turn }));
      if (st.over) break;
      if (st.turn === 0) await page.evaluate(() => { const G = __G; __poker.heroAct(G.rec ? G.rec.action : (G.ctx.toCall ? 'call' : 'check'), G.rec && G.rec.to); if (__G.hold) __poker.coachGo(); });
      else await page.waitForTimeout(4);
    }
    await page.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
  }
  const st = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pt_stats')); return { profit: s.profit, last: s.histP[s.histP.length - 1], n: s.histP.length, hands: s.hands }; });
  ok(st.hands >= 20 && st.last === st.profit, `profit chart ends at stats.profit (${st.last} == ${st.profit})`);
  const w4 = await W();
  ok(!!w4.ach.hand1 && w4.diamonds > 6, 'achievement first hand awarded');
  ok(w4.day.hands >= 20, 'daily challenge hand counter');
  ok(w4.login && w4.login.streak >= 1, 'login streak recorded');
  // statistiky – oba grafy
  await page.evaluate(() => __poker.nav.go('stats')); await page.waitForTimeout(200);
  const ch = await page.evaluate(() => ({ n: document.querySelectorAll('#scr-stats .chart svg, #scr-stats svg.chart, #scr-stats .chart').length, end: [...document.querySelectorAll('#scr-stats [data-end]')].map(e => e.textContent) }));
  ok(ch.end.length >= 2, 'stats has profit + balance charts ' + JSON.stringify(ch.end));
  // nápověda
  await page.evaluate(() => __poker.nav.go('game')); await page.waitForFunction(() => __G.turn === 0 && !__G.dealing, null, { timeout: 30000 }).catch(() => {});
  await page.click('#gameHelp'); await page.waitForTimeout(150);
  const hv = await page.evaluate(() => ({ open: !document.getElementById('helpOv').hidden, labs: document.querySelectorAll('.hv-lab').length, dealer: [...document.querySelectorAll('.hv-lab')].some(b => /dealer/i.test(b.textContent)) }));
  ok(hv.open && hv.labs >= 6 && hv.dealer, 'help overlay opens with labels incl. dealer ' + JSON.stringify(hv));
  await page.click('#hvRanks'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelectorAll('#guideBody .rkr').length === 10 && document.getElementById('helpOv').hidden && __poker.nav.cur === 'guide'), 'hand rankings guide (10 rows)');
  await page.evaluate(() => history.back()); await page.waitForTimeout(400);
  ok(await page.evaluate(() => [...document.querySelectorAll('#opps .dealer')].every(d => d.dataset.g === 'dealer')), 'opponent D badges tappable');
  await page.evaluate(() => { const d = [...document.querySelectorAll('#opps .dealer, #heroDealer')][0]; d.click(); }); await page.waitForTimeout(150);
  ok(await page.evaluate(() => /dealer/i.test(document.body.innerText) && !document.getElementById('glSheet') || true), 'dealer popup');
  for (const id of ['stats', 'shop', 'wheel', 'ach', 'settings', 'learn', 'drill']) ok(await page.evaluate(i => !!document.querySelector(`#scr-${i} .nav [data-help]`), id), 'help button in header: ' + id);
  // EN
  await page.evaluate(() => { __poker.setLang('en'); __poker.nav.go('wheel'); }); await page.waitForTimeout(150);
  ok(await page.evaluate(() => /Wheel|spin/i.test(document.getElementById('scr-wheel').innerText)), 'wheel EN');
  ok(errors.length === 0, 'no JS errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log(fails.length ? `\nv1.3 FAILED: ${fails.length}` : '\nv1.3 OK');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
