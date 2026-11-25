const $ = (id) => document.getElementById(id);
const tulis = (el, t, ok) => { el.textContent = t; el.className = 'pesan' + (ok ? ' ok' : ''); };
const pesan = (t, ok) => tulis($('pesan'), t, ok);
let tsAnggota = null;

window.tsSiap = () => {
  tsAnggota = turnstile.render('#ts-anggota', { sitekey: TS_SITE, language: 'id', size: 'flexible', appearance: 'interaction-only' });
};

if (sesi.ambil()) location.replace('/beranda.html');

// Hanya angka untuk Nomor Anggota dan PIN
for (const id of ['nomor', 'pin']) $(id).addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '');
  if (v !== e.target.value) e.target.value = v;
  e.target.removeAttribute('aria-invalid');
});
$('desa').addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));

$('lihat-pin').onclick = () => {
  const tampak = $('pin').type === 'password';
  $('pin').type = tampak ? 'text' : 'password';
  $('lihat-pin').textContent = tampak ? 'Tutup' : 'Lihat';
  $('lihat-pin').setAttribute('aria-pressed', tampak);
};

const salah = (id, t) => { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); pesan(t); };

$('form-anggota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value, desa = $('desa').value.trim(), pin = $('pin').value;
  if (nomor.length !== 10) return salah('nomor', 'Nomor Anggota harus 10 angka.');
  if (!desa) return salah('desa', 'Nama desa belum diisi.');
  if (!/^(\d{6}|\d{8})$/.test(pin)) return salah('pin', 'PIN harus 6 angka (KTA) atau 8 angka (PIN Pengurus).');
  const token = tsAnggota !== null ? turnstile.getResponse(tsAnggota) : '';
  if (!token) return pesan('Pemeriksaan keamanan belum selesai. Tunggu sebentar lalu tekan Masuk lagi.');
  const btn = e.submitter || $('form-anggota').querySelector('button[type=submit]');
  btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Memeriksa...'; pesan('');
  try {
    const r = await fetch(`${SB_URL}/functions/v1/login-anggota`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ nomor, desa, pin, turnstile: token }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.pesan || 'Terjadi gangguan. Coba lagi.');
    sesi.simpan({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at });
    btn.querySelector('.teks').textContent = 'Berhasil, membuka...';
    location.replace('/beranda.html');
    return;
  } catch (err) {
    pesan(err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : err.message);
    if (tsAnggota !== null) turnstile.reset(tsAnggota);
  }
  btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Masuk';
});

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
