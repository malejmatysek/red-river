/* Ověření PWA: servíruje projekt pod podcestou /poker-trainer/, zkontroluje manifest, SW a offline načtení. */
const { chromium } = require(process.env.PW || 'playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, BASE = '/poker-trainer/', PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith(BASE)) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, u.slice(BASE.length) || 'index.html');
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const url = `http://localhost:${PORT}${BASE}`;
  const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pwa-'));   // ne-anonymní profil kvůli kontrole instalovatelnosti
  const ctx = await chromium.launchPersistentContext(prof, { executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const browser = ctx;
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const out = {};
  await page.goto(url);
  // manifest
  const cdp = await ctx.newCDPSession(page);
  const m = await cdp.send('Page.getAppManifest');
  out.manifestErrors = m.errors;
  const man = JSON.parse(m.data || '{}');
  out.manifest = { name: man.name, short_name: man.short_name, display: man.display, start_url: man.start_url, scope: man.scope, theme: man.theme_color, bg: man.background_color, icons: (man.icons || []).map(i => `${i.sizes} ${i.purpose}`) };
  for (const i of man.icons || []) { const r = await page.request.get(new URL(i.src, m.url).href); if (!r.ok()) errors.push('icon ' + i.src + ' ' + r.status()); }
  try { const inst = await cdp.send('Page.getInstallabilityErrors'); out.installabilityErrors = inst.installabilityErrors; } catch (e) { out.installabilityErrors = 'n/a: ' + e.message; }
  // SW
  out.swScope = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.scope; });
  await page.reload(); // stránka teď pod kontrolou SW
  out.controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  out.caches = await page.evaluate(async () => { const ks = await caches.keys(); const r = {}; for (const k of ks) r[k] = (await (await caches.open(k)).keys()).length; return r; });
  // offline
  server.close();
  await ctx.setOffline(true);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  out.offline = await page.evaluate(() => ({ title: document.title, cards: document.querySelectorAll('#heroCards .card').length, engine: typeof PE, buttons: document.querySelectorAll('#actions button,#actions .waiting').length }));
  await page.screenshot({ path: path.join(ROOT, 'screenshots/05-offline-pwa.png') });
  // offline i přímo index.html
  const r2 = await page.goto(url + 'index.html'); out.offlineIndex = r2 && r2.status();
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  const ok = !m.errors.length && Array.isArray(out.installabilityErrors) && !out.installabilityErrors.length && out.controlled && out.offline.cards === 2 && out.offline.engine === 'object' && !errors.length;
  console.log(ok ? 'PWA OK' : 'PWA FAIL'); process.exit(ok ? 0 : 1);
})();
