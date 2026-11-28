// Baca satu berita (publik; berita Khusus anggota hanya untuk yang sudah masuk).
const $ = (id) => document.getElementById(id);
(async () => {
  const id = Number(new URLSearchParams(location.search).get('id'));
  try {
    const [b] = id ? await ambilBerita({ id, batas: 1 }) : [];
    if (!b) {
      $('judul').textContent = 'Berita tidak ditemukan';
      $('isi').innerHTML = sesi.ambil() ? '<p>Berita ini sudah tidak tersedia.</p>'
        : '<p>Berita ini tidak tersedia atau khusus untuk anggota. <a href="/masuk.html">Masuk</a> untuk membaca berita khusus anggota.</p>';
      return;
    }
    document.title = `${b.judul} · SILSILAH TQN Cukir`;
    $('judul').textContent = b.judul;
    $('meta').innerHTML = `${tglWib(b.terbit_pada, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${hurufAman(b.wilayah)}${b.khusus_anggota ? ' · <span class="berita-khusus">Khusus anggota</span>' : ''}`;
    if (b.foto) { $('foto').src = fotoBerita(b.foto); $('foto').alt = `Foto: ${b.judul}`; $('foto').hidden = false; }
    $('isi').innerHTML = paragrafBerita(b.isi);
  } catch (e) {
    $('judul').textContent = 'Berita belum bisa dimuat';
    $('isi').innerHTML = `<p>${e.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi sebentar.' : 'Coba muat ulang halaman.'}</p>`;
  }
})();
