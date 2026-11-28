// Kesehatan Sistem (Tahap 18, khusus admin pusat). Hak akses ditegakkan database (public.kesehatan_sistem -> wajib_admin_pusat).
// Semua isi dibuat dari angka rpc; teks dari database (nama pengurus, judul tugas) selalu lewat hurufAman().
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;
const n = (x) => Number(x || 0), a = (x) => n(x).toLocaleString('id-ID');
const IK = {
  backup: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.5A4 4 0 0117 18M12 12v7M9 14l3-3 3 3',
  notif: 'M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0',
  data: 'M9 4h6v3H9zM6 6h12v15H6zM9 12l2 2 4-4',
  akun: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20a6 6 0 0112 0M16 4a3.5 3.5 0 010 7M18 14a5 5 0 013 6',
  kapasitas: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  aman: 'M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z',
  tugas: 'M14 4a4 4 0 00-3.9 5L4 15v3h3l6-6a4 4 0 101-8zM15.5 7.5h.01',
  cek: 'M5 12.5l4.5 4.5L19 7.5', silang: 'M7 7l10 10M17 7L7 17', panah: 'M9 5l7 7-7 7',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', foto: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
  kunci: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z', robot: 'M6 8h12v11H6zM12 4v4M9 13h.01M15 13h.01M9 16h6',
  pagi: 'M12 4v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M17.7 6.3l-1.4 1.4M8 15a4 4 0 118 0M3 19h18',
  sore: 'M12 9v2M5 15H3M21 15h-2M6.3 9.3l1.4 1.4M17.7 9.3l-1.4 1.4M8 18a4 4 0 118 0M3 21h18M12 3v3M10 5l2-2 2 2',
  hp: 'M7 3h10v18H7zM11 18h2', jam: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
};
const ikon = (k, u = 18) => `<svg viewBox="0 0 24 24" width="${u}" height="${u}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${IK[k]}"/></svg>`;
const PANAH = ikon('panah', 16);

