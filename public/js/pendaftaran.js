// Pendaftaran jamaah baru: foto KTP -> isi otomatis -> periksa -> simpan.
// Foto KTP hanya diproses di perangkat ini; tidak dikirim, tidak disimpan. NIK tidak diambil.
const $ = (id) => document.getElementById(id);
let kecBoleh = null, perbaruiSaran = () => {}, dobelDiperiksa = '', siapBaca = false;
const ISIAN = ['nama', 'tempat-lahir', 'tgl-lahir', 'gol-darah', 'desa', 'kecamatan', 'kabupaten', 'alamat', 'rt-rw', 'pekerjaan', 'status-kawin', 'wn'];
let peranSaya = '';

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const tampil = (bag) => { for (const b of ['tahap-foto', 'form', 'konfirmasi', 'selesai']) $(b).hidden = b !== bag; scrollTo({ top: 0 }); };

function kosongkan() {
  for (const k of ISIAN) { $(k).value = ''; $(k).classList.remove('otomatis'); $(k).removeAttribute('aria-invalid'); }
  $('mursyid').value = '';
  isiIsianKtp(null); $('gol-darah').value = '';
  document.querySelectorAll('.pil').forEach((l) => l.classList.remove('otomatis'));
  $('tanggal').value = new Date().toLocaleDateString('sv-SE');
  $('kabupaten').value = wilayahAwal();
  perbaruiSaran();
  aturUmur();
  $('hasil-baca').hidden = true; $('dobel').hidden = true; dobelDiperiksa = ''; pesanForm('');
}

async function terapkan(h) {
  const tandai = (k, v) => { if (v === undefined || v === null || v === '') return; $(k).value = v; $(k).classList.add('otomatis'); };
  tandai('nama', h.nama); tandai('alamat', h.alamat); tandai('pekerjaan', h.pekerjaan);
  tandai('tempat-lahir', h.tempat_lahir); tandai('tgl-lahir', h.tanggal_lahir);
  tandai('rt-rw', h.rt_rw); tandai('status-kawin', h.status_kawin); tandai('wn', h.kewarganegaraan);
  if (PERAN_GOLDAR.includes(peranSaya)) tandai('gol-darah', h.gol_darah);
  if (h.jenis_kelamin) { const r = document.querySelector(`[name=jk][value=${h.jenis_kelamin}]`); r.checked = true; r.closest('.pil').classList.add('otomatis'); }
  aturUmur();
  // wilayah: ejaan dibetulkan ke nama resmi Kemendagri kalau mirip (salah baca sedikit)
  const w = await Wilayah.betulkan(h, KTP.cocokkan).catch(() => h);
  tandai('kabupaten', w.kabupaten); tandai('kecamatan', w.kecamatan); tandai('desa', w.desa);
  perbaruiSaran();
  const terisi = ISIAN.filter((k) => $(k).classList.contains('otomatis')).length;
  $('hasil-baca').hidden = terisi === 0;
  const kurang = [];
  if (!h.nama) kurang.push('nama');
  pesanForm(terisi === 0 ? 'Tulisan KTP belum terbaca. Isi manual atau foto ulang dengan cahaya lebih terang.'
    : kurang.length ? `Periksa: ${kurang.join(', ')}.` : '');
}

async function prosesFoto(e) {
  const berkas = e.target.files?.[0];
  e.target.value = '';
  if (berkas) bacaGambar(berkas);
}

