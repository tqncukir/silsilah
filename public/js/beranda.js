// Beranda setelah masuk. Anggota (Tahap 15): salam + Hijriah, kegiatan terdekat, haul pekan ini, berita, kartu saya, ziarah dibuka.
// Pengurus: menu sesuai peran (diganti Tahap 15 Langkah 3).
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;

// Jumlah usaha jamaah yang buka (rpc ringkas_usaha; semua yang login).
function ketUsaha(id) {
  dbKirim('POST', 'rpc/ringkas_usaha', {}).then((r) => {
    if (Number(r.buka)) document.getElementById(id).textContent = `${Number(r.buka).toLocaleString('id-ID')} usaha dari ${Number(r.pemilik).toLocaleString('id-ID')} jamaah · mari saling belanja`;
  }).catch(() => {});
}

// Status backup harian (khusus admin pusat): keterangan ubin + peringatan di atas bila bermasalah.
function ketBackup() {
  $('m-backup').hidden = false;
  dbKirim('POST', 'rpc/status_backup', {}).then((baris) => {
    const n = nilaiBackup(baris), t = n.terakhir;
    $('m-backup-ket').textContent = n.jenis === 'ok'
      ? `Berhasil · ${tglWib(t.waktu, { weekday: 'short', day: 'numeric', month: 'short' })} ${jamWib(t.waktu)} WIB · ${ukuranTeks(t.ukuran_byte)}`
      : n.jenis === 'kosong' ? 'Belum ada catatan backup' : `Perlu dicek: ${n.judul.toLowerCase()}`;
    if (n.jenis === 'gagal' || n.jenis === 'telat') {
      $('pesan-backup').innerHTML = `<strong>${hurufAman(n.judul)}.</strong> <a href="/backup.html">Buka Pantau Backup</a>`;
    }
  }).catch(() => { $('m-backup-ket').textContent = 'Status backup belum bisa dimuat'; });
}

// Haul terdekat (Hijriah) untuk keterangan ubin Haul. Ringkas: tanggal Hijriah hari ini sampai akhir bulan depan.
function ketHaul(id) {
  dbKirim('POST', 'rpc/tanggal_ahli_kubur', {}).then((rows) => {
    const kini = hijriah(hariIniWib()), depan = kini.m === 12 ? { m: 1, y: kini.y + 1 } : { m: kini.m + 1, y: kini.y };
    const urut = (h) => (h.m === kini.m ? 0 : 100) + h.d;
    const calon = rows.map((a) => ({ a, h: hijriah(a.tanggal_wafat) }))
      .filter(({ h }) => (h.m === kini.m && h.d >= kini.d && kini.y - h.y >= 1) || (h.m === depan.m && depan.y - h.y >= 1))
      .sort((x, y) => urut(x.h) - urut(y.h));
    const el = document.getElementById(id); if (!el) return;
    el.textContent = calon.length ? `Terdekat: ${calon[0].a.nama}, ${calon[0].h.d} ${BULAN_HIJRIAH[calon[0].h.m - 1]}${calon.length > 1 ? ` · ${calon.length} haul sampai bulan depan` : ''}` : 'Tidak ada haul sampai bulan depan';
  }).catch(() => {});
}

// ===== Beranda baru (Tahap 15) =====
// Tanggal hari ini: Masehi · Hijriah (perkiraan Ummul Qura).
function tanggalSalam() {
  const hari = hariIniWib();
  $('tanggal').textContent = `${tglWib(isoWib(hari, '12:00'))} · ${teksHijriah(hari)}`;
}
const selisihHari = (iso) => Math.round((Date.parse(new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA })) - Date.parse(hariIniWib())) / 864e5);

