// Rincian, tambah, ubah, dan batalkan satu perjalanan Ziarah/Umroh. Hak ubah dijaga RLS (koordinator hanya kecamatannya).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, peran = '', kecBoleh = null, ringkas = null;

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan'; };
const PILIH = 'id,jenis,nama,tujuan,berangkat,pulang,tempat_kumpul,kuota,kecamatan_id,publik,dibatalkan,keterangan,kecamatan(nama,kabupaten(nama))';
const tglIsian = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA });
const tglPanjang = (ymd) => new Date(ymd + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const tambahHari = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');

// Jam kumpul 24 jam sendiri (bukan input time bawaan HP yang bisa tampil AM/PM). Menit kelipatan 5.
const dua = (n) => String(n).padStart(2, '0');
$('jam').innerHTML = '<option value="">Jam</option>' + Array.from({ length: 24 }, (_, i) => `<option>${dua(i)}</option>`).join('');
$('menit').innerHTML = Array.from({ length: 12 }, (_, i) => `<option>${dua(i * 5)}</option>`).join('');
function aturJam(hhmm) {
  const [h, m] = hhmm ? hhmm.split(':') : ['', '00'];
  if (m && ![...$('menit').options].some((o) => o.value === m)) $('menit').add(new Option(m, m));
  $('jam').value = h; $('menit').value = m || '00';
}
const bolehUbah = (k) => PERAN_KELOLA_PERJALANAN.includes(peran) && (!kecBoleh || (k.kecamatan_id && kecBoleh.has(k.kecamatan_id)));

// Angka ringkas peserta (hanya peran yang berhak melihat peserta). Koordinator di perjalanan pusat hanya melihat kecamatannya.
function gambarAngka() {
  const k = data, r = ringkas, sebagian = kecBoleh && !k.kecamatan_id;
  $('l-angka').hidden = !r;
  if (!r) return;
  const kotak = (n, label, sub) => `<li><strong>${n}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</li>`;
  $('l-angka').innerHTML = kotak(angka(r.peserta), sebagian ? 'Peserta dari kecamatan Anda' : 'Peserta', r.peserta ? `${angka(r.jamaah)} jamaah · ${angka(r.keluarga)} keluarga` : '')
    + kotak(angka(r.lunas), 'Lunas') + kotak(angka(r.peserta - r.lunas), 'Belum lunas')
    + (sebagian ? '' : k.kuota ? kotak(angka(Math.max(k.kuota - r.peserta, 0)), 'Sisa kuota', `dari ${angka(k.kuota)} orang`) : kotak('–', 'Sisa kuota', 'Kuota tanpa batas'));
}

function tampilLihat() {
  const k = data, [teks, kelas] = statusPerjalanan(k);
  document.title = `${k.nama} · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = JENIS_PERJALANAN[k.jenis] || k.jenis;
  $('l-nama').textContent = k.nama;
  $('l-status').textContent = teks;
  $('l-status').className = `stat ${kelas}`;
  gambarAngka();
  $('l-rincian').innerHTML = [
    ['Berangkat', `${tglWib(k.berangkat)}, kumpul ${jamWib(k.berangkat)} WIB`],
    ['Pulang', k.pulang && k.pulang !== tglIsian(k.berangkat) ? tglPanjang(k.pulang) : 'Hari yang sama'],
    ['Tujuan', k.tujuan],
    ['Tempat kumpul', k.tempat_kumpul],
    ['Wilayah', k.kecamatan ? `Kec. ${k.kecamatan.nama}, ${k.kecamatan.kabupaten?.nama || ''}` : 'Pusat Cukir'],
    ['Kuota', k.kuota ? `${angka(k.kuota)} orang` : 'Tanpa batas'],
    ['Tampil untuk anggota', k.publik ? 'Ya' : 'Pengurus saja'],
    ['Keterangan', k.keterangan],
  ].filter(([, v]) => v).map(([a, v]) => `<div><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  const boleh = bolehUbah(k);
  $('ubah').hidden = !boleh || k.dibatalkan;
  $('batalkan').hidden = !boleh;
  $('batalkan').textContent = k.dibatalkan ? 'Aktifkan lagi' : 'Batalkan perjalanan';
  $('form').hidden = true; $('lihat').hidden = false;
  tampilPeserta();
}

function tampilForm() {
  const k = data;
  $('f-judul').textContent = k ? 'Ubah perjalanan' : 'Tambah perjalanan';
  document.querySelectorAll('[name=jenis]').forEach((r) => { r.checked = r.value === k?.jenis; });
  $('nama').value = k?.nama || '';
  $('tujuan').value = k?.tujuan || '';
  $('berangkat').value = k ? tglIsian(k.berangkat) : '';
  aturJam(k ? jamWib(k.berangkat).replace('.', ':') : '');
  $('pulang').value = k?.pulang && k.pulang !== tglIsian(k.berangkat) ? k.pulang : '';
  $('pulang').min = $('berangkat').value || hariIniWib();
  $('tempat').value = k?.tempat_kumpul || '';
  $('wilayah').value = k ? (k.kecamatan_id ? String(k.kecamatan_id) : 'pusat') : ($('wilayah').options[0]?.value || '');
  $('kuota').value = k?.kuota || '';
  document.querySelector(`[name=publik][value=${!k || k.publik ? 'ya' : 'tidak'}]`).checked = true;
  $('keterangan').value = k?.keterangan || '';
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false; $('peserta').hidden = true;
  $('nama').focus();
}

function salah(idEl, t) { const el = $(idEl) || document.querySelector(`[name=${idEl}]`); el.setAttribute('aria-invalid', 'true'); el.focus(); pesanForm(t); }
const galatTeks = (err, dasar) => err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501'
  ? 'Akun ini tidak punya izin mengubah perjalanan di wilayah ini.'
  : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : dasar;

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('berangkat').addEventListener('input', () => { $('pulang').min = $('berangkat').value || hariIniWib(); });
$('kuota').addEventListener('input', (e) => { const v = e.target.value.replace(/\D/g, ''); if (v !== e.target.value) e.target.value = v; });
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/perjalanan.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/perjalanan.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jenis = document.querySelector('[name=jenis]:checked')?.value;
  const nama = $('nama').value.trim().replace(/\s+/g, ' ');
  const tgl = $('berangkat').value, jam = $('jam').value ? `${$('jam').value}:${$('menit').value}` : '';
  const pulang = $('pulang').value, kuota = $('kuota').value;
  if (!jenis) return salah('jenis', 'Jenis perjalanan belum dipilih (Ziarah atau Umroh).');
  if (nama.length < 3) return salah('nama', 'Nama perjalanan belum diisi (minimal 3 huruf).');
  if (!tgl) return salah('berangkat', 'Tanggal berangkat belum diisi.');
  if (!jam) return salah('jam', 'Jam kumpul belum dipilih.');
  if (pulang && pulang < tgl) return salah('pulang', 'Tanggal pulang tidak boleh sebelum tanggal berangkat.');
  if (pulang && pulang > tambahHari(tgl, 60)) return salah('pulang', 'Perjalanan paling lama 60 hari. Periksa tanggal pulang.');
  if (!$('wilayah').value) return salah('wilayah', 'Wilayah belum dipilih.');
  if (kuota && (Number(kuota) < 1 || Number(kuota) > 2000)) return salah('kuota', 'Kuota antara 1 sampai 2.000 orang, atau kosongkan.');
  if (data && kuota && ringkas && Number(kuota) < ringkas.peserta && !kecBoleh) {
    return salah('kuota', `Sudah ada ${angka(ringkas.peserta)} peserta. Kuota tidak boleh kurang dari itu.`);
  }
  const wil = $('wilayah').value;
  const isi = {
    jenis, nama, tujuan: $('tujuan').value.trim().replace(/\s+/g, ' ') || null,
    berangkat: isoWib(tgl, jam), pulang: pulang && pulang !== tgl ? pulang : null,
    tempat_kumpul: $('tempat').value.trim().replace(/\s+/g, ' ') || null,
    kecamatan_id: wil === 'pusat' ? null : Number(wil),
    kuota: kuota ? Number(kuota) : null,
    publik: document.querySelector('[name=publik]:checked').value === 'ya',
    keterangan: $('keterangan').value.trim() || null,
  };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    const [hasil] = data
      ? await dbKirim('PATCH', `perjalanan?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `perjalanan?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', '<p class="pesan ok" role="status">Perjalanan tersimpan.</p>');
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(galatTeks(err, 'Perjalanan belum tersimpan. Periksa isian lalu coba lagi.'));
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

// Perjalanan tidak dihapus: dibatalkan (bisa diaktifkan lagi). Peserta tidak bisa ditambah selama dibatalkan.
$('batalkan').onclick = async () => {
  const batal = !data.dibatalkan;
  if (batal && !confirm(`Batalkan "${data.nama}"?\n\nPeserta tidak bisa ditambah dan anggota melihat perjalanan ini dibatalkan. Daftar peserta tetap tersimpan. Bisa diaktifkan lagi.`)) return;
  const btn = $('batalkan'); btn.disabled = true;
  try {
    const [hasil] = await dbKirim('PATCH', `perjalanan?id=eq.${data.id}&select=${PILIH}`, { dibatalkan: batal });
    if (!hasil) throw new Error('ditolak');
    data = hasil; tampilLihat(); pesan('');
    if (bolehLihatPeserta()) muatPeserta();
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesan(galatTeks(err, 'Belum berhasil. Coba lagi.'));
  } finally { btn.disabled = false; }
};

// ===== Peserta (Langkah 3): daftarkan lewat pindai KTA / ketik nomor, keluarga, tanda lunas, batal ikut, unduh CSV =====
// Semua hak diperiksa lagi di database (daftar_peserta_jamaah, daftar_peserta_keluarga, atur_lunas, atur_batal_peserta).
const PS_PER = 20;
let psHal = 1, psTunda;
const psHasil = (kelas, teks) => { $('ps-hasil').textContent = teks; $('ps-hasil').className = 'pesan' + (kelas === 'ok' ? ' ok' : kelas === 'ingat' ? ' ingat' : ''); };
const psPesan = (t) => { $('ps-pesan').textContent = t; };
// Koordinator di perjalanan kecamatan lain tidak punya peserta yang boleh dilihat: bagian disembunyikan.
const bolehLihatPeserta = () => PERAN_PESERTA.includes(peran) && (!kecBoleh || !data.kecamatan_id || kecBoleh.has(data.kecamatan_id));
const bolehDaftar = () => PERAN_KELOLA_PERJALANAN.includes(peran) && bolehLihatPeserta() && !data.dibatalkan;

function tampilPeserta() {
  if (!data || !bolehLihatPeserta()) { $('peserta').hidden = true; return; }
  $('peserta').hidden = false;
  $('ps-aksi').hidden = !bolehDaftar();
  $('ps-sub').textContent = data.dibatalkan ? 'Perjalanan dibatalkan: peserta tidak bisa ditambah. Daftar tetap tersimpan.'
    : kecBoleh && !data.kecamatan_id ? 'Perjalanan pusat: yang tampil dan bisa didaftarkan hanya jamaah kecamatan Anda.'
    : 'Urut nama. Tanda lunas diubah lewat tombol di tiap baris.';
}

async function muatRingkas() {
  try { ringkas = await dbKirim('POST', 'rpc/ringkas_peserta', { p_perjalanan_id: data.id }); gambarAngka(); } catch {}
}

function teksHasil(h) {
  const siapa = h.nama ? `${h.nama} · ${h.desa}` : '';
  switch (h.hasil) {
    case 'terdaftar': return ['ok', `Terdaftar: ${siapa}`];
    case 'ikut_lagi': return ['ok', `Ikut lagi: ${siapa}`];
    case 'sudah': return ['ingat', `Sudah terdaftar: ${siapa}`];
    case 'tidak_dikenal': return ['galat', `Nomor ${h.nomor} tidak terdaftar. Periksa nomornya.`];
    case 'tidak_aktif': return ['galat', `${siapa} berstatus tidak aktif. Tidak didaftarkan; hubungi pengurus.`];
    case 'wafat': return ['galat', `${siapa} tercatat wafat. Tidak didaftarkan.`];
    case 'kartu_diganti': return ['galat', `Kartu ini sudah diganti (dilaporkan hilang): ${siapa}. Tidak didaftarkan.`];
    case 'penuh': return ['galat', `Kuota sudah penuh (${angka(h.kuota)} orang). ${siapa} belum didaftarkan.`];
    default: return ['galat', 'Hasil tidak dikenal. Coba lagi.'];
  }
}
function teksGalat(e, dasar) {
  if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return ''; }
  if (e.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(e.detail?.code) && e.detail.message) return e.detail.message; // pesan dari database
  if (e.detail?.code === '42501') return e.detail.message && e.detail.message !== 'tidak berhak' ? e.detail.message : 'Akun ini tidak berhak mengubah peserta ini.';
  return dasar;
}

let psSegarkan;
const segarkanNanti = () => { clearTimeout(psSegarkan); psSegarkan = setTimeout(() => { muatPeserta(); muatRingkas(); }, 400); };
async function daftarkan(nomor, versi = null) {
  try {
    const h = await dbKirim('POST', 'rpc/daftar_peserta_jamaah', { p_perjalanan_id: data.id, p_nomor: Number(nomor), p_versi: versi });
    const [kelas, teks] = teksHasil(h);
    if (['terdaftar', 'ikut_lagi'].includes(h.hasil)) segarkanNanti();
    return { kelas, teks };
  } catch (e) { return { kelas: 'galat', teks: teksGalat(e, 'Belum terdaftar. Coba lagi.') }; }
}

$('ps-pindai').onclick = () => pindaiQr({
  judul: `Peserta: ${data.nama.length > 26 ? data.nama.slice(0, 25) + '…' : data.nama}`,
  ket: 'Arahkan kamera ke QR di kartu. Kartu berikutnya bisa langsung dipindai.',
  beruntun: async (teks) => {
    const k = bacaKta(teks);
    if (!k) return { teks: 'Ini bukan QR KTA TQN Cukir.', kelas: 'pindai-galat' };
    const h = k.jenis === 'baru' ? await daftarkan(k.kode.split('-')[1], Number(k.kode.split('-')[2])) : await daftarkan(k.nomor);
    psHasil(h.kelas, h.teks);
    return { teks: h.teks, kelas: { ok: 'pindai-ok', ingat: 'pindai-ingat', galat: 'pindai-galat' }[h.kelas] };
  },
});

$('ps-ketik').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('ps-nomor').value.replace(/\D/g, '');
  if (n.length !== 10) { $('ps-nomor').setAttribute('aria-invalid', 'true'); psHasil('galat', 'Nomor Anggota harus 10 angka.'); $('ps-nomor').focus(); return; }
  $('ps-daftar').disabled = true;
  const h = await daftarkan(n);
  $('ps-daftar').disabled = false;
  psHasil(h.kelas, h.teks);
  if (h.kelas !== 'galat') $('ps-nomor').value = '';
  $('ps-nomor').focus();
});
for (const id of ['ps-nomor', 'ps-kel-nomor']) $(id).addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, ''); if (v !== e.target.value) e.target.value = v; e.target.removeAttribute('aria-invalid');
});
$('ps-kel-nama').addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));

