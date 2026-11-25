const NAMA_PERAN = {
  admin_pusat: 'Admin Pusat', ketua: 'Ketua', bendahara: 'Bendahara', nadzir: 'Nadzir',
  koordinator_wilayah: 'Koordinator Wilayah', petugas_scan: 'Petugas Scan', khodim: 'Khodim/Keluarga',
  dokter: 'Dokter Pendamping', anggota: 'Anggota',
};
const isi = (label, nilai) => { const li = document.createElement('li'); li.textContent = `${label}: ${nilai}`; document.getElementById('rincian').append(li); };

(async () => {
  sesiDariTautan();
  try {
    const [p] = await dbGet('pengguna?select=nama,peran,jamaah_id');
    if (!p) {
      document.getElementById('salam').textContent = 'Akun belum punya peran';
      document.getElementById('catatan').textContent = 'Hubungi admin pusat agar akun ini diberi peran.';
      return;
    }
    document.getElementById('salam').textContent = `Assalamu'alaikum, ${p.nama}`;
    isi('Peran', NAMA_PERAN[p.peran] || p.peran);
    if (p.jamaah_id) {
      const [j] = await dbGet(`jamaah?select=nomor_anggota,desa(nama,kecamatan(nama))&id=eq.${p.jamaah_id}`);
      if (j) { isi('Nomor Anggota', j.nomor_anggota); isi('Desa', `${j.desa.nama}, Kec. ${j.desa.kecamatan.nama}`); }
    } else {
      const r = await dbGet('jamaah?select=id&limit=1000');
      isi('Data jamaah yang bisa dilihat', `${r.length} orang`);
    }
    document.getElementById('info').hidden = false;
    document.getElementById('catatan').textContent = 'Menu lengkap (Data Jamaah, KTA Digital) menyusul di langkah berikutnya.';
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') location.replace('/masuk.html');
    else document.getElementById('salam').textContent = 'Gagal memuat. Periksa sinyal lalu muat ulang.';
  }
})();
document.getElementById('keluar').onclick = keluar;
