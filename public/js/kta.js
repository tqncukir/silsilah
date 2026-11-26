// KTA Digital: kartu seperti asli, QR keaslian (ditandatangani di server dengan kunci admin pusat), PIN, cetak.
const $ = (id) => document.getElementById(id);
let id = new URLSearchParams(location.search).get('id');
let j = null, peran = '', terbatas = false;

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
  qr.make();
  $('kta-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

async function muatQr() {
  if (terbatas) { qrLama(); return; }
  $('kta-qr').textContent = 'Memuat QR...';
  try {
    const { kode, versi } = await panggilKta({ aksi: 'qr', jamaah_id: j.id });
    const qr = qrcode(0, 'M');
    qr.addData(`${location.origin}/cek-kta.html#${kode}`);
    qr.make();
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
  if (!confirm('Buat PIN baru untuk kartu ini?\n\nPIN lama (kalau ada) langsung tidak berlaku. PIN baru hanya tampil sekali, jadi langsung dicetak.')) return;
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
  if (!confirm('Batalkan QR di kartu lama?\n\nPakai ini kalau KTA hilang atau dicuri. QR di kartu lama langsung tidak berlaku, lalu cetak kartu baru.')) return;
  try {
    const v = await dbKirim('POST', 'rpc/ganti_kta', { p_jamaah_id: j.id });
    await muatQr();
    pesanAksi(`QR kartu lama sudah dibatalkan. Ini kartu ke-${v}, silakan cetak.`, true);
  } catch (e) {
    pesanAksi(e.detail?.code === '42501' || e.message === 'gagal-403' ? 'Hanya admin pusat dan ketua yang bisa membatalkan kartu.' : 'Belum berhasil. Coba lagi.');
  }
};

$('keluar').onclick = keluar;

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
      $('aksi-ket').textContent = 'Tunjukkan QR ini saat kegiatan, atau cetak kartunya. PIN tidak ikut tercetak dari sini.';
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
    $('aksi').hidden = false;
    $('buat-pin').hidden = !PERAN_UBAH_JAMAAH.includes(peran) || j.wafat;
    $('ganti').hidden = !['admin_pusat', 'ketua'].includes(peran);
    if (j.wafat) pesan('Jamaah ini sudah wafat. Kartu hanya untuk arsip, PIN tidak dibuat lagi.');
    await muatQr();
  } catch (e) { tanganiGalat(e, pesan); }
})();
