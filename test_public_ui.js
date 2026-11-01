/* Veřejné online stoly – UI test proti lokálnímu mocku (Playwright, bez sítě).
   Eva a Bob hrají přes RRNet.MockNet na stejném mock serveru, hráč v UI přisedne během ruky. */
const { chromium } = require(process.env.PW || 'playwright-core');
const SHOTS = !!process.env.SHOTS;
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const fails = [], errors = [], net = [];
  const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
  async function open(nobots) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: SHOTS ? 3 : 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith('file:')) net.push(r.url()); });
    await page.addInitScript(nb => { window.__RR_MOCK = true; window.__RR_PUB_NOBOTS = nb; window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1');
      localStorage.setItem('pt_settings', JSON.stringify({ lang: 'cs', level: 0, sound: false, vibrate: false })); }, nobots);
    await page.goto('file://' + __dirname + '/index.html'); await page.waitForTimeout(300);
    return page;
  }
  let page = await open(true);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `screenshots/public-${n}.png` }); };
  const txt = sel => page.$eval(sel, e => e.innerText).catch(() => '');
  const cur = () => page.evaluate(() => __nav.cur);
  const V = () => page.evaluate(() => OnlineUI.state.view);
  const N = (who, fn, ...a) => page.evaluate(([w, f, a]) => window.__p[w][f](...a), [who, fn, a]);

  // 1) Domů: obě vstupní karty
  ok(/Hrát online/.test(await txt('#homePublic')) && /Hrát s kamarády/.test(await txt('#homeOnline')), 'home: "Hrát online" + "Hrát s kamarády"');
  await shot('0-home');
  await page.click('#homePublic'); await page.waitForTimeout(250);
  ok(await cur() === 'public', 'public screen opens');
  const body = await txt('#pubBody');
  ok(/Mikro/.test(body) && /Střední/.test(body) && /Vysoké/.test(body) && /1\/2/.test(body) && /5\/10/.test(body) && /25\/50/.test(body), '3 stake tiers shown');
  ok(/200/.test(body) && /500/.test(body) && /2\s?500/.test(body), 'buy-ins 200 / 500 / 2 500');
  ok(await page.$eval('[data-sit="high"]', b => b.disabled), 'high tier disabled with 1000 points');
  ok(/UKÁZKA/.test(body), 'demo badge in mock mode');

  // 2) nevhodná přezdívka
  await page.fill('#pubName', 'K0k0t'); await page.click('[data-sit="micro"]'); await page.waitForTimeout(200);
  ok(await cur() === 'public' && /přezdívka/i.test(await txt('.toast')), 'offensive nickname rejected: ' + (await txt('.toast')));

  // 3) Eva a Bob už hrají
  await page.evaluate(async () => { const S = RRNet.mockServer(); window.__p = { eva: new RRNet.MockNet(S, 'eva'), bob: new RRNet.MockNet(S, 'bob') };
    await window.__p.eva.quickseat('micro', 'Eva'); await window.__p.bob.quickseat('micro', 'Bob'); });
  ok((await N('eva', 'state')).hand && !(await N('eva', 'state')).hand.done, 'Eva + Bob: hand running');
  await page.waitForTimeout(5200);   // počítadlo lobby se obnoví po 5 s
  await page.evaluate(() => __nav.go('public')); await page.evaluate(() => OnlineUI.onShow('public')); await page.waitForTimeout(150);
  ok(/2 hráči · 1 stůl/.test(await txt('#pubBody')), 'lobby shows live players: ' + /\d+ hráč\S* · \d+ st\S*/.exec(await txt('#pubBody')));
  await shot('1-lobby');

  // 4) rychlé usazení během ruky
  await page.fill('#pubName', 'Matyáš'); await page.click('[data-sit="micro"]'); await page.waitForTimeout(300);
  ok(await cur() === 'ontable', 'quick seat → table');
  let v = await V();
  ok(v.code === (await N('eva', 'state')).code, 'seated at the same public table as Eva/Bob');
  ok(/Veřejný · Mikro 1\/2/.test(await txt('#otCode')), 'table title: ' + (await txt('#otCode')));
  ok(await page.evaluate(() => OnlineUI.state.points) === 800, 'buy-in 200 debited (1000 → 800)');
  ok(/hraješ od další/.test(await txt('#otStatus')) && !v.seats[v.me].inHand, 'mid-hand join: waits for next hand');
  ok(await page.$$eval('#otHero .card:not(.ghost)', e => e.length) === 0 && !(await page.$('#oaCall')), 'no cards / no actions this hand');
  ok(!(await page.$('#scr-ontable #odds')) && !(await page.$('#scr-ontable .rec')) && !/%/.test(await txt('#scr-ontable')), 'no hints / win % at public table');
  await shot('2-midhand');

  // 5) Eva a Bob dohrají, další ruka už se mnou
  for (let k = 0; k < 30; k++) { const e = await N('eva', 'state'); if (!e.hand || e.hand.done) break;
    for (const w of ['eva', 'bob']) { const s = await N(w, 'state'); if (s.hand && s.hand.legal) await N(w, 'act', { t: s.hand.legal.canCheck ? 'check' : 'call' }); } }
  await page.waitForTimeout(6800);
  v = await V();
  ok(v.hand && v.hand.no === 2 && v.seats[v.me].inHand, 'dealt into hand #2');
  ok(await page.$$eval('#otHero .card:not(.ghost):not(.back)', e => e.length) === 2, 'own two cards face up');
  ok(await page.$$eval('#otOpps .mini .card:not(.back)', e => e.length) === 0, 'opponent cards hidden');
  ok(!(await page.$('#otDeal')), 'no host "deal now" at public table');
  await shot('3-table');

  // 6) menu: nahlásit (bez kopírování odkazu)
  await page.click('#otMenu'); await page.waitForTimeout(100);
  ok(!!(await page.$('#omReport')) && !(await page.$('#omCopy')), 'menu: report, no invite link');
  await page.click('#omReport'); await page.waitForTimeout(100);
  ok(/Eva/.test(await txt('#sheet')) && /Bob/.test(await txt('#sheet')), 'report sheet lists other players');
  await page.click('#rpWhy [data-v="name"]'); await page.waitForTimeout(50);
  await shot('4-report');
  await page.click('#rpGo'); await page.waitForTimeout(200);
  const reps = await page.evaluate(() => RRNet.mockServer().reports);
  ok(reps.length === 1 && reps[0].reason === 'name' && ['eva', 'bob'].includes(reps[0].reported), 'report stored on server');
  ok(/nahlášení/.test(await txt('.toast')), 'report confirmation toast');

  // 7) časový limit → automatický fold
  v = await V();
  if (v.hand && !v.hand.done) {
    for (let k = 0; k < 10 && (await V()).hand.toAct !== (await V()).me && !(await V()).hand.done; k++) { for (const w of ['eva', 'bob']) { const s = await N(w, 'state'); if (s.hand && s.hand.legal) await N(w, 'act', { t: s.hand.legal.canCheck ? 'check' : 'call' }); } await page.waitForTimeout(80); }
  }
  v = await V();
  if (v.hand && !v.hand.done && v.hand.toAct === v.me) {
    await page.evaluate(() => { const S = RRNet.mockServer(); const r = S.rooms.get(OnlineUI.state.view.code); r.hand.deadline = Date.now() - 1; });
    await page.waitForTimeout(900);
    v = await V(); const last = v.seats[v.me].last;
    ok(last && (last.t === 'fold' || last.t === 'check') && v.hand.toAct !== v.me, 'timeout → auto fold/check (' + (last && last.t) + ')');
  } else ok(true, 'timeout case skipped (hand ended)');

  // 8) odchod → zpět na Hrát online, žetony vráceny
  const stack = (await V()).seats[(await V()).me].stack;
  await page.click('#otMenu'); await page.click('#omLeave'); await page.click('#lvYes'); await page.waitForTimeout(250);
  ok(await cur() === 'public', 'leave → back to "Hrát online"');
  ok(await page.evaluate(() => OnlineUI.state.points) === 800 + stack, 'chips refunded (' + (800 + stack) + ')');

  // 9) offline ukázka s boty
  page = await open(false);
  await page.click('#homePublic'); await page.waitForTimeout(200);
  await page.fill('#pubName', 'Matyáš'); await page.click('[data-sit="micro"]'); await page.waitForTimeout(500);
  v = await V();
  ok(await cur() === 'ontable' && v.seats.filter(s => s && s.bot).length === 3 && v.hand, 'demo: bots fill the table and the hand starts');
  ok(/UKÁZKA/.test(await txt('#otCode')), 'demo badge on table');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: 'screenshots/public-5-demo.png' });
  // EN
  await page.evaluate(() => __poker.setLang('en')); await page.waitForTimeout(100);
  ok(/Public · Micro 1\/2/.test(await txt('#otCode')), 'English title');

  ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '));
  ok(net.length === 0, 'no network requests in mock mode ' + net.slice(0, 2).join(' '));
  await browser.close();
  console.log(fails.length ? '\nPUBLIC UI FAIL ' + fails.length : '\nPUBLIC UI OK');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
