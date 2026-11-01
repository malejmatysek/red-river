/* Snímky skutečné aplikace (ne návrhu): node shots.js  → screenshots/app-*.png */
const { chromium } = require(process.env.PW || 'playwright-core');
const path = require('path'), DIR = path.join(__dirname, 'screenshots'), URL = 'file://' + path.join(__dirname, 'index.html');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'cs-CZ' });
  const errs = [];
  const open = async (init) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.addInitScript(init || (() => {})); return p; };
  const shot = (p, n) => p.screenshot({ path: path.join(DIR, `app-${n}.png`) });
  // 1) úvodní logo uprostřed otočky + po usazení, 2) úvod
  const ctx0 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'cs-CZ' });
  let p = await ctx0.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(380); await shot(p, '01-splash-otocka');
  await p.waitForTimeout(800); await shot(p, '01b-splash');
  await p.waitForTimeout(900); await shot(p, '02-uvod-1');
  for (const n of [2, 3, 4]) { await p.click('#obNext'); await p.waitForTimeout(450); await shot(p, `02-uvod-${n}`); }
  await ctx0.close();
  // 3) domů, hra, nastavení…
  p = await open(() => { window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1'); localStorage.setItem('pt_settings', JSON.stringify({ sound: false, vibrate: false, lang: 'cs', opps: 5 })); });
  await p.goto(URL); await p.waitForTimeout(400);
  // pár odehraných rukou kvůli statistikám
  await p.evaluate(() => { window.__FAST = true; __poker.settings.opps = 5; });
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => __poker.startHand());
    for (let k = 0; k < 400; k++) {
      const st = await p.evaluate(() => { if (__G.over) return 1; if (__G.turn === 0 && __G.rec) { const r = __G.rec.action, c = __G.ctx.toCall; __poker.heroAct(r === 'fold' ? (c ? 'fold' : 'check') : (c ? 'call' : 'check')); } return 0; });
      if (st) break; await p.waitForTimeout(5);
    }
  }
  await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(500); await shot(p, '03-domu');
  await p.click('#playBtn'); await p.waitForTimeout(650); await shot(p, '04-hra-rozdavani');
  await p.waitForFunction(() => __G.turn === 0 && !__G.dealing, null, { timeout: 30000 }); await p.waitForTimeout(500); await shot(p, '04b-hra-doporuceni');
  await p.evaluate(() => __poker.heroAct(__G.ctx.toCall ? 'call' : 'check')); await p.waitForTimeout(700); await shot(p, '04c-hra-hodnoceni');
  await p.evaluate(() => { document.getElementById('scrim').click(); __nav.go('settings'); }); await p.waitForTimeout(500); await shot(p, '05-nastaveni');
  await p.evaluate(() => document.querySelector('#scr-settings').scrollTo(0, 99999)); await p.waitForTimeout(200); await shot(p, '05b-nastaveni-jazyk');
  await p.evaluate(() => __nav.go('stats')); await p.waitForTimeout(500); await shot(p, '06-statistiky');
  await p.evaluate(() => __nav.go('drill')); await p.waitForTimeout(500);
  await p.evaluate(() => [...document.querySelectorAll('#drActions button')].find(b => !b.disabled).click()); await p.waitForTimeout(500); await shot(p, '07-trenink-situaci');
  await p.evaluate(() => __nav.go('learn')); await p.waitForTimeout(500); await shot(p, '08-uceni');
  await p.evaluate(() => { __poker.setLang('en'); __nav.go('settings'); }); await p.waitForTimeout(500); await shot(p, '09-settings-en');
  await p.evaluate(() => __nav.go('game')); await p.waitForTimeout(500); await shot(p, '09b-game-en');
  await b.close();
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'shots OK');
})();
