// v34 (1.9.6): showdown s vedlejším potem – u vítězů „Hlavní pot X“ / „Vedlejší pot Y“, i v souhrnu; online resultLine
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || 'screenshots/v34'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1');
    localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: 'cs', level: 1, opps: 2, learn: false, sound: false, vibrate: false, meter: true, speed: 2, muteEmo: true })); });
  await p.goto('file://' + __dirname + '/index.html'); await W(400);
  await p.evaluate(() => { __poker.nav.go('game'); PE.botDecide = c => ({ action: c.toCall ? 'call' : 'check' }); }); await W(300);
  let got = null;
  for (let k = 0; k < 40 && !got; k++) {
    await p.evaluate(() => { document.getElementById('scrim').click(); window.__FAST = true; __poker.startHand();
      const G = __poker.G; G.players.forEach((q, i) => { if (i) q.stack = i === 1 ? Math.max(1, 9 - q.bet) : 200; else q.stack = 200 - q.bet; q.start = q.stack + q.bet; }); });
    let t0 = Date.now();
    while (Date.now() - t0 < 5000 && !(await p.evaluate(() => __poker.G.over))) { await p.evaluate(() => { const G = __poker.G; if (G.turn === 0 && G.ctx && !G.dealing) __poker.heroAct('allin'); }); await W(20); }
    got = await p.evaluate(() => { const G = __poker.G, L = RRT.potLabels(G.pots, __poker.t || (k => k)); return L.length >= 2 && L[0].winners.join() !== L[1].winners.join() && L.some(x => x.winners.includes(0)) ? L.map(x => x.key + ':' + x.amount + ':' + x.winners.join('+')) : null; });
  }
  ok(!!got, 'side-pot showdown with different winners ' + JSON.stringify(got));
  await p.evaluate(() => { window.__FAST = false; document.getElementById('scrim').click(); const G = __poker.G; G.handNo += 0; document.getElementById('sdStrip').dataset.k = ''; __poker.render && __poker.render(); });
  await W(600);
  const strip = await p.evaluate(() => [...document.querySelectorAll('#sdStrip .sd-p')].map(e => e.textContent));
  ok(strip.length === 2 && strip.some(s => /Hlavní pot \d/.test(s)) && strip.some(s => /Vedlejší pot \d/.test(s)), 'winner labels: ' + JSON.stringify(strip));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth); ok(ov <= 375, 'fits 375px (' + ov + ')');
  await p.screenshot({ path: OUT + '/1-vedlejsi-pot-375.png' });
  await p.evaluate(() => __poker.showSummary ? __poker.showSummary() : null); await W(500);
  const sum = await p.evaluate(() => { const e = document.querySelector('#sheet .sum-pots'); return e && e.textContent; });
  if (sum !== null) { ok(/Hlavní pot \d+ → .+ · Vedlejší pot \d+ → /.test(sum || ''), 'summary line: ' + sum); await p.screenshot({ path: OUT + '/2-souhrn.png' }); }
  // EN
  await p.evaluate(() => { document.getElementById('scrim').click(); __poker.setLang('en'); }); await W(300);
  await p.evaluate(() => { document.getElementById('sdStrip').dataset.k = ''; __poker.render && __poker.render(); }); await W(200);
  const en = await p.evaluate(() => [...document.querySelectorAll('#sdStrip .sd-p')].map(e => e.textContent));
  ok(en.some(s => /Main pot/.test(s)) && en.some(s => /Side pot/.test(s)), 'EN labels ' + JSON.stringify(en));
  // jeden hrnec → beze změny
  ok(await p.evaluate(() => RRT.potLabels([{ amount: 30, elig: [0, 1], winners: [1] }, { amount: 12, elig: [0], winners: [0] }], k => k).length === 0), 'single contested pot (+ returned excess) → no labels');
  // online: resultLine z r.pots + seats
  const r = await p.evaluate(() => { const sp = RRT.splitPots([{ id: 0, total: 50, folded: false }, { id: 1, total: 9, folded: false }, { id: 2, total: 50, folded: false }]); return sp.map(x => x.amount + ':' + x.elig.join('+')); });
  ok(JSON.stringify(r) === '["27:0+1+2","82:0+2"]', 'splitPots ' + JSON.stringify(r));
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await b.close(); console.log(errors.length ? 'FAILED ' + errors.length : 'ALL OK'); process.exit(errors.length ? 1 : 0);
})();
