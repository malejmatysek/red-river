/* Service worker – offline cache. Při změně souborů zvyš VERSION.
   Nová verze se nainstaluje na pozadí (čerstvé soubory, ne z HTTP cache), převezme stránku
   a aplikace ukáže oznámení „Nová verze je připravená – Obnovit“. */
const VERSION = 'v16';
const CACHE = 'poker-trener-' + VERSION;
const FILES = [
  './', './index.html', './style.css', './i18n.js', './engine.js', './app.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/lumi.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './online/config.js', './online/core.js', './online/net.js', './online/ui.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return c.put(f, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('poker-trener-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// cache-first, na pozadí aktualizuje; navigace bez sítě → index.html
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    return hit || net;
  }));
});
