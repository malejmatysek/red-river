// v31 (1.9.3): volba velikosti sázky – posuvník, −/+, rychlé volby, vlastní částka, popisky, potvrzení
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || 'screenshots/v31'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1');
    localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: 'cs', level: 1, opps: 5, learn: false, sound: false, vibrate: false, meter: true })); });
  await p.goto('file://' + __dirname + '/index.html'); await W(400);
  await p.evaluate(() => { __poker.nav.go('game'); }); await W(300);
  const waitTurn = async (ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await p.evaluate(() => ({ t: __poker.G.turn, d: __poker.G.dealing, o: __poker.G.over, c: !!__poker.G.ctx })); if (s.o) return 'over'; if (s.t === 0 && !s.d && s.c) return 'turn'; await W(60); } return 'timeout'; };
  let got = false;
  for (let k = 0; k < 10 && !got; k++) {
    await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
    got = (await waitTurn()) === 'turn' && !!(await p.$('#sizeBtn'));
  }
  ok(got, 'hero turn with size button'); await W(300);
  await p.click('#sizeBtn'); await W(450);
  const st = () => p.evaluate(() => ({ v: +document.getElementById('bsV').textContent.replace(/\D/g, ''), go: document.getElementById('bsGo').textContent, info: document.getElementById('bsInfo').textContent }));
  const c = await p.evaluate(() => { const c = __poker.G.ctx, h = __poker.G.players[0]; return { min: c.minRaiseTo, max: h.stack + h.bet, toCall: c.toCall, pot: c.pot }; });
  ok(!!(await p.$('#bsR')) && (await p.$$('.bs-c')).length === 5, 'slider + 5 quick chips');
  let s = await st(); ok(/^(Raise na|Bet) \d/.test(s.go) && /× BB · \d+ % potu/.test(s.info), `labels: "${s.go}" "${s.info}"`);
  await p.screenshot({ path: OUT + '/1-velikost-sazky.png' });
  // posuvník na začátek = minimum, na konec = all-in
  const setR = u => p.$eval('#bsR', (e, u) => { e.value = u; e.dispatchEvent(new Event('input')); }, u);
  await setR(0); s = await st(); ok(s.v === c.min, `slider 0 → min ${s.v}`);
  await setR(1000); s = await st(); ok(s.v === c.max && /^All-in/.test(s.go), `slider end → ${s.go}`);
  await setR(250); s = await st(); ok(s.v > c.min && s.v < c.min + (c.max - c.min) * 0.15 && s.v % 2 === 0, `25 % of slider → ${s.v} (fine low end, snapped to BB)`);
  const v0 = s.v; await p.click('#bsPlus'); s = await st(); ok(s.v > v0, '+ step ' + v0 + '→' + s.v); await p.click('#bsMinus'); await p.click('#bsMinus'); s = await st(); ok(s.v < v0 || s.v === c.min, '− step → ' + s.v);
  await p.click('.bs-c:nth-child(3)'); s = await st(); ok(s.v >= c.min && s.v <= c.max, 'pot chip → ' + s.v);
  // vlastní částka
  await p.click('#bsV'); await p.fill('#bsIn', '1'); await p.press('#bsIn', 'Enter'); s = await st(); ok(s.v === c.min, 'typed 1 → clamped to min ' + s.v);
  await p.click('#bsV'); await p.fill('#bsIn', '99999'); await p.press('#bsIn', 'Enter'); s = await st(); ok(s.v === c.max, 'typed 99999 → all-in ' + s.v);
  const want = Math.min(c.max - 1, c.min + 7);
  await p.click('#bsV'); await p.fill('#bsIn', String(want)); await p.press('#bsIn', 'Enter'); s = await st(); ok(s.v === want, 'typed exact ' + want);
  await p.click('#bsV'); await W(100); await p.screenshot({ path: OUT + '/2-vlastni-castka.png' }); await p.press('#bsIn', 'Enter');
  await setR(400); await W(100); await p.screenshot({ path: OUT + '/3-posuvnik.png' });
  s = await st(); await p.click('#bsGo'); await W(300);
  const last = await p.evaluate(() => __poker.G.players[0].bet);
  ok(last === s.v, `confirm → hero bet ${last} (wanted ${s.v})`);
  ok(errors.length === 0 || errors.every(e => !/Error/.test(e)), 'no page errors ' + errors.join(' | '));
  await b.close(); console.log(errors.length ? 'FAILED ' + errors.length : 'ALL OK'); process.exit(errors.length ? 1 : 0);
})();
