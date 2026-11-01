// Vykreslí návrhové obrazovky (390×844 @2x) do screenshots/navrh-*.png a přehled
const { chromium } = require(process.env.PW || 'playwright-core'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'), out = root + '/screenshots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const shots = [['splash', '01-splash'], ['ob1', '02-uvod-1'], ['ob2', '03-uvod-2-sance'], ['ob3', '04-uvod-3-doporuceni'], ['ob4', '05-uvod-4-hodnoceni'], ['home', '06-domu'], ['settings', '07-nastaveni']];
  for (const [id, name] of shots) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.goto('file://' + __dirname + '/navrh.html#' + id); await p.waitForTimeout(900);
    await p.screenshot({ path: out + 'navrh-' + name + '.png' }); await p.close();
  }
  // celé nastavení (dlouhá stránka)
  { const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await p.goto('file://' + __dirname + '/navrh.html?long#settings'); await p.waitForTimeout(300);
    await p.screenshot({ path: out + 'navrh-07b-nastaveni-cele.png', fullPage: true }); await p.close(); }
  // hrací obrazovka: skutečná aplikace, čistší lišta, zamrazený okamžik rozdávání
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.addInitScript(() => { window.__FAST = true; window.__DEEP = true; localStorage.setItem('pt_settings', JSON.stringify({ recs: true, odds: true, learn: true, opps: 5, shortStacks: true, v: 2 })); });
  await p.goto('file://' + root + '/index.html');
  for (let i = 0; i < 100; i++) { const ok = await p.evaluate(() => __G.turn === 0 && __G.street === 0 && __G.rec.action !== 'fold'); if (ok) break; await p.evaluate(() => __poker.startHand()); await p.waitForTimeout(30); }
  await p.evaluate(() => {
    const top = document.querySelector('.top');
    top.querySelector('.brand').outerHTML = '<button class="icon-btn" style="font-size:22px;margin-right:auto" aria-label="Zpět">‹</button>';
    document.getElementById('statsBtn').remove();
    const st = document.createElement('style'); st.textContent = `
      .hero-cards .card:nth-child(2){transform:translate(34px,-46px) rotate(9deg) scale(.96);opacity:.9;box-shadow:0 14px 30px rgba(0,0,0,.6)}
      #rec,#feedback{visibility:hidden}
      #eqWin,#made{opacity:.35}
      .dealtag{position:absolute;left:50%;top:296px;transform:translateX(-50%);background:var(--panel2);border-radius:999px;padding:6px 12px;font-size:12px;color:#cfcfd6;z-index:5}`;
    document.head.appendChild(st);
    document.getElementById('street').textContent = 'Ruka #43 · rozdává se…';
    document.getElementById('actions').innerHTML = '<div class="waiting">&nbsp;</div>';
  });
  await p.waitForTimeout(300); await p.screenshot({ path: out + 'navrh-08-hra-rozdani.png' });
  await p.evaluate(() => { document.querySelectorAll('style')[document.querySelectorAll('style').length - 1].remove(); __poker.startHand(); });
  for (let i = 0; i < 100; i++) { const ok = await p.evaluate(() => __G.turn === 0 && __G.street === 0 && __G.rec.action !== 'fold'); if (ok) break; await p.evaluate(() => __poker.startHand()); await p.waitForTimeout(30); }
  await p.waitForTimeout(300); await p.screenshot({ path: out + 'navrh-09-hra.png' });
  await p.close();
  // přehled
  const files = ['01-splash', '02-uvod-1', '03-uvod-2-sance', '04-uvod-3-doporuceni', '05-uvod-4-hodnoceni', '06-domu', '07-nastaveni', '08-hra-rozdani', '09-hra'];
  const labels = ['Splash', 'Úvod 1/4', 'Úvod 2/4 – šance', 'Úvod 3/4 – doporučení', 'Úvod 4/4 – hodnocení', 'Domů', 'Nastavení', 'Hra – rozdání', 'Hra'];
  const img = (f, i) => `<figure><img src="data:image/png;base64,${fs.readFileSync(out + 'navrh-' + f + '.png').toString('base64')}"><figcaption>${i + 1}. ${labels[i]}</figcaption></figure>`;
  const o = await b.newPage({ viewport: { width: 1900, height: 1420 } });
  await o.setContent(`<style>body{margin:0;background:#1c1b21;font:600 20px -apple-system,Helvetica,Arial;color:#ddd;padding:30px 36px}h1{margin:0 0 18px;font-size:30px;color:#fff}
    .g{display:grid;grid-template-columns:repeat(5,1fr);gap:22px 28px}figure{margin:0}img{width:100%;border-radius:34px;border:2px solid #333;display:block}figcaption{margin-top:8px;text-align:center}</style>
    <h1>Red River – návrh úvodu a obrazovek</h1><div class="g">${files.map(img).join('')}</div>`);
  await o.waitForTimeout(300); await o.screenshot({ path: out + 'navrh-prehled.png', fullPage: true });
  await b.close();
})();
