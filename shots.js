/* Snímky skutečné aplikace (ne návrhu): node shots.js  → screenshots/app-*.png */
const { chromium } = require(process.env.PW || 'playwright-core');
const path = require('path'), DIR = path.join(__dirname, 'screenshots'), URL = 'file://' + path.join(__dirname, 'index.html');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  const newCtx = () => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'cs-CZ' });
  const shot = (p, n) => p.screenshot({ path: path.join(DIR, `app-${n}.png`) });
  const W = (p, ms) => p.waitForTimeout(ms);
  // 1) úvodní logo + úvod (5 kroků, poslední = výběr úrovně)
  const ctx0 = await newCtx();
  let p = await ctx0.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await W(p, 380); await shot(p, '01-splash-otocka');
  await W(p, 800); await shot(p, '01b-splash');
  await W(p, 900); await shot(p, '02-uvod-1');
  for (const n of [2, 3, 4, 5]) { await p.click('#obNext'); await W(p, 450); await shot(p, `02-uvod-${n}`); }
  await ctx0.close();
  // 2) hlavní průchod (začátečník, čeština)
  const ctx = await newCtx();
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; if (!localStorage.getItem('pt_onboarded')) { localStorage.setItem('pt_onboarded', '1');
    localStorage.setItem('pt_settings', JSON.stringify({ sound: false, vibrate: false, lang: 'cs', opps: 5, level: 0 }));
    localStorage.setItem('pt_wallet', JSON.stringify({ points: 3000, lastDaily: '', lessons: {} })); } });
  await p.goto(URL); await W(p, 400);
  // 40 rukou kvůli statistikám (styl hráče se ukáže od 30)
  await p.evaluate(() => { window.__FAST = true; });
  for (let i = 0; i < 40; i++) {
    await p.evaluate(() => __poker.startHand());
    for (let k = 0; k < 400; k++) {
      const st = await p.evaluate(() => { if (__G.over) return 1; if (__G.turn === 0 && __G.rec) { const r = __G.rec.action, c = __G.ctx.toCall, x = Math.random();
        __poker.heroAct(x < 0.7 ? (r === 'allin' && c ? 'call' : r) : x < 0.85 ? (c ? 'call' : 'check') : (c ? 'fold' : 'check'), __G.rec.to); } return 0; });
      if (st) break; await W(p, 5);
    }
  }
  await W(p, 200);
  await p.reload(); await W(p, 500); await shot(p, '03-domu');
  await p.click('#playBtn'); await W(p, 900); await shot(p, '04-hra-rozdavani');
  // doporučení: počkej na tah s preflop doporučením (karty + pozice slovy)
  for (let tries = 0; tries < 12; tries++) {
    await p.waitForFunction(() => (__G.turn === 0 && !__G.dealing && __G.rec) || __G.over, null, { timeout: 60000 });
    const ok = await p.evaluate(() => !__G.over && __G.street === 0 && /cc|hand/.test(document.getElementById('recWhy').innerHTML));
    if (ok) break;
    await p.evaluate(() => { if (!__G.over) __poker.heroAct(__G.ctx.toCall ? 'fold' : 'check'); });
    await p.waitForFunction(() => __G.over || (__G.turn === 0 && !__G.dealing), null, { timeout: 60000 });
    if (await p.evaluate(() => __G.over)) { await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); }); }
  }
  await W(p, 600); await shot(p, '04b-hra-doporuceni');
  // zpětná vazba: zahraj jinak, než radí doporučení
  await p.evaluate(() => { const r = __G.rec.action, c = __G.ctx.toCall; __poker.heroAct(r === 'fold' ? 'call' : c ? 'fold' : 'check'); });
  await W(p, 900); await p.evaluate(() => { document.getElementById('scrim').click(); }); await W(p, 200);
  await shot(p, '04c-hra-hodnoceni');
  // slovníček: klepnutí na podtržené slovo ve zpětné vazbě
  await p.evaluate(() => { const g = document.querySelector('#fbTxt .gl') || document.querySelector('#recWhy .gl'); if (g) g.click(); else __poker.openGloss('fold'); });
  await W(p, 450); await shot(p, '04d-slovnicek');
  await p.evaluate(() => document.getElementById('glOk').click());
  await p.evaluate(() => { document.getElementById('scrim').click(); __nav.go('stats'); }); await W(p, 500); await shot(p, '06-statistiky');
  await p.evaluate(() => document.querySelector('#scr-stats').scrollTo(0, 700)); await W(p, 250); await shot(p, '06b-statistiky-grafy');
  await p.evaluate(() => document.querySelector('[data-sx="vpip"]').click()); await W(p, 400); await shot(p, '06c-statistiky-vysvetleni');
  await p.evaluate(() => { document.getElementById('scrim').click(); __nav.go('shop'); }); await W(p, 500); await shot(p, '10-obchod');
  await p.evaluate(() => document.querySelector('#scr-shop').scrollTo(0, 9999)); await W(p, 250); await shot(p, '10b-obchod-balicky');
  await p.evaluate(() => document.querySelector('#scr-stats') && 0);
  // v1.3: kolo štěstí (skutečná animace), úspěchy, vzhled, nápověda
  await p.evaluate(() => { window.__FAST = false; __nav.go('home'); }); await W(p, 400);
  await p.evaluate(() => __nav.go('wheel')); await W(p, 500); await shot(p, '12-kolo-stesti');
  await p.click('#whSpin'); await W(p, 1300); await shot(p, '12b-kolo-toceni');
  await p.waitForFunction(() => !document.getElementById('whSpin').textContent.includes('…') && document.getElementById('whCd'), null, { timeout: 15000 }); await W(p, 700); await shot(p, '12c-kolo-vysledek');
  await p.evaluate(() => { window.__FAST = true; __nav.go('ach'); }); await W(p, 500); await shot(p, '13-uspechy');
  await p.evaluate(() => document.querySelector('#scr-ach').scrollTo(0, 520)); await W(p, 250); await shot(p, '13b-uspechy-seznam');
  await p.evaluate(() => { __poker.wallet.diamonds += 16; __nav.go('shop'); }); await W(p, 400);
  await p.evaluate(() => [...document.querySelectorAll('[data-tab]')].find(b => b.dataset.tab === 'look').click()); await W(p, 300); await shot(p, '14-obchod-vzhled');
  await p.evaluate(() => document.querySelector('[data-lk="felt:bordeaux"]').click()); await W(p, 400); await shot(p, '14b-vzhled-koupit');
  await p.evaluate(() => { document.getElementById('lkYes').click(); __poker.buyLook('back', 'noir'); __poker.buyLook('lumi', 'crown'); }); await W(p, 300);
  await p.evaluate(() => { document.querySelector('#scr-shop').scrollTo(0, 0); }); await W(p, 200); await shot(p, '14c-vzhled-koupeno');
  await p.evaluate(() => { __nav.go('game'); if (__G.over) __poker.startHand(); });
  for (let k = 0; k < 20; k++) {
    await p.waitForFunction(() => (__G.turn === 0 && !__G.dealing && __G.rec) || __G.over, null, { timeout: 60000 });
    if (!(await p.evaluate(() => __G.over))) break;
    await p.evaluate(() => { document.getElementById('scrim').click(); __poker.startHand(); });
  }
  await W(p, 600); await shot(p, '14d-hra-vzhled');
  await p.click('#gameHelp'); await W(p, 350); await shot(p, '15-napoveda-stul');
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-hv]')].find(x => /D =/.test(x.textContent)); if (b) b.click(); }); await W(p, 250); await shot(p, '15b-napoveda-dealer');
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-hv]')].find(x => /Tvoje místo/.test(x.textContent)); if (b) b.click(); }); await W(p, 250); await shot(p, '15c-napoveda-pozice');
  await p.click('#hvRanks'); await W(p, 400); await shot(p, '15d-poradi-kombinaci');
  await p.evaluate(() => { document.getElementById('scrim').click(); ['back', 'felt', 'lumi'].forEach((k, i) => __poker.buyLook(k, ['red', 'black', 'classic'][i])); __nav.go('stats'); }); await W(p, 400);
  await p.evaluate(() => document.querySelector('#scr-stats').scrollTo(0, 1350)); await W(p, 250); await shot(p, '06d-statistiky-dva-grafy');
  await p.evaluate(() => __poker.openScreenHelp('stats')); await W(p, 350); await shot(p, '15e-napoveda-statistiky');
  await p.evaluate(() => { document.getElementById('scrim').click(); __nav.go('game'); const w = __poker.wallet, keep = [w.points, w.diamonds]; w.points = 100; w.wheelDay = ''; __poker.needPoints(1000); window.__keep = keep; }); await W(p, 400); await shot(p, '16-malo-bodu');
  await p.evaluate(() => { document.getElementById('scrim').click(); const w = __poker.wallet; [w.points, w.diamonds] = window.__keep; w.wheelDay = __poker.today(); }); await W(p, 200);
  await p.evaluate(() => __nav.go('settings')); await W(p, 500); await shot(p, '05-nastaveni');
  await p.evaluate(() => __nav.go('drill')); await W(p, 500);
  await p.evaluate(() => [...document.querySelectorAll('#drActions button')].find(b => !b.disabled).click()); await W(p, 500); await shot(p, '07-trenink-situaci');
  await p.evaluate(() => __nav.go('learn')); await W(p, 400);
  await p.evaluate(() => document.getElementById('glossary').scrollIntoView()); await W(p, 300); await shot(p, '08-uceni-slovnicek');
  // expert: žádná nápověda, zkratky
  await p.evaluate(() => { __poker.applyLevel(2); __poker.setLang('cs'); __nav.go('game'); });
  await p.evaluate(() => { if (__G.over) __poker.startHand(); });
  await p.waitForFunction(() => __G.turn === 0 && !__G.dealing && __G.ctx, null, { timeout: 60000 }); await W(p, 500); await shot(p, '11-hra-expert');
  // angličtina, začátečník
  await p.evaluate(() => { __poker.applyLevel(0); __poker.setLang('en'); __G.over = true; __poker.startHand(); });
  await p.waitForFunction(() => __G.turn === 0 && !__G.dealing && __G.rec, null, { timeout: 60000 }); await W(p, 600); await shot(p, '09b-game-en');
  await p.evaluate(() => __nav.go('stats')); await W(p, 500); await shot(p, '09c-stats-en');
  await b.close();
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'shots OK');
})();
