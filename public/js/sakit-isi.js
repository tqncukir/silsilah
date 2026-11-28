// Rincian catatan sakit + kunjungan + sembuh/wafat, dan formulir catat/ubah (rpc kesehatan; hak dijaga database).
// ?id=<catatan>  rincian · ?jamaah=<id> catat untuk jamaah itu · tanpa parameter: catat lewat Nomor Anggota/Pindai KTA.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let id = Number(q.get('id')) || 0, data = null, peran = '', jamaah = null, tundaCek;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const tglPanjang = (d) => tglWib(d + 'T12:00:00+07:00', { day: 'numeric', month: 'long', year: 'numeric' });
const lamaHari = (dari, sampai) => Math.max(0, Math.round((new Date((sampai || hariIniWib()) + 'T00:00:00Z') - new Date(dari + 'T00:00:00Z')) / 864e5));
const pilihan = (nama) => document.querySelector(`[name=${nama}]:checked`)?.value;
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message;
  if (err.detail?.code === '42501') return err.detail.message && err.detail.message !== 'tidak berhak' ? err.detail.message : 'Akun ini tidak berhak melakukan ini.';
  return dasar;
};
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };
const setTanggal = (el, v, min) => { el.max = hariIniWib(); if (min) el.min = min; el.value = v; el.dispatchEvent(new Event('change')); };

async function muatData() {
  const [x] = await dbKirim('POST', 'rpc/daftar_sakit', { p_id: id, p_status: null, p_batas: 1 });
  return x || null;
}

// ===== Rincian =====
function tampilLihat() {
  const x = data, sakit = x.status === 'sakit';
  document.title = `Sakit: ${x.nama} · SILSILAH TQN Cukir`;
  $('l-nama').textContent = x.nama;
  const [kt, kelas] = KONDISI_SAKIT[x.kondisi];
  $('l-status').textContent = sakit ? `Sedang sakit · ${kt.toLowerCase()}` : STATUS_SAKIT[x.status];
  $('l-status').className = `stat ${sakit ? kelas : 'stat-biasa'}`;
  $('ajukan').href = `/bantuan-isi.html?nomor=${x.nomor_anggota}&jenis=sakit`;
  $('ajukan').hidden = !sakit;
  $('ke-jamaah').href = `/jamaah-isi.html?id=${x.jamaah_id}`;
  $('l-rincian').innerHTML = [
    ['Nomor Anggota', String(x.nomor_anggota)],
    ['Alamat', `${x.desa}, Kec. ${x.kecamatan}, ${x.kabupaten}`],
    ['Dirawat', x.tempat === 'rawat_inap' ? `Rawat inap${x.nama_rs ? ` di ${x.nama_rs}` : ''}` : 'Di rumah'],
    ['Kondisi umum', kt],
    ['Mulai sakit', `${tglPanjang(x.mulai)} (${lamaHari(x.mulai, x.selesai)} hari${sakit ? ' sampai hari ini' : ''})`],
    [x.status === 'wafat' ? 'Wafat' : 'Sembuh', x.selesai ? tglPanjang(x.selesai) : null],
    ['Keterangan', x.keterangan],
    ['Kebutuhan khusus', teksKebutuhan(x.kebutuhan) || null],
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('kunjung').hidden = !sakit;
  $('selesai').hidden = !sakit;
  $('buka-lagi').hidden = sakit;
  if (sakit) { setTanggal($('kj-tanggal'), hariIniWib(), x.mulai); setTanggal($('sl-tanggal'), hariIniWib(), x.mulai); }
  $('form').hidden = true; $('lihat').hidden = false;
  muatKunjungan();
}

async function muatKunjungan() {
  try {
    const k = await dbKirim('POST', 'rpc/daftar_kunjungan', { p_sakit_id: data.id });
    $('kj-isi').innerHTML = k.length ? k.map((x) => `<li><div class="bs-baris"><span>${hurufAman(x.penjenguk)}${x.catatan ? `<small>${hurufAman(x.catatan)}</small>` : ''}</span><span class="ket">${tglWib(x.tanggal + 'T12:00:00+07:00', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div></li>`).join('')
      : '<li class="dsb-ket">Belum ada kunjungan yang dicatat.</li>';
  } catch { $('kj-isi').innerHTML = '<li class="dsb-ket">Kunjungan belum bisa dimuat. Periksa sinyal.</li>'; }
}

$('kunjung').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tgl = $('kj-tanggal').value, siapa = $('kj-siapa').value.trim().replace(/\s+/g, ' '), cat = $('kj-catatan').value.trim().replace(/\s+/g, ' ');
  if (!tgl) { $('kj-tanggal').focus(); pesan('Tanggal kunjungan belum diisi.'); return; }
  if (siapa.length < 2) { $('kj-siapa').setAttribute('aria-invalid', 'true'); $('kj-siapa').focus(); pesan('Tulis siapa yang menjenguk.'); return; }
  if (/\d{8,}/.test(siapa + ' ' + cat)) { pesan('Jangan menulis nomor HP atau NIK.'); return; }
  $('kj-kirim').disabled = true;
  try {
    await dbKirim('POST', 'rpc/catat_kunjungan', { p_sakit_id: data.id, p_tanggal: tgl, p_penjenguk: siapa, p_catatan: cat || null });
    $('kj-siapa').value = ''; $('kj-catatan').value = '';
    pesan('Kunjungan tercatat.', true);
    muatKunjungan();
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('kj-kirim').disabled = false; }
});
$('kj-siapa').addEventListener('input', () => $('kj-siapa').removeAttribute('aria-invalid'));

