// Halaman Berita (publik): 10 per muat, tombol "Muat berita lainnya".
const ol = document.getElementById('berita');
let dari = 0, total = 0;
async function muatLagi() {
  const tombol = document.getElementById('lagi');
  tombol.disabled = true;
  try {
    const daftar = await ambilBerita({ dari, batas: 10 });
    total = Number(daftar[0]?.total || total);
    ol.insertAdjacentHTML('beforeend', daftar.map(kartuBerita).join(''));
    dari += daftar.length;
  } catch { document.getElementById('pesan').textContent = 'Berita belum bisa dimuat. Periksa sinyal lalu coba lagi.'; }
  tombol.disabled = false;
  tombol.hidden = dari >= total;
}
document.getElementById('lagi').onclick = muatLagi;
(async () => {
  const n = await gambarBerita(ol, 10, 'Belum ada berita.');
  if (n > 0) { total = n; dari = ol.children.length; document.getElementById('lagi').hidden = dari >= total; }
  document.getElementById('ajak-masuk').hidden = !!sesi.ambil();
})();
