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
document.addEventListener('click', async (e) => {
  const t = e.target.closest('.salin'); if (!t) return;
  try { await navigator.clipboard.writeText($(t.dataset.salin).textContent); $('pesan-salin').textContent = `${t.dataset.salin === 'k-rahasia' ? 'Kunci rahasia' : t.dataset.salin === 'k-publik' ? 'Kunci publik' : 'Alamat kontak'} tersalin.`; }
  catch { $('pesan-salin').textContent = 'Belum bisa menyalin otomatis. Tekan lama teks kunci lalu salin.'; }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || p.peran !== 'admin_pusat') { location.replace('/beranda.html'); return; }
    $('isi').hidden = false;
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
