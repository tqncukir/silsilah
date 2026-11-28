// Pengaturan Notifikasi (Tahap 16): status di perangkat ini (aktifkan/matikan) + jenis kabar per akun (rpc atur_notif).
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;
const STATUS = {
  aktif: ['Aktif di perangkat ini', 'Kabar akan masuk ke HP/perangkat ini.'],
  belum: ['Belum aktif di perangkat ini', 'Tekan Aktifkan, lalu pilih Izinkan.'],
  diblokir: ['Diblokir di perangkat ini', 'Izin pemberitahuan pernah ditolak. Buka pengaturan situs di browser/HP (ikon gembok di samping alamat), izinkan Notifikasi, lalu muat ulang halaman ini.'],
  'pasang-dulu': ['Pasang SILSILAH dulu', 'Di iPhone, pemberitahuan hanya bisa setelah SILSILAH dipasang di layar utama (Bagikan → Tambahkan ke Layar Utama), lalu dibuka dari ikonnya.'],
  'tidak-didukung': ['Belum didukung', 'Browser ini belum mendukung pemberitahuan. Coba buka SILSILAH dengan Chrome terbaru.'],
};
let perangkat = 0;
async function tampilStatus() {
  const st = await statusNotif().catch(() => 'tidak-didukung');
  $('st-teks').innerHTML = `<span class="stat ${st === 'aktif' ? 'stat-aktif' : st === 'belum' ? 'stat-biasa' : 'stat-tidak'}">${STATUS[st][0]}</span>`;
  $('st-ket').textContent = STATUS[st][1] + (perangkat ? ` Akun ini aktif di ${perangkat} perangkat.` : '');
  $('st-aktifkan').hidden = st !== 'belum'; $('st-matikan').hidden = st !== 'aktif'; $('st-uji').hidden = st !== 'aktif'; $('st-pasang').hidden = st !== 'pasang-dulu';
  return st;
}
const hitungPerangkat = async () => { perangkat = Number((await dbKirim('POST', 'rpc/notif_saya', {})).perangkat) || 0; };
$('st-aktifkan').onclick = () => {
  const b = $('st-aktifkan'); b.disabled = true; $('st-pesan').textContent = ''; $('st-pesan').className = 'pesan';
  aktifkanNotif().then(async () => { await hitungPerangkat(); await tampilStatus(); $('st-pesan').className = 'pesan ok'; $('st-pesan').textContent = 'Pemberitahuan aktif.'; })
    .catch((e) => { $('st-pesan').textContent = pesanNotifGagal(e); tampilStatus(); })
    .finally(() => { b.disabled = false; });
};
$('st-matikan').onclick = async () => {
  if (!await yakin('Matikan pemberitahuan di perangkat ini?\n\nPerangkat ini tidak menerima kabar lagi. Bisa diaktifkan kembali kapan saja.', 'Matikan')) return;
  try { await matikanNotif(); await hitungPerangkat(); await tampilStatus(); $('st-pesan').className = 'pesan ok'; $('st-pesan').textContent = 'Pemberitahuan dimatikan di perangkat ini.'; }
  catch { $('st-pesan').className = 'pesan'; $('st-pesan').textContent = 'Belum bisa dimatikan. Coba lagi.'; }
};
// Kirim pemberitahuan uji ke perangkat akun ini sendiri (Edge Function notif, maks 1 per menit).
$('st-uji').onclick = async () => {
  const b = $('st-uji'); b.disabled = true; $('st-pesan').className = 'pesan';
  try {
    const t = await tokenAktif();
    const r = await fetch(`${SB_URL}/functions/v1/notif`, { method: 'POST', body: JSON.stringify({ aksi: 'uji' }),
      headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${t}` } });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.terkirim > 0) { $('st-pesan').className = 'pesan ok'; $('st-pesan').textContent = 'Terkirim. Pemberitahuan akan muncul dalam beberapa detik.'; }
    else if (r.ok) $('st-pesan').textContent = 'Belum terkirim. Matikan lalu aktifkan lagi di perangkat ini, kemudian coba lagi.';
    else $('st-pesan').textContent = d.pesan || 'Pemberitahuan uji belum bisa dikirim. Coba lagi.';
  } catch { $('st-pesan').textContent = 'Sinyal terputus. Coba lagi.'; }
  finally { b.disabled = false; }
};
$('p-jenis').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tampil = [...document.querySelectorAll('input[name=jenis]')].filter((c) => !c.closest('[hidden]'));
  const mati = tampil.filter((c) => !c.checked).map((c) => c.value);
  const b = $('simpan-jenis'); b.disabled = true; $('pesan-jenis').className = 'pesan';
  try {
    await dbKirim('POST', 'rpc/atur_notif', { p_mati: mati }, 'return=minimal');
    $('pesan-jenis').className = 'pesan ok';
    $('pesan-jenis').textContent = mati.length === tampil.length ? 'Tersimpan. Semua kabar dimatikan.' : 'Pilihan tersimpan.';
  } catch (err) { if (err.message === 'Failed to fetch') $('pesan-jenis').textContent = 'Sinyal terputus. Pilihan belum tersimpan, coba lagi.'; else tanganiGalat(err, (t) => { $('pesan-jenis').textContent = t; }); }
  finally { b.disabled = false; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p) { location.replace('/beranda.html'); return; }
    const n = await dbKirim('POST', 'rpc/notif_saya', {});
    perangkat = Number(n.perangkat) || 0;
    const mati = new Set(n.mati || []);
    $('jenis-pengurus').hidden = !n.pengurus; $('pil-backup').hidden = !n.admin;
    for (const c of document.querySelectorAll('input[name=jenis]')) c.checked = !mati.has(c.value);
    $('jenis-ket').textContent = 'Pilihan ini berlaku untuk semua perangkat akun Anda.';
    $('p-perangkat').hidden = false; $('p-jenis').hidden = false;
    await tampilStatus();
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