// ===== Kamera dengan bingkai KTP =====
let aliran = null;
async function bukaKamera() {
  if (!navigator.mediaDevices?.getUserMedia) return $('kamera').click(); // HP lama: pakai kamera bawaan
  try {
    aliran = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch {
    pesan('Izin kamera ditolak. Foto KTP lewat kamera bawaan HP.');
    return $('kamera').click();
  }
  $('video').srcObject = aliran;
  $('kamera-layar').hidden = false;
  nyalakanLampu();
  document.body.style.overflow = 'hidden';
  $('jepret').focus();
}
// Lampu flash menyala otomatis agar tulisan KTP terang (HP Android/Chrome; iPhone belum mengizinkan dari website).
async function aturLampu(nyala) {
  const t = aliran?.getVideoTracks()[0];
  if (!t) return false;
  try { await t.applyConstraints({ advanced: [{ torch: nyala }] }); } catch { return false; }
  $('lampu').setAttribute('aria-pressed', String(nyala));
  return true;
}
async function nyalakanLampu() {
  const t = aliran?.getVideoTracks()[0];
  const bisa = !!t?.getCapabilities?.().torch;
  $('lampu').hidden = !bisa;
  if (!bisa) return;
  try { if (t.getCapabilities().focusMode?.includes('continuous')) await t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {}
  await new Promise((r) => setTimeout(r, 300)); // beberapa HP perlu jeda setelah kamera menyala
  if (!(await aturLampu(true))) $('lampu').hidden = true;
}
$('lampu').onclick = () => aturLampu($('lampu').getAttribute('aria-pressed') !== 'true');
function tutupKamera() {
  aliran?.getTracks().forEach((t) => t.stop()); aliran = null;
  $('video').srcObject = null;
  $('kamera-layar').hidden = true;
  document.body.style.overflow = '';
  $('buka-kamera').focus();
}
function jepret() {
  const v = $('video'), b = $('bingkai').getBoundingClientRect(), l = v.getBoundingClientRect();
  if (!v.videoWidth) return;
  // video tampil "cover": hitung bagian video yang ada di dalam bingkai
  const skala = Math.max(l.width / v.videoWidth, l.height / v.videoHeight);
  const geserX = (v.videoWidth * skala - l.width) / 2, geserY = (v.videoHeight * skala - l.height) / 2;
  const sx = (b.left - l.left + geserX) / skala, sy = (b.top - l.top + geserY) / skala;
  const sw = (b.width / skala) * 0.72, sh = b.height / skala; // kiri 72%: tulisan KTP; foto di kanan tidak perlu dibaca
  const k = document.createElement('canvas');
  k.width = Math.round(sw); k.height = Math.round(sh);
  k.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, k.width, k.height);
  tutupKamera();
  k.toBlob((blob) => { k.width = k.height = 0; if (blob) bacaGambar(blob); }, 'image/jpeg', 0.92);
}
$('buka-kamera').onclick = bukaKamera;
$('kamera-batal').onclick = tutupKamera;
$('jepret').onclick = jepret;
$('kamera-layar').addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupKamera(); });

async function bacaGambar(berkas) {
  pesan('');
  $('membaca').hidden = false;
  $('membaca-teks').textContent = siapBaca ? 'Membaca KTP...' : 'Menyiapkan pembaca KTP...'; $('membaca-persen').textContent = ''; $('bilah-isi').style.width = '5%';
  for (const b of document.querySelectorAll('.foto-pilih label, .foto-pilih button')) b.setAttribute('aria-disabled', 'true');
  try {
    const teks = await KTP.baca(berkas, (p) => {
      $('membaca-teks').textContent = 'Membaca KTP...';
      $('membaca-persen').textContent = `${Math.round(p * 100)}%`;
      $('bilah-isi').style.width = `${Math.max(5, p * 100)}%`;
    });
    const hasil = KTP.urai(teks);
    kosongkan(); await terapkan(hasil);
    tampil('form');
  } catch (err) {
    pesan('KTP belum bisa dibaca di perangkat ini. Silakan isi manual.');
    kosongkan(); tampil('form');
  } finally {
    $('membaca').hidden = true;
    for (const b of document.querySelectorAll('.foto-pilih [aria-disabled]')) b.removeAttribute('aria-disabled');
  }
}

