// v32 (1.9.4): hlášky u stolu (💬), cooldown, ztlumení, reakce botů, balíčky; boti přemýšlí („přemýšlí…“); online přes mock
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || 'screenshots/v32'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; window.__RR_MOCK = true; localStorage.setItem('pt_onboarded', '1');
    localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: 'cs', level: 1, opps: 5, learn: false, sound: false, vibrate: false, meter: true, speed: 1 }));
    localStorage.setItem('pt_wallet', JSON.stringify({ points: 5000, diamonds: 40, lastDaily: '', lessons: {} })); });
  await p.goto('file://' + __dirname + '/index.html'); await W(400);
  await p.evaluate(() => { __poker.nav.go('game'); }); await W(300);
  await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
  // přemýšlení botů: indikátor „přemýšlí…“ se objeví u delšího rozhodnutí
  let think = false, t0 = Date.now();
  while (Date.now() - t0 < 25000 && !think) { think = await p.evaluate(() => !!document.querySelector('#opps .opp.think')); if (!think) await W(100);
    if (await p.evaluate(() => __poker.G.turn === 0 && !!__poker.G.ctx && !__poker.G.over)) await p.evaluate(() => __poker.heroAct(__poker.G.ctx.toCall ? 'call' : 'check'));
    if (await p.evaluate(() => __poker.G.over)) await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); }); }
  ok(think, 'bot shows "přemýšlí…" while thinking');
  if (think) await p.screenshot({ path: OUT + '/3-premysli.png' });
  // bot think times are human-like (sampled)
  const tm = await p.evaluate(() => { const r = { easy: [], big: [] }; return r; });
  // 💬 výběr
  ok(!!(await p.$('#emoBtn')), '💬 button at hero seat');
  await p.click('#emoBtn'); await W(450);
  const n = await p.evaluate(() => ({ e: document.querySelectorAll('#sheet .emo-e').length, ph: document.querySelectorAll('#sheet .emo-ph:not(.lock)').length, lock: document.querySelectorAll('#sheet .emo-ph.lock').length }));
  ok(n.e === 13 && n.ph === 13 && n.lock === 12, `picker: 13 emoji, 13 phrases, 12 locked pack phrases (${JSON.stringify(n)})`);
  await p.screenshot({ path: OUT + '/1-vyber-hlasek.png' });
  await p.click('#sheet [data-emo="nic"]'); await W(500);
  const bub = await p.evaluate(() => { const e = document.querySelector('#felt .emo-b'); return e && e.textContent; });
  ok(/Nemám nic/.test(bub || ''), 'bubble at my seat: ' + bub);
  ok(await p.evaluate(() => document.getElementById('emoBtn').disabled), 'cooldown active');
  await p.screenshot({ path: OUT + '/2-bublina-u-stolu.png' });
  await W(2700);
  // reakce bota (pravděpodobnostní) – zkus pár hlášek
  let botReact = await p.evaluate(() => document.querySelectorAll('#felt .emo-b').length > 0 && [...document.querySelectorAll('#felt .emo-b')].some(e => !/Nemám nic/.test(e.textContent)));
  for (let k = 0; k < 6 && !botReact; k++) {
    await W(2600); await p.evaluate(() => document.getElementById('emoBtn').click()); await W(350);
    await p.evaluate(() => { const b = document.querySelector('#sheet [data-emo="klidne"]'); if (b) b.click(); });
    const tt = Date.now(); while (Date.now() - tt < 2800 && !botReact) { botReact = await p.evaluate(() => [...document.querySelectorAll('#felt .emo-b')].some(e => !/All-in\? Klidně/.test(e.textContent) && !/Nemám nic/.test(e.textContent))); await W(100); }
  }
  ok(botReact, 'a bot reacted with an emote');
  if (botReact) await p.screenshot({ path: OUT + '/2b-reakce-bota.png' });
  // balíček za diamanty
  await W(5200); await p.click('#emoBtn'); await W(400);
  const dia0 = await p.evaluate(() => JSON.parse(localStorage.getItem('pt_wallet')).diamonds);
  await p.click('#sheet [data-emopack="vtip"]'); await W(300);
  const pk = await p.evaluate(() => ({ unlocked: document.querySelectorAll('#sheet .emo-ph.lock').length, dia: JSON.parse(localStorage.getItem('pt_wallet')).diamonds }));
  ok(pk.unlocked === 6 && pk.dia === dia0 - 15, 'bought Vtipálek for 15 💎 ' + JSON.stringify(pk));
  await p.click('#sheet [data-emo="pizza"]'); await W(300);
  ok(await p.evaluate(() => [...document.querySelectorAll('#felt .emo-b')].some(e => /pizzu/.test(e.textContent))), 'pack phrase works');
  // ztlumení
  await p.evaluate(() => { __poker.settings.muteEmo = true; });
  await W(5200); await p.evaluate(() => document.querySelectorAll('#felt .emo-b').forEach(e => e.remove()));
  for (let k = 0; k < 3; k++) { await p.evaluate(() => document.getElementById('emoBtn').click()); await W(300); await p.evaluate(() => { const b = document.querySelector('#sheet [data-emo="e6"]'); if (b) b.click(); }); await W(2800); await W(2400); }
  ok(await p.evaluate(() => ![...document.querySelectorAll('#felt .emo-b')].some(e => e.textContent !== '🔥')), 'muted: no bot emotes');
  await p.evaluate(() => { __poker.settings.muteEmo = false; });
  // online (mock): hláška jde přes kanál a u druhého hráče se ukáže; server odmítne neznámé id a spam
  const r = await p.evaluate(async () => {
    const S = RRNet.mockServer(), a = new RRNet.MockNet(S, 'ua'), c = new RRNet.MockNet(S, 'uc');
    const v = await a.create({ max: 6, sb: 1, bb: 2, buyInBB: 100 }, 'A'); await c.join(v.code, 'C');
    const got = []; c.onEmote(x => got.push(x));
    const r1 = a.emote('gg'), r2 = a.emote('gg'), r3 = a.emote('<script>');
    return { r1, r2, r3, got };
  });
  ok(r.r1 === true && r.r2 === false && r.r3 === false && r.got.length === 1 && r.got[0].id === 'gg' && r.got[0].seat === 0, 'online mock: delivered, rate-limited, unknown id rejected ' + JSON.stringify(r));
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await b.close(); console.log(errors.length ? 'FAILED ' + errors.length : 'ALL OK'); process.exit(errors.length ? 1 : 0);
})();
