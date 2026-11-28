// Beranda setelah masuk (Tahap 15). Tanpa ubin menu (semua menu ada di menu bawah/atas).
// Anggota: salam + Hijriah, kegiatan terdekat, haul pekan ini, berita, kartu saya, ziarah dibuka.
// Pengurus: salam + Hijriah, perlu ditindaklanjuti, 4 pintasan, kegiatan terdekat, haul pekan ini, berita.
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;

// ===== Beranda baru (Tahap 15) =====
// Tanggal hari ini: Masehi · Hijriah (perkiraan Ummul Qura).
function tanggalSalam() {
  const hari = hariIniWib();
  $('tanggal').textContent = `${tglWib(isoWib(hari, '12:00'))} · ${teksHijriah(hari)}`;
}
const selisihHari = (iso) => Math.round((Date.parse(new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA })) - Date.parse(hariIniWib())) / 864e5);

// Kegiatan terdekat: kartu utama + hitung mundur; hari ini → tombol aksi (fungsi k → [teks, alamat] atau null).
// Pengurus yang boleh melihat Kegiatan: tabel kegiatan (RLS, termasuk yang tidak publik); lainnya: agenda umum.
async function ambilKegiatanPengurus() {
  const baris = await dbGet(`kegiatan?select=id,nama,jenis,mulai,selesai,tempat,kecamatan(nama)&dibatalkan=is.false&mulai=gte.${encodeURIComponent(isoWib(hariIniWib(), '00:00'))}&order=mulai.asc&limit=10`);
  return baris.map((k) => ({ ...k, wilayah: k.kecamatan ? `Kec. ${k.kecamatan.nama}` : 'Pusat Cukir' }));
}
async function muatKegiatanDekat(aksi, sumber = () => ambilAgenda(10), semua = ['/agenda.html', 'Semua agenda']) {
  try {
    const daftar = await sumber();
    if (!daftar.length) return;
    const k = daftar[0], n = selisihHari(k.mulai), kini = Date.now();
    const berlangsung = n <= 0 && kini >= Date.parse(k.mulai) && (!k.selesai || kini <= Date.parse(k.selesai));
    $('dekat-hari').textContent = tglWib(k.mulai, { day: 'numeric' });
    $('dekat-bulan').textContent = tglWib(k.mulai, { month: 'short' });
    $('dekat-hitung').innerHTML = berlangsung ? '<span class="stat stat-aktif">Sedang berlangsung</span>'
      : n <= 0 ? '<span class="stat stat-aktif">Hari ini</span>' : `<span class="dekat-sisa">${n === 1 ? 'Besok' : `${n} hari lagi`}</span>`;
    $('dekat-jenis').textContent = JENIS_KEGIATAN[k.jenis] || k.jenis;
    $('dekat-nama').textContent = k.nama;
    $('dekat-waktu').textContent = `${tglWib(k.mulai)} · ${rentangJam(k.mulai, k.selesai)}`;
    $('dekat-tempat').textContent = [k.tempat, k.wilayah].filter(Boolean).join(' · ');
    const tombol = n <= 0 && aksi ? aksi(k) : null;
    if (tombol) { $('dekat-aksi').textContent = tombol[0]; $('dekat-aksi').href = tombol[1]; $('dekat-aksi').hidden = false; }
    const lain = daftar.slice(1).filter((x) => selisihHari(x.mulai) <= 6).length;
    $('dekat-lain').href = semua[0];
    $('dekat-lain').textContent = lain ? `${lain} kegiatan lain pekan ini` : semua[1];
    $('dekat').hidden = false;
  } catch { /* agenda gagal dimuat: bagian tetap tersembunyi */ }
}

