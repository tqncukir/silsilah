// Halaman "Cara Pasang SILSILAH": pilih panduan Android/iPhone otomatis, tombol Pasang sekarang bila HP mendukung.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const $ = (id) => document.getElementById(id);
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const terpasang = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function tampil(jenis) {
  $('langkah-android').hidden = jenis !== 'android';
  $('langkah-ios').hidden = jenis !== 'ios';
}
document.querySelectorAll('[name=hp]').forEach((r) => r.addEventListener('change', () => tampil(r.value)));
if (ios) { document.querySelector('[name=hp][value=ios]').checked = true; tampil('ios'); }
if (terpasang) $('sudah').hidden = false;

let ajakan = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ajakan = e; $('cepat').hidden = false; });
$('pasang-sekarang').addEventListener('click', async () => {
  if (!ajakan) return;
  ajakan.prompt();
  await ajakan.userChoice;
  ajakan = null; $('cepat').hidden = true;
});
addEventListener('appinstalled', () => { $('cepat').hidden = true; $('sudah').hidden = false; });
