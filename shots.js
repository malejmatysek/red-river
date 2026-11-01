const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.__FAST = true; window.__SHOWSTART = true; localStorage.setItem('pt_settings', JSON.stringify({ recs: true, odds: true, learn: true, opps: 2 })); });
  await page.goto('file://' + __dirname + '/index.html');
  await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/00-uvod.png' });
  await page.click('#playBtn');
  const st = () => page.evaluate(() => ({ over: __G.over, turn: __G.turn, street: __G.street, fb: !!__G.feedback, rec: __G.rec && __G.rec.action }));
  // 1) preflop, hráč na tahu, doporučení zapnuté (hledáme hratelnou ruku)
  for (let i = 0; i < 80; i++) {
    let s = await st();
    while (!s.over && s.turn !== 0) { await page.waitForTimeout(20); s = await st(); }
    if (!s.over && s.street === 0 && s.rec !== 'fold') break;
    await page.evaluate(() => __poker.startHand());
  }
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/01-preflop-doporuceni.png' });
  // 2) hraj podle doporučení, dokud nejsme postflop s feedbackem
  let got = false;
  for (let i = 0; i < 200 && !got; i++) {
    let s = await st();
    if (s.over) { await page.evaluate(() => __poker.startHand()); continue; }
    if (s.turn !== 0) { await page.waitForTimeout(20); continue; }
    if (s.street >= 1 && s.fb) { got = true; break; }
    await page.evaluate(() => { const G = __G; const a = G.rec.action === 'fold' && G.street === 0 ? (G.ctx.toCall ? 'call' : 'check') : G.rec.action; __poker.heroAct(a, G.rec.to); });
  }
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/02-flop-sance-a-zpetna-vazba.png' });
  // 3) dohraj ruku a ukaž rozbor
  for (let i = 0; i < 100; i++) {
    const s = await st(); if (s.over) break;
    if (s.turn === 0) await page.evaluate(() => { const G = __G; __poker.heroAct(G.ctx.toCall ? 'call' : 'check'); }); else await page.waitForTimeout(20);
  }
  await page.waitForTimeout(800); await page.screenshot({ path: 'screenshots/03-rozbor-ruky.png' });
  // 4) statistiky
  await page.evaluate(() => document.getElementById('scrim').click()); await page.click('#statsBtn'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/04-statistiky.png' });
  console.log('errors', errors);
  await browser.close();
})();
