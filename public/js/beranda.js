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
function ketAgenda() {
  ambilAgenda(1).then((d) => { if (d[0]) $('m-agenda-ket').textContent = `Terdekat: ${d[0].nama}, ${tglWib(d[0].mulai, { day: 'numeric', month: 'short' })}`; }).catch(() => {});
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
        muatRiwayat(true); ketAgenda();
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
        muatRiwayat(false); ketAgenda();
      }
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
