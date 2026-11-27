// Aturan pengelompokan untuk grafik Dashboard Pengurus. Satu tempat: ubah di sini saja.
// Hanya untuk menghitung grafik; isian asli anggota di database tidak diubah.

// Pekerjaan: kunci = nama kelompok di grafik, isi = variasi tulisan yang setara (huruf kecil, spasi rapi).
const KELOMPOK_PEKERJAAN = {
  'Mengurus Rumah Tangga': ['mengurus rumah tangga', 'ibu rumah tangga', 'irt', 'ibu rt', 'rumah tangga', 'mrt', 'urt',
    'megurus rumah tangga', 'memgurus rumah tangga', 'mengrus rumah tangga', 'mengurus rumah tangg', 'menguruskan rumah tangga', 'mengutus rumah tangga', 'mwngurua rumah tangga', 'ibi rumah tangga', 'ib rt'],
  'Petani/Pekebun': ['petani', 'tani', 'petani/pekebun', 'pekebun', 'petani pekebun', 'bertani', 'patani'],
  'Buruh Tani': ['buruh tani', 'buruh tani/perkebunan'],
  'Pedagang': ['pedagang', 'perdagangan', 'dagang', 'jualan', 'berdagang', 'perdangangan', 'pegadang'],
  'Wiraswasta': ['wiraswasta', 'wirausaha', 'usaha', 'pengusaha', 'wira swasta'],
  'Karyawan Swasta': ['karyawan swasta', 'swasta', 'karyawan', 'pegawai swasta'],
  'Guru': ['guru', 'guru/dosen', 'guru ngaji', 'ustadz', 'ustad'],
  'PNS/ASN': ['pns', 'pegawai negeri sipil', 'asn', 'pegawai negeri', 'p n s', 'guru pns'],
  'Pensiunan': ['pensiun', 'pensiunan', 'purnawirawan', 'pensiun guru'],
  'Belum/Tidak Bekerja': ['belum/tidak bekerja', 'tidak bekerja', 'belum kerja', 'belum bekerja', 'tidak kerja'],
  'Pelajar/Mahasiswa': ['pelajar', 'mahasiswa', 'pelajar/mahasiswa', 'santri', 'siswa'],
};

// Sektor pekerjaan (11 sektor, keputusan Kang 2026-11-27): urutan aturan penting, yang pertama cocok dipakai.
// Diperiksa terhadap isian asli dan nama kelompok di atas (huruf kecil, spasi rapi). Tidak cocok = "Tidak dikenali".
const SEKTOR_PEKERJAAN = [
  ['Pensiunan', /pensiun|purnawirawan|purna tugas/],
  ['Belum/tidak bekerja', /(belum|tidak|blm|tdk) ?(\/ ?tidak )?(bekerja|kerja)|pengangguran/],
  ['Pelajar/santri/mahasiswa', /pelajar|siswa|santri|mahasiswa|sekolah|mahasiswi/],
  ['Buruh, tukang & jasa', /pembantu rumah tangga|\bart\b|buruh(?! tani)(?! nelayan)(?! peternakan)|tukang|sopir|supir|driver|ojek|ojol|kernet|kenek|mekanik|bengkel|montir|jahit|penjahit|\blas\b|perancang|pandai besi|kuli|satpam|security|keamanan|cleaning|cukur|rias|penata|juru masak|koki|masak|parkir|kurir|transportasi|konstruksi|industri|serabutan|jasa|paraji|tabib|seniman|promotor|cucian|laundry/],
  ['Pertanian, peternakan, perikanan', /tani|kebun|ternak|nelayan|\\bikan|perikanan|tambak|sawah|kebon/],
  ['Mengurus rumah tangga', /rumah tangga|\birt\b|\bmrt\b|\burt\b|ibu rt|\bib rt\b/],
  ['Pegawai pemerintah', /\bpns\b|\basn\b|p n s|negeri sipil|pegawai negeri|tentara|\btni\b|polri|polisi|kepolisian|perangkat desa|kepala desa|\bkades\b|sekdes|carik|lurah|kamituwo|kasun|kepala dusun|camat|bupati|walikota|gubernur|presiden|dprd|\bdpr\b|\bdpd\b|\bbpk\b|kabinet|kementerian|duta besar|mahkamah|\bpppk\b/],
  ['Pendidikan & keagamaan', /guru|dosen|ustad|ustadz|ustazah|ustadzah|mubaligh|kyai|kiai|imam|modin|takmir|pengasuh|pondok|pendeta|pastor|biarawati|tpq|tpa|madrasah|pengajar|pendidik/],
  ['Kesehatan & profesi', /dokter|bidan|perawat|apoteker|psikolog|psikiater|kesehatan|mantri|pengacara|advokat|notaris|akuntan|arsitek|konsultan|wartawan|penyiar|pilot|pelaut|peneliti|penterjemah|penerjemah|pialang|insinyur|programmer|paranormal/],
  ['Karyawan swasta', /karyawan|(?<!wira ?)swasta|pegawai|honorer|bumn|bumd|pabrik|staf|staff|perusahaan|bank|kantor/],
  ['Dagang & usaha sendiri', /dagang|jual|warung|toko|wiraswasta|wirausaha|wira swasta|usaha|pengusaha|perdagangan|grosir|pasar|bisnis|kontraktor|juragan|catering|katering/],
];
function sektorPekerjaan(p) {
  const k = kelompokPekerjaan(p);
  if (k === null) return null;
  const t = rapikanTeks(p), kk = rapikanTeks(k);
  for (const [nama, pola] of SEKTOR_PEKERJAAN) if (pola.test(t) || pola.test(kk)) return nama;
  return 'Tidak dikenali';
}

// Catatan pengecekan: catatan asli → label pendek. Catatan berisi koreksi + masalah tersisa punya label gabungan,
// jadi satu anggota tetap dihitung satu kali.
const LABEL_CATATAN = {
  'Desa tidak ada di daftar resmi, ditulis seperti di data lama': 'Desa belum ditemukan',
  'Kab/Kota dibetulkan sesuai kecamatan': 'Kabupaten/kota sudah dikoreksi',
  'Kolom kecamatan berisi nama desa, sudah dibetulkan': 'Kecamatan sudah dikoreksi',
  'Kecamatan tidak ditemukan, ditulis seperti di data lama': 'Kecamatan belum ditemukan',
  'Kecamatan dan desa tidak ditemukan, ditulis seperti di data lama': 'Kecamatan & desa belum ditemukan',
  'Kab/Kota dibetulkan; desa ditulis seperti di data lama': 'Kab/kota dikoreksi, desa belum ditemukan',
};

const rapikanTeks = (t) => String(t ?? '').toLowerCase().replace(/\s*\/\s*/g, '/').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const PETA_PEKERJAAN = new Map(Object.entries(KELOMPOK_PEKERJAAN).flatMap(([k, v]) => [[rapikanTeks(k), k], ...v.map((x) => [rapikanTeks(x), k])]));

// Nama kelompok untuk satu isian pekerjaan; null = belum diisi. Isian lain dirapikan huruf besarnya.
function kelompokPekerjaan(p) {
  const r = rapikanTeks(p);
  if (!r || r === '-') return null;
  return PETA_PEKERJAAN.get(r) || r.replace(/\b\w/g, (c) => c.toUpperCase());
}
const labelCatatan = (c) => LABEL_CATATAN[c] || c;
