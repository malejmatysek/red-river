const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  async function open(opps, init) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(([o, init]) => { window.__FAST = true; Object.assign(window, init); localStorage.setItem('pt_settings', JSON.stringify({ recs: true, odds: true, learn: true, opps: o, shortStacks: true, v: 2 })); }, [opps, init]);
    await page.goto('file://' + __dirname + '/index.html');
    return page;
  }
  const st = p => p.evaluate(() => ({ over: __G.over, turn: __G.turn, street: __G.street, fb: !!__G.feedback, rec: __G.rec && __G.rec.action }));
  async function heroPreflop(p, ok) {   // najdi ruku, kde je hráč preflop na tahu a doporučení splňuje podmínku
    for (let i = 0; i < 200; i++) {
      let s = await st(p);
      while (!s.over && s.turn !== 0) { await p.waitForTimeout(20); s = await st(p); }
      if (!s.over && s.street === 0 && ok(s.rec)) return;
      await p.evaluate(() => __poker.startHand());
    }
  }
  const finishHand = async p => { for (let i = 0; i < 200; i++) { const s = await st(p); if (s.over) break; if (s.turn === 0) await p.evaluate(() => __poker.heroAct(__G.ctx.toCall ? 'call' : 'check')); else await p.waitForTimeout(20); } };

  // --- 6-max (5 botů, výchozí) ---
  let page = await open(5, { __DEEP: true });
  await heroPreflop(page, r => r === 'raise' || r === 'call');
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/01-preflop-doporuceni-6max.png' });
  let got = false;
  for (let i = 0; i < 300 && !got; i++) {
    const s = await st(page);
    if (s.over) { await page.evaluate(() => __poker.startHand()); continue; }
    if (s.turn !== 0) { await page.waitForTimeout(20); continue; }
    if (s.street >= 1 && s.fb) { got = true; break; }
    await page.evaluate(() => { const G = __G; const a = G.rec.action === 'fold' && G.street === 0 ? (G.ctx.toCall ? 'call' : 'check') : G.rec.action; __poker.heroAct(a, G.rec.to); });
  }
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/02-flop-sance-a-zpetna-vazba.png' });
  await finishHand(page);
  await page.waitForTimeout(800); await page.screenshot({ path: 'screenshots/03-rozbor-ruky.png' });
  await page.evaluate(() => document.getElementById('scrim').click()); await page.click('#statsBtn'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/04-statistiky.png' });
  await page.evaluate(() => document.getElementById('scrim').click()); await page.click('#settingsBtn'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/09-nastaveni-pocet-souperu.png' });
  await page.close();

  // --- plný stůl (8 botů, 9 hráčů) ---
  page = await open(8, { __DEEP: true });
  await heroPreflop(page, r => r !== 'fold');
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/06-9max-preflop.png' });
  await finishHand(page); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('scrim').click()); await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/08-9max-showdown.png' });
  await page.close();

  // --- all-in doporučení: krátký stack 10 BB ---
  page = await open(5, { __FORCE_SHORT: 10 });
  await heroPreflop(page, r => r === 'allin');
  await page.waitForTimeout(500); await page.screenshot({ path: 'screenshots/07-allin-doporuceni.png' });
  await page.evaluate(() => __poker.heroAct('fold')); await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/07b-allin-hodnoceni-foldu.png' });
  await page.close();
  console.log('errors', errors);
  await browser.close();
})();
