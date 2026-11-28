// Penghubung ringan ke Supabase (tanpa library besar). Sesi disimpan di HP ini saja.
const SB_URL = 'https://tuthgclhrzvvlcnpjxiv.supabase.co';
const SB_KEY = 'sb_publishable_IWIH_9fvK7E3WvimMrz_vQ_3so84UC6'; // kunci publik (aman di website)
const TS_SITE = '0x4AAAAAAGRsXDXsYWPJ3-z-';                          // kunci publik Turnstile
const SIMPAN = 'silsilah.sesi';
const BARU_MASUK = 'silsilah.baru_masuk'; // ditandai saat login: halaman berikutnya mencatat 'masuk' (aktivitas pengurus, Tahap 18)
const SIMPAN_PROFIL = 'silsilah.profil'; // nama, peran, jamaah_id terakhir: agar nama & menu langsung tampil (Kang 2026-11-28, aplikasi lambat)

const sesi = {
  ambil() { try { return JSON.parse(localStorage.getItem(SIMPAN)); } catch { return null; } },
  simpan(s) { try { localStorage.setItem(SIMPAN, JSON.stringify(s)); } catch {} },
  hapus() { try { localStorage.removeItem(SIMPAN); localStorage.removeItem(SIMPAN_PROFIL); } catch {} },
};