// Kepala kartu: ikon + judul + pil keadaan (baik = hijau, perhatian = kuning, bahaya = merah)
function kepala(id, ik, judul, keadaan, teks) {
  return `<div class="ks-kepala"><span class="ks-ikon ks-${keadaan}" aria-hidden="true">${ikon(ik, 22)}<i>${ikon(keadaan === 'baik' ? 'cek' : 'silang', 12)}</i></span>
    <h2 id="j-${id}">${judul}</h2><span class="ks-pil ks-pil-${keadaan}">${teks}</span></div>`;
}
// Satu baris pemeriksaan: ikon kecil, label, nilai (+ centang bila 0/baik), bisa berupa tautan
function baris(ik, label, nilai, { ok = null, url = '' } = {}) {
  const tanda = ok === true ? `<span class="ks-ok" aria-label="baik">${ikon('cek', 16)}</span>` : '';
  const isi = `<span class="ks-bik" aria-hidden="true">${ikon(ik, 16)}</span><span class="ks-label">${label}</span><span class="ks-nilai${ok === false ? ' ks-nilai-kurang' : ''}">${nilai}${tanda}</span>`;
  return `<li>${url ? `<a href="${url}">${isi}</a>` : `<div>${isi}</div>`}</li>`;
}
const waktuRelatif = (iso) => {
  if (!iso) return '–';
  const tgl = new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA }), kini = hariIniWib();
  const kemarin = new Date(Date.parse(kini + 'T12:00:00+07:00') - 864e5).toLocaleDateString('sv-SE', { timeZone: ZONA });
  const hari = tgl === kini ? 'Hari ini' : tgl === kemarin ? 'Kemarin' : tglWib(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${hari}, ${jamWib(iso)} WIB`;
};
const tglPendek = (iso) => tglWib(iso, { day: 'numeric', month: 'short', year: 'numeric' });
const batang = (nilai, batas) => { const p = Math.min(100, batas ? (nilai / batas) * 100 : 0);
  return `<span class="ks-batang${p >= 80 ? ' ks-batang-penuh' : ''}" aria-hidden="true"><span data-p="${p.toFixed(1)}"></span></span>`; };

function tampil(k) {
  const masalah = nilaiKesehatan(k), penting = masalah.filter((m) => m[0] === 'penting');
  $('waktu-periksa').textContent = `Diperiksa ${waktuRelatif(k.waktu)}. Hanya Admin Pusat yang melihat halaman ini.`;
  // Ringkasan atas
  $('ringkas').className = `ks-ringkas ${penting.length ? 'ks-bahaya' : masalah.length ? 'ks-perhatian' : 'ks-baik'}`;
  $('ringkas').innerHTML = `<span class="ks-ringkas-ikon" aria-hidden="true">${ikon(masalah.length ? 'silang' : 'cek', 22)}</span><div>
    <p class="ks-ringkas-judul">${penting.length ? `${a(penting.length)} hal penting perlu ditangani${masalah.length > penting.length ? ` · ${a(masalah.length - penting.length)} hal kecil` : ''}` : masalah.length ? `Sistem sehat · ${a(masalah.length)} hal kecil perlu dicek` : 'Alhamdulillah, sistem sehat'}</p>
    ${masalah.length ? `<ul>${masalah.map(([, t, u]) => `<li><a href="${u}">${hurufAman(t)}</a></li>`).join('')}</ul>` : '<p class="ket">Backup, notifikasi, data, akun, kapasitas, dan keamanan semuanya baik.</p>'}</div>`;

  // 1. Cadangan harian
  const bk = k.backup || {}, t = bk.terakhir;
  const bkMasalah = masalah.find((m) => m[2] === '/backup.html');
  const hari = new Map((bk.hari || []).map((h) => [h.tgl, h.hasil]));
  const lima = [...Array(5)].map((_, i) => new Date(Date.now() - (4 - i) * 864e5).toLocaleDateString('sv-SE', { timeZone: ZONA }));
  $('k-backup').innerHTML = kepala('backup', 'backup', 'Cadangan harian', bkMasalah ? 'bahaya' : 'baik', bkMasalah ? (t && !t.berhasil ? 'Gagal' : 'Telat') : 'Berhasil')
    + `<p class="ks-besar">${t ? waktuRelatif(t.waktu) : 'Belum ada'}</p>
    <p class="ket">Database disalin otomatis ke Google Drive setiap hari jam 01.15 WIB${t?.ukuran_byte ? ` (${ukuranTeks(t.ukuran_byte)})` : ''}. 30 hari terakhir: ${a(bk.berhasil_30)} berhasil, ${a(bk.gagal_30)} gagal.</p>
    <ol class="ks-hari">${lima.map((d) => { const h = hari.get(d) || 'kosong';
      const tg = new Date(d + 'T12:00:00+07:00');
      return `<li class="ks-hari-${h}"><span aria-hidden="true">${h === 'ok' ? ikon('cek', 14) : h === 'gagal' ? ikon('silang', 14) : '–'}</span>${tg.toLocaleDateString('id-ID', { weekday: 'short', timeZone: ZONA })}<b>${tg.toLocaleDateString('id-ID', { day: 'numeric', timeZone: ZONA })}</b><span class="sr-only">: ${h === 'ok' ? 'berhasil' : h === 'gagal' ? 'gagal' : 'tidak ada catatan'}</span></li>`; }).join('')}</ol>
    <a class="ks-tautan" href="/backup.html">Pantau Backup${PANAH}</a>`;

  // 2. Notifikasi HP
  const nf = k.notif || {}, jad = new Map((nf.jadwal || []).map((j) => [j.nama, j]));
  const nfMasalah = masalah.some((m) => m[2] === '/sistem.html#k-notif');
  const jadwal = (nama, ik, label) => { const j = jad.get(nama);
    if (!j) return baris(ik, label, 'belum ada', { ok: false });
    if (!j.aktif) return baris(ik, label, 'tidak aktif', { ok: false });
    if (!j.terakhir) return baris(ik, label, 'belum pernah jalan');
    return baris(ik, `${label}<small>terakhir ${waktuRelatif(j.terakhir)}</small>`, j.status === 'succeeded' ? 'jalan' : 'gagal', { ok: j.status === 'succeeded' ? true : false }); };
  $('k-notif').innerHTML = kepala('notif', 'notif', 'Notifikasi HP', nfMasalah ? 'bahaya' : 'baik', nfMasalah ? 'Bermasalah' : 'Jalan')
    + `<ul class="ks-daftar">${jadwal('notif-pagi', 'pagi', 'Kiriman pagi (06.00)')}${jadwal('notif-sore', 'sore', 'Kiriman sore (16.00)')}
      ${baris('hp', `HP menerima notifikasi<small>${a(nf.hp_pengurus)} milik pengurus</small>`, a(nf.hp))}
      ${baris('jam', 'Terkirim 24 jam terakhir', `${a(nf.terkirim_24j)} kali`)}
      ${baris('silang', 'HP tidak aktif lebih dari 30 hari', a(nf.hp_lama), { ok: !n(nf.hp_lama) })}
      ${baris('aman', `Pemeriksaan otomatis (06.30 & 16.30)<small>${k.cek ? `terakhir ${waktuRelatif(k.cek.waktu)}` : 'belum pernah jalan'}</small>`,
        k.cek ? (k.cek.masalah?.length ? `${a(k.cek.masalah.length)} masalah` : '') : '', { ok: k.cek ? !k.cek.masalah?.length : null })}</ul>
    ${k.cek?.masalah?.length ? `<p class="ket ks-catatan ks-cek-masalah">${k.cek.masalah.map(hurufAman).join(' · ')}</p>` : ''}
    <p class="ket ks-catatan">Bila ada masalah, Admin Pusat mendapat notifikasi "Sistem perlu dicek". HP tidak aktif dibersihkan otomatis saat kiriman berikutnya ditolak.</p>`;

  // 3. Kerapian data jamaah
  const d = k.data || {};
  const kotor = ['catatan_terbuka', 'umur_kosong', 'wafat_aktif', 'koordinator_tanpa_wilayah', 'jk_kosong'].filter((x) => n(d[x])).length;
  const rapi = (ik, label, x, url) => baris(ik, label, a(d[x]), { ok: !n(d[x]), url: n(d[x]) ? url : '' });
  $('k-data').innerHTML = kepala('data', 'data', 'Kerapian data jamaah', kotor ? 'perhatian' : 'baik', kotor ? `${kotor} perlu dicek` : 'Bersih')
    + `<ul class="ks-daftar">${rapi('data', 'Catatan pengecekan data belum selesai', 'catatan_terbuka', '/dashboard.html#p-catatan')}
      ${rapi('jam', 'Umur kosong atau tidak wajar', 'umur_kosong', '/dashboard.html')}
      ${rapi('silang', 'Wafat tapi masih berstatus aktif', 'wafat_aktif', '/jamaah.html?status=wafat')}
      ${rapi('akun', 'Koordinator tanpa wilayah tugas', 'koordinator_tanpa_wilayah', '/pengurus-pin.html')}
      ${rapi('akun', 'Jenis kelamin kosong', 'jk_kosong', '/lengkapi-jk.html')}</ul>
    <p class="ket ks-catatan">Bila ada angka selain 0, barisnya bisa diketuk untuk membuka data yang perlu diperbaiki.</p>`;

  // 4. Akun & login
  const ak = k.akun || {}, lama = ak.pengurus_lama || [];
  const akPerhatian = n(ak.terkunci) || lama.length;
  $('k-akun').innerHTML = kepala('akun', 'akun', 'Akun & login', akPerhatian ? 'perhatian' : 'baik', akPerhatian ? 'Perlu dilihat' : 'Wajar')
    + `<p class="ks-besar">${a(ak.pengurus_aktif)} pengurus aktif</p>
    <div class="ks-pakai"><p><strong>${a(ak.anggota_ber_pin)}</strong> dari ${a(ak.jamaah_aktif)} jamaah aktif sudah punya PIN anggota</p>${batang(n(ak.anggota_ber_pin), n(ak.jamaah_aktif))}</div>
    <ul class="ks-daftar">${baris('akun', 'Anggota pernah masuk aplikasi', a(ak.anggota_pernah_masuk))}
      ${baris('jam', 'Akun masuk 7 hari terakhir', `${a(ak.masuk_7_hari)} akun`)}
      ${baris('kunci', `Nomor terkunci karena salah PIN<small>terbuka sendiri setelah 15 menit</small>`, a(ak.terkunci), { ok: !n(ak.terkunci) })}
      ${baris('silang', 'PIN salah 24 jam terakhir', `${a(ak.gagal_24j)} kali`)}
      ${baris('akun', 'Pengurus lebih dari 30 hari tidak masuk', a(lama.length), { ok: !lama.length })}</ul>
    ${lama.length ? `<p class="ket ks-catatan">${lama.slice(0, 8).map((p) => `${hurufAman(p.nama)} (${hurufAman(NAMA_PERAN[p.peran] || p.peran)}${p.terakhir ? `, terakhir ${tglPendek(p.terakhir)}` : ', belum pernah'})`).join(' · ')}${lama.length > 8 ? ` · dan ${a(lama.length - 8)} lainnya` : ''}</p>` : ''}
    <a class="ks-tautan" href="/pengurus-pin.html">Atur PIN Pengurus${PANAH}</a>`;

  // 5. Kapasitas paket gratis
  const kp = k.kapasitas || {}, pDb = n(kp.db_byte) / n(kp.db_batas), pFoto = n(kp.foto_byte) / n(kp.foto_batas);
  const kpKeadaan = Math.max(pDb, pFoto) >= BATAS_PENUH ? 'bahaya' : Math.max(pDb, pFoto) >= 0.5 ? 'perhatian' : 'baik';
  $('k-kapasitas').innerHTML = kepala('kapasitas', 'kapasitas', 'Kapasitas paket gratis', kpKeadaan, kpKeadaan === 'baik' ? 'Lega' : kpKeadaan === 'perhatian' ? 'Separuh' : 'Hampir penuh')
    + `<div class="ks-kuota"><p><span class="ks-bik" aria-hidden="true">${ikon('db', 16)}</span>Database<span><strong>${ukuranTeks(kp.db_byte)}</strong> dari 500 MB</span></p>${batang(n(kp.db_byte), n(kp.db_batas))}</div>
    <div class="ks-kuota"><p><span class="ks-bik" aria-hidden="true">${ikon('foto', 16)}</span>Foto berita (${a(kp.foto_jumlah)} file)<span><strong>${ukuranTeks(kp.foto_byte)}</strong> dari 1 GB</span></p>${batang(n(kp.foto_byte), n(kp.foto_batas))}</div>
    <div class="ks-kotak"><p><strong>Lalu lintas data & panggilan fungsi</strong></p><p class="ket">Hanya terbaca di dasbor Supabase (batas paket gratis 5 GB/bulan dan 500 ribu panggilan fungsi/bulan). Cukup dicek sebulan sekali.</p>
      <a class="ks-tautan" href="https://supabase.com/dashboard/project/tuthgclhrzvvlcnpjxiv/usage" target="_blank" rel="noopener">Buka halaman Usage di Supabase${PANAH}</a></div>`;

  // 6. Keamanan
  const am = k.keamanan || {}, rls = am.tabel_tanpa_rls || [], tamu = am.fungsi_tamu || [];
  const adv = (k.tugas || []).find((x) => x.kode === 'advisors');
  const amMasalah = rls.length || tamu.length;
  $('k-aman').innerHTML = kepala('aman', 'aman', 'Keamanan', amMasalah ? 'bahaya' : 'baik', amMasalah ? 'Perlu ditangani' : 'Aman')
    + `<ul class="ks-daftar">${baris('kunci', rls.length ? `Tabel belum dijaga aturan akses<small>${rls.map(hurufAman).join(', ')}</small>` : `Semua ${a(am.tabel)} tabel dijaga aturan akses (RLS)`, rls.length ? a(rls.length) : '', { ok: !rls.length ? true : false })}
      ${baris('aman', tamu.length ? `Fungsi terbuka untuk tamu<small>${tamu.map(hurufAman).join(', ')}</small>` : `Fungsi untuk tamu hanya ${a(am.fungsi_publik)} yang memang publik (agenda & berita)`, tamu.length ? a(tamu.length) : '', { ok: !tamu.length ? true : false })}
      ${baris('robot', 'Pemeriksaan anti-robot di halaman masuk', '', { ok: true })}
      ${baris('jam', `Advisors Supabase terakhir dicek<small>${adv?.selesai_pada ? tglPendek(adv.selesai_pada) : 'belum ditandai'}</small>`, adv?.perlu ? 'perlu dicek' : '', { ok: adv && !adv.perlu ? true : adv?.perlu ? false : null })}</ul>
    <p class="ket ks-catatan">Kunci rahasia (KTA, Turnstile, notifikasi) tidak pernah tersimpan di aplikasi ini dan hanya dipegang Admin Pusat.</p>`;

  // 7. Tugas keamanan berkala
  const tugas = k.tugas || [], belum = tugas.filter((x) => x.perlu).length;
  const BERKALA = { sekali: 'Sekali', bulanan: 'Tiap bulan', tahunan: 'Tiap tahun' };
  $('k-tugas').innerHTML = kepala('tugas', 'tugas', 'Tugas keamanan', belum ? 'perhatian' : 'baik', belum ? `${a(belum)} belum dikerjakan` : 'Semua beres')
    + `<p class="ket">Aplikasi tidak bisa memeriksa ini sendiri. Kang menandai setelah mengerjakannya, dan tanggalnya tercatat.</p>
    <ul class="ks-tugas">${tugas.map((x) => `<li${x.perlu ? ' class="ks-tugas-perlu"' : ''}><div><p>${hurufAman(x.judul)}</p>
      <p class="ket">${BERKALA[x.berkala] || ''} · ${x.selesai_pada ? `${x.perlu ? 'jatuh tempo, terakhir' : 'selesai'} ${tglPendek(x.selesai_pada)}` : '<strong>Belum pernah</strong>'}</p></div>
      ${x.perlu || x.berkala !== 'sekali' ? `<button type="button" class="pin-tombol ks-tandai" data-kode="${hurufAman(x.kode)}">${ikon('cek', 16)}Tandai selesai</button>` : `<span class="ks-ok">${ikon('cek', 16)}</span>`}</li>`).join('')}</ul>`;

  for (const el of document.querySelectorAll('.ks-batang span[data-p]')) el.style.width = `${Math.max(el.dataset.p, n(el.dataset.p) ? 1.5 : 0)}%`;
}

async function muat() {
  const t = $('periksa'); t.disabled = true; t.querySelector('.teks').textContent = 'Memeriksa...';
  $('pesan').textContent = '';
  try {
    tampil(await dbKirim('POST', 'rpc/kesehatan_sistem', {}));
    $('isi').hidden = false;
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    $('pesan').textContent = e?.message === 'Failed to fetch' ? 'Sinyal terputus. Coba Periksa ulang.' : 'Keadaan sistem belum bisa dimuat. Coba Periksa ulang.';
  } finally { t.disabled = false; t.querySelector('.teks').textContent = 'Periksa ulang'; }
}

$('periksa').onclick = () => { muat(); muatAktivitas(); };

// ===== Aktivitas pengurus (Tahap 18 Langkah 3) =====
let periode = 'hari', daftarPengurus = null;
const LABEL_HAL = { '/beranda': 'Beranda', '/jamaah': 'Data Jamaah', '/jamaah-isi': 'Rincian jamaah', '/pendaftaran': 'Pendaftaran', '/dashboard': 'Dashboard',
  '/kegiatan': 'Kegiatan', '/kegiatan-isi': 'Rincian kegiatan', '/absensi': 'Absensi', '/kta': 'KTA', '/pengurus-pin': 'Atur PIN', '/backup': 'Pantau Backup',
  '/sistem': 'Kesehatan Sistem', '/kas': 'Buku Kas', '/kas-laporan': 'Laporan Kas', '/bantuan': 'Bantuan Sosial', '/berita-kelola': 'Kelola Berita',
  '/berita-isi': 'Tulis berita', '/perjalanan': 'Ziarah & Umroh', '/ahli-kubur': 'Ahli Kubur', '/haul': 'Haul', '/aset': 'Aset & Wakaf', '/sakit': 'Jamaah Sakit',
  '/ekonomi': 'Ekonomi', '/usaha': 'Usaha', '/notif': 'Notifikasi', '/agenda': 'Agenda', '/kebutuhan': 'Kebutuhan Khusus', '/lengkapi-jk': 'Lengkapi jenis kelamin' };
const labelHal = (h) => LABEL_HAL[h] || (h || '').replace(/^\//, '').replace(/-/g, ' ') || 'Halaman lain';
const AKSI = { delete: 'Menghapus data', batal_hadir: 'Membatalkan kehadiran', atur_pin: 'Memasang PIN pengurus', nonaktifkan_pin: 'Menonaktifkan PIN pengurus',
  atur_wilayah: 'Mengubah wilayah koordinator', ganti_kartu: 'Mengganti QR KTA' };
const awalHariWib = (geser = 0) => new Date(Date.parse(hariIniWib() + 'T00:00:00+07:00') - geser * 864e5);
function rentangAktivitas() {
  const besok = new Date(Date.parse(hariIniWib() + 'T00:00:00+07:00') + 864e5);
  if (periode === 'kemarin') return [awalHariWib(1), awalHariWib(0)];
  if (periode === '7') return [awalHariWib(6), besok];
  if (periode === '30') return [awalHariWib(29), besok];
  return [awalHariWib(0), besok];
}
const lamaTeks = (m) => !m ? '–' : m < 60 ? `± ${m} menit` : `± ${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} menit` : ''}`;
const jamAtauTgl = (iso) => (periode === 'hari' || periode === 'kemarin') ? jamWib(iso) : `${tglWib(iso, { day: 'numeric', month: 'short' })} ${jamWib(iso)}`;

async function muatAktivitas() {
  const [dari, sampai] = rentangAktivitas();
  $('ak-isi').innerHTML = '<p class="ket">Memuat...</p>';
  try {
    const r = await dbKirim('POST', 'rpc/aktivitas_pengurus', { p_dari: dari.toISOString(), p_sampai: sampai.toISOString(), p_user: $('ak-akun').value || null });
    if (!daftarPengurus) {
      daftarPengurus = r.pengurus || [];
      $('ak-akun').innerHTML = '<option value="">Semua pengurus</option>' + daftarPengurus.map((p) => `<option value="${hurufAman(p.user_id)}">${hurufAman(p.nama)} · ${hurufAman(NAMA_PERAN[p.peran] || p.peran)}</option>`).join('');
    }
    const penting = r.penting || [], akun = r.akun || [];
    $('ak-isi').innerHTML = (penting.length ? `<div class="ks-penting"><span aria-hidden="true">!</span><div><p><strong>Perubahan penting pada periode ini: ${a(penting.length)}</strong></p>
        <ul>${penting.map((x) => `<li>${tglWib(x.waktu, { day: 'numeric', month: 'short' })} ${jamWib(x.waktu)}, ${hurufAman(x.nama)}: ${hurufAman(AKSI[x.aksi] || x.aksi)}</li>`).join('')}</ul></div></div>` : '')
      + (akun.length ? `<ul class="ks-akun">${akun.map((x) => { const kini = Date.now() - new Date(x.terakhir).getTime() < 10 * 60e3;
        return `<li><div class="ks-akun-nama"><strong>${hurufAman(x.nama)}</strong><span class="${kini ? 'ks-kini' : ''}">${hurufAman(NAMA_PERAN[x.peran] || x.peran)}${kini ? ', sedang memakai' : ''}</span></div>
          <dl><div><dt>Masuk</dt><dd>${a(x.masuk)} kali</dd></div><div><dt>Pertama aktif</dt><dd>${jamAtauTgl(x.pertama)}</dd></div>
          <div><dt>Terakhir aktif</dt><dd>${jamAtauTgl(x.terakhir)}</dd></div><div><dt>Lama memakai</dt><dd>${lamaTeks(n(x.menit))}</dd></div>
          <div><dt>Data</dt><dd><span class="ks-tambah" title="ditambah">+${a(x.tambah)}</span> <span class="ks-ubah" title="diubah">~${a(x.ubah)}</span></dd></div></dl>
          ${x.halaman?.length ? `<p class="ket ks-menu">Sering dibuka: ${x.halaman.map((h) => `${hurufAman(labelHal(h.h))} (${a(h.n)})`).join(' · ')}</p>` : ''}</li>`; }).join('')}</ul>`
        : '<p class="ket ks-kosong-ak">Belum ada aktivitas pengurus pada periode ini.</p>')
      + (n(r.tidak_aktif) && !$('ak-akun').value ? `<p class="ket">${a(r.tidak_aktif)} pengurus aktif tidak memakai SILSILAH pada periode ini.</p>` : '');
  } catch {
    $('ak-isi').innerHTML = '<p class="ket">Aktivitas belum bisa dimuat. Tekan Periksa ulang.</p>';
  }
}
$('k-aktivitas').addEventListener('click', (e) => {
  const c = e.target.closest('.ks-chip');
  if (!c) return;
  periode = c.dataset.p;
  for (const b of document.querySelectorAll('.ks-chip')) b.setAttribute('aria-pressed', String(b === c));
  muatAktivitas();
});
$('ak-akun').addEventListener('change', muatAktivitas);
$('k-tugas').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kode]');
  if (!b) return;
  const judul = b.closest('li').querySelector('p').textContent;
  if (!await yakin(`Tandai sudah dikerjakan?\n\n"${judul}". Tanggal hari ini akan tercatat.`, 'Ya, sudah')) return;
  b.disabled = true;
  try { await dbKirim('POST', 'rpc/tandai_tugas', { p_kode: b.dataset.kode }); await muat(); }
  catch { b.disabled = false; $('pesan').textContent = 'Gagal menyimpan. Periksa sinyal lalu coba lagi.'; }
});

(async () => {
  sesiDariTautan();
  try {
    const p = await profilSaya();
    if (!p || p.peran !== 'admin_pusat') { location.replace('/beranda.html'); return; }
    await muat();
    muatAktivitas();
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    $('pesan').textContent = 'Halaman belum bisa dimuat. Coba muat ulang.';
  }
})();
