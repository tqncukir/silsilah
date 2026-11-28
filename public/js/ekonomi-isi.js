// Rincian + isi/ubah kondisi ekonomi satu jamaah (rpc daftar_ekonomi & simpan_ekonomi; hak dijaga database).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const jamaahId = Number(q.get('jamaah')) || 0;
let data = null;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const tglPanjang = (d) => tglWib(d + 'T12:00:00+07:00', { day: 'numeric', month: 'long', year: 'numeric' });
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message;
  if (err.detail?.code === '42501') return err.detail.message && err.detail.message !== 'tidak berhak' ? err.detail.message : 'Akun ini tidak berhak melakukan ini.';
  return dasar;
};
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };

async function muatData() {
  const [x] = await dbKirim('POST', 'rpc/daftar_ekonomi', { p_jamaah_id: jamaahId, p_batas: 1 });
  return x || null;
}

function tampilLihat() {
  const x = data;
  document.title = `Kondisi ekonomi ${x.nama} · SILSILAH TQN Cukir`;
  $('l-nama').textContent = x.nama;
  const [kt, kelas] = x.tingkat ? TINGKAT_EKONOMI[x.tingkat] : ['Belum didata', 'stat-biasa eko-belum'];
  $('l-tingkat').textContent = kt; $('l-tingkat').className = `stat ${kelas}`;
  $('ubah').textContent = x.tingkat ? 'Ubah' : 'Isi kondisi';
  $('ajukan').href = `/bantuan-isi.html?nomor=${x.nomor_anggota}`;
  $('ke-jamaah').href = `/jamaah-isi.html?id=${x.jamaah_id}`;
  const bantu = Number(x.dibantu) ? `${Number(x.dibantu).toLocaleString('id-ID')} kali, terakhir ${tglPanjang(x.dibantu_terakhir)}` : 'Belum pernah';
  $('l-rincian').innerHTML = [
    ['Nomor Anggota', String(x.nomor_anggota)],
    ['Alamat', `${x.desa}, Kec. ${x.kecamatan}, ${x.kabupaten}`],
    ['Pekerjaan', x.pekerjaan],
    ['Jumlah tanggungan', x.tingkat ? `${x.tanggungan} orang` : null],
    ['Didata', x.didata_tgl ? tglPanjang(x.didata_tgl) : null],
    ['Keterangan', x.keterangan],
    ['Bantuan sosial diterima', bantu],
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('form').hidden = true; $('lihat').hidden = false;
}

function tampilForm() {
  const x = data;
  $('f-judul').textContent = x.tingkat ? 'Ubah kondisi ekonomi' : 'Isi kondisi ekonomi';
  $('f-sub').textContent = `${x.nama} · ${x.nomor_anggota} · ${x.desa}, Kec. ${x.kecamatan}`;
  document.querySelectorAll('[name=tingkat]').forEach((r) => { r.checked = r.value === x.tingkat; });
  $('tanggungan').value = x.tingkat ? String(x.tanggungan) : '';
  $('tanggal').max = hariIniWib();
  $('tanggal').value = hariIniWib(); // didata ulang = hari ini (bisa diubah)
  $('tanggal').dispatchEvent(new Event('change'));
  $('keterangan').value = x.keterangan || '';
  pesanForm(''); pesan('');
  $('lihat').hidden = true; $('form').hidden = false;
  (document.querySelector('[name=tingkat]:checked') || document.querySelector('[name=tingkat]')).focus();
}

$('ubah').onclick = tampilForm;
$('batal').onclick = () => { if (data) tampilLihat(); };
$('tanggungan').addEventListener('input', () => {
  const v = $('tanggungan').value.replace(/\D/g, '').slice(0, 2); if (v !== $('tanggungan').value) $('tanggungan').value = v;
});
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('form').addEventListener('change', (e) => { if (e.target.name === 'tingkat') $('tingkat-isian').removeAttribute('aria-invalid'); });
function salah(el, t) { el.setAttribute('aria-invalid', 'true'); (el.querySelector?.('input') || el).focus(); pesanForm(t); }

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tingkat = document.querySelector('[name=tingkat]:checked')?.value;
  const tg = $('tanggungan').value, tgl = $('tanggal').value, ket = $('keterangan').value.trim().replace(/\s+/g, ' ');
  if (!tingkat) return salah($('tingkat-isian'), 'Pilih kondisi ekonomi.');
  if (tg === '' || Number(tg) > 30) return salah($('tanggungan'), 'Jumlah tanggungan diisi angka 0 sampai 30.');
  if (!tgl) return salah($('tanggal'), 'Tanggal didata belum diisi.');
  if (tgl > hariIniWib()) return salah($('tanggal'), 'Tanggal didata tidak boleh hari depan.');
  if (/\d{8,}/.test(ket)) return salah($('keterangan'), 'Jangan menulis nomor HP atau NIK di keterangan.');
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    await dbKirim('POST', 'rpc/simpan_ekonomi', { p_jamaah_id: data.jamaah_id, p_tingkat: tingkat, p_tanggungan: Number(tg),
      p_tanggal: tgl, p_keterangan: ket || null });
    data = await muatData();
    if (data) tampilLihat();
    pesan('Kondisi ekonomi tersimpan.', true);
    scrollTo({ top: 0 });
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Belum tersimpan. Periksa isian lalu coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (/\/ekonomi(\.html)?([?#]|$)/.test(document.referrer)) { e.preventDefault(); history.back(); } };

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_EKONOMI.includes(p.peran)) { location.replace('/beranda.html'); return; }
    if (!jamaahId) { pesan('Pilih jamaah dari daftar Ekonomi Jamaah.'); return; }
    data = await muatData();
    if (!data) { pesan('Jamaah tidak ditemukan, sudah tidak aktif/wafat, atau di luar wilayah Anda.'); return; }
    tampilLihat();
    if (q.get('ubah') === '1') tampilForm();
  } catch (e) { tanganiGalat(e, pesan); }
})();
