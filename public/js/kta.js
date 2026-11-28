// KTA Digital: kartu seperti asli, QR keaslian (ditandatangani di server dengan kunci admin pusat), PIN, cetak.
const $ = (id) => document.getElementById(id);
let id = new URLSearchParams(location.search).get('id');
let j = null, peran = '', terbatas = false, qrAktif = null;

const pesan = (t) => { $('pesan').textContent = t; };
const pesanAksi = (t, ok) => { $('pesan-aksi').textContent = t; $('pesan-aksi').className = 'pesan' + (ok ? ' ok' : ''); };
const tgl = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
const PILIH = 'id,nomor_anggota,nama,umur_daftar,pekerjaan,tanggal_daftar,aktif,wafat,desa(nama,kecamatan(nama,kabupaten(nama))),mursyid(nama)';

function gambarKartu() {
  const kab = j.desa.kecamatan.kabupaten?.nama || '';
  const baris = [
    ['Nomor', j.nomor_anggota], ['Nama', j.nama], ['Umur', j.umur_daftar ? `${j.umur_daftar} tahun` : '–'], ['Pekerjaan', j.pekerjaan || '–'],
    ['Desa', j.desa.nama], ['Kecamatan', j.desa.kecamatan.nama], ['Kab/Kota', kab || '–'], ['Mursyid', j.mursyid?.nama || '–'],
  ];
  $('kta-data').innerHTML = baris.map(([k, v]) => `<div><dt>${k}</dt><dd>${hurufAman(String(v))}</dd></div>`).join('');
  const t = j.tanggal_daftar ? new Date(j.tanggal_daftar + 'T00:00:00') : null;
  $('kta-tgl').textContent = t ? t.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '') : ''; // "Jombang," sudah ada di gambar master
  $('kartu').hidden = false;
  // Isian panjang (nama, pekerjaan) dikecilkan sampai muat, tidak dipotong; ukuran ikut lebar kartu (cqw), jadi cukup sekali.
  for (const dd of $('kta-data').querySelectorAll('dd')) {
    for (let k = 0.95; dd.scrollWidth > dd.clientWidth && k >= 0.7; k -= 0.05) dd.style.fontSize = `calc(2.84cqw * ${k.toFixed(2)})`;
  }
  document.title = `KTA ${j.nama} · SILSILAH TQN Cukir`;
}

async function panggilKta(isi) {
  const t = await tokenAktif();
  if (!t) throw new Error('belum-masuk');
  const r = await fetch(`${SB_URL}/functions/v1/kta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${t}` }, body: JSON.stringify(isi),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(b.pesan || 'gagal-' + r.status); e.status = r.status; throw e; }
  return b;
}

