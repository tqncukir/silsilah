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
  nav('nav-kegiatan', p && PERAN_LIHAT_KEGIATAN.includes(p.peran));
  nav('nav-ahli', p && PERAN_LIHAT_JAMAAH.includes(p.peran));
  nav('nav-perjalanan', p && PERAN_LIHAT_PERJALANAN.includes(p.peran));
  nav('nav-kas', p && PERAN_LIHAT_KAS.includes(p.peran));
  nav('nav-bantuan', p && PERAN_BANTUAN.includes(p.peran));
  nav('nav-ekonomi', p && PERAN_EKONOMI.includes(p.peran));
  nav('nav-usaha', !!p);
  nav('nav-sakit', p && PERAN_KESEHATAN.includes(p.peran));
  nav('nav-aset', p && PERAN_LIHAT_ASET.includes(p.peran));
  if (p) pasangMenuBawah(p);
  return p || null;
}

// ===== Menu bawah di HP (temuan f1, Kang 2026-11-27): 4 tombol besar, sisanya di "Lainnya" =====
const IKON_MENU = {
  beranda: '<path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10"/>',
  jamaah: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.5a3 3 0 010 5.6M17.5 14.3c1.7.6 2.7 2.2 3 4.7"/>',
  kegiatan: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  kta: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.5 1.6-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13.5h4"/>',
  lainnya: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
};
function pasangMenuBawah(p) {
  if (!document.body.classList.contains('hal-app') || document.getElementById('menu-bawah')) return;
  const anggota = p.peran === 'anggota', jalur = location.pathname;
  const utama = anggota
    ? [['beranda', 'Beranda', '/beranda.html'], ['kta', 'KTA', '/kta.html'], ['kegiatan', 'Agenda', '/agenda.html']]
    : [['beranda', 'Beranda', '/beranda.html'],
      ...(PERAN_LIHAT_JAMAAH.includes(p.peran) ? [['jamaah', 'Jamaah', '/jamaah.html']] : []),
      ...(PERAN_LIHAT_KEGIATAN.includes(p.peran) ? [['kegiatan', 'Kegiatan', '/kegiatan.html']] : [])];
  const lain = anggota
    ? [['Haul', '/haul.html'], ['Ahli Kubur', '/ahli-kubur.html'], ['Usaha Jamaah', '/usaha.html'], ['Cara pasang di HP', '/pasang.html']]
    : [[ 'Dashboard Pengurus', '/dashboard.html', PERAN_LIHAT_JAMAAH ], ['Pendaftaran', '/pendaftaran.html', PERAN_UBAH_JAMAAH ],
      ['Absensi', '/absensi.html', PERAN_ABSEN], ['Ahli Kubur', '/ahli-kubur.html', PERAN_LIHAT_JAMAAH], ['Haul', '/haul.html', PERAN_LIHAT_JAMAAH],
      ['Ziarah & Umroh', '/perjalanan.html', PERAN_LIHAT_PERJALANAN],
      ['Bantuan Sosial', '/bantuan.html', PERAN_BANTUAN],
      ['Ekonomi Jamaah', '/ekonomi.html', PERAN_EKONOMI],
      ['Usaha Jamaah', '/usaha.html', null],
      ['Jamaah Sakit', '/sakit.html', PERAN_KESEHATAN],
      ['Buku Kas', '/kas.html', PERAN_LIHAT_KAS],
      ['Aset & Wakaf', '/aset.html', PERAN_LIHAT_ASET],
      ['Atur PIN Pengurus', '/pengurus-pin.html', ['admin_pusat']], ['Agenda umum', '/agenda.html', null], ['Cara pasang di HP', '/pasang.html', null]]
      .filter(([, , boleh]) => !boleh || boleh.includes(p.peran));
  const aktif = (u) => jalur === u || (u === '/jamaah.html' && jalur.startsWith('/jamaah')) || (u === '/kegiatan.html' && /^\/(kegiatan|absensi)/.test(jalur));
  const diLain = !utama.some(([, , u]) => aktif(u));
  const ikon = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IKON_MENU[k]}</svg>`;
  const nav = document.createElement('nav');
  nav.id = 'menu-bawah'; nav.className = 'menu-bawah'; nav.setAttribute('aria-label', 'Menu');
  nav.innerHTML = utama.map(([k, t, u]) => `<a href="${u}"${aktif(u) ? ' aria-current="page"' : ''}>${ikon(k)}<span>${t}</span></a>`).join('')
    + `<button type="button" id="menu-lain-buka" aria-haspopup="dialog"${diLain ? ' aria-current="page"' : ''}>${ikon('lainnya')}<span>Lainnya</span></button>`;
  const d = document.createElement('dialog');
  d.className = 'menu-lain'; d.setAttribute('aria-label', 'Menu lainnya');
  d.innerHTML = `<div class="menu-lain-kepala"><p>Menu lainnya</p><button type="button" class="btn btn-kedua btn-pas" id="menu-lain-tutup">Tutup</button></div>
    <ul>${lain.map(([t, u]) => `<li><a href="${u}"${jalur === u ? ' aria-current="page"' : ''}>${t}</a></li>`).join('')}
    <li><button type="button" id="menu-lain-keluar">Keluar</button></li></ul>`;
  document.body.append(nav, d);
  document.body.classList.add('ada-menu-bawah');
  // Saat mengetik, keyboard HP bisa mengangkat menu bawah sehingga menutup isian/tombol Simpan: sembunyikan sementara.
  const ketik = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
    || (el.tagName === 'INPUT' && !/^(radio|checkbox|button|submit|reset|range|color|file)$/.test(el.type)));
  // Selama fokus masih di dalam formulir (mis. pindah dari isian ke tombol Simpan/Daftarkan), menu tetap tersembunyi:
  // kalau muncul lagi saat jari menekan tombol, ketukan bisa jatuh ke menu dan tombol tidak tertekan.
  const tetap = (el) => ketik(el) || (document.body.classList.contains('sedang-ketik') && !!el?.closest?.('form'));
  document.addEventListener('focusin', (e) => document.body.classList.toggle('sedang-ketik', tetap(e.target)));
  document.addEventListener('focusout', () => setTimeout(() => document.body.classList.toggle('sedang-ketik', tetap(document.activeElement)), 0));
  document.getElementById('menu-lain-buka').onclick = () => d.showModal();
  document.getElementById('menu-lain-tutup').onclick = () => d.close();
  document.getElementById('menu-lain-keluar').onclick = () => keluar();
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
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
const PERAN_LIHAT_PERJALANAN = ['admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah'];
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
