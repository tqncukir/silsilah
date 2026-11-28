// Tulis, ubah, setujui/tolak, tarik satu berita (Tahap 14). Semua hak dicek di database (fungsi *_berita).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, pimpinan = false, kecBoleh = null;
let fotoBaru = null, fotoDibuang = false, urlPratinjau = '';

const pesan = (t, ok) => { $('pesan').textContent = t; $('pesan').className = ok ? 'pesan ok' : 'pesan'; };
const pesanForm = (t) => { $('pesan-form').textContent = t; };
const keMasuk = (e) => { if (e.message === 'belum-masuk' || e.message === 'gagal-401') { location.replace('/masuk.html'); return true; } return false; };
function galatTeks(err, dasar) {
  if (['P0001', '22023'].includes(err.detail?.code) && err.detail.message) return err.detail.message;
  if (err.detail?.code === '42501') return err.detail.message && err.detail.message !== 'tidak berhak' ? err.detail.message : 'Akun ini tidak berhak melakukan ini.';
  if (err.message === 'bukan-gambar') return 'File ini bukan foto. Pilih foto JPG atau PNG.';
  if (err.message === 'foto-besar') return 'Foto terlalu besar meski sudah dikecilkan. Pilih foto lain.';
  if (err.message.startsWith('gagal-unggah')) return 'Foto belum terunggah. Periksa sinyal lalu coba lagi.';
  if (err.message === 'tersimpan-tidak-terbaca') return 'Berita sudah tersimpan, tapi belum bisa ditampilkan. Buka Kelola Berita untuk melihatnya.';
  if (err.detail?.message) return `${dasar} (${err.detail.code || ''} ${err.detail.message})`;
  return err.message === 'Failed to fetch' ? 'Sinyal terputus. Berita belum tersimpan, coba lagi.' : dasar;
}

async function muatData(bid) {
  const [b] = await dbKirim('POST', 'rpc/daftar_berita_kelola', { p_id: Number(bid) });
  return b || null;
}

function tampilLihat() {
  const b = data;
  document.title = `${b.judul} · SILSILAH TQN Cukir`;
  $('l-label').textContent = 'Pratinjau berita';
  $('l-judul').textContent = b.judul;
  $('l-status').innerHTML = statusBeritaHtml(b.status);
  $('l-rincian').innerHTML = [
    ['Pembaca', b.khusus_anggota ? 'Khusus anggota' : 'Publik'],
    ['Wilayah', b.wilayah],
    ['Terbit', b.terbit_pada ? `${tglWib(b.terbit_pada)} · ${jamWib(b.terbit_pada)} WIB` : null],
    ['Terakhir diubah', `${tglWib(b.diubah_pada)} · ${jamWib(b.diubah_pada)} WIB`],
    ['Alasan ditolak', b.status === 'ditolak' ? b.alasan_tolak : null],
  ].filter(([, v]) => v).map(([a, v]) => `<div${String(v).length > 28 ? ' class="penuh"' : ''}><dt>${a}</dt><dd>${hurufAman(v)}</dd></div>`).join('');
  $('l-foto').hidden = !b.foto;
  if (b.foto) { $('l-foto').src = fotoBerita(b.foto); $('l-foto').alt = `Foto: ${b.judul}`; }
  $('l-isi').innerHTML = paragrafBerita(b.isi);
  $('ubah').hidden = !b.boleh_ubah;
  $('tarik').hidden = !b.boleh_tarik;
  $('tarik').textContent = b.status === 'ditarik' ? 'Terbitkan lagi' : 'Tarik berita';
  $('putus').hidden = !b.boleh_putus;
  $('form').hidden = true; $('lihat').hidden = false;
}

function aturFotoPratinjau(src) {
  $('foto-pratinjau').hidden = !src;
  if (src) $('foto-pratinjau').src = src; else $('foto-pratinjau').removeAttribute('src');
  $('foto-hapus').hidden = !src;
}