document.querySelectorAll('[name=akhir]').forEach((r) => r.addEventListener('change', () => { $('sl-ket').hidden = pilihan('akhir') !== 'wafat'; }));
$('selesai').addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = pilihan('akhir'), tgl = $('sl-tanggal').value;
  if (!tgl) { $('sl-tanggal').focus(); pesan('Tanggal belum diisi.'); return; }
  if (!confirm(st === 'wafat'
    ? `Tandai ${data.nama} wafat pada ${tglPanjang(tgl)}?\n\nCatatan sakit ditutup. Status jamaah di Data Jamaah TIDAK berubah otomatis; ubah di sana agar masuk Daftar Ahli Kubur.`
    : `Tandai ${data.nama} sudah sembuh pada ${tglPanjang(tgl)}?\n\nBila salah, catatan bisa dikembalikan ke "sedang sakit".`)) return;
  $('sl-kirim').disabled = true;
  try {
    await dbKirim('POST', 'rpc/atur_status_sakit', { p_id: data.id, p_status: st, p_tanggal: tgl }, 'return=minimal');
    data = await muatData(); if (data) tampilLihat();
    pesan(st === 'wafat' ? 'Ditandai wafat. Inna lillahi wa inna ilaihi raji\'un. Ubah juga status di Data Jamaah.' : 'Alhamdulillah, ditandai sembuh.', true);
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('sl-kirim').disabled = false; }
});

$('bl-kirim').onclick = async () => {
  if (!confirm(`Kembalikan catatan ${data.nama} ke "sedang sakit"?\n\nTanggal ${data.status === 'wafat' ? 'wafat' : 'sembuh'} dihapus dari catatan ini (tetap tercatat di riwayat perubahan).`)) return;
  $('bl-kirim').disabled = true;
  try {
    await dbKirim('POST', 'rpc/atur_status_sakit', { p_id: data.id, p_status: 'sakit', p_tanggal: null }, 'return=minimal');
    data = await muatData(); if (data) tampilLihat();
    pesan('Catatan dikembalikan ke "sedang sakit".', true);
  } catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('bl-kirim').disabled = false; }
};

// ===== Formulir catat / ubah =====
function aturTempat() { $('rs-isian').hidden = pilihan('tempat') !== 'rawat_inap'; }
document.querySelectorAll('[name=tempat]').forEach((r) => r.addEventListener('change', aturTempat));

function tampilForm() {
  const x = data;
  $('f-judul').textContent = x ? 'Ubah catatan sakit' : 'Catat jamaah sakit';
  $('jamaah-isian').hidden = !!(x || jamaah?.tetap);
  $('jamaah-tetap').hidden = !(x || jamaah?.tetap);
  if (x) $('jamaah-tetap').textContent = `${x.nama} · ${x.nomor_anggota} · ${x.desa}, Kec. ${x.kecamatan}`;
  document.querySelectorAll('[name=tempat]').forEach((r) => { r.checked = r.value === x?.tempat; });
  document.querySelectorAll('[name=kondisi]').forEach((r) => { r.checked = r.value === x?.kondisi; });
  $('nama-rs').value = x?.nama_rs || '';
  setTanggal($('mulai'), x?.mulai || hariIniWib());
  if (x?.selesai) $('mulai').max = x.selesai;
  $('keterangan').value = x?.keterangan || '';
  aturTempat();
  pesanForm(''); pesan('');
  $('lihat').hidden = true; $('form').hidden = false;
}

