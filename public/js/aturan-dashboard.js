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
