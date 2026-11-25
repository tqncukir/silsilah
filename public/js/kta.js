// KTA Digital: kartu seperti asli, QR keaslian (ditandatangani di server dengan kunci admin pusat), PIN, cetak.
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let j = null, peran = '';

const pesan = (t) => { $('pesan').textContent = t; };
const pesanAksi = (t, ok) => { $('pesan-aksi').textContent = t; $('pesan-aksi').className = 'pesan' + (ok ? ' ok' : ''); };
const tgl = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
const PILIH = 'id,nomor_anggota,nama,umur_daftar,pekerjaan,tanggal_daftar,aktif,wafat,desa(nama,kecamatan(nama,kabupaten(nama))),mursyid(nama)';

function gambarKartu() {
  const baris = [
    ['Nomor', j.nomor_anggota, 'kta-nomor'], ['Nama', j.nama, 'kta-nama'],
    ['Umur', j.umur_daftar ? `${j.umur_daftar} tahun` : '–'], ['Pekerjaan', j.pekerjaan || '–'],
    ['Desa', j.desa.nama], ['Kecamatan', j.desa.kecamatan.nama], ['Kab/Kota', j.desa.kecamatan.kabupaten?.nama || '–'],
    ['Mursyid', j.mursyid?.nama || '–'], ['Terdaftar', tgl(j.tanggal_daftar)],
  ];
  $('kta-data').innerHTML = baris.map(([k, v, c]) => `<dt>${k}</dt><dd${c ? ` class="${c}"` : ''}>${hurufAman(String(v))}</dd>`).join('');
  $('kartu').hidden = false;
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

async function muatQr() {
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

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (!id) { pesan('Jamaah belum dipilih.'); return; }
    $('kembali').href = `/jamaah-isi.html?id=${encodeURIComponent(id)}`;
    j = (await dbGet(`jamaah?select=${PILIH}&id=eq.${encodeURIComponent(id)}`))[0];
    if (!j) { pesan('Data jamaah tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
    gambarKartu();
    $('aksi').hidden = false;
    $('buat-pin').hidden = !PERAN_UBAH_JAMAAH.includes(peran) || j.wafat;
    $('ganti').hidden = !['admin_pusat', 'ketua'].includes(peran);
    if (j.wafat) pesan('Jamaah ini sudah wafat. Kartu hanya untuk arsip, PIN tidak dibuat lagi.');
    await muatQr();
  } catch (e) { tanganiGalat(e, pesan); }
})();
