// v1.6: úvod (5 slidů), trénink „nejdřív se rozhodni“ + zpětná vazba, Kombinace & pojmy, kvíz
const { chromium } = require(process.env.PW || 'playwright-core');
const OUT = process.env.SHOTS || '/tmp/v16';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  for (const lang of ['cs', 'en']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'cs' ? 'cs-CZ' : 'en-US' });
    page.on('pageerror', e => errors.push(lang + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to load resource|net::/i.test(m.text())) errors.push(lang + ': ' + m.text()); });
    await page.goto('file://' + __dirname + '/index.html');
    await page.waitForTimeout(400);
    // úvod
    for (let i = 0; i < 5; i++) {
      await page.screenshot({ path: `${OUT}/${lang}-ob${i + 1}.png` });
      const txt = await page.evaluate(() => document.querySelector('.ob-slide.on').innerText);
      if (/\b(ob|co|gd)\.\w+/.test(txt)) errors.push(lang + ' raw key on slide ' + (i + 1) + ': ' + txt.slice(0, 80));
      if (i < 4) await page.click('#obNext');
    }
    if (await page.isVisible('#obNext')) errors.push('obNext visible on last slide');
    await page.click('#obLevels [data-ol="0"]');
    await page.click('#obTrain');
    await page.waitForTimeout(500);
    const cur = await page.evaluate(() => __poker.nav.cur);
    if (cur !== 'game') errors.push(lang + ' obTrain → ' + cur);
    // trénink: počkej na tah hrdiny
    await page.evaluate(() => { window.__FAST = true; });
    let got = null;
    for (let k = 0; k < 60 && !got; k++) {
      await page.evaluate(() => { if (__G.over) __poker.startHand(); });
      for (let s = 0; s < 80; s++) { const t = await page.evaluate(() => __G.turn === 0 && !!__G.ctx && !__G.hold); if (t) { got = true; break; } await page.waitForTimeout(25); }
    }
    if (!got) { errors.push(lang + ' no hero turn'); continue; }
    const q = await page.evaluate(() => ({ coach: getComputedStyle(document.getElementById('coach')).visibility, rec: getComputedStyle(document.getElementById('rec')).display, hint: getComputedStyle(document.getElementById('hintBtn')).display, h: document.getElementById('cqH').innerText }));
    if (q.rec !== 'none' || q.hint === 'none' || !q.h) errors.push(lang + ' question state wrong ' + JSON.stringify(q));
    await page.screenshot({ path: `${OUT}/${lang}-q.png` });
    // nápověda za body
    const p0 = await page.evaluate(() => __poker.wallet.points);
    await page.click('#hintBtn');
    const p1 = await page.evaluate(() => __poker.wallet.points);
    if (p0 - p1 !== 5) errors.push(lang + ' hint cost ' + (p0 - p1));
    if (await page.evaluate(() => getComputedStyle(document.getElementById('rec')).display) === 'none') errors.push(lang + ' hint not shown');
    if (!(await page.$('#actions .btn.hint'))) errors.push(lang + ' hint button class missing');
    await page.screenshot({ path: `${OUT}/${lang}-hint.png` });
    // špatný tah: zvol akci, která není doporučená
    const wrong = await page.evaluate(() => { const r = __G.rec.action, c = __G.ctx; const opts = c.toCall ? ['fold', 'call', 'raise'] : ['check', 'bet']; return opts.find(a => a !== r && !(r === 'allin' && a === 'raise')) || opts[0]; });
    const st0 = await page.evaluate(() => JSON.parse(JSON.stringify(__poker.stats())).decisions);
    await page.evaluate(w => { const c = __G.ctx; __poker.heroAct(w, w === 'raise' || w === 'bet' ? c.minRaiseTo : undefined); }, wrong);
    await page.waitForTimeout(200);
    const fb = await page.evaluate(() => ({ hold: __G.hold, lvl: __G.coach && __G.coach.fb.level, title: document.getElementById('fbTitle').innerText, nums: document.getElementById('fbNums').innerText, btns: [...document.querySelectorAll('#actions .btn')].map(b => b.id) }));
    if (!fb.hold || !fb.title || !fb.nums) errors.push(lang + ' feedback missing ' + JSON.stringify(fb));
    await page.screenshot({ path: `${OUT}/${lang}-fb-${fb.lvl}.png` });
    if (fb.btns.includes('retryBtn')) {
      await page.click('#retryBtn');
      const r = await page.evaluate(() => ({ hold: __G.hold, turn: __G.turn, retry: __G.retry, dec: __poker.stats().decisions }));
      if (r.hold || r.turn !== 0 || !r.retry) errors.push(lang + ' retry failed ' + JSON.stringify(r));
      await page.evaluate(() => __poker.heroAct(__G.rec.action, __G.rec.to));
      const r2 = await page.evaluate(() => ({ dec: __poker.stats().decisions, lvl: __G.coach && __G.coach.fb.level, sub: document.getElementById('fbSub').innerText }));
      if (r2.dec !== st0 + 1) errors.push(lang + ' retry counted twice ' + JSON.stringify(r2));
      await page.screenshot({ path: `${OUT}/${lang}-fb-retry.png` });
    } else if (fb.btns.includes('whyBtn')) {
      await page.click('#whyBtn'); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${lang}-whynot.png` }); await page.evaluate(() => document.getElementById('scrim').click());
    }
    await page.click('#goBtn');
    if (await page.evaluate(() => __G.hold)) errors.push(lang + ' still held after go');
    // kombinace u stolu: dohraj do flopu
    let flop = false;
    for (let s = 0; s < 400 && !flop; s++) {
      const st = await page.evaluate(() => ({ over: __G.over, turn: __G.turn, hold: __G.hold, b: __G.board.length, folded: __G.players[0].folded }));
      if (st.b >= 3 && !st.folded && st.turn === 0 && !st.hold) { flop = true; break; }
      if (st.hold) await page.evaluate(() => __poker.coachGo());
      else if (st.over || st.folded) await page.evaluate(() => __poker.startHand());
      else if (st.turn === 0 && await page.evaluate(() => !!__G.ctx)) await page.evaluate(() => __poker.heroAct(__G.ctx.toCall ? 'call' : 'check'));
      else await page.waitForTimeout(20);
    }
    if (flop) {
      await page.click('#made [data-combo]');
      await page.waitForTimeout(200);
      const sh = await page.evaluate(() => document.getElementById('sheet').innerText);
      if (!/10/.test(sh)) errors.push(lang + ' combo sheet ' + sh.slice(0, 60));
      await page.screenshot({ path: `${OUT}/${lang}-combo.png` });
      await page.click('#cbOk');
    } else errors.push(lang + ' never reached flop');
    // tlačítko Kombinace → průvodce
    await page.click('#kombiBtn'); await page.waitForTimeout(400);
    if (await page.evaluate(() => __poker.nav.cur) !== 'guide') errors.push(lang + ' kombiBtn');
    await page.screenshot({ path: `${OUT}/${lang}-guide-ranks.png`, fullPage: false });
    await page.click('#gdSeg [data-gt="terms"]'); await page.waitForTimeout(100);
    const nTerms = await page.$$eval('#gdList .gli', x => x.length);
    if (nTerms !== 7) errors.push(lang + ' terms base ' + nTerms);
    await page.screenshot({ path: `${OUT}/${lang}-guide-terms.png` });
    await page.fill('#gdSearch', 'blind'); await page.waitForTimeout(100);
    const nS = await page.$$eval('#gdList .gli', x => x.length); if (!nS) errors.push(lang + ' search none');
    await page.click('#gdList .gli'); await page.waitForTimeout(150);
    const gx = await page.evaluate(() => !document.getElementById('gloss').hidden && !!document.querySelector('#gloss .gx'));
    if (!gx) errors.push(lang + ' gloss example missing');
    await page.screenshot({ path: `${OUT}/${lang}-gloss.png` });
    await page.click('#glOk');
    // kontrola: všechny pojmy mají příklad
    const noEx = await page.evaluate(() => I18N.GLOSS.filter(k => I18N.t('gl.' + k + '.x') === 'gl.' + k + '.x'));
    if (noEx.length) errors.push(lang + ' no example: ' + noEx.join(','));
    await page.click('#gdSeg [data-gt="quiz"]'); await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${lang}-quiz.png` });
    await page.click('[data-qz="0"]'); await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${lang}-quiz2.png` });
    // kvíz: kategorie sedí s vyhodnocením
    const bad = await page.evaluate(() => { let b = 0; for (let i = 0; i < 300; i++) { const q = __poker.quizDeal(); const [x, y] = q.hands.map(h => PE.evaluate(h.cards)); if ((x > y ? 0 : 1) !== q.win) b++; } return b; });
    if (bad) errors.push(lang + ' quiz wrong winner x' + bad);
    // Domů
    await page.evaluate(() => { __poker.nav.go('home'); }); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${lang}-home.png` });
    const homeBtns = await page.evaluate(() => ['homeGuide', 'drillBtn', 'homeStats'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left), Math.round(r.width)]; }));
    if (homeBtns[1][0] !== homeBtns[2][0]) errors.push(lang + ' drill/stats not side by side ' + JSON.stringify(homeBtns));
    await page.click('#homeGuide'); await page.waitForTimeout(300);
    if (await page.evaluate(() => __poker.nav.cur) !== 'guide') errors.push(lang + ' homeGuide');
    await page.close();
  }
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'V16 OK');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
