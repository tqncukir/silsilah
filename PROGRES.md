# PROGRES SILSILAH TQN Cukir

## Tahap 1: Data Jamaah, Pendaftaran, KTA, Portal Anggota, Hak Akses
Mulai: 2026-11-25 (Kang Salman: "Bismillah").

## Selesai
- **Langkah 1, Fondasi** (2026-11-25): repo `tqncukir/silsilah`, CLAUDE.md, PROGRES.md, kerangka PWA (logo resmi, warna KTA, bisa dipasang di HP, tetap terbuka saat sinyal putus), header keamanan. Tayang di Cloudflare Pages (project `silsilah-tqn`, akun jtccukir2022), otomatis tayang setiap push ke `main`.

- **Langkah 2, Database Jamaah dan Hak Akses** (2026-11-25): tabel `kabupaten`, `kecamatan`, `desa`, `mursyid`, `jamaah`, `pengguna` (peran), `pengguna_wilayah` (wilayah koordinator), `log_perubahan` (jejak audit otomatis). RLS diuji: admin/ketua semua; bendahara & petugas scan baca saja; koordinator hanya kecamatannya; anggota hanya dirinya; tanpa peran/tamu tidak melihat apa pun; jamaah tidak bisa dihapus. 50 data contoh (`supabase/seed_contoh.sql`). Supabase advisors keamanan: bersih.

- **Langkah 3, Login** (2026-11-25, diuji Kang: anggota & admin berhasil):
  - Halaman `masuk.html` (tab Anggota & Pengurus) dan `beranda.html`; `js/supa.js` (sesi tanpa library besar).
  - Anggota: Edge Function `login-anggota` (Turnstile + `cek_login_anggota`; 5x salah per nomor / 20x per IP dalam 15 menit = terkunci). Akun auth anggota dibuat otomatis `<nomor>@anggota.silsilah.invalid`, tanpa email asli. JWT verify OFF (fungsi cek sendiri).
  - PIN disimpan hash bcrypt di `private.jamaah_pin`. Data contoh: 9990000021 / Cukir / PIN 271145 (yang lain acak).
  - Pengurus: tautan email (magic link). Email jtccukir2022@gmail.com otomatis jadi admin_pusat (trigger `private.pengguna_baru`).
  - Turnstile widget "SILSILAH login" (akun Cloudflare jtccukir2022), rahasia di Supabase secret `TURNSTILE_SECRET`.
  - Supabase Auth: Site URL https://silsilah-tqn.pages.dev, redirect https://silsilah-tqn.pages.dev/**.
  - Pendaftaran akun baru di Supabase Auth DIMATIKAN; pengurus baru dibuat admin (Langkah 4/13).

- **Langkah 3b, PIN Pengurus** (2026-11-25, pilihan Kang, diuji Kang: login pengurus berhasil): satu formulir untuk semua. PIN KTA 6 angka = akun anggota; PIN Pengurus 8 angka (rahasia, tidak dicetak) = akun pengurus terpisah `<nomor>@pengurus.silsilah.invalid` dengan peran dari `private.pengurus_pin`. Fungsi `public.cek_login` (ganti `cek_login_anggota`, yang lama tidak dipakai lagi, hapus nanti). Pasang PIN: `select private.set_pin_pengurus(jamaah_id, 'ketua', '12345678')`. Data contoh: 9990000026 / Cukir = ketua. Email admin tetap sebagai cadangan (lipatan "Masuk admin lewat email").
  - Tampilan Masuk dirapikan (skill UI UX Pro Max): kepala hijau + logo, kartu putih, tombol Lihat PIN, pesan galat jelas, bantuan lupa PIN.

## Sedang dikerjakan
- Langkah 3/3b menunggu persetujuan Kang. Langkah 4 dimulai setelah Kang setuju.

## Berikutnya (satu per satu, tunggu persetujuan Kang)
4. **Data Jamaah**: halaman pengurus untuk cari, lihat, tambah, ubah, ubah status Aktif/Wafat; filter desa dan kecamatan; pagination.
5. **Pendaftaran**: formulir jamaah baru dengan scan KTP untuk isi otomatis; foto KTP dan NIK langsung dibuang.
6. **KTA Digital**: tampilan seperti kartu asli, QR baru aman (kunci di admin pusat), PIN 6 angka, bisa dicetak, halaman publik "Cek Keaslian KTA"; KTA lama tetap berlaku.
7. **Portal Anggota**: jamaah login lalu melihat KTA dan datanya sendiri.

Setelah 7 langkah beres dan Kang setuju: impor 5.528 data asli.

## Catatan
- Alamat uji coba: https://silsilah-tqn.pages.dev
- GitHub App Claude dan Cloudflare Pages hanya diberi akses ke repo `silsilah`.
- Data contoh: nomor anggota 9990000001-9990000050 (hapus sebelum impor data asli).
- Migrasi 20261125010300 dijalankan Kang lewat SQL Editor (perintah DROP butuh persetujuan), lalu dicatat manual di schema_migrations.
- Belum ada PIN di database: PIN anggota (disimpan sebagai hash, bukan angka asli) dibuat di Langkah 3/6.
- Alat Supabase yang meminta izin (apply_migration, DELETE/DROP, secret) tidak muncul di aplikasi Kang. Pakai SQL Editor di Chrome Kang (Kang klik Run) dan dashboard.
