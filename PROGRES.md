# PROGRES SILSILAH TQN Cukir

## Tahap 1: Data Jamaah, Pendaftaran, KTA, Portal Anggota, Hak Akses
Mulai: 2026-11-25 (Kang Salman: "Bismillah").

## Selesai
- **Langkah 1, Fondasi** (2026-11-25): repo `tqncukir/silsilah`, CLAUDE.md, PROGRES.md, kerangka PWA (logo resmi, warna KTA, bisa dipasang di HP, tetap terbuka saat sinyal putus), header keamanan. Tayang di Cloudflare Pages (project `silsilah-tqn`, akun jtccukir2022), otomatis tayang setiap push ke `main`.

- **Langkah 2, Database Jamaah dan Hak Akses** (2026-11-25): tabel `kabupaten`, `kecamatan`, `desa`, `mursyid`, `jamaah`, `pengguna` (peran), `pengguna_wilayah` (wilayah koordinator), `log_perubahan` (jejak audit otomatis). RLS diuji: admin/ketua semua; bendahara & petugas scan baca saja; koordinator hanya kecamatannya; anggota hanya dirinya; tanpa peran/tamu tidak melihat apa pun; jamaah tidak bisa dihapus. 50 data contoh (`supabase/seed_contoh.sql`). Supabase advisors keamanan: bersih.

## Sedang dikerjakan
- Langkah 2 menunggu Kang cek. Langkah 3 dimulai setelah Kang setuju.

## Berikutnya (satu per satu, tunggu persetujuan Kang)
3. **Login**: admin pusat (email jtccukir2022; buat baris `pengguna` peran admin_pusat) dan anggota (Nomor Anggota + nama desa + PIN 6 angka), Turnstile, batas percobaan PIN.
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
