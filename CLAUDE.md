# SILSILAH TQN Cukir

**SILSILAH** = Sistem Layanan dan Silaturahim Jamaah Thoriqoh Qodiriyah wa Naqsyabandiyah (TQN) Pusat Cukir Jombang.
Pemilik dan pengambil keputusan: **Kang Salman** (admin pusat). Balas dalam Bahasa Indonesia sederhana dan singkat.

## Perintah serah terima
"Lanjutkan proyek Silsilah TQN Cukir" = baca file ini dan `PROGRES.md`, lalu kerjakan **Langkah berikutnya** saja.
Setelah satu bagian selesai: perbarui `PROGRES.md`, commit, laporkan ringkas plus link untuk dicoba di HP.

## Konsep ringkas
Website mobile-first yang juga nyaman dibuka di komputer, laptop, tablet, dan HP (responsif), bisa dipasang di layar HP seperti aplikasi (PWA, tanpa Play Store), dengan notifikasi.
Bagian publik (profil, agenda, laporan infaq, berita, cek keaslian KTA) + area login (pengurus dan anggota).

14 modul, dikelompokkan warna (warna kelompok hanya untuk ikon dan label kecil):
- **Hijau, Pondasi Jamaah**: 1 Data Jamaah, 2 Pendaftaran (scan KTP), 3 KTA, 11 Portal Anggota, 13 Pengguna & Hak Akses
- **Biru, Ruhani & Kegiatan**: 4 Kegiatan & Absensi, 5 Ahli Kubur, 10 Ziarah & Umroh
- **Kuning, Kepedulian & Kesejahteraan**: 6 Bantuan Sosial, 7 Kesehatan, 8 Ekonomi Jamaah
- **Merah, Amanah & Tata Kelola**: 9 Keuangan Yayasan, 12 Dashboard & Laporan, 14 Aset & Wakaf

**Tahap 1** = modul 1, 2, 3, 11, 13 (7 langkah, lihat `PROGRES.md`).

Peran: admin pusat, ketua, bendahara, nadzir, koordinator wilayah, petugas scan, khodim/keluarga & dokter pendamping, anggota.
Anggota login: Nomor Anggota + nama desa + PIN 6 angka (dicetak di KTA). Hak akses ditegakkan lewat RLS, bukan hanya tampilan.
Status jamaah: Aktif/Tidak Aktif + Hidup/Wafat. Jamaah tidak pernah dihapus; wafat masuk Daftar Ahli Kubur.
Nomor Anggota: 1165100001 dst. KTA lama (QR teks biasa) tetap berlaku; KTA baru memakai QR kode acak terenkripsi.

## Aturan main (disetujui Kang Salman 2026-11-25)
1. Kang Salman yang memutuskan: tahap dimulai hanya setelah beliau bilang "mulai", selesai hanya setelah beliau cek dan setujui.
2. Satu tahap, satu waktu.
3. Hanya akun organisasi: Supabase org "TQN Cukir" (project Silsilah, ref `tuthgclhrzvvlcnpjxiv`, Singapura), GitHub `tqncukir`, Cloudflare akun jtccukir2022. Jangan pernah akun pribadi.
4. Uji coba memakai data contoh. Data asli 5.528 jamaah baru dimasukkan setelah Kang setuju dan sistem aman.
5. Privasi mutlak: foto KTP dan NIK tidak disimpan; tidak ada nomor HP dan foto; status ekonomi dan kesehatan rahasia; nominal bisyaroh hanya ketua dan bendahara; amalan dan talqin tidak pernah tampil di website.
6. Kunci QR KTA hanya dipegang admin pusat, bukan Claude. Jangan pernah menaruh kunci/rahasia di repo.
7. Laporan bahasa sederhana: ringkasan + link untuk dicoba di HP setiap satu bagian selesai.
8. Tidak ada biaya tanpa izin Kang. Selama uji coba semua gratis.
9. Perubahan besar (konsep modul, hapus data) ditanyakan dulu.
10. Hemat token: jawaban singkat; kerja per bagian kecil; ubah file yang ada, jangan tulis ulang; jangan baca ulang yang sudah diketahui.
11. Serah terima lewat repo ini (CLAUDE.md + PROGRES.md).
12. Sistem warna resmi dari KTA (lihat di bawah). Huruf minimal 16px, kontras memenuhi standar, tombol besar untuk para sepuh.
13. Ringan, aman, awet: tabel ternormalisasi + indeks; pagination; PWA cache; arsip data lama per tahun; file dikompres; backup bulanan ke luar Supabase; semua perubahan database lewat migrasi di repo; cek Supabase advisors rutin.
14. Kalau perintah kurang jelas atau berisi banyak tugas sekaligus, ingatkan: "Beri perintah yang jelas per tugas, Kang" + contoh.
15. Responsif: SILSILAH dan website harus nyaman di HP, tablet, laptop, dan komputer (uji 360px, 768px, 1280px ke atas).

## Warna resmi (`public/css/tokens.css`, satu sumber untuk semua halaman)
| Nama | Kode | Untuk |
|---|---|---|
| Hijau Jam'iyyah | #0B6B2E | header, menu, tombol utama |
| Hijau Daun | #1E9E3A | tombol kedua, ikon, berhasil |
| Kuning Rosyid | #F2D300 | aksen di atas hijau saja |
| Hijau Pupus | #EEF6DC | latar kartu info |
| Putih | #FFFFFF | latar halaman |
| Hitam | #1A1A1A | teks |

## Teknologi (jangan diganti tanpa izin)
- Frontend: HTML + CSS + JavaScript ringan, PWA (`manifest.webmanifest`, `sw.js`). Tanpa build step. Folder `public/`.
- Hosting: Cloudflare Pages (gratis), terhubung ke repo ini: setiap push ke `main` otomatis tayang. Output directory: `public`, tanpa build command.
- Backend: Supabase (Postgres, Auth, Edge Functions). Semua tabel wajib RLS. Migrasi di `supabase/migrations/`, satu perubahan satu file.
- Keamanan: header keamanan di `public/_headers`; Cloudflare Turnstile untuk login dan form publik; batasi percobaan PIN.

## Struktur
```
public/            halaman web (yang tayang di Cloudflare)
  css/tokens.css   warna resmi
  css/app.css      gaya bersama
  js/app.js        logika bersama
  sw.js            service worker (cache offline)
  icons/           ikon dari logo resmi
supabase/migrations/  file migrasi database
```

## Cara kerja
- Logo resmi: `public/icons/` (dibuat dari logo Jam'iyyah, 9 bintang emas).
- Setiap ganti file yang di-cache, naikkan `VERSI` di `public/sw.js` DAN angka `?v=` pada link CSS/JS di semua HTML (kalau tidak, HP memakai CSS lama).
- Sebelum lapor selesai: coba di lebar layar HP 360px, tablet 768px, dan laptop 1280px, cek Supabase advisors, pastikan tidak ada rahasia di repo.
