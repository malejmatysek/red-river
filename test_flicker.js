/* Kontrola blikání: měří přechod mezi rukama v reálné rychlosti (bez __FAST).
   - kolik .card prvků se odstraní/znovu vytvoří (DOM churn)
   - posuny rozložení klíčových bloků (board, šance, akce, hráč) po snímcích
   - kolikrát se karta znovu „rozjede“ CSS animací deal (replay)
   Použití: node test_flicker.js [cesta k projektu] [výstupní složka snímků] */
const { chromium } = require(process.env.PW || 'playwright-core'); const fs = require('fs');
const dir = process.argv[2] || __dirname, shotDir = process.argv[3] || '';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__NOSPLASH = true; localStorage.setItem('pt_onboarded', '1');
    localStorage.setItem('pt_settings', JSON.stringify({ recs: true, odds: true, learn: true, opps: 5, shortStacks: false, v: 2, speed: 1, sound: false, vibrate: false })); });
  await p.goto('file://' + dir + '/index.html');
  await p.evaluate(() => { if (window.__nav) __nav.go('game'); if (!__G.handNo) __poker.startHand(); });
  const res = [];
  for (let t = 0; t < 3; t++) {
    // počkej, až je hráč na tahu, pak složí → konec ruky
    await p.waitForFunction(() => (__G.turn === 0 && !__G.dealing && __G.ctx) || __G.over, null, { timeout: 30000 });
    if (!(await p.evaluate(() => __G.over))) await p.evaluate(() => { __poker.heroAct(__G.ctx.toCall ? 'fold' : 'check'); if (__G.hold) __poker.coachGo(); });
    await p.waitForFunction(() => __G.over, null, { timeout: 60000 });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const s = document.getElementById('sheet'); if (s) s.hidden = true; const sc = document.getElementById('scrim'); if (sc) sc.hidden = true; });
    await p.waitForTimeout(150);
    // měření
    await p.evaluate(() => {
      const M = window.__M = { removed: 0, added: 0, replays: 0, frames: [], t0: performance.now() };
      M.obs = new MutationObserver(ms => ms.forEach(m => { m.removedNodes.forEach(n => { if (n.nodeType === 1 && (n.classList.contains('card') || n.querySelector && n.querySelector('.card'))) M.removed += n.classList.contains('card') ? 1 : n.querySelectorAll('.card').length; });
        m.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.classList.contains('card') || n.querySelector && n.querySelector('.card'))) M.added += n.classList.contains('card') ? 1 : n.querySelectorAll('.card').length; }); }));
      M.obs.observe(document.querySelector('.app') || document.body, { childList: true, subtree: true });
      document.addEventListener('animationstart', e => { if (e.animationName === 'deal') M.replays++; }, true);
      const sel = ['#board', '#odds', '#actions', '.hero', '#opps'];
      const tick = () => { if (!M.on) return; M.frames.push(sel.map(s => { const e = document.querySelector(s); if (!e) return [0, 0]; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; })); requestAnimationFrame(tick); };
      M.on = true; requestAnimationFrame(tick);
    });
    await p.evaluate(() => __poker.startHand());
    for (let f = 0; f < 8 && shotDir && t === 0; f++) { await p.waitForTimeout(170); await p.screenshot({ path: `${shotDir}/frame-${f}.png` }); }
    await p.waitForFunction(() => (__G.turn === 0 && !__G.dealing && __G.ctx) || __G.over, null, { timeout: 30000 });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => { const M = __M; M.on = false; M.obs.disconnect();
      let shifts = 0, maxShift = 0; for (let i = 1; i < M.frames.length; i++) M.frames[i].forEach((v, j) => { const d = Math.max(Math.abs(v[0] - M.frames[i - 1][j][0]), Math.abs(v[1] - M.frames[i - 1][j][1])); if (d > 1) { shifts++; maxShift = Math.max(maxShift, d); (M.who = M.who || []).push(['#board', '#odds', '#actions', '.hero', '#opps'][j] + ' ' + JSON.stringify(M.frames[i - 1][j]) + '→' + JSON.stringify(v)); } });
      return { cardNodesRemoved: M.removed, cardNodesAdded: M.added, dealReplays: M.replays, layoutShiftFrames: shifts, maxShiftPx: maxShift, frames: M.frames.length, who: M.who, ms: Math.round(performance.now() - M.t0) }; });
    res.push(r);
  }
  console.log(JSON.stringify({ transitions: res, errors }, null, 1));
  const worst = res.reduce((a, r) => ({ rem: Math.max(a.rem, r.cardNodesRemoved), sh: Math.max(a.sh, r.layoutShiftFrames), rep: Math.max(a.rep, r.dealReplays) }), { rem: 0, sh: 0, rep: 0 });
  const ok = !errors.length && worst.rem === 0 && worst.sh === 0 && worst.rep === 0;
  console.log(ok ? 'FLICKER OK' : 'FLICKER FAIL', JSON.stringify(worst));
  await b.close(); process.exit(ok ? 0 : 1);
})();