// Keluarga (bukan jamaah): nama + jamaah penghubung + hubungan
$('ps-kel-hub').innerHTML += HUBUNGAN_AK.map((h) => `<option>${h}</option>`).join('');
const bukaKeluarga = (buka) => {
  $('ps-keluarga').hidden = !buka; $('ps-kel-buka').hidden = buka; $('ps-kel-buka').setAttribute('aria-expanded', String(buka));
  if (buka) $('ps-kel-nama').focus();
};
$('ps-kel-buka').onclick = () => bukaKeluarga(true);
$('ps-kel-batal').onclick = () => { bukaKeluarga(false); $('ps-kel-buka').focus(); };
$('ps-keluarga').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = $('ps-kel-nama').value.trim().replace(/\s+/g, ' '), nomor = $('ps-kel-nomor').value;
  const salahK = (id, t) => { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); psHasil('galat', t); };
  if (nama.length < 2) return salahK('ps-kel-nama', 'Nama peserta belum diisi.');
  if (/\d{5,}/.test(nama)) return salahK('ps-kel-nama', 'Jangan menulis nomor HP atau NIK di nama.');
  if (nomor.length !== 10) return salahK('ps-kel-nomor', 'Nomor Anggota penghubung harus 10 angka.');
  const btn = $('ps-kel-simpan'); btn.disabled = true; btn.classList.add('sibuk');
  try {
    const h = await dbKirim('POST', 'rpc/daftar_peserta_keluarga', { p_perjalanan_id: data.id, p_nama: nama, p_nomor_penghubung: Number(nomor), p_hubungan: $('ps-kel-hub').value || null });
    psHasil('ok', `Terdaftar: ${h.nama} (keluarga ${h.penghubung} · ${h.desa})`);
    $('ps-kel-nama').value = ''; $('ps-kel-hub').value = ''; $('ps-kel-nama').focus();
    segarkanNanti();
  } catch (err) { psHasil('galat', teksGalat(err, 'Keluarga belum terdaftar. Coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); }
});

async function muatPeserta() {
  psPesan('');
  try {
    const dari = (psHal - 1) * PS_PER;
    const baris = await dbKirim('POST', 'rpc/daftar_peserta', { p_perjalanan_id: data.id, p_cari: $('ps-cari').value.trim() || null,
      p_status: $('ps-status').value || null, p_dari: dari, p_batas: PS_PER });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PS_PER));
    if (psHal > jmlHal && total) { psHal = jmlHal; return muatPeserta(); }
    const disaring = $('ps-cari').value.trim() || $('ps-status').value;
    $('ps-isi').innerHTML = baris.length ? baris.map((b, i) => {
      const status = b.batal ? '<span class="stat stat-wafat">Batal ikut</span>' : b.lunas ? '<span class="stat stat-biasa">Lunas</span>' : '<span class="stat stat-tidak">Belum lunas</span>';
      const aksi = [
        b.batal ? '' : `<button type="button" class="btn btn-kedua btn-pas" data-lunas="${b.id}" data-nilai="${!b.lunas}">${b.lunas ? 'Batalkan lunas' : 'Tandai lunas'}</button>`,
        b.boleh_ubah && bolehDaftar() ? `<button type="button" class="tautan" data-batal="${b.id}" data-nilai="${!b.batal}">${b.batal ? 'Ikutkan lagi' : 'Batal ikut'}</button>` : '',
      ].join('');
      const kel = b.keluarga ? `<span class="ps-kel">Keluarga${b.hubungan ? ` (${hurufAman(b.hubungan)})` : ''} dari ${hurufAman(b.penghubung_nama)}</span>` : '';
      return `<tr data-id="${b.id}"${b.batal ? ' class="ps-batal"' : ''} data-nama="${hurufAman(b.nama)}">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(b.nama)}${kel}</td>
        <td data-l="Nomor" class="angka">${b.keluarga ? `<span class="hp-saja">Penghubung </span>${b.penghubung_nomor}` : b.nomor_anggota}</td>
        <td data-l="Desa">${hurufAman(b.desa)}<span class="hp-saja"> · Kec. ${hurufAman(b.kecamatan)}</span></td>
        <td data-l="Kecamatan">${hurufAman(b.kecamatan)}</td>
        <td class="kol-luas">${hurufAman(b.kabupaten)}</td>
        <td data-l="Status">${status}</td>
        <td data-l="Aksi"><div class="ps-aksi">${aksi}</div></td></tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada peserta yang cocok.' : bolehDaftar() ? 'Belum ada peserta. Pindai KTA atau ketik Nomor Anggota di atas.' : 'Belum ada peserta.'}</td></tr>`;
    $('ps-halaman').hidden = total <= PS_PER;
    $('ps-posisi').innerHTML = `<strong>${psHal}</strong> / ${jmlHal}<span class="sr-only"> halaman</span>`;
    $('ps-sebelum').disabled = psHal <= 1; $('ps-sesudah').disabled = psHal >= jmlHal;
    $('ps-unduh').disabled = !ringkas?.peserta && !total;
  } catch (e) { const t = teksGalat(e, 'Daftar peserta belum bisa dimuat. Coba muat ulang.'); if (t) psPesan(t); }
}

$('ps-isi').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lunas],[data-batal]');
  if (!b) return;
  const nama = b.closest('tr').dataset.nama, nilai = b.dataset.nilai === 'true';
  const lunas = 'lunas' in b.dataset;
  if (lunas && !nilai && !confirm(`Batalkan tanda lunas ${nama}?\n\nStatusnya kembali "Belum lunas". Bisa ditandai lunas lagi.`)) return;
  if (!lunas && nilai && !confirm(`${nama} batal ikut?\n\nNamanya tetap tersimpan dengan tanda "Batal ikut" dan tidak dihitung peserta. Bisa diikutkan lagi.`)) return;
  b.disabled = true;
  try {
    await dbKirim('POST', lunas ? 'rpc/atur_lunas' : 'rpc/atur_batal_peserta',
      lunas ? { p_peserta_id: Number(b.dataset.lunas), p_lunas: nilai } : { p_peserta_id: Number(b.dataset.batal), p_batal: nilai }, 'return=minimal');
    psHasil(lunas ? 'ok' : 'ingat', lunas ? `${nama}: ${nilai ? 'lunas' : 'belum lunas'}.` : nilai ? `${nama} batal ikut.` : `${nama} ikut lagi.`);
    muatPeserta(); muatRingkas();
  } catch (err) { b.disabled = false; psHasil('galat', teksGalat(err, 'Belum tersimpan. Coba lagi.')); }
});

