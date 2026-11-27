// Beranda setelah masuk: menu sesuai peran.
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;

// Portal Anggota: riwayat hadir sendiri (RLS: hanya baris milik anggota; sesi KTA lama tidak punya jamaah_id).
async function muatRiwayat(terbatas) {
  if (terbatas) { $('riwayat-ket').textContent = 'Masuk dengan KTA lama: riwayat hadir belum bisa ditampilkan. Minta KTA baru ke pengurus.'; return; }
  try {
    const { baris, total } = await dbHalaman('kehadiran?select=waktu,cara,kegiatan(nama,jenis,tempat)&order=waktu.desc', 0, 9);
    $('riwayat-ket').textContent = total ? `${total.toLocaleString('id-ID')} kali hadir tercatat${total > 10 ? ' · 10 terakhir' : ''}.` : 'Belum ada kehadiran tercatat. Tunjukkan KTA ke petugas saat kegiatan.';
    $('riwayat-isi').innerHTML = baris.map((h) => `<li><strong>${hurufAman(h.kegiatan?.nama || 'Kegiatan pengurus')}</strong>
      <span class="ket">${tglWib(h.waktu)} · jam ${jamWib(h.waktu)} WIB${h.kegiatan ? ` · ${hurufAman(h.kegiatan.tempat)}` : ''}</span></li>`).join('');
  } catch { $('riwayat-ket').textContent = 'Riwayat hadir belum bisa dimuat. Coba muat ulang.'; }
}
// Portal Anggota: Ziarah & Umroh. Perjalanan saya = baris peserta milik saya + keluarga yang saya daftarkan (RLS);
// sesi KTA lama tidak punya jamaah_id. Rombongan dibuka = perjalanan tampil untuk anggota yang belum lewat.
async function muatZiarah(terbatas) {
  const hari = hariIniWib();
  const pBuka = dbGet(`perjalanan?select=id,jenis,nama,tujuan,berangkat,pulang,tempat_kumpul&dibatalkan=is.false&publik=is.true&or=${encodeURIComponent(`(berangkat.gte.${isoWib(hari, '00:00')},pulang.gte.${hari})`)}&order=berangkat.asc&limit=5`).catch(() => null);
  const pSaya = terbatas ? Promise.resolve([]) : dbGet('peserta_perjalanan?select=id,jamaah_id,nama,hubungan,lunas,batal,perjalanan(id,jenis,nama,tujuan,berangkat,pulang,tempat_kumpul,dibatalkan)&order=id.desc&limit=50').catch(() => null);
  const [buka, saya] = await Promise.all([pBuka, pSaya]);
  const jenis = (p) => JENIS_PERJALANAN[p.jenis] || p.jenis;
  // Kelompokkan per perjalanan, terbaru berangkat di atas (maks 10 perjalanan)
  const per = new Map();
  for (const s of saya || []) if (s.perjalanan) { if (!per.has(s.perjalanan.id)) per.set(s.perjalanan.id, { p: s.perjalanan, orang: [] }); per.get(s.perjalanan.id).orang.push(s); }
  const daftar = [...per.values()].sort((a, b) => b.p.berangkat.localeCompare(a.p.berangkat)).slice(0, 10);
  const statusOrang = (s) => `${s.jamaah_id ? 'Anda' : `${hurufAman(s.nama)}${s.hubungan ? ` (${hurufAman(s.hubungan)})` : ''}`}: ${s.batal ? 'batal ikut' : s.lunas ? '<strong>lunas</strong>' : 'belum lunas'}`;
  if (terbatas) $('zs-ket').textContent = 'Masuk dengan KTA lama: perjalanan Anda belum bisa ditampilkan. Minta KTA baru ke pengurus.';
  else if (saya === null) $('zs-ket').textContent = 'Perjalanan Anda belum bisa dimuat. Coba muat ulang.';
  else $('zs-ket').textContent = daftar.length ? `Terdaftar di ${daftar.length.toLocaleString('id-ID')} perjalanan.` : 'Anda belum terdaftar di perjalanan mana pun. Ingin ikut? Hubungi pengurus atau koordinator wilayah.';
  $('zs-isi').innerHTML = daftar.map(({ p, orang }) => {
    const [st] = statusPerjalanan(p);
    return `<li><strong>${hurufAman(p.nama)}</strong>
      <span class="ket">${jenis(p)} · ${waktuPerjalanan(p)}${p.tempat_kumpul ? ` · ${hurufAman(p.tempat_kumpul)}` : ''}</span>
      <span class="ket">${p.dibatalkan ? '<strong>Perjalanan dibatalkan</strong>' : st === 'Selesai' ? 'Sudah selesai' : orang.map(statusOrang).join(' · ')}</span></li>`;
  }).join('');
  const sudah = new Set(daftar.map((d) => d.p.id));
  const lain = (buka || []).filter((p) => !sudah.has(p.id));
  $('zb-ket').textContent = buka === null ? 'Belum bisa dimuat. Coba muat ulang.'
    : lain.length ? 'Ingin ikut? Hubungi pengurus atau koordinator wilayah untuk didaftarkan.' : 'Belum ada rombongan lain yang dibuka.';
  $('zb-isi').innerHTML = lain.map((p) => `<li><strong>${hurufAman(p.nama)}</strong>
    <span class="ket">${jenis(p)} · ${waktuPerjalanan(p)}</span>
    ${p.tujuan || p.tempat_kumpul ? `<span class="ket">${[p.tujuan, p.tempat_kumpul && `kumpul di ${p.tempat_kumpul}`].filter(Boolean).map(hurufAman).join(' · ')}</span>` : ''}</li>`).join('');
  const akan = daftar.filter(({ p }) => !p.dibatalkan && statusPerjalanan(p)[0] !== 'Selesai');
  $('a-ziarah-ket').textContent = akan.length ? `Anda terdaftar: ${akan[0].p.nama}` : lain.length ? `${lain.length} rombongan dibuka` : 'Perjalanan Anda dan rombongan yang dibuka';
}

