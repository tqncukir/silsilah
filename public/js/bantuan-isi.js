// Ajukan bantuan + rincian satu bantuan dengan aksi sesuai peran (setujui/tolak = ketua; salurkan = bendahara/koordinator;
// batalkan sebelum disalurkan). Semua lewat rpc yang memeriksa hak di database.
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, peran = '', penerimaOk = false, tundaCek;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const angkaDari = (el) => Number(el.value.replace(/\D/g, '') || 0);
const formatRp = (el) => el.addEventListener('input', () => {
  const n = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
  el.value = n ? Number(n).toLocaleString('id-ID') : '';
  el.removeAttribute('aria-invalid');
});
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message;
  if (err.detail?.code === '42501') return err.detail.message && err.detail.message !== 'tidak berhak' ? err.detail.message : 'Akun ini tidak berhak melakukan ini.';
  return dasar;
};
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };

// ===== Rincian =====
async function muatData() {
  const [b] = await dbKirim('POST', 'rpc/daftar_bantuan', { p_id: Number(id), p_batas: 1 });
  return b || null;
}
function tampilLihat() {
  const b = data, [st, kelas] = STATUS_BANTUAN[b.status];
  document.title = `Bantuan ${b.nama} · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = `${JENIS_BANTUAN[b.jenis]} · bantuan ${b.bentuk}`;
  $('l-nama').textContent = b.nama + (b.wafat ? ' (almarhum/ah)' : '');
  $('l-nilai').textContent = teksBantuan(b);
  $('l-status').textContent = st; $('l-status').className = `stat ${kelas}`;
  const tgl = (t) => `${tglWib(t, { day: 'numeric', month: 'long', year: 'numeric' })}, ${jamWib(t)} WIB`;
  $('l-rincian').innerHTML = [
    ['Nomor Anggota', String(b.nomor_anggota)],
    ['Alamat', `${b.desa}, Kec. ${b.kecamatan}, ${b.kabupaten}`],
    ['Keterangan kondisi', b.keterangan],
    ['Diajukan', tgl(b.diajukan_pada)],
    [b.status === 'ditolak' ? 'Ditolak' : 'Disetujui', b.diputus_pada && b.status !== 'dibatalkan' ? tgl(b.diputus_pada) : null],
    [b.status === 'ditolak' ? 'Alasan ditolak' : 'Alasan dibatalkan', ['ditolak', 'dibatalkan'].includes(b.status) ? b.alasan : null],
    ['Disalurkan', b.disalurkan_tgl ? tglWib(b.disalurkan_tgl + 'T12:00:00+07:00') : null],
    ['Dari kas', b.kas ? `${b.kas} (tercatat di Buku Kas tanpa nama penerima)` : null],
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('putus').hidden = !b.boleh_putus;
  $('pt-nilai-isian').hidden = b.bentuk !== 'uang';
  $('pt-nilai').value = b.bentuk === 'uang' ? Number(b.nilai).toLocaleString('id-ID') : '';
  $('salur').hidden = !b.boleh_salur;
  $('sl-kas-isian').hidden = b.bentuk !== 'uang';
  $('sl-ket').textContent = b.bentuk === 'uang'
    ? `Tandai setelah uang diterima penerima. ${rupiah(b.nilai)} otomatis tercatat sebagai pengeluaran "Bantuan sosial" di Buku Kas (tanpa nama penerima).`
    : 'Tandai setelah barang diterima penerima. Barang tidak dicatat di Buku Kas; bila dibeli dari kas, catat pembeliannya di Buku Kas.';
  $('batal-form').hidden = !b.boleh_batal;
  $('form').hidden = true; $('lihat').hidden = false;
}

async function segarkan(teks) {
  data = await muatData();
  if (data) { tampilLihat(); pesan(teks, true); }
}

$('putus').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nilai = data.bentuk === 'uang' ? angkaDari($('pt-nilai')) : null;
  if (data.bentuk === 'uang' && !nilai) { $('pt-nilai').setAttribute('aria-invalid', 'true'); $('pt-nilai').focus(); pesan('Jumlah disetujui belum diisi.'); return; }
  $('pt-setuju').disabled = true;
  try {
    await dbKirim('POST', 'rpc/putuskan_bantuan', { p_id: data.id, p_setuju: true, p_alasan: null, p_nilai: nilai && nilai !== Number(data.nilai) ? nilai : null }, 'return=minimal');
    await segarkan('Bantuan disetujui. Sekarang bisa disalurkan bendahara atau koordinator.');
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('pt-setuju').disabled = false; }
});
$('pt-tolak').onclick = async () => {
  const alasan = $('pt-alasan').value.trim();
  if (alasan.length < 3) { $('pt-alasan').setAttribute('aria-invalid', 'true'); $('pt-alasan').focus(); pesan('Tulis alasan penolakan (minimal 3 huruf).'); return; }
  if (!confirm(`Tolak pengajuan bantuan untuk ${data.nama}?\n\nKeputusan ini tidak bisa diubah. Bila perlu, ajukan ulang nanti.`)) return;
  $('pt-tolak').disabled = true;
  try {
    await dbKirim('POST', 'rpc/putuskan_bantuan', { p_id: data.id, p_setuju: false, p_alasan: alasan }, 'return=minimal');
    await segarkan('Pengajuan ditolak.');
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('pt-tolak').disabled = false; }
};
$('pt-alasan').addEventListener('input', () => $('pt-alasan').removeAttribute('aria-invalid'));
formatRp($('pt-nilai'));

$('salur').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tgl = $('sl-tanggal').value, kas = data.bentuk === 'uang' ? Number($('sl-kas').value) : null;
  if (!tgl) { $('sl-tanggal').focus(); pesan('Tanggal disalurkan belum diisi.'); return; }
  if (data.bentuk === 'uang' && !kas) { pesan('Akun ini belum punya kas untuk mencatat. Buka Buku Kas dulu.'); return; }
  const namaKas = $('sl-kas').selectedOptions[0]?.textContent;
  if (!confirm(data.bentuk === 'uang'
    ? `Tandai sudah disalurkan?\n\n${rupiah(data.nilai)} akan tercatat sebagai pengeluaran "Bantuan sosial" di ${namaKas}. Bila salah, batalkan transaksinya di Buku Kas.`
    : `Tandai ${data.barang} sudah disalurkan ke ${data.nama}?`)) return;
  $('sl-kirim').disabled = true;
  try {
    await dbKirim('POST', 'rpc/salurkan_bantuan', { p_id: data.id, p_tanggal: tgl, p_kas_id: kas });
    await segarkan(data.bentuk === 'uang' ? 'Bantuan disalurkan dan tercatat di Buku Kas.' : 'Bantuan barang ditandai sudah disalurkan.');
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('sl-kirim').disabled = false; }
});

$('batal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alasan = $('bt-alasan').value.trim();
  if (alasan.length < 3) { $('bt-alasan').setAttribute('aria-invalid', 'true'); $('bt-alasan').focus(); pesan('Tulis alasan pembatalan (minimal 3 huruf).'); return; }
  if (!confirm(`Batalkan pengajuan bantuan untuk ${data.nama}?\n\nData tetap tersimpan dengan tanda "Dibatalkan" dan tidak bisa diaktifkan lagi.`)) return;
  $('bt-kirim').disabled = true;
  try {
    await dbKirim('POST', 'rpc/batalkan_bantuan', { p_id: data.id, p_alasan: alasan }, 'return=minimal');
    await segarkan('Pengajuan dibatalkan.');
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('bt-kirim').disabled = false; }
});
$('bt-alasan').addEventListener('input', () => $('bt-alasan').removeAttribute('aria-invalid'));

// ===== Formulir ajukan =====
$('jenis-isian').insertAdjacentHTML('beforeend', Object.entries(JENIS_BANTUAN)
  .map(([v, t]) => `<label class="pil"><input type="radio" name="jenis" value="${v}"> ${t}</label>`).join(''));
function aturBentuk() {
  const barang = document.querySelector('[name=bentuk]:checked').value === 'barang';
  $('barang-isian').hidden = !barang;
  $('nilai-label').innerHTML = barang ? 'Perkiraan nilai barang' : 'Jumlah uang <span class="wajib">wajib</span>';
}
document.querySelectorAll('[name=bentuk]').forEach((r) => r.addEventListener('change', aturBentuk));
formatRp($('nilai'));

// Pratinjau penerima: nama & desa dari Data Jamaah (RLS: koordinator hanya wilayahnya).
async function cekPenerima() {
  const n = $('nomor').value.replace(/\D/g, '');
  penerimaOk = false; $('penerima').className = 'bs-penerima';
  if (n.length !== 10) { $('penerima').textContent = ''; return; }
  $('penerima').textContent = 'Mencari...';
  try {
    const [j] = await dbGet(`jamaah?select=nama,aktif,wafat,desa(nama,kecamatan(nama))&nomor_anggota=eq.${n}`);
    if (!j) { $('penerima').textContent = peran === 'koordinator_wilayah' ? 'Nomor tidak ditemukan di wilayah Anda.' : 'Nomor Anggota tidak terdaftar.'; $('penerima').className = 'bs-penerima galat'; return; }
    const status = j.wafat ? ' · wafat (hanya santunan duka)' : !j.aktif ? ' · tidak aktif' : '';
    $('penerima').textContent = `${j.nama} · ${j.desa?.nama || ''}, Kec. ${j.desa?.kecamatan?.nama || ''}${status}`;
    if (!j.wafat && !j.aktif) $('penerima').className = 'bs-penerima galat';
    penerimaOk = j.wafat || j.aktif;
  } catch { $('penerima').textContent = 'Belum bisa memeriksa nomor. Periksa sinyal.'; }
}
$('nomor').addEventListener('input', () => {
  const v = $('nomor').value.replace(/\D/g, ''); if (v !== $('nomor').value) $('nomor').value = v;
  $('nomor').removeAttribute('aria-invalid');
  clearTimeout(tundaCek); tundaCek = setTimeout(cekPenerima, 300);
});
$('pindai').onclick = async () => {
  const teks = await pindaiQr({ judul: 'Pindai KTA penerima' });
  if (!teks) return;
  const k = bacaKta(teks);
  if (!k) { $('penerima').textContent = 'Ini bukan QR KTA TQN Cukir.'; $('penerima').className = 'bs-penerima galat'; return; }
  $('nomor').value = k.jenis === 'baru' ? k.kode.split('-')[1] : String(k.nomor);
  cekPenerima();
};

function salah(idEl, t) { const el = $(idEl) || document.querySelector(`[name=${idEl}]`); el.setAttribute('aria-invalid', 'true'); el.focus(); pesanForm(t); }
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('batal').onclick = () => location.assign('/bantuan.html');
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/bantuan.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value, jenis = document.querySelector('[name=jenis]:checked')?.value;
  const bentuk = document.querySelector('[name=bentuk]:checked').value, nilai = angkaDari($('nilai'));
  const ket = $('keterangan').value.trim().replace(/\s+/g, ' ');
  if (nomor.length !== 10) return salah('nomor', 'Nomor Anggota penerima harus 10 angka.');
  if (!jenis) return salah('jenis', 'Jenis bantuan belum dipilih.');
  if (bentuk === 'barang' && $('barang').value.trim().length < 2) return salah('barang', 'Nama barang belum diisi.');
  if (bentuk === 'uang' && !nilai) return salah('nilai', 'Jumlah uang belum diisi.');
  if (/\d{8,}/.test(ket)) return salah('keterangan', 'Jangan menulis nomor HP atau NIK di keterangan.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Mengirim...';
  try {
    const h = await dbKirim('POST', 'rpc/ajukan_bantuan', { p_nomor: Number(nomor), p_jenis: jenis, p_bentuk: bentuk,
      p_nilai: nilai || null, p_barang: bentuk === 'barang' ? $('barang').value.trim() : null, p_keterangan: ket || null });
    history.replaceState(null, '', `?id=${h.id}`);
    data = await muatData();
    if (data) tampilLihat();
    pesan(`Pengajuan untuk ${h.nama} terkirim. Menunggu persetujuan ketua.`, true);
    scrollTo({ top: 0 });
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Pengajuan belum terkirim. Periksa isian lalu coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Ajukan'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_BANTUAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (id) {
      const tugas = [muatData()];
      if (['bendahara', 'koordinator_wilayah'].includes(peran)) tugas.push(dbKirim('POST', 'rpc/saldo_kas', {}).catch(() => []));
      const [b, kas] = await Promise.all(tugas);
      data = b;
      if (!data) { pesan('Bantuan tidak ditemukan atau akun ini tidak berhak melihatnya.'); return; }
      const bolehKas = (kas || []).filter((k) => k.boleh_tulis);
      $('sl-kas').innerHTML = bolehKas.map((k) => `<option value="${k.kas_id}">${hurufAman(k.nama)} (saldo ${rupiah(k.saldo)})</option>`).join('');
      $('sl-tanggal').value = hariIniWib(); $('sl-tanggal').max = hariIniWib();
      tampilLihat();
    } else {
      $('form').hidden = false; $('lihat').hidden = true;
      aturBentuk();
      const awal = new URLSearchParams(location.search).get('nomor');
      if (/^\d{10}$/.test(awal || '')) { $('nomor').value = awal; cekPenerima(); document.querySelector('[name=jenis]').focus(); }
      else $('nomor').focus();
    }
  } catch (e) { tanganiGalat(e, pesan); }
})();
