// Isian wilayah: Kel/Desa, Kecamatan, Kab/Kota, Tempat lahir.
// Saran dari daftar resmi Kemendagri 2025 (tabel wilayah_resmi). Petugas tetap boleh mengetik sendiri.
// Memilih saran desa/kecamatan dari luar kab/kota yang terisi otomatis mengisi kecamatan dan kab/kota.
let semuaWilayah = []; // wilayah yang sudah dipakai di SILSILAH: [{id, desa, kec, kab}]
const Wilayah = (() => {
  const $w = (i) => document.getElementById(i);
  const kecil = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');
  const namaKab = (n) => n.replace(/^Kabupaten /, '');
  let kab = null;               // [{kode, nama, prov}]
  const anak = new Map();       // kode induk -> [{kode, nama}]
  const komposit = new Map();   // teks saran gabungan -> {desa, kec, kab}

  async function daftarKab() {
    if (!kab) {
      const [k, p] = await Promise.all([dbGet('wilayah_resmi?select=kode,nama&tingkat=eq.2&order=nama'), dbGet('wilayah_resmi?select=kode,nama&tingkat=eq.1')]);
      const prov = Object.fromEntries(p.map((x) => [x.kode, x.nama]));
      kab = k.map((x) => ({ kode: x.kode, nama: namaKab(x.nama), prov: prov[x.kode.slice(0, 2)] }));
    }
    return kab;
  }
  async function anakDari(kode) {
    if (!anak.has(kode)) anak.set(kode, await dbGet(`wilayah_resmi?select=kode,nama&induk=eq.${kode}&order=nama`));
    return anak.get(kode);
  }
  const cariKab = (t) => kab?.find((k) => kecil(k.nama) === kecil(t.replace(/^(kabupaten|kab\.?)\s+/i, '')));
  const cari = (daftar, t) => daftar.find((x) => kecil(x.nama) === kecil(t));
  const opsi = (id, daftar) => { $w(id).innerHTML = daftar.map(([v, l]) => `<option value="${hurufAman(v)}"${l ? ` label="${hurufAman(l)}"` : ''}>`).join(''); };
  const aman = (q) => encodeURIComponent(q.replace(/[*,()%]/g, ''));

  async function saranKec() {
    const k = cariKab($w('kabupaten').value), q = $w('kecamatan').value.trim();
    if (k) return opsi('saran-kec', (await anakDari(k.kode)).map((x) => [x.nama]));
    if (q.length < 3) return opsi('saran-kec', []);
    const r = await dbGet(`wilayah_resmi?select=kode,nama&tingkat=eq.3&nama=ilike.${aman(q)}*&order=nama&limit=15`);
    opsi('saran-kec', r.map((x) => {
      const kb = kab.find((y) => y.kode === x.kode.slice(0, 5));
      const v = `${x.nama}, ${kb.nama}`; komposit.set(v, { kec: x.nama, kab: kb.nama }); return [v, kb.prov];
    }));
  }
  async function saranDesa() {
    const k = cariKab($w('kabupaten').value), q = $w('desa').value.trim();
    const kec = k && cari(await anakDari(k.kode), $w('kecamatan').value);
    if (kec) return opsi('saran-desa', (await anakDari(kec.kode)).map((x) => [x.nama]));
    if (q.length < 3) return opsi('saran-desa', []);
    const r = await dbGet(`wilayah_resmi?select=kode,nama&tingkat=eq.4&nama=ilike.${aman(q)}*${k ? `&kode=like.${k.kode}.*` : ''}&order=nama&limit=15`);
    const kodeKec = [...new Set(r.map((x) => x.kode.slice(0, 8)))];
    const nk = kodeKec.length ? Object.fromEntries((await dbGet(`wilayah_resmi?select=kode,nama&kode=in.(${kodeKec.join(',')})`)).map((x) => [x.kode, x.nama])) : {};
    opsi('saran-desa', r.map((x) => {
      const kb = kab.find((y) => y.kode === x.kode.slice(0, 5)), kc = nk[x.kode.slice(0, 8)];
      const v = `${x.nama}, ${kc}, ${kb.nama}`; komposit.set(v, { desa: x.nama, kec: kc, kab: kb.nama }); return [v, `Kec. ${kc}, ${kb.nama}`];
    }));
  }

  // Saran gabungan dipilih: pecah ke masing-masing isian.
  function pecah(e) {
    const p = komposit.get(e.target.value);
    if (!p) return false;
    if (p.desa) $w('desa').value = p.desa;
    $w('kecamatan').value = p.kec; $w('kabupaten').value = p.kab;
    for (const i of ['desa', 'kecamatan', 'kabupaten']) $w(i).classList.remove('otomatis');
    return true;
  }

  let tunda;
  const nanti = (f) => { clearTimeout(tunda); tunda = setTimeout(() => f().catch(() => {}), 250); };

  async function pasang() {
    await daftarKab();
    opsi('saran-kab', kab.map((k) => [k.nama, k.prov]));
    if ($w('saran-lahir')) opsi('saran-lahir', [...new Set(kab.map((k) => k.nama.replace(/^Kota /, '')))].sort().map((n) => [n]));
    $w('kabupaten').addEventListener('input', () => nanti(saranKec));
    $w('kecamatan').addEventListener('input', (e) => { if (pecah(e)) nanti(saranDesa); else nanti(saranKec); });
    $w('desa').addEventListener('input', (e) => { pecah(e); nanti(saranDesa); });
    $w('kecamatan').addEventListener('focus', () => nanti(saranKec));
    $w('desa').addEventListener('focus', () => nanti(saranDesa));
  }

  // Ejaan hasil baca KTP dibetulkan ke nama resmi bila mirip. cocokkan(teks, daftar) -> item | null
  async function betulkan(h, cocokkan) {
    await daftarKab();
    const k = (h.kabupaten && cocokkan(h.kabupaten, kab)) || cariKab($w('kabupaten').value);
    if (!k) return h;
    const kec = h.kecamatan && cocokkan(h.kecamatan, await anakDari(k.kode));
    const desa = kec && h.desa && cocokkan(h.desa, await anakDari(kec.kode));
    return { ...h, kabupaten: h.kabupaten ? k.nama : h.kabupaten, kecamatan: kec?.nama || h.kecamatan, desa: desa?.nama || h.desa };
  }

  return { pasang, betulkan, segarkan: () => { nanti(saranKec); nanti(saranDesa); } };
})();

async function muatWilayah(kecBoleh) {
  const d = await dbGet('desa?select=id,nama,kecamatan(id,nama,kabupaten(nama))&order=nama');
  semuaWilayah = d.filter((x) => !kecBoleh || kecBoleh.has(x.kecamatan.id))
    .map((x) => ({ id: x.id, desa: x.nama, kec: x.kecamatan.nama, kec_id: x.kecamatan.id, kab: x.kecamatan.kabupaten.nama }));
  await Wilayah.pasang().catch(() => {}); // tanpa daftar resmi pun isian tetap bisa diketik
  return Wilayah.segarkan;
}
// Kab/kota awal: satu-satunya yang dipakai (misal koordinator), selain itu Jombang.
function wilayahAwal() {
  const kab = [...new Set(semuaWilayah.map((w) => w.kab))];
  return kab.length === 1 ? kab[0] : 'Jombang';
}
// Kirim ke database: cari wilayah yang cocok, atau buat baru (hanya admin pusat & ketua).
async function desaIdWilayah() {
  const v = (i) => document.getElementById(i).value;
  return dbKirim('POST', 'rpc/desa_id_wilayah', { p_kabupaten: v('kabupaten'), p_kecamatan: v('kecamatan'), p_desa: v('desa') });
}
