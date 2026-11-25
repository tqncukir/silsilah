// Masuk admin pusat lewat tautan email (cadangan). Alamat ini tidak ditautkan dari halaman umum.
const $ = (id) => document.getElementById(id);
const tulis = (el, t, ok) => { el.textContent = t; el.className = 'pesan' + (ok ? ' ok' : ''); };
if (sesi.ambil()) location.replace('/beranda.html');

$('form-pengurus').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = $('pesan-email');
  const email = $('email').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return tulis(out, 'Email belum benar.');
  const btn = e.submitter; btn.disabled = true; tulis(out, 'Mengirim...', true);
  try {
    const r = await fetch(`${SB_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + '/beranda.html')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ email, create_user: false }),
    });
    if (!r.ok) throw new Error(r.status === 429 ? 'Terlalu sering. Tunggu beberapa menit lalu coba lagi.' : 'Email belum bisa dikirim. Coba lagi nanti.');
    tulis(out, 'Tautan masuk sudah dikirim. Silakan buka email.', true);
  } catch (err) {
    tulis(out, err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : err.message);
  } finally { btn.disabled = false; }
});
