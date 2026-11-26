// Cek keaslian KTA (publik, tanpa login). QR KTA baru: kode di #hash. KTA lama: pindai QR teks biasa, atau ketik Nomor Anggota + nama.
const $ = (id) => document.getElementById(id);

async function tanya(isi) {
  const r = await fetch(`${SB_URL}/functions/v1/kta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY }, body: JSON.stringify(isi),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(b.pesan || 'gagal'); e.status = r.status; e.pesan = b.pesan; throw e; }
  return b;
}

const JENIS = {
  asli: ['ok', 'KTA asli', 'Kartu ini terdaftar di SILSILAH TQN Cukir.'],
  terdaftar: ['ok', 'Terdaftar', 'Nomor dan nama cocok dengan data jamaah TQN Cukir.'],
  diganti: ['awas', 'Kartu sudah diganti', 'QR ini dari kartu lama yang sudah dibatalkan (hilang atau diganti). Minta pemilik menunjukkan kartu terbaru.'],
  palsu: ['salah', 'Tidak dikenali', 'QR ini tidak dibuat oleh SILSILAH TQN Cukir. Kartu bisa jadi palsu.'],
  tidak_cocok: ['salah', 'Tidak cocok', 'Nomor Anggota dan nama tidak cocok dengan data. Periksa lagi ejaan sesuai kartu.'],
};

function tampil(h) {
  const [kelas, tanda, ket] = JENIS[h.hasil] || JENIS.palsu;
  $('hasil').className = `cek-hasil ${kelas}`;
  $('hasil-tanda').textContent = tanda;
  $('hasil-ket').textContent = ket;
  const baris = h.nama ? [['Nomor', h.nomor], ['Nama', h.nama], ['Desa', h.desa], ['Kecamatan', h.kecamatan], ['Kab/Kota', h.kabupaten], ['Status', h.status]]
    : h.nomor ? [['Nomor', h.nomor]] : [];
  $('hasil-rincian').innerHTML = baris.map(([k, v]) => `<dt>${k}</dt><dd>${hurufAman(String(v ?? '–'))}</dd>`).join('');
  $('hasil').hidden = false;
  $('hasil').scrollIntoView({ block: 'nearest' });
}

const galat = (e) => e.status === 429 ? e.pesan : e.status === 503 ? 'Pemeriksaan KTA belum aktif. Coba lagi nanti.'
  : e.status === 400 && e.pesan ? e.pesan : 'Belum bisa memeriksa. Periksa sinyal lalu coba lagi.';

async function cekQr() {
  const kode = decodeURIComponent(location.hash.slice(1)).trim();
  if (!kode) return;
  $('ajak').textContent = 'Memeriksa QR KTA...';
  try { tampil(await tanya({ aksi: 'cek', kode })); $('ajak').textContent = 'Hasil pemeriksaan QR KTA:'; }
  catch (e) { $('ajak').textContent = ''; $('pesan').textContent = galat(e); }
}

$('nomor').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
$('form-lama').onsubmit = async (ev) => {
  ev.preventDefault();
  const nomor = $('nomor').value.trim(), nama = $('nama').value.trim();
  if (!/^\d{10}$/.test(nomor)) { $('pesan').textContent = 'Nomor Anggota harus 10 angka.'; $('nomor').focus(); return; }
  if (nama.length < 3) { $('pesan').textContent = 'Isi nama sesuai kartu.'; $('nama').focus(); return; }
  const btn = $('periksa'); btn.disabled = true; btn.classList.add('sibuk'); $('pesan').textContent = '';
  try { tampil(await tanya({ aksi: 'lama', nomor, nama })); }
  catch (e) { $('pesan').textContent = galat(e); }
  finally { btn.disabled = false; btn.classList.remove('sibuk'); }
};
$('pindai').onclick = async () => {
  const teks = await pindaiQr({ judul: 'Pindai QR KTA' });
  if (!teks) return;
  const k = bacaKta(teks);
  $('pesan').textContent = '';
  if (!k) { $('pesan').textContent = 'QR ini bukan QR KTA TQN Cukir.'; return; }
  if (k.jenis === 'baru') { if (location.hash.slice(1) === k.kode) cekQr(); else location.hash = k.kode; return; }
  $('ajak').textContent = 'Memeriksa QR KTA lama...';
  try { tampil(await tanya({ aksi: 'qrlama', teks: k.teks })); $('ajak').textContent = 'Hasil pemeriksaan QR KTA lama:'; }
  catch (e) { $('ajak').textContent = ''; $('pesan').textContent = galat(e); }
};
window.addEventListener('hashchange', cekQr);
cekQr();
