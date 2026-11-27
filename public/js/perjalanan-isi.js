// Rincian, tambah, ubah, dan batalkan satu perjalanan Ziarah/Umroh. Hak ubah dijaga RLS (koordinator hanya kecamatannya).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, peran = '', kecBoleh = null, ringkas = null;

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan'; };
const PILIH = 'id,jenis,nama,tujuan,berangkat,pulang,tempat_kumpul,kuota,kecamatan_id,publik,dibatalkan,keterangan,kecamatan(nama,kabupaten(nama))';
const tglIsian = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA });
const tglPanjang = (ymd) => new Date(ymd + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const tambahHari = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');

// Jam kumpul 24 jam sendiri (bukan input time bawaan HP yang bisa tampil AM/PM). Menit kelipatan 5.
const dua = (n) => String(n).padStart(2, '0');
$('jam').innerHTML = '<option value="">Jam</option>' + Array.from({ length: 24 }, (_, i) => `<option>${dua(i)}</option>`).join('');
$('menit').innerHTML = Array.from({ length: 12 }, (_, i) => `<option>${dua(i * 5)}</option>`).join('');
function aturJam(hhmm) {
  const [h, m] = hhmm ? hhmm.split(':') : ['', '00'];
  if (m && ![...$('menit').options].some((o) => o.value === m)) $('menit').add(new Option(m, m));
  $('jam').value = h; $('menit').value = m || '00';
}
const bolehUbah = (k) => PERAN_KELOLA_PERJALANAN.includes(peran) && (!kecBoleh || (k.kecamatan_id && kecBoleh.has(k.kecamatan_id)));

function tampilLihat() {
  const k = data, [teks, kelas] = statusPerjalanan(k);
  document.title = `${k.nama} · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = JENIS_PERJALANAN[k.jenis] || k.jenis;
  $('l-nama').textContent = k.nama;
  $('l-status').textContent = teks;
  $('l-status').className = `stat ${kelas}`;
  const r = ringkas;
  $('l-rincian').innerHTML = [
    ['Berangkat', `${tglWib(k.berangkat)}, kumpul ${jamWib(k.berangkat)} WIB`],
    ['Pulang', k.pulang && k.pulang !== tglIsian(k.berangkat) ? tglPanjang(k.pulang) : 'Hari yang sama'],
    ['Tujuan', k.tujuan],
    ['Tempat kumpul', k.tempat_kumpul],
    ['Wilayah', k.kecamatan ? `Kec. ${k.kecamatan.nama}, ${k.kecamatan.kabupaten?.nama || ''}` : 'Pusat Cukir'],
    ['Kuota', k.kuota ? `${angka(k.kuota)} orang` : 'Tanpa batas'],
    ...(r ? [['Peserta', r.peserta ? `${angka(r.peserta)} orang (${angka(r.jamaah)} jamaah, ${angka(r.keluarga)} keluarga) · ${angka(r.lunas)} lunas, ${angka(r.peserta - r.lunas)} belum lunas${kecBoleh && !k.kecamatan_id ? ' · dari kecamatan Anda' : ''}` : 'Belum ada peserta']] : []),
    ['Tampil untuk anggota', k.publik ? 'Ya, tampil di Portal Anggota' : 'Tidak (pengurus saja)'],
    ['Keterangan', k.keterangan],
  ].map(([a, v]) => `<div><dt>${a}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
  const boleh = bolehUbah(k);
  $('ubah').hidden = !boleh || k.dibatalkan;
  $('batalkan').hidden = !boleh;
  $('batalkan').textContent = k.dibatalkan ? 'Aktifkan lagi' : 'Batalkan perjalanan';
  $('form').hidden = true; $('lihat').hidden = false;
}

function tampilForm() {
  const k = data;
  $('f-judul').textContent = k ? 'Ubah perjalanan' : 'Tambah perjalanan';
  document.querySelectorAll('[name=jenis]').forEach((r) => { r.checked = r.value === k?.jenis; });
  $('nama').value = k?.nama || '';
  $('tujuan').value = k?.tujuan || '';
  $('berangkat').value = k ? tglIsian(k.berangkat) : '';
  aturJam(k ? jamWib(k.berangkat).replace('.', ':') : '');
  $('pulang').value = k?.pulang && k.pulang !== tglIsian(k.berangkat) ? k.pulang : '';
  $('pulang').min = $('berangkat').value || hariIniWib();
  $('tempat').value = k?.tempat_kumpul || '';
  $('wilayah').value = k ? (k.kecamatan_id ? String(k.kecamatan_id) : 'pusat') : ($('wilayah').options[0]?.value || '');
  $('kuota').value = k?.kuota || '';
  document.querySelector(`[name=publik][value=${!k || k.publik ? 'ya' : 'tidak'}]`).checked = true;
  $('keterangan').value = k?.keterangan || '';
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false;
  $('nama').focus();
}

function salah(idEl, t) { const el = $(idEl) || document.querySelector(`[name=${idEl}]`); el.setAttribute('aria-invalid', 'true'); el.focus(); pesanForm(t); }
const galatTeks = (err, dasar) => err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501'
  ? 'Akun ini tidak punya izin mengubah perjalanan di wilayah ini.'
  : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : dasar;

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('berangkat').addEventListener('input', () => { $('pulang').min = $('berangkat').value || hariIniWib(); });
$('kuota').addEventListener('input', (e) => { const v = e.target.value.replace(/\D/g, ''); if (v !== e.target.value) e.target.value = v; });
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/perjalanan.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/perjalanan.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const jenis = document.querySelector('[name=jenis]:checked')?.value;
  const nama = $('nama').value.trim().replace(/\s+/g, ' ');
  const tgl = $('berangkat').value, jam = $('jam').value ? `${$('jam').value}:${$('menit').value}` : '';
  const pulang = $('pulang').value, kuota = $('kuota').value;
  if (!jenis) return salah('jenis', 'Jenis perjalanan belum dipilih (Ziarah atau Umroh).');
  if (nama.length < 3) return salah('nama', 'Nama perjalanan belum diisi (minimal 3 huruf).');
  if (!tgl) return salah('berangkat', 'Tanggal berangkat belum diisi.');
  if (!jam) return salah('jam', 'Jam kumpul belum dipilih.');
  if (pulang && pulang < tgl) return salah('pulang', 'Tanggal pulang tidak boleh sebelum tanggal berangkat.');
  if (pulang && pulang > tambahHari(tgl, 60)) return salah('pulang', 'Perjalanan paling lama 60 hari. Periksa tanggal pulang.');
  if (!$('wilayah').value) return salah('wilayah', 'Wilayah belum dipilih.');
  if (kuota && (Number(kuota) < 1 || Number(kuota) > 2000)) return salah('kuota', 'Kuota antara 1 sampai 2.000 orang, atau kosongkan.');
  if (data && kuota && ringkas && Number(kuota) < ringkas.peserta && !kecBoleh) {
    return salah('kuota', `Sudah ada ${angka(ringkas.peserta)} peserta. Kuota tidak boleh kurang dari itu.`);
  }
  const wil = $('wilayah').value;
  const isi = {
    jenis, nama, tujuan: $('tujuan').value.trim().replace(/\s+/g, ' ') || null,
    berangkat: isoWib(tgl, jam), pulang: pulang && pulang !== tgl ? pulang : null,
    tempat_kumpul: $('tempat').value.trim().replace(/\s+/g, ' ') || null,
    kecamatan_id: wil === 'pusat' ? null : Number(wil),
    kuota: kuota ? Number(kuota) : null,
    publik: document.querySelector('[name=publik]:checked').value === 'ya',
    keterangan: $('keterangan').value.trim() || null,
  };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    const [hasil] = data
      ? await dbKirim('PATCH', `perjalanan?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `perjalanan?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', '<p class="pesan ok" role="status">Perjalanan tersimpan.</p>');
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(galatTeks(err, 'Perjalanan belum tersimpan. Periksa isian lalu coba lagi.'));
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

// Perjalanan tidak dihapus: dibatalkan (bisa diaktifkan lagi). Peserta tidak bisa ditambah selama dibatalkan.
$('batalkan').onclick = async () => {
  const batal = !data.dibatalkan;
  if (batal && !confirm(`Batalkan "${data.nama}"?\n\nPeserta tidak bisa ditambah dan anggota melihat perjalanan ini dibatalkan. Daftar peserta tetap tersimpan. Bisa diaktifkan lagi.`)) return;
  const btn = $('batalkan'); btn.disabled = true;
  try {
    const [hasil] = await dbKirim('PATCH', `perjalanan?id=eq.${data.id}&select=${PILIH}`, { dibatalkan: batal });
    if (!hasil) throw new Error('ditolak');
    data = hasil; tampilLihat(); pesan('');
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesan(galatTeks(err, 'Belum berhasil. Coba lagi.'));
  } finally { btn.disabled = false; }
};

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_PERJALANAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    const tugas = [dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama')];
    if (peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(dbGet(`perjalanan?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    if (id && PERAN_PESERTA.includes(peran)) tugas.push(dbKirim('POST', 'rpc/ringkas_peserta', { p_perjalanan_id: Number(id) }).catch(() => null));
    const [kec, ...lain] = await Promise.all(tugas);
    if (peran === 'koordinator_wilayah') kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    // Wilayah: admin pusat & ketua = Pusat + semua kecamatan (per Kab/Kota); koordinator = kecamatannya saja.
    const pilihan = kec.filter((k) => !kecBoleh || kecBoleh.has(k.id));
    const perKab = new Map();
    for (const k of pilihan) { const n = k.kabupaten?.nama || ''; if (!perKab.has(n)) perKab.set(n, []); perKab.get(n).push(k); }
    $('wilayah').innerHTML = (kecBoleh ? '' : '<option value="pusat">Pusat Cukir</option>') +
      [...perKab].sort(([a], [b]) => a.localeCompare(b, 'id')).map(([kab, daftar]) => `<optgroup label="${hurufAman(kab)}">${daftar.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)}</option>`).join('')}</optgroup>`).join('');
    if (id) {
      data = lain[0]?.[0];
      ringkas = lain[1] || null;
      if (!data) { pesan('Perjalanan tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      tampilLihat();
    } else if (PERAN_KELOLA_PERJALANAN.includes(peran)) {
      if (kecBoleh && !kecBoleh.size) { pesan('Akun koordinator ini belum diberi wilayah. Hubungi admin pusat.'); return; }
      tampilForm();
    } else location.replace('/perjalanan.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
