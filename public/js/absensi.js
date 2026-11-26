// Absensi kegiatan: petugas memindai KTA jamaah beruntun (QR lama/baru) atau mengetik Nomor Anggota.
// Hak dan batas waktu dijaga fungsi catat_hadir di database. Daftar "dicatat dari HP ini" disimpan di sessionStorage.
const $ = (id) => document.getElementById(id);
const kegId = new URLSearchParams(location.search).get('kegiatan');
const KUNCI = `silsilah.absen.${kegId}`;
const CARA = { qr_baru: 'QR baru', qr_lama: 'QR lama', ketik: 'diketik' };
let keg = null, peran = '', catatan = [];

const pesan = (t) => { $('pesan').textContent = t; };
function simpanCatatan() { try { sessionStorage.setItem(KUNCI, JSON.stringify(catatan.slice(0, 300))); } catch {} }
function muatCatatan() { try { catatan = JSON.parse(sessionStorage.getItem(KUNCI)) || []; } catch { catatan = []; } }

function tampilDaftar() {
  $('d-ket').textContent = catatan.length ? `${catatan.length.toLocaleString('id-ID')} orang. Salah catat? Ketuk Batal.` : 'Belum ada yang dicatat dari HP ini.';
  $('d-daftar').innerHTML = catatan.map((c, i) => `<li>
      <span class="absen-urut">${(catatan.length - i).toLocaleString('id-ID')}.</span>
      <span class="absen-isi"><strong>${hurufAman(c.nama)}</strong>
        <span class="ket">${hurufAman(c.desa)} · ${jamWib(c.waktu)} · ${CARA[c.cara] || ''}</span></span>
      <button type="button" class="tautan" data-batal="${c.jamaah_id}" aria-label="Batalkan hadir ${hurufAman(c.nama)}">Batal</button>
    </li>`).join('');
}

// Hasil catat_hadir -> kalimat untuk petugas. kelas: ok | ingat | galat
function artikan(h) {
  const siapa = h.nama ? `${h.nama} · ${h.desa}` : '';
  switch (h.hasil) {
    case 'hadir': return { kelas: 'ok', teks: `Hadir: ${siapa}` };
    case 'sudah': return { kelas: 'ingat', teks: `Sudah tercatat jam ${jamWib(h.waktu)}: ${siapa}` };
    case 'tidak_dikenal': return { kelas: 'galat', teks: `Nomor ${h.nomor} tidak terdaftar. Periksa nomornya.` };
    case 'tidak_aktif': return { kelas: 'galat', teks: `${siapa} berstatus tidak aktif. Tidak dicatat; hubungi pengurus.` };
    case 'wafat': return { kelas: 'galat', teks: `${siapa} tercatat wafat. Tidak dicatat.` };
    case 'kartu_diganti': return { kelas: 'galat', teks: `Kartu ini sudah diganti (dilaporkan hilang): ${siapa}. Tidak dicatat.` };
    default: return { kelas: 'galat', teks: 'Hasil tidak dikenal. Coba lagi.' };
  }
}

function galatTeks(e) {
  if (e.message === 'Failed to fetch') return 'Sinyal terputus. Belum tercatat, pindai atau catat lagi.';
  if (e.detail?.code === 'P0001' && e.detail.message) return e.detail.message; // pesan dari database (mis. di luar waktu)
  if (e.detail?.code === '42501' || e.message === 'gagal-403') return 'Akun ini tidak berhak mencatat absen kegiatan ini.';
  return 'Belum tercatat. Coba lagi.';
}

async function catat(nomor, cara, versi = null) {
  try {
    const h = await dbKirim('POST', 'rpc/catat_hadir', { p_kegiatan_id: Number(kegId), p_nomor: Number(nomor), p_cara: cara, p_versi: versi });
    if (h.jumlah != null) $('a-jumlah').textContent = Number(h.jumlah).toLocaleString('id-ID');
    if (h.hasil === 'hadir') {
      catatan.unshift({ jamaah_id: h.jamaah_id, nama: h.nama, desa: h.desa, waktu: h.waktu, cara });
      simpanCatatan(); tampilDaftar();
    }
    return artikan(h);
  } catch (e) {
    if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); throw e; }
    return { kelas: 'galat', teks: galatTeks(e) };
  }
}

function tampilHasil(h) {
  $('hasil').textContent = h.teks;
  $('hasil').className = 'pesan' + (h.kelas === 'ok' ? ' ok' : h.kelas === 'ingat' ? ' ingat' : '');
}

// Isi QR -> catat. QR baru: "1-<nomor>-<versi>-<tanda>" (tanda tangan tidak dicek, keputusan Kang); QR lama: nomor di depan.
async function dariQr(teks) {
  const k = bacaKta(teks);
  if (!k) return { teks: 'Ini bukan QR KTA TQN Cukir.', kelas: 'pindai-galat' };
  const h = k.jenis === 'baru'
    ? await catat(k.kode.split('-')[1], 'qr_baru', Number(k.kode.split('-')[2]))
    : await catat(k.nomor, 'qr_lama');
  tampilHasil(h);
  return { teks: h.teks, kelas: { ok: 'pindai-ok', ingat: 'pindai-ingat', galat: 'pindai-galat' }[h.kelas] };
}

