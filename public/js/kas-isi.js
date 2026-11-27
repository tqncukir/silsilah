// Rincian, catat, ubah, dan batalkan satu transaksi kas. Hak dijaga RLS + trigger (arah & kas tidak bisa diganti;
// yang dibatalkan tidak bisa diubah; bisyaroh hanya bendahara).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const id = q.get('id');
let data = null, peran = '', kasBoleh = [], kategori = [];

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const PILIH = 'id,kas_id,kategori_id,tanggal,jumlah,keterangan,nomor_bukti,dibatalkan,alasan_batal,dicatat_pada,diubah_pada,kas(nama),kategori_kas(arah,nama,rahasia)';
const tglPanjang = (ymd) => tglWib(ymd + 'T12:00:00+07:00');
const bolehTulis = (t) => kasBoleh.some((k) => k.kas_id === t.kas_id) && (!t.kategori_kas?.rahasia || peran === 'bendahara') && !t.dibatalkan;

function tampilLihat() {
  const t = data, masuk = t.kategori_kas.arah === 'masuk';
  document.title = `${t.kategori_kas.nama} · Buku Kas · SILSILAH TQN Cukir`;
  $('l-arah').textContent = `Uang ${masuk ? 'masuk' : 'keluar'} · ${t.kas?.nama || ''}`;
  $('l-judul').textContent = t.kategori_kas.nama;
  $('l-jumlah').textContent = `${masuk ? '+' : '−'}${rupiah(t.jumlah)}`;
  $('l-jumlah').className = 'kas-jumlah-besar' + (masuk ? ' masuk' : '');
  $('l-status').textContent = t.dibatalkan ? 'Dibatalkan' : '';
  $('l-status').className = t.dibatalkan ? 'stat stat-wafat' : 'stat';
  $('l-rincian').innerHTML = [
    ['Tanggal', tglPanjang(t.tanggal)],
    ['Kas', t.kas?.nama],
    ['Keterangan', t.keterangan],
    ['Nomor bukti', t.nomor_bukti],
    ['Dicatat', `${tglWib(t.dicatat_pada, { day: 'numeric', month: 'long', year: 'numeric' })}, ${jamWib(t.dicatat_pada)} WIB`],
    ...(t.dibatalkan ? [['Alasan dibatalkan', t.alasan_batal]] : []),
    ...(t.kategori_kas.rahasia ? [['Sifat', 'Rahasia: hanya ketua & bendahara yang melihat rinciannya']] : []),
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  const boleh = bolehTulis(t);
  $('ubah').hidden = !boleh;
  $('batal-form').hidden = !boleh;
  $('form').hidden = true; $('lihat').hidden = false;
}

function isiKategori(arah, pilih) {
  const daftar = kategori.filter((c) => c.arah === arah && (c.aktif || c.id === pilih) && (!c.rahasia || peran === 'bendahara'));
  $('kategori').innerHTML = arah ? '<option value="">Pilih kategori</option>' + daftar.map((c) => `<option value="${c.id}">${hurufAman(c.nama)}${c.rahasia ? ' (rahasia)' : ''}</option>`).join('')
    : '<option value="">Pilih masuk/keluar dulu</option>';
  $('kategori').value = pilih ? String(pilih) : '';
}
const angkaJumlah = () => Number($('jumlah').value.replace(/\D/g, '') || 0);

function tampilForm() {
  const t = data;
  $('f-judul').textContent = t ? 'Ubah transaksi' : 'Catat transaksi';
  const arah = t?.kategori_kas.arah || '';
  document.querySelectorAll('[name=arah]').forEach((r) => { r.checked = r.value === arah; r.disabled = !!t; });
  $('arah-isian').querySelector('legend').firstChild.textContent = t ? 'Masuk atau keluar (tidak bisa diganti) ' : 'Masuk atau keluar ';
  $('kas-isian').hidden = !!t || kasBoleh.length < 2;
  if (!t) $('kas').value = String((kasBoleh.find((k) => k.kas_id === Number(q.get('kas'))) || kasBoleh[0]).kas_id);
  isiKategori(arah, t?.kategori_id);
  $('tanggal').value = t?.tanggal || hariIniWib();
  $('jumlah').value = t ? Number(t.jumlah).toLocaleString('id-ID') : '';
  $('keterangan').value = t?.keterangan || '';
  $('bukti').value = t?.nomor_bukti || '';
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false;
  (t ? $('jumlah') : document.querySelector('[name=arah]')).focus();
}

function salah(idEl, t) { const el = $(idEl) || document.querySelector(`[name=${idEl}]`); el.setAttribute('aria-invalid', 'true'); el.focus(); pesanForm(t); }
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Data belum tersimpan, coba lagi.';
  if (err.detail?.code === 'P0001' && err.detail.message) return err.detail.message;
  if (err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501') return 'Akun ini tidak berhak mencatat di kas ini.';
  return dasar;
};

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
document.querySelectorAll('[name=arah]').forEach((r) => r.addEventListener('change', () => isiKategori(r.value, null)));
$('jumlah').addEventListener('input', () => {
  const n = $('jumlah').value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  $('jumlah').value = n ? Number(n).toLocaleString('id-ID') : '';
});
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/kas.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/kas.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const arah = document.querySelector('[name=arah]:checked')?.value, jumlah = angkaJumlah();
  if (!arah) return salah('arah', 'Pilih uang masuk atau uang keluar.');
  if (!$('kategori').value) return salah('kategori', 'Kategori belum dipilih.');
  if (!$('tanggal').value) return salah('tanggal', 'Tanggal belum diisi.');
  if (!jumlah) return salah('jumlah', 'Jumlah belum diisi.');
  const isi = {
    kategori_id: Number($('kategori').value), tanggal: $('tanggal').value, jumlah,
    keterangan: $('keterangan').value.trim().replace(/\s+/g, ' ') || null, nomor_bukti: $('bukti').value.trim() || null,
  };
  if (!data) isi.kas_id = Number($('kas').value);
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    const [hasil] = data
      ? await dbKirim('PATCH', `transaksi_kas?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `transaksi_kas?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan(`Tersimpan: ${hasil.kategori_kas.nama} ${rupiah(hasil.jumlah)}.`, true);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(galatTeks(err, 'Transaksi belum tersimpan. Periksa isian lalu coba lagi.'));
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

// Batalkan: wajib alasan, tidak bisa diurungkan (sesuai database). Transaksi tetap tersimpan sebagai jejak.
$('batal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alasan = $('alasan').value.trim();
  if (alasan.length < 3) { $('alasan').setAttribute('aria-invalid', 'true'); $('alasan').focus(); pesan('Tulis alasan pembatalan (minimal 3 huruf).'); return; }
  if (!confirm(`Batalkan transaksi ${data.kategori_kas.nama} ${rupiah(data.jumlah)}?\n\nTransaksi tetap tersimpan dengan tanda "Dibatalkan" dan tidak dihitung di saldo. Pembatalan TIDAK bisa diurungkan; bila perlu, catat ulang yang benar.`)) return;
  $('batalkan').disabled = true;
  try {
    const [hasil] = await dbKirim('PATCH', `transaksi_kas?id=eq.${data.id}&select=${PILIH}`, { dibatalkan: true, alasan_batal: alasan });
    if (!hasil) throw new Error('ditolak');
    data = hasil; tampilLihat(); pesan('Transaksi dibatalkan dan tidak lagi dihitung di saldo.', true);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesan(galatTeks(err, 'Belum berhasil dibatalkan. Coba lagi.'));
  } finally { $('batalkan').disabled = false; }
});
$('alasan').addEventListener('input', () => $('alasan').removeAttribute('aria-invalid'));

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_KAS.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    const tugas = [dbKirim('POST', 'rpc/saldo_kas', {}), dbGet('kategori_kas?select=id,arah,nama,rahasia,aktif&order=arah,urutan,nama')];
    if (id) tugas.push(dbGet(`transaksi_kas?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    const [kas, kat, t] = await Promise.all(tugas);
    kasBoleh = kas.filter((k) => k.boleh_tulis);
    kategori = kat;
    $('kas').innerHTML = kasBoleh.map((k) => `<option value="${k.kas_id}">${hurufAman(k.nama)}</option>`).join('');
    $('tanggal').max = hariIniWib();
    if (id) {
      data = t?.[0];
      if (!data) { pesan('Transaksi tidak ditemukan atau akun ini tidak berhak melihatnya.'); return; }
      tampilLihat();
    } else if (kasBoleh.length) tampilForm();
    else { pesan('Akun ini hanya bisa melihat buku kas, tidak mencatat. Pencatat: bendahara dan koordinator wilayah.'); }
  } catch (e) { tanganiGalat(e, pesan); }
})();
