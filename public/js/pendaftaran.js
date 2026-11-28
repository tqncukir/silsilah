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
  $('nomor-lama').value = ''; tampilNomorLama(null);
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
  mulaiPantau();
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
// ===== Pindai otomatis (Kang 2026-11-28): foto diambil sendiri bila KTP di bingkai terlihat tajam & diam ±1 detik.
// Gambar kecil isi bingkai diperiksa di HP saja (tidak dikirim/disimpan). Tombol foto manual tetap ada.
const PANTAU = { jeda: 200, perlu: 5, mulaiMs: 900, tepi: 22, padat: 0.07, goyang: 7 };
let pantau = null;
function kotakBingkai(v) {
  const b = $('bingkai').getBoundingClientRect(), l = v.getBoundingClientRect();
  const skala = Math.max(l.width / v.videoWidth, l.height / v.videoHeight);
  const geserX = (v.videoWidth * skala - l.width) / 2, geserY = (v.videoHeight * skala - l.height) / 2;
  return { sx: (b.left - l.left + geserX) / skala, sy: (b.top - l.top + geserY) / skala, sw: b.width / skala, sh: b.height / skala };
}
// Nilai satu cuplikan: kepadatan garis tulisan (tajam & ada kartu), gerak dibanding cuplikan sebelumnya, terang rata-rata.
function nilaiCuplikan(v, k, ctx, lalu) {
  const { sx, sy, sw, sh } = kotakBingkai(v);
  ctx.drawImage(v, sx, sy, sw, sh, 0, 0, k.width, k.height);
  const d = ctx.getImageData(0, 0, k.width, k.height).data, W = k.width, H = k.height;
  const abu = new Float32Array(W * H);
  let terang = 0;
  for (let i = 0; i < W * H; i++) { abu[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; terang += abu[i]; }
  let tepi = 0, gerak = 0, n = 0;
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < Math.floor(W * 0.7); x++) { // kiri 70%: bagian tulisan KTP
    const i = y * W + x;
    if (Math.abs(abu[i + 1] - abu[i - 1]) + Math.abs(abu[i + W] - abu[i - W]) > PANTAU.tepi) tepi++;
    n++;
  }
  if (lalu) { for (let i = 0; i < W * H; i += 3) gerak += Math.abs(abu[i] - lalu[i]); gerak /= W * H / 3; }
  return { padat: tepi / n, gerak, terang: terang / (W * H), abu };
}
function petunjuk(teks, sub, siap = false) {
  $('kamera-judul').innerHTML = `${teks}<br><span>${sub}</span>`;
  $('bingkai').classList.toggle('siap', siap);
}
function mulaiPantau() {
  hentiPantau();
  const v = $('video'), k = document.createElement('canvas'); k.width = 160; k.height = 101;
  const ctx = k.getContext('2d', { willReadFrequently: true });
  const mulai = Date.now(); let lalu = null, baik = 0, akhir = '';
  petunjuk('Masukkan KTP ke dalam kotak.', 'Foto diambil otomatis saat tulisan jelas dan HP diam.');
  pantau = setInterval(() => {
    if (!v.videoWidth || Date.now() - mulai < PANTAU.mulaiMs) return;
    let h;
    try { h = nilaiCuplikan(v, k, ctx, lalu); } catch { hentiPantau(); return; }
    const pertama = !lalu; lalu = h.abu;
    if (pertama) return; // cuplikan pertama belum bisa dibandingkan
    let keadaan;
    if (h.terang < 45) keadaan = 'gelap';
    else if (h.padat < PANTAU.padat) keadaan = 'cari';
    else if (h.gerak > PANTAU.goyang) keadaan = 'goyang';
    else keadaan = 'baik';
    baik = keadaan === 'baik' ? baik + 1 : 0;
    if (baik >= PANTAU.perlu) { navigator.vibrate?.(60); jepret(); return; }
    if (keadaan === akhir && keadaan !== 'baik') return;
    akhir = keadaan;
    if (keadaan === 'gelap') petunjuk('Terlalu gelap.', 'Cari tempat lebih terang atau nyalakan lampu.');
    else if (keadaan === 'cari') petunjuk('Dekatkan KTP ke dalam kotak.', 'Tulisan KTP harus memenuhi kotak dan tidak kabur.');
    else if (keadaan === 'goyang') petunjuk('Tahan HP agar diam.', 'Foto diambil otomatis saat gambar tidak goyang.');
    else petunjuk('Tahan sebentar…', 'Sedang mengambil foto.', true);
  }, PANTAU.jeda);
}
function hentiPantau() { clearInterval(pantau); pantau = null; $('bingkai').classList.remove('siap'); }
function tutupKamera() {
  hentiPantau();
  aliran?.getTracks().forEach((t) => t.stop()); aliran = null;
  $('video').srcObject = null;
  $('kamera-layar').hidden = true;
  document.body.style.overflow = '';
  $('buka-kamera').focus();
}
function jepret() {
  const v = $('video');
  if (!v.videoWidth) return;
  hentiPantau();
  // video tampil "cover": hitung bagian video yang ada di dalam bingkai
  const { sx, sy, sw: lebar, sh } = kotakBingkai(v);
  const sw = lebar * 0.72; // kiri 72%: tulisan KTP; foto di kanan tidak perlu dibaca
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

// ===== Nomor di KTA lama (Tahap 17): dicek langsung ke server (rpc cek_nomor_kta_lama) =====
const KET_NOMOR = 'Isi hanya untuk pemegang KTA lama. Kosongkan untuk jamaah baru.';
let cekNomor = { nilai: '', hasil: null }, tundaNomor;
function tampilNomorLama(h) {
  const k = $('k-nomor-lama'); k.className = 'ket'; $('nomor-lama').removeAttribute('aria-invalid');
  if (!h) { k.textContent = KET_NOMOR; return; }
  if (h.status === 'bebas') { k.className = 'ket ket-ok'; k.textContent = 'Nomor ini belum dipakai. Akan menjadi Nomor Anggota jamaah ini.'; return; }
  k.className = 'ket ket-salah'; $('nomor-lama').setAttribute('aria-invalid', 'true');
  if (h.status === 'tidak_valid') k.textContent = 'Nomor KTA lama harus 10 angka dan diawali 1165.';
  else if (h.status === 'dipakai') k.innerHTML = `Nomor ini sudah dipakai <strong>${hurufAman(h.nama)}</strong> (Desa ${hurufAman(h.desa)}, Kec. ${hurufAman(h.kecamatan)}). `
    + `<a href="/jamaah-isi.html?id=${Number(h.id)}" target="_blank" rel="noopener">Lihat data</a>. Bila orangnya sama, tidak perlu didaftarkan lagi.`;
  else k.textContent = `Nomor ini sudah dipakai jamaah di Kec. ${h.kecamatan} (di luar wilayah Anda). Hubungi admin pusat untuk memeriksanya.`;
}
async function periksaNomorLama() {
  const v = $('nomor-lama').value;
  if (!v) { cekNomor = { nilai: '', hasil: null }; tampilNomorLama(null); return null; }
  if (!/^1165\d{6}$/.test(v)) { const h = { status: 'tidak_valid' }; cekNomor = { nilai: v, hasil: h }; tampilNomorLama(h); return h; }
  if (cekNomor.nilai === v && cekNomor.hasil) return cekNomor.hasil;
  const h = await dbKirim('POST', 'rpc/cek_nomor_kta_lama', { p_nomor: Number(v) });
  cekNomor = { nilai: v, hasil: h };
  if ($('nomor-lama').value === v) tampilNomorLama(h);
  return h;
}
$('nomor-lama').addEventListener('input', () => {
  const el = $('nomor-lama'), bersih = el.value.replace(/\D/g, '').slice(0, 10);
  if (el.value !== bersih) el.value = bersih;
  clearTimeout(tundaNomor);
  if (bersih.length === 10 || !bersih) tundaNomor = setTimeout(() => periksaNomorLama().catch(() => {}), 300);
  else tampilNomorLama(null);
});
$('nomor-lama').addEventListener('blur', () => { if ($('nomor-lama').value) periksaNomorLama().catch(() => {}); });

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
    const hNomor = await periksaNomorLama();
    if (hNomor && hNomor.status !== 'bebas') { $('nomor-lama').focus(); pesanForm('Nomor di KTA lama belum bisa dipakai. Lihat keterangan di bawah isian nomor.'); return; }
    const idLama = desaIdLokal();
    if (idLama && await cekDobel(nama, idLama)) return;
    const ktp = bacaIsianKtp();
    siapKirim = {
      nama, alamat: $('alamat').value.trim() || null,
      tempat_lahir: $('tempat-lahir').value.trim() ? KTP.judul($('tempat-lahir').value) : null, tanggal_lahir: $('tgl-lahir').value || null, ...ktp,
      pekerjaan: $('pekerjaan').value.trim() ? KTP.judul($('pekerjaan').value) : null,
      mursyid_id: $('mursyid').value ? Number($('mursyid').value) : null, tanggal_daftar: $('tanggal').value || undefined,
      ...($('nomor-lama').value ? { nomor_anggota: Number($('nomor-lama').value) } : {}),
    };
    const lahir = [siapKirim.tempat_lahir, tglPanjang(siapKirim.tanggal_lahir)].filter(Boolean).join(', ');
    const baris = [
      ['Nomor Anggota', siapKirim.nomor_anggota ? `${siapKirim.nomor_anggota} (dari KTA lama)` : 'Dibuat otomatis'],
      ['Mursyid', teksPilihan('mursyid')], ['Tanggal daftar', tglPanjang($('tanggal').value)],
      ['Nama lengkap', nama], ['Tempat, tanggal lahir', lahir], ['Umur saat daftar', umur !== null ? `${umur} tahun` : ''],
      ['Jenis kelamin', { L: 'Laki-laki', P: 'Perempuan' }[ktp.jenis_kelamin] || ''],
      ...(PERAN_GOLDAR.includes(peranSaya) ? [['Gol. darah', $('gol-darah').value]] : []),
      ['Status perkawinan', ktp.status_kawin], ['Kewarganegaraan', ktp.kewarganegaraan], ['Pekerjaan', siapKirim.pekerjaan],
      ['Kab/Kota', KTP.judul($('kabupaten').value.replace(/\s+/g, ' ')) + ($('k-prov').textContent ? `, ${$('k-prov').textContent.replace('Provinsi ', '')}` : '')],
      ['Kecamatan', KTP.judul($('kecamatan').value.replace(/\s+/g, ' '))], ['Kel/Desa', KTP.judul($('desa').value.replace(/\s+/g, ' '))],
      ['Dusun/Jalan', [siapKirim.alamat, ktp.rt_rw && `RT/RW ${ktp.rt_rw}`].filter(Boolean).join(', ')],
    ];
    $('k-rincian').innerHTML = baris.map(([k, v]) => `<div${String(v ?? '').length > 28 ? ' class="penuh"' : ''}><dt>${k}</dt><dd>${v ? hurufAman(v) : '<span class="kosong">Belum diisi</span>'}</dd></div>`).join('');
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
    const [j] = await dbKirim('POST', 'jamaah?select=id,nomor_anggota,nama,asal,desa(nama)', { ...siapKirim, desa_id: desaId });
    if (PERAN_GOLDAR.includes(peranSaya) && $('gol-darah').value) await simpanGoldar(j.id, $('gol-darah').value, false).catch(() => {});
    siapKirim = null;
    $('selesai-teks').innerHTML = `<strong>${hurufAman(j.nama)}</strong> dari Desa ${hurufAman(j.desa.nama)}<br>Nomor Anggota <strong class="angka">${j.nomor_anggota}</strong>`
      + (j.asal === 'daftar_ulang' ? '<br><span class="stat stat-aktif">Daftar ulang KTA lama</span>' : '');
    $('lihat-data').href = `/jamaah-isi.html?id=${j.id}`;
    $('buat-pin').href = `/kta.html?id=${j.id}`;
    cekNomor = { nilai: '', hasil: null };
    tampil('selesai');
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    $('pesan-konfirmasi').textContent = err.detail?.code === '23505' ? 'Nomor Anggota ini sudah dipakai jamaah lain. Tekan Ubah lalu periksa Nomor di KTA lama.'
      : err.detail?.code === '22023' ? 'Nomor KTA lama harus 10 angka dan diawali 1165. Tekan Ubah lalu perbaiki.'
      : err.detail?.message === 'di luar wilayah tugas' ? 'Wilayah ini di luar wilayah tugas akun ini. Tekan Ubah lalu periksa ejaan desa dan kecamatan.'
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
