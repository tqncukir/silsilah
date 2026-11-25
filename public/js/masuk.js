const $ = (id) => document.getElementById(id);
const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = 'pesan' + (ok ? ' ok' : ''); };
let tsAnggota = null;

window.tsSiap = () => {
  tsAnggota = turnstile.render('#ts-anggota', { sitekey: TS_SITE, language: 'id', size: 'flexible' });
};

if (sesi.ambil()) location.replace('/beranda.html');

function pilihTab(nama) {
  const a = nama === 'anggota';
  $('tab-anggota').setAttribute('aria-selected', a);
  $('tab-pengurus').setAttribute('aria-selected', !a);
  $('form-anggota').hidden = !a;
  $('form-pengurus').hidden = a;
  pesan('');
}
$('tab-anggota').onclick = () => pilihTab('anggota');
$('tab-pengurus').onclick = () => pilihTab('pengurus');

$('form-anggota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value.replace(/\D/g, ''), desa = $('desa').value.trim(), pin = $('pin').value;
  if (nomor.length !== 10) return pesan('Nomor Anggota harus 10 angka.');
  if (!desa) return pesan('Nama desa belum diisi.');
  if (!/^\d{6}$/.test(pin)) return pesan('PIN harus 6 angka.');
  const token = tsAnggota !== null ? turnstile.getResponse(tsAnggota) : '';
  if (!token) return pesan('Tunggu tanda centang pemeriksaan robot selesai, lalu tekan Masuk lagi.');
  const btn = e.submitter; btn.disabled = true; pesan('Memeriksa...', true);
  try {
    const r = await fetch(`${SB_URL}/functions/v1/login-anggota`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ nomor, desa, pin, turnstile: token }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.pesan || 'Terjadi gangguan. Coba lagi.');
    sesi.simpan({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at });
    location.replace('/beranda.html');
  } catch (err) {
    pesan(err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : err.message);
    if (tsAnggota !== null) turnstile.reset(tsAnggota);
  } finally { btn.disabled = false; }
});

$('form-pengurus').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return pesan('Email belum benar.');
  const btn = e.submitter; btn.disabled = true; pesan('Mengirim...', true);
  try {
    const r = await fetch(`${SB_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + '/beranda.html')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ email, create_user: false }),
    });
    if (!r.ok) throw new Error(r.status === 429 ? 'Terlalu sering. Tunggu beberapa menit lalu coba lagi.' : 'Email belum bisa dikirim. Coba lagi nanti.');
    pesan('Tautan masuk sudah dikirim. Silakan buka email Kang.', true);
  } catch (err) {
    pesan(err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : err.message);
  } finally { btn.disabled = false; }
});
