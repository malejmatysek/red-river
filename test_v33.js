// v33 (1.9.5): skrytý neomezený režim (body, diamanty, žetony Ukázat) – 7× klepnout na verzi v Nastavení, kód REDRIVER-INF; online beze změny
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || 'screenshots/v33'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; window.__RR_MOCK = true; localStorage.setItem('pt_onboarded', '1');
    if (!localStorage.getItem('pt_settings')) localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: 'cs', level: 1, sound: false, vibrate: false, speed: 2 }));
    if (!localStorage.getItem('pt_wallet')) localStorage.setItem('pt_wallet', JSON.stringify({ points: 700, diamonds: 3, showTok: 2, lastDaily: '', lessons: {} })); });
  const url = process.env.URL || 'file://' + __dirname + '/index.html';
  await p.goto(url); await W(400);
  const real = () => p.evaluate(() => { const w = JSON.parse(localStorage.getItem('pt_wallet')); return [w.points, w.diamonds, w.showTok]; });
  const r0 = await real();
  await p.evaluate(() => __poker.nav.go('settings')); await W(300);
  for (let i = 0; i < 7; i++) { await p.click('#setVer'); await W(60); }
  await W(400); ok(!!(await p.$('#infIn')), '7 taps on version opens code field');
  await p.fill('#infIn', 'spatny-kod'); await p.click('#infGo'); await W(200);
  ok(!(await p.evaluate(() => __poker.inf())) && !!(await p.$('#infIn.bad')), 'wrong code rejected');
  await p.screenshot({ path: OUT + '/1-kod.png' });
  await p.fill('#infIn', 'redriver-inf'); await p.click('#infGo'); await W(500);
  ok(await p.evaluate(() => __poker.inf() && localStorage.getItem('pt_inf') === '1'), 'code activates unlimited mode (stored)');
  ok(/∞/.test(await p.evaluate(() => document.getElementById('setVer').textContent)), 'settings shows ∞ marker');
  await p.evaluate(() => __poker.nav.go('shop')); await W(400);
  ok(await p.evaluate(() => /∞/.test(document.querySelector('.sh-bal').textContent) && (document.querySelector('.sh-bal').textContent.match(/∞/g) || []).length >= 2), 'shop balances show ∞');
  await p.screenshot({ path: OUT + '/2-obchod-nekonecno.png' });
  // nákupy: žetony za diamanty, žetony za body, balíček hlášek, avatar za body i diamanty
  await p.click('#shTokD'); await W(150); await p.click('#shTokP'); await W(150);
  await p.evaluate(() => document.querySelector('[data-emopk="drsnak"]').click()); await W(200);
  const bought = await p.evaluate(() => { const w = JSON.parse(localStorage.getItem('pt_wallet')); return { emo: !!w.owned.emo.drsnak }; });
  ok(bought.emo, 'emote pack bought');
  await p.evaluate(() => window.RRAvatars()); await W(300);
  const paid = await p.evaluate(() => [...document.querySelectorAll('#sheet .av-it.lock')].filter(b => !/🔒/.test(b.textContent)).map(b => b.dataset.av));
  for (const id of paid.slice(0, 2)) { await p.evaluate(id => document.querySelector(`#sheet [data-av="${id}"]`).click(), id); await W(250); await p.click('#avYes'); await W(350); }
  const own = await p.evaluate(ids => { const w = JSON.parse(localStorage.getItem('pt_wallet')); return ids.every(i => w.owned.avatar[i]); }, paid.slice(0, 2));
  ok(paid.length >= 2 && own, 'paid avatars bought: ' + paid.slice(0, 2).join(','));
  ok(JSON.stringify(await real()) === JSON.stringify(r0), 'real balances untouched while ∞ ' + JSON.stringify(await real()));
  // hra offline: buy-in / Ukázat žeton nesnižují
  await p.evaluate(() => { document.getElementById('scrim').click(); __poker.nav.go('game'); }); await W(500);
  await p.evaluate(() => { if (!__poker.G.players.length || __poker.G.over) __poker.startHand(); }); await W(800);
  ok(/∞/.test(await p.evaluate(() => (document.getElementById('ptsV') || {}).textContent || '')), 'table header shows ∞');
  ok(await p.evaluate(() => __poker.G.players[0].stack > 0), 'offline table works');
  // online (mock) body ze serveru beze změny
  const on = await p.evaluate(async () => { const S = RRNet.mockServer(), n = new RRNet.MockNet(S, 'u-inf'); const a = await n.points(); return { a, inf: a >= 1e9 }; });
  ok(typeof on.a === 'number' && !on.inf, 'online points come from server, not ∞ (' + on.a + ')');
  // vypnutí stejným kódem
  await p.evaluate(() => __poker.nav.go('settings')); await W(300);
  for (let i = 0; i < 7; i++) { await p.click('#setVer'); await W(60); }
  await W(400); await p.fill('#infIn', 'REDRIVER-INF'); await p.click('#infGo'); await W(400);
  ok(await p.evaluate(() => !__poker.inf() && !localStorage.getItem('pt_inf')), 'same code turns it off');
  await p.reload(); await W(500);
  await p.evaluate(() => __poker.nav.go('shop')); await W(300);
  ok(await p.evaluate(() => !/∞/.test(document.querySelector('.sh-bal').textContent)), 'after off+reload: real balances shown');
  const r1 = await real(); ok(r1[0] === r0[0] && r1[1] === r0[1] && r1[2] === r0[2], 'real balances preserved ' + JSON.stringify(r1));
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await b.close(); console.log(errors.length ? 'FAILED ' + errors.length : 'ALL OK'); process.exit(errors.length ? 1 : 0);
})();