// Sesi dari QR KTA lama: QR digital sama dengan QR teks di kartu fisik (bukan QR bertanda tangan).
function qrLama() {
  const kab = j.desa.kecamatan.kabupaten?.nama || '';
  const qr = qrcode(0, 'M');
  qr.addData(`${j.nomor_anggota}  ${[j.nama, j.desa.nama, j.desa.kecamatan.nama, kab].join(' ').toUpperCase()}`);
  qr.make(); qrAktif = qr;
  $('kta-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

async function muatQr() {
  if (terbatas) { qrLama(); return; }
  $('kta-qr').textContent = 'Memuat QR...';
  try {
    const { kode, versi } = await panggilKta({ aksi: 'qr', jamaah_id: j.id });
    const qr = qrcode(0, 'M');
    qr.addData(`${location.origin}/cek-kta.html#${kode}`);
    qr.make(); qrAktif = qr;
    $('kta-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $('kta-versi').textContent = versi > 1 ? `Kartu ke-${versi}` : '';
  } catch (e) {
    $('kta-qr').textContent = 'QR belum tersedia';
    pesan(e.status === 503 ? 'QR KTA belum bisa dibuat: kunci KTA belum dipasang admin pusat.' : 'QR KTA belum bisa dimuat. Periksa sinyal lalu buka ulang halaman ini.');
  }
}

function cetak() { setTimeout(() => window.print(), 150); }

$('cetak').onclick = () => { $('kta-pin').hidden = true; cetak(); };

$('buat-pin').onclick = async () => {
  if (!await yakin('Buat PIN baru untuk kartu ini?\n\nPIN lama (kalau ada) langsung tidak berlaku. PIN baru hanya tampil sekali, jadi langsung dicetak.')) return;
  const btn = $('buat-pin'); btn.disabled = true; btn.classList.add('sibuk');
  pesanAksi('');
  try {
    const pin = await dbKirim('POST', 'rpc/buat_pin_kta', { p_jamaah_id: j.id });
    $('kta-pin-angka').textContent = pin; $('kta-pin').hidden = false;
    $('pin-tampil').textContent = pin; $('pin-baru').hidden = false;
    cetak();
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') return location.replace('/masuk.html');
    pesanAksi(e.detail?.code === '42501' || e.message === 'gagal-403' ? 'Akun ini tidak punya izin membuat PIN untuk jamaah ini.' : 'PIN belum bisa dibuat. Coba lagi.');
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); }
};

$('ganti').onclick = async () => {
  if (!await yakin('Batalkan QR di kartu lama?\n\nPakai ini kalau KTA hilang atau dicuri. QR di kartu lama langsung tidak berlaku, lalu cetak kartu baru.')) return;
  try {
    const v = await dbKirim('POST', 'rpc/ganti_kta', { p_jamaah_id: j.id });
    await muatQr();
    pesanAksi(`QR kartu lama sudah dibatalkan. Ini kartu ke-${v}, silakan cetak.`, true);
  } catch (e) {
    pesanAksi(e.detail?.code === '42501' || e.message === 'gagal-403' ? 'Hanya admin pusat dan ketua yang bisa membatalkan kartu.' : 'Belum berhasil. Coba lagi.');
  }
};

$('keluar').onclick = keluar;
// ===== Simpan KTA sebagai gambar PNG (Kang 2026-11-28) =====
// Digambar ulang di kanvas dengan posisi yang sama seperti kartu di layar (CSS .kta-master, 1cqw = 1% lebar),
// di atas gambar master ukuran asli 1579x996 (cukup tajam untuk dicetak 85,6x54 mm). PIN TIDAK PERNAH ikut.
const HURUF_KTA = "Roboto, Arial, 'Helvetica Neue', Helvetica, sans-serif";
const diHp = () => matchMedia('(max-width: 1023px)').matches;
// iPhone/iPad (termasuk iPad yang mengaku Mac): menu Bagikan punya "Simpan Gambar" → langsung masuk Foto.
// Android: menu Bagikan sering tanpa pilihan simpan, jadi gambar diunduh ke folder Download (tampil di Galeri, album Download).
const diIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const muatGambar = (src) => new Promise((ok, gagal) => { const g = new Image(); g.onload = () => ok(g); g.onerror = gagal; g.src = src; });
async function buatPngKta() {
  const master = await muatGambar('/img/kta-master.webp');
  const W = master.naturalWidth || 1579, H = master.naturalHeight || 996, cq = W / 100;
  const kv = document.createElement('canvas'); kv.width = W; kv.height = H;
  const c = kv.getContext('2d');
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
  c.drawImage(master, 0, 0, W, H);
  // QR: kotak putih bersudut 1cqw, padding 0,9cqw, di (8cqw, 19,6cqw) selebar 18cqw
  const qx = 8 * cq, qy = 19.6 * cq, qs = 18 * cq, pad = 0.9 * cq;
  c.fillStyle = '#FFFFFF';
  if (c.roundRect) { c.beginPath(); c.roundRect(qx, qy, qs, qs, cq); c.fill(); } else c.fillRect(qx, qy, qs, qs); // iOS 15 belum punya roundRect
  const n = qrAktif.getModuleCount(), sel = (qs - 2 * pad) / n;
  c.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    if (qrAktif.isDark(r, k)) c.fillRect(Math.floor(qx + pad + k * sel), Math.floor(qy + pad + r * sel), Math.ceil(sel), Math.ceil(sel));
  }
  c.fillStyle = '#111111'; c.textBaseline = 'middle';
  const versi = $('kta-versi').textContent;
  if (versi) { c.font = `700 ${2 * cq}px ${HURUF_KTA}`; c.textAlign = 'center'; c.fillText(versi, qx + qs / 2, qy + qs + 0.3 * cq + cq * 1.1); }
  // Isian: mulai 47,8cqw, puncak 19,12cqw, tinggi baris 3,357cqw, huruf 2,84cqw tebal KAPITAL; terlalu panjang dikecilkan (min 70%), lalu "…"
  c.textAlign = 'left';
  const geserX = 0.2 * cq, geserY = 0.32 * cq; // samakan dengan letak teks di layar (CSS memusatkan baris sedikit lebih rendah)
  const kiri = 47.8 * cq + geserX, lebar = W - 3 * cq - kiri, lh = 3.357 * cq;
  [...$('kta-data').querySelectorAll('dd')].forEach((dd, i) => {
    let teks = dd.textContent.toUpperCase(), k = 1;
    const set = () => { c.font = `700 ${2.84 * cq * k}px ${HURUF_KTA}`; };
    set();
    while (c.measureText(teks).width > lebar && k > 0.7) { k -= 0.05; set(); }
    while (c.measureText(teks).width > lebar && teks.length > 1) teks = `${teks.slice(0, -2)}…`;
    c.fillText(teks, kiri, 19.12 * cq + i * lh + lh / 2 + geserY);
  });
  c.font = `700 ${2.84 * cq}px ${HURUF_KTA}`;
  c.fillText($('kta-tgl').textContent, 69 * cq + geserX, 47.23 * cq + lh / 2 + geserY);
  return new Promise((ok, gagal) => kv.toBlob((b) => (b ? ok(b) : gagal(new Error('png-gagal'))), 'image/png'));
}

let pngKta = null, urlPng = '';
const pesanSimpan = (t, ok) => { $('simpan-pesan').textContent = t; $('simpan-pesan').className = 'pesan' + (ok ? ' ok' : ''); };
$('simpan-png').onclick = async () => {
  if (!qrAktif) { pesanAksi('QR belum tersedia. Periksa sinyal lalu buka ulang halaman ini.'); return; }
  const btn = $('simpan-png'); btn.disabled = true;
  try {
    pngKta = await buatPngKta();
    if (urlPng) URL.revokeObjectURL(urlPng);
    urlPng = URL.createObjectURL(pngKta);
    $('simpan-gambar').src = urlPng;
    pesanSimpan(''); $('simpan-tutup').textContent = 'Tutup';
    $('simpan-ket').textContent = diIos() ? 'Tekan Simpan ke HP, lalu pilih “Simpan Gambar” agar masuk ke Foto.'
      : diHp() ? 'Gambar akan masuk ke Galeri, album Download.'
      : 'Gambar kartu tanpa PIN, ukuran tajam untuk dicetak seukuran KTA.';
    $('simpan-ok').textContent = diHp() ? 'Simpan ke HP' : 'Unduh gambar';
    $('dlg-simpan').showModal(); $('simpan-ok').focus();
  } catch { pesanAksi('Gambar KTA belum bisa dibuat. Coba muat ulang halaman ini.'); }
  finally { btn.disabled = false; }
};
$('simpan-ok').onclick = async () => {
  const nama = `KTA-${j.nomor_anggota}.png`;
  const berkas = new File([pngKta], nama, { type: 'image/png' });
  try {
    // iPhone: menu Bagikan ("Simpan Gambar" → Foto). Android, laptop, HP lama: unduh langsung.
    let lewatBagikan = false;
    if (diIos() && navigator.canShare?.({ files: [berkas] })) {
      await navigator.share({ files: [berkas], title: `KTA ${j.nama}` }); lewatBagikan = true;
    } else {
      const a = document.createElement('a'); a.href = urlPng; a.download = nama;
      document.body.append(a); a.click(); a.remove();
    }
    pesanSimpan(lewatBagikan ? 'Selesai. Bila tadi memilih “Simpan Gambar”, KTA ada di aplikasi Foto.'
      : diHp() ? 'KTA tersimpan. Lihat di Galeri, album Download.' : 'KTA tersimpan di folder Unduhan.', true);
    $('simpan-tutup').textContent = 'Selesai';
  } catch (e) {
    if (e?.name !== 'AbortError') pesanSimpan('Gambar belum tersimpan. Coba lagi.');
  }
};
$('simpan-tutup').onclick = () => $('dlg-simpan').close();
$('dlg-simpan').addEventListener('click', (e) => { if (e.target === $('dlg-simpan')) $('dlg-simpan').close(); });
$('dlg-simpan').addEventListener('close', () => $('simpan-png').focus());

let fokusSebelum = null;
function tutupQr() { $('qr-besar').hidden = true; document.body.classList.remove('terkunci'); fokusSebelum?.focus(); }
$('perbesar').onclick = () => {
  const svg = $('kta-qr').querySelector('svg');
  if (!svg) { pesanAksi('QR belum tersedia. Periksa sinyal lalu buka ulang halaman ini.'); return; }
  fokusSebelum = document.activeElement;
  $('qr-besar-gambar').innerHTML = svg.outerHTML;
  $('qr-besar-nama').textContent = j.nama;
  $('qr-besar-nomor').textContent = j.nomor_anggota;
  $('qr-besar').hidden = false; document.body.classList.add('terkunci');
  $('tutup-qr').focus();
};
$('tutup-qr').onclick = tutupQr;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('qr-besar').hidden) tutupQr(); });

