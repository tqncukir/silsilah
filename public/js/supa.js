// Penghubung ringan ke Supabase (tanpa library besar). Sesi disimpan di HP ini saja.
const SB_URL = 'https://tuthgclhrzvvlcnpjxiv.supabase.co';
const SB_KEY = 'sb_publishable_IWIH_9fvK7E3WvimMrz_vQ_3so84UC6'; // kunci publik (aman di website)
const TS_SITE = '0x4AAAAAAGRsXDXsYWPJ3-z-';                          // kunci publik Turnstile
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

// ID akun yang sedang masuk (dari token)
async function idSaya() {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
}

// Baca tabel lewat REST (RLS tetap berlaku). contoh: dbGet('pengguna?select=nama,peran')
async function dbGet(jalur) {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const r = await fetch(`${SB_URL}/rest/v1/${jalur}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error('gagal-' + r.status);
  return r.json();
}

// Untuk akun anggota: mulai ambil kartu_saya bersamaan dengan profil (hemat satu kali tunggu di HP).
// Token disegarkan dulu (sekali) agar dua permintaan tidak menyegarkan token bersamaan.
async function kartuSayaAwal() {
  const t = await tokenAktif();
  if (!t) return null;
  let email = '';
  try { email = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch {}
  // dibungkus { janji } agar await di pemanggil tidak ikut menunggu permintaannya selesai
  return email.endsWith('@anggota.silsilah.invalid') ? { janji: dbKirim('POST', 'rpc/kartu_saya', {}).catch(() => null) } : null;
}

async function keluar() {
  const t = await tokenAktif();
  if (t) await fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  sesi.hapus();
  location.href = '/masuk.html';
}

// Kirim perubahan (POST/PATCH) lewat REST. RLS tetap berlaku.
async function dbKirim(metode, jalur, isi, prefer = 'return=representation') {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const r = await fetch(`${SB_URL}/rest/v1/${jalur}`, {
    method: metode,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: isi === undefined ? undefined : JSON.stringify(isi),
  });
  if (!r.ok) { const b = await r.json().catch(() => ({})); const e = new Error('gagal-' + r.status); e.detail = b; throw e; }
  return r.status === 204 ? [] : r.json();
}

// Baca satu halaman data + jumlah total. Hasil: { baris, total }
async function dbHalaman(jalur, dari, sampai) {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const r = await fetch(`${SB_URL}/rest/v1/${jalur}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${t}`, Range: `${dari}-${sampai}`, Prefer: 'count=exact' },
  });
  if (!r.ok && r.status !== 416) throw new Error('gagal-' + r.status);
  const total = Number((r.headers.get('content-range') || '/0').split('/')[1]) || 0;
  return { baris: r.status === 416 ? [] : await r.json(), total };
}

// Profil akun yang sedang masuk: { nama, peran, jamaah_id }
async function profilSaya() {
  const [p] = await dbGet(`pengguna?select=nama,peran,jamaah_id&user_id=eq.${await idSaya()}`);
  // tampilkan menu sesuai peran
  const nav = (id, boleh) => { const el = document.getElementById(id); if (el) el.hidden = !boleh; };
  nav('nav-jamaah', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  nav('nav-daftar', p && PERAN_UBAH_JAMAAH.includes(p.peran));
  nav('nav-dasbor', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  return p || null;
}

const NAMA_PERAN = {
  admin_pusat: 'Admin Pusat', ketua: 'Ketua', bendahara: 'Bendahara', nadzir: 'Nadzir',
  koordinator_wilayah: 'Koordinator Wilayah', petugas_scan: 'Petugas Scan', khodim: 'Khodim/Keluarga',
  dokter: 'Dokter Pendamping', anggota: 'Anggota',
};
const PERAN_LIHAT_JAMAAH = ['admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah'];
const PERAN_UBAH_JAMAAH = ['admin_pusat', 'ketua', 'koordinator_wilayah'];

// Kalau sesi habis, kembali ke halaman Masuk
function tanganiGalat(e, tampil) {
  if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
  tampil(e.message === 'Failed to fetch' ? 'Sinyal terputus. Periksa sinyal lalu coba lagi.' : 'Gagal memuat data. Coba muat ulang halaman.');
}
const hurufAman = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Umur (tahun penuh) pada tanggal tertentu. tgl dalam format YYYY-MM-DD.
function hitungUmur(lahir, pada) {
  if (!lahir) return null;
  const a = new Date(lahir + 'T00:00:00'), b = pada ? new Date(pada + 'T00:00:00') : new Date();
  let u = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) u--;
  return u;
}
// Formulir: tanggal lahir -> umur saat daftar otomatis; isian umur manual hanya bila tanggal lahir kosong.
function pasangUmurOtomatis() {
  const g = (id) => document.getElementById(id);
  const atur = () => {
    const lahir = g('tgl-lahir').value, u = hitungUmur(lahir, g('tanggal').value || undefined);
    g('umur-ket').textContent = lahir ? (u >= 0 ? `Umur saat daftar: ${u} tahun` : 'Tanggal lahir sesudah tanggal daftar.') : 'Umur dihitung otomatis dari tanggal lahir.';
  };
  g('tgl-lahir').max = new Date().toLocaleDateString('sv-SE');
  g('tgl-lahir').addEventListener('input', atur);
  g('tanggal').addEventListener('input', atur);
  return atur;
}

// ===== Isian data KTP bersama (Pendaftaran & Ubah data) =====
const PERAN_GOLDAR = ['admin_pusat', 'ketua']; // gol. darah = data kesehatan, rahasia
function bacaIsianKtp() {
  const g = (id) => document.getElementById(id);
  const rt = g('rt-rw').value.replace(/[^0-9\/]/g, '');
  const m = rt.match(/^(\d{1,3})\/(\d{1,3})$/);
  return {
    jenis_kelamin: document.querySelector('[name=jk]:checked')?.value || null,
    rt_rw: m ? `${m[1].padStart(3, '0')}/${m[2].padStart(3, '0')}` : null,
    status_kawin: g('status-kawin').value || null,
    kewarganegaraan: g('wn').value || 'WNI',
  };
}
function isiIsianKtp(j) {
  const g = (id) => document.getElementById(id);
  document.querySelectorAll('[name=jk]').forEach((r) => { r.checked = r.value === j?.jenis_kelamin; });
  g('rt-rw').value = j?.rt_rw || '';
  g('status-kawin').value = j?.status_kawin || '';
  g('wn').value = j?.kewarganegaraan || 'WNI';
}
async function simpanGoldar(jamaahId, nilai, adaSebelumnya) {
  if (nilai) await dbKirim('POST', 'jamaah_goldar?on_conflict=jamaah_id', { jamaah_id: jamaahId, gol_darah: nilai }, 'resolution=merge-duplicates,return=minimal');
  else if (adaSebelumnya) await dbKirim('DELETE', `jamaah_goldar?jamaah_id=eq.${jamaahId}`, undefined, 'return=minimal');
}

// 89 jenis pekerjaan baku Dukcapil (isian Pekerjaan di KTP / SIAK). Dipakai untuk saran dan pembetulan hasil baca KTP.
const PEKERJAAN_BAKU = ["Belum/Tidak Bekerja", "Mengurus Rumah Tangga", "Pelajar/Mahasiswa", "Pensiunan", "Pegawai Negeri Sipil", "Tentara Nasional Indonesia", "Kepolisian RI", "Perdagangan", "Petani/Pekebun", "Peternak", "Nelayan/Perikanan", "Industri", "Konstruksi", "Transportasi", "Karyawan Swasta", "Karyawan BUMN", "Karyawan BUMD", "Karyawan Honorer", "Buruh Harian Lepas", "Buruh Tani/Perkebunan", "Buruh Nelayan/Perikanan", "Buruh Peternakan", "Pembantu Rumah Tangga", "Tukang Cukur", "Tukang Listrik", "Tukang Batu", "Tukang Kayu", "Tukang Sol Sepatu", "Tukang Las/Pandai Besi", "Tukang Jahit", "Tukang Gigi", "Penata Rias", "Penata Busana", "Penata Rambut", "Mekanik", "Seniman", "Tabib", "Paraji", "Perancang Busana", "Penterjemah", "Imam Masjid", "Pendeta", "Pastor", "Wartawan", "Ustadz/Mubaligh", "Juru Masak", "Promotor Acara", "Anggota DPR-RI", "Anggota DPD", "Anggota BPK", "Presiden", "Wakil Presiden", "Anggota Mahkamah Konstitusi", "Anggota Kabinet/Kementerian", "Duta Besar", "Gubernur", "Wakil Gubernur", "Bupati", "Wakil Bupati", "Walikota", "Wakil Walikota", "Anggota DPRD Provinsi", "Anggota DPRD Kabupaten/Kota", "Dosen", "Guru", "Pilot", "Pengacara", "Notaris", "Arsitek", "Akuntan", "Konsultan", "Dokter", "Bidan", "Perawat", "Apoteker", "Psikiater/Psikolog", "Penyiar Televisi", "Penyiar Radio", "Pelaut", "Peneliti", "Sopir", "Pialang", "Paranormal", "Pedagang", "Perangkat Desa", "Kepala Desa", "Biarawati", "Wiraswasta", "Lainnya"];
