// Rincian, tambah, dan ubah satu jamaah. Hak ubah dijaga RLS (koordinator hanya kecamatannya).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, kecBoleh = null, peran = '', goldar = '', perbaruiSaran = () => {};

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t, ok) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan' + (ok ? ' ok' : ''); };
const tgl = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
const statusDari = (j) => j.wafat ? 'wafat' : j.aktif ? 'aktif' : 'tidak';
const TEKS_STATUS = { aktif: 'Aktif', tidak: 'Tidak aktif', wafat: 'Wafat' };
const PILIH = 'id,nomor_anggota,nama,tempat_lahir,tanggal_lahir,jenis_kelamin,rt_rw,status_kawin,kewarganegaraan,umur_daftar,pekerjaan,alamat,desa_id,mursyid_id,tanggal_daftar,aktif,wafat,tanggal_wafat,desa(nama,kecamatan_id,kecamatan(nama,kabupaten(nama))),mursyid(nama)';

function tampilLihat() {
  const j = data, s = statusDari(j);
  document.title = `${j.nama} · SILSILAH TQN Cukir`;
  $('l-nomor').textContent = `Nomor Anggota ${j.nomor_anggota}`;
  $('l-nama').textContent = j.nama;
  $('l-status').textContent = TEKS_STATUS[s];
  $('l-status').className = `stat stat-${s}`;
  const baris = [
    ['Mursyid', j.mursyid?.nama], ['Tanggal daftar', tgl(j.tanggal_daftar)],
    ['Tempat, tanggal lahir', [j.tempat_lahir, j.tanggal_lahir && tgl(j.tanggal_lahir)].filter(Boolean).join(', ')],
    ['Umur saat mendaftar', j.umur_daftar ? `${j.umur_daftar} tahun` : null],
    ['Umur sekarang', j.tanggal_lahir && !j.wafat ? `${hitungUmur(j.tanggal_lahir)} tahun` : null],
    ['Jenis kelamin', { L: 'Laki-laki', P: 'Perempuan' }[j.jenis_kelamin]],
    ...(PERAN_GOLDAR.includes(peran) ? [['Gol. darah', goldar]] : []),
    ['Status perkawinan', j.status_kawin], ['Kewarganegaraan', j.kewarganegaraan], ['Pekerjaan', j.pekerjaan],
    ['Kab/Kota', j.desa.kecamatan.kabupaten?.nama], ['Kecamatan', j.desa.kecamatan.nama], ['Kel/Desa', j.desa.nama],
    ['Dusun/Jalan', j.alamat], ['RT/RW', j.rt_rw],
  ];
  if (j.wafat) baris.push(['Tanggal wafat', tgl(j.tanggal_wafat)]);
  $('l-rincian').innerHTML = baris.map(([k, v]) => `<div${String(v ?? '').length > 28 ? ' class="penuh"' : ''}><dt>${k}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
  $('ke-ahli').hidden = !j.wafat; $('ke-ahli').href = `/ahli-kubur-isi.html?kunci=j${j.id}`;
  $('form').hidden = true; $('lihat').hidden = false;
  $('bantuan').hidden = !PERAN_BANTUAN.includes(peran);
  $('ekonomi').hidden = !PERAN_EKONOMI.includes(peran) || !j.aktif || j.wafat;
}

// Kondisi ekonomi (rahasia; rpc daftar_ekonomi, hanya jamaah aktif & hidup; koordinator hanya wilayahnya).
async function muatEkonomi() {
  if ($('ekonomi').hidden) return;
  try {
    const [x] = await dbKirim('POST', 'rpc/daftar_ekonomi', { p_jamaah_id: data.id, p_batas: 1 });
    if (!x) { $('ekonomi').hidden = true; return; }
    $('ek-ubah').href = `/ekonomi-isi.html?jamaah=${data.id}${x.tingkat ? '' : '&ubah=1'}`;
    $('ek-ubah').textContent = x.tingkat ? 'Lihat & ubah' : 'Isi kondisi';
    $('ek-isi').textContent = x.tingkat
      ? `${TINGKAT_EKONOMI[x.tingkat][0]} · ${x.tanggungan} tanggungan · didata ${tglWib(x.didata_tgl + 'T12:00:00+07:00', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'Belum didata. Rahasia: hanya ketua, bendahara, dan koordinator wilayahnya yang melihat.';
  } catch { $('ekonomi').hidden = true; }
}

// Riwayat bantuan sosial (rpc daftar_bantuan; koordinator hanya wilayahnya — di luar wilayah daftar kosong & bagian disembunyikan).
async function muatBantuan() {
  if (!PERAN_BANTUAN.includes(peran)) return;
  $('bs-ajukan').href = `/bantuan-isi.html?nomor=${data.nomor_anggota}`;
  try {
    const b = await dbKirim('POST', 'rpc/daftar_bantuan', { p_jamaah_id: data.id, p_batas: 10 });
    $('bs-isi').innerHTML = b.length ? b.map((x) => {
      const [st] = STATUS_BANTUAN[x.status];
      const waktu = x.disalurkan_tgl ? tglWib(x.disalurkan_tgl + 'T12:00:00+07:00', { day: 'numeric', month: 'short', year: 'numeric' }) : tglWib(x.diajukan_pada, { day: 'numeric', month: 'short', year: 'numeric' });
      return `<li><a href="/bantuan-isi.html?id=${x.id}"><span>${hurufAman(JENIS_BANTUAN[x.jenis])}: ${hurufAman(teksBantuan(x))}<small>${st} · ${waktu}</small></span></a></li>`;
    }).join('') + (Number(b[0].total) > b.length ? `<li class="dsb-ket">Menampilkan ${b.length} terbaru dari ${b[0].total}. Lihat semua di halaman Bantuan Sosial.</li>` : '')
      : '<li class="dsb-ket">Belum pernah menerima atau diajukan bantuan.</li>';
  } catch { $('bantuan').hidden = true; }
}

function aturWafat() { $('isian-wafat').hidden = document.querySelector('[name=status]:checked').value !== 'wafat'; }

function tampilForm() {
  const j = data;
  $('f-judul').textContent = j ? 'Ubah data jamaah' : 'Tambah jamaah';
  $('f-sub').textContent = j ? `Nomor Anggota ${j.nomor_anggota}` : 'Nomor Anggota dibuat otomatis setelah disimpan.';
  $('nama').value = j?.nama || '';
  $('desa').value = j?.desa.nama || '';
  $('kecamatan').value = j?.desa.kecamatan.nama || '';
  $('kabupaten').value = j?.desa.kecamatan.kabupaten?.nama || wilayahAwal();
  perbaruiSaran();
  $('alamat').value = j?.alamat || '';
  $('tempat-lahir').value = j?.tempat_lahir || '';
  isiIsianKtp(j);
  $('gol-darah').value = goldar || '';
  $('tgl-lahir').value = j?.tanggal_lahir || '';
  $('pekerjaan').value = j?.pekerjaan || '';
  $('mursyid').value = j?.mursyid_id ? String(j.mursyid_id) : '';
  $('tanggal').value = j?.tanggal_daftar || new Date().toLocaleDateString('sv-SE');
  document.querySelector(`[name=status][value=${j ? statusDari(j) : 'aktif'}]`).checked = true;
  $('tgl-wafat').value = j?.tanggal_wafat || '';
  aturWafat();
  aturUmur();
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false; $('bantuan').hidden = true; $('ekonomi').hidden = true;
  $('nama').focus();
}

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
const aturUmur = pasangUmurOtomatis();
document.querySelectorAll('[name=status]').forEach((r) => r.addEventListener('change', aturWafat));
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/jamaah.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/jamaah.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = $('nama').value.trim().replace(/\s+/g, ' ');
  const umur = $('tgl-lahir').value ? hitungUmur($('tgl-lahir').value, $('tanggal').value || undefined) : null; // umur_daftar dihitung database
  const status = document.querySelector('[name=status]:checked').value;
  if (nama.length < 2) return salah('nama', 'Nama lengkap belum diisi.');
  if (!$('desa').value.trim()) return salah('desa', 'Desa/Kelurahan belum diisi.');
  if (!$('kecamatan').value.trim()) return salah('kecamatan', 'Kecamatan belum diisi.');
  if (!$('kabupaten').value.trim()) return salah('kabupaten', 'Kabupaten/Kota belum diisi.');
  if (umur !== null && (umur < 5 || umur > 120)) return salah('tgl-lahir', 'Tanggal lahir belum benar: umur saat daftar harus 5 sampai 120 tahun.');
  const isi = {
    nama, desa_id: null, alamat: $('alamat').value.trim() || null,
    tempat_lahir: $('tempat-lahir').value.trim() || null, tanggal_lahir: $('tgl-lahir').value || null, ...bacaIsianKtp(),
    pekerjaan: $('pekerjaan').value.trim() || null, mursyid_id: $('mursyid').value ? Number($('mursyid').value) : null,
    tanggal_daftar: $('tanggal').value || undefined,
    aktif: status === 'aktif', wafat: status === 'wafat', tanggal_wafat: status === 'wafat' ? ($('tgl-wafat').value || null) : null,
  };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    isi.desa_id = await desaIdWilayah();
    const [hasil] = data
      ? await dbKirim('PATCH', `jamaah?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `jamaah?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    if (PERAN_GOLDAR.includes(peran) && $('gol-darah').value !== goldar) {
      await simpanGoldar(hasil.id, $('gol-darah').value, !!goldar);
      goldar = $('gol-darah').value;
    }
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', `<p class="pesan ok" role="status">Tersimpan. Nomor Anggota ${hasil.nomor_anggota}.</p>`);
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(err.detail?.message === 'di luar wilayah tugas' ? 'Wilayah ini di luar wilayah tugas akun ini. Periksa ejaan desa dan kecamatan.'
      : err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501'
      ? 'Akun ini tidak punya izin mengubah jamaah di desa ini.'
      : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : 'Data belum tersimpan. Periksa isian lalu coba lagi.');
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    const bisaUbah = PERAN_UBAH_JAMAAH.includes(peran);
    const tugas = [dbGet('mursyid?select=id,nama&order=nama')];
    if (peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(dbGet(`jamaah?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    const [murs, ...lain] = await Promise.all(tugas);
    if (peran === 'koordinator_wilayah') kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    if (bisaUbah) perbaruiSaran = await muatWilayah(kecBoleh);
    $('mursyid').innerHTML += murs.map((m) => `<option value="${m.id}">${hurufAman(m.nama)}</option>`).join('');
    $('isian-goldar').hidden = !PERAN_GOLDAR.includes(peran);
    if (id && PERAN_GOLDAR.includes(peran)) goldar = (await dbGet(`jamaah_goldar?select=gol_darah&jamaah_id=eq.${encodeURIComponent(id)}`))[0]?.gol_darah || '';
    if (id) {
      data = lain[0]?.[0];
      if (!data) { pesan('Data jamaah tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      $('ubah').hidden = !bisaUbah || (kecBoleh && !kecBoleh.has(data.desa.kecamatan_id));
      $('lihat-kta').href = `/kta.html?id=${encodeURIComponent(id)}`; $('lihat-kta').hidden = false;
      tampilLihat();
      muatBantuan(); muatEkonomi();
    } else if (bisaUbah) {
      tampilForm();
    } else location.replace('/jamaah.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
