// Isi/ubah kebutuhan khusus satu jamaah (rpc daftar_kebutuhan & simpan_kebutuhan; ketua, dokter, koordinator wilayahnya).
// ?jamaah=<id> jamaah terkunci (dari daftar / Data Jamaah); tanpa parameter: lewat Nomor Anggota atau Pindai KTA.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let jamaah = null, tundaCek;

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
const pesanForm = (t, ok) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan' + (ok ? ' ok' : ''); };
const galatTeks = (err, dasar) => {
  if (err.message === 'Failed to fetch') return 'Sinyal terputus. Belum tersimpan, coba lagi.';
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message;
  if (err.detail?.code === '42501') return err.detail.message && err.detail.message !== 'tidak berhak' ? err.detail.message : 'Akun ini tidak berhak melakukan ini.';
  return dasar;
};
const keMasuk = (err) => { if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };

$('keb-isian').insertAdjacentHTML('beforeend', Object.entries(KEBUTUHAN_KHUSUS)
  .map(([v, t]) => `<label class="pil"><input type="checkbox" name="keb" value="${v}"> ${t}</label>`).join(''));
const aturLainnya = () => { $('ket-label').innerHTML = document.querySelector('[name=keb][value=lainnya]').checked ? 'Keterangan <span class="wajib">wajib</span>' : 'Keterangan'; };
document.querySelectorAll('[name=keb]').forEach((c) => c.addEventListener('change', aturLainnya));

// Isi pilihan dari data yang sudah ada.
async function isiAda(jid) {
  const [x] = await dbKirim('POST', 'rpc/daftar_kebutuhan', { p_jamaah_id: jid, p_batas: 1 });
  document.querySelectorAll('[name=keb]').forEach((c) => { c.checked = (x?.kebutuhan || []).includes(c.value); });
  $('keterangan').value = x?.keterangan || '';
  aturLainnya();
  return x;
}

async function cekJamaah() {
  const n = $('nomor').value.replace(/\D/g, '');
  jamaah = null; $('jamaah').className = 'bs-penerima';
  if (n.length !== 10) { $('jamaah').textContent = ''; return; }
  $('jamaah').textContent = 'Mencari...';
  try {
    const [j] = await dbGet(`jamaah?select=id,nama,wafat,desa(nama,kecamatan(nama))&nomor_anggota=eq.${n}`);
    if ($('nomor').value !== n) return;
    if (!j) { $('jamaah').textContent = 'Nomor tidak ditemukan (koordinator: hanya jamaah wilayah Anda).'; $('jamaah').className = 'bs-penerima galat'; return; }
    if (j.wafat) { $('jamaah').textContent = `${j.nama} · wafat.`; $('jamaah').className = 'bs-penerima galat'; return; }
    jamaah = j;
    $('jamaah').textContent = `${j.nama} · ${j.desa?.nama || ''}, Kec. ${j.desa?.kecamatan?.nama || ''}`;
    await isiAda(j.id).catch(() => {});
  } catch { $('jamaah').textContent = 'Belum bisa memeriksa nomor. Periksa sinyal.'; }
}
$('nomor').addEventListener('input', () => {
  const v = $('nomor').value.replace(/\D/g, ''); if (v !== $('nomor').value) $('nomor').value = v;
  clearTimeout(tundaCek); tundaCek = setTimeout(cekJamaah, 300);
});
$('pindai').onclick = async () => {
  const teks = await pindaiQr({ judul: 'Pindai KTA jamaah' });
  if (!teks) return;
  const k = bacaKta(teks);
  if (!k) { $('jamaah').textContent = 'Ini bukan QR KTA TQN Cukir.'; $('jamaah').className = 'bs-penerima galat'; return; }
  $('nomor').value = k.jenis === 'baru' ? k.kode.split('-')[1] : String(k.nomor);
  cekJamaah();
};

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('batal').onclick = () => { if (document.referrer.includes(location.host)) history.back(); else location.assign('/kebutuhan.html'); };
$('keluar').onclick = keluar;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  pesanForm('');
  const keb = [...document.querySelectorAll('[name=keb]:checked')].map((c) => c.value);
  const ket = $('keterangan').value.trim().replace(/\s+/g, ' ');
  if (!jamaah) { $('nomor').setAttribute('aria-invalid', 'true'); $('nomor').focus(); pesanForm('Isi Nomor Anggota lalu tunggu namanya muncul.'); return; }
  if (keb.includes('lainnya') && ket.length < 3) { $('keterangan').setAttribute('aria-invalid', 'true'); $('keterangan').focus(); pesanForm('Tulis keterangan untuk kebutuhan "Lainnya".'); return; }
  if (/\d{8,}/.test(ket)) { $('keterangan').setAttribute('aria-invalid', 'true'); $('keterangan').focus(); pesanForm('Jangan menulis nomor HP atau NIK.'); return; }
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    await dbKirim('POST', 'rpc/simpan_kebutuhan', { p_jamaah_id: jamaah.id, p_kebutuhan: keb, p_keterangan: ket || null }, 'return=minimal');
    pesanForm(keb.length ? `Tersimpan: ${teksKebutuhan(keb)}.` : 'Tersimpan: tidak ada kebutuhan khusus.', true);
  } catch (err) { if (!keMasuk(err)) pesanForm(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_KESEHATAN.includes(p.peran)) { location.replace(p?.peran === 'khodim' ? '/kebutuhan.html' : '/beranda.html'); return; }
    const jid = Number(q.get('jamaah')) || 0;
    if (jid) {
      const [j] = await dbGet(`jamaah?select=id,nama,nomor_anggota,wafat,desa(nama,kecamatan(nama))&id=eq.${jid}`);
      if (!j) { pesan('Jamaah tidak ditemukan atau di luar wilayah Anda.'); return; }
      if (j.wafat) { pesan(`${j.nama} tercatat wafat.`); return; }
      jamaah = j;
      $('jamaah-isian').hidden = true; $('jamaah-tetap').hidden = false;
      $('jamaah-tetap').textContent = `${j.nama} · ${j.nomor_anggota} · ${j.desa?.nama || ''}, Kec. ${j.desa?.kecamatan?.nama || ''}`;
      await isiAda(j.id);
    }
    $('form').hidden = false;
    (jamaah ? document.querySelector('[name=keb]') : $('nomor')).focus();
  } catch (e) { tanganiGalat(e, pesan); }
})();