// Kegiatan terdekat (agenda umum): kartu utama + hitung mundur; hari ini → tombol aksi sesuai pemakai.
async function muatKegiatanDekat(aksi) {
  try {
    const daftar = await ambilAgenda(10);
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
    if (n <= 0 && aksi) { $('dekat-aksi').textContent = aksi[0]; $('dekat-aksi').href = aksi[1]; $('dekat-aksi').hidden = false; }
    const lain = daftar.slice(1).filter((x) => selisihHari(x.mulai) <= 6).length;
    $('dekat-lain').textContent = lain ? `${lain} kegiatan lain pekan ini` : 'Semua agenda';
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

// Berita terbaru (3; yang sudah masuk juga melihat Khusus anggota) + pemberitahuan berita menunggu persetujuan untuk pimpinan.
function muatBeritaBeranda(p) {
  gambarBerita($('berita-beranda-isi'), 3).then((n) => { $('berita-beranda').hidden = n <= 0; });
  if (PERAN_PIMPINAN_BERITA.includes(p.peran)) dbKirim('POST', 'rpc/berita_menunggu', {}).then((n) => {
    if (Number(n) > 0) { $('berita-menunggu').innerHTML = `<a href="/berita-kelola.html?status=diajukan"><strong>${Number(n)} berita</strong> dari koordinator menunggu persetujuan</a>`; $('berita-menunggu').hidden = false; }
  }).catch(() => {});
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
    muatBeritaBeranda(p);
    if (PERAN_LIHAT_JAMAAH.includes(p.peran)) {
      $('menu').hidden = false; $('m-jamaah').hidden = false; $('nav-jamaah').hidden = false; $('m-amanah').hidden = false; $('m-amanah-judul').hidden = false;
      $('m-tambah').hidden = !PERAN_UBAH_JAMAAH.includes(p.peran);
      $('m-pin').hidden = p.peran !== 'admin_pusat';
      if (p.peran === 'admin_pusat') ketBackup();
      if (PERAN_EKONOMI.includes(p.peran)) {
        $('m-ekonomi').hidden = false;
        dbKirim('POST', 'rpc/ringkas_ekonomi', {}).then((r) => {
          const kurang = Number(r.kurang) + Number(r.sangat_kurang);
          $('m-ekonomi-ket').textContent = `${kurang.toLocaleString('id-ID')} kurang mampu · ${Number(r.belum).toLocaleString('id-ID')} belum didata`;
        }).catch(() => {});
      }
      if (PERAN_BANTUAN.includes(p.peran)) {
        $('m-bantuan').hidden = false;
        dbKirim('POST', 'rpc/ringkas_bantuan', {}).then((r) => {
          const tunggu = p.peran === 'ketua' ? r.diajukan : p.peran === 'bendahara' || p.peran === 'koordinator_wilayah' ? r.disetujui : 0;
          if (tunggu) $('m-bantuan-ket').textContent = p.peran === 'ketua' ? `${tunggu} pengajuan menunggu persetujuan` : `${tunggu} bantuan siap disalurkan`;
        }).catch(() => {});
      }
      if (PERAN_LIHAT_KAS.includes(p.peran)) {
        $('m-kas').hidden = false;
        dbKirim('POST', 'rpc/saldo_kas', {}).then((k) => {
          if (k.length) $('m-kas-ket').textContent = k.length === 1 ? `Saldo ${k[0].nama}: ${rupiah(k[0].saldo)}` : `${k.length} kas · Saldo pusat ${rupiah(k.find((x) => x.kecamatan_id === null)?.saldo)}`;
        }).catch(() => {});
      }
      dbHalaman('jamaah?select=id', 0, 0).then(({ total }) => {
        $('m-jamaah-ket').textContent = `${total.toLocaleString('id-ID')} jamaah tercatat`;
      }).catch(() => {});
    }
    if (p.peran !== 'anggota') {
      $('menu').hidden = false; $('m-peduli').hidden = false; $('m-peduli-judul').hidden = false; $('m-usaha').hidden = false;
      ketUsaha('m-usaha-ket');
      $('m-sakit').hidden = !PERAN_KESEHATAN.includes(p.peran);
      $('m-kebutuhan').hidden = !PERAN_KEBUTUHAN.includes(p.peran);
      if (PERAN_KESEHATAN.includes(p.peran)) {
        dbKirim('POST', 'rpc/ringkas_kesehatan', {}).then((r) => {
          $('m-sakit-ket').textContent = Number(r.sakit)
            ? `${Number(r.sakit).toLocaleString('id-ID')} sedang sakit${Number(r.belum_dijenguk) ? ` · ${Number(r.belum_dijenguk).toLocaleString('id-ID')} belum dijenguk` : ''}`
            : 'Tidak ada yang tercatat sedang sakit';
          if (Number(r.kebutuhan)) $('m-kebutuhan-ket').textContent = `${Number(r.kebutuhan).toLocaleString('id-ID')} jamaah perlu dibantu`;
        }).catch(() => {});
      }
      // Dokter & khodim tidak punya menu Pondasi Jamaah; khodim/dokter membuka Ziarah & Umroh dari kelompok Ruhani.
      if (!PERAN_LIHAT_JAMAAH.includes(p.peran)) { $('m-pondasi-judul').hidden = true; $('m-pondasi').hidden = true; }
      if (!PERAN_LIHAT_KEGIATAN.includes(p.peran) && PERAN_LIHAT_PERJALANAN.includes(p.peran)) {
        $('m-ruhani').hidden = false; $('m-ruhani-judul').hidden = false; $('m-kegiatan').hidden = true; $('m-perjalanan').hidden = false;
      }
    }
    if (PERAN_LIHAT_ASET.includes(p.peran)) {
      $('menu').hidden = false; $('m-amanah').hidden = false; $('m-amanah-judul').hidden = false; $('m-aset').hidden = false;
      $('m-dasbor').hidden = !PERAN_LIHAT_JAMAAH.includes(p.peran);
      // Nadzir tidak punya menu Pondasi Jamaah: sembunyikan judul kelompok yang kosong.
      if (!PERAN_LIHAT_JAMAAH.includes(p.peran)) { $('m-pondasi-judul').hidden = true; $('m-pondasi').hidden = true; }
      dbKirim('POST', 'rpc/ringkas_aset', {}).then((r) => {
        const t = r.tanah, b = r.barang;
        if (t.jumlah || b.jenis) $('m-aset-ket').textContent = `${t.jumlah.toLocaleString('id-ID')} tanah wakaf (${luasTeks(t.luas_m2)}) · ${b.jenis.toLocaleString('id-ID')} jenis barang`;
      }).catch(() => {});
    }
    if (PERAN_LIHAT_KEGIATAN.includes(p.peran)) {
      $('menu').hidden = false; $('m-ruhani').hidden = false; $('m-ruhani-judul').hidden = false;
      $('m-absen').hidden = !PERAN_ABSEN.includes(p.peran);
      $('m-ahli').hidden = !PERAN_LIHAT_JAMAAH.includes(p.peran);
      $('m-haul').hidden = !PERAN_LIHAT_JAMAAH.includes(p.peran);
      ketHaul('m-haul-ket');
      if (PERAN_LIHAT_PERJALANAN.includes(p.peran)) {
        $('m-perjalanan').hidden = false;
        const hari = hariIniWib();
        dbHalaman(`perjalanan?select=id&dibatalkan=is.false&or=${encodeURIComponent(`(berangkat.gte.${isoWib(hari, '00:00')},pulang.gte.${hari})`)}`, 0, 0).then(({ total }) => {
          if (total) $('m-perjalanan-ket').textContent = `${total.toLocaleString('id-ID')} perjalanan akan berangkat`;
        }).catch(() => {});
      }
      dbHalaman(`kegiatan?select=id&dibatalkan=is.false&mulai=gte.${encodeURIComponent(isoWib(hariIniWib(), '00:00'))}`, 0, 0).then(({ total }) => {
        $('m-kegiatan-ket').textContent = total ? `${total.toLocaleString('id-ID')} kegiatan akan datang` : 'Buat dan lihat jadwal kegiatan';
      }).catch(() => {});
    }
    if (p.peran === 'anggota') {
      const k = p.jamaah_id ? ((await kartuAwal?.janji) ?? await dbKirim('POST', 'rpc/kartu_saya', {}).catch(() => null)) : null;
      document.body.classList.add('beranda-baru');
      muatKegiatanDekat(['Tunjukkan KTA', '/kta.html']); muatHaulPekan(); muatKartuSaya(k, !!k?.terbatas); muatZiarahAjak();
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
