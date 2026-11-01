// Vykreslí sadu ikon z icon.svg / icon-maskable.svg (logo B)
const { chromium } = require(process.env.PW || 'playwright-core'); const fs = require('fs'); const d = __dirname + '/../';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const jobs = [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['icon-maskable.svg', 'icon-maskable-512.png', 512], ['icon.svg', 'apple-touch-icon.png', 180], ['icon.svg', 'favicon-32.png', 32]];
  for (const [src, out, sz] of jobs) {
    const p = await b.newPage({ viewport: { width: sz, height: sz } });
    const svg = fs.readFileSync(d + src, 'utf8').replace('width="512" height="512">', `width="${sz}" height="${sz}">`);
    await p.setContent(`<body style="margin:0;background:#000">${svg}</body>`); await p.screenshot({ path: d + out }); await p.close();
  }
  await b.close(); })();
