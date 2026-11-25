# PROGRES SILSILAH TQN Cukir

## Tahap 1: Data Jamaah, Pendaftaran, KTA, Portal Anggota, Hak Akses
Mulai: 2026-11-25 (Kang Salman: "Bismillah").

## Selesai
- **Langkah 1, Fondasi** (2026-11-25): repo `tqncukir/silsilah`, CLAUDE.md, PROGRES.md, kerangka PWA (logo resmi, warna KTA, bisa dipasang di HP, tetap terbuka saat sinyal putus), header keamanan.

## Sedang dikerjakan
- Langkah 1: memasang di Cloudflare Pages, lalu menunggu Kang mengecek di HP.

## Berikutnya (satu per satu, tunggu persetujuan Kang)
2. **Database Jamaah dan Hak Akses**: tabel jamaah, wilayah (desa, kecamatan, kab/kota), peran pengguna; RLS; ±50 data contoh.
3. **Login**: admin pusat (email jtccukir2022) dan anggota (Nomor Anggota + nama desa + PIN 6 angka), Turnstile, batas percobaan PIN.
4. **Data Jamaah**: halaman pengurus untuk cari, lihat, tambah, ubah, ubah status Aktif/Wafat; filter desa dan kecamatan; pagination.
5. **Pendaftaran**: formulir jamaah baru dengan scan KTP untuk isi otomatis; foto KTP dan NIK langsung dibuang.
6. **KTA Digital**: tampilan seperti kartu asli, QR baru aman (kunci di admin pusat), PIN 6 angka, bisa dicetak, halaman publik "Cek Keaslian KTA"; KTA lama tetap berlaku.
7. **Portal Anggota**: jamaah login lalu melihat KTA dan datanya sendiri.

Setelah 7 langkah beres dan Kang setuju: impor 5.528 data asli.

## Catatan
- Alamat uji coba: (diisi setelah Cloudflare Pages terpasang)
