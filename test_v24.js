// v1.9: swipe-to-dismiss sheetů (touch), VÝHRA/Prohra overlay, showdown pruh mizí s novou rukou, zamčené ligy v barvách
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || '/tmp/v24'; require('fs').mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [], ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errors.push(m); };
  for (const lang of ['cs', 'en']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(l => { window.__NOSPLASH = true; window.__RR_MOCK = true; localStorage.setItem('pt_onboarded', '1'); localStorage.setItem('pt_settings', JSON.stringify({ v: 4, lang: l, level: 1 })); }, lang);
  await p.goto('file://' + __dirname + '/index.html'); await W(500);
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x, y0, y1, ms) => {
    const steps = 12; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] }); await W(ms / steps); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await W(400);
  };
  const open = () => p.evaluate(() => !document.getElementById('sheet').hidden);
  // ligy: zamčené v barvách
  await p.evaluate(() => document.getElementById('homeLeague').click()); await W(400);
  ok(await open(), lang + ' leagues sheet open');
  ok(await p.evaluate(() => { const l = document.querySelectorAll('.lg-item.lock'); return l.length === 6 && [...l].every(x => x.querySelector('.lg-lk') && getComputedStyle(x.querySelector('.lg-ic')).filter === 'none'); }), lang + ' locked leagues full color + lock');
  if (lang === 'cs') await p.screenshot({ path: OUT + '/ligy-zamcene.png' });
  // 1) malý tah za úchyt → vrátí se
  let top = await p.evaluate(() => document.getElementById('sheet').getBoundingClientRect().top);
  await swipe(195, top + 12, top + 60, 400);
  ok(await open() && await p.evaluate(() => !document.getElementById('sheet').style.transform), lang + ' short drag snaps back');
  // 2) tah za úchyt → zavře
  await swipe(195, top + 12, top + 300, 300);
  ok(!(await open()), lang + ' handle swipe closes');
  // 3) obsah odrolovaný dolů → tah dolů roluje, nezavře
  await p.evaluate(() => document.getElementById('homeLeague').click()); await W(400);
  await p.evaluate(() => { document.getElementById('sheet').scrollTop = 300; }); await W(100);
  await swipe(195, 600, 760, 300);
  ok(await open(), lang + ' content swipe while scrolled does not close');
  // 4) obsah nahoře → rychlý flick zavře
  await p.evaluate(() => { document.getElementById('sheet').scrollTop = 0; }); await W(100);
  await swipe(195, 560, 760, 150);
  ok(!(await open()), lang + ' content flick at top closes');
  // 5) backdrop tap stále funguje
  await p.evaluate(() => document.getElementById('homeLeague').click()); await W(400);
  await p.touchscreen.tap(195, 40); await W(300);
  ok(!(await open()), lang + ' backdrop tap closes');
  // glosář sheet
  await p.evaluate(() => __poker.openGloss('pot')); await W(300);
  top = await p.evaluate(() => document.getElementById('gloss').getBoundingClientRect().top);
  await swipe(195, top + 12, top + 300, 250);
  ok(await p.evaluate(() => document.getElementById('gloss').hidden), lang + ' gloss swipe closes');
  // overlay výsledku ruky
  await p.evaluate(() => RRResult.show('win', 1240)); await W(500);
  ok(await p.isVisible('#hrFx'), lang + ' win overlay');
  await p.screenshot({ path: OUT + `/${lang}-vyhra.png` });
  await W(2000); ok(!(await p.isVisible('#hrFx')), lang + ' win overlay auto-dismissed');
  await p.evaluate(() => RRResult.show('lose', 300)); await W(500);
  await p.screenshot({ path: OUT + `/${lang}-prohra.png` });
  await p.touchscreen.tap(195, 400); await W(400); ok(!(await p.isVisible('#hrFx')), lang + ' tap dismisses');
  await p.evaluate(() => RRResult.show('fold')); await W(350);
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('hrFx')).pointerEvents === 'none'), lang + ' fold pill does not block');
  await W(1400); ok(!(await p.isVisible('#hrFx')), lang + ' fold pill gone');
  // showdown pruh: zmizí s novou rukou
  if (lang === 'cs') {
    await p.evaluate(() => { __poker.nav.go('game'); }); await W(800);
    await p.evaluate(() => { window.__FAST = true; });
    let seen = false, stuck = false;
    for (let k = 0; k < 3000 && !(seen && stuck === false && k > 400); k++) {
      const st = await p.evaluate(() => ({ over: __poker.G.over, turn: __poker.G.turn, d: __poker.G.dealing, ctx: !!__poker.G.ctx, sd: !document.getElementById('sdStrip').hidden && getComputedStyle(document.getElementById('sdStrip')).display !== 'none' }));
      if (st.sd && st.over) seen = true;
      if (st.sd && !st.over) stuck = true;
      if (st.over) { if (st.sd) await p.evaluate(() => __poker.startHand()); else await p.evaluate(() => __poker.startHand()); }
      else if (await p.evaluate(() => !!__poker.G.coach)) await p.evaluate(() => __poker.coachGo());
      else if (st.turn === 0 && !st.d && st.ctx) await p.evaluate(() => __poker.heroAct(__poker.G.ctx.toCall ? 'call' : 'check'));
      else await W(5);
      if (seen && k > 300) break;
    }
    ok(seen && !stuck, 'showdown strip shown at hand end and hidden on next hand');
    await p.evaluate(() => { window.__FAST = false; });
  }
  await ctx.close();
  }
  console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : '\nV24 OK');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
