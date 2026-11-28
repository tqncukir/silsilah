// Service worker: simpan kerangka aplikasi agar tetap terbuka saat sinyal putus.
// Setiap ganti CSS/JS: naikkan VERSI di sini DAN angka ?v= di semua halaman HTML.
const VERSI = 'silsilah-v157';
const INTI = ['/', '/index.html', '/css/tokens.css?v=157', '/css/app.css?v=157', '/js/app.js?v=157', '/js/supa.js?v=157', '/masuk.html', '/js/masuk.js?v=157', '/manifest.webmanifest',
  '/fonts/plus-jakarta-sans.woff2', '/img/motif.svg', '/icons/logo-96.png', '/icons/icon-192-v2.png'];
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
// Notifikasi ke HP (Tahap 16): isi dari Edge Function notif → {judul, isi, url, tag}.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { isi: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(String(d.judul || 'SILSILAH').slice(0, 80), {
    body: String(d.isi || '').slice(0, 400), icon: '/icons/icon-192-v2.png', lang: 'id',
    tag: d.tag || 'silsilah', renotify: true, data: { url: d.url },
  }));
});
// Ketuk notifikasi: buka halaman terkait (hanya alamat di dalam SILSILAH sendiri).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const u = e.notification.data?.url;
  const tuju = new URL(typeof u === 'string' && /^\/(?!\/)/.test(u) ? u : '/beranda.html', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((jendela) => {
    const w = jendela.find((x) => x.url.startsWith(self.location.origin));
    return w ? w.focus().then((f) => f.navigate(tuju)).catch(() => self.clients.openWindow(tuju)) : self.clients.openWindow(tuju);
  }));
});
