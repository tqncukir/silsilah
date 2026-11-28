// Pantau Backup (Tahap 12, khusus admin pusat). Hak akses ditegakkan database (public.status_backup -> wajib_admin_pusat).
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;
const AWAL_RUN = 'https://github.com/tqncukir/silsilah/actions/runs/';

function tampil(baris) {
  const n = nilaiBackup(baris);
  $('status').dataset.jenis = n.jenis;
  $('st-judul').textContent = n.judul;
  $('st-ket').textContent = n.ket;

  const sebulan = baris.filter((b) => Date.now() - new Date(b.waktu).getTime() <= 30 * 864e5);
  const ok = sebulan.filter((b) => b.berhasil).length;
  const angka = [[ok, 'berhasil (30 hari)'], [sebulan.length - ok, 'gagal (30 hari)'],
    [ukuranTeks(baris.find((b) => b.berhasil)?.ukuran_byte), 'ukuran backup terakhir'], [baris.length, 'catatan (90 hari)']];
  $('angka').innerHTML = angka.map(([a, t]) => `<li><strong>${hurufAman(typeof a === 'number' ? a.toLocaleString('id-ID') : a)}</strong><span>${t}</span></li>`).join('');

  $('isi-tabel').innerHTML = baris.length ? baris.map((b) => `<tr class="bk-baris">
    <td data-l="Tanggal">${tglWib(b.waktu, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
    <td data-l="Jam">${jamWib(b.waktu)} WIB</td>
    <td data-l="Hasil">${b.berhasil ? '<span class="stat stat-biasa">Berhasil</span>'
      : `<span class="stat stat-wafat">Gagal</span>${b.gagal_di ? ` <span class="ket bk-langkah">${hurufAman(b.gagal_di)}</span>` : ''}`}</td>
    <td data-l="Ukuran">${ukuranTeks(b.ukuran_byte)}</td>
    <td data-l="Tabel" class="kol-luas">${b.jumlah_tabel ?? '–'}</td>
    <td data-l="File lama dirapikan" class="kol-luas">${b.dirapikan ?? '–'}</td>
    <td data-l="Catatan">${!b.berhasil && b.gagal_di ? `<span class="hp-saja ket bk-gagal-di">Gagal di: ${hurufAman(b.gagal_di)}</span>` : ''}${b.run_url?.startsWith(AWAL_RUN) ? `<a href="${hurufAman(b.run_url)}" target="_blank" rel="noopener" class="bk-lihat">Lihat di GitHub</a>` : '–'}</td>
  </tr>`).join('') : '<tr><td colspan="7" class="tabel-kosong">Belum ada catatan.</td></tr>';
}

(async () => {
  sesiDariTautan();
  try {
    const p = await profilSaya();
    if (!p || p.peran !== 'admin_pusat') { location.replace('/beranda.html'); return; }
    tampil(await dbKirim('POST', 'rpc/status_backup', {}));
    $('isi').hidden = false;
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    $('pesan').textContent = e?.message === 'Failed to fetch' ? 'Sinyal terputus. Coba muat ulang.' : 'Status backup belum bisa dimuat. Coba muat ulang.';
  }
})();
