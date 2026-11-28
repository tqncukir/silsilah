// Pantau Backup (Tahap 12, khusus admin pusat). Hak akses ditegakkan database (public.status_backup -> wajib_admin_pusat).
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;
const AWAL_RUN = 'https://github.com/tqncukir/silsilah/actions/runs/';

const kunciWib = (t) => new Date(new Date(t).getTime() + 7 * 3600e3).toISOString().slice(0, 10); // tanggal WIB
const IKON = {
  ok: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bahaya: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
};
const TAMPIL_AWAL = 14;
let semua = false, dataBaris = [];

// Jadwal backup harian 01.15 WIB: kapan berikutnya
function teksBerikutnya() {
  const kini = new Date(Date.now() + 7 * 3600e3); // jam WIB dalam UTC
  const lewat = kini.getUTCHours() * 60 + kini.getUTCMinutes() >= 75;
  return `Backup berikutnya: ${lewat ? 'besok dini hari' : 'dini hari nanti'}, jam 01.15 WIB.`;
}

function tampil(baris) {
  dataBaris = baris;
  const n = nilaiBackup(baris);
  $('status').dataset.jenis = n.jenis;
  $('st-ikon').innerHTML = n.jenis === 'ok' ? IKON.ok : IKON.bahaya;
  $('st-judul').textContent = n.judul;
  $('st-ket').textContent = n.ket;
  $('st-berikut').textContent = teksBerikutnya();

  // a. Pita 30 hari: satu kotak per hari (berhasil / gagal / tidak ada catatan)
  const perHari = new Map();
  for (const b of baris) { const k = kunciWib(b.waktu); perHari.set(k, perHari.get(k) === 'ok' || b.berhasil ? 'ok' : 'gagal'); }
  const hari = [];
  for (let i = 29; i >= 0; i--) hari.push(kunciWib(Date.now() - i * 864e5));
  $('pita').innerHTML = hari.map((k) => {
    const j = perHari.get(k) || 'kosong';
    const tgl = new Date(k + 'T12:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
    return `<li class="bk-kotak ${j}" title="${tgl}: ${j === 'ok' ? 'berhasil' : j === 'gagal' ? 'gagal' : 'tidak ada catatan'}"><span class="sr-only">${tgl}: ${j === 'ok' ? 'berhasil' : j === 'gagal' ? 'gagal' : 'tidak ada catatan'}</span></li>`;
  }).join('');

  // c. Angka ringkas
  const sebulan = baris.filter((b) => Date.now() - new Date(b.waktu).getTime() <= 30 * 864e5);
  const ok = sebulan.filter((b) => b.berhasil).length;
  const angka = [['Berhasil (30 hari)', ok.toLocaleString('id-ID')], ['Gagal (30 hari)', (sebulan.length - ok).toLocaleString('id-ID')],
    ['Ukuran terakhir', ukuranTeks(baris.find((b) => b.berhasil)?.ukuran_byte)], ['Catatan (90 hari)', baris.length.toLocaleString('id-ID')]];
  $('angka').innerHTML = angka.map(([t, a]) => `<div${t.startsWith('Gagal') && a !== '0' ? ' class="bk-merah"' : ''}><dt>${t}</dt><dd>${hurufAman(a)}</dd></div>`).join('');
  gambarRiwayat();
}

// e, f. Riwayat ringkas: catatan hanya bila ada yang berbeda; tautan GitHub hanya untuk yang gagal.
function gambarRiwayat() {
  const baris = dataBaris;
  const jml = baris.map((b) => b.jumlah_tabel).filter((x) => x != null);
  const biasa = jml.sort((a, b) => jml.filter((x) => x === b).length - jml.filter((x) => x === a).length)[0];
  const tampilBaris = semua ? baris : baris.slice(0, TAMPIL_AWAL);
  $('isi-tabel').innerHTML = tampilBaris.length ? tampilBaris.map((b) => {
    const cat = [];
    if (!b.berhasil && b.gagal_di) cat.push(`Gagal di: ${hurufAman(b.gagal_di)}`);
    if (b.dirapikan) cat.push(`${b.dirapikan} file lama dirapikan`);
    if (b.jumlah_tabel != null && b.jumlah_tabel !== biasa) cat.push(`${b.jumlah_tabel} tabel`);
    const gh = !b.berhasil && b.run_url?.startsWith(AWAL_RUN) ? `<a class="bk-gh" href="${hurufAman(b.run_url)}" target="_blank" rel="noopener">Lihat sebabnya di GitHub</a>` : '';
    return `<tr class="bk-baris${b.berhasil ? '' : ' bk-baris-gagal'}">
    <td data-l="Tanggal">${tglWib(b.waktu, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
    <td data-l="Jam">${jamWib(b.waktu)} WIB</td>
    <td data-l="Hasil">${b.berhasil ? '<span class="stat stat-biasa">Berhasil</span>' : '<span class="stat stat-wafat">Gagal</span>'}</td>
    <td data-l="Ukuran">${ukuranTeks(b.ukuran_byte)}</td>
    <td data-l="Catatan">${cat.length ? `<span class="ket bk-cat">${cat.join(' · ')}</span>` : (gh ? '' : '<span class="ket bk-strip">–</span>')}${gh}</td>
  </tr>`;
  }).join('') : '<tr><td colspan="5" class="tabel-kosong">Belum ada catatan.</td></tr>';
  $('semua').hidden = baris.length <= TAMPIL_AWAL;
  $('semua').textContent = semua ? `Tampilkan ${TAMPIL_AWAL} terbaru` : `Tampilkan semua (${baris.length.toLocaleString('id-ID')} catatan)`;
}
$('semua').onclick = () => { semua = !semua; gambarRiwayat(); };

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