async function cekDobel(nama, desaId) {
  const kunci = `${nama.toLowerCase()}|${desaId}`;
  if (dobelDiperiksa === kunci) return false; // sudah diperingatkan, pengguna memilih tetap simpan
  const kata = nama.split(' ').filter((k) => k.replace(/\W/g, '').length > 2).slice(0, 2);
  const pola = kata.length ? kata.map((k) => `nama.ilike.*${encodeURIComponent(k.replace(/[*,()]/g, ''))}*`).join(',') : `nama.ilike.${encodeURIComponent(nama)}`;
  const mirip = await dbGet(`jamaah?select=id,nomor_anggota,nama,wafat&desa_id=eq.${desaId}&and=(${pola})&limit=5`);
  dobelDiperiksa = kunci;
  if (!mirip.length) return false;
  $('dobel-daftar').innerHTML = mirip.map((j) => `<li><a href="/jamaah-isi.html?id=${j.id}" target="_blank" rel="noopener">${hurufAman(j.nama)}</a> · ${j.nomor_anggota}${j.wafat ? ' · Wafat' : ''}</li>`).join('');
  $('dobel').hidden = false;
  $('dobel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

$('kamera').addEventListener('change', prosesFoto);
$('galeri').addEventListener('change', prosesFoto);
$('manual').onclick = () => { kosongkan(); tampil('form'); $('nama').focus(); };
$('ulang').onclick = () => { kosongkan(); tampil('tahap-foto'); };
$('lagi').onclick = () => { kosongkan(); tampil('tahap-foto'); };
for (const i of ['desa', 'kecamatan', 'kabupaten']) $(i).addEventListener('input', () => { $('dobel').hidden = true; });
const aturUmur = pasangUmurOtomatis();
$('form').addEventListener('input', (e) => { e.target.classList?.remove('otomatis'); e.target.closest?.('.pil')?.classList.remove('otomatis'); e.target.removeAttribute?.('aria-invalid'); });
$('keluar').onclick = keluar;

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }

let siapKirim = null; // data yang sudah diperiksa, menunggu "Ya, simpan"

// Desa yang sudah ada di daftar (untuk cek dobel tanpa membuat wilayah baru dulu)
function desaIdLokal() {
  const s = (i) => $(i).value.trim().toLowerCase().replace(/\s+/g, ' ');
  return semuaWilayah.find((w) => w.desa.toLowerCase() === s('desa') && w.kec.toLowerCase() === s('kecamatan') && w.kab.toLowerCase() === s('kabupaten'))?.id;
}

const tglPanjang = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const teksPilihan = (id) => { const o = $(id).selectedOptions[0]; return o && o.value ? o.textContent : ''; };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = KTP.judul($('nama').value.replace(/\s+/g, ' '));
  const umur = $('tgl-lahir').value ? hitungUmur($('tgl-lahir').value, $('tanggal').value || undefined) : null; // umur_daftar dihitung database
  if (nama.length < 2) return salah('nama', 'Nama lengkap belum diisi.');
  if (!$('desa').value.trim()) return salah('desa', 'Desa/Kelurahan belum diisi.');
  if (!$('kecamatan').value.trim()) return salah('kecamatan', 'Kecamatan belum diisi.');
  if (!$('kabupaten').value.trim()) return salah('kabupaten', 'Kabupaten/Kota belum diisi.');
  if (umur !== null && (umur < 5 || umur > 120)) return salah('tgl-lahir', 'Tanggal lahir belum benar: umur saat daftar harus 5 sampai 120 tahun.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Memeriksa...';
  pesanForm('');
  try {
    const idLama = desaIdLokal();
    if (idLama && await cekDobel(nama, idLama)) return;
    const ktp = bacaIsianKtp();
    siapKirim = {
      nama, alamat: $('alamat').value.trim() || null,
      tempat_lahir: $('tempat-lahir').value.trim() ? KTP.judul($('tempat-lahir').value) : null, tanggal_lahir: $('tgl-lahir').value || null, ...ktp,
      pekerjaan: $('pekerjaan').value.trim() ? KTP.judul($('pekerjaan').value) : null,
      mursyid_id: $('mursyid').value ? Number($('mursyid').value) : null, tanggal_daftar: $('tanggal').value || undefined,
    };
    const lahir = [siapKirim.tempat_lahir, tglPanjang(siapKirim.tanggal_lahir)].filter(Boolean).join(', ');
    const baris = [
      ['Mursyid', teksPilihan('mursyid')], ['Tanggal daftar', tglPanjang($('tanggal').value)],
      ['Nama lengkap', nama], ['Tempat, tanggal lahir', lahir], ['Umur saat daftar', umur !== null ? `${umur} tahun` : ''],
      ['Jenis kelamin', { L: 'Laki-laki', P: 'Perempuan' }[ktp.jenis_kelamin] || ''],
      ...(PERAN_GOLDAR.includes(peranSaya) ? [['Gol. darah', $('gol-darah').value]] : []),
      ['Status perkawinan', ktp.status_kawin], ['Kewarganegaraan', ktp.kewarganegaraan], ['Pekerjaan', siapKirim.pekerjaan],
      ['Kab/Kota', KTP.judul($('kabupaten').value.replace(/\s+/g, ' ')) + ($('k-prov').textContent ? `, ${$('k-prov').textContent.replace('Provinsi ', '')}` : '')],
      ['Kecamatan', KTP.judul($('kecamatan').value.replace(/\s+/g, ' '))], ['Kel/Desa', KTP.judul($('desa').value.replace(/\s+/g, ' '))],
      ['Dusun/Jalan', [siapKirim.alamat, ktp.rt_rw && `RT/RW ${ktp.rt_rw}`].filter(Boolean).join(', ')],
    ];
    $('k-rincian').innerHTML = baris.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? hurufAman(v) : '<span class="kosong">Belum diisi</span>'}</dd></div>`).join('');
    $('pesan-konfirmasi').textContent = '';
    tampil('konfirmasi');
    $('k-judul').focus();
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : 'Data belum bisa diperiksa. Coba lagi.');
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Periksa data'; }
});

$('perbaiki').onclick = () => { tampil('form'); $('nama').focus(); };

$('simpan-yakin').onclick = async () => {
  if (!siapKirim) return;
  const btn = $('simpan-yakin'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  $('pesan-konfirmasi').textContent = '';
  try {
    const desaId = await desaIdWilayah();
    const [j] = await dbKirim('POST', 'jamaah?select=id,nomor_anggota,nama,desa(nama)', { ...siapKirim, desa_id: desaId });
    if (PERAN_GOLDAR.includes(peranSaya) && $('gol-darah').value) await simpanGoldar(j.id, $('gol-darah').value, false).catch(() => {});
    siapKirim = null;
    $('selesai-teks').innerHTML = `<strong>${hurufAman(j.nama)}</strong> dari Desa ${hurufAman(j.desa.nama)}<br>Nomor Anggota <strong class="angka">${j.nomor_anggota}</strong>`;
    $('lihat-data').href = `/jamaah-isi.html?id=${j.id}`;
    tampil('selesai');
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    $('pesan-konfirmasi').textContent = err.detail?.message === 'di luar wilayah tugas' ? 'Wilayah ini di luar wilayah tugas akun ini. Tekan Ubah lalu periksa ejaan desa dan kecamatan.'
      : err.message === 'gagal-403' || err.detail?.code === '42501' ? 'Akun ini tidak punya izin mendaftarkan jamaah di desa ini.'
      : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : 'Data belum tersimpan. Tekan Ubah, periksa isian, lalu coba lagi.';
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Ya, simpan'; }
};

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_UBAH_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peranSaya = p.peran;
    $('isian-goldar').hidden = !PERAN_GOLDAR.includes(p.peran);
    const tugas = [dbGet('mursyid?select=id,nama&order=nama')];
    if (p.peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    const [murs, wil] = await Promise.all(tugas);
    if (wil) kecBoleh = new Set(wil.map((w) => w.kecamatan_id));
    perbaruiSaran = await muatWilayah(kecBoleh);
    $('mursyid').innerHTML += murs.map((m) => `<option value="${m.id}">${hurufAman(m.nama)}</option>`).join('');
    kosongkan();
    // siapkan pembaca KTP di latar belakang selagi petugas bersiap memotret
    KTP.siapkan().then(() => { siapBaca = true; }).catch(() => {});
  } catch (e) { tanganiGalat(e, pesan); }
})();
