// Penghubung ringan ke Supabase (tanpa library besar). Sesi disimpan di HP ini saja.
const SB_URL = 'https://tuthgclhrzvvlcnpjxiv.supabase.co';
const SB_KEY = 'sb_publishable_IWIH_9fvK7E3WvimMrz_vQ_3so84UC6'; // kunci publik (aman di website)
const TS_SITE = 'ISI_SITE_KEY_TURNSTILE';                          // kunci publik Turnstile
const SIMPAN = 'silsilah.sesi';

const sesi = {
  ambil() { try { return JSON.parse(localStorage.getItem(SIMPAN)); } catch { return null; } },
  simpan(s) { try { localStorage.setItem(SIMPAN, JSON.stringify(s)); } catch {} },
  hapus() { try { localStorage.removeItem(SIMPAN); } catch {} },
};

// Ambil sesi dari tautan email admin (#access_token=...)
function sesiDariTautan() {
  if (!location.hash.includes('access_token')) return;
  const p = new URLSearchParams(location.hash.slice(1));
  sesi.simpan({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) });
  history.replaceState(null, '', location.pathname);
}

async function tokenAktif() {
  const s = sesi.ambil();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  }).catch(() => null);
  if (!r || !r.ok) { if (r) sesi.hapus(); return null; }
  const b = await r.json();
  sesi.simpan({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at });
  return b.access_token;
}

// Baca tabel lewat REST (RLS tetap berlaku). contoh: dbGet('pengguna?select=nama,peran')
async function dbGet(jalur) {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const r = await fetch(`${SB_URL}/rest/v1/${jalur}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error('gagal-' + r.status);
  return r.json();
}

async function keluar() {
  const t = await tokenAktif();
  if (t) await fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  sesi.hapus();
  location.href = '/masuk.html';
}
