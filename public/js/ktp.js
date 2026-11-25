// Pembaca teks KTP. Bekerja di HP ini saja: foto tidak dikirim ke server dan tidak disimpan.
// NIK sengaja tidak pernah diambil.
const KTP = (() => {
  const judul = (t) => t.toLowerCase().replace(/(^|[\s.,\/(\-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).trim();
  const bersih = (t) => t.replace(/^[\s:;.,\-=_|]+/, '').replace(/[|_=~"'`]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/[\s:;.,\-]+$/, '').trim();
  const ambil = (baris, pola) => { for (const b of baris) { const m = b.match(pola); if (m) return bersih(m[m.length - 1]); } return ''; };

  function urai(teksMentah) {
    const baris = teksMentah.toUpperCase()
      .replace(/\b\d{16}\b/g, ' ')              // buang NIK
      .split(/\n+/).map((b) => b.trim()).filter(Boolean)
      .filter((b) => !/^\s*NIK\b/.test(b));     // baris NIK diabaikan
    const h = {};
    h.kabupaten = ambil(baris, /^(?:KABUPATEN|KAB\.?|KOTA)\s+([A-Z .]+)$/);
    h.nama = ambil(baris, /^NAMA\s*[:;]?\s*([A-Z .,'`]+)$/);
    const lahir = baris.join('\n').match(/LAHIR\s*[:;]?\s*([A-Z .]*?)[,.\s]+(\d{1,2})\s*[-\/. ]\s*(\d{1,2})\s*[-\/. ]\s*(\d{4})/);
    if (lahir) {
      if (lahir[1].trim()) h.tempat_lahir = lahir[1].trim();
      const tl = new Date(Date.UTC(+lahir[4], +lahir[3] - 1, +lahir[2]));
      if (tl.getUTCDate() === +lahir[2] && tl.getUTCMonth() === +lahir[3] - 1) h.tanggal_lahir = tl.toISOString().slice(0, 10);
      const t = new Date(+lahir[4], +lahir[3] - 1, +lahir[2]), kini = new Date();
      let u = kini.getFullYear() - t.getFullYear();
      if (kini < new Date(kini.getFullYear(), t.getMonth(), t.getDate())) u--;
      if (u >= 5 && u <= 120) h.umur = u;
    }
    const alamat = ambil(baris, /^ALAMAT\s*[:;]?\s*(.+)$/);
    const rtrw = baris.join('\n').match(/RT\s*\/?\s*RW\s*[:;]?\s*(\d{1,3})\s*[\/l|I1]\s*(\d{1,3})/);
    h.alamat = alamat ? judul(alamat) : '';
    if (rtrw) h.rt_rw = `${rtrw[1].padStart(3, '0')}/${rtrw[2].padStart(3, '0')}`;
    const semua = baris.join('\n');
    const jk = semua.match(/KELAMIN\s*[:;]?\s*(LAKI|PEREMPUAN|PR)/);
    if (jk) h.jenis_kelamin = jk[1] === 'LAKI' ? 'L' : 'P';
    const gd = semua.match(/DARAH\s*[:;]?\s*(AB|A|B|O|0)\b/);
    if (gd) h.gol_darah = gd[1] === '0' ? 'O' : gd[1];
    const sk = semua.match(/PERKAWINAN\s*[:;]?\s*(BELUM\s*KAWIN|CERAI\s*HIDUP|CERAI\s*MATI|KAWIN)/);
    if (sk) h.status_kawin = judul(sk[1].replace(/\s+/g, ' '));
    const wn = semua.match(/KEWARGANEGARAAN\s*[:;]?\s*(WNI|WNA)/);
    if (wn) h.kewarganegaraan = wn[1];
    h.desa = ambil(baris, /^(?:KEL|DESA)\s*[\/I1l|]?\s*(?:DESA|KEL)?\s*[:;]?\s*([A-Z .]+)$/);
    h.kecamatan = ambil(baris, /^KECAMATAN\s*[:;]?\s*([A-Z .]+)$/);
    h.pekerjaan = ambil(baris, /^PEKERJAAN\s*[:;]?\s*([A-Z .\/]+)$/);
    for (const k of ['kabupaten', 'nama', 'tempat_lahir', 'desa', 'kecamatan', 'pekerjaan']) if (h[k]) h[k] = judul(h[k]);
    if (h.pekerjaan) { const p = cocokkan(h.pekerjaan, PEKERJAAN.map((nama) => ({ nama })), 4); if (p) h.pekerjaan = p.nama; }
    return h;
  }

  // Cocokkan nama wilayah hasil baca (boleh sedikit salah ketik) dengan daftar di database
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
  function jarak(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // Pekerjaan baku di KTP (untuk membetulkan salah baca, mis. "Petanvpekebun")
  const PEKERJAAN = ['Petani/Pekebun', 'Buruh Tani/Perkebunan', 'Wiraswasta', 'Pedagang', 'Mengurus Rumah Tangga', 'Pelajar/Mahasiswa',
    'Karyawan Swasta', 'Karyawan Honorer', 'Pegawai Negeri Sipil', 'Buruh Harian Lepas', 'Guru', 'Dosen', 'Belum/Tidak Bekerja', 'Pensiunan',
    'Nelayan/Perikanan', 'Peternak', 'Sopir', 'Tukang Batu', 'Tukang Kayu', 'Perangkat Desa', 'Kepala Desa', 'Kepolisian RI',
    'Tentara Nasional Indonesia', 'Bidan', 'Perawat', 'Dokter', 'Ustadz/Mubaligh', 'Karyawan BUMN', 'Karyawan BUMD', 'Penjahit', 'Montir'];
  function cocokkan(nama, daftar, bagi = 5) {
    const n = norm(nama);
    if (n.length < 3) return null;
    let terbaik = null, skor = 99;
    for (const x of daftar) {
      const s = jarak(n, norm(x.nama));
      if (s < skor) { skor = s; terbaik = x; }
    }
    return skor <= Math.max(1, Math.floor(n.length / bagi)) ? terbaik : null;
  }

  // Pembaca disiapkan sekali (unduh + muat), lalu dipakai berulang agar cepat.
  let pekerja = null, lapor = () => {};
  function siapkan() {
    if (!pekerja) pekerja = Tesseract.createWorker('ind', 1, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang', workerBlobURL: false,
      logger: (m) => { if (m.status === 'recognizing text') lapor(m.progress); },
    }).then(async (w) => { await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); return w; })
      .catch((e) => { pekerja = null; throw e; });
    return pekerja;
  }

  // Foto -> teks. Gambar diperkecil & dibuat hitam-putih dulu agar cepat dan lebih terbaca.
  async function baca(berkas, kemajuan) {
    const gbr = await createImageBitmap(berkas);
    const skala = Math.min(1, 1280 / gbr.width);
    const kanvas = document.createElement('canvas');
    kanvas.width = Math.round(gbr.width * skala); kanvas.height = Math.round(gbr.height * skala);
    const c = kanvas.getContext('2d', { willReadFrequently: true });
    c.filter = 'grayscale(1) contrast(1.6)';
    c.drawImage(gbr, 0, 0, kanvas.width, kanvas.height);
    gbr.close();
    try {
      const w = await siapkan();
      lapor = kemajuan;
      const { data } = await w.recognize(kanvas);
      return data.text;
    } finally {
      lapor = () => {};
      c.clearRect(0, 0, kanvas.width, kanvas.height); kanvas.width = kanvas.height = 0;
    }
  }
  return { urai, cocokkan, baca, judul, siapkan };
})();
if (typeof module !== 'undefined') module.exports = KTP;