$('pindai').onclick = async () => {
  await pindaiQr({ judul: `Absen: ${keg.nama.length > 28 ? keg.nama.slice(0, 27) + '…' : keg.nama}`, ket: 'Arahkan kamera ke QR di kartu. Kartu berikutnya bisa langsung dipindai.', beruntun: dariQr });
};

$('ketik').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('nomor').value.replace(/\D/g, '');
  if (n.length !== 10) { $('nomor').setAttribute('aria-invalid', 'true'); tampilHasil({ kelas: 'galat', teks: 'Nomor Anggota harus 10 angka.' }); $('nomor').focus(); return; }
  const btn = $('catat'); btn.disabled = true;
  const h = await catat(n, 'ketik');
  btn.disabled = false;
  tampilHasil(h);
  if (h.kelas !== 'galat') $('nomor').value = '';
  $('nomor').focus();
});
$('nomor').addEventListener('input', () => $('nomor').removeAttribute('aria-invalid'));

$('d-daftar').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-batal]');
  if (!b) return;
  const c = catatan.find((x) => String(x.jamaah_id) === b.dataset.batal);
  if (!c || !confirm(`Batalkan hadir ${c.nama}?\n\nNamanya dihapus dari daftar hadir kegiatan ini. Bisa dicatat lagi dengan memindai ulang.`)) return;
  b.disabled = true;
  try {
    await dbKirim('POST', 'rpc/batal_hadir', { p_kegiatan_id: Number(kegId), p_jamaah_id: c.jamaah_id }, 'return=minimal');
    catatan = catatan.filter((x) => x !== c); simpanCatatan(); tampilDaftar();
    tampilHasil({ kelas: 'ingat', teks: `Hadir ${c.nama} dibatalkan.` });
    muatJumlah();
  } catch (err) {
    b.disabled = false;
    tampilHasil({ kelas: 'galat', teks: err.detail?.code === '42501' ? 'Hanya bisa membatalkan yang dicatat akun ini hari ini.' : galatTeks(err) });
  }
});

async function muatJumlah() {
  try { const { total } = await dbHalaman(`kehadiran?select=jamaah_id&kegiatan_id=eq.${Number(kegId)}`, 0, 0); $('a-jumlah').textContent = total.toLocaleString('id-ID'); } catch {}
}

// Pengingat di luar waktu absen (petugas & koordinator: 3 jam sebelum s.d. 12 jam sesudah). Database tetap yang memutuskan.
function aturIngat() {
  const awal = new Date(keg.mulai).getTime() - 3 * 3600e3, akhir = new Date(keg.selesai || keg.mulai).getTime() + 12 * 3600e3;
  let t = '';
  if (keg.dibatalkan) t = 'Kegiatan ini dibatalkan. Absen tidak bisa dicatat.';
  else if (!['admin_pusat', 'ketua'].includes(peran) && (Date.now() < awal || Date.now() > akhir))
    t = Date.now() < awal ? `Absen dibuka mulai ${tglWib(new Date(awal).toISOString(), { day: 'numeric', month: 'long' })} jam ${jamWib(new Date(awal).toISOString())} WIB.` : 'Waktu absen kegiatan ini sudah lewat.';
  $('a-ingat').textContent = t;
  $('a-aksi').hidden = keg.dibatalkan;
}

async function tampilPilih() {
  const awal = isoWib(hariIniWib(), '00:00');
  const besok = new Date(new Date(awal).getTime() + 24 * 3600e3).toISOString();
  const daftar = await dbGet(`kegiatan?select=id,nama,mulai,tempat&dibatalkan=is.false&mulai=gte.${encodeURIComponent(awal)}&mulai=lt.${encodeURIComponent(besok)}&order=mulai.asc`);
  $('p-daftar').innerHTML = daftar.length
    ? daftar.map((k) => `<li><a class="menu-ubin" href="/absensi.html?kegiatan=${k.id}"><span><strong>${hurufAman(k.nama)}</strong><span class="menu-ket">${jamWib(k.mulai)} WIB · ${hurufAman(k.tempat)}</span></span></a></li>`).join('')
    : '<li class="ket">Tidak ada kegiatan hari ini. <a href="/kegiatan.html">Lihat semua kegiatan</a>.</li>';
  $('pilih').hidden = false;
}

$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_ABSEN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    if (!kegId || !/^\d+$/.test(kegId)) { $('kembali').href = '/beranda.html'; $('kembali-teks').textContent = 'Beranda'; await tampilPilih(); return; }
    [keg] = await dbGet(`kegiatan?select=id,jenis,nama,mulai,selesai,tempat,dibatalkan&id=eq.${Number(kegId)}`);
    if (!keg) { pesan('Kegiatan tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
    document.title = `Absensi ${keg.nama} · SILSILAH TQN Cukir`;
    $('kembali').href = `/kegiatan-isi.html?id=${keg.id}`; $('kembali-teks').textContent = 'Rincian kegiatan';
    $('a-jenis').textContent = `Absensi · ${JENIS_KEGIATAN[keg.jenis] || keg.jenis}`;
    $('a-nama').textContent = keg.nama;
    $('a-waktu').textContent = `${tglWib(keg.mulai)} · ${jamWib(keg.mulai)} WIB · ${keg.tempat}`;
    aturIngat();
    muatCatatan(); tampilDaftar();
    $('absen').hidden = false;
    muatJumlah();
  } catch (e) { tanganiGalat(e, pesan); }
})();
