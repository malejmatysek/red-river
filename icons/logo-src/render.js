const { chromium } = require(process.env.PW); const fs = require('fs'); const d = '/workspace/poker-trainer/icons/';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
for (const n of ['A', 'B', 'C']) { await p.setContent(`<body style="margin:0">${fs.readFileSync(d + 'logo-src/logo-' + n + '.svg', 'utf8')}</body>`); await p.screenshot({ path: d + 'logo-' + n + '.png' }); }
const img = n => `<div style="text-align:center"><img src="data:image/png;base64,${fs.readFileSync(d + 'logo-' + n + '.png').toString('base64')}" style="width:300px;height:300px;border-radius:66px;display:block"><div style="color:#ccc;font:600 26px Helvetica,Arial;margin-top:16px">${n}</div></div>`;
const p2 = await b.newPage({ viewport: { width: 1080, height: 420 } });
await p2.setContent(`<body style="margin:0;background:#1c1b21;display:flex;gap:45px;justify-content:center;align-items:center;height:420px">${img('A')}${img('B')}${img('C')}</body>`);
await p2.screenshot({ path: d + 'logo-varianty.png' }); await b.close(); })();
