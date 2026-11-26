const $ = (id) => document.getElementById(id);
const tulis = (el, t, ok) => { el.textContent = t; el.className = 'pesan' + (ok ? ' ok' : ''); };
const pesan = (t, ok) => tulis($('pesan'), t, ok);
let tsAnggota = null, tsToken = '', tsTunggu = [];
const tsKabari = (t) => { tsToken = t; tsTunggu.splice(0).forEach((f) => f(t)); };

window.tsSiap = () => {
  tsAnggota = turnstile.render('#ts-anggota', {
    sitekey: TS_SITE, language: 'id', size: 'flexible', appearance: 'interaction-only',
    callback: tsKabari,
    'expired-callback': () => { tsToken = ''; },
    'before-interactive-callback': () => pesan('Ketuk kotak pemeriksaan keamanan di bawah tombol, lalu tunggu sebentar.'),
  });
};

// Tunggu pemeriksaan keamanan (Turnstile) selesai, paling lama 20 detik. Token hanya sekali pakai.
function tokenKeamanan(batas = 20000) {
  if (tsToken) { const t = tsToken; tsToken = ''; return Promise.resolve(t); }
  return new Promise((selesai) => {
    const habis = setTimeout(() => { tsTunggu = tsTunggu.filter((f) => f !== ambil); selesai(''); }, batas);
    const ambil = (t) => { clearTimeout(habis); tsToken = ''; selesai(t); };
    tsTunggu.push(ambil);
  });
}

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
  tombol.disabled = true; tombol.classList.add('sibuk'); tombol.querySelector('.teks').textContent = 'Memeriksa...'; pesan('');
  try {
    const token = await tokenKeamanan();
    if (!token) throw new Error('Pemeriksaan keamanan belum berhasil. Periksa sinyal internet, lalu coba lagi.');
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

// Pengurus: scan KTA mengganti ketik Nomor + desa; tetap wajib PIN Pengurus 8 angka (keputusan Kang 2026-11-26).
let qrPengurus = '';
function pakaiQrPengurus(teks) {
  qrPengurus = teks;
  const k = teks ? bacaKta(teks) : null;
  $('kta-terbaca-nomor').textContent = k ? (k.jenis === 'baru' ? k.kode.split('-')[1] : k.nomor) : '';
  $('kta-terbaca').hidden = !teks; $('isian-manual').hidden = !!teks; $('pindai-pengurus').hidden = !!teks;
  $('ket-pin').textContent = teks ? 'PIN Pengurus 8 angka.' : '6 angka di KTA. Pengurus: 8 angka.';
  if (teks) $('pin').focus(); else $('nomor').focus();
}
$('pindai-pengurus').onclick = async () => {
  pesan('');
  const teks = await pindaiQr({ judul: 'Pindai QR di KTA Pengurus' });
  if (!teks) return;
  if (!bacaKta(teks)) { pesan('QR ini bukan QR KTA TQN Cukir. Pindai QR di Kartu Anggota.'); return; }
  pakaiQrPengurus(teks);
};
$('ketik-manual').onclick = () => pakaiQrPengurus('');

$('form-anggota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value, desa = $('desa').value.trim(), pin = $('pin').value;
  const tombol = e.submitter || $('form-anggota').querySelector('button[type=submit]');
  if (qrPengurus) {
    if (!/^\d{8}$/.test(pin)) return salah('pin', 'PIN Pengurus harus 8 angka.');
    return masuk({ qr: qrPengurus, pin }, tombol, 'Masuk');
  }
  if (nomor.length !== 10) return salah('nomor', 'Nomor Anggota harus 10 angka.');
  if (!desa) return salah('desa', 'Nama desa belum diisi.');
  if (!/^(\d{6}|\d{8})$/.test(pin)) return salah('pin', 'PIN harus 6 angka (KTA) atau 8 angka (PIN Pengurus).');
  masuk({ nomor, desa, pin }, tombol, 'Masuk');
});
