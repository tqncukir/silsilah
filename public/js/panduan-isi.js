// Isi menu "Panduan Peran" (Tahap 19). Teks statis milik SILSILAH (bukan data database), sama dengan dokumen
// "Panduan SILSILAH TQN Cukir". Gambar layar memakai data contoh, disimpan di /img/panduan/*.webp (560 px, dimuat saat dibuka).
// BAGIAN_PERAN menentukan bagian yang tampil untuk tiap peran: panduan perannya sendiri + fitur yang memang bisa ia buka.
const UKURAN_GAMBAR = {'a-beranda': 1428, 'a-kta': 1224, 'a-masuk-pin': 1468, 'a-masuk': 1211, 'a-notif': 1635, 'a-pasang': 1981, 'a-saya': 1737, 'b-beranda': 1048, 'b-kas-isi': 1430, 'b-kas-laporan': 1837, 'b-kas': 1615, 'd-beranda': 1141, 'd-sakit-isi': 1471, 'd-sakit': 1615, 'f-ahli': 1349, 'f-bantuan-ajukan': 1471, 'f-cek-kta': 1019, 'f-ekonomi': 1565, 'f-haul': 1321, 'f-kegiatan-isi': 2196, 'f-perjalanan-isi': 2153, 'f-usaha': 1306, 'h-beranda': 1148, 'h-kebutuhan': 1234, 'h-perjalanan': 1005, 'k-beranda': 1120, 'k-berita-isi': 1651, 'k-jamaah-isi': 1407, 'k-jamaah': 1435, 'k-kegiatan': 1474, 'k-kta': 1283, 'k-pendaftaran-manual': 1076, 'k-pendaftaran': 1211, 'n-aset-isi': 1543, 'n-aset': 1615, 'n-beranda': 1148, 'p-backup': 1292, 'p-beranda': 1227, 'p-pin': 1723, 'p-sistem': 1974, 'poster': 842, 's-absensi-pilih': 1211, 's-absensi': 1262, 's-beranda': 1048, 't-bantuan': 1306, 't-beranda': 1392, 't-berita-kelola': 933, 't-berita-putus': 1076, 't-kta': 1019};
const pg = (n, alt) => `<figure class="pd-gambar"><img src="/img/panduan/${n}.webp" alt="${alt}" width="560" height="${UKURAN_GAMBAR[n]}" loading="lazy" decoding="async"><figcaption>Gambar: ${alt} (data contoh)</figcaption></figure>`;
const pol = (a, mulai) => `<ol${mulai ? ` start="${mulai}"` : ''}>${a.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const pul = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const ptab = (kepala, baris) => `<div class="pd-tabel-bungkus"><table class="pd-tabel"><thead><tr>${kepala.map((k) => `<th scope="col">${k}</th>`).join('')}</tr></thead><tbody>${baris.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const ke = (id, teks) => `<a href="#${id}" class="pd-ke" data-ke="${id}">${teks}</a>`;

const BAGIAN = {
  pasang: { judul: 'Memasang SILSILAH di HP', sub: 'Sekali pasang, ikon muncul seperti aplikasi', isi: `
<p>Cukup sekali pasang, lalu ikon SILSILAH muncul di layar HP seperti aplikasi lain. Gratis dan selalu versi terbaru.</p>
<h3>HP Android (Google Chrome)</h3>
${pol(['Buka <b>silsilah.tqncukir.id/pasang</b> di Google Chrome.', 'Ketuk <b>titik tiga</b> di pojok kanan atas.', 'Pilih <b>Tambahkan ke layar utama</b> atau <b>Instal aplikasi</b>, lalu ketuk <b>Instal</b>.', 'Ikon SILSILAH muncul di layar HP. Ketuk ikonnya untuk membuka.'])}
<h3>iPhone (Safari)</h3>
${pol(['Buka <b>silsilah.tqncukir.id/pasang</b> di Safari.', 'Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bawah layar.', 'Gulir ke bawah, pilih <b>Tambahkan ke Layar Utama</b>, lalu ketuk <b>Tambah</b>.', 'Ikon SILSILAH muncul di layar HP.'])}
<p><a href="/pasang.html">Buka halaman Cara Pasang</a> untuk langkah bergambar sesuai jenis HP.</p>` },

  'masuk-pengurus': { judul: 'Masuk sebagai pengurus', sub: 'KTA + PIN Pengurus 8 angka', isi: `
${pol(['Buka SILSILAH, ketuk <b>Masuk</b>, lalu <b>Masuk dengan PIN</b>.', 'Ketuk <b>Pindai KTA Pengurus</b> dan pindai QR di KTA Anda. Bisa juga mengetik Nomor Anggota dan nama desa.', 'Isi <b>PIN Pengurus 8 angka</b>, lalu ketuk <b>Masuk</b>.'])}
<p>PIN Pengurus diberikan Admin Pusat, berbeda dengan PIN 6 angka di KTA, dan tidak pernah dicetak. Simpan baik-baik dan jangan dipinjamkan. Setelah masuk, HP Anda diingat.</p>` },

  anggota: { judul: 'Panduan Anggota', sub: 'Masuk, KTA digital, riwayat hadir, agenda', isi: `
<h3>1. Masuk</h3>
<p>Ada dua cara masuk. Cukup sekali, karena setelah itu HP Anda diingat.</p>
<p><b>Cara A: pindai QR di KTA (paling mudah)</b></p>
${pol(['Buka SILSILAH, ketuk <b>Masuk</b>.', 'Ketuk <b>Pindai QR KTA</b>, lalu izinkan kamera.', 'Arahkan kamera ke QR di kartu Anda. Anda langsung masuk, tanpa PIN.'])}
${pg('a-masuk', 'halaman Masuk')}
<p><b>Cara B: Nomor Anggota dan PIN</b></p>
${pol(['Ketuk <b>Masuk dengan PIN</b>.', 'Isi <b>Nomor Anggota</b> (10 angka di KTA) dan <b>Nama Desa</b> Anda.', 'Isi <b>PIN</b> 6 angka yang tercetak di KTA, lalu ketuk <b>Masuk</b>.'])}
<p>Salah PIN 5 kali membuat nomor itu terkunci 15 menit. Tunggu, lalu coba lagi dengan teliti.</p>
${pg('a-masuk-pin', 'masuk dengan Nomor Anggota dan PIN')}
<h3>2. Beranda</h3>
<p>Beranda menampilkan salam, tanggal Masehi dan Hijriah, <b>Kegiatan terdekat</b>, <b>Kartu saya</b>, dan jumlah kehadiran Anda bulan ini.</p>
${pul(['Ketuk <b>Aktifkan</b> pada kotak pemberitahuan agar kabar kegiatan, haul, dan berita masuk ke HP.', 'Menu di bawah layar: <b>Beranda</b>, <b>KTA</b>, <b>Agenda</b>, dan <b>Lainnya</b>.'])}
${pg('a-beranda', 'Beranda anggota')}
<h3>3. KTA digital</h3>
${pol(['Ketuk <b>KTA</b> di menu bawah, atau <b>Tunjukkan KTA</b> pada kegiatan yang sedang berlangsung.', 'Saat absensi, ketuk <b>Perbesar QR untuk dipindai</b> dan tunjukkan ke petugas scan.', 'Ketuk <b>Simpan KTA ke HP</b> untuk menyimpan gambar kartu di galeri. PIN tidak ikut tersimpan.'])}
${pg('a-kta', 'KTA digital')}
<h3>4. Data saya dan riwayat hadir</h3>
<p>Dari Beranda, ketuk <b>Data saya, riwayat hadir &amp; ziarah</b>. Di sini tampil data keanggotaan Anda, 10 kehadiran terakhir, dan rombongan ziarah atau umroh yang dibuka. Untuk ikut ziarah, hubungi pengurus atau koordinator wilayah.</p>
<p>Kalau ada data yang keliru, hubungi koordinator wilayah Anda. Anggota tidak bisa mengubah data sendiri, supaya data tetap rapi.</p>
${pg('a-saya', 'halaman Data Saya')}
<h3>5. Agenda dan berita</h3>
${pul(['<b>Agenda</b> di menu bawah berisi kegiatan yang akan datang: tanggal, jam WIB, dan tempat.', '<b>Berita</b> dari pengurus tampil di Beranda. Berita khusus anggota hanya bisa dibaca setelah masuk.'])}
<h3>6. Keluar</h3>
<p>Ketuk <b>Keluar</b> di pojok kanan atas bila HP dipakai bersama orang lain. Di HP pribadi tidak perlu keluar.</p>` },

  ketua: { judul: 'Panduan Ketua', sub: 'Menyetujui berita, memutuskan bantuan, KTA hilang', isi: `
<p>Ketua memegang keputusan dan melihat jamaah di <b>semua kecamatan</b>.</p>
<h3>1. Beranda: Perlu ditindaklanjuti</h3>
<p>Kotak kuning <b>Perlu ditindaklanjuti</b> berisi pekerjaan yang menunggu Ketua: berita yang menunggu persetujuan, bantuan yang belum diputuskan, jamaah sakit yang belum dijenguk 7 hari, dan peserta ziarah yang belum lunas. Ketuk barisnya untuk langsung membuka daftarnya. Sebaiknya Beranda dibuka setiap hari.</p>
${pg('t-beranda', 'Beranda Ketua')}
<h3>2. Menyetujui berita</h3>
${pol(['Ketuk baris <b>berita koordinator menunggu persetujuan</b>, atau buka <b>Kelola Berita</b> dari menu Lainnya. Berita yang menunggu ada di paling atas.'])}
${pg('t-berita-kelola', 'Kelola Berita')}
${pol(['Ketuk beritanya, lalu baca pratinjaunya sampai habis.', 'Bila sudah baik, tekan <b>Setujui &amp; terbitkan</b>.', 'Bila perlu diperbaiki, isi <b>Alasan</b> (wajib), lalu tekan <b>Tolak</b>. Koordinator bisa memperbaiki dan mengajukan lagi.'], 2)}
${pg('t-berita-putus', 'menyetujui atau menolak berita')}
${pul(['Berita yang ditulis Ketua sendiri langsung terbit.', 'Berita terbit yang keliru: buka beritanya, tekan <b>Tarik berita</b>. Berita tidak bisa dihapus, tetapi hilang dari pembaca.'])}
<h3>3. Memutuskan bantuan sosial</h3>
${pol(['Ketuk baris <b>pengajuan bantuan belum diputuskan</b>, atau buka <b>Bantuan Sosial</b>.', 'Ketuk nama penerima untuk melihat rinciannya.', 'Tekan <b>Setujui</b> (nilai boleh diubah dulu), atau <b>Tolak</b> dengan alasan.'])}
<p>Keputusan tidak bisa diubah. Bantuan yang disetujui diserahkan bendahara atau koordinator, lalu ditandai <b>Disalurkan</b>.</p>
${pg('t-bantuan', 'daftar Bantuan Sosial yang menunggu keputusan')}
<h3>4. KTA hilang atau dicuri</h3>
${pol(['Cari jamaahnya di <b>Jamaah</b>, buka rinciannya, lalu tekan <b>Lihat KTA</b>.', 'Tekan <b>KTA hilang: batalkan QR lama</b>, lalu setujui. QR kartu lama langsung tidak berlaku.', 'Cetak kartu baru. Bila perlu PIN baru, tekan <b>Buat PIN baru lalu cetak</b>.'])}
${pg('t-kta', 'halaman KTA dengan tombol batalkan QR lama')}
<h3>5. Pekerjaan lain</h3>
<p>Data jamaah, pendaftaran, PIN anggota, kegiatan: lihat ${ke('koordinator', 'Panduan Koordinator')}. Absensi: ${ke('petugas', 'Panduan Petugas Scan')}. Jamaah sakit dan kebutuhan khusus: ${ke('dokter', 'Panduan Dokter')}. Aset: ${ke('nadzir', 'Panduan Nadzir')}. Buku Kas hanya dilihat Ketua; yang mencatat bendahara dan koordinator.</p>` },

  koordinator: { judul: 'Panduan Koordinator Wilayah', sub: 'Data jamaah, pendaftaran, PIN, berita, kegiatan', isi: `
<p>Koordinator mengurus jamaah di kecamatan yang ditugaskan kepadanya.</p>
<h3>1. Beranda pengurus</h3>
<p>Beranda menampilkan <b>Perlu ditindaklanjuti</b> dan <b>Pintasan</b>: Cari Jamaah, Pendaftaran, Absensi, dan Tulis Berita. Menu lengkap ada di <b>Lainnya</b>.</p>
${pg('k-beranda', 'Beranda koordinator')}
<h3>2. Mencari dan membetulkan data jamaah</h3>
${pol(['Ketuk <b>Jamaah</b> di menu bawah.', 'Ketik nama atau Nomor Anggota. Bisa disaring per desa, mursyid, atau status.', 'Ketuk nama jamaah untuk melihat rinciannya.'])}
${pg('k-jamaah', 'daftar Data Jamaah')}
${pol(['Untuk membetulkan, tekan <b>Ubah</b>, perbaiki isiannya, lalu simpan.', 'Jamaah wafat atau tidak aktif: ubah <b>Status keanggotaan</b>. Data jamaah tidak bisa dihapus.'], 4)}
${pg('k-jamaah-isi', 'rincian jamaah')}
<h3>3. Mendaftarkan jamaah baru</h3>
${pol(['Ketuk <b>Pendaftaran</b>.', 'Ketuk <b>Foto KTP</b>. Letakkan KTP di tempat terang dan tidak silau; kamera memotret sendiri saat kartu diam dan tajam.', 'Data terisi otomatis dari KTP. <b>Periksa setiap isian</b> dan betulkan huruf yang salah baca.', 'Pilih <b>Mursyid</b>, ketuk <b>Periksa data</b>, cek sekali lagi, lalu simpan.'])}
<p>Foto KTP dibaca di HP saja: tidak dikirim, tidak disimpan, dan NIK tidak dicatat. Tanpa KTP, ketuk <b>Isi manual tanpa KTP</b>.</p>
${pg('k-pendaftaran', 'halaman Pendaftaran')}
<p><b>Daftar ulang KTA lama (tanpa QR):</b> isi kolom <b>Nomor di KTA lama</b> dengan 10 angka di kartu lamanya (1165…). Nomor Anggota tetap sama. Kalau nomor sudah dipakai, aplikasi menolak dan memberi tahu.</p>
${pg('k-pendaftaran-manual', 'formulir dengan kolom Nomor di KTA lama')}
<h3>4. Membuat PIN dan mencetak KTA</h3>
${pol(['Buka rincian jamaah, tekan <b>Lihat KTA</b>.', 'Tekan <b>Buat PIN baru lalu cetak</b>, lalu setujui.', 'PIN <b>hanya tampil sekali</b> dan ikut tercetak di kartu. Serahkan kartu langsung kepada anggotanya.', 'Anggota lupa PIN? Buat PIN baru dengan cara yang sama. PIN lama otomatis tidak berlaku.'])}
${pg('k-kta', 'halaman KTA dengan tombol Buat PIN')}
<h3>5. Menulis berita</h3>
${pol(['Ketuk <b>Tulis Berita</b> di Pintasan.', 'Isi <b>Judul</b> dan <b>Isi berita</b>. Jangan menulis nomor HP atau NIK.', 'Bila perlu, tambahkan <b>Foto sampul</b> kegiatan (bukan foto KTP).', 'Pilih <b>Pembaca</b>: Publik atau Khusus anggota.', 'Tekan <b>Ajukan ke ketua</b>. Berita tampil setelah disetujui ketua. Kalau ditolak, Beranda memberi tahu dan alasannya tertulis di berita itu.'])}
${pg('k-berita-isi', 'halaman Tulis berita')}
<h3>6. Membuat kegiatan</h3>
${pol(['Buka <b>Kegiatan</b>, tekan <b>Tambah kegiatan</b>.', 'Isi jenis, nama, tanggal, jam mulai (WIB), tempat, dan wilayah.', 'Pilih <b>Tampil di agenda umum</b> bila boleh dilihat siapa saja. Daftar hadir tetap rahasia.', 'Tekan <b>Simpan</b>. Absensi dibuka dari rincian kegiatan.'])}
${pg('k-kegiatan', 'daftar Kegiatan')}
<h3>7. Buku Kas kecamatan</h3>
<p>Koordinator juga mencatat kas kecamatannya. Caranya sama dengan ${ke('bendahara', 'Panduan Bendahara')}.</p>` },

  petugas: { judul: 'Panduan Petugas Scan', sub: 'Mencatat kehadiran dengan memindai QR KTA', isi: `
<h3>1. Sebelum kegiatan</h3>
${pul(['Pastikan HP terisi baterai dan ada sinyal atau WiFi.', 'Pastikan kegiatan sudah dibuat koordinator atau ketua.', 'Uji kamera sekali: pindai KTA Anda sendiri, lalu batalkan.'])}
<h3>2. Membuka absensi</h3>
${pol(['Di Beranda, ketuk <b>Buka Absensi</b> pada kegiatan yang sedang berlangsung, atau lewat Pintasan <b>Absensi</b>.', 'Bila ada beberapa kegiatan hari ini, pilih yang benar.'])}
${pg('s-beranda', 'Beranda petugas scan')}
${pg('s-absensi-pilih', 'memilih kegiatan hari ini')}
<h3>3. Memindai KTA</h3>
${pol(['Ketuk <b>Pindai KTA jamaah</b>. Kamera <b>tetap menyala</b>, jadi kartu bisa dipindai satu per satu.', 'Arahkan kamera ke QR di kartu fisik atau KTA digital di HP jamaah.', 'Lihat hasilnya: <b>Hadir</b> (hijau) berarti tercatat; <b>Sudah tercatat</b> tidak perlu diulang; tidak terdaftar, tidak aktif, wafat, atau kartu diganti tidak dicatat.', 'Ketuk <b>Tutup</b> bila selesai.'])}
<p><b>Kartu tertinggal?</b> Ketik Nomor Anggota (10 angka), lalu ketuk <b>Catat hadir</b>.</p>
${pg('s-absensi', 'halaman Absensi setelah satu jamaah tercatat')}
<h3>4. Salah catat</h3>
<p>Di daftar <b>Dicatat dari HP ini</b>, ketuk <b>Batal</b> di samping nama yang salah. Angka hadir ikut berkurang.</p>
<h3>5. Kalau ada kendala</h3>
${ptab(['Kendala', 'Yang dilakukan'], [['Kamera tidak menyala', 'Izinkan kamera untuk SILSILAH di pengaturan HP, lalu buka lagi Absensi.'], ['QR tidak terbaca', 'Dekatkan atau jauhkan sedikit, cari tempat terang, atau ketik Nomor Anggota.'], ['Sinyal terputus', 'Muncul "Belum tercatat". Pindai lagi setelah sinyal kembali.'], ['Tidak berhak mencatat', 'Akun belum diberi peran Petugas Scan. Hubungi Admin Pusat.']])}` },

  bendahara: { judul: 'Panduan Bendahara', sub: 'Buku Kas, catat transaksi, laporan tahunan', isi: `
<p>Saldo dihitung otomatis, jadi tidak perlu menghitung sendiri.</p>
${pg('b-beranda', 'Beranda bendahara')}
<h3>1. Buku Kas</h3>
${pol(['Ketuk <b>Buku Kas</b> di Pintasan.', 'Pilih <b>Kas</b>. Di atasnya tampil <b>Saldo</b>, <b>Total masuk</b>, dan <b>Total keluar</b>.', 'Transaksi terbaru di atas. Gunakan kotak cari dan saringan bulan, masuk/keluar, kategori, atau status.'])}
${pg('b-kas', 'Buku Kas')}
<h3>2. Mencatat transaksi</h3>
${pol(['Tekan <b>Catat transaksi</b>.', 'Pilih <b>Uang masuk</b> atau <b>Uang keluar</b>, lalu <b>Kategori</b>.', 'Isi <b>Tanggal</b> dan <b>Jumlah</b> (rupiah bulat).', 'Isi <b>Keterangan</b> singkat dan <b>Nomor bukti/kuitansi</b> bila ada.', 'Tekan <b>Simpan</b>.'])}
<p>Infaq dicatat jumlahnya saja, tanpa nama pemberi. Simpan kuitansi asli dan tulis nomornya di kolom Nomor bukti.</p>
${pg('b-kas-isi', 'formulir Catat transaksi')}
<h3>3. Membetulkan atau membatalkan</h3>
${pul(['Salah ketik: buka transaksinya, tekan <b>Ubah</b>, betulkan, lalu simpan. Jenis masuk/keluar dan kasnya tidak bisa diganti.', 'Transaksi tidak jadi: tekan <b>Batalkan</b> dan isi alasan. Tetap tersimpan sebagai jejak, tidak dihitung saldo, dan tidak bisa diurungkan.'])}
<h3>4. Laporan tahunan</h3>
${pol(['Di Buku Kas, tekan <b>Laporan tahunan</b>.', 'Pilih <b>Kas</b> dan <b>Tahun</b>.', 'Lihat saldo akhir, total masuk dan keluar, tabel <b>Per bulan</b>, dan pembagian <b>per kategori</b>.', 'Tekan <b>Unduh CSV</b> untuk membuka di Excel.'])}
${pg('b-kas-laporan', 'Laporan Kas tahunan')}
<h3>5. Kebiasaan yang dianjurkan</h3>
${pul(['Catat transaksi di hari yang sama.', 'Cocokkan saldo dengan uang tunai atau rekening setiap akhir bulan.', 'Unduh laporan tahunan setiap Januari dan simpan salinannya.'])}` },

  nadzir: { judul: 'Panduan Nadzir', sub: 'Tanah wakaf dan barang inventaris', isi: `
${pg('n-beranda', 'Beranda Nadzir')}
<h3>1. Melihat daftar aset</h3>
${pol(['Ketuk <b>Aset &amp; Wakaf</b> di Pintasan.', 'Pilih tab <b>Tanah wakaf</b> atau <b>Barang</b>. Di atasnya tampil jumlah, total luas, yang belum bersertifikat, dan yang perlu perbaikan.', 'Cari dengan nama, wakif, atau alamat, atau saring menurut sertifikat, peruntukan, dan status.'])}
${pg('n-aset', 'daftar Tanah wakaf')}
<h3>2. Mencatat tanah wakaf baru</h3>
${pol(['Tekan <b>Tambah tanah wakaf</b>.', 'Isi <b>Nama</b>, <b>Lokasi</b>, <b>Luas (m²)</b>, <b>Peruntukan</b>, dan <b>Wakif</b>.', 'Di bagian <b>Dokumen</b>, isi status sertifikat, tanggal ikrar wakaf, nomor AIW, nomor sertifikat, dan <b>Letak dokumen asli</b>.', 'Pilih <b>Kondisi</b>, lalu <b>Simpan</b>.'])}
<p>Scan dokumen tidak disimpan di aplikasi. Cukup tulis letak dokumen aslinya.</p>
${pg('n-aset-isi', 'formulir Tambah tanah wakaf')}
<h3>3. Mencatat barang inventaris</h3>
<p>Buka tab <b>Barang</b>, tekan <b>Tambah barang</b>, lalu isi nama, kategori, jumlah, lokasi simpan, pemegang, cara perolehan, tahun, dan perkiraan nilai.</p>
<h3>4. Mengubah atau melepas aset</h3>
${pul(['Data berubah: buka asetnya, tekan <b>Ubah</b>, lalu simpan.', 'Aset tidak dimiliki lagi (dijual, rusak dibuang, hilang, ditukar): isi <b>Tanggal dilepas</b> dan <b>Alasan</b>, lalu <b>Tandai dilepas</b>.', 'Aset tidak bisa dihapus. Kalau keliru, tekan <b>Aktifkan kembali</b>.'])}` },

  khodim: { judul: 'Panduan Khodim/Keluarga', sub: 'Jadwal ziarah dan peserta yang perlu dibantu', isi: `
<p>Khodim atau keluarga pendamping membantu jamaah selama ziarah dan umroh.</p>
${pg('h-beranda', 'Beranda Khodim/Keluarga')}
<h3>1. Melihat jadwal perjalanan</h3>
${pol(['Ketuk <b>Ziarah &amp; Umroh</b> di Pintasan.', 'Daftar menampilkan tanggal, jam kumpul, tujuan, dan wilayah.', 'Ketuk perjalanan untuk melihat rinciannya, termasuk tempat kumpul.'])}
${pg('h-perjalanan', 'daftar Ziarah & Umroh')}
<h3>2. Melihat peserta yang perlu dibantu</h3>
${pol(['Ketuk <b>Kebutuhan Khusus</b> di Pintasan.', 'Pilih <b>Perjalanan</b> yang akan didampingi.', 'Lihat nama peserta, kebutuhannya (kursi roda, alat bantu jalan, sulit naik tangga, dan lain-lain), dan keterangan singkat.'])}
<p>Khodim hanya <b>melihat</b>. Kalau ada kebutuhan yang belum tercatat atau keliru, sampaikan ke koordinator atau dokter pendamping.</p>
${pg('h-kebutuhan', 'Kebutuhan Khusus peserta satu perjalanan')}
<h3>3. Sebelum berangkat</h3>
${pul(['Buka Kebutuhan Khusus sehari sebelum berangkat dan catat siapa yang perlu dibantu.', 'Siapkan kursi roda atau tempat duduk dekat pintu bus.', 'Data ini rahasia. Jangan difoto layarnya atau dibagikan ke grup WA.'])}` },

  dokter: { judul: 'Panduan Dokter Pendamping', sub: 'Jamaah sakit, kunjungan, kebutuhan khusus', isi: `
<p>Semua data kesehatan <b>rahasia</b> dan dicatat <b>tanpa nama penyakit</b>. Cukup tempat dirawat dan kondisi umumnya.</p>
${pg('d-beranda', 'Beranda Dokter Pendamping')}
<h3>1. Melihat jamaah sakit</h3>
${pol(['Ketuk <b>Jamaah Sakit</b>, atau baris <b>jamaah sakit belum dijenguk</b> di Beranda.', 'Di atas tampil jumlah sedang sakit, kondisi berat, rawat inap, dan belum dijenguk.', 'Daftar diurutkan dari kondisi paling berat.'])}
${pg('d-sakit', 'daftar Jamaah Sakit')}
<h3>2. Mencatat jamaah sakit</h3>
${pol(['Tekan <b>Catat jamaah sakit</b>.', 'Isi <b>Nomor Anggota</b> atau tekan <b>Pindai KTA</b>.', 'Pilih <b>Dirawat di</b> (di rumah atau rawat inap, isi nama rumah sakit bila rawat inap).', 'Pilih <b>Kondisi umum</b>: Ringan, Sedang, atau Berat.', 'Isi tanggal <b>Mulai sakit</b>, keterangan singkat bila perlu, lalu <b>Simpan</b>.'])}
${pg('d-sakit-isi', 'formulir Catat jamaah sakit')}
<h3>3. Kunjungan, sembuh, atau wafat</h3>
${pul(['Setelah menjenguk, buka catatannya dan isi <b>Catat kunjungan</b>.', 'Sudah sembuh atau wafat: di bagian <b>Sudah sembuh?</b>, pilih keadaan dan tanggalnya, lalu <b>Simpan keadaan</b>.', 'Bila wafat, minta koordinator atau ketua mengubah status jamaah agar masuk Daftar Ahli Kubur.'])}
<h3>4. Kebutuhan khusus</h3>
${pol(['Ketuk <b>Kebutuhan Khusus</b>, lalu <b>Catat kebutuhan</b>.', 'Isi Nomor Anggota atau Pindai KTA.', 'Pilih kebutuhannya (boleh lebih dari satu).', 'Tekan <b>Simpan</b>. Kosongkan semua pilihan bila tidak perlu dibantu lagi.'])}` },

  admin: { judul: 'Panduan Admin Pusat', sub: 'PIN pengurus, kesehatan sistem, backup', isi: `
<p>Admin Pusat juga mengerjakan hampir semua pekerjaan Ketua, kecuali memutuskan bantuan dan melihat nama jamaah sakit.</p>
${pg('p-beranda', 'Beranda Admin Pusat')}
<h3>1. Masuk cadangan</h3>
<p>Bila PIN bermasalah, buka <b>silsilah.tqncukir.id/admin.html</b>, isi email admin, lalu ketuk tautan yang dikirim ke email itu. Jangan sebarkan alamat ini.</p>
<h3>2. Membuat akun pengurus (Atur PIN)</h3>
${pol(['Buka <b>Atur PIN</b> (HP: menu Lainnya; laptop: tombol Admin).', 'Tekan <b>Pindai KTA pengurus</b>, atau ketik Nomor Anggotanya.', 'Pilih <b>Peran</b>. Untuk Koordinator Wilayah, pilih <b>Kecamatan tugas</b>.', 'Isi PIN 8 angka atau tekan <b>Buat acak</b>, lalu <b>Simpan PIN</b>.', 'PIN <b>hanya tampil sekali</b>. Serahkan langsung ke orangnya, jangan lewat grup WA.'])}
<p>Daftar <b>Pengurus ber-PIN</b> punya tombol <b>Ganti PIN</b>, <b>Ubah wilayah</b>, dan <b>Nonaktifkan</b> untuk pengurus yang berhenti.</p>
${pg('p-pin', 'halaman Atur PIN Pengurus')}
<h3>3. Kesehatan Sistem</h3>
<p>Beranda menampilkan <b>Kesehatan sistem: sehat ✓</b> atau jumlah hal yang perlu dicek. Halaman Kesehatan Sistem berisi kartu Cadangan harian, Notifikasi HP, Kerapian data, Akun &amp; login, Kapasitas paket gratis, Keamanan, Tugas keamanan, dan Aktivitas pengurus. Sistem memeriksa dirinya pukul 06.30 dan 16.30 WIB dan mengirim peringatan ke HP Admin Pusat bila ada masalah.</p>
${pg('p-sistem', 'halaman Kesehatan Sistem')}
<h3>4. Pantau Backup</h3>
<p>Database dibackup otomatis setiap hari sekitar 01.15 WIB ke Google Drive akun organisasi. Bila gagal atau lebih dari 30 jam tanpa backup baru, kotak merah muncul di Beranda dan email peringatan dikirim.</p>
${pg('p-backup', 'halaman Pantau Backup')}
<h3>5. Tugas rutin</h3>
${ptab(['Kapan', 'Tugas'], [['Setiap pagi', 'Lihat Beranda: Perlu ditindaklanjuti dan Kesehatan sistem'], ['Setiap bulan', 'Cek Advisors Supabase, lalu tandai di Tugas keamanan'], ['Setiap tahun', 'Ganti PIN Admin, periksa pemegang akses akun organisasi, uji pemulihan backup'], ['Sekali saja', 'Aktifkan 2FA di GitHub, Supabase, Cloudflare, dan Google'], ['Pengurus berganti', 'Nonaktifkan PIN lama, buat PIN untuk penggantinya']])}
<h3>6. Yang jangan dilakukan</h3>
${pul(['Jangan membuat ulang Kunci Notifikasi; bila diganti, semua jamaah harus mengaktifkan pemberitahuan lagi.', 'Jangan memberikan kata sandi backup, PIN Admin, atau akses akun organisasi lewat WA atau email.'])}
<h3>7. Poster Cara Pasang</h3>
<p>Cetak dari <a href="/poster.html">halaman Poster</a> (A4, berwarna, aktifkan Grafik latar), lalu tempel di tempat pengajian.</p>
${pg('poster', 'Poster Cara Pasang A4')}` },

  notif: { judul: 'Notifikasi', sub: 'Mengaktifkan dan memilih kabar', isi: `
${pol(['Buka <b>Notifikasi</b> dari menu Lainnya.', 'Tekan <b>Aktifkan di perangkat ini</b>, lalu <b>Izinkan</b>. Tekan <b>Kirim pemberitahuan uji</b> untuk memastikan pesan masuk.', 'Di <b>Kabar yang ingin diterima</b>, centang kabar yang diinginkan lalu <b>Simpan pilihan</b>.'])}
<p>Dikirim paling banyak 2 kali sehari, pukul 06.00 dan 16.00 WIB. Di iPhone, SILSILAH harus dipasang di layar utama dulu (iOS 16.4 atau lebih baru).</p>
${pg('a-notif', 'halaman Notifikasi')}` },

  tanpamasuk: { judul: 'Halaman tanpa masuk', sub: 'Agenda, berita publik, cek keaslian KTA', isi: `
${pul(['<b>Agenda</b>: kegiatan umum yang akan datang.', '<b>Berita</b>: berita publik. Berita khusus anggota butuh masuk.', '<b>Cek Keaslian KTA</b>: pindai QR kartu, atau ketik Nomor Anggota dan nama sesuai KTA, lalu <b>Periksa</b>. Hasilnya hanya nama, desa, dan status.'])}
${pg('f-cek-kta', 'halaman Cek Keaslian KTA')}` },

  ahli: { judul: 'Ahli Kubur dan Haul', sub: 'Almarhum/almarhumah dan haul bulan ini', isi: `
<p>Daftar Ahli Kubur berisi <b>jamaah</b> yang wafat (otomatis masuk), <b>keluarga jamaah</b> yang dititipkan untuk didoakan, dan <b>masyayikh/mursyid</b>.</p>
${pol(['Buka <b>Ahli Kubur</b> dari menu Lainnya. Cari dengan nama, bin/binti, atau penitip.', 'Pengurus yang berhak menambah: tekan <b>Tambah ahli kubur</b>, pilih jenis, isi nama, <b>bin/binti</b>, tanggal wafat, lokasi makam, dan keluarga penghubung (nama saja).', 'Untuk keluarga jamaah, isi <b>Nomor Anggota yang menitipkan</b>, tekan <b>Periksa</b>, lalu pilih hubungannya.', 'Jamaah yang wafat tidak ditambah di sini: ubah statusnya menjadi Wafat di Data Jamaah.'])}
${pg('f-ahli', 'daftar Ahli Kubur')}
<p><b>Haul</b> menampilkan haul bulan Hijriah ini dan bulan depan, lengkap dengan perkiraan tanggal Masehi dan haul ke berapa. Tanggal memakai kalender Ummul Qura, bisa selisih 1 hari dengan rukyat.</p>
${pg('f-haul', 'halaman Haul')}` },

  kegiatan: { judul: 'Rincian kegiatan dan daftar hadir', sub: 'Jumlah hadir, asal wilayah, unduh CSV', isi: `
${pol(['Buka <b>Kegiatan</b>, ketuk salah satu kegiatan.', 'Bagian atas: tanggal, jam, tempat, wilayah. Yang berhak melihat tombol <b>Absensi</b>, <b>Ubah</b>, dan <b>Batalkan kegiatan</b>.', '<b>Kehadiran</b>: jumlah hadir, cara pencatatan, dan <b>Asal wilayah jamaah</b>.', '<b>Daftar hadir</b> bisa dicari; tekan <b>Unduh CSV</b> untuk membuka di Excel.'])}
${pg('f-kegiatan-isi', 'rincian kegiatan dan daftar hadir')}` },

  ziarah: { judul: 'Ziarah dan Umroh', sub: 'Perjalanan, peserta, lunas', isi: `
<p>Membuat perjalanan dan mendaftarkan peserta: ketua, koordinator (kecamatannya), Admin Pusat. Menandai lunas: juga bendahara. Peran lain hanya melihat jadwal.</p>
<h3>Membuat perjalanan</h3>
${pol(['Buka <b>Ziarah &amp; Umroh</b>, tekan <b>Tambah perjalanan</b>.', 'Isi jenis, nama, tujuan, tanggal berangkat, jam kumpul, tanggal pulang, tempat kumpul, wilayah, dan kuota.', 'Pilih <b>Tampil untuk anggota</b> agar anggota melihat jadwalnya.', 'Tekan <b>Simpan</b>.'])}
<h3>Mendaftarkan peserta</h3>
${pol(['Buka perjalanannya, tekan <b>Pindai KTA peserta</b> dan pindai satu per satu. Kartu tertinggal? Ketik Nomor Anggota lalu <b>Daftarkan</b>.', 'Keluarga bukan jamaah: <b>Tambah keluarga (bukan jamaah)</b>, isi nama, Nomor Anggota penghubung, dan hubungannya.', 'Setelah membayar, tekan <b>Tandai lunas</b>. Salah? <b>Batalkan lunas</b>.', 'Mengundurkan diri: <b>Batal ikut</b> (bisa diikutkan lagi).', 'Tekan <b>Unduh daftar rombongan</b> untuk mencetak daftar peserta.'])}
${pg('f-perjalanan-isi', 'rincian perjalanan dan daftar peserta')}` },

  bantuan: { judul: 'Bantuan Sosial', sub: 'Ajukan → diputuskan ketua → disalurkan', isi: `
${pol(['Buka <b>Bantuan Sosial</b>, tekan <b>Ajukan bantuan</b> (bisa juga dari rincian jamaah, Ekonomi, atau Jamaah Sakit).', 'Isi <b>Nomor Anggota penerima</b> atau <b>Pindai KTA</b>.', 'Pilih <b>Jenis bantuan</b> dan <b>Bentuk</b> (uang atau barang), lalu isi jumlahnya.', 'Isi keterangan kondisi singkat, lalu <b>Ajukan</b>.', 'Ketua memutuskan. Setelah disetujui, bendahara atau koordinator menyerahkan bantuan lalu menekan <b>Tandai sudah disalurkan</b> dengan tanggal dan kas yang dipakai.', 'Yang belum disalurkan bisa ditarik dengan <b>Batalkan pengajuan</b>.'])}
<p>Data penerima rahasia. Jangan menulis nama penyakit, nomor HP, atau NIK.</p>
${pg('f-bantuan-ajukan', 'formulir Ajukan bantuan')}` },

  ekonomi: { judul: 'Ekonomi Jamaah', sub: 'Mendata kondisi ekonomi (rahasia)', isi: `
${pol(['Buka <b>Ekonomi Jamaah</b>. Di atas tampil jumlah per kondisi dan yang belum didata.', 'Saring <b>Belum pernah dibantu</b> untuk menemukan jamaah kurang mampu yang belum menerima bantuan.', 'Ketuk nama, isi <b>Kondisi ekonomi</b>, <b>Jumlah tanggungan</b>, dan <b>Tanggal didata</b>, lalu <b>Simpan</b>.', 'Tombol <b>Ajukan bantuan</b> langsung membuka formulir bantuan untuk jamaah itu.'])}
<p>Jangan menulis angka penghasilan, nama penyakit, nomor HP, atau NIK.</p>
${pg('f-ekonomi', 'daftar Ekonomi Jamaah')}` },

  usaha: { judul: 'Usaha Jamaah', sub: 'Direktori usaha sesama jamaah', isi: `
${pol(['Buka <b>Usaha Jamaah</b>. Cari nama usaha, barang, atau pemilik.', 'Ketua, koordinator, dan Admin Pusat bisa mencatat usaha atas permintaan pemiliknya: <b>Tambah usaha</b>, isi Nomor Anggota pemilik, nama usaha, jenis, barang/jasa, hari dan jam buka, lalu <b>Simpan</b>.', 'Usaha yang berhenti: buka usahanya, tekan <b>Tandai tutup</b>.'])}
<p>Nomor HP dan foto tidak dicantumkan. Untuk mencatatkan usaha Anda, hubungi koordinator.</p>
${pg('f-usaha', 'daftar Usaha Jamaah')}` },

  dashboard: { judul: 'Dashboard Pengurus', sub: 'Ringkasan jamaah, kegiatan, keuangan', isi: `
${pol(['Tekan <b>Saringan</b> untuk memilih wilayah dan periode.', 'Gunakan <b>Lompat ke</b>: Jamaah, Kegiatan, Kepedulian, atau Keuangan.', 'Ketuk nama wilayah, mursyid, atau batang grafik untuk melihat daftarnya.', '<b>Catatan pengecekan data</b>: betulkan lewat <b>Ubah Data</b>, atau tekan <b>Sudah benar</b>.', '<b>Jenis kelamin</b>: tekan <b>Lengkapi sekarang</b>, lalu ketuk Laki-laki atau Perempuan.'])}
<p>Isi panel menyesuaikan hak akun Anda.</p>` },

  rahasia: { judul: 'Aturan data rahasia', sub: 'Wajib dipatuhi semua pengurus', isi: `
${pul(['Data kesehatan, ekonomi, dan bantuan hanya untuk pengurus yang berhak. Jangan difoto layarnya atau dibagikan ke grup WA.', 'Jangan pernah menulis NIK, nomor HP, angka penghasilan, atau nama penyakit di kolom keterangan.', 'Data jamaah, aset, dan transaksi tidak bisa dihapus. Gunakan status (Wafat, Tidak aktif, Dilepas, Dibatalkan).', 'Setiap perubahan data tercatat: siapa dan kapan.'])}` },

  kendala: { judul: 'Kalau ada kendala', sub: 'Lupa PIN, KTA hilang, data keliru', isi: `
${ptab(['Kendala', 'Hubungi', 'Yang dilakukan'], [['Anggota lupa PIN', 'Koordinator wilayahnya', 'Buat PIN baru di halaman KTA. PIN lama tidak berlaku.'], ['KTA hilang atau dicuri', 'Ketua atau Admin Pusat', 'Batalkan QR kartu lama, lalu cetak kartu baru.'], ['Data diri keliru', 'Koordinator wilayahnya', 'Buka data jamaah, tekan Ubah, lalu simpan.'], ['Belum terdaftar atau KTA lama tanpa QR', 'Koordinator wilayahnya', 'Daftarkan lewat Pendaftaran.'], ['Pengurus lupa PIN 8 angka', 'Admin Pusat', 'Pasang PIN baru di Atur PIN Pengurus.'], ['Ganti HP', '–', 'Pasang lagi di HP baru, lalu masuk seperti biasa.']])}
<p>Jangan pernah memberitahukan PIN kepada siapa pun, termasuk lewat WA. Pengurus tidak akan menanyakan PIN Anda.</p>` },
};

// Urutan bagian per peran: panduan peran sendiri lebih dulu, lalu fitur yang memang bisa dibuka peran itu.
const BAGIAN_PERAN = {
  anggota: ['anggota', 'notif', 'ahli', 'usaha', 'tanpamasuk', 'pasang', 'kendala'],
  ketua: ['ketua', 'masuk-pengurus', 'koordinator', 'petugas', 'kegiatan', 'ziarah', 'bantuan', 'ekonomi', 'dokter', 'ahli', 'usaha', 'nadzir', 'dashboard', 'notif', 'rahasia', 'pasang', 'kendala'],
  koordinator_wilayah: ['koordinator', 'masuk-pengurus', 'petugas', 'kegiatan', 'ziarah', 'bantuan', 'ekonomi', 'dokter', 'bendahara', 'ahli', 'usaha', 'dashboard', 'notif', 'rahasia', 'pasang', 'kendala'],
  petugas_scan: ['petugas', 'masuk-pengurus', 'kegiatan', 'ziarah', 'ahli', 'usaha', 'dashboard', 'notif', 'pasang', 'kendala'],
  bendahara: ['bendahara', 'masuk-pengurus', 'bantuan', 'ekonomi', 'ziarah', 'kegiatan', 'ahli', 'usaha', 'dashboard', 'notif', 'rahasia', 'pasang', 'kendala'],
  nadzir: ['nadzir', 'masuk-pengurus', 'usaha', 'notif', 'pasang', 'kendala'],
  khodim: ['khodim', 'masuk-pengurus', 'usaha', 'notif', 'rahasia', 'pasang', 'kendala'],
  dokter: ['dokter', 'masuk-pengurus', 'ziarah', 'usaha', 'notif', 'rahasia', 'pasang', 'kendala'],
  admin_pusat: ['admin', 'masuk-pengurus', 'ketua', 'koordinator', 'petugas', 'kegiatan', 'ziarah', 'ahli', 'usaha', 'nadzir', 'dashboard', 'notif', 'rahasia', 'pasang', 'kendala'],
};
