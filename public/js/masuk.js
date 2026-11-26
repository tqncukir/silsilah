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

async function masuk(isi, tombol, teksAwal) {
  const token = tsAnggota !== null ? turnstile.getResponse(tsAnggota) : '';
  if (!token) { pesan('Pemeriksaan keamanan belum selesai. Tunggu sebentar lalu coba lagi.'); return; }
  tombol.disabled = true; tombol.classList.add('sibuk'); tombol.querySelector('.teks').textContent = 'Memeriksa...'; pesan('');
  try {
    const r = await fetch(`${SB_URL}/functions/v1/login-anggota`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ ...isi, turnstile: token }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.pesan || 'Terjadi gangguan. Coba lagi.');
    sesi.simpan({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at });
    tombol.querySelector('.teks').textContent = 'Berhasil, membuka...';
    location.replace('/beranda.html');
    return;
  } catch (err) {
    pesan(err.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : err.message);
    if (tsAnggota !== null) turnstile.reset(tsAnggota);
  }
  tombol.disabled = false; tombol.classList.remove('sibuk'); tombol.querySelector('.teks').textContent = teksAwal;
}

$('pindai').onclick = async () => {
  pesan('');
  const teks = await pindaiQr({ judul: 'Pindai QR di KTA Anda' });
  if (!teks) return;
  if (!bacaKta(teks)) { pesan('QR ini bukan QR KTA TQN Cukir. Pindai QR di Kartu Anggota.'); return; }
  masuk({ qr: teks }, $('pindai'), 'Pindai QR KTA');
};

const salah = (id, t) => { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); pesan(t); };

$('form-anggota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value, desa = $('desa').value.trim(), pin = $('pin').value;
  if (nomor.length !== 10) return salah('nomor', 'Nomor Anggota harus 10 angka.');
  if (!desa) return salah('desa', 'Nama desa belum diisi.');
  if (!/^(\d{6}|\d{8})$/.test(pin)) return salah('pin', 'PIN harus 6 angka (KTA) atau 8 angka (PIN Pengurus).');
  masuk({ nomor, desa, pin }, e.submitter || $('form-anggota').querySelector('button[type=submit]'), 'Masuk');
});
