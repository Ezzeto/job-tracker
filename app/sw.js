/* Job Tracker phone app: works offline from cache; the sheet itself is never cached. */
const CACHE = 'jt-app-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'vault.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'lib/insights.js', 'lib/market.js', 'lib/i18n.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com$/.test(u.hostname)) return;
  // App files: answer from cache at once, refresh it in the background
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: u.origin === location.origin });
    const net = fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
