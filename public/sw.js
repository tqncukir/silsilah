// Service worker: simpan kerangka aplikasi agar tetap terbuka saat sinyal putus.
const VERSI = 'silsilah-v3';
const INTI = ['/', '/index.html', '/css/tokens.css', '/css/app.css', '/js/app.js', '/js/supa.js', '/masuk.html', '/js/masuk.js', '/manifest.webmanifest',
  '/icons/logo-96.png', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSI).then((c) => c.addAll(INTI))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSI).map((n) => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // data API tidak di-cache
  if (r.mode === 'navigate') { // halaman: coba jaringan dulu, kalau putus pakai simpanan
    e.respondWith(fetch(r).then((res) => { caches.open(VERSI).then((c) => c.put(r, res.clone())); return res; })
      .catch(() => caches.match(r).then((m) => m || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
    if (res.ok) { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(r, salin)); }
    return res;
  })));
});