$('ps-saring').addEventListener('submit', (e) => e.preventDefault());
$('ps-cari').addEventListener('input', () => { clearTimeout(psTunda); psTunda = setTimeout(() => { psHal = 1; muatPeserta(); }, 300); });
$('ps-status').addEventListener('change', () => { psHal = 1; muatPeserta(); });
$('ps-sebelum').onclick = () => { psHal--; muatPeserta(); };
$('ps-sesudah').onclick = () => { psHal++; muatPeserta(); };

// Daftar rombongan (CSV untuk Excel Indonesia): pemisah ;, BOM UTF-8, nilai berawalan = + - @ diberi '. Tanpa yang batal ikut.
const selCsv = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
$('ps-unduh').onclick = async () => {
  const btn = $('ps-unduh'); btn.disabled = true; btn.querySelector('.teks').textContent = 'Menyiapkan...';
  try {
    const semua = [];
    for (let dari = 0; ; dari += 1000) {
      const b = await dbKirim('POST', 'rpc/daftar_peserta', { p_perjalanan_id: data.id, p_dari: dari, p_batas: 1000 });
      semua.push(...b);
      if (b.length < 1000) break;
    }
    const tgl = tglIsian(data.berangkat);
    const baris = [['No', 'Nama', 'Jenis peserta', 'Nomor Anggota', 'Penghubung', 'Hubungan', 'Kel/Desa', 'Kecamatan', 'Kab/Kota', 'Pembayaran']]
      .concat(semua.map((b, i) => [i + 1, b.nama, b.keluarga ? 'Keluarga' : 'Jamaah', b.keluarga ? '' : b.nomor_anggota,
        b.keluarga ? `${b.penghubung_nama} (${b.penghubung_nomor})` : '', b.hubungan || '', b.desa, b.kecamatan, b.kabupaten, b.lunas ? 'Lunas' : 'Belum lunas']));
    const isi = '﻿' + baris.map((r) => r.map(selCsv).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
    a.download = `rombongan-${tgl}-${data.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { const t = teksGalat(e, 'Daftar belum bisa diunduh. Coba lagi.'); if (t) psPesan(t); }
  finally { btn.disabled = false; btn.querySelector('.teks').textContent = 'Unduh daftar rombongan'; }
};

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_PERJALANAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    const tugas = [dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama')];
    if (peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(dbGet(`perjalanan?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    if (id && PERAN_PESERTA.includes(peran)) tugas.push(dbKirim('POST', 'rpc/ringkas_peserta', { p_perjalanan_id: Number(id) }).catch(() => null));
    const [kec, ...lain] = await Promise.all(tugas);
    if (peran === 'koordinator_wilayah') kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    // Wilayah: admin pusat & ketua = Pusat + semua kecamatan (per Kab/Kota); koordinator = kecamatannya saja.
    const pilihan = kec.filter((k) => !kecBoleh || kecBoleh.has(k.id));
    const perKab = new Map();
    for (const k of pilihan) { const n = k.kabupaten?.nama || ''; if (!perKab.has(n)) perKab.set(n, []); perKab.get(n).push(k); }
    $('wilayah').innerHTML = (kecBoleh ? '' : '<option value="pusat">Pusat Cukir</option>') +
      [...perKab].sort(([a], [b]) => a.localeCompare(b, 'id')).map(([kab, daftar]) => `<optgroup label="${hurufAman(kab)}">${daftar.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)}</option>`).join('')}</optgroup>`).join('');
    if (id) {
      data = lain[0]?.[0];
      ringkas = lain[1] || null;
      if (!data) { pesan('Perjalanan tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      tampilLihat();
      if (bolehLihatPeserta()) muatPeserta();
    } else if (PERAN_KELOLA_PERJALANAN.includes(peran)) {
      if (kecBoleh && !kecBoleh.size) { pesan('Akun koordinator ini belum diberi wilayah. Hubungi admin pusat.'); return; }
      tampilForm();
    } else location.replace('/perjalanan.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
