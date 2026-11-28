// Dashboard Pengurus: baca saja. Semua angka dihitung di server (rpc dashboard_pengurus) dan mengikuti hak akses (RLS).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
const persen = (n, dari) => dari ? `${(n / dari * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '0,0%';
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TINGKAT = { kabupaten: 'kabupaten/kota', kecamatan: 'kecamatan', desa: 'desa' };

let semuaKab = [], semuaKec = [], semuaDesa = [];
let data = null, bolehUbah = false, semuaSebaran = false, nomorMuat = 0, lihatHadir = false, lihatZiarah = false, lihatKas = false, lihatBantuan = false, lihatAset = false, lihatEkonomi = false, peranSaya = '';
const f = { kab: q.get('kab') || '', kec: q.get('kec') || '', desa: q.get('desa') || '', periode: q.get('periode') || '', dari: q.get('dari') || '', sampai: q.get('sampai') || '' };

const namaKab = (id) => semuaKab.find((k) => String(k.id) === String(id))?.nama || '';
const namaKec = (id) => semuaKec.find((k) => String(k.id) === String(id))?.nama || '';
const namaDesa = (id) => semuaDesa.find((k) => String(k.id) === String(id))?.nama || '';
const akhirBulan = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// Periode → rentang tanggal (null = tanpa batas)
function rentang() {
  const p = f.periode;
  if (/^\d{4}$/.test(p)) return [`${p}-01-01`, `${p}-12-31`];
  if (p === '12') { const d = new Date(); d.setMonth(d.getMonth() - 11, 1); return [d.toISOString().slice(0, 7) + '-01', null]; }
  if (p === 'rentang') return [f.dari ? f.dari + '-01' : null, f.sampai ? akhirBulan(f.sampai) : null];
  return [null, null];
}
function teksPeriode() {
  const p = f.periode;
  if (/^\d{4}$/.test(p)) return `Tahun ${p}`;
  if (p === '12') return '12 bulan terakhir';
  if (p === 'rentang') {
    const b = (ym) => { const [y, m] = ym.split('-'); return `${BULAN[m - 1].slice(0, 3)} ${y}`; };
    return f.dari || f.sampai ? `${f.dari ? b(f.dari) : 'Awal'} – ${f.sampai ? b(f.sampai) : 'sekarang'}` : 'Semua periode';
  }
  return 'Semua periode';
}
function teksWilayah() {
  return [namaKab(f.kab), namaKec(f.kec), namaDesa(f.desa)].filter(Boolean).join(' › ') || 'Semua wilayah';
}

function simpanUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && (k !== 'dari' && k !== 'sampai' || f.periode === 'rentang')) p.set(k, v);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

// ---------- Filter ----------
function pilihan(el, semua, daftar, nilai) {
  el.innerHTML = `<option value="">${semua}</option>` + daftar.map((x) => `<option value="${x.id}">${hurufAman(x.nama)}</option>`).join('');
  el.value = daftar.some((x) => String(x.id) === String(nilai)) ? String(nilai) : '';
}
function isiFilter() {
  pilihan($('f-kab'), 'Semua wilayah', semuaKab, f.kab);
  pilihan($('f-kec'), 'Semua kecamatan', f.kab ? semuaKec.filter((k) => String(k.kabupaten_id) === f.kab) : [], f.kec);
  pilihan($('f-desa'), 'Semua desa', f.kec ? semuaDesa.filter((d) => String(d.kecamatan_id) === f.kec) : [], f.desa);
  $('f-kec').disabled = !f.kab; $('f-desa').disabled = !f.kec;
  $('f-periode').value = f.periode;
  $('f-dari').value = f.dari; $('f-sampai').value = f.sampai;
  for (const el of document.querySelectorAll('.f-rentang')) el.hidden = f.periode !== 'rentang';
  $('filter-ringkas').innerHTML = `<span>${hurufAman(teksWilayah())}</span><span>${hurufAman(teksPeriode())}</span>`;
  const p = new URLSearchParams();
  if (f.kab) p.set('kabupaten', f.kab); if (f.kec) p.set('kecamatan', f.kec); if (f.desa) p.set('desa', f.desa);
  $('ke-data').href = '/jamaah.html' + (p.toString() ? `?${p}` : '');
}
function ubah(baru) { Object.assign(f, baru); semuaSebaran = false; isiFilter(); muat(); }

$('f-kab').onchange = (e) => ubah({ kab: e.target.value, kec: '', desa: '' });
$('f-kec').onchange = (e) => ubah({ kec: e.target.value, desa: '' });
$('f-desa').onchange = (e) => ubah({ desa: e.target.value });
$('f-periode').onchange = (e) => ubah({ periode: e.target.value });
$('f-dari').onchange = (e) => ubah({ dari: e.target.value });
$('f-sampai').onchange = (e) => ubah({ sampai: e.target.value });
const reset = () => ubah({ kab: '', kec: '', desa: '', periode: '', dari: '', sampai: '' });
$('reset').onclick = reset;
$('filter-buka').onclick = () => {
  const buka = $('filter-buka').getAttribute('aria-expanded') !== 'true';
  $('filter-buka').setAttribute('aria-expanded', String(buka));
  $('filter-panel').classList.toggle('terbuka', buka);
};

// ---------- Grafik ----------
// Batang horizontal: baris = { label, n, teks, aksi? }. Lebar diatur lewat JS (CSP tidak mengizinkan style di HTML).
function batang(ol, baris, maks, { warna = '', tombol = false, nomor = false } = {}) {
  ol.innerHTML = baris.map((b, i) => {
    const isi = `<span class="bt-nama">${nomor ? `<span class="bt-no" aria-hidden="true">${i + 1}</span>` : ''}${hurufAman(b.label)}</span>
      <span class="bt-jalur" aria-hidden="true"><span class="bt-isi${b.label === 'Belum diisi' ? ' bt-isi-kosong' : warna}" data-i="${i}"></span></span>
      <span class="bt-nilai">${b.teks.replace(/ \((.+)\)$/, ' <span class="bt-persen">($1)</span>')}</span>`;
    return `<li>${tombol && b.aksi !== false ? `<button type="button" class="bt-baris bt-tombol" data-i="${i}" aria-label="${hurufAman(b.label)}: ${b.teks}${b.petunjuk || ''}">${isi}</button>` : `<div class="bt-baris">${isi}</div>`}</li>`;
  }).join('');
  for (const el of ol.querySelectorAll('.bt-isi')) el.style.width = `${maks ? Math.max(baris[el.dataset.i].n / maks * 100, baris[el.dataset.i].n ? 1.5 : 0) : 0}%`;
}

function gambarSebaran() {
  const s = data.sebaran, total = data.total;
  const turun = data.tingkat === 'kabupaten' ? 'kecamatan' : data.tingkat === 'kecamatan' ? 'desa' : null;
  const tampil = semuaSebaran ? s : s.slice(0, 10);
  batang($('sebaran'), tampil.map((w) => ({
    label: w.nama, n: w.n, teks: `${angka(w.n)} (${persen(w.n, total)})`,
    petunjuk: turun ? `. Ketuk untuk melihat ${turun}` : (String(w.id) === f.desa ? '' : '. Ketuk untuk memilih desa ini'),
    aksi: !(data.tingkat === 'desa' && String(w.id) === f.desa),
  })), s[0]?.n || 0, { tombol: true, nomor: true });
  for (const b of $('sebaran').querySelectorAll('button')) b.onclick = () => {
    const w = tampil[b.dataset.i];
    if (data.tingkat === 'kabupaten') ubah({ kab: String(w.id), kec: '', desa: '' });
    else if (data.tingkat === 'kecamatan') ubah({ kec: String(w.id), desa: '' });
    else ubah({ desa: String(w.id) });
  };
  $('lihat-semua').hidden = s.length <= 10;
  $('lihat-semua').textContent = semuaSebaran ? 'Tampilkan 10 teratas' : `Lihat semua (${angka(s.length)} ${TINGKAT[data.tingkat]})`;
  // Jejak: Semua wilayah › Jombang › Ngoro › Desa
  const langkah = [['Semua wilayah', { kab: '', kec: '', desa: '' }]];
  if (f.kab) langkah.push([namaKab(f.kab), { kec: '', desa: '' }]);
  if (f.kec) langkah.push([namaKec(f.kec), { desa: '' }]);
  if (f.desa) langkah.push([namaDesa(f.desa), {}]);
  $('jejak').innerHTML = langkah.map(([t], i) => i === langkah.length - 1
    ? `<span aria-current="location">${hurufAman(t)}</span>` : `<button type="button" class="tautan" data-i="${i}">${hurufAman(t)}</button><span aria-hidden="true">›</span>`).join('');
  for (const b of $('jejak').querySelectorAll('button')) b.onclick = () => ubah(langkah[b.dataset.i][1]);
}
$('lihat-semua').onclick = () => { semuaSebaran = !semuaSebaran; gambarSebaran(); };

// Kolom tegak (usia, bulan): baris = { label, label2?, n, judul }
function kolom(wadah, baris, { labelAngka = true, labelSetiap = 1 } = {}) {
  const maks = Math.max(...baris.map((b) => b.n), 0);
  wadah.innerHTML = baris.map((b, i) => `<div class="kl" role="listitem">
      <button type="button" class="kl-tombol" data-i="${i}" aria-label="${hurufAman(b.judul)}">
        <span class="kl-batang${b.sorot ? ' kl-sorot' : ''}" data-i="${i}"><span class="kl-nilai${labelAngka || (b.n === maks && maks) ? '' : ' sr-only'}">${angka(b.n)}</span></span>
      </button>
      <span class="kl-label${i % labelSetiap ? ' kl-label-sembunyi' : ''}" aria-hidden="true">${hurufAman(b.label)}${b.label2 ? `<small>${hurufAman(b.label2)}</small>` : ''}</span>
    </div>`).join('');
  for (const el of wadah.querySelectorAll('.kl-batang')) el.style.height = `${maks ? Math.max(baris[el.dataset.i].n / maks * 100, baris[el.dataset.i].n ? 1 : 0) : 0}%`;
}

function gambarUsia() {
  const u = data.usia;
  const kel = [['<30', u.u30], ['30–44', u.u44], ['45–59', u.u59], ['60–69', u.u69], ['≥70', u.u70]];
  kolom($('usia'), kel.map(([l, n], i) => ({ label: l, n, sorot: i >= 3, judul: `Usia ${l} tahun: ${angka(n)} jamaah` })));
  const valid = kel.reduce((a, [, n]) => a + n, 0);
  $('usia-ringkas').textContent = valid ? `${persen(u.u69 + u.u70, valid)} jamaah berusia 60 tahun ke atas saat mendaftar` : 'Belum ada umur yang tercatat.';
  $('usia-kosong').textContent = `Dihitung dari ${angka(valid)} jamaah dengan umur valid. Umur kosong atau tidak valid: ${angka(u.tidak_valid)}.`;
}

function gambarBulan() {
  const ada = new Map(data.bulan.map((b) => [b.b, b.n]));
  const [dari, sampai] = rentang();
  const kini = new Date().toISOString().slice(0, 7);
  let awal = (dari || '').slice(0, 7) || data.bulan[0]?.b;
  let akhir = (sampai || '').slice(0, 7) || (f.periode ? kini : data.bulan.at(-1)?.b);
  if (!awal || !akhir) { $('bulan').innerHTML = ''; return; }
  if (akhir > kini && !f.periode) akhir = kini;
  if (f.periode === 'rentang' && !dari) awal = data.bulan[0]?.b || akhir;
  if (/^\d{4}$/.test(f.periode) && akhir > kini) akhir = kini < awal ? awal : kini;
  const baris = [];
  for (let [y, m] = awal.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= akhir; m === 12 ? (y++, m = 1) : m++) {
    const b = `${y}-${String(m).padStart(2, '0')}`;
    const n = ada.get(b) || 0;
    baris.push({ b, n, label: BULAN[m - 1].slice(0, 3), label2: m === 1 || !baris.length ? String(y) : '', judul: `${BULAN[m - 1]} ${y}: ${angka(n)} pendaftaran` });
  }
  // Lebih dari 3 tahun: dijadikan per tahun agar batang tidak terlalu tipis dan layar HP tidak bergeser
  const perTahun = baris.length > 36;
  if (perTahun) {
    const thn = new Map();
    for (const b of baris) { const y = b.b.slice(0, 4); thn.set(y, (thn.get(y) || 0) + b.n); }
    baris.length = 0;
    for (const [y, n] of thn) baris.push({ b: y, n, label: y, label2: '', judul: `Tahun ${y}: ${angka(n)} pendaftaran` });
  }
  $('g-bulan').textContent = perTahun ? 'Pendaftaran jamaah per tahun' : 'Pendaftaran jamaah per bulan';
  const puncak = Math.max(...baris.map((b) => b.n));
  for (const b of baris) b.sorot = b.n === puncak && puncak > 0;
  const lebar = $('bulan').clientWidth || 300;
  const perKolom = lebar / baris.length;
  const labelSetiap = perKolom >= 30 ? 1 : perKolom >= 14 ? 3 : 6;
  if (labelSetiap > 1 && !perTahun) { // label jarang: tahun hanya pada label pertama yang tampil dan saat tahun berganti
    let thnTerakhir = '';
    baris.forEach((b, i) => {
      const thn = b.b.slice(0, 4);
      b.label2 = i % labelSetiap === 0 && thn !== thnTerakhir ? thn : '';
      if (i % labelSetiap === 0) thnTerakhir = thn;
    });
  }
  // angka di atas setiap batang bila muat (angka 13px, ±8 px per huruf)
  kolom($('bulan'), baris, { labelAngka: perKolom >= angka(puncak).length * 8 + 2, labelSetiap });
  // Tooltip saat diarahkan atau disentuh
  for (const t of $('bulan').querySelectorAll('.kl-tombol')) {
    const tampil = () => {
      const b = baris[t.dataset.i];
      const [y, m] = b.b.split('-');
      $('tip').innerHTML = `<strong>${m ? BULAN[m - 1] + ' ' : 'Tahun '}${y}</strong><br>${angka(b.n)} pendaftaran`;
      $('tip').hidden = false;
      const r = t.getBoundingClientRect(), w = $('bulan').parentElement.getBoundingClientRect();
      const kiri = Math.min(Math.max(r.left - w.left + r.width / 2 - 70, 0), w.width - 140);
      $('tip').style.left = `${kiri}px`;
    };
    t.addEventListener('pointerenter', tampil); t.addEventListener('focus', tampil); t.addEventListener('click', tampil);
    t.addEventListener('pointerleave', () => { $('tip').hidden = true; }); t.addEventListener('blur', () => { $('tip').hidden = true; });
  }
}

function gambarCatatan() {
  const c = data.catatan;
  if (!c.length) { $('catatan').innerHTML = '<li class="dsb-kosong-kecil">Tidak ada catatan pengecekan untuk pilihan ini.</li>'; return; }
  batang($('catatan'), c.map((x) => ({ label: labelCatatan(x.catatan), n: x.n, teks: `${angka(x.n)} (${persen(x.n, data.catatan_total)})`, petunjuk: '. Ketuk untuk melihat daftar anggota' })),
    c[0].n, { warna: ' bt-isi-catatan', tombol: true });
  for (const b of $('catatan').querySelectorAll('button')) b.onclick = () => bukaDaftar(c[b.dataset.i]);
}

// Sektor pekerjaan (11 sektor, aturan di aturan-dashboard.js). Ketuk sektor -> jenis pekerjaan di dalamnya.
function gambarSektor() {
  const sek = new Map(); let kosong = 0;
  for (const { p, n } of data.pekerjaan) {
    const s = sektorPekerjaan(p); if (s === null) { kosong += n; continue; }
    if (!sek.has(s)) sek.set(s, { n: 0, jenis: new Map(), isian: new Map() });
    const x = sek.get(s), k = kelompokPekerjaan(p), t = String(p).trim();
    x.n += n; x.jenis.set(k, (x.jenis.get(k) || 0) + n);
    if (!x.isian.has(k)) x.isian.set(k, new Map());
    x.isian.get(k).set(t, (x.isian.get(k).get(t) || 0) + n);
  }
  const urut = [...sek].sort((a, b) => (a[0] === 'Tidak dikenali') - (b[0] === 'Tidak dikenali') || b[1].n - a[1].n);
  const baris = urut.map(([label, x]) => ({ label, n: x.n, petunjuk: '. Ketuk untuk melihat jenis pekerjaannya' }));
  if (kosong) baris.push({ label: 'Belum diisi', n: kosong, aksi: false });
  for (const b of baris) b.teks = `${angka(b.n)} (${persen(b.n, data.total)})`;
  batang($('sektor'), baris, Math.max(...baris.map((b) => b.n), 0), { tombol: true });
  for (const b of $('sektor').querySelectorAll('button')) b.onclick = () => {
    const [nama, x] = urut[b.dataset.i];
    bukaRincianPekerjaan(nama, [...x.jenis].sort((a, c) => c[1] - a[1]), x.n, x.isian);
  };
}

function gambarPekerjaan() {
  const kel = new Map(), isian = new Map(); let kosong = 0;
  for (const { p, n } of data.pekerjaan) {
    const k = kelompokPekerjaan(p); if (k === null) { kosong += n; continue; }
    kel.set(k, (kel.get(k) || 0) + n);
    const t = String(p).trim(); if (!isian.has(k)) isian.set(k, new Map());
    isian.get(k).set(t, (isian.get(k).get(t) || 0) + n);
  }
  const urut = [...kel].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'id'));
  const lima = urut.slice(0, 5), sisa = urut.slice(5), lainnya = sisa.reduce((a, [, n]) => a + n, 0);
  const baris = lima.map(([label, n]) => ({ label, n, aksi: false }));
  if (lainnya) baris.push({ label: `Lainnya (${angka(sisa.length)} kelompok)`, n: lainnya, petunjuk: '. Ketuk untuk melihat rinciannya' });
  if (kosong) baris.push({ label: 'Belum diisi', n: kosong, aksi: false });
  for (const b of baris) b.teks = `${angka(b.n)} (${persen(b.n, data.total)})`;
  batang($('pekerjaan'), baris, Math.max(...baris.map((b) => b.n)), { tombol: true });
  for (const b of $('pekerjaan').querySelectorAll('button')) b.onclick = () => bukaRincianPekerjaan('Pekerjaan lainnya', sisa, lainnya, isian);
}

// Rincian pekerjaan ("Lainnya" atau satu sektor): jenis pekerjaan + jumlah (dari data yang sudah dimuat, tanpa permintaan baru)
function bukaRincianPekerjaan(judul, sisa, jumlah, isian) {
  $('daftar-judul').textContent = judul;
  $('daftar-ket').textContent = `${angka(sisa.length)} jenis pekerjaan · ${angka(jumlah)} jamaah · ${teksWilayah()} · ${teksPeriode()}`;
  $('daftar-isi').innerHTML = sisa.map(([k, n]) => {
    const v = [...(isian.get(k) || [])].filter(([t]) => rapikanTeks(t) !== rapikanTeks(k));
    return `<li class="dd-baris"><span class="dd-nama">${hurufAman(k)}</span><span class="bt-nilai">${angka(n)} <span class="bt-persen">(${persen(n, data.total)})</span></span>${
      v.length ? `<span class="dd-alamat">Tertulis: ${v.sort((a, b) => b[1] - a[1]).map(([t, m]) => `${hurufAman(t)} (${angka(m)})`).join(', ')}</span>` : ''}</li>`;
  }).join('');
  $('daftar').showModal();
}

function gambarJk() {
  const j = data.jk || { l: 0, p: 0, kosong: data.total };
  const bagian = [['Laki-laki', j.l, 'jk-l'], ['Perempuan', j.p, 'jk-p'], ['Belum diisi', j.kosong, 'jk-k']].filter((b) => b[1] || b[2] !== 'jk-k');
  $('jk-legenda').innerHTML = bagian.map(([t, n, k]) => `<li><span class="jk-kotak ${k}" aria-hidden="true"></span><span class="jk-teks">${t}</span>
    <span class="bt-nilai">${angka(n)} <span class="bt-persen">(${persen(n, data.total)})</span></span></li>`).join('');
  $('jk-batang').innerHTML = bagian.filter((b) => b[1]).map(([, n, k]) => `<span class="${k}" data-n="${n}"></span>`).join('');
  for (const el of $('jk-batang').children) el.style.flexGrow = el.dataset.n;
  $('g-jk').textContent = data.jk_tebakan ? 'Jenis kelamin · perkiraan' : 'Jenis kelamin';
  const ket = [];
  if (data.jk_tebakan) ket.push(`${angka(data.jk_tebakan)} di antaranya ditebak dari nama (data lama).`);
  if (j.kosong) ket.push(`${angka(j.kosong)} belum diisi.`);
  $('jk-ket').textContent = ket.join(' ');
  $('jk-lengkapi').hidden = !(j.kosong && bolehUbah);
}

// ---------- Daftar anggota untuk satu catatan ----------
async function bukaDaftar(c) {
  const d = $('daftar');
  $('daftar-judul').textContent = labelCatatan(c.catatan);
  $('daftar-ket').textContent = `Catatan asli: "${c.catatan}" · ${angka(c.n)} anggota · ${teksWilayah()} · ${teksPeriode()}`;
  $('daftar-isi').innerHTML = '<li class="dsb-kosong-kecil">Memuat...</li>';
  d.showModal();
  try {
    const [dari, sampai] = rentang();
    const rows = await dbKirim('POST', 'rpc/dashboard_catatan_daftar', {
      p_catatan: c.catatan, p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null, p_dari: dari, p_sampai: sampai });
    if (bolehUbah) $('daftar-ket').textContent += '. Perbaiki lewat data jamaahnya (catatan selesai otomatis setelah disimpan), atau tekan "Sudah benar" bila datanya sudah tepat.';
    $('daftar-isi').innerHTML = rows.length ? rows.map((r) => `<li class="dd-baris-cek"><a href="/jamaah-isi.html?id=${r.id}">
        <span class="dd-nama">${hurufAman(r.nama)}</span>
        <span class="dd-nomor">${r.nomor_anggota}</span>
        <span class="dd-alamat">${hurufAman(`${r.desa} · Kec. ${r.kecamatan} · ${r.kabupaten}`)}</span>
        <span class="dd-catatan">${hurufAman(r.catatan)}</span></a>${bolehUbah ? `<button type="button" class="pin-tombol dd-benar" data-benar="${r.id}">Sudah benar</button>` : ''}</li>`).join('')
      : '<li class="dsb-kosong-kecil">Tidak ada catatan yang perlu diperiksa di pilihan ini.</li>';
  } catch {
    $('daftar-isi').innerHTML = '<li class="dsb-kosong-kecil">Data gagal dimuat. Tutup lalu coba lagi.</li>';
  }
}
$('daftar-tutup').onclick = () => $('daftar').close();
// Tombol "Sudah benar": catatan ditandai selesai (tidak dihapus); angka Dashboard dimuat ulang saat jendela ditutup.
let catatanBerubah = false;
$('daftar-isi').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-benar]');
  if (!b) return;
  b.disabled = true; b.textContent = 'Menyimpan...';
  try {
    await dbKirim('POST', 'rpc/catatan_selesai', { p_jamaah: Number(b.dataset.benar) });
    catatanBerubah = true;
    const li = b.closest('li'); li.remove();
    if (!$('daftar-isi').children.length) $('daftar-isi').innerHTML = '<li class="dsb-kosong-kecil">Semua catatan di daftar ini sudah selesai.</li>';
  } catch {
    b.disabled = false; b.textContent = 'Gagal, coba lagi';
  }
});
$('daftar').addEventListener('close', () => { if (catatanBerubah) { catatanBerubah = false; muat(); } });
$('daftar').addEventListener('click', (e) => { if (e.target === $('daftar')) $('daftar').close(); });

// ---------- Muat ----------
function keadaan(teks, tombol, aksi) {
  $('keadaan').hidden = !teks; $('isi').hidden = !!teks;
  if (!teks) return;
  $('keadaan-teks').textContent = teks; $('keadaan-tombol').textContent = tombol; $('keadaan-tombol').onclick = aksi;
}

// Kehadiran kegiatan (rpc dashboard_kehadiran, ikut RLS): wilayah = asal jamaah, periode = tanggal kegiatan.
async function muatHadir(ini, dari, sampai) {
  if (!lihatHadir) return;
  try {
    const h = await dbKirim('POST', 'rpc/dashboard_kehadiran', { p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null, p_dari: dari, p_sampai: sampai });
    if (ini !== nomorMuat) return;
    $('hadir-ket').textContent = `${teksWilayah()} · ${teksPeriode()}. Jamaah dihitung sekali walau hadir berkali-kali; kegiatan dibatalkan tidak dihitung.`;
    $('hadir-keg').textContent = angka(h.kegiatan); $('hadir-total').textContent = angka(h.hadir); $('hadir-orang').textContent = angka(h.orang);
    const maks = Math.max(...h.jenis.map((j) => j.hadir), 0);
    batang($('hadir-jenis'), h.jenis.map((j) => ({ label: JENIS_KEGIATAN[j.jenis] || j.jenis, n: j.hadir, teks: `${angka(j.hadir)} hadir · ${angka(j.kegiatan)} keg.` })), maks);
    if (!h.jenis.length) $('hadir-jenis').innerHTML = '<li class="dsb-ket">Belum ada kegiatan di periode ini.</li>';
    $('hadir-teratas').innerHTML = h.teratas.length ? h.teratas.map((t) => `<li><a href="/kegiatan-isi.html?id=${t.id}"><span>${hurufAman(t.nama)}<small>${tglWib(t.mulai, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><strong>${angka(t.hadir)}</strong></a></li>`).join('')
      : '<li class="dsb-ket">Belum ada kehadiran tercatat.</li>';
    $('p-hadir').hidden = false;
  } catch { if (ini === nomorMuat) $('p-hadir').hidden = true; }
}

// Anggota per mursyid (fungsi dashboard_mursyid, migrasi 20261127010000). Panel tersembunyi bila gagal/belum ada.
async function muatMursyid(ini, dari, sampai) {
  try {
    const m = await dbKirim('POST', 'rpc/dashboard_mursyid', { p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null, p_dari: dari, p_sampai: sampai });
    if (ini !== nomorMuat) return;
    const jumlah = m.reduce((a, x) => a + x.n, 0);
    const urut = [...m.filter((x) => x.id !== null), ...m.filter((x) => x.id === null)];
    const baris = urut.map((x) => ({ label: x.id === null ? 'Belum diisi' : x.nama, n: x.n, teks: `${angka(x.n)} (${persen(x.n, jumlah)})`, petunjuk: '. Ketuk untuk membuka daftarnya di Data Jamaah' }));
    batang($('mursyid'), baris, Math.max(...m.map((x) => x.n), 0), { tombol: true });
    if (!baris.length) $('mursyid').innerHTML = '<li class="dsb-ket">Belum ada data.</li>';
    for (const b of $('mursyid').querySelectorAll('button')) b.onclick = () => {
      const x = urut[b.dataset.i], p = new URLSearchParams();
      if (f.kab) p.set('kabupaten', f.kab); if (f.kec) p.set('kecamatan', f.kec); if (f.desa) p.set('desa', f.desa);
      p.set('mursyid', x.id === null ? 'kosong' : x.id);
      location.assign(`/jamaah.html?${p}`);
    };
    $('p-mursyid').hidden = false;
  } catch { if (ini === nomorMuat) $('p-mursyid').hidden = true; }
}

// Ziarah & Umroh (rpc dashboard_perjalanan, migrasi 20261127030000, ikut RLS): wilayah = asal peserta, periode = tanggal berangkat.
// Panel hanya untuk peran yang melihat peserta; tersembunyi bila gagal / migrasi belum dijalankan.
async function muatZiarah(ini, dari, sampai) {
  if (!lihatZiarah) return;
  try {
    const z = await dbKirim('POST', 'rpc/dashboard_perjalanan', { p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null, p_dari: dari, p_sampai: sampai });
    if (ini !== nomorMuat) return;
    $('zr-ket').textContent = `${teksWilayah()} · ${teksPeriode()}. Wilayah = asal peserta; perjalanan dibatalkan dan peserta batal ikut tidak dihitung.`;
    $('zr-perjalanan').textContent = angka(z.perjalanan);
    $('zr-peserta').textContent = angka(z.peserta);
    $('zr-lunas').textContent = z.peserta ? `${angka(z.lunas)} (${persen(z.lunas, z.peserta)})` : '0';
    batang($('zr-jenis'), z.jenis.map((j) => ({ label: JENIS_PERJALANAN[j.jenis] || j.jenis, n: j.peserta,
      teks: `${angka(j.peserta)} peserta · ${angka(j.perjalanan)} perj.` })), Math.max(...z.jenis.map((j) => j.peserta), 0));
    if (!z.jenis.length) $('zr-jenis').innerHTML = '<li class="dsb-ket">Belum ada perjalanan di periode ini.</li>';
    $('zr-terbaru').innerHTML = z.terbaru.length ? z.terbaru.map((t) => `<li><a href="/perjalanan-isi.html?id=${t.id}"><span>${hurufAman(t.nama)}<small>${tglWib(t.berangkat, { day: 'numeric', month: 'short', year: 'numeric' })} · ${angka(t.lunas)} lunas${t.kuota ? ` · kuota ${angka(t.kuota)}` : ''}</small></span><strong>${angka(t.peserta)}</strong></a></li>`).join('')
      : '<li class="dsb-ket">Belum ada perjalanan.</li>';
    $('p-ziarah').hidden = false;
  } catch { if (ini === nomorMuat) $('p-ziarah').hidden = true; }
}

// Daftar ulang KTA lama (rpc dashboard_daftar_ulang, ikut RLS): semua peran Dashboard. Ikut saringan wilayah, tidak ikut periode.
async function muatDaftarUlang(ini) {
  try {
    const d = await dbKirim('POST', 'rpc/dashboard_daftar_ulang', { p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null });
    if (ini !== nomorMuat) return;
    $('du-ket').textContent = `${teksWilayah()} · semua waktu. Jamaah pemegang KTA lama yang datanya belum ada lalu didaftarkan dengan nomor kartunya.`;
    $('du-ulang').textContent = angka(d.daftar_ulang);
    $('du-impor').textContent = angka(d.impor);
    $('du-baru').textContent = angka(d.baru);
    $('du-judul').textContent = `Daftar ulang per ${TINGKAT[d.tingkat]}`;
    batang($('du-sebaran'), d.sebaran.map((w) => ({ label: w.nama, n: w.n, teks: angka(w.n) })), d.sebaran[0]?.n || 0, { nomor: true });
    if (!d.sebaran.length) $('du-sebaran').innerHTML = '<li class="dsb-ket">Belum ada jamaah daftar ulang di pilihan ini.</li>';
    const q = new URLSearchParams({ asal: 'daftar_ulang' });
    if (f.kab) q.set('kabupaten', f.kab); if (f.kec) q.set('kecamatan', f.kec); if (f.desa) q.set('desa', f.desa);
    $('du-daftar').href = `/jamaah.html?${q}`;
    $('du-daftar').hidden = !d.daftar_ulang;
    $('p-daftar-ulang').hidden = false;
  } catch { if (ini === nomorMuat) $('p-daftar-ulang').hidden = true; }
}

// Keuangan (rpc saldo_kas + laporan_kas kas utama tahun ini). Tidak ikut saringan wilayah/periode: angka kas apa adanya.
// Kas utama = Kas Pusat bila terlihat, selain itu kas pertama (koordinator: kas kecamatannya). Bisyaroh ikut aturan database.
// Bantuan Sosial (rpc ringkas_bantuan, tanpa nama): admin pusat, ketua, bendahara semua; koordinator wilayahnya (database).
// Saringan wilayah sampai kecamatan (bukan desa); periode = tanggal diajukan.
async function muatBantuanDsb(ini, dari, sampai) {
  if (!lihatBantuan) return;
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_bantuan', { p_kab: f.kab ? Number(f.kab) : null, p_kec: f.kec ? Number(f.kec) : null, p_dari: dari, p_sampai: sampai });
    if (ini !== nomorMuat) return;
    $('bs-ket').textContent = `${teksWilayah()}${f.desa ? ' (dihitung sampai kecamatan)' : ''} · ${teksPeriode()} (tanggal diajukan). Tanpa nama penerima.`;
    $('bs-salur').textContent = angka(r.disalurkan);
    $('bs-penerima').textContent = angka(r.penerima);
    $('bs-nilai').textContent = rupiah(r.nilai_uang);
    batang($('bs-jenis'), r.jenis.map((j) => ({ label: JENIS_BANTUAN[j.jenis] || j.jenis, n: j.n, teks: `${angka(j.n)} · ${rupiah(j.nilai)}` })), Math.max(...r.jenis.map((j) => j.n), 0));
    if (!r.jenis.length) $('bs-jenis').innerHTML = '<li class="dsb-ket">Belum ada bantuan disalurkan di periode ini.</li>';
    const ke = PERAN_BANTUAN.includes(peranSaya);
    const baris = (n, label, st) => `<li>${ke ? `<a href="/bantuan.html?status=${st}">` : '<div class="bs-baris">'}<span>${label}</span><strong>${angka(n)}</strong>${ke ? '</a>' : '</div>'}</li>`;
    $('bs-proses').innerHTML = baris(r.diajukan, 'Menunggu persetujuan ketua', 'diajukan') + baris(r.disetujui, 'Disetujui, belum disalurkan', 'disetujui')
      + baris(r.ditolak, 'Ditolak', 'ditolak') + (r.nilai_barang ? `<li class="dsb-ket">Perkiraan nilai barang disalurkan: ${rupiah(r.nilai_barang)}</li>` : '');
    $('p-bantuan').hidden = false;
  } catch { if (ini === nomorMuat) $('p-bantuan').hidden = true; }
}

// Kondisi ekonomi (rpc ringkas_ekonomi, tanpa nama): admin pusat, ketua, bendahara semua; koordinator wilayahnya (database).
// Ikut saringan wilayah (sampai desa); tidak ikut periode: keadaan jamaah aktif saat ini.
async function muatEkonomiDsb(ini) {
  if (!lihatEkonomi) return;
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_ekonomi', { p_kab: f.kab ? Number(f.kab) : null, p_kec: f.kec ? Number(f.kec) : null, p_desa: f.desa ? Number(f.desa) : null });
    if (ini !== nomorMuat) return;
    const kurang = Number(r.kurang) + Number(r.sangat_kurang);
    $('ek-ket').textContent = `${teksWilayah()} · jamaah aktif saat ini (tidak ikut periode). Tanpa nama.`;
    $('ek-jamaah').textContent = angka(r.jamaah);
    $('ek-didata').textContent = r.jamaah ? `${angka(r.didata)} (${persen(r.didata, r.jamaah)})` : '0';
    $('ek-kurang').textContent = angka(kurang);
    const t = ['sangat_kurang', 'kurang', 'cukup', 'mampu'].map((k) => ({ label: TINGKAT_EKONOMI[k][0], n: Number(r[k] || 0) }));
    batang($('ek-tingkat'), t.map((x) => ({ ...x, teks: r.didata ? `${angka(x.n)} (${persen(x.n, r.didata)})` : angka(x.n) })), Math.max(...t.map((x) => x.n), 0));
    if (!Number(r.didata)) $('ek-tingkat').innerHTML = '<li class="dsb-ket">Belum ada jamaah yang didata.</li>';
    const ke = PERAN_EKONOMI.includes(peranSaya);
    const baris = (n, label, url) => `<li>${ke ? `<a href="${url}">` : '<div class="bs-baris">'}<span>${label}</span><strong>${angka(n)}</strong>${ke ? '</a>' : '</div>'}</li>`;
    $('ek-perhatian').innerHTML = baris(r.kurang_belum_dibantu, 'Kurang mampu, belum pernah dibantu', '/ekonomi.html?dibantu=belum')
      + baris(r.belum, 'Belum didata', '/ekonomi.html?tingkat=belum')
      + (r.rata_tanggungan != null ? `<li class="dsb-ket">Rata-rata tanggungan: ${Number(r.rata_tanggungan).toLocaleString('id-ID')} orang</li>` : '');
    $('p-ekonomi').hidden = false;
  } catch { if (ini === nomorMuat) $('p-ekonomi').hidden = true; }
}

// Usaha jamaah (rpc ringkas_usaha; semua yang login). Ikut saringan wilayah sampai kecamatan (lokasi usaha).
async function muatUsahaDsb(ini) {
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_usaha', { p_kab: f.kab ? Number(f.kab) : null, p_kec: f.kec ? Number(f.kec) : null });
    if (ini !== nomorMuat) return;
    $('us-ket').textContent = `${teksWilayah()}${f.desa ? ' (dihitung sampai kecamatan)' : ''} · lokasi usaha, keadaan saat ini.`;
    $('us-buka').textContent = angka(r.buka);
    $('us-pemilik').textContent = angka(r.pemilik);
    $('us-tutup').textContent = angka(r.tutup);
    const j = Object.entries(r.jenis || {}).map(([k, n]) => ({ label: JENIS_USAHA[k] || k, n: Number(n) })).sort((a, b) => b.n - a.n);
    batang($('us-jenis'), j.map((x) => ({ ...x, teks: angka(x.n) })), Math.max(...j.map((x) => x.n), 0));
    if (!j.length) $('us-jenis').innerHTML = '<li class="dsb-ket">Belum ada usaha jamaah yang dicatat.</li>';
    $('p-usaha').hidden = false;
  } catch { if (ini === nomorMuat) $('p-usaha').hidden = true; }
}

// Kesehatan (rpc ringkas_kesehatan, tanpa nama): admin pusat, ketua, koordinator wilayahnya. Wilayah sampai kecamatan;
// tidak ikut periode (keadaan saat ini + 30 hari terakhir).
async function muatKesehatanDsb(ini) {
  if (!['admin_pusat', ...PERAN_KESEHATAN].includes(peranSaya)) return;
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_kesehatan', { p_kab: f.kab ? Number(f.kab) : null, p_kec: f.kec ? Number(f.kec) : null });
    if (ini !== nomorMuat) return;
    $('ks-ket').textContent = `${teksWilayah()}${f.desa ? ' (dihitung sampai kecamatan)' : ''} · keadaan saat ini, tidak ikut periode. Tanpa nama.`;
    $('ks-sakit').textContent = angka(r.sakit);
    $('ks-inap').textContent = angka(r.rawat_inap);
    $('ks-berat').textContent = angka(r.berat);
    const ke = PERAN_KESEHATAN.includes(peranSaya);
    const baris = (n, label, url) => `<li>${ke && url ? `<a href="${url}">` : '<div class="bs-baris">'}<span>${label}</span><strong>${angka(n)}</strong>${ke && url ? '</a>' : '</div>'}</li>`;
    $('ks-perhatian').innerHTML = baris(r.belum_dijenguk, 'Sedang sakit, belum dijenguk', '/sakit.html')
      + baris(r.kunjungan_30, 'Kunjungan 30 hari terakhir') + baris(r.sembuh_30, 'Sembuh 30 hari terakhir');
    const k = Object.entries(r.per_kebutuhan || {}).map(([x, n]) => ({ label: KEBUTUHAN_KHUSUS[x] || x, n: Number(n) })).sort((a, b) => b.n - a.n);
    batang($('ks-kebutuhan'), k.map((x) => ({ ...x, teks: angka(x.n) })), Math.max(...k.map((x) => x.n), 0));
    if (!k.length) $('ks-kebutuhan').innerHTML = '<li class="dsb-ket">Belum ada kebutuhan khusus yang dicatat.</li>';
    $('p-kesehatan').hidden = false;
  } catch { if (ini === nomorMuat) $('p-kesehatan').hidden = true; }
}

async function muatKas() {
  if (!lihatKas) return;
  try {
    const kas = await dbKirim('POST', 'rpc/saldo_kas', {});
    if (!kas.length) return;
    const utama = kas.find((k) => k.kecamatan_id === null) || kas[0];
    const kini = hariIniWib(), b = kini.slice(0, 7);
    const lap = await dbKirim('POST', 'rpc/laporan_kas', { p_kas_id: utama.kas_id, p_tahun: Number(kini.slice(0, 4)) });
    const bln = lap.bulan.find((x) => x.b === b) || { masuk: 0, keluar: 0 };
    const namaB = new Date(kini + 'T12:00:00+07:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: ZONA });
    $('kas-ket').textContent = `Angka kas saat ini, tidak ikut saringan di atas. Masuk/keluar: ${utama.nama}, ${namaB}. Transaksi dibatalkan tidak dihitung.`;
    $('kas-saldo').textContent = rupiah(kas.reduce((a, k) => a + Number(k.saldo), 0));
    $('kas-masuk').textContent = rupiah(bln.masuk);
    $('kas-keluar').textContent = rupiah(bln.keluar);
    $('kas-daftar').innerHTML = kas.slice().sort((x, y) => (x.kecamatan_id === null ? -1 : y.kecamatan_id === null ? 1 : Number(y.saldo) - Number(x.saldo))).slice(0, 8)
      .map((k) => `<li><a href="/kas.html?kas=${k.kas_id}"><span>${hurufAman(k.nama)}<small>masuk ${rupiah(k.masuk)} · keluar ${rupiah(k.keluar)}</small></span><strong>${rupiah(k.saldo)}</strong></a></li>`).join('');
    const kat = (lap.per_bulan_kategori || []).filter((x) => x.b === b && x.arah === 'keluar');
    const maks = Math.max(...kat.map((x) => Number(x.jumlah)), 0);
    batang($('kas-kat'), kat.map((x) => ({ label: x.nama, n: Number(x.jumlah), teks: rupiah(x.jumlah) })), maks);
    if (!kat.length) $('kas-kat').innerHTML = '<li class="dsb-ket">Belum ada pengeluaran bulan ini.</li>';
    $('p-kas').hidden = false;
  } catch { $('p-kas').hidden = true; }
}

// Aset & Wakaf (rpc ringkas_aset): admin pusat, ketua, bendahara. Tidak ikut saringan wilayah/periode.
async function muatAset() {
  if (!lihatAset) return;
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_aset', {});
    const t = r.tanah, b = r.barang;
    $('as-tanah').textContent = angka(t.jumlah);
    $('as-luas').textContent = luasTeks(t.luas_m2);
    $('as-barang').textContent = angka(b.jenis);
    $('as-nilai').textContent = b.nilai ? `Perkiraan nilai barang: ${rupiah(b.nilai)} (${angka(b.unit)} unit).` : '';
    const ser = Object.keys(SERTIFIKAT_WAKAF).map((k) => ({ label: SERTIFIKAT_WAKAF[k], n: Number(r.per_sertifikat[k] || 0) })).filter((x) => x.n);
    batang($('as-sertifikat'), ser.map((x) => ({ ...x, teks: angka(x.n) })), Math.max(...ser.map((x) => x.n), 0));
    if (!ser.length) $('as-sertifikat').innerHTML = '<li class="dsb-ket">Belum ada tanah wakaf yang dicatat.</li>';
    const kon = Object.keys(KONDISI_ASET).map((k) => ({ label: KONDISI_ASET[k], n: Number(r.per_kondisi[k] || 0) })).filter((x) => x.n);
    batang($('as-kondisi'), kon.map((x) => ({ ...x, teks: `${angka(x.n)} jenis` })), Math.max(...kon.map((x) => x.n), 0));
    if (!kon.length) $('as-kondisi').innerHTML = '<li class="dsb-ket">Belum ada barang yang dicatat.</li>';
    $('p-aset').hidden = false;
  } catch { $('p-aset').hidden = true; }
}

async function muat() {
  simpanUrl();
  const ini = ++nomorMuat;
  $('isi').setAttribute('aria-busy', 'true'); $('isi').classList.add('memuat');
  try {
    const [dari, sampai] = rentang();
    muatHadir(ini, dari, sampai);
    muatMursyid(ini, dari, sampai);
    muatZiarah(ini, dari, sampai);
    muatDaftarUlang(ini);
    muatBantuanDsb(ini, dari, sampai);
    muatEkonomiDsb(ini);
    muatUsahaDsb(ini);
    muatKesehatanDsb(ini);
    const hasil = await dbKirim('POST', 'rpc/dashboard_pengurus', {
      p_kab: f.kab || null, p_kec: f.kec || null, p_desa: f.desa || null, p_dari: dari, p_sampai: sampai });
    if (ini !== nomorMuat) return;
    data = hasil;
    isiPeriode(data.rentang);
    if (!data.total) { keadaan('Belum ada data untuk pilihan ini.', 'Hapus semua saringan', reset); return; }
    keadaan('');
    $('k-total').textContent = angka(data.total);
    $('k-kab').textContent = angka(data.kabupaten);
    $('k-catatan').textContent = angka(data.catatan_total);
    $('k-total-sub').textContent = `${teksWilayah()} · ${teksPeriode()}`;
    $('k-kab-sub').textContent = data.tingkat === 'kabupaten' ? 'Dari alamat jamaah' : `${angka(data.sebaran.length)} ${TINGKAT[data.tingkat]} di pilihan ini`;
    $('k-catatan-sub').textContent = `${persen(data.catatan_total, data.total)} dari jamaah terdaftar`;
    gambarSebaran(); gambarUsia(); gambarJk(); gambarBulan(); gambarCatatan(); gambarSektor(); // panel Komposisi pekerjaan dihapus dari tampilan (Kang 2026-11-28)
  } catch (e) {
    if (ini !== nomorMuat) return;
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    keadaan('Data gagal dimuat.', 'Coba lagi', muat);
  } finally {
    if (ini === nomorMuat) { $('isi').setAttribute('aria-busy', 'false'); $('isi').classList.remove('memuat'); }
  }
}

let periodeSiap = false;
function isiPeriode(r) {
  if (periodeSiap || !r?.awal) return;
  periodeSiap = true;
  const y0 = Number(r.awal.slice(0, 4)), y1 = Math.max(Number(r.akhir.slice(0, 4)), new Date().getFullYear());
  let html = '<option value="">Semua periode</option><option value="12">12 bulan terakhir</option>';
  for (let y = y1; y >= y0; y--) html += `<option value="${y}">Tahun ${y}</option>`;
  $('f-periode').innerHTML = html + '<option value="rentang">Pilih rentang bulan…</option>';
  $('f-periode').value = f.periode;
  $('f-dari').min = $('f-sampai').min = r.awal.slice(0, 7);
}

let ubahUkuran;
addEventListener('resize', () => { clearTimeout(ubahUkuran); ubahUkuran = setTimeout(() => { if (data?.total) gambarBulan(); }, 200); });
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    bolehUbah = PERAN_UBAH_JAMAAH.includes(p.peran);
    lihatHadir = PERAN_ABSEN.includes(p.peran); // bendahara tidak melihat kehadiran
    lihatZiarah = PERAN_PESERTA.includes(p.peran); // petugas scan tidak melihat peserta perjalanan
    lihatKas = PERAN_LIHAT_KAS.includes(p.peran);
    lihatAset = PERAN_LIHAT_ASET.includes(p.peran);
    lihatBantuan = ['admin_pusat', ...PERAN_BANTUAN].includes(p.peran); peranSaya = p.peran;
    lihatEkonomi = lihatBantuan; // admin pusat: angka saja (tanpa nama, tanpa tautan daftar)
    [semuaKab, semuaKec, semuaDesa] = await Promise.all([
      dbGet('kabupaten?select=id,nama&order=nama'),
      dbGet('kecamatan?select=id,nama,kabupaten_id&order=nama'),
      dbGet('desa?select=id,nama,kecamatan_id&order=nama'),
    ]);
    if (f.periode === 'rentang' || /^\d{4}$|^12$/.test(f.periode)) $('f-periode').innerHTML += `<option value="${hurufAman(f.periode)}"></option>`;
    isiFilter();
    muat();
    muatKas();
    muatAset();
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    keadaan('Data gagal dimuat.', 'Coba lagi', () => location.reload());
  }
})();