(async () => {
  try {
    const kartuAwal = await kartuSayaAwal().catch(() => null);
    const p = await profilSaya();
    const anggota = p?.peran === 'anggota';
    if (!p || !(PERAN_LIHAT_JAMAAH.includes(p.peran) || (anggota && p.jamaah_id))) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (anggota) {
      id = String(p.jamaah_id);
      $('kembali').href = '/beranda.html'; $('kembali').lastChild.textContent = ' Beranda';
      $('aksi-judul').textContent = 'Kartu saya';
      $('aksi-ket').textContent = 'Tunjukkan QR ini saat kegiatan, atau simpan kartunya ke HP. PIN tidak ikut tersimpan atau tercetak dari sini.';
      $('perbesar').className = 'btn btn-utama'; $('cetak').textContent = 'Cetak kartu';
    }
    if (!id) { pesan('Jamaah belum dipilih.'); return; }
    if (!anggota) $('kembali').href = `/jamaah-isi.html?id=${encodeURIComponent(id)}`;
    if (anggota) {
      const k = (await kartuAwal?.janji) ?? await dbKirim('POST', 'rpc/kartu_saya', {});
      terbatas = !!k?.terbatas;
      j = k && { ...k, id: p.jamaah_id, desa: { nama: k.desa, kecamatan: { nama: k.kecamatan, kabupaten: { nama: k.kabupaten } } }, mursyid: { nama: k.mursyid } };
    } else j = (await dbGet(`jamaah?select=${PILIH}&id=eq.${encodeURIComponent(id)}`))[0];
    if (!j) { pesan('Data jamaah tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
    gambarKartu();
    $('simpan-png').textContent = diHp() ? 'Simpan KTA ke HP' : 'Simpan gambar KTA';
    $('aksi').hidden = false;
    $('buat-pin').hidden = !PERAN_UBAH_JAMAAH.includes(peran) || j.wafat;
    $('ganti').hidden = !['admin_pusat', 'ketua'].includes(peran);
    if (j.wafat) pesan('Jamaah ini sudah wafat. Kartu hanya untuk arsip, PIN tidak dibuat lagi.');
    await muatQr();
  } catch (e) { tanganiGalat(e, pesan); }
})();
