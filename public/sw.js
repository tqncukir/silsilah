// Service worker: simpan kerangka aplikasi agar tetap terbuka saat sinyal putus.
// Setiap ganti CSS/JS: naikkan VERSI di sini DAN angka ?v= di semua halaman HTML.
const VERSI = 'silsilah-v121';
const INTI = ['/', '/index.html', '/css/tokens.css?v=121', '/css/app.css?v=121', '/js/app.js?v=121', '/js/supa.js?v=121', '/masuk.html', '/js/masuk.js?v=121', '/manifest.webmanifest',
  '/fonts/plus-jakarta-sans.woff2', '/icons/logo-96.png', '/icons/icon-192-v2.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSI).then((c) => c.addAll(INTI.map((u) => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== VERSI).map((n) => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; // data API tidak di-cache
  if (r.mode === 'navigate') {
    // Halaman: coba jaringan dulu; bila sinyal lemah (tidak menjawab 2 detik) atau putus, pakai simpanan.
    // Jaringan tetap ditunggu di belakang layar untuk memperbarui simpanan (Kang 2026-11-28, aplikasi lambat).
    const jaringan = fetch(r).then((res) => {
      if (res.ok) { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(r, salin)); } // salin sebelum isi dibaca
      return res;
    });
    e.waitUntil(jaringan.catch(() => {}));
    e.respondWith(caches.match(r, { ignoreSearch: true }).then((m) => {
      if (!m) return jaringan.catch(() => caches.match('/'));
      return Promise.race([jaringan.catch(() => m), new Promise((ok) => setTimeout(() => ok(m), 2000))]);
    }));
    return;
  }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
    if (res.ok) { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(r, salin)); }
    return res;
  })));
});
