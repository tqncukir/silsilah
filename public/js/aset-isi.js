// Rincian, tambah, ubah, lepas, dan aktifkan kembali satu aset (tanah wakaf / barang inventaris).
// Hak dijaga RLS: lihat admin pusat, ketua, bendahara, nadzir; tulis admin pusat, ketua, nadzir. Tidak ada hapus.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const jenis = q.get('jenis') === 'barang' ? 'barang' : 'tanah';
const TANAH = jenis === 'tanah';
const TABEL = TANAH ? 'tanah_wakaf' : 'barang_inventaris';
const PILIH = TANAH ? '*,desa(nama,kecamatan(nama,kabupaten(nama)))' : '*';
let id = q.get('id'), data = null, bolehCatat = false, wilayahSiap = false;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
const tglTeks = (d) => d ? tglWib(d + 'T12:00:00+07:00', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
const pilihan = (obj) => Object.entries(obj).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };
const galatTeks = (err, dasar) => err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.'
  : err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501' ? 'Akun ini tidak berhak mengubah data aset.'
  : err.detail?.code === '22023' && err.detail.message ? `Isian belum benar: ${err.detail.message}.` : dasar;
// Luas: "1.250,5" atau "1250.5" -> 1250.5
const bacaLuas = (t) => { const s = t.trim().replace(/\s/g, ''); const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : NaN; };
const angkaDari = (el) => Number(el.value.replace(/\D/g, '') || 0);

$('kembali').href = `/aset.html${TANAH ? '' : '?jenis=barang'}`;
$('kembali-teks').textContent = TANAH ? 'Tanah wakaf' : 'Barang inventaris';
for (const el of document.querySelectorAll('[data-grup]')) el.hidden = el.dataset.grup !== jenis;
$('peruntukan').innerHTML = '<option value="">Pilih...</option>' + pilihan(PERUNTUKAN_WAKAF);
$('sertifikat').innerHTML = pilihan(SERTIFIKAT_WAKAF);
$('kategori').innerHTML = '<option value="">Pilih...</option>' + pilihan(KATEGORI_BARANG);
$('cara').innerHTML = pilihan(CARA_PEROLEHAN);
$('kondisi').innerHTML = pilihan(KONDISI_ASET);
$('nama-label').innerHTML = `${TANAH ? 'Nama tanah/bangunan' : 'Nama barang'} <span class="wajib">wajib</span>`;
$('nama').placeholder = TANAH ? 'Mis. Masjid Al-Ikhlas Cukir' : 'Mis. Sound system masjid';
$('nilai').addEventListener('input', () => {
  const n = $('nilai').value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  $('nilai').value = n ? Number(n).toLocaleString('id-ID') : '';
});
const aturNoSertifikat = () => {
  $('no-sertifikat-label').innerHTML = `Nomor sertifikat wakaf${$('sertifikat').value === 'sertifikat' ? ' <span class="wajib">wajib</span>' : ''}`;
};
$('sertifikat').addEventListener('change', aturNoSertifikat);

