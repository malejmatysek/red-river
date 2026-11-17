// v28 (1.9.0): oválný stůl s avatary, animace, horní lišta níž, ukázat/zahodit po výhře foldem, žetony Ukázat, výběr avatara, online stůl
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || 'screenshots/v28'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  const mk = async (w, h, extra) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.addInitScript(x => { window.__NOSPLASH = true; window.__RR_MOCK = true; localStorage.setItem('pt_onboarded', '1');
      localStorage.setItem('pt_settings', JSON.stringify(Object.assign({ v: 4, lang: 'cs', level: 1, opps: 5, learn: false, sound: false, vibrate: false, meter: true, speed: 2 }, x))); }, extra || {});
    await p.goto('file://' + __dirname + '/index.html'); await W(400); return p;
  };
  const p = await mk(390, 844);
  const noOv = () => p.addStyleTag({ content: '#hrFx{display:none!important}' });
  await p.evaluate(() => { __poker.nav.go('game'); }); await W(300);
  await p.evaluate(() => { if (!__poker.G.players.length || __poker.G.over) __poker.startHand(); });
  const waitTurn = async (ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await p.evaluate(() => ({ t: __poker.G.turn, d: __poker.G.dealing, o: __poker.G.over, c: !!__poker.G.ctx })); if (s.o) return 'over'; if (s.t === 0 && !s.d && s.c) return 'turn'; await W(60); } return 'timeout'; };
  ok(await waitTurn() === 'turn', 'hero turn reached');
  await W(400);
  // rozložení: nic nepřetéká, 6 míst, horní lišta pod safe-area
  const lay = await p.evaluate(() => {
    const f = document.getElementById('felt').getBoundingClientRect(), seats = [...document.querySelectorAll('#opps .opp')].map(e => e.getBoundingClientRect());
    return { n: seats.length + 1, fw: f.width, over: seats.some(r => r.left < -1 || r.right > innerWidth + 1), docW: document.documentElement.scrollWidth, svg: document.querySelectorAll('#felt .av-svg').length,
      topPad: parseFloat(getComputedStyle(document.getElementById('app')).paddingTop) };
  });
  ok(lay.n === 6 && !lay.over && lay.docW <= 390, `6 seats inside 390px (doc ${lay.docW})`);
  ok(lay.svg >= 6, 'avatars rendered at table (' + lay.svg + ')');
  ok(lay.topPad >= 20, 'top bar padding ' + lay.topPad + 'px');
  await p.screenshot({ path: OUT + '/1-stul-preflop.png' });
  // all-in
  await p.evaluate(() => __poker.heroAct('allin')); await W(380);
  await p.screenshot({ path: OUT + '/2-all-in.png' });
  ok(await p.evaluate(() => document.querySelectorAll('.fx-chip').length > 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches), 'chip animation running on all-in');
  // showdown / vítěz
  await noOv();
  let t0 = Date.now(); while (!(await p.evaluate(() => __poker.G.over)) && Date.now() - t0 < 20000) await W(100);
  for (let k = 0; k < 12 && !(await p.evaluate(() => __poker.G.players.filter(x => x.show).length > 1)); k++) {
    await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
    t0 = Date.now();
    while (!(await p.evaluate(() => __poker.G.over)) && Date.now() - t0 < 30000) { if ((await waitTurn(30000)) === 'turn') await p.evaluate(() => __poker.heroAct(__poker.G.ctx.toCall ? 'call' : 'check')); await W(50); }
  }
  const sd = await p.evaluate(() => __poker.G.players.filter(x => x.show).length > 1); ok(sd, 'showdown reached');
  await W(2600);
  await p.evaluate(() => { document.getElementById('scrim').click(); }); await W(250);
  await p.screenshot({ path: OUT + '/3-showdown-vitez.png' });
  ok(await p.evaluate(() => document.querySelectorAll('#felt .win').length >= 1), 'winner highlighted at table');
  // výhra foldem → Ukázat / Zahodit (hráč tlačí all-in, dokud všichni nesloží)
  let fw = false;
  for (let k = 0; k < 25 && !fw; k++) {
    await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
    const r = await waitTurn(); if (r !== 'turn') { fw = await p.evaluate(() => !!__poker.G.foldWin); continue; }
    await p.evaluate(() => __poker.heroAct('allin'));
    t0 = Date.now(); while (!(await p.evaluate(() => __poker.G.over)) && Date.now() - t0 < 20000) await W(80);
    fw = await p.evaluate(() => !!__poker.G.foldWin && __poker.G.showPick == null);
  }
  ok(fw, 'fold-win reached');
  if (fw) {
    await W(500); ok(await p.evaluate(() => document.querySelectorAll('[data-show]').length === 4), 'show / 1st / 2nd / muck buttons');
    await p.screenshot({ path: OUT + '/4-ukazat-zahodit.png' });
    await p.click('[data-show="1"]'); await W(1500);
    ok(await p.evaluate(() => document.querySelectorAll('#meShow .card').length === 2 && document.querySelectorAll('#meShow .card.back').length === 1), 'shows only first card');
    await p.evaluate(() => { document.getElementById('scrim').click(); }); await W(300);
    // žeton Ukázat
    const tok0 = await p.evaluate(() => __poker.wallet.showTok);
    ok(tok0 === 3, 'starter tokens = 3');
    ok(await p.evaluate(() => !!document.getElementById('peekBtn')), 'peek button with token count');
    await p.click('#peekBtn'); await W(700);
    ok(await p.evaluate(() => __poker.wallet.showTok) === tok0 - 1 && await p.evaluate(() => [...document.querySelectorAll('#opps .opp.peek .mini.open .card')].some(c => !c.classList.contains('back'))), 'token spent, folded cards revealed');
    await p.screenshot({ path: OUT + '/5-zeton-ukazat.png' });
  }
  // výběr avatara
  await p.evaluate(() => { document.getElementById('scrim').click(); RRAvatars(); }); await W(400);
  await p.screenshot({ path: OUT + '/6-vyber-avatara.png' });
  ok(await p.evaluate(() => document.querySelectorAll('#sheet .av-it').length) === 21, '21 avatars in picker');
  await p.evaluate(() => document.querySelector('#sheet [data-av="cat"]').click()); await W(200);
  ok(await p.evaluate(() => __poker.wallet.equip.avatar === 'cat'), 'free avatar equips');
  await p.evaluate(() => { __poker.wallet.diamonds = 20; document.querySelector('#sheet [data-av="robot"]').click(); }); await W(200);
  await p.evaluate(() => document.getElementById('avYes').click()); await W(200);
  ok(await p.evaluate(() => __poker.wallet.equip.avatar === 'robot' && __poker.wallet.diamonds === 13), 'epic avatar bought for 7 💎');
  await p.evaluate(() => document.querySelector('#sheet [data-av="wizard"]').click()); await W(200);
  ok(await p.evaluate(() => __poker.wallet.equip.avatar === 'robot'), 'exclusive cannot be bought');
  // obchod: žetony
  await p.evaluate(() => { document.getElementById('scrim').click(); __poker.nav.go('shop'); }); await W(300);
  const t1 = await p.evaluate(() => __poker.wallet.showTok); await p.click('#shTokD'); await W(100);
  ok(await p.evaluate(() => __poker.wallet.showTok) === t1 + 3, 'buy 3 tokens for 1 💎');
  await p.screenshot({ path: OUT + '/7-obchod-zetony.png', fullPage: false });
  // 375px, 9 hráčů
  const q = await mk(375, 667, { opps: 8 });
  await q.evaluate(() => { __poker.nav.go('game'); if (!__poker.G.players.length || __poker.G.over) __poker.startHand(); }); await W(2500);
  const l2 = await q.evaluate(() => ({ over: [...document.querySelectorAll('#opps .opp')].some(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }), docW: document.documentElement.scrollWidth }));
  ok(!l2.over && l2.docW <= 375, '9 players fit 375px');
  await q.screenshot({ path: OUT + '/8-375-9hracu.png' });
  // online ukázkový stůl
  const o = await mk(390, 844, { level: 0 });
  await o.click('#homePublic'); await W(200); await o.fill('#pubName', 'Matyáš'); await o.click('[data-sit="micro"]'); await W(1500);
  ok(await o.evaluate(() => __nav.cur === 'ontable' && document.querySelectorAll('#otFelt .av-svg').length >= 3), 'online table with avatars');
  await o.screenshot({ path: OUT + '/9-online-stul.png' });
  console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : '\nV28 OK');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