// Ambil sesi dari tautan email admin (#access_token=...)
function sesiDariTautan() {
  if (!location.hash.includes('access_token')) return;
  const p = new URLSearchParams(location.hash.slice(1));
  sesi.simpan({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Number(p.get('expires_at')) });
  try { localStorage.setItem(BARU_MASUK, '1'); } catch {}
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
  await matikanNotif().catch(() => {}); // HP bersama: notifikasi akun ini berhenti di perangkat ini
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
  // Cepat: pakai profil simpanan (akun yang sama) agar halaman langsung tampil, lalu cek ke server di belakang layar.
  // Bila peran/nama berubah, halaman dimuat ulang. Hak akses tetap ditegakkan RLS di server.
  const id = await idSaya();
  let simpan = null;
  try { const s = JSON.parse(localStorage.getItem(SIMPAN_PROFIL)); if (s && s.id === id) simpan = s.p; } catch {}
  const segar = dbGet(`pengguna?select=nama,peran,jamaah_id&user_id=eq.${id}`).then(([b]) => {
    const baru = b || null;
    try { if (baru) localStorage.setItem(SIMPAN_PROFIL, JSON.stringify({ id, p: baru })); else localStorage.removeItem(SIMPAN_PROFIL); } catch {}
    return baru;
  });
  let p;
  if (simpan) {
    p = simpan;
    segar.then((baru) => { if (JSON.stringify(baru) !== JSON.stringify(simpan)) location.reload(); })
      .catch((e) => { if (e.message === 'belum-masuk' || e.message === 'gagal-401') { sesi.hapus(); location.replace('/masuk.html'); } });
  } else p = await segar;
  // tampilkan menu sesuai peran
  const nav = (id, boleh) => { const el = document.getElementById(id); if (el) el.hidden = !boleh; };
  nav('nav-jamaah', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  nav('nav-daftar', p && PERAN_UBAH_JAMAAH.includes(p.peran));
  nav('nav-dasbor', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  nav('nav-kegiatan', p && PERAN_LIHAT_KEGIATAN.includes(p.peran));
  nav('nav-ahli', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  nav('nav-perjalanan', p && PERAN_LIHAT_PERJALANAN.includes(p.peran));
  nav('nav-kas', p && PERAN_LIHAT_KAS.includes(p.peran));
  nav('nav-bantuan', p && PERAN_BANTUAN.includes(p.peran));
  nav('nav-ekonomi', p && PERAN_EKONOMI.includes(p.peran));
  nav('nav-usaha', !!p);
  nav('nav-sakit', p && PERAN_KESEHATAN.includes(p.peran));
  nav('nav-kebutuhan', p && PERAN_KEBUTUHAN.includes(p.peran));
  nav('nav-aset', p && PERAN_LIHAT_ASET.includes(p.peran));
  if (p) pasangMenuBawah(p);
  if (p && p.peran !== 'anggota') catatAktivitas();
  return p || null;
}

// Aktivitas pengurus (Tahap 18): catat masuk & halaman yang dibuka. Server mengabaikan anggota/sesi KTA lama
// dan halaman yang sama dalam 10 menit; di HP juga ditahan 10 menit per halaman agar hemat panggilan. Tidak pernah mengganggu halaman.
function catatAktivitas() {
  const kirim = (jenis, halaman) => dbKirim('POST', 'rpc/catat_aktivitas', { p_jenis: jenis, p_halaman: halaman }).catch(() => {});
  try {
    if (localStorage.getItem(BARU_MASUK)) { localStorage.removeItem(BARU_MASUK); kirim('masuk', '/masuk'); }
    const h = location.pathname.replace(/\.html$/, '') || '/', k = `silsilah.buka:${h}`;
    if (Date.now() - Number(sessionStorage.getItem(k) || 0) < 10 * 60e3) return;
    sessionStorage.setItem(k, String(Date.now()));
    kirim('buka', h);
  } catch {}
}

// ===== Menu (Alternatif B "Emas di atas Hijau", Kang 2026-11-28) =====
// HP & tablet (<1024px): menu bawah 4 tombol + "Lainnya" berisi ubin ikon per kelompok warna.
// Laptop & komputer (>=1024px): menu samping kiri dengan kelompok yang sama. Satu daftar untuk keduanya.
const IKON_MENU = {
  notif: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  saya: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
  beranda: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  jamaah: 'M9 11.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.5a3 3 0 010 5.6M17.5 14.3c1.7.6 2.7 2.2 3 4.7',
  kegiatan: 'M6 5h12a2.5 2.5 0 012.5 2.5V18a2.5 2.5 0 01-2.5 2.5H6A2.5 2.5 0 013.5 18V7.5A2.5 2.5 0 016 5zM3.5 10h17M8 3v4M16 3v4',
  kta: 'M5.5 5h13A2.5 2.5 0 0121 7.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-9A2.5 2.5 0 015.5 5zM8.5 13a2 2 0 100-4 2 2 0 000 4zM5.5 16c.6-1.5 1.6-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13.5h4',
  lainnya: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  dasbor: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  daftar: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5M18 8v6M15 11h6',
  pin: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3M12 15v2',
  absensi: 'M4 4h16v16H4zM8 12l3 3 5-6',
  ahli: 'M7 21V9a5 5 0 0110 0v12M4 21h16M10 12h4',
  haul: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M14.5 16.5a2.5 2.5 0 11-2-4 2 2 0 002 4z',
  ziarah: 'M3 13l18-8-6 15-3-6-9-1zM12 14l3-3',
  agenda: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  bantuan: 'M12 20s-7-4.4-7-9.5A4 4 0 0112 8a4 4 0 017 2.5C19 15.6 12 20 12 20z',
  ekonomi: 'M4 20h16M6 16l4-4 3 3 5-6M15 9h3v3',
  usaha: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  sakit: 'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z',
  kebutuhan: 'M12 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM9 8h6M12 8v6l4 5M12 14H9M8.5 12a5 5 0 105.5 7.5',
  kas: 'M4 7h15a1 1 0 011 1v11H4zM4 7l12-3v3M16 13h2',
  aset: 'M3 20h18M5 20V10l7-5 7 5v10M10 20v-5h4v5',
  backup: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.5A4 4 0 0117 18M12 12v7M9 14l3-3 3 3',
  sistem: 'M3 12h4l2-5 4 10 2-5h6',
  pasang: 'M7 3h10v18H7zM11 18h2',
  keluar: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  tutup: 'M6 6l12 12M18 6L6 18',
  berita: 'M5 4h11a2 2 0 012 2v13a1 1 0 001 1H6a2 2 0 01-2-2V5a1 1 0 011-1zM18 8h2v10a2 2 0 01-2 2M8 8h6M8 12h6M8 16h3',
  panduan: 'M12 6.5C10.5 5 8.2 4.5 4 4.5v14c4.2 0 6.5.5 8 2 1.5-1.5 3.8-2 8-2v-14c-4.2 0-6.5.5-8 2zM12 6.5v14',
};
const GRUP_MENU = [['pondasi', 'Pondasi Jamaah'], ['ruhani', 'Ruhani & Kegiatan'], ['kepedulian', 'Kepedulian'], ['amanah', 'Amanah & Tata Kelola']];
const ikonMenu = (k, u = 20) => `<svg viewBox="0 0 24 24" width="${u}" height="${u}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${IKON_MENU[k]}"/></svg>`;
function daftarMenu(p) {
  const anggota = p.peran === 'anggota', boleh = (r) => !r || r.includes(p.peran);
  // [ikon, label, alamat, kelompok]; kelompok '' = menu utama (menu bawah HP / atas menu samping)
  const semua = anggota
    ? [['beranda', 'Beranda', '/beranda.html', ''], ['kta', 'KTA', '/kta.html', ''], ['kegiatan', 'Agenda', '/agenda.html', ''],
      ['saya', 'Data Saya', '/saya.html', 'pondasi'], ['notif', 'Notifikasi', '/notif.html', 'pondasi'], ['panduan', 'Panduan Peran', '/panduan.html', 'pondasi'],
      ['ahli', 'Ahli Kubur', '/ahli-kubur.html', 'ruhani'], ['haul', 'Haul', '/haul.html', 'ruhani'], ['ziarah', 'Ziarah & Umroh', '/saya.html#ziarah', 'ruhani'],
      ['usaha', 'Usaha Jamaah', '/usaha.html', 'kepedulian']]
    : [['beranda', 'Beranda', '/beranda.html', '', null], ['jamaah', 'Jamaah', '/jamaah.html', '', PERAN_LIHAT_JAMAAH],
      ['kegiatan', 'Kegiatan', '/kegiatan.html', '', PERAN_LIHAT_KEGIATAN],
      ['dasbor', 'Dashboard', '/dashboard.html', 'pondasi', PERAN_LIHAT_JAMAAH], ['daftar', 'Pendaftaran', '/pendaftaran.html', 'pondasi', PERAN_UBAH_JAMAAH],
      ['pin', 'Atur PIN', '/pengurus-pin.html', 'pondasi', ['admin_pusat']], ['notif', 'Notifikasi', '/notif.html', 'pondasi', null],
      ['panduan', 'Panduan Peran', '/panduan.html', 'pondasi', null],
      ['absensi', 'Absensi', '/absensi.html', 'ruhani', PERAN_ABSEN], ['ahli', 'Ahli Kubur', '/ahli-kubur.html', 'ruhani', PERAN_LIHAT_JAMAAH],
      ['haul', 'Haul', '/haul.html', 'ruhani', PERAN_LIHAT_JAMAAH], ['ziarah', 'Ziarah & Umroh', '/perjalanan.html', 'ruhani', PERAN_LIHAT_PERJALANAN],
      ['agenda', 'Agenda umum', '/agenda.html', 'ruhani', null],
      ['berita', 'Kelola Berita', '/berita-kelola.html', 'ruhani', PERAN_BERITA],
      ['bantuan', 'Bantuan Sosial', '/bantuan.html', 'kepedulian', PERAN_BANTUAN], ['ekonomi', 'Ekonomi Jamaah', '/ekonomi.html', 'kepedulian', PERAN_EKONOMI],
      ['usaha', 'Usaha Jamaah', '/usaha.html', 'kepedulian', null], ['sakit', 'Jamaah Sakit', '/sakit.html', 'kepedulian', PERAN_KESEHATAN],
      ['kebutuhan', 'Kebutuhan Khusus', '/kebutuhan.html', 'kepedulian', PERAN_KEBUTUHAN],
      ['kas', 'Buku Kas', '/kas.html', 'amanah', PERAN_LIHAT_KAS], ['aset', 'Aset & Wakaf', '/aset.html', 'amanah', PERAN_LIHAT_ASET],
      ['backup', 'Pantau Backup', '/backup.html', 'amanah', ['admin_pusat']], ['sistem', 'Kesehatan Sistem', '/sistem.html', 'amanah', ['admin_pusat']]].filter((m) => boleh(m[4]));
  return { utama: semua.filter((m) => !m[3]), grup: GRUP_MENU.map(([k, n]) => [k, n, semua.filter((m) => m[3] === k)]).filter((g) => g[2].length) };
}
function pasangMenuBawah(p) {
  if (!document.body.classList.contains('hal-app') || document.getElementById('menu-bawah')) return;
  // Cloudflare Pages menampilkan alamat tanpa ".html" (/haul, bukan /haul.html): bandingkan tanpa akhiran.
  const { utama, grup } = daftarMenu(p), jalur = location.pathname.replace(/\.html$/, '');
  const aktif = (alamat) => { const u = alamat.replace(/\.html$/, '');
    return jalur === u || (u === '/jamaah' && jalur.startsWith('/jamaah')) || (u === '/kegiatan' && /^\/(kegiatan|absensi)/.test(jalur))
      || (u !== '/beranda' && jalur === `${u}-isi`) || (u === '/berita-kelola' && jalur === '/berita-isi'); };
  const cur = (u) => (aktif(u) ? ' aria-current="page"' : '');
  const diLain = !utama.some(([, , u]) => aktif(u));
  // Menu bawah (HP & tablet)
  const nav = document.createElement('nav');
  nav.id = 'menu-bawah'; nav.className = 'menu-bawah'; nav.setAttribute('aria-label', 'Menu');
  nav.innerHTML = utama.map(([k, t, u]) => `<a href="${u}"${cur(u)}>${ikonMenu(k, 24)}<span>${t}</span></a>`).join('')
    + `<button type="button" id="menu-lain-buka" aria-haspopup="dialog"${diLain ? ' aria-current="page"' : ''}>${ikonMenu('lainnya', 24)}<span>Lainnya</span></button>`;
  // Lembar "Lainnya": ubin ikon per kelompok
  const d = document.createElement('dialog');
  d.className = 'menu-lain'; d.setAttribute('aria-labelledby', 'menu-lain-judul');
  d.innerHTML = `<div class="menu-lain-kepala"><h2 id="menu-lain-judul">Menu lainnya</h2>
      <button type="button" class="menu-lain-tutup" id="menu-lain-tutup" aria-label="Tutup menu">${ikonMenu('tutup')}</button></div>
    ${grup.map(([k, n, isi]) => `<section class="menu-grup" aria-label="${n}"><h3><span class="titik-${k}" aria-hidden="true"></span>${n}</h3>
      <ul class="ml-ubin">${isi.map(([i, t, u]) => `<li><a href="${u}"${cur(u)}><span class="ml-ikon">${ikonMenu(i)}</span><span>${t}</span></a></li>`).join('')}</ul></section>`).join('')}
    <div class="menu-lain-kaki"><a href="/pasang.html" class="menu-pasang">${ikonMenu('pasang')}Cara pasang di HP</a>
      <button type="button" class="menu-keluar" id="menu-lain-keluar">${ikonMenu('keluar')}Keluar</button></div>`;
  // Menu atas (laptop & komputer, Kang 2026-11-28): menu utama + tombol kelompok; klik kelompok = daftar menu muncul di bawahnya.
  const s = document.createElement('nav');
  s.id = 'menu-atas'; s.className = 'menu-atas'; s.setAttribute('aria-label', 'Menu utama');
  const PENDEK = { pondasi: 'Pondasi', ruhani: 'Ruhani', kepedulian: 'Kepedulian', amanah: 'Amanah' };
  const panah = '<svg class="ma-panah" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  // Menu admin di kanan atas, sebelah Keluar (Kang 2026-11-28): dikeluarkan dari kelompoknya agar tidak dobel.
  const ADMIN = ['dasbor', 'pin', 'backup', 'sistem'];
  const admin = grup.flatMap(([, , isi]) => isi.filter(([i]) => ADMIN.includes(i)));
  const grupAtas = grup.map(([k, n, isi]) => [k, n, isi.filter(([i]) => !ADMIN.includes(i))]).filter(([, , isi]) => isi.length);
  const NAMA_ADMIN = { dasbor: 'Dashboard Pengurus', pin: 'Atur PIN Pengurus', backup: 'Pantau Backup', sistem: 'Kesehatan Sistem' };
  const tombolAdmin = admin.length > 1
    ? `<div class="ma-grup ma-admin"><button type="button" class="ma-tombol${admin.some(([, , u]) => aktif(u)) ? ' ma-aktif' : ''}" aria-expanded="false" aria-controls="ma-admin">Admin${panah}</button>
      <div class="ma-panel" id="ma-admin" hidden><p>Admin</p><ul>${admin.map(([i, , u]) => `<li><a href="${u}"${cur(u)}><span class="ml-ikon">${ikonMenu(i, 18)}</span><span>${NAMA_ADMIN[i]}</span></a></li>`).join('')}</ul></div></div>`
    : admin.map(([, , u]) => `<a href="${u}" class="ma-utama ma-admin"${cur(u)}>Dashboard</a>`).join('');
  s.innerHTML = utama.map(([, t, u]) => `<a href="${u}" class="ma-utama"${cur(u)}>${t}</a>`).join('')
    + grupAtas.map(([k, n, isi]) => `<div class="ma-grup"><button type="button" class="ma-tombol${isi.some(([, , u]) => aktif(u)) ? ' ma-aktif' : ''}" aria-expanded="false" aria-controls="ma-${k}">${PENDEK[k]}${panah}</button>
      <div class="ma-panel" id="ma-${k}" hidden><p>${n}</p><ul>${isi.map(([i, t, u]) => `<li><a href="${u}"${cur(u)}><span class="ml-ikon">${ikonMenu(i, 18)}</span><span>${t}</span></a></li>`).join('')}</ul></div></div>`).join('') + tombolAdmin;
  const tutupSemua = (kecuali) => s.querySelectorAll('.ma-tombol[aria-expanded="true"]').forEach((t) => {
    if (t === kecuali) return;
    t.setAttribute('aria-expanded', 'false'); document.getElementById(t.getAttribute('aria-controls')).hidden = true;
  });
  s.addEventListener('click', (e) => {
    const t = e.target.closest('.ma-tombol');
    if (!t) return;
    const buka = t.getAttribute('aria-expanded') !== 'true';
    tutupSemua(t);
    t.setAttribute('aria-expanded', buka); document.getElementById(t.getAttribute('aria-controls')).hidden = !buka;
  });
  document.addEventListener('click', (e) => { if (!s.contains(e.target)) tutupSemua(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const t = s.querySelector('.ma-tombol[aria-expanded="true"]');
    if (t) { tutupSemua(); t.focus(); }
  });
  const isiAtas = document.querySelector('.app-atas-isi');
  if (isiAtas) isiAtas.insertBefore(s, isiAtas.querySelector('.app-keluar'));
  document.body.append(nav, d);
  document.body.classList.add('ada-menu-bawah', 'ada-menu-atas');
  // Saat mengetik, keyboard HP bisa mengangkat menu bawah sehingga menutup isian/tombol Simpan: sembunyikan sementara.
  const ketik = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
    || (el.tagName === 'INPUT' && !/^(radio|checkbox|button|submit|reset|range|color|file)$/.test(el.type)));
  // Selama fokus masih di dalam formulir (mis. pindah dari isian ke tombol Simpan/Daftarkan), menu tetap tersembunyi:
  // kalau muncul lagi saat jari menekan tombol, ketukan bisa jatuh ke menu dan tombol tidak tertekan.
  const tetap = (el) => ketik(el) || (document.body.classList.contains('sedang-ketik') && !!el?.closest?.('form'));
  document.addEventListener('focusin', (e) => document.body.classList.toggle('sedang-ketik', tetap(e.target)));
  document.addEventListener('focusout', () => setTimeout(() => document.body.classList.toggle('sedang-ketik', tetap(document.activeElement)), 0));
  const buka = document.getElementById('menu-lain-buka');
  buka.onclick = () => d.showModal();
  document.getElementById('menu-lain-tutup').onclick = () => d.close();
  document.getElementById('menu-lain-keluar').onclick = () => keluar();
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => buka.focus());
}

// ===== Berita (Tahap 14) =====
// Pimpinan (admin pusat, ketua) menerbitkan langsung; koordinator mengajukan (disetujui pimpinan). Hak dicek di database.
const PERAN_BERITA = ['admin_pusat', 'ketua', 'koordinator_wilayah'];
const PERAN_PIMPINAN_BERITA = ['admin_pusat', 'ketua'];
const STATUS_BERITA = { draf: ['Draf', 'stat-biasa eko-belum'], diajukan: ['Menunggu persetujuan', 'stat-tidak'], terbit: ['Terbit', 'stat-aktif'],
  ditolak: ['Ditolak', 'stat-wafat'], ditarik: ['Ditarik', 'stat-wafat'] };
const statusBeritaHtml = (s) => { const [t, k] = STATUS_BERITA[s] || [s, 'stat-biasa']; return `<span class="stat ${k}">${t}</span>`; };
const fotoBerita = (nama) => (nama ? `${SB_URL}/storage/v1/object/public/berita/${encodeURIComponent(nama)}` : '');
// Isi berita (teks biasa) -> paragraf aman
const paragrafBerita = (isi) => String(isi || '').split(/\n{2,}/).map((p) => `<p>${hurufAman(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
// Kecilkan foto di perangkat: lebar maks 1200 px, WebP (JPEG bila WebP tidak didukung), maks ±400 KB.
async function kecilkanFoto(file) {
  const gambar = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!gambar) throw new Error('bukan-gambar');
  const skala = Math.min(1, 1200 / gambar.width);
  const c = document.createElement('canvas');
  c.width = Math.round(gambar.width * skala); c.height = Math.round(gambar.height * skala);
  c.getContext('2d').drawImage(gambar, 0, 0, c.width, c.height);
  const jadi = (jenis, mutu) => new Promise((ok) => c.toBlob(ok, jenis, mutu));
  let jenis = 'image/webp', blob = await jadi(jenis, 0.8);
  if (!blob || blob.type !== 'image/webp') { jenis = 'image/jpeg'; blob = await jadi(jenis, 0.82); }
  for (let mutu = 0.7; blob && blob.size > 390000 && mutu >= 0.4; mutu -= 0.1) blob = await jadi(jenis, mutu);
  if (!blob || blob.size > 400000) throw new Error('foto-besar');
  return blob;
}
async function unggahFotoBerita(blob) {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const nama = `${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/berita/${nama}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${t}`, 'Content-Type': blob.type, 'x-upsert': 'false', 'cache-control': '31536000' }, body: blob });
  if (!r.ok) throw new Error('gagal-unggah-' + r.status);
  return nama;
}
async function hapusFotoBerita(nama) {
  const t = await tokenAktif();
  if (!t || !nama) return;
  await fetch(`${SB_URL}/storage/v1/object/berita/${encodeURIComponent(nama)}`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
}

// ===== Ahli Kubur (modul 5) =====
// Halaman pengurus: peran yang melihat Data Jamaah. Ubah: admin pusat & ketua; koordinator untuk kecamatannya (RLS).
const PERAN_KELOLA_AK = ['admin_pusat', 'ketua', 'koordinator_wilayah'];
const JENIS_AK = { jamaah: 'Jamaah', keluarga: 'Keluarga jamaah', masyayikh: 'Masyayikh/Mursyid' };
const HUBUNGAN_AK = ['Ayah', 'Ibu', 'Kakek', 'Nenek', 'Suami', 'Istri', 'Anak', 'Cucu', 'Saudara', 'Paman', 'Bibi', 'Mertua', 'Lainnya'];

// Tanggal Hijriah (kalender Ummul Qura bawaan browser; bisa selisih 1 hari dengan rukyat, jadi selalu disebut perkiraan).
const _hijBagian = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const _hijBulan = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', { month: 'long', timeZone: 'UTC' });
const BULAN_HIJRIAH = []; // diisi di bawah: Muharam .. Zulhijah
// YYYY-MM-DD -> { d, m, y } Hijriah
function hijriah(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const p = Object.fromEntries(_hijBagian.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((x) => [x.type, x.value]));
  return { d: Number(p.day), m: Number(p.month), y: Number(String(p.year).replace(/\D/g, '')) };
}
(() => { // nama bulan Hijriah urut 1..12 dalam bahasa Indonesia
  for (let i = 0; i < 400; i++) {
    const t = new Date(Date.UTC(2026, 0, 1 + i)), h = hijriah(t.toISOString().slice(0, 10));
    BULAN_HIJRIAH[h.m - 1] = _hijBulan.format(new Date(Date.UTC(2026, 0, 1 + i, 12)));
  }
})();
const teksHijriah = (iso) => { if (!iso) return ''; const h = hijriah(iso); return `${h.d} ${BULAN_HIJRIAH[h.m - 1]} ${h.y} H`; };

// ===== Kegiatan (modul 4) =====
const PERAN_LIHAT_KEGIATAN = ['admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah'];
const PERAN_KELOLA_KEGIATAN = ['admin_pusat', 'ketua', 'koordinator_wilayah']; // koordinator: kecamatannya (RLS)
const PERAN_ABSEN = ['admin_pusat', 'ketua', 'petugas_scan', 'koordinator_wilayah']; // koordinator: kegiatan kecamatannya (catat_hadir)
const JENIS_KEGIATAN = { khususiyah: 'Khususiyah/Tawajjuhan', manaqiban: 'Manaqiban', haul: 'Haul/Acara akbar', pengajian: 'Pengajian/lainnya' };
// Waktu kegiatan selalu WIB (Jombang), apa pun zona waktu HP.
const ZONA = 'Asia/Jakarta';
const tglWib = (iso, opsi = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => new Date(iso).toLocaleDateString('id-ID', { timeZone: ZONA, ...opsi });
// Jam selalu 24 jam (tanpa AM/PM), titik sebagai pemisah: 05.00, 19.30. Banyak jamaah desa tidak terbiasa AM/PM.
const jamWib = (iso) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', '.');
// "05.00 WIB" atau "05.00 WIB sampai 15.00 WIB"
const rentangJam = (mulai, selesai) => `${jamWib(mulai)} WIB${selesai ? ` sampai ${jamWib(selesai)} WIB` : ''}`;
const isoWib = (tgl, jam) => `${tgl}T${jam}:00+07:00`;
const hariIniWib = () => new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
function statusKegiatan(k) {
  if (k.dibatalkan) return ['Dibatalkan', 'stat-wafat'];
  const now = Date.now(), awal = new Date(k.mulai).getTime(), akhir = k.selesai ? new Date(k.selesai).getTime() : awal + 3 * 3600e3;
  if (now > akhir) return ['Selesai', ''];
  return now >= awal ? ['Berlangsung', 'stat-aktif'] : ['Akan datang', 'stat-biasa'];
}

// ===== Ziarah & Umroh (modul 10) =====
// Lihat perjalanan: pengurus (petugas scan tanpa peserta). Buat/ubah: sama dengan kegiatan (koordinator: kecamatannya, RLS).
// Peserta & tanda Lunas: admin pusat, ketua, bendahara, koordinator (dibatasi di database).
const PERAN_LIHAT_PERJALANAN = ['admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah', 'dokter', 'khodim'];
const PERAN_KELOLA_PERJALANAN = ['admin_pusat', 'ketua', 'koordinator_wilayah'];
const PERAN_PESERTA = ['admin_pusat', 'ketua', 'bendahara', 'koordinator_wilayah'];
const JENIS_PERJALANAN = { ziarah: 'Ziarah', umroh: 'Umroh' };
// Tanggal pulang (YYYY-MM-DD) dianggap selesai di akhir hari itu (WIB); kosong = hari berangkat.
const akhirPerjalanan = (p) => new Date(`${p.pulang || new Date(p.berangkat).toLocaleDateString('sv-SE', { timeZone: ZONA })}T23:59:59+07:00`).getTime();
function statusPerjalanan(p) {
  if (p.dibatalkan) return ['Dibatalkan', 'stat-wafat'];
  const now = Date.now();
  if (now > akhirPerjalanan(p)) return ['Selesai', ''];
  return now >= new Date(p.berangkat).getTime() ? ['Berlangsung', 'stat-aktif'] : ['Akan berangkat', 'stat-biasa'];
}
// Ringkas: "Min, 20 Des 2026 · kumpul 20.00 WIB" (sehari) atau "20–23 Des 2026 · kumpul 20.00 WIB",
// "30 Des – 2 Jan 2027", "30 Des 2026 – 2 Jan 2027". Tanggal & jam selalu WIB.
function waktuPerjalanan(p) {
  const pergi = new Date(p.berangkat).toLocaleDateString('sv-SE', { timeZone: ZONA });
  const kumpul = ` · kumpul ${jamWib(p.berangkat)} WIB`;
  if (!p.pulang || p.pulang === pergi) return tglWib(p.berangkat, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + kumpul;
  const bag = (ymd) => { const d = new Date(ymd + 'T12:00:00+07:00'); return { d: d.toLocaleDateString('id-ID', { timeZone: ZONA, day: 'numeric' }), b: d.toLocaleDateString('id-ID', { timeZone: ZONA, month: 'short' }), t: ymd.slice(0, 4) }; };
  const x = bag(pergi), y = bag(p.pulang);
  const awal = x.t !== y.t ? `${x.d} ${x.b} ${x.t}` : x.b !== y.b ? `${x.d} ${x.b}` : x.d;
  return `${awal}${x.b === y.b && x.t === y.t ? '–' : ' – '}${y.d} ${y.b} ${y.t}${kumpul}`;
}

// ===== Keuangan Yayasan (modul 9) =====
// Lihat: admin pusat, ketua, bendahara (semua kas), koordinator (kas kecamatannya). Catat: bendahara + koordinator.
// Bisyaroh (kategori rahasia): rincian hanya ketua & bendahara (dijaga di database).
const PERAN_LIHAT_KAS = ['admin_pusat', 'ketua', 'bendahara', 'koordinator_wilayah'];
const PERAN_CATAT_KAS = ['bendahara', 'koordinator_wilayah'];
const ARAH_KAS = { masuk: 'Masuk', keluar: 'Keluar' };
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// ===== Bantuan Sosial (modul 6) =====
// Nama penerima (data ekonomi, rahasia): ketua, bendahara, koordinator (wilayahnya). Ajukan: ketiganya; setujui/tolak: ketua;
// salurkan: bendahara & koordinator. Admin pusat hanya angka ringkas (Dashboard). Semua dijaga di database.
const PERAN_BANTUAN = ['ketua', 'bendahara', 'koordinator_wilayah'];
const JENIS_BANTUAN = { duka: 'Santunan duka', sakit: 'Sakit', sembako: 'Sembako', pendidikan: 'Pendidikan', bencana: 'Bencana', lainnya: 'Lainnya' };
const STATUS_BANTUAN = { diajukan: ['Menunggu persetujuan', 'stat-tidak'], disetujui: ['Siap disalurkan', 'stat-aktif'],
  disalurkan: ['Disalurkan', 'stat-biasa'], ditolak: ['Ditolak', 'stat-wafat'], dibatalkan: ['Dibatalkan', 'stat-wafat'] };
const teksBantuan = (b) => b.bentuk === 'uang' ? rupiah(b.nilai) : `${b.barang}${b.nilai ? ` (± ${rupiah(b.nilai)})` : ''}`;

// ===== Ekonomi Jamaah (modul 8) =====
// Kondisi ekonomi (rahasia): sama dengan Bantuan Sosial — ketua, bendahara, koordinator (wilayahnya). Dijaga di database.
const PERAN_EKONOMI = PERAN_BANTUAN;
const TINGKAT_EKONOMI = { mampu: ['Mampu', 'stat-biasa'], cukup: ['Cukup', 'stat-biasa'],
  kurang: ['Kurang mampu', 'stat-tidak'], sangat_kurang: ['Sangat kurang mampu', 'stat-wafat'] };

// Direktori usaha jamaah: dilihat semua yang login (anggota hanya yang Buka); dicatat admin pusat, ketua, koordinator (pemilik di wilayahnya).
const PERAN_CATAT_USAHA = ['admin_pusat', 'ketua', 'koordinator_wilayah'];
const JENIS_USAHA = { makanan: 'Makanan & minuman', pertanian: 'Pertanian & peternakan', toko: 'Toko/kelontong', kerajinan: 'Kerajinan',
  pakaian: 'Pakaian', herbal: 'Herbal & kesehatan', jasa: 'Jasa', lainnya: 'Lainnya' };

// ===== Kesehatan (modul 7) =====
// Rahasia, tanpa nama penyakit: ketua & dokter (semua), koordinator (jamaah wilayahnya). Khodim: kebutuhan khusus peserta perjalanan.
const PERAN_KESEHATAN = ['ketua', 'dokter', 'koordinator_wilayah'];
const TEMPAT_SAKIT = { rumah: 'Di rumah', rawat_inap: 'Rawat inap' };
const KONDISI_SAKIT = { ringan: ['Ringan', 'stat-biasa'], sedang: ['Sedang', 'stat-tidak'], berat: ['Berat', 'stat-wafat'] };
const STATUS_SAKIT = { sakit: 'Sedang sakit', sembuh: 'Sembuh', wafat: 'Wafat' };
const KEBUTUHAN_KHUSUS = { kursi_roda: 'Kursi roda', alat_jalan: 'Alat bantu jalan', pendamping: 'Perlu pendamping', tangga: 'Sulit naik tangga',
  penglihatan: 'Gangguan penglihatan', pendengaran: 'Gangguan pendengaran', lainnya: 'Lainnya' };
const PERAN_KEBUTUHAN = [...PERAN_KESEHATAN, 'khodim']; // khodim: hanya peserta perjalanan, tanpa catatan sakit
const teksKebutuhan = (k) => (k || []).map((x) => KEBUTUHAN_KHUSUS[x] || x).join(', ');

// ===== Aset & Wakaf (modul 14) =====
// Lihat: admin pusat, ketua, bendahara, nadzir. Catat: admin pusat, ketua, nadzir. Dijaga RLS. Tidak ada yang publik.
const PERAN_LIHAT_ASET = ['admin_pusat', 'ketua', 'bendahara', 'nadzir'];
const PERAN_CATAT_ASET = ['admin_pusat', 'ketua', 'nadzir'];
const SERTIFIKAT_WAKAF = { belum_aiw: 'Belum ada AIW', aiw: 'Sudah AIW', proses: 'Proses sertifikat', sertifikat: 'Bersertifikat' };
const PERUNTUKAN_WAKAF = { masjid: 'Masjid/Musholla', pondok: 'Pondok/Madrasah', makam: 'Makam', kantor: 'Kantor', produktif: 'Lahan produktif', lainnya: 'Lainnya' };
const KONDISI_ASET = { baik: 'Baik', perlu_perbaikan: 'Perlu perbaikan', rusak: 'Rusak' };
const KATEGORI_BARANG = { elektronik: 'Elektronik/Sound', kendaraan: 'Kendaraan', perabot: 'Perabot', ibadah: 'Perlengkapan ibadah', lainnya: 'Lainnya' };
const CARA_PEROLEHAN = { beli: 'Beli', hibah: 'Hibah/wakaf' };
const luasTeks = (n) => `${Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })} m²`;

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

// ===== Pantau Backup (Tahap 12, khusus admin pusat; database menolak peran lain) =====
const BATAS_BACKUP_JAM = 30; // sama dengan pemeriksaan Apps Script (cekHarian)
const ukuranTeks = (b) => b == null ? '–' : b >= 1048576 ? `${(b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(b / 1024)).toLocaleString('id-ID')} KB`;
// Baris dari rpc/status_backup (terbaru dulu) -> { jenis: ok|gagal|telat|kosong, judul, ket, terakhir }
function nilaiBackup(baris) {
  const t = baris[0];
  if (!t) return { jenis: 'kosong', judul: 'Belum ada catatan backup', ket: 'Catatan pertama masuk setelah backup harian jam 01.15 WIB berikutnya.' };
  const jam = (Date.now() - new Date(t.waktu).getTime()) / 3600000;
  const kapan = `${tglWib(t.waktu, { weekday: 'long', day: 'numeric', month: 'long' })}, jam ${jamWib(t.waktu)} WIB`;
  if (jam > BATAS_BACKUP_JAM) return { jenis: 'telat', terakhir: t, judul: `Tidak ada backup baru lebih dari ${BATAS_BACKUP_JAM} jam`,
    ket: `Catatan terakhir: ${kapan}. Bisa karena Supabase dijeda atau jadwal GitHub berhenti. Minta Claude memeriksanya.` };
  if (!t.berhasil) return { jenis: 'gagal', terakhir: t, judul: 'Backup terakhir gagal',
    ket: `${kapan}${t.gagal_di ? `, di langkah "${t.gagal_di}"` : ''}. Buka catatan GitHub untuk melihat sebabnya, atau minta Claude memeriksanya.` };
  return { jenis: 'ok', terakhir: t, judul: 'Backup terakhir berhasil',
    ket: `${kapan} · ${ukuranTeks(t.ukuran_byte)}${t.jumlah_tabel != null ? ` · ${t.jumlah_tabel} tabel` : ''}` };
}

// Hasil rpc/kesehatan_sistem -> daftar hal yang perlu perhatian: [tingkat, teks, alamat].
// 'penting' = sistem bisa terganggu (tampil satu per satu di Beranda admin); 'cek' = kerapian/tugas (diringkas jadi satu baris).
const BATAS_PENUH = 0.8; // 80% kuota paket gratis
function nilaiKesehatan(k) {
  const h = [], n = (x) => Number(x || 0), a = (x) => n(x).toLocaleString('id-ID');
  const b = k.backup?.terakhir;
  if (!b) h.push(['penting', 'Belum ada catatan backup', '/backup.html']);
  else if ((Date.now() - new Date(b.waktu).getTime()) / 36e5 > BATAS_BACKUP_JAM) h.push(['penting', `Tidak ada backup baru lebih dari ${BATAS_BACKUP_JAM} jam`, '/backup.html']);
  else if (!b.berhasil) h.push(['penting', 'Backup terakhir gagal', '/backup.html']);
  for (const j of k.notif?.jadwal || []) {
    const w = j.nama === 'notif-pagi' ? 'pagi' : 'sore';
    if (!j.aktif) h.push(['penting', `Jadwal notifikasi ${w} tidak aktif`, '/sistem.html#k-notif']);
    else if (j.status && j.status !== 'succeeded') h.push(['penting', `Kiriman notifikasi ${w} terakhir gagal`, '/sistem.html#k-notif']);
  }
  // Pemeriksaan otomatis 06.30/16.30 (Tahap 18 Langkah 4): kiriman ke server notifikasi yang gagal (tidak terbaca dari tempat lain)
  const ck = k.cek;
  if (ck && Date.now() - new Date(ck.waktu).getTime() < 24 * 36e5)
    for (const m of ck.masalah || []) if (/kiriman ke server notifikasi/.test(m)) h.push(['penting', m, '/sistem.html#k-notif']);
  const kp = k.kapasitas;
  if (kp && n(kp.db_byte) / n(kp.db_batas) >= BATAS_PENUH) h.push(['penting', 'Database hampir penuh (paket gratis)', '/sistem.html#k-kapasitas']);
  if (kp && n(kp.foto_byte) / n(kp.foto_batas) >= BATAS_PENUH) h.push(['penting', 'Tempat foto hampir penuh (paket gratis)', '/sistem.html#k-kapasitas']);
  const am = k.keamanan;
  if (am?.tabel_tanpa_rls?.length) h.push(['penting', `${a(am.tabel_tanpa_rls.length)} tabel belum dijaga aturan akses`, '/sistem.html#k-aman']);
  if (am?.fungsi_tamu?.length) h.push(['penting', `${a(am.fungsi_tamu.length)} fungsi terbuka untuk tamu`, '/sistem.html#k-aman']);
  const d = k.data || {};
  if (n(d.wafat_aktif)) h.push(['cek', `${a(d.wafat_aktif)} jamaah wafat masih berstatus aktif`, '/jamaah.html?status=wafat']);
  if (n(d.koordinator_tanpa_wilayah)) h.push(['cek', `${a(d.koordinator_tanpa_wilayah)} koordinator belum punya wilayah tugas`, '/pengurus-pin.html']);
  if (n(d.catatan_terbuka)) h.push(['cek', `${a(d.catatan_terbuka)} catatan pengecekan data belum selesai`, '/dashboard.html#p-catatan']);
  if (n(d.umur_kosong)) h.push(['cek', `${a(d.umur_kosong)} umur jamaah belum diisi`, '/dashboard.html']);
  if (n(d.jk_kosong)) h.push(['cek', `${a(d.jk_kosong)} jenis kelamin belum diisi`, '/lengkapi-jk.html']);
  if (n(k.akun?.terkunci)) h.push(['cek', `${a(k.akun.terkunci)} nomor terkunci karena salah PIN`, '/sistem.html#k-akun']);
  const t = (k.tugas || []).filter((x) => x.perlu).length;
  if (t) h.push(['cek', `${a(t)} tugas keamanan belum dikerjakan`, '/sistem.html#k-tugas']);
  return h;
}

// Konfirmasi serasi dengan tampilan aplikasi (pengganti confirm() bawaan browser).
// Teks: pertanyaan, baris kosong, lalu keterangan. Hasil: Promise<boolean> (true = setuju).
function yakin(teks, ya = 'Ya, lanjutkan') {
  return new Promise((selesai) => {
    const [judul, ...ket] = String(teks).split('\n\n');
    const d = document.createElement('dialog');
    d.className = 'tanya';
    d.setAttribute('aria-labelledby', 'tanya-judul');
    d.innerHTML = '<h2 id="tanya-judul" class="tanya-judul"></h2><p class="tanya-ket"></p>' +
      '<div class="tanya-aksi"><button type="button" class="btn btn-kedua btn-pas" value="0">Tidak jadi</button>' +
      '<button type="button" class="btn btn-utama btn-pas" value="1"></button></div>';
    d.querySelector('.tanya-judul').textContent = judul;
    const k = d.querySelector('.tanya-ket');
    if (ket.length) k.textContent = ket.join('\n\n'); else k.remove();
    d.querySelector('[value="1"]').textContent = ya;
    d.querySelectorAll('button').forEach((b) => { b.onclick = () => d.close(b.value); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close('0'); }); // ketuk di luar = tidak jadi
    d.addEventListener('close', () => { selesai(d.returnValue === '1'); d.remove(); }); // Esc = tidak jadi
    document.body.append(d);
    d.showModal();
    d.querySelector('[value="1"]').focus();
  });
}

// Foto berita hilang/gagal dimuat: sembunyikan, jangan tampil kotak kosong (pratinjau unggahan tidak termasuk).
document.addEventListener('error', (e) => {
  const g = e.target;
  if (!(g instanceof HTMLImageElement) || g.id === 'foto-pratinjau' || !g.matches('.berita-kecil, .berita-foto')) return;
  const kartu = g.closest('.berita-kartu');
  if (kartu) { kartu.classList.add('tanpa-foto'); g.remove(); } else g.hidden = true;
}, true);

// ===== Notifikasi ke HP (Tahap 16, Web Push) =====
// Kunci publik VAPID (boleh di kode; pasangan rahasianya hanya di Supabase Secrets, dipasang Kang 2026-11-28).
const VAPID_PUBLIK = 'BNQ34-ZnTm3-IYHJJ2_Lzliu4OQbpvyJ0NSlfDTh6-gXfq4pM9D-6GNYmIplKX8dADUrko_u7HkgJy6Dq0bmnCI';
const b64keU8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const u8keB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const diIphone = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const terpasangDiLayar = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Status di perangkat ini: 'aktif' | 'belum' | 'diblokir' | 'pasang-dulu' (iPhone: pasang di layar utama dulu) | 'tidak-didukung'
async function statusNotif() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return diIphone() && !terpasangDiLayar() ? 'pasang-dulu' : 'tidak-didukung';
  if (Notification.permission === 'denied') return 'diblokir';
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'aktif' : 'belum';
}
// Panggil LANGSUNG dari ketukan tombol (iPhone mewajibkan izin diminta dari ketukan).
async function aktifkanNotif() {
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') throw new Error(izin === 'denied' ? 'notif-diblokir' : 'notif-batal');
  await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && u8keB64(sub.options.applicationServerKey) !== VAPID_PUBLIK) { await sub.unsubscribe(); sub = null; } // kunci diganti
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64keU8(VAPID_PUBLIK) });
  await simpanLangganan(sub);
}
const simpanLangganan = (sub) => dbKirim('POST', 'rpc/simpan_langganan',
  { p_endpoint: sub.endpoint, p_p256dh: u8keB64(sub.getKey('p256dh')), p_auth: u8keB64(sub.getKey('auth')) }, 'return=minimal');
// Perangkat sudah aktif: perbarui di server tanpa bertanya (mis. akun lain pernah masuk di HP ini).
async function segarkanNotif() {
  if (await statusNotif() !== 'aktif') return;
  const sub = await (await navigator.serviceWorker.getRegistration()).pushManager.getSubscription();
  await simpanLangganan(sub);
}
async function matikanNotif() {
  if (!('serviceWorker' in navigator)) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await dbKirim('POST', 'rpc/hapus_langganan', { p_endpoint: sub.endpoint }, 'return=minimal').catch(() => {});
  await sub.unsubscribe();
}
const pesanNotifGagal = (e) => ({ 'notif-diblokir': 'Pemberitahuan diblokir. Buka pengaturan situs di browser/HP, izinkan Notifikasi, lalu coba lagi.',
  'notif-batal': 'Belum diizinkan. Tekan Aktifkan lagi lalu pilih Izinkan.' }[e.message]
  || (e.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : 'Pemberitahuan belum bisa diaktifkan. Coba lagi.'));
