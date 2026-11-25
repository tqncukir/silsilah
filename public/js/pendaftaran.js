// Pendaftaran jamaah baru: foto KTP -> isi otomatis -> periksa -> simpan.
// Foto KTP hanya diproses di perangkat ini; tidak dikirim, tidak disimpan. NIK tidak diambil.
const $ = (id) => document.getElementById(id);
let semuaKec = [], semuaDesa = [], kecBoleh = null, dobelDiperiksa = '';
const ISIAN = ['nama', 'kecamatan', 'desa', 'alamat', 'umur', 'pekerjaan'];

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const tampil = (bag) => { for (const b of ['tahap-foto', 'form', 'selesai']) $(b).hidden = b !== bag; scrollTo({ top: 0 }); };

function isiDesa(pilih) {
  const kec = $('kecamatan').value;
  $('desa').disabled = !kec;
  $('desa').innerHTML = `<option value="">${kec ? 'Pilih desa' : 'Pilih kecamatan dulu'}</option>` + semuaDesa
    .filter((d) => String(d.kecamatan_id) === kec).map((d) => `<option value="${d.id}">${hurufAman(d.nama)}</option>`).join('');
  if (pilih) $('desa').value = String(pilih);
}

function kosongkan() {
  for (const k of ISIAN) { $(k).value = ''; $(k).classList.remove('otomatis'); $(k).removeAttribute('aria-invalid'); }
  $('mursyid').value = '';
  $('tanggal').value = new Date().toLocaleDateString('sv-SE');
  if ($('kecamatan').options.length === 2) $('kecamatan').value = $('kecamatan').options[1].value;
  isiDesa();
  $('hasil-baca').hidden = true; $('dobel').hidden = true; dobelDiperiksa = ''; pesanForm('');
}

function terapkan(h) {
  const tandai = (k, v) => { if (v === undefined || v === null || v === '') return; $(k).value = v; $(k).classList.add('otomatis'); };
  tandai('nama', h.nama); tandai('alamat', h.alamat); tandai('umur', h.umur); tandai('pekerjaan', h.pekerjaan);
  const kecDaftar = semuaKec.filter((k) => !kecBoleh || kecBoleh.has(k.id));
  let kec = KTP.cocokkan(h.kecamatan, kecDaftar);
  let desa = kec ? KTP.cocokkan(h.desa, semuaDesa.filter((d) => d.kecamatan_id === kec.id)) : null;
  if (!kec && h.desa) { // kecamatan tidak terbaca: cari desanya langsung
    desa = KTP.cocokkan(h.desa, semuaDesa.filter((d) => !kecBoleh || kecBoleh.has(d.kecamatan_id)));
    if (desa) kec = kecDaftar.find((k) => k.id === desa.kecamatan_id);
  }
  if (kec) { $('kecamatan').value = String(kec.id); $('kecamatan').classList.add('otomatis'); }
  isiDesa(desa?.id);
  if (desa) $('desa').classList.add('otomatis');
  const terisi = ISIAN.filter((k) => $(k).classList.contains('otomatis')).length;
  $('hasil-baca').hidden = terisi === 0;
  const kurang = [];
  if (!h.nama) kurang.push('nama');
  if (h.desa && !desa) kurang.push(`desa "${h.desa}" belum ada di daftar`);
  pesanForm(terisi === 0 ? 'Tulisan KTP belum terbaca. Isi manual atau foto ulang dengan cahaya lebih terang.'
    : kurang.length ? `Periksa: ${kurang.join(', ')}.` : '');
}

async function prosesFoto(e) {
  const berkas = e.target.files?.[0];
  e.target.value = '';
  if (!berkas) return;
  pesan('');
  $('membaca').hidden = false;
  $('membaca-teks').textContent = 'Menyiapkan pembaca KTP...'; $('membaca-persen').textContent = ''; $('bilah-isi').style.width = '5%';
  for (const b of document.querySelectorAll('.foto-pilih label, .foto-pilih button')) b.setAttribute('aria-disabled', 'true');
  try {
    const teks = await KTP.baca(berkas, (p) => {
      $('membaca-teks').textContent = 'Membaca KTP...';
      $('membaca-persen').textContent = `${Math.round(p * 100)}%`;
      $('bilah-isi').style.width = `${Math.max(5, p * 100)}%`;
    });
    const hasil = KTP.urai(teks);
    kosongkan(); terapkan(hasil);
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
$('kecamatan').addEventListener('change', () => { isiDesa(); $('dobel').hidden = true; });
$('desa').addEventListener('change', () => { $('dobel').hidden = true; });
$('umur').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
$('form').addEventListener('input', (e) => { e.target.classList?.remove('otomatis'); e.target.removeAttribute?.('aria-invalid'); });
$('keluar').onclick = keluar;

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = KTP.judul($('nama').value.replace(/\s+/g, ' '));
  const umur = $('umur').value ? Number($('umur').value) : null;
  if (nama.length < 2) return salah('nama', 'Nama lengkap belum diisi.');
  if (!$('kecamatan').value) return salah('kecamatan', 'Pilih kecamatan.');
  if (!$('desa').value) return salah('desa', 'Pilih desa.');
  if (umur !== null && (umur < 5 || umur > 120)) return salah('umur', 'Umur harus antara 5 dan 120 tahun.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Memeriksa...';
  pesanForm('');
  try {
    if (await cekDobel(nama, $('desa').value)) return;
    btn.querySelector('.teks').textContent = 'Menyimpan...';
    const [j] = await dbKirim('POST', 'jamaah?select=id,nomor_anggota,nama,desa(nama)', {
      nama, desa_id: Number($('desa').value), alamat: $('alamat').value.trim() || null, umur_daftar: umur,
      pekerjaan: $('pekerjaan').value.trim() ? KTP.judul($('pekerjaan').value) : null,
      mursyid_id: $('mursyid').value ? Number($('mursyid').value) : null, tanggal_daftar: $('tanggal').value || undefined,
    });
    $('selesai-teks').innerHTML = `<strong>${hurufAman(j.nama)}</strong> dari Desa ${hurufAman(j.desa.nama)}<br>Nomor Anggota <strong class="angka">${j.nomor_anggota}</strong>`;
    $('lihat-data').href = `/jamaah-isi.html?id=${j.id}`;
    tampil('selesai');
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(err.message === 'gagal-403' || err.detail?.code === '42501' ? 'Akun ini tidak punya izin mendaftarkan jamaah di desa ini.'
      : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : 'Data belum tersimpan. Periksa isian lalu coba lagi.');
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_UBAH_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    const tugas = [dbGet('kecamatan?select=id,nama&order=nama'), dbGet('desa?select=id,nama,kecamatan_id&order=nama'), dbGet('mursyid?select=id,nama&order=nama')];
    if (p.peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    const [kec, desa, murs, wil] = await Promise.all(tugas);
    if (wil) kecBoleh = new Set(wil.map((w) => w.kecamatan_id));
    semuaKec = kec; semuaDesa = desa;
    $('kecamatan').innerHTML += kec.filter((k) => !kecBoleh || kecBoleh.has(k.id)).map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    $('mursyid').innerHTML += murs.map((m) => `<option value="${m.id}">${hurufAman(m.nama)}</option>`).join('');
    kosongkan();
  } catch (e) { tanganiGalat(e, pesan); }
})();
