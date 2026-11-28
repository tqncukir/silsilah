// Isian dengan saran: Kel/Desa, Kecamatan, Kab/Kota, Tempat lahir, Pekerjaan.
// Wilayah dari daftar resmi Kemendagri 2025 (tabel wilayah_resmi), dicari se-Indonesia; yang ada di
// kab/kota terisi tampil paling atas. Pekerjaan dari 89 jenis baku Dukcapil. Petugas tetap boleh mengetik sendiri.
let semuaWilayah = []; // wilayah yang sudah dipakai di SILSILAH: [{id, desa, kec, kab}]

const Wilayah = (() => {
  const $w = (i) => document.getElementById(i);
  const kecil = (t) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aman = (q) => encodeURIComponent(q.replace(/[*,()%.]/g, ' ').trim());
  let kab = null;           // [{kode, nama, prov}]
  const anak = new Map();   // kode induk -> [{kode, nama}]

  async function daftarKab() {
    if (!kab) {
      const [k, p] = await Promise.all([dbGet('wilayah_resmi?select=kode,nama&tingkat=eq.2&order=nama'), dbGet('wilayah_resmi?select=kode,nama&tingkat=eq.1')]);
      const prov = Object.fromEntries(p.map((x) => [x.kode, x.nama]));
      kab = k.map((x) => ({ kode: x.kode, nama: x.nama.replace(/^Kabupaten /, ''), prov: prov[x.kode.slice(0, 2)] }));
    }
    return kab;
  }
  async function anakDari(kode) {
    if (!anak.has(kode)) anak.set(kode, await dbGet(`wilayah_resmi?select=kode,nama&induk=eq.${kode}&order=nama`));
    return anak.get(kode);
  }
  const kabKode = (kode) => kab.find((y) => y.kode === kode.slice(0, 5));
  const cariKab = (t) => kab?.find((k) => kecil(k.nama) === kecil((t || '').replace(/^(kabupaten|kab\.?)\s+/i, '')));
  // urutan: diawali teks yang diketik dulu, lalu yang memuatnya
  const saring = (daftar, q, ambil = (x) => x) => {
    const k = kecil(q);
    if (!k) return daftar;
    const awal = [], isi = [];
    for (const x of daftar) { const n = kecil(ambil(x)); if (n.startsWith(k)) awal.push(x); else if (n.includes(k)) isi.push(x); }
    return awal.concat(isi);
  };
  let fokusBaru = false; // baru masuk isian (belum mengetik)
  // Isian kosong atau (saat baru masuk) sudah sama persis dengan salah satu pilihan: tampilkan semua (bisa digulir) agar mudah diganti.
  const saringAtauSemua = (daftar, q, ambil = (x) => x) => (!kecil(q) || (fokusBaru && daftar.some((x) => kecil(ambil(x)) === kecil(q))) ? daftar : saring(daftar, q, ambil));
  const unik = (daftar) => { const ada = new Set(); return daftar.filter((x) => { const k = x.teks + '|' + x.sub; if (ada.has(k)) return false; ada.add(k); return true; }); };

  // ===== Sumber saran: (teks yang diketik) -> [{teks, sub, isi}] =====
  const sumber = {
    async kabupaten(q) {
      await daftarKab();
      return (kecil(q) ? saringAtauSemua(kab, q, (k) => k.nama) : kab).slice(0, 40).map((k) => ({ teks: k.nama, sub: k.prov, isi: { kabupaten: k.nama } }));
    },
    async 'tempat-lahir'(q) {
      if (kecil(q).length < 2) return [];
      await daftarKab();
      const nama = [...new Set(kab.map((k) => k.nama.replace(/^Kota /, '')))];
      return saring(nama, q).slice(0, 8).map((n) => ({ teks: n, isi: { 'tempat-lahir': n } }));
    },
    async pekerjaan(q) {
      return saringAtauSemua(PEKERJAAN_BAKU, q).map((n) => ({ teks: n, isi: { pekerjaan: n } }));
    },
    async kecamatan(q) {
      await daftarKab();
      const k = cariKab($w('kabupaten').value);
      const dekat = k ? saringAtauSemua(await anakDari(k.kode), q, (x) => x.nama).map((x) => ({ teks: x.nama, sub: k.nama, isi: { kecamatan: x.nama, kabupaten: k.nama } })) : [];
      let jauh = [];
      if (kecil(q).length >= 3) {
        const r = await dbGet(`wilayah_resmi?select=kode,nama&tingkat=eq.3&nama=ilike.${aman(q)}*&order=nama&limit=12`);
        jauh = r.map((x) => { const kb = kabKode(x.kode); return { teks: x.nama, sub: `${kb.nama}, ${kb.prov}`, isi: { kecamatan: x.nama, kabupaten: kb.nama } }; });
      }
      return unik(dekat.concat(jauh)).slice(0, 60);
    },
    async desa(q) {
      await daftarKab();
      const k = cariKab($w('kabupaten').value);
      const kc = k && (await anakDari(k.kode)).find((x) => kecil(x.nama) === kecil($w('kecamatan').value));
      const dekat = kc ? saringAtauSemua(await anakDari(kc.kode), q, (x) => x.nama)
        .map((x) => ({ teks: x.nama, sub: `Kec. ${kc.nama}, ${k.nama}`, isi: { desa: x.nama, kecamatan: kc.nama, kabupaten: k.nama } })) : [];
      let jauh = [];
      if (kecil(q).length >= 3) {
        const r = await dbGet(`wilayah_resmi?select=kode,nama&tingkat=eq.4&nama=ilike.${aman(q)}*&order=nama&limit=25`);
        const kodeKec = [...new Set(r.map((x) => x.kode.slice(0, 8)))];
        const nk = kodeKec.length ? Object.fromEntries((await dbGet(`wilayah_resmi?select=kode,nama&kode=in.(${kodeKec.join(',')})`)).map((x) => [x.kode, x.nama])) : {};
        jauh = r.map((x) => { const kb = kabKode(x.kode), kcn = nk[x.kode.slice(0, 8)]; return { teks: x.nama, sub: `Kec. ${kcn}, ${kb.nama}`, isi: { desa: x.nama, kecamatan: kcn, kabupaten: kb.nama }, dekat: k && kb.kode === k.kode }; });
        jauh.sort((a, b) => (b.dekat ? 1 : 0) - (a.dekat ? 1 : 0)); // kab/kota yang terisi lebih dulu
      }
      return unik(dekat.concat(jauh)).slice(0, 60);
    },
  };

  // ===== Kotak saran (combobox) =====
  function pasangKotak(id) {
    const inp = $w(id);
    if (!inp || inp.dataset.saran) return;
    inp.dataset.saran = '1';
    const wadah = document.createElement('div'); wadah.className = 'saran-wadah';
    inp.parentNode.insertBefore(wadah, inp); wadah.appendChild(inp);
    const ul = document.createElement('ul');
    ul.className = 'saran-daftar'; ul.id = `saran-${id}`; ul.setAttribute('role', 'listbox'); ul.hidden = true;
    wadah.appendChild(ul);
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', ul.id);
    let item = [], aktif = -1, tunda, nomor = 0;

    const tutup = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); aktif = -1; };
    const tandai = (i) => {
      aktif = i;
      [...ul.children].forEach((li, j) => li.setAttribute('aria-selected', j === i ? 'true' : 'false'));
      if (i >= 0) { inp.setAttribute('aria-activedescendant', ul.children[i].id); ul.children[i].scrollIntoView({ block: 'nearest' }); }
    };
    const pilih = (i) => {
      const x = item[i]; if (!x) return;
      for (const [k, v] of Object.entries(x.isi)) { const el = $w(k); if (el) { el.value = v; el.classList.remove('otomatis'); el.removeAttribute('aria-invalid'); el.dispatchEvent(new Event('change', { bubbles: true })); } }
      tutup();
    };
    const tampilkan = async (fokus = false) => {
      const n = ++nomor;
      fokusBaru = fokus;
      let hasil = [];
      try { hasil = await sumber[id](inp.value); } catch { hasil = []; }
      if (n !== nomor || document.activeElement !== inp) return; // sudah ada ketikan baru / pindah isian
      item = hasil;
      if (!item.length || (item.length === 1 && kecil(item[0].teks) === kecil(inp.value) && !item[0].sub)) return tutup();
      const pas = item.findIndex((x) => kecil(x.teks) === kecil(inp.value));
      ul.innerHTML = item.map((x, i) => `<li role="option" id="${ul.id}-${i}" aria-selected="false"><span>${hurufAman(x.teks)}</span>${x.sub ? `<small>${hurufAman(x.sub)}</small>` : ''}</li>`).join('');
      ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); aktif = -1;
      if (pas >= 0) { ul.children[pas].classList.add('terpilih'); ul.scrollTop = ul.children[pas].offsetTop - 4; }
      // isian setengah lebar (di HP): lebarkan kotak saran tanpa keluar dari kartu
      const kartu = inp.closest('.form-kisi') || inp.closest('.panel');
      const a1 = inp.getBoundingClientRect(), a2 = kartu.getBoundingClientRect();
      const kanan = a1.left - a2.left > a2.width - (a1.right - a2.left);
      ul.style.minWidth = `${Math.min(260, a2.width)}px`;
      ul.style.left = kanan ? 'auto' : '0'; ul.style.right = kanan ? '0' : 'auto';
    };
    const nanti = (fokus) => { clearTimeout(tunda); tunda = setTimeout(() => tampilkan(fokus === true), 200); };

    inp.addEventListener('input', () => nanti(false));
    inp.addEventListener('focus', () => nanti(true));
    inp.addEventListener('blur', () => setTimeout(tutup, 150));
    inp.addEventListener('keydown', (e) => {
      if (ul.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); tandai(Math.min(aktif + 1, item.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); tandai(Math.max(aktif - 1, 0)); }
      else if (e.key === 'Enter' && aktif >= 0) { e.preventDefault(); pilih(aktif); }
      else if (e.key === 'Escape') tutup();
    });
    // Pilih saat diketuk (click), bukan saat jari menyentuh: menggeser daftar di HP tidak memilih (Kang 2026-11-28).
    // mousedown dicegah agar isian tetap fokus (daftar tidak tertutup sebelum ketukan selesai).
    ul.addEventListener('mousedown', (e) => e.preventDefault());
    ul.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pilih([...ul.children].indexOf(li)); });
  }

  // Nama provinsi tampil di bawah Kab/Kota sebagai keterangan (tidak disimpan).
  function provinsi() {
    const el = $w('k-prov'); if (!el) return;
    const k = cariKab($w('kabupaten').value);
    el.textContent = k ? `Provinsi ${k.prov}` : '';
  }

  async function pasang() {
    for (const id of ['tempat-lahir', 'pekerjaan', 'desa', 'kecamatan', 'kabupaten']) pasangKotak(id);
    for (const ev of ['input', 'change']) $w('kabupaten').addEventListener(ev, provinsi);
    await daftarKab();
    provinsi();
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

  return { pasang, betulkan, provinsi };
})();

async function muatWilayah(kecBoleh) {
  const d = await dbGet('desa?select=id,nama,kecamatan(id,nama,kabupaten(nama))&order=nama');
  semuaWilayah = d.filter((x) => !kecBoleh || kecBoleh.has(x.kecamatan.id))
    .map((x) => ({ id: x.id, desa: x.nama, kec: x.kecamatan.nama, kec_id: x.kecamatan.id, kab: x.kecamatan.kabupaten.nama }));
  await Wilayah.pasang().catch(() => {}); // tanpa daftar resmi pun isian tetap bisa diketik
  return Wilayah.provinsi;
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