// ===== Rincian =====
function tampilLihat() {
  const a = data, lepas = a.status === 'dilepas';
  document.title = `${a.nama} · SILSILAH TQN Cukir`;
  $('l-label').textContent = TANAH ? `Tanah wakaf · ${PERUNTUKAN_WAKAF[a.peruntukan]}` : `Barang · ${KATEGORI_BARANG[a.kategori]}`;
  $('l-nama').textContent = a.nama;
  $('l-besar').textContent = TANAH ? luasTeks(a.luas_m2) : `${angka(a.jumlah)} unit`;
  const [st, kelas] = lepas ? ['Dilepas', 'stat-wafat'] : a.kondisi === 'baik' ? ['Aktif · kondisi baik', 'stat-aktif']
    : [`Aktif · ${KONDISI_ASET[a.kondisi].toLowerCase()}`, a.kondisi === 'rusak' ? 'stat-wafat' : 'stat-tidak'];
  $('l-status').textContent = st; $('l-status').className = `stat ${kelas}`;
  const baris = TANAH ? [
    ['Kel/Desa', a.desa?.nama], ['Kecamatan', a.desa?.kecamatan?.nama], ['Kab/Kota', a.desa?.kecamatan?.kabupaten?.nama],
    ['Dusun/Jalan', a.alamat], ['Wakif', a.wakif], ['Nadzir', a.nadzir],
    ['Status sertifikat', SERTIFIKAT_WAKAF[a.status_sertifikat]], ['Tanggal ikrar', tglTeks(a.tgl_ikrar)],
    ['Nomor AIW', a.no_aiw], ['Nomor sertifikat', a.no_sertifikat], ['Letak dokumen asli', a.letak_arsip],
  ] : [
    ['Cara perolehan', CARA_PEROLEHAN[a.cara_perolehan]], ['Tahun perolehan', a.tahun_perolehan ? String(a.tahun_perolehan) : null],
    ['Perkiraan nilai', a.nilai ? rupiah(a.nilai) : null], ['Lokasi simpan', a.lokasi_simpan], ['Pemegang', a.pemegang],
  ];
  baris.push(['Keterangan', a.keterangan],
    ['Dilepas', lepas ? tglTeks(a.dilepas_tgl) : null], ['Alasan dilepas', lepas ? a.alasan_lepas : null],
    ['Terakhir diubah', `${tglWib(a.diubah_pada, { day: 'numeric', month: 'long', year: 'numeric' })}, ${jamWib(a.diubah_pada)} WIB`]);
  $('l-rincian').innerHTML = baris.filter(([, v]) => v)
    .map(([k, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${k}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('ubah').hidden = !bolehCatat;
  $('lepas').hidden = !bolehCatat || lepas;
  $('aktifkan-bungkus').hidden = !bolehCatat || !lepas;
  $('lp-tanggal').value = hariIniWib(); $('lp-tanggal').max = hariIniWib(); $('lp-alasan').value = '';
  $('form').hidden = true; $('lihat').hidden = false;
}

// ===== Formulir =====
async function bukaForm() {
  const a = data;
  $('f-judul').textContent = a ? `Ubah ${TANAH ? 'tanah wakaf' : 'barang'}` : TANAH ? 'Tambah tanah wakaf' : 'Tambah barang';
  $('f-sub').textContent = TANAH ? 'Catat sesuai dokumen. Scan dokumen tidak disimpan; tulis letak dokumen aslinya.'
    : 'Barang milik yayasan. Pembelian dicatat sendiri di Buku Kas oleh bendahara.';
  $('nama').value = a?.nama || '';
  $('kondisi').value = a?.kondisi || 'baik';
  $('keterangan').value = a?.keterangan || '';
  if (TANAH) {
    if (!wilayahSiap) { wilayahSiap = true; await muatWilayah().catch(() => {}); }
    $('kabupaten').value = a?.desa?.kecamatan?.kabupaten?.nama || (a ? '' : 'Jombang');
    $('kecamatan').value = a?.desa?.kecamatan?.nama || '';
    $('desa').value = a?.desa?.nama || '';
    Wilayah.provinsi?.();
    $('alamat').value = a?.alamat || '';
    $('luas').value = a ? String(Number(a.luas_m2)).replace('.', ',') : '';
    $('peruntukan').value = a?.peruntukan || '';
    $('wakif').value = a?.wakif || '';
    $('nadzir').value = a?.nadzir || '';
    $('sertifikat').value = a?.status_sertifikat || 'belum_aiw';
    $('tgl-ikrar').value = a?.tgl_ikrar || '';
    $('tgl-ikrar').max = hariIniWib();
    $('no-aiw').value = a?.no_aiw || '';
    $('no-sertifikat').value = a?.no_sertifikat || '';
    $('letak-arsip').value = a?.letak_arsip || '';
    aturNoSertifikat();
  } else {
    $('kategori').value = a?.kategori || '';
    $('jumlah').value = a ? String(a.jumlah) : '1';
    $('cara').value = a?.cara_perolehan || 'beli';
    $('tahun').value = a?.tahun_perolehan ? String(a.tahun_perolehan) : '';
    $('nilai').value = a?.nilai ? angka(a.nilai) : '';
    $('lokasi').value = a?.lokasi_simpan || '';
    $('pemegang').value = a?.pemegang || '';
  }
  pesanForm('');
  for (const el of $('form').querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  $('lihat').hidden = true; $('form').hidden = false; pesan('');
  $('nama').focus();
}

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }
const teks = (idEl) => $(idEl).value.trim().replace(/\s+/g, ' ') || null;
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = teks('nama') || '', ket = teks('keterangan');
  if (nama.length < 2) return salah('nama', 'Nama belum diisi.');
  const isi = { nama, kondisi: $('kondisi').value, keterangan: ket };
  if (TANAH) {
    const luas = bacaLuas($('luas').value);
    if (!$('kabupaten').value.trim()) return salah('kabupaten', 'Kabupaten/Kota belum diisi.');
    if (!$('kecamatan').value.trim()) return salah('kecamatan', 'Kecamatan belum diisi.');
    if (!$('desa').value.trim()) return salah('desa', 'Desa/Kelurahan belum diisi.');
    if (!(luas > 0)) return salah('luas', 'Luas belum benar. Tulis angka dalam meter persegi, mis. 450 atau 1.250,5.');
    if (!$('peruntukan').value) return salah('peruntukan', 'Peruntukan belum dipilih.');
    if ((teks('wakif') || '').length < 2) return salah('wakif', 'Nama wakif belum diisi.');
    if ($('sertifikat').value === 'sertifikat' && !teks('no-sertifikat')) return salah('no-sertifikat', 'Nomor sertifikat wajib diisi bila sudah bersertifikat.');
    if (teks('nadzir') && teks('nadzir').length < 2) return salah('nadzir', 'Nama nadzir terlalu pendek.');
    Object.assign(isi, { alamat: teks('alamat'), luas_m2: Math.round(luas * 100) / 100, peruntukan: $('peruntukan').value,
      wakif: teks('wakif'), nadzir: teks('nadzir'), status_sertifikat: $('sertifikat').value, tgl_ikrar: $('tgl-ikrar').value || null,
      no_aiw: teks('no-aiw'), no_sertifikat: teks('no-sertifikat'), letak_arsip: teks('letak-arsip') });
  } else {
    const jml = Number($('jumlah').value.replace(/\D/g, '')), th = $('tahun').value.trim();
    if (!$('kategori').value) return salah('kategori', 'Kategori belum dipilih.');
    if (!(jml >= 1 && jml <= 99999)) return salah('jumlah', 'Jumlah harus 1 sampai 99.999 unit.');
    if (th && !(/^\d{4}$/.test(th) && Number(th) >= 1900 && Number(th) <= Number(hariIniWib().slice(0, 4)))) return salah('tahun', 'Tahun perolehan belum benar, mis. 2024.');
    if (teks('pemegang') && teks('pemegang').length < 2) return salah('pemegang', 'Nama pemegang terlalu pendek.');
    Object.assign(isi, { kategori: $('kategori').value, jumlah: jml, cara_perolehan: $('cara').value,
      tahun_perolehan: th ? Number(th) : null, nilai: angkaDari($('nilai')) || null,
      lokasi_simpan: teks('lokasi'), pemegang: teks('pemegang') });
  }
  if (/\d{8,}/.test(ket || '')) return salah('keterangan', 'Jangan menulis nomor HP atau NIK di keterangan.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    if (TANAH) isi.desa_id = await dbKirim('POST', 'rpc/desa_id_aset', { p_kabupaten: $('kabupaten').value, p_kecamatan: $('kecamatan').value, p_desa: $('desa').value });
    const [hasil] = data
      ? await dbKirim('PATCH', `${TABEL}?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `${TABEL}?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    const baru = !data;
    data = hasil; id = String(hasil.id);
    history.replaceState(null, '', `?jenis=${jenis}&id=${hasil.id}`);
    tampilLihat();
    pesan(baru ? `${hasil.nama} tersimpan.` : 'Perubahan tersimpan.', true);
    scrollTo({ top: 0 });
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Data belum tersimpan. Periksa isian lalu coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

async function ubahStatus(isi, ok) {
  const [hasil] = await dbKirim('PATCH', `${TABEL}?id=eq.${data.id}&select=${PILIH}`, isi);
  if (!hasil) throw new Error('ditolak');
  data = hasil; tampilLihat(); pesan(ok, true); scrollTo({ top: 0 });
}
$('lepas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tgl = $('lp-tanggal').value, alasan = $('lp-alasan').value.trim().replace(/\s+/g, ' ');
  if (!tgl) { $('lp-tanggal').focus(); pesan('Tanggal dilepas belum diisi.'); return; }
  if (alasan.length < 3) { $('lp-alasan').setAttribute('aria-invalid', 'true'); $('lp-alasan').focus(); pesan('Tulis alasan dilepas (minimal 3 huruf).'); return; }
  if (!confirm(`Tandai "${data.nama}" sudah dilepas?\n\nData tetap tersimpan dan tidak dihitung lagi sebagai aset aktif. Bila keliru, bisa diaktifkan kembali.`)) return;
  $('lp-kirim').disabled = true;
  try { await ubahStatus({ status: 'dilepas', dilepas_tgl: tgl, alasan_lepas: alasan }, 'Aset ditandai dilepas.'); }
  catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('lp-kirim').disabled = false; }
});
$('lp-alasan').addEventListener('input', () => $('lp-alasan').removeAttribute('aria-invalid'));
$('aktifkan').onclick = async () => {
  if (!confirm(`Aktifkan kembali "${data.nama}"?\n\nTanggal dan alasan dilepas akan dihapus dari data (tetap tercatat di riwayat perubahan).`)) return;
  $('aktifkan').disabled = true;
  try { await ubahStatus({ status: 'aktif', dilepas_tgl: null, alasan_lepas: null }, 'Aset aktif kembali.'); }
  catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('aktifkan').disabled = false; }
};

$('ubah').onclick = bukaForm;
$('batal').onclick = () => { if (data) { tampilLihat(); pesan(''); } else location.assign($('kembali').href); };
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (/\/aset(\.html)?([?#]|$)/.test(document.referrer)) { e.preventDefault(); history.back(); } };

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_ASET.includes(p.peran)) { location.replace('/beranda.html'); return; }
    bolehCatat = PERAN_CATAT_ASET.includes(p.peran);
    if (id) {
      [data] = await dbGet(`${TABEL}?select=${PILIH}&id=eq.${Number(id)}`);
      if (!data) { pesan('Aset tidak ditemukan atau akun ini tidak berhak melihatnya.'); return; }
      tampilLihat();
    } else if (bolehCatat) await bukaForm();
    else location.replace($('kembali').href);
  } catch (e) { tanganiGalat(e, pesan); }
})();