async function cekJamaah() {
  const n = $('nomor').value.replace(/\D/g, '');
  jamaah = null; $('jamaah').className = 'bs-penerima';
  if (n.length !== 10) { $('jamaah').textContent = ''; return; }
  $('jamaah').textContent = 'Mencari...';
  try {
    const [j] = await dbGet(`jamaah?select=id,nama,aktif,wafat,desa(nama,kecamatan(nama))&nomor_anggota=eq.${n}`);
    if ($('nomor').value !== n) return;
    if (!j) { $('jamaah').textContent = peran === 'koordinator_wilayah' ? 'Nomor tidak ditemukan di wilayah Anda.' : 'Nomor Anggota tidak terdaftar.'; $('jamaah').className = 'bs-penerima galat'; return; }
    if (j.wafat || !j.aktif) { $('jamaah').textContent = `${j.nama} · ${j.wafat ? 'wafat' : 'tidak aktif'}.`; $('jamaah').className = 'bs-penerima galat'; return; }
    jamaah = j;
    $('jamaah').textContent = `${j.nama} · ${j.desa?.nama || ''}, Kec. ${j.desa?.kecamatan?.nama || ''}`;
  } catch { $('jamaah').textContent = 'Belum bisa memeriksa nomor. Periksa sinyal.'; }
}
$('nomor').addEventListener('input', () => {
  const v = $('nomor').value.replace(/\D/g, ''); if (v !== $('nomor').value) $('nomor').value = v;
  clearTimeout(tundaCek); tundaCek = setTimeout(cekJamaah, 300);
});
$('pindai').onclick = async () => {
  const teks = await pindaiQr({ judul: 'Pindai KTA jamaah yang sakit' });
  if (!teks) return;
  const k = bacaKta(teks);
  if (!k) { $('jamaah').textContent = 'Ini bukan QR KTA TQN Cukir.'; $('jamaah').className = 'bs-penerima galat'; return; }
  $('nomor').value = k.jenis === 'baru' ? k.kode.split('-')[1] : String(k.nomor);
  cekJamaah();
};

function salah(el, t) { el.setAttribute('aria-invalid', 'true'); (el.querySelector?.('input') || el).focus(); pesanForm(t); }
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('form').addEventListener('change', (e) => { if (e.target.type === 'radio') e.target.closest('fieldset')?.removeAttribute('aria-invalid'); });
$('ubah').onclick = tampilForm;
$('batal').onclick = () => { if (data) tampilLihat(); else location.assign('/sakit.html'); };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tempat = pilihan('tempat'), kondisi = pilihan('kondisi'), mulai = $('mulai').value;
  const rs = $('nama-rs').value.trim().replace(/\s+/g, ' '), ket = $('keterangan').value.trim().replace(/\s+/g, ' ');
  if (!data && !jamaah) return salah($('nomor'), 'Isi Nomor Anggota jamaah (aktif) lalu tunggu namanya muncul.');
  if (!tempat) return salah($('tempat-isian'), 'Pilih tempat dirawat.');
  if (!kondisi) return salah($('kondisi-isian'), 'Pilih kondisi umum.');
  if (!mulai) return salah($('mulai'), 'Tanggal mulai sakit belum diisi.');
  if (mulai > hariIniWib()) return salah($('mulai'), 'Tanggal mulai sakit tidak boleh hari depan.');
  if (/\d{8,}/.test(rs + ' ' + ket)) return salah($('keterangan'), 'Jangan menulis nomor HP atau NIK.');
  const isi = { p_tempat: tempat, p_kondisi: kondisi, p_mulai: mulai, p_nama_rs: tempat === 'rawat_inap' ? rs || null : null, p_keterangan: ket || null };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    if (data) await dbKirim('POST', 'rpc/ubah_sakit', { p_id: data.id, ...isi }, 'return=minimal');
    else {
      const h = await dbKirim('POST', 'rpc/catat_sakit', { p_jamaah_id: jamaah.id, ...isi });
      id = h.id; history.replaceState(null, '', `?id=${id}`);
    }
    data = await muatData(); if (data) tampilLihat();
    pesan('Catatan sakit tersimpan.', true);
    scrollTo({ top: 0 });
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Belum tersimpan. Periksa isian lalu coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (/\/sakit(\.html)?([?#]|$)/.test(document.referrer)) { e.preventDefault(); history.back(); } };

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_KESEHATAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (id) {
      data = await muatData();
      if (!data) { pesan('Catatan tidak ditemukan atau di luar wilayah Anda.'); return; }
      tampilLihat();
      return;
    }
    const jid = Number(q.get('jamaah')) || 0;
    if (jid) {
      // Dari rincian Data Jamaah: bila sudah ada catatan "sedang sakit", buka catatan itu.
      const [ada] = await dbKirim('POST', 'rpc/daftar_sakit', { p_jamaah_id: jid, p_status: 'sakit', p_batas: 1 });
      if (ada) { id = ada.id; history.replaceState(null, '', `?id=${id}`); data = ada; tampilLihat(); return; }
      const [j] = await dbGet(`jamaah?select=id,nama,nomor_anggota,aktif,wafat,desa(nama,kecamatan(nama))&id=eq.${jid}`);
      if (j && j.aktif && !j.wafat) { jamaah = { ...j, tetap: true }; $('jamaah-tetap').textContent = `${j.nama} · ${j.nomor_anggota} · ${j.desa?.nama || ''}, Kec. ${j.desa?.kecamatan?.nama || ''}`; }
    }
    tampilForm();
    if (!jamaah) $('nomor').focus();
  } catch (e) { tanganiGalat(e, pesan); }
})();
