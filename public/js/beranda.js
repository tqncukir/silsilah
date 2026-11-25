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
      $('menu').hidden = false; $('m-jamaah').hidden = false; $('nav-jamaah').hidden = false;
      $('m-tambah').hidden = !PERAN_UBAH_JAMAAH.includes(p.peran);
      dbHalaman('jamaah?select=id', 0, 0).then(({ total }) => {
        $('m-jamaah-ket').textContent = `${total.toLocaleString('id-ID')} jamaah tercatat`;
      }).catch(() => {});
    }
    if (p.peran === 'anggota' && p.jamaah_id) {
      const [j] = await dbGet(`jamaah?select=nomor_anggota,desa(nama,kecamatan(nama))&id=eq.${p.jamaah_id}`);
      if (j) {
        $('rincian').innerHTML = [['Nomor Anggota', j.nomor_anggota], ['Desa', j.desa.nama], ['Kecamatan', j.desa.kecamatan.nama]]
          .map(([k, v]) => `<div><dt>${k}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
        $('anggota').hidden = false;
      }
    }
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
