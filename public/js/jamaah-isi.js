// Rincian, tambah, dan ubah satu jamaah. Hak ubah dijaga RLS (koordinator hanya kecamatannya).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, semuaDesa = [], kecBoleh = null, peran = '';

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t, ok) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan' + (ok ? ' ok' : ''); };
const tgl = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
const statusDari = (j) => j.wafat ? 'wafat' : j.aktif ? 'aktif' : 'tidak';
const TEKS_STATUS = { aktif: 'Aktif', tidak: 'Tidak aktif', wafat: 'Wafat' };
const PILIH = 'id,nomor_anggota,nama,umur_daftar,pekerjaan,alamat,desa_id,mursyid_id,tanggal_daftar,aktif,wafat,tanggal_wafat,desa(nama,kecamatan_id,kecamatan(nama,kabupaten(nama))),mursyid(nama)';

function tampilLihat() {
  const j = data, s = statusDari(j);
  document.title = `${j.nama} · SILSILAH TQN Cukir`;
  $('l-nomor').textContent = `Nomor Anggota ${j.nomor_anggota}`;
  $('l-nama').textContent = j.nama;
  $('l-status').textContent = TEKS_STATUS[s];
  $('l-status').className = `stat stat-${s}`;
  const baris = [
    ['Desa', j.desa.nama], ['Kecamatan', j.desa.kecamatan.nama], ['Kabupaten/Kota', j.desa.kecamatan.kabupaten?.nama],
    ['Alamat', j.alamat], ['Umur saat mendaftar', j.umur_daftar ? `${j.umur_daftar} tahun` : null], ['Pekerjaan', j.pekerjaan],
    ['Mursyid', j.mursyid?.nama], ['Tanggal daftar', tgl(j.tanggal_daftar)],
  ];
  if (j.wafat) baris.push(['Tanggal wafat', tgl(j.tanggal_wafat)]);
  $('l-rincian').innerHTML = baris.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
  $('form').hidden = true; $('lihat').hidden = false;
}

function isiDesa(pilih) {
  const kec = $('kecamatan').value;
  $('desa').disabled = !kec;
  $('desa').innerHTML = `<option value="">${kec ? 'Pilih desa' : 'Pilih kecamatan dulu'}</option>` + semuaDesa
    .filter((d) => String(d.kecamatan_id) === kec)
    .map((d) => `<option value="${d.id}">${hurufAman(d.nama)}</option>`).join('');
  if (pilih) $('desa').value = String(pilih);
}

function aturWafat() { $('isian-wafat').hidden = document.querySelector('[name=status]:checked').value !== 'wafat'; }

function tampilForm() {
  const j = data;
  $('f-judul').textContent = j ? 'Ubah data jamaah' : 'Tambah jamaah';
  $('f-sub').textContent = j ? `Nomor Anggota ${j.nomor_anggota}` : 'Nomor Anggota dibuat otomatis setelah disimpan.';
  $('nama').value = j?.nama || '';
  $('kecamatan').value = j ? String(j.desa.kecamatan_id) : ($('kecamatan').options.length === 2 ? $('kecamatan').options[1].value : '');
  isiDesa(j?.desa_id);
  $('alamat').value = j?.alamat || '';
  $('umur').value = j?.umur_daftar || '';
  $('pekerjaan').value = j?.pekerjaan || '';
  $('mursyid').value = j?.mursyid_id ? String(j.mursyid_id) : '';
  $('tanggal').value = j?.tanggal_daftar || new Date().toLocaleDateString('sv-SE');
  document.querySelector(`[name=status][value=${j ? statusDari(j) : 'aktif'}]`).checked = true;
  $('tgl-wafat').value = j?.tanggal_wafat || '';
  aturWafat();
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false;
  $('nama').focus();
}

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('umur').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
$('kecamatan').addEventListener('change', () => isiDesa());
document.querySelectorAll('[name=status]').forEach((r) => r.addEventListener('change', aturWafat));
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/jamaah.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/jamaah.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = $('nama').value.trim().replace(/\s+/g, ' ');
  const umur = $('umur').value ? Number($('umur').value) : null;
  const status = document.querySelector('[name=status]:checked').value;
  if (nama.length < 2) return salah('nama', 'Nama lengkap belum diisi.');
  if (!$('kecamatan').value) return salah('kecamatan', 'Pilih kecamatan.');
  if (!$('desa').value) return salah('desa', 'Pilih desa.');
  if (umur !== null && (umur < 5 || umur > 120)) return salah('umur', 'Umur harus antara 5 dan 120 tahun.');
  const isi = {
    nama, desa_id: Number($('desa').value), alamat: $('alamat').value.trim() || null, umur_daftar: umur,
    pekerjaan: $('pekerjaan').value.trim() || null, mursyid_id: $('mursyid').value ? Number($('mursyid').value) : null,
    tanggal_daftar: $('tanggal').value || undefined,
    aktif: status === 'aktif', wafat: status === 'wafat', tanggal_wafat: status === 'wafat' ? ($('tgl-wafat').value || null) : null,
  };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    const [hasil] = data
      ? await dbKirim('PATCH', `jamaah?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `jamaah?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', `<p class="pesan ok" role="status">Tersimpan. Nomor Anggota ${hasil.nomor_anggota}.</p>`);
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501'
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
    const tugas = [dbGet('kecamatan?select=id,nama&order=nama'), dbGet('desa?select=id,nama,kecamatan_id&order=nama'), dbGet('mursyid?select=id,nama&order=nama')];
    if (peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(dbGet(`jamaah?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    const [kec, desa, murs, ...lain] = await Promise.all(tugas);
    if (peran === 'koordinator_wilayah') kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    semuaDesa = desa;
    $('kecamatan').innerHTML += kec.filter((k) => !kecBoleh || kecBoleh.has(k.id)).map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    $('mursyid').innerHTML += murs.map((m) => `<option value="${m.id}">${hurufAman(m.nama)}</option>`).join('');
    if (id) {
      data = lain[0]?.[0];
      if (!data) { pesan('Data jamaah tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      $('ubah').hidden = !bisaUbah || (kecBoleh && !kecBoleh.has(data.desa.kecamatan_id));
      tampilLihat();
    } else if (bisaUbah) {
      tampilForm();
    } else location.replace('/jamaah.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
