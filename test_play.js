const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(([L, LV]) => { window.__FAST = true; if (L && !localStorage.getItem('pt_settings')) localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: L, level: +LV || 0, adv: +LV === 2, recs: +LV !== 2, odds: +LV !== 2, learn: +LV !== 2 })); if (!localStorage.getItem('pt_wallet')) localStorage.setItem('pt_wallet', JSON.stringify({ points: 1e9, lastDaily: '', lessons: {} })); }, [process.env.TLANG || '', process.env.LEVEL || '0']);
  await page.goto('file://' + __dirname + '/index.html');
  const HANDS = +process.env.HANDS || 200;
  let rawNot = 0, rawEx = ''; let chipErr = 0, showdowns = 0, decisions = 0, allins = 0, heroAllin = 0; const tables = {};
  await page.evaluate(() => { __poker.settings.opps = 1; __poker.startHand(); });
  for (let h = 0; h < HANDS; h++) {
    for (let step = 0; step < 400; step++) {
      const st = await page.evaluate(() => ({ over: __G.over, turn: __G.turn }));
      if (st.over) break;
      if (st.turn === 0) {
        await page.evaluate(() => {
          const G = __G, c = G.ctx, r = Math.random();
          const a = r < 0.5 && G.rec ? G.rec.action : r < 0.55 ? 'allin' : r < 0.65 ? 'fold' : r < 0.85 ? (c.toCall ? 'call' : 'check') : (c.toCall ? 'raise' : 'bet');
          const to = (a === 'bet' || a === 'raise') ? (Math.random() < 0.1 ? c.stack + c.myBet : (G.rec.to || c.minRaiseTo)) : undefined;
          __poker.heroAct(a === 'fold' && c.toCall === 0 ? 'check' : a, to);
        });
        const txt = await page.evaluate(() => document.getElementById('recWhy').innerText + ' | ' + document.getElementById('fbTxt').innerText + ' | ' + (() => { const x = document.getElementById('heroPos').cloneNode(true); x.querySelectorAll('small').forEach(e => e.remove()); return x.textContent; })() + ' | ' + document.getElementById('made').innerText);
        const RAW = /\b[2-9TJQKA]{2}[os]\b|\b(BTN|UTG|HJ|LJ)\b|\d BB\b/;
        if (process.env.LEVEL !== '2' && RAW.test(txt)) { rawNot++; if (!rawEx) rawEx = txt; }
        decisions++;
        await page.evaluate(() => { if (__G.hold) __poker.coachGo(); });
      } else await page.waitForTimeout(5);
    }
    const res = await page.evaluate(() => ({ over: __G.over, sum: __G.players.reduce((s, p) => s + p.stack, 0), start: __G.players.reduce((s, p) => s + p.start, 0), n: __G.players.length, sd: __G.players.filter(p => !p.folded).length > 1, allin: __G.players.some(p => p.allIn) }));
    tables[res.n] = (tables[res.n] || 0) + 1; if (res.allin) allins++;
    if (!res.over) { errors.push('hand did not finish #' + h); }
    if (res.sum !== res.start) chipErr++;
    if (res.sd) showdowns++;
    const third = Math.floor(HANDS / 3);
    if (h === third - 1) await page.evaluate(() => { __poker.settings.opps = 5; });
    if (h === 2 * third - 1) await page.evaluate(() => { __poker.settings.opps = 8; __poker.settings.bankroll = false; __poker.settings.randomDepth = true; });
    await page.evaluate(() => __poker.startHand());
  }
  if (process.env.LEVEL === '2') { const vis = await page.evaluate(() => ['coach', 'odds', 'kombiBtn'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none'));
    if (vis.length) errors.push('expert shows help: ' + vis.join(',')); else console.log('expert: help hidden OK'); }
  const extra = await page.evaluate(() => ({ session: JSON.parse(localStorage.getItem('pt_session')), names: __G.players.map(p => p.name).join(',') }));
  // ekonomika: bez bodů se ke stolu nesedne
  const block = await page.evaluate(() => { __poker.wallet.points = 0; __poker.settings.bankroll = true; __poker.settings.blinds = 2; __G.tableKey = 'x'; localStorage.setItem('pt_session', '{}');
    const n0 = __G.handNo; __G.over = true; __poker.startHand(); return { dealt: __G.handNo !== n0, sheet: !document.getElementById('sheet').hidden }; });
  if (block.dealt || !block.sheet) errors.push('no-points gate failed ' + JSON.stringify(block));
  if (rawNot) errors.push('raw notation in beginner texts x' + rawNot + ': ' + rawEx.slice(0, 200));
  const stats = await page.evaluate(() => localStorage.getItem('pt_stats'));
  console.log('session hands', extra.session.hands, 'table', extra.names);
  console.log(JSON.stringify({ hands: HANDS, tables, decisions, rawNot, block, showdowns, handsWithAllin: allins, chipErr, errors: errors.slice(0, 10), stats }));
  await browser.close();
  process.exit(errors.length || chipErr ? 1 : 0);
})();
