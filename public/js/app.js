// Daftar service worker + tombol "Pasang di layar HP"
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
const tombol = document.getElementById('pasang');
let ajakan = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ajakan = e; tombol.hidden = false; });
tombol.addEventListener('click', async () => {
  if (!ajakan) return;
  ajakan.prompt();
  await ajakan.userChoice;
  ajakan = null; tombol.hidden = true;
});
addEventListener('appinstalled', () => kabar('Alhamdulillah, SILSILAH sudah terpasang di HP.'));
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
const terpasang = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (ios && !terpasang) document.getElementById('panduan-ios').hidden = false;
addEventListener('offline', () => kabar('Sinyal terputus. Halaman tetap bisa dibuka.'));
function kabar(t) { const s = document.getElementById('status'); s.textContent = t; s.classList.add('tampil'); setTimeout(() => s.classList.remove('tampil'), 4000); }
// Tanggal hari ini: Masehi · Hijriah (perkiraan Ummul Qura), di bagian pembuka.
const tglDepan = document.getElementById('depan-tgl');
if (tglDepan && typeof teksHijriah === 'function') {
  const hari = hariIniWib();
  // "1448 H" tidak boleh terpisah baris
  tglDepan.textContent = `${tglWib(isoWib(hari, '12:00'))} · ${teksHijriah(hari).replace(/ (\d+) H$/, '\u00a0$1\u00a0H')}`; tglDepan.hidden = false;
}
// Agenda terdekat di halaman depan (publik, tanpa login)
const agenda = document.getElementById('agenda');
if (agenda && typeof gambarAgenda === 'function') gambarAgenda(agenda, 3, 'Belum ada agenda kegiatan yang akan datang.');
// Berita terbaru di halaman depan (publik); bagian disembunyikan bila belum ada berita.
const beritaDepan = document.getElementById('berita');
if (beritaDepan && typeof gambarBerita === 'function') gambarBerita(beritaDepan, 3).then((n) => { document.getElementById('berita-depan').hidden = n <= 0; });