function tampilForm() {
  const b = data, sudahTerbit = b && ['terbit', 'ditarik'].includes(b.status);
  $('f-judul').textContent = b ? 'Ubah berita' : 'Tulis berita';
  $('f-sub').textContent = pimpinan
    ? (sudahTerbit ? 'Perubahan langsung tampil pada berita yang sudah terbit.' : 'Berita dari Admin Pusat dan Ketua langsung terbit.')
    : 'Berita Anda tampil setelah disetujui ketua.';
  $('judul').value = b?.judul || '';
  $('isi').value = b?.isi || '';
  document.querySelector(`[name=pembaca][value=${b?.khusus_anggota ? 'anggota' : 'publik'}]`).checked = true;
  $('wilayah').value = b ? (b.kecamatan_id ? String(b.kecamatan_id) : 'pusat') : ($('wilayah').options[0]?.value || '');
  if (b && !$('wilayah').value) $('wilayah').value = $('wilayah').options[0]?.value || '';
  fotoBaru = null; fotoDibuang = false; $('foto').value = '';
  aturFotoPratinjau(b?.foto ? fotoBerita(b.foto) : '');
  $('simpan-draf').hidden = sudahTerbit;
  $('kirim').querySelector('.teks').textContent = sudahTerbit ? 'Simpan perubahan' : pimpinan ? 'Terbitkan' : 'Ajukan ke ketua';
  hitungIsi(); pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false;
  $('judul').focus();
}

function hitungIsi() {
  const n = $('isi').value.length;
  $('isi-hitung').textContent = n > 8000 ? `${n.toLocaleString('id-ID')}/10.000 huruf.` : '';
}
$('isi').addEventListener('input', hitungIsi);

$('foto').addEventListener('change', async () => {
  const f = $('foto').files[0];
  if (!f) return;
  pesanForm('Menyiapkan foto...');
  try {
    fotoBaru = await kecilkanFoto(f);
    fotoDibuang = false;
    if (urlPratinjau) URL.revokeObjectURL(urlPratinjau);
    urlPratinjau = URL.createObjectURL(fotoBaru);
    aturFotoPratinjau(urlPratinjau);
    pesanForm('');
  } catch (err) { fotoBaru = null; $('foto').value = ''; pesanForm(galatTeks(err, 'Foto belum bisa dipakai. Pilih foto lain.')); }
});
$('foto-hapus').onclick = () => { fotoBaru = null; fotoDibuang = true; $('foto').value = ''; aturFotoPratinjau(''); };

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }
$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));

