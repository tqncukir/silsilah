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
