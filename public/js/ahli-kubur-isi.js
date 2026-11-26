// Rincian, tambah, ubah satu ahli kubur. kunci = j<jamaah_id> (jamaah wafat) atau a<id> (keluarga/masyayikh). Hak dijaga RLS.
const $ = (id) => document.getElementById(id);
let kunci = new URLSearchParams(location.search).get('kunci') || '';
let d = null, peran = '', kecBoleh = null, titip = null; // titip = jamaah penitip hasil periksa { id, nama, desa }

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const tglPanjang = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const JAMAAH_PILIH = 'id,nomor_anggota,nama,wafat,tanggal_wafat,desa(nama,kecamatan_id,kecamatan(nama,kabupaten(nama)))';
const asalTeks = (j) => j ? `${j.desa.nama}, Kec. ${j.desa.kecamatan.nama}, ${j.desa.kecamatan.kabupaten?.nama || ''}` : '';
const jenisDipilih = () => document.querySelector('[name=jenis]:checked').value;

function bolehUbah() {
  if (!d || !PERAN_KELOLA_AK.includes(peran)) return false;
  if (d.jenis === 'masyayikh') return ['admin_pusat', 'ketua'].includes(peran);
  if (!kecBoleh) return true;
  const kec = (d.jenis === 'jamaah' ? d.jamaah : d.penghubung)?.desa.kecamatan_id;
  return !!kec && kecBoleh.has(kec);
}

async function muatData() {
  if (kunci.startsWith('j')) {
    const jid = Number(kunci.slice(1));
    const [[j], [a]] = await Promise.all([dbGet(`jamaah?select=${JAMAAH_PILIH}&id=eq.${jid}`), dbGet(`ahli_kubur?select=*&jamaah_id=eq.${jid}`)]);
    if (!j || !j.wafat) return null;
    return { jenis: 'jamaah', id: a?.id || null, jamaah: j, nama: j.nama, tanggal_wafat: j.tanggal_wafat, bin_binti: a?.bin_binti, makam: a?.makam,
      keluarga_penghubung: a?.keluarga_penghubung, keterangan: a?.keterangan };
  }
  const [a] = await dbGet(`ahli_kubur?select=*&id=eq.${Number(kunci.slice(1))}`);
  if (!a || a.jenis === 'jamaah') return null;
  const penghubung = a.penghubung_jamaah_id ? (await dbGet(`jamaah?select=${JAMAAH_PILIH}&id=eq.${a.penghubung_jamaah_id}`))[0] || null : null;
  return { ...a, penghubung };
}

