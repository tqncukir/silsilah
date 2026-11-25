// Beranda setelah masuk: menu sesuai peran.
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;

(async () => {
  sesiDariTautan();
  try {
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
      dbHalaman('jamaah?select=id', 0, 0).then(({ total }) => {
        $('m-jamaah-ket').textContent = `${total.toLocaleString('id-ID')} jamaah tercatat`;
      }).catch(() => {});
    }
    if (p.peran === 'anggota' && p.jamaah_id) {
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
      }
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
