const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.__FAST = true; });
  await page.goto('file://' + __dirname + '/index.html');
  const HANDS = +process.env.HANDS || 200;
  let chipErr = 0, showdowns = 0, decisions = 0, allins = 0, heroAllin = 0; const tables = {};
  await page.evaluate(() => { __poker.settings.opps = 1; __poker.startHand(); });
  for (let h = 0; h < HANDS; h++) {
    for (let step = 0; step < 400; step++) {
      const st = await page.evaluate(() => ({ over: __G.over, turn: __G.turn }));
      if (st.over) break;
      if (st.turn === 0) {
        await page.evaluate(() => {
          const G = __G, c = G.ctx, r = Math.random();
          const a = r < 0.5 ? G.rec.action : r < 0.55 ? 'allin' : r < 0.65 ? 'fold' : r < 0.85 ? (c.toCall ? 'call' : 'check') : (c.toCall ? 'raise' : 'bet');
          const to = (a === 'bet' || a === 'raise') ? (Math.random() < 0.1 ? c.stack + c.myBet : (G.rec.to || c.minRaiseTo)) : undefined;
          __poker.heroAct(a === 'fold' && c.toCall === 0 ? 'check' : a, to);
        });
        decisions++;
      } else await page.waitForTimeout(5);
    }
    const res = await page.evaluate(() => ({ over: __G.over, sum: __G.players.reduce((s, p) => s + p.stack, 0), start: __G.players.reduce((s, p) => s + p.start, 0), n: __G.players.length, sd: __G.players.filter(p => !p.folded).length > 1, allin: __G.players.some(p => p.allIn) }));
    tables[res.n] = (tables[res.n] || 0) + 1; if (res.allin) allins++;
    if (!res.over) { errors.push('hand did not finish #' + h); }
    if (res.sum !== res.start) chipErr++;
    if (res.sd) showdowns++;
    const third = Math.floor(HANDS / 3);
    if (h === third - 1) await page.evaluate(() => { __poker.settings.opps = 5; });
    if (h === 2 * third - 1) await page.evaluate(() => { __poker.settings.opps = 8; });
    await page.evaluate(() => __poker.startHand());
  }
  const stats = await page.evaluate(() => localStorage.getItem('pt_stats'));
  console.log(JSON.stringify({ hands: HANDS, tables, decisions, showdowns, handsWithAllin: allins, chipErr, errors: errors.slice(0, 10), stats }));
  await browser.close();
  process.exit(errors.length || chipErr ? 1 : 0);
})();