// Haul pekan ini (7 hari mulai hari ini, tanggal wafat Hijriah, minimal 1 tahun). Masyayikh didahulukan.
async function muatHaulPekan() {
  try {
    const rows = await dbKirim('POST', 'rpc/tanggal_ahli_kubur', {});
    const pekan = new Map();
    for (let i = 0; i < 7; i++) {
      const iso = new Date(Date.parse(hariIniWib()) + i * 864e5).toISOString().slice(0, 10), h = hijriah(iso);
      if (!pekan.has(`${h.m}-${h.d}`)) pekan.set(`${h.m}-${h.d}`, { iso, h, i });
    }
    const haul = rows.map((a) => ({ a, w: hijriah(a.tanggal_wafat) }))
      .map(({ a, w }) => ({ a, t: pekan.get(`${w.m}-${w.d}`), w }))
      .filter(({ t, w }) => t && t.h.y - w.y >= 1)
      .sort((x, y) => (x.a.jenis === 'masyayikh' ? 0 : 1) - (y.a.jenis === 'masyayikh' ? 0 : 1) || x.t.i - y.t.i);
    if (!haul.length) return;
    const hariTeks = (t) => (t.i === 0 ? 'Hari ini' : t.i === 1 ? 'Besok' : tglWib(isoWib(t.iso, '12:00'), { weekday: 'long' }));
    $('haul-isi').innerHTML = haul.slice(0, 3).map(({ a, t }) => `<li><strong>${hurufAman(a.nama)}</strong>${a.bin_binti ? ` <span class="ket">${hurufAman(a.bin_binti)}</span>` : ''}
      <span class="ket">${a.jenis === 'masyayikh' ? 'Masyayikh · ' : ''}${hariTeks(t)}, ${t.h.d} ${BULAN_HIJRIAH[t.h.m - 1]}</span></li>`).join('');
    $('haul-ket').textContent = haul.length > 3 ? `dan ${haul.length - 3} almarhum lainnya. Mari kirimkan doa.` : 'Mari kirimkan doa untuk beliau-beliau.';
    $('haul-pekan').hidden = false;
  } catch { /* tanpa hak / gagal: bagian tetap tersembunyi */ }
}

// Anggota: kartu mini KTA + jumlah hadir bulan ini (RLS: hanya kehadiran miliknya; sesi KTA lama tidak bisa).
async function muatKartuSaya(k, terbatas) {
  if (k) {
    $('km-nama').textContent = k.nama || '–';
    $('km-nomor').textContent = `No. ${k.nomor_anggota || '–'}`;
    $('km-desa').textContent = [k.desa, k.kecamatan].filter(Boolean).join(', ');
  }
  $('anggota').hidden = false;
  if (terbatas) { $('hadir-n').textContent = '–'; $('hadir-ket').textContent = 'Masuk dengan KTA lama: kehadiran belum bisa ditampilkan. Minta KTA baru ke pengurus.'; return; }
  try {
    const awal = `${hariIniWib().slice(0, 8)}01`;
    const { total } = await dbHalaman(`kehadiran?select=waktu&waktu=gte.${encodeURIComponent(isoWib(awal, '00:00'))}`, 0, 0);
    $('hadir-n').textContent = total.toLocaleString('id-ID');
    $('hadir-ket').textContent = total ? `${tglWib(isoWib(awal, '12:00'), { month: 'long', year: 'numeric' })} · lihat riwayat` : 'Belum ada yang tercatat. Tunjukkan KTA ke petugas saat kegiatan.';
  } catch { $('hadir-ket').textContent = 'Kehadiran belum bisa dimuat. Coba muat ulang.'; }
}

// Anggota: rombongan ziarah/umroh yang dibuka dan belum berangkat (maks 2); tersembunyi bila tidak ada.
async function muatZiarahAjak() {
  try {
    const hari = hariIniWib();
    const buka = await dbGet(`perjalanan?select=id,jenis,nama,tujuan,berangkat,pulang&dibatalkan=is.false&publik=is.true&berangkat=gte.${encodeURIComponent(isoWib(hari, '00:00'))}&order=berangkat.asc&limit=2`);
    if (!buka.length) return;
    $('ziarah-isi').innerHTML = buka.map((p) => `<li><strong>${hurufAman(p.nama)}</strong>
      <span class="ket">${JENIS_PERJALANAN[p.jenis] || p.jenis} · ${waktuPerjalanan(p)}${p.tujuan ? ` · ${hurufAman(p.tujuan)}` : ''}</span></li>`).join('');
    $('ziarah-ajak').hidden = false;
  } catch { /* gagal: tersembunyi */ }
}

// Berita terbaru (3; yang sudah masuk juga melihat Khusus anggota).
function muatBeritaBeranda() {
  gambarBerita($('berita-beranda-isi'), 3).then((n) => { $('berita-beranda').hidden = n <= 0; });
}

