// Rincian usaha jamaah (semua yang login) + tambah/ubah/tandai tutup (admin pusat, ketua, koordinator untuk pemilik di
// wilayahnya). Baca lewat rpc daftar_usaha; tulis ke tabel usaha_jamaah (RLS + trigger menjaga hak, pemilik, dan log).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let id = Number(q.get('id')) || 0, data = null, peran = '', pemilik = null, tundaCek, wilayahSiap = false;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const rapikan = (t) => t.trim().replace(/\s+/g, ' ');
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message === 'wilayah belum lengkap' ? 'Lokasi usaha belum lengkap.' : err.detail.message;
  if (err.detail?.code === '23514') return 'Ada isian yang terlalu panjang atau berisi nomor HP. Periksa lagi.';
  if (err.detail?.code === '42501') return 'Akun ini tidak berhak mencatat usaha ini (hanya pemilik di wilayah Anda).';
  return dasar;
};
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };

async function muatData() {
  const [x] = await dbKirim('POST', 'rpc/daftar_usaha', { p_id: id, p_status: null, p_batas: 1 });
  return x || null;
}

function tampilLihat() {
  const x = data;
  document.title = `${x.nama} · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = JENIS_USAHA[x.jenis];
  $('l-nama').textContent = x.nama;
  $('l-status').textContent = x.status === 'tutup' ? 'Tutup' : 'Buka';
  $('l-status').className = `stat ${x.status === 'tutup' ? 'stat-tidak' : 'stat-biasa'}`;
  $('l-rincian').innerHTML = [
    ['Barang/jasa', x.produk],
    ['Pemilik', x.pemilik],
    ['Nomor Anggota pemilik', x.nomor_anggota ? String(x.nomor_anggota) : null],
    ['Alamat', `${x.alamat ? `${x.alamat}, ` : ''}${x.desa}, Kec. ${x.kecamatan}, ${x.kabupaten}`],
    ['Hari/jam buka', x.jam_buka],
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('aksi').hidden = !x.boleh_ubah;
  $('tutup').textContent = x.status === 'tutup' ? 'Buka lagi' : 'Tandai tutup';
  $('form').hidden = true; $('lihat').hidden = false;
}

// ===== Formulir =====
$('jenis-isian').insertAdjacentHTML('beforeend', Object.entries(JENIS_USAHA)
  .map(([v, t]) => `<label class="pil"><input type="radio" name="jenis" value="${v}"> ${t}</label>`).join(''));

async function tampilForm() {
  const x = data;
  $('f-judul').textContent = x ? 'Ubah usaha' : 'Tambah usaha';
  $('pemilik-isian').hidden = !!x;
  $('pemilik-tetap').hidden = !x;
  if (x) $('pemilik-tetap').textContent = `Pemilik: ${x.pemilik}${x.nomor_anggota ? ` · ${x.nomor_anggota}` : ''} (tidak bisa diganti)`;
  $('nama').value = x?.nama || '';
  document.querySelectorAll('[name=jenis]').forEach((r) => { r.checked = r.value === x?.jenis; });
  $('produk').value = x?.produk || '';
  $('jam').value = x?.jam_buka || '';
  $('kabupaten').value = x?.kabupaten || ''; $('kecamatan').value = x?.kecamatan || ''; $('desa').value = x?.desa || '';
  $('alamat').value = x?.alamat || '';
  pesanForm(''); pesan('');
  $('lihat').hidden = true; $('form').hidden = false;
  (x ? $('nama') : $('nomor')).focus();
  if (!wilayahSiap) { wilayahSiap = true; await muatWilayah().catch(() => {}); }
  Wilayah.provinsi?.();
}

// Pratinjau pemilik dari Data Jamaah (RLS: koordinator hanya wilayahnya). Lokasi usaha diisi dari alamat pemilik.
async function cekPemilik() {
  const n = $('nomor').value.replace(/\D/g, '');
  pemilik = null; $('pemilik').className = 'bs-penerima';
  if (n.length !== 10) { $('pemilik').textContent = ''; return; }
  $('pemilik').textContent = 'Mencari...';
  try {
    const [j] = await dbGet(`jamaah?select=id,nama,aktif,wafat,alamat,desa(nama,kecamatan(nama,kabupaten(nama)))&nomor_anggota=eq.${n}`);
    if ($('nomor').value !== n) return;
    if (!j) { $('pemilik').textContent = peran === 'koordinator_wilayah' ? 'Nomor tidak ditemukan di wilayah Anda.' : 'Nomor Anggota tidak terdaftar.'; $('pemilik').className = 'bs-penerima galat'; return; }
    const d = j.desa || {}, kec = d.kecamatan || {};
    if (j.wafat || !j.aktif) { $('pemilik').textContent = `${j.nama} · ${j.wafat ? 'wafat' : 'tidak aktif'}. Pemilik usaha harus jamaah aktif.`; $('pemilik').className = 'bs-penerima galat'; return; }
    pemilik = j;
    $('pemilik').textContent = `${j.nama} · ${d.nama || ''}, Kec. ${kec.nama || ''}`;
    if (!$('desa').value.trim()) {
      $('kabupaten').value = kec.kabupaten?.nama || ''; $('kecamatan').value = kec.nama || ''; $('desa').value = d.nama || '';
      if (!$('alamat').value.trim()) $('alamat').value = j.alamat || '';
      Wilayah.provinsi?.();
    }
  } catch { $('pemilik').textContent = 'Belum bisa memeriksa nomor. Periksa sinyal.'; }
}
$('nomor').addEventListener('input', () => {
  const v = $('nomor').value.replace(/\D/g, ''); if (v !== $('nomor').value) $('nomor').value = v;
  clearTimeout(tundaCek); tundaCek = setTimeout(cekPemilik, 300);
});
$('pindai').onclick = async () => {
  const teks = await pindaiQr({ judul: 'Pindai KTA pemilik usaha' });
  if (!teks) return;
  const k = bacaKta(teks);
  if (!k) { $('pemilik').textContent = 'Ini bukan QR KTA TQN Cukir.'; $('pemilik').className = 'bs-penerima galat'; return; }
  $('nomor').value = k.jenis === 'baru' ? k.kode.split('-')[1] : String(k.nomor);
  cekPemilik();
};

function salah(el, t) { el.setAttribute('aria-invalid', 'true'); (el.querySelector?.('input') || el).focus(); pesanForm(t); }
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('form').addEventListener('change', (e) => { if (e.target.name === 'jenis') $('jenis-isian').removeAttribute('aria-invalid'); });
$('batal').onclick = () => { if (data) tampilLihat(); else location.assign('/usaha.html'); };
$('ubah').onclick = () => tampilForm();

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jenis = document.querySelector('[name=jenis]:checked')?.value;
  const isi = { nama: rapikan($('nama').value), jenis, produk: rapikan($('produk').value) || null,
    jam_buka: rapikan($('jam').value) || null, alamat: rapikan($('alamat').value) || null };
  if (!data && !pemilik) return salah($('nomor'), 'Isi Nomor Anggota pemilik (jamaah aktif) lalu tunggu namanya muncul.');
  if (isi.nama.length < 2) return salah($('nama'), 'Nama usaha belum diisi.');
  if (!jenis) return salah($('jenis-isian'), 'Pilih jenis usaha.');
  for (const [k, el] of [['nama', 'nama'], ['produk', 'produk'], ['jam_buka', 'jam'], ['alamat', 'alamat']]) {
    if (/\d{8,}/.test(isi[k] || '')) return salah($(el), 'Jangan menulis nomor HP atau NIK.');
  }
  if (!$('kabupaten').value.trim()) return salah($('kabupaten'), 'Kab/Kota lokasi usaha belum diisi.');
  if (!$('kecamatan').value.trim()) return salah($('kecamatan'), 'Kecamatan lokasi usaha belum diisi.');
  if (!$('desa').value.trim()) return salah($('desa'), 'Kel/Desa lokasi usaha belum diisi.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    isi.desa_id = await desaIdWilayah();
    if (data) {
      await dbKirim('PATCH', `usaha_jamaah?id=eq.${data.id}`, isi, 'return=minimal');
    } else {
      const [b] = await dbKirim('POST', 'usaha_jamaah?select=id', { ...isi, jamaah_id: pemilik.id });
      id = b.id; history.replaceState(null, '', `?id=${id}`);
    }
    data = await muatData();
    if (data) tampilLihat();
    pesan('Usaha tersimpan.', true);
    scrollTo({ top: 0 });
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Belum tersimpan. Periksa isian lalu coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

$('tutup').onclick = async () => {
  const tutup = data.status !== 'tutup';
  if (!confirm(tutup ? `Tandai "${data.nama}" tutup?\n\nUsaha tidak tampil lagi untuk anggota. Data tetap tersimpan dan bisa dibuka lagi.`
    : `Buka lagi "${data.nama}"?\n\nUsaha akan tampil lagi untuk anggota.`)) return;
  $('tutup').disabled = true;
  try {
    await dbKirim('PATCH', `usaha_jamaah?id=eq.${data.id}`, { status: tutup ? 'tutup' : 'buka' }, 'return=minimal');
    data = await muatData();
    if (data) tampilLihat();
    pesan(tutup ? 'Usaha ditandai tutup.' : 'Usaha dibuka lagi.', true);
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('tutup').disabled = false; }
};

$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (/\/usaha(\.html)?([?#]|$)/.test(document.referrer)) { e.preventDefault(); history.back(); } };

(async () => {
  try {
    const p = await profilSaya();
    if (!p) { location.replace('/masuk.html'); return; }
    peran = p.peran;
    if (id) {
      data = await muatData();
      if (!data) { pesan('Usaha tidak ditemukan atau sudah tutup.'); return; }
      tampilLihat();
    } else if (PERAN_CATAT_USAHA.includes(peran)) {
      tampilForm();
    } else location.replace('/usaha.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
