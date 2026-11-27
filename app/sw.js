/* Job Tracker phone app: works offline from cache; the sheet itself is never cached. */
const CACHE = 'jt-app-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'vault.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/extract.js', 'lib/insights.js', 'lib/market.js', 'lib/i18n.js', 'lib/followup.js', 'lib/templates.js', 'lib/prompt.js', 'lib/fit.js', 'lib/chance.js', 'lib/llm.js', 'lib/learn.js', 'lib/outreach.js', 'lib/assist.js', 'lib/review.js', 'lib/tailor.js', 'lib/docx.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
// A new version takes over open windows at once and reloads them, even ones started by an older version
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(list => Promise.all(list.map(c => c.navigate(c.url).catch(() => null)))));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com$|(^|\.)groq\.com$|generativelanguage\.googleapis\.com$|openrouter\.ai$|overpass-api\.de$|overpass\.private\.coffee$|overpass\.kumi\.systems$|maps\.mail\.ru$|tile\.openstreetmap\.org$/.test(u.hostname)) return;
  // The page itself: network first, so a new version shows up on the next open
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('index.html', c)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // The app's own files: network first too (they are small), the cache only when offline
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  // Fonts: answer from cache at once, refresh it in the background
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: u.origin === location.origin });
    const net = fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
