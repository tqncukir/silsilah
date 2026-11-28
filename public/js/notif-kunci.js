// Kunci Notifikasi (Tahap 16, khusus Admin Pusat): membuat pasangan kunci VAPID (ECDSA P-256) di perangkat ini.
// Kunci TIDAK dikirim ke server; Admin Pusat menyalinnya sendiri ke rahasia Supabase (Edge Functions → Secrets).
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;
const b64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

$('buat').onclick = async () => {
  if ($('k-publik').textContent && !await yakin('Buat kunci baru?\n\nKunci yang tadi tampil tidak dipakai lagi. Pastikan yang dipasang di Supabase adalah kunci terakhir.', 'Buat kunci baru')) return;
  try {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    $('k-publik').textContent = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)));
    $('k-rahasia').textContent = (await crypto.subtle.exportKey('jwk', k.privateKey)).d;
    $('hasil').hidden = false; $('buat').textContent = 'Buat kunci baru'; $('buat').className = 'btn btn-kedua btn-pas';
    $('pesan-salin').textContent = '';
  } catch { $('pesan').textContent = 'Perangkat ini belum bisa membuat kunci. Coba dari Chrome terbaru di laptop.'; }
};
// Kunci panggil: 32 bita acak; sama di Edge Function Secrets (NOTIF_PANGGIL) dan di Vault ('notif_panggil').
$('buat-panggil').onclick = async () => {
  if ($('k-panggil').textContent && !await yakin('Buat kunci panggil baru?\n\nKunci lama tidak berlaku lagi. Pasang ulang di Secrets dan jalankan ulang perintah SQL.', 'Buat kunci baru')) return;
  const k = b64url(crypto.getRandomValues(new Uint8Array(32)));
  $('k-panggil').textContent = k;
  $('k-sql').textContent = `delete from vault.secrets where name = 'notif_panggil'; select vault.create_secret('${k}', 'notif_panggil');`;
  $('hasil-panggil').hidden = false; $('buat-panggil').textContent = 'Buat kunci panggil baru'; $('buat-panggil').className = 'btn btn-kedua btn-pas';
};
document.addEventListener('click', async (e) => {
  const t = e.target.closest('.salin'); if (!t) return;
  try { await navigator.clipboard.writeText($(t.dataset.salin).textContent); const NAMA = { 'k-rahasia': 'Kunci rahasia', 'k-publik': 'Kunci publik', 'k-subjek': 'Alamat kontak', 'k-panggil': 'Kunci panggil', 'k-sql': 'Perintah SQL' };
    const p = $(['k-panggil', 'k-sql'].includes(t.dataset.salin) ? 'pesan-panggil' : 'pesan-salin');
    p.textContent = `${NAMA[t.dataset.salin]} tersalin.`; }
  catch { $(['k-panggil', 'k-sql'].includes(t.dataset.salin) ? 'pesan-panggil' : 'pesan-salin').textContent = 'Belum bisa menyalin otomatis. Tekan lama teks lalu salin.'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || p.peran !== 'admin_pusat') { location.replace('/beranda.html'); return; }
    $('isi').hidden = false; $('isi-panggil').hidden = false;
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