// Pengurus: Perlu ditindaklanjuti (rpc tindak_lanjut: jumlah sesuai hak, tanpa nama) + backup bermasalah (admin pusat).
const TINDAK = {
  berita_menunggu: (n) => [`${n} berita koordinator menunggu persetujuan`, '/berita-kelola.html?status=diajukan'],
  berita_ditolak: (n) => [`${n} berita Anda ditolak, perlu diperbaiki`, '/berita-kelola.html?status=ditolak'],
  bantuan_putus: (n) => [`${n} pengajuan bantuan belum diputuskan`, '/bantuan.html?status=diajukan'],
  bantuan_salur: (n) => [`${n} bantuan disetujui, belum disalurkan`, '/bantuan.html?status=disetujui'],
  peserta_belum_lunas: (n) => [`${n} peserta ziarah/umroh belum lunas`, '/perjalanan.html'],
  sakit_belum_dijenguk: (n) => [`${n} jamaah sakit belum dijenguk 7 hari terakhir`, '/sakit.html'],
};
async function muatTindakLanjut(p) {
  const [tl, backup] = await Promise.all([
    dbKirim('POST', 'rpc/tindak_lanjut', {}).catch(() => null),
    p.peran === 'admin_pusat' ? dbKirim('POST', 'rpc/status_backup', {}).then(nilaiBackup).catch(() => null) : null,
  ]);
  if (tl === null) return; // gagal dimuat: bagian tetap tersembunyi
  const item = Object.entries(TINDAK).filter(([k]) => Number(tl[k]) > 0).map(([k, f]) => f(Number(tl[k]).toLocaleString('id-ID')));
  if (backup && (backup.jenis === 'gagal' || backup.jenis === 'telat')) item.unshift([`Backup harian: ${backup.judul.toLowerCase()}`, '/backup.html']);
  $('tindak-isi').innerHTML = item.map(([t, u]) => `<li><a href="${u}">${hurufAman(t).replace(/^([\d.]+)/, '<strong>$1</strong>')}</a></li>`).join('');
  $('tindak-kosong').hidden = item.length > 0;
  $('tindak').hidden = false;
}

// Pengurus: 4 pintasan menurut peran, hanya dari menu yang memang boleh dibuka (daftarMenu).
const PINTAS = {
  admin_pusat: ['jamaah', 'daftar', 'absensi', 'tulis'], ketua: ['jamaah', 'daftar', 'absensi', 'tulis'],
  koordinator_wilayah: ['jamaah', 'daftar', 'absensi', 'tulis'], bendahara: ['kas', 'laporan', 'kegiatan', 'dasbor'],
  petugas_scan: ['absensi', 'kegiatan', 'jamaah', 'agenda'], nadzir: ['aset', 'agenda', 'haul', 'usaha'],
  khodim: ['ziarah', 'kebutuhan', 'agenda', 'usaha'], dokter: ['sakit', 'kebutuhan', 'ziarah', 'agenda'],
};
function pasangPintasan(p) {
  const { utama, grup } = daftarMenu(p), ada = new Map([...utama, ...grup.flatMap((g) => g[2])].map((m) => [m[0], m]));
  if (ada.has('berita')) ada.set('tulis', ['berita', 'Tulis Berita', '/berita-isi.html']);
  if (ada.has('kas')) ada.set('laporan', ['kas', 'Laporan Kas', '/kas-laporan.html']);
  const LABEL = { jamaah: 'Cari Jamaah', agenda: 'Agenda' };
  const isi = (PINTAS[p.peran] || []).filter((k) => ada.has(k)).slice(0, 4).map((k) => { const [i, t, u] = ada.get(k); return [i, LABEL[k] || t, u]; });
  if (!isi.length) return;
  $('pintas-isi').innerHTML = isi.map(([i, t, u]) => `<li><a href="${u}"><span class="pintas-ikon">${ikonMenu(i, 22)}</span><span>${t}</span></a></li>`).join('');
  $('pintas').hidden = false;
}

(async () => {
  sesiDariTautan();
  try {
    const kartuAwal = await kartuSayaAwal().catch(() => null);
    const p = await profilSaya();
    if (!p) {
      $('salam').textContent = 'Akun belum punya peran';
      $('peran').textContent = 'Hubungi admin pusat agar akun ini diberi peran.';
      return;
    }
    $('salam').textContent = p.nama;
    tanggalSalam();
    $('peran').textContent = NAMA_PERAN[p.peran] || p.peran;
    muatBeritaBeranda();
    if (p.peran !== 'anggota') {
      document.body.classList.add('beranda-baru');
      muatTindakLanjut(p); pasangPintasan(p); muatHaulPekan();
      if (PERAN_LIHAT_KEGIATAN.includes(p.peran)) {
        muatKegiatanDekat((k) => (PERAN_ABSEN.includes(p.peran) ? ['Buka Absensi', `/absensi.html?kegiatan=${k.id}`] : ['Lihat kegiatan', `/kegiatan-isi.html?id=${k.id}`]),
          ambilKegiatanPengurus, ['/kegiatan.html', 'Semua kegiatan']);
      } else muatKegiatanDekat(null);
    }
    if (p.peran === 'anggota') {
      const k = p.jamaah_id ? ((await kartuAwal?.janji) ?? await dbKirim('POST', 'rpc/kartu_saya', {}).catch(() => null)) : null;
      document.body.classList.add('beranda-baru');
      muatKegiatanDekat(() => ['Tunjukkan KTA', '/kta.html']); muatHaulPekan(); muatKartuSaya(k, !!k?.terbatas); muatZiarahAjak();
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