function tampilLihat() {
  document.title = `${d.nama} · Ahli Kubur · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = JENIS_AK[d.jenis];
  $('l-nama').textContent = d.nama;
  $('l-bin').textContent = d.bin_binti || '';
  const baris = [['Tanggal wafat', d.tanggal_wafat ? tglPanjang(d.tanggal_wafat) : 'Belum diketahui'], ['Lokasi makam', d.makam], ['Keluarga penghubung', d.keluarga_penghubung]];
  if (d.jenis === 'jamaah') baris.push(['Nomor Anggota', String(d.jamaah.nomor_anggota)], ['Alamat', asalTeks(d.jamaah)]);
  if (d.jenis === 'keluarga') baris.push(['Dititipkan oleh', d.penghubung ? `${d.penghubung.nama} (${d.penghubung.nomor_anggota}) · ${asalTeks(d.penghubung)}` : (d.penghubung_jamaah_id ? 'Jamaah di luar wilayah akun ini' : '')],
    ['Hubungan', d.hubungan]);
  baris.push(['Keterangan', d.keterangan]);
  $('l-rincian').innerHTML = baris.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
  $('ubah').hidden = !bolehUbah();
  $('ke-jamaah').hidden = d.jenis !== 'jamaah';
  if (d.jenis === 'jamaah') $('ke-jamaah').href = `/jamaah-isi.html?id=${d.jamaah.id}`;
  $('form').hidden = true; $('lihat').hidden = false;
}

function aturJenis() {
  const jenis = d?.jenis || jenisDipilih(), keluarga = jenis === 'keluarga', jamaah = jenis === 'jamaah';
  $('isian-jenis').hidden = !!d;
  $('isian-nama').hidden = jamaah; $('isian-tgl').hidden = jamaah; $('ket-jamaah').hidden = !jamaah;
  for (const id of ['b-titip', 'isian-titip', 'isian-hubungan']) $(id).hidden = !keluarga;
  $('titip-wajib').hidden = !(keluarga && kecBoleh); // koordinator wajib menyebut penitip dari kecamatannya
}

function tampilForm() {
  $('f-judul').textContent = d ? `Ubah ${JENIS_AK[d.jenis].toLowerCase()}` : 'Tambah ahli kubur';
  $('f-sub').hidden = !!d;
  $('nama').value = d?.nama || ''; $('bin').value = d?.bin_binti || '';
  $('tgl-wafat').value = d?.tanggal_wafat || '';
  $('makam').value = d?.makam || ''; $('penghubung').value = d?.keluarga_penghubung || ''; $('keterangan').value = d?.keterangan || '';
  titip = d?.penghubung ? { id: d.penghubung.id, nama: d.penghubung.nama, desa: d.penghubung.desa.nama } : null;
  $('titip-nomor').value = d?.penghubung?.nomor_anggota || '';
  $('titip-nama').textContent = titip ? `${titip.nama} · ${titip.desa}` : '';
  $('hubungan').value = d?.hubungan || '';
  aturJenis(); pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false;
  (d?.jenis === 'jamaah' ? $('bin') : $('nama')).focus();
}

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }

// Periksa Nomor Anggota penitip (RLS: koordinator hanya menemukan jamaah kecamatannya).
async function periksaTitip() {
  const n = $('titip-nomor').value.replace(/\D/g, '');
  titip = null; $('titip-nama').textContent = '';
  if (!n) return true;
  if (n.length !== 10) { salah('titip-nomor', 'Nomor Anggota penitip harus 10 angka.'); return false; }
  const [j] = await dbGet(`jamaah?select=${JAMAAH_PILIH}&nomor_anggota=eq.${n}`);
  if (!j) { salah('titip-nomor', kecBoleh ? 'Nomor tidak ditemukan di wilayah tugas akun ini.' : 'Nomor Anggota tidak terdaftar.'); return false; }
  titip = { id: j.id, nama: j.nama, desa: j.desa.nama };
  $('titip-nama').textContent = `${j.nama} · ${asalTeks(j)}`;
  return true;
}
$('titip-cek').onclick = () => periksaTitip().catch((e) => tanganiGalat(e, pesanForm));
$('titip-nomor').addEventListener('change', () => periksaTitip().catch(() => {}));

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
document.querySelectorAll('[name=jenis]').forEach((r) => r.addEventListener('change', aturJenis));
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (d ? tampilLihat() : location.assign('/ahli-kubur.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/ahli-kubur.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jenis = d?.jenis || jenisDipilih();
  const teks = (id) => $(id).value.trim().replace(/\s+/g, ' ') || null;
  const isi = { bin_binti: teks('bin'), makam: teks('makam'), keluarga_penghubung: teks('penghubung'), keterangan: teks('keterangan') };
  if (jenis !== 'jamaah') {
    isi.nama = teks('nama'); isi.tanggal_wafat = $('tgl-wafat').value || null;
    if (!isi.nama || isi.nama.length < 2) return salah('nama', 'Nama almarhum/almarhumah belum diisi.');
  }
  if (/\d{8,}/.test(`${isi.keluarga_penghubung} ${isi.keterangan}`)) return salah('penghubung', 'Jangan menulis nomor HP. Cukup nama keluarga penghubung.');
  if (jenis === 'keluarga') {
    try { if (!(await periksaTitip())) return; } catch (err) { return tanganiGalat(err, pesanForm); }
    if (kecBoleh && !titip) return salah('titip-nomor', 'Isi Nomor Anggota jamaah yang menitipkan (dari kecamatan tugas akun ini).');
    isi.penghubung_jamaah_id = titip?.id || null; isi.hubungan = titip ? ($('hubungan').value || null) : null;
  }
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    let hasil;
    if (d?.id) [hasil] = await dbKirim('PATCH', `ahli_kubur?id=eq.${d.id}`, isi);
    else [hasil] = await dbKirim('POST', 'ahli_kubur', jenis === 'jamaah' ? { ...isi, jenis, jamaah_id: d.jamaah.id } : { ...isi, jenis });
    if (!hasil) throw new Error('ditolak');
    if (jenis !== 'jamaah') kunci = `a${hasil.id}`;
    history.replaceState(null, '', `?kunci=${kunci}`);
    d = await muatData();
    tampilLihat(); pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', '<p class="pesan ok" role="status">Tersimpan.</p>');
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501' ? 'Akun ini tidak punya izin mengubah data ini.'
      : err.detail?.code === 'P0001' && err.detail.message ? err.detail.message
      : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : 'Data belum tersimpan. Periksa isian lalu coba lagi.');
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (peran === 'koordinator_wilayah') kecBoleh = new Set((await dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`)).map((w) => w.kecamatan_id));
    $('hubungan').innerHTML += HUBUNGAN_AK.map((h) => `<option>${h}</option>`).join('');
    $('tgl-wafat').max = hariIniWib();
    $('pil-masyayikh').hidden = !['admin_pusat', 'ketua'].includes(peran);
    if (/^[ja]\d+$/.test(kunci)) {
      d = await muatData();
      if (!d) { pesan('Data tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      tampilLihat();
    } else if (PERAN_KELOLA_AK.includes(peran)) tampilForm();
    else location.replace('/ahli-kubur.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