async function simpan(kirim) {
  const judul = $('judul').value.trim().replace(/\s+/g, ' ');
  const isi = $('isi').value.trim();
  if (judul.length < 5) return salah('judul', 'Judul belum diisi (minimal 5 huruf).');
  if (isi.length < 20) return salah('isi', 'Isi berita terlalu pendek (minimal 20 huruf).');
  if (/[0-9]{10,}/.test(judul + ' ' + isi)) return salah('isi', 'Jangan menulis nomor HP atau NIK di berita.');
  if (!$('wilayah').value) return salah('wilayah', 'Wilayah belum dipilih.');
  const sudahTerbit = data && ['terbit', 'ditarik'].includes(data.status);
  if (kirim && pimpinan && !sudahTerbit && !confirm('Terbitkan berita sekarang?\n\nBerita langsung tampil untuk pembaca yang dipilih. Bisa ditarik lagi bila perlu.')) return;
  const tombol = kirim ? $('kirim') : $('simpan-draf');
  $('kirim').disabled = true; $('simpan-draf').disabled = true; tombol.classList.add('sibuk');
  let unggahan = null;
  try {
    if (fotoBaru) { pesanForm('Mengunggah foto...'); unggahan = await unggahFotoBerita(fotoBaru); }
    pesanForm('Menyimpan...');
    const foto = unggahan || (fotoDibuang ? null : data?.foto || null);
    const wil = $('wilayah').value;
    const hasil = await dbKirim('POST', 'rpc/simpan_berita', {
      p_id: data?.id ?? null, p_judul: judul, p_isi: isi, p_foto: foto,
      p_khusus_anggota: document.querySelector('[name=pembaca]:checked').value === 'anggota',
      p_kecamatan_id: wil === 'pusat' ? null : Number(wil), p_kirim: kirim });
    unggahan = null; // sudah tersimpan: foto jangan dihapus walau langkah berikutnya gagal
    if (hasil.foto_lama) hapusFotoBerita(hasil.foto_lama);
    history.replaceState(null, '', `?id=${hasil.id}`);
    const baru = await muatData(hasil.id).catch(() => null);
    // Gagal dimuat ulang: tetap pegang id-nya supaya simpan lagi memperbarui, bukan membuat berita dobel.
    if (!baru) { data = { ...(data || {}), id: hasil.id, status: hasil.status, foto }; fotoBaru = null; fotoDibuang = false; throw new Error('tersimpan-tidak-terbaca'); }
    data = baru;
    fotoBaru = null; pesanForm('');
    tampilLihat();
    pesan({ terbit: sudahTerbit ? 'Perubahan tersimpan.' : 'Berita sudah terbit.', diajukan: 'Berita diajukan. Tampil setelah disetujui ketua.',
      draf: 'Draf tersimpan. Belum tampil untuk pembaca.', ditarik: 'Perubahan tersimpan. Berita masih ditarik.' }[hasil.status] || 'Tersimpan.', true);
    scrollTo({ top: 0 });
  } catch (err) {
    if (unggahan) hapusFotoBerita(unggahan);
    if (!keMasuk(err)) pesanForm(galatTeks(err, 'Berita belum tersimpan. Periksa isian lalu coba lagi.'));
  } finally { $('kirim').disabled = false; $('simpan-draf').disabled = false; tombol.classList.remove('sibuk'); }
}
$('form').addEventListener('submit', (e) => { e.preventDefault(); simpan(true); });
$('simpan-draf').onclick = () => simpan(false);
$('ubah').onclick = () => { pesan(''); tampilForm(); };
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/berita-kelola.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (/\/berita-kelola(\.html)?([?#]|$)/.test(document.referrer)) { e.preventDefault(); history.back(); } };

async function segarkan(t) { data = await muatData(data.id); tampilLihat(); pesan(t, true); }
$('putus').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pt-setuju').disabled = true;
  try { await dbKirim('POST', 'rpc/putuskan_berita', { p_id: data.id, p_setuju: true }, 'return=minimal'); await segarkan('Berita disetujui dan sudah terbit.'); }
  catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('pt-setuju').disabled = false; }
});
$('pt-tolak').onclick = async () => {
  const alasan = $('pt-alasan').value.trim();
  if (alasan.length < 3) { $('pt-alasan').setAttribute('aria-invalid', 'true'); $('pt-alasan').focus(); pesan('Tulis alasan penolakan (minimal 3 huruf).'); return; }
  $('pt-tolak').disabled = true;
  try { await dbKirim('POST', 'rpc/putuskan_berita', { p_id: data.id, p_setuju: false, p_alasan: alasan }, 'return=minimal'); await segarkan('Berita ditolak. Koordinator bisa memperbaiki lalu mengajukan lagi.'); }
  catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum tersimpan. Coba lagi.')); }
  finally { $('pt-tolak').disabled = false; }
};
$('pt-alasan').addEventListener('input', () => $('pt-alasan').removeAttribute('aria-invalid'));
$('tarik').onclick = async () => {
  const tarik = data.status === 'terbit';
  if (tarik && !confirm(`Tarik "${data.judul}"?\n\nBerita disembunyikan dari pembaca. Bisa diterbitkan lagi.`)) return;
  $('tarik').disabled = true;
  try { await dbKirim('POST', 'rpc/tarik_berita', { p_id: data.id, p_tarik: tarik }, 'return=minimal'); await segarkan(tarik ? 'Berita ditarik.' : 'Berita terbit lagi.'); }
  catch (err) { if (!keMasuk(err)) pesan(galatTeks(err, 'Belum berhasil. Coba lagi.')); }
  finally { $('tarik').disabled = false; }
};

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_BERITA.includes(p.peran)) { location.replace('/beranda.html'); return; }
    pimpinan = PERAN_PIMPINAN_BERITA.includes(p.peran);
    const tugas = [dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama')];
    if (!pimpinan) tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(muatData(id));
    const [kec, ...lain] = await Promise.all(tugas);
    if (!pimpinan) kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    // Wilayah: pimpinan = Pusat + semua kecamatan (per Kab/Kota); koordinator = kecamatannya saja.
    const perKab = new Map();
    for (const k of kec.filter((k) => !kecBoleh || kecBoleh.has(k.id))) { const n = k.kabupaten?.nama || ''; if (!perKab.has(n)) perKab.set(n, []); perKab.get(n).push(k); }
    $('wilayah').innerHTML = (kecBoleh ? '' : '<option value="pusat">Pusat Cukir</option>') +
      [...perKab].sort(([a], [b]) => a.localeCompare(b, 'id')).map(([kab, d]) => `<optgroup label="${hurufAman(kab)}">${d.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)}</option>`).join('')}</optgroup>`).join('');
    if (id) {
      data = lain[0];
      if (!data) { pesan('Berita tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      tampilLihat();
    } else {
      if (kecBoleh && !kecBoleh.size) { pesan('Akun koordinator ini belum diberi wilayah. Hubungi admin pusat.'); return; }
      tampilForm();
    }
  } catch (e) { tanganiGalat(e, pesan); }
})();