function ketAgenda() {
  ambilAgenda(1).then((d) => { if (d[0]) $('m-agenda-ket').textContent = `Terdekat: ${d[0].nama}, ${tglWib(d[0].mulai, { day: 'numeric', month: 'short' })}`; }).catch(() => {});
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
    $('peran').textContent = NAMA_PERAN[p.peran] || p.peran;
    if (PERAN_LIHAT_JAMAAH.includes(p.peran)) {
      $('menu').hidden = false; $('m-jamaah').hidden = false; $('nav-jamaah').hidden = false; $('m-amanah').hidden = false; $('m-amanah-judul').hidden = false;
      $('m-tambah').hidden = !PERAN_UBAH_JAMAAH.includes(p.peran);
      $('m-pin').hidden = p.peran !== 'admin_pusat';
      dbHalaman('jamaah?select=id', 0, 0).then(({ total }) => {
        $('m-jamaah-ket').textContent = `${total.toLocaleString('id-ID')} jamaah tercatat`;
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
    if (p.peran === 'anggota' && p.jamaah_id) {
      const k = (await kartuAwal?.janji) ?? await dbKirim('POST', 'rpc/kartu_saya', {});
      if (k?.terbatas) {
        const tglK = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        $('rincian').innerHTML = [
          ['Nomor Anggota', k.nomor_anggota], ['Status', k.wafat ? 'Wafat' : k.aktif ? 'Aktif' : 'Tidak aktif'], ['Mursyid', k.mursyid],
          ['Tanggal daftar', tglK(k.tanggal_daftar)], ['Umur saat daftar', k.umur_daftar ? `${k.umur_daftar} tahun` : ''], ['Pekerjaan', k.pekerjaan],
          ['Kab/Kota', k.kabupaten], ['Kecamatan', k.kecamatan], ['Kel/Desa', k.desa],
        ].map(([a, v]) => `<div><dt>${a}</dt><dd>${v ? hurufAman(String(v)) : '–'}</dd></div>`).join('');
        document.querySelector('.data-saya-ket').textContent = 'Masuk dengan KTA lama: yang tampil hanya data yang tercetak di kartu. Data lengkap bisa dilihat di pengurus.';
        $('anggota').hidden = false;
        muatRiwayat(true); ketAgenda(); ketHaul('a-haul-ket'); muatZiarah(true);
        return;
      }
      const pilih = 'nomor_anggota,nama,tempat_lahir,tanggal_lahir,jenis_kelamin,status_kawin,kewarganegaraan,pekerjaan,alamat,rt_rw,tanggal_daftar,aktif,wafat,desa(nama,kecamatan(nama,kabupaten(nama))),mursyid(nama)';
      const [j] = await dbGet(`jamaah?select=${pilih}&id=eq.${p.jamaah_id}`);
      if (j) {
        const tgl = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const status = j.wafat ? 'Wafat' : j.aktif ? 'Aktif' : 'Tidak aktif';
        $('rincian').innerHTML = [
          ['Nomor Anggota', j.nomor_anggota], ['Status', status], ['Mursyid', j.mursyid?.nama], ['Tanggal daftar', tgl(j.tanggal_daftar)],
          ['Tempat, tanggal lahir', [j.tempat_lahir, tgl(j.tanggal_lahir)].filter(Boolean).join(', ')],
          ['Umur', j.tanggal_lahir ? `${hitungUmur(j.tanggal_lahir)} tahun` : ''],
          ['Jenis kelamin', { L: 'Laki-laki', P: 'Perempuan' }[j.jenis_kelamin]], ['Status perkawinan', j.status_kawin],
          ['Kewarganegaraan', j.kewarganegaraan], ['Pekerjaan', j.pekerjaan],
          ['Kab/Kota', j.desa.kecamatan.kabupaten?.nama], ['Kecamatan', j.desa.kecamatan.nama], ['Kel/Desa', j.desa.nama],
          ['Dusun/Jalan', j.alamat], ['RT/RW', j.rt_rw],
        ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
        $('anggota').hidden = false;
        muatRiwayat(false); ketAgenda(); ketHaul('a-haul-ket'); muatZiarah(false);
      }
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
