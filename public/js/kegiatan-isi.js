// Rincian, tambah, ubah, dan batalkan satu kegiatan. Hak ubah dijaga RLS (koordinator hanya kecamatannya).
const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
let data = null, peran = '', kecBoleh = null;

const pesan = (t) => { $('pesan').textContent = t; };
const pesanForm = (t) => { $('pesan-form').textContent = t; $('pesan-form').className = 'pesan'; };
const PILIH = 'id,jenis,nama,mulai,selesai,tempat,kecamatan_id,publik,dibatalkan,keterangan,kecamatan(nama,kabupaten(nama))';
const tglIsian = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA });
const jamIsian = (iso) => new Date(iso).toLocaleTimeString('sv-SE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
const bolehUbah = (k) => PERAN_KELOLA_KEGIATAN.includes(peran) && (!kecBoleh || (k.kecamatan_id && kecBoleh.has(k.kecamatan_id)));

function tampilLihat() {
  const k = data, [teks, kelas] = statusKegiatan(k);
  document.title = `${k.nama} · SILSILAH TQN Cukir`;
  $('l-jenis').textContent = JENIS_KEGIATAN[k.jenis] || k.jenis;
  $('l-nama').textContent = k.nama;
  $('l-status').textContent = teks;
  $('l-status').className = `stat ${kelas}`;
  const beda = k.selesai && tglWib(k.selesai) !== tglWib(k.mulai);
  $('l-rincian').innerHTML = [
    ['Tanggal', tglWib(k.mulai) + (beda ? ` s.d. ${tglWib(k.selesai)}` : '')],
    ['Jam', `${jamWib(k.mulai)}${k.selesai ? ` – ${jamWib(k.selesai)}` : ''} WIB`],
    ['Tempat', k.tempat],
    ['Wilayah', k.kecamatan ? `Kec. ${k.kecamatan.nama}, ${k.kecamatan.kabupaten?.nama || ''}` : 'Pusat Cukir'],
    ['Agenda umum', k.publik ? 'Tampil' : 'Tidak tampil (pengurus saja)'],
    ['Keterangan', k.keterangan],
  ].map(([a, v]) => `<div><dt>${a}</dt><dd>${v ? hurufAman(v) : '–'}</dd></div>`).join('');
  const boleh = bolehUbah(k);
  $('ubah').hidden = !boleh || k.dibatalkan;
  $('batalkan').hidden = !boleh;
  $('batalkan').textContent = k.dibatalkan ? 'Aktifkan lagi' : 'Batalkan kegiatan';
  $('ke-absen').href = `/absensi.html?kegiatan=${k.id}`;
  $('ke-absen').hidden = k.dibatalkan || !PERAN_ABSEN.includes(peran) || (kecBoleh && !(k.kecamatan_id && kecBoleh.has(k.kecamatan_id)));
  $('form').hidden = true; $('lihat').hidden = false;
  if (rekap) $('kehadiran').hidden = false;
}

function tampilForm() {
  const k = data;
  $('f-judul').textContent = k ? 'Ubah kegiatan' : 'Tambah kegiatan';
  $('jenis').value = k?.jenis || '';
  $('nama').value = k?.nama || '';
  $('tanggal').value = k ? tglIsian(k.mulai) : hariIniWib();
  $('jam-mulai').value = k ? jamIsian(k.mulai) : '';
  $('jam-selesai').value = k?.selesai ? jamIsian(k.selesai) : '';
  $('tempat').value = k?.tempat || '';
  $('wilayah').value = k ? (k.kecamatan_id ? String(k.kecamatan_id) : 'pusat') : ($('wilayah').options[0]?.value || '');
  document.querySelector(`[name=publik][value=${!k || k.publik ? 'ya' : 'tidak'}]`).checked = true;
  $('keterangan').value = k?.keterangan || '';
  pesanForm('');
  $('lihat').hidden = true; $('form').hidden = false; $('kehadiran').hidden = true;
  $('jenis').focus();
}

function salah(idEl, t) { $(idEl).setAttribute('aria-invalid', 'true'); $(idEl).focus(); pesanForm(t); }
const galatTeks = (err, dasar) => err.message === 'ditolak' || err.message === 'gagal-403' || err.detail?.code === '42501'
  ? 'Akun ini tidak punya izin mengubah kegiatan di wilayah ini.'
  : err.message === 'Failed to fetch' ? 'Sinyal terputus. Data belum tersimpan, coba lagi.' : dasar;

$('form').addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
$('ubah').onclick = tampilForm;
$('batal').onclick = () => (data ? tampilLihat() : location.assign('/kegiatan.html'));
$('keluar').onclick = keluar;
$('kembali').onclick = (e) => { if (document.referrer.includes('/kegiatan.html')) { e.preventDefault(); history.back(); } };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nama = $('nama').value.trim().replace(/\s+/g, ' ');
  const tempat = $('tempat').value.trim().replace(/\s+/g, ' ');
  const tgl = $('tanggal').value, jm = $('jam-mulai').value, js = $('jam-selesai').value;
  if (!$('jenis').value) return salah('jenis', 'Jenis kegiatan belum dipilih.');
  if (nama.length < 3) return salah('nama', 'Nama kegiatan belum diisi (minimal 3 huruf).');
  if (!tgl) return salah('tanggal', 'Tanggal belum diisi.');
  if (!jm) return salah('jam-mulai', 'Jam mulai belum diisi.');
  if (js && js <= jm) return salah('jam-selesai', 'Jam selesai harus sesudah jam mulai.');
  if (tempat.length < 3) return salah('tempat', 'Tempat belum diisi.');
  if (!$('wilayah').value) return salah('wilayah', 'Wilayah belum dipilih.');
  const wil = $('wilayah').value;
  const isi = {
    jenis: $('jenis').value, nama, tempat,
    mulai: isoWib(tgl, jm), selesai: js ? isoWib(tgl, js) : null,
    kecamatan_id: wil === 'pusat' ? null : Number(wil),
    publik: document.querySelector('[name=publik]:checked').value === 'ya',
    keterangan: $('keterangan').value.trim() || null,
  };
  const btn = $('simpan'); btn.disabled = true; btn.classList.add('sibuk'); btn.querySelector('.teks').textContent = 'Menyimpan...';
  try {
    const [hasil] = data
      ? await dbKirim('PATCH', `kegiatan?id=eq.${data.id}&select=${PILIH}`, isi)
      : await dbKirim('POST', `kegiatan?select=${PILIH}`, isi);
    if (!hasil) throw new Error('ditolak');
    data = hasil;
    history.replaceState(null, '', `?id=${hasil.id}`);
    tampilLihat();
    pesan('');
    $('lihat').insertAdjacentHTML('afterbegin', '<p class="pesan ok" role="status">Kegiatan tersimpan.</p>');
    setTimeout(() => $('lihat').querySelector('.pesan.ok')?.remove(), 5000);
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesanForm(galatTeks(err, 'Kegiatan belum tersimpan. Periksa isian lalu coba lagi.'));
  } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.querySelector('.teks').textContent = 'Simpan'; }
});

// Kegiatan tidak dihapus: dibatalkan (bisa diaktifkan lagi). Absen tidak bisa dicatat selama dibatalkan.
$('batalkan').onclick = async () => {
  const batal = !data.dibatalkan;
  if (batal && !confirm(`Batalkan "${data.nama}"?\n\nKegiatan hilang dari agenda umum dan absen tidak bisa dicatat. Bisa diaktifkan lagi.`)) return;
  const btn = $('batalkan'); btn.disabled = true;
  try {
    const [hasil] = await dbKirim('PATCH', `kegiatan?id=eq.${data.id}&select=${PILIH}`, { dibatalkan: batal });
    if (!hasil) throw new Error('ditolak');
    data = hasil; tampilLihat(); pesan('');
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') return location.replace('/masuk.html');
    pesan(galatTeks(err, 'Belum berhasil. Coba lagi.'));
  } finally { btn.disabled = false; }
};

// ===== Kehadiran (rekap + daftar hadir semua petugas + unduh CSV). Hak dicek di database (boleh_absen). =====
const CARA_TEKS = { qr_baru: 'QR baru', qr_lama: 'QR lama', ketik: 'Diketik' };
let hHal = 1, hTotal = 0, hTunda, wilayahSemua = false, rekap = null;
const H_PER = 20;
const hPesan = (t) => { $('h-pesan').textContent = t; };

function gambarWilayah() {
  const w = rekap.wilayah, tampil = wilayahSemua ? w : w.slice(0, 5), maks = w[0]?.n || 0;
  $('h-wilayah').innerHTML = tampil.length ? tampil.map((x, i) => `<li><div class="bt-baris">
      <span class="bt-nama">Kec. ${hurufAman(x.kecamatan)}, ${hurufAman(x.kabupaten)}</span>
      <span class="bt-jalur" aria-hidden="true"><span class="bt-isi" data-i="${i}"></span></span>
      <span class="bt-nilai">${Number(x.n).toLocaleString('id-ID')}</span></div></li>`).join('') : '<li class="ket">Belum ada yang hadir.</li>';
  for (const el of $('h-wilayah').querySelectorAll('.bt-isi')) el.style.width = `${maks ? Math.max(tampil[el.dataset.i].n / maks * 100, 1.5) : 0}%`;
  $('h-wilayah-semua').hidden = w.length <= 5;
  $('h-wilayah-semua').textContent = wilayahSemua ? 'Tampilkan 5 teratas' : `Lihat semua (${w.length} kecamatan)`;
}
$('h-wilayah-semua').onclick = () => { wilayahSemua = !wilayahSemua; gambarWilayah(); };

async function muatHadir() {
  hPesan('');
  try {
    const dari = (hHal - 1) * H_PER;
    const baris = await dbKirim('POST', 'rpc/daftar_hadir', { p_kegiatan_id: data.id, p_cari: $('h-cari').value.trim() || null, p_dari: dari, p_batas: H_PER });
    hTotal = Number(baris[0]?.total || 0);
    const jmlHal = Math.max(1, Math.ceil(hTotal / H_PER));
    if (hHal > jmlHal) { hHal = jmlHal; return muatHadir(); }
    $('h-isi').innerHTML = baris.length ? baris.map((b, i) => `<tr data-id="${b.jamaah_id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nomor" class="angka">${b.nomor_anggota}<span class="hp-saja"> · ${CARA_TEKS[b.cara]}</span></td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(b.nama)}</td>
        <td data-l="Desa">${hurufAman(b.desa)}<span class="hp-saja"> · Kec. ${hurufAman(b.kecamatan)}</span></td>
        <td data-l="Kecamatan">${hurufAman(b.kecamatan)}</td>
        <td class="kol-luas">${hurufAman(b.kabupaten)}</td>
        <td data-l="Status" class="angka">${jamWib(b.waktu)}</td>
        <td class="kol-luas">${CARA_TEKS[b.cara]}</td></tr>`).join('')
      : `<tr><td colspan="8" class="tabel-kosong">${$('h-cari').value.trim() ? 'Tidak ada yang cocok.' : 'Belum ada yang hadir.'}</td></tr>`;
    $('h-halaman').hidden = hTotal <= H_PER;
    $('h-posisi').innerHTML = `<strong>${hHal}</strong> / ${jmlHal}<span class="sr-only"> halaman</span>`;
    $('h-sebelum').disabled = hHal <= 1; $('h-sesudah').disabled = hHal >= jmlHal;
    $('h-unduh').disabled = !rekap?.total;
  } catch (e) { tanganiGalat(e, hPesan); }
}

async function muatKehadiran() {
  try {
    rekap = await dbKirim('POST', 'rpc/rekap_hadir', { p_kegiatan_id: data.id });
    $('h-jumlah').textContent = Number(rekap.total).toLocaleString('id-ID');
    const c = rekap.cara || {};
    $('h-sub').textContent = rekap.total ? `QR baru ${c.qr_baru || 0} · QR lama ${c.qr_lama || 0} · diketik ${c.ketik || 0}` : 'Semua petugas, terbaru di atas.';
    gambarWilayah();
    $('kehadiran').hidden = false;
    muatHadir();
  } catch (e) {
    if (e.detail?.code === '42501') return; // bukan wewenang akun ini: bagian Kehadiran tetap tersembunyi
    tanganiGalat(e, pesan);
  }
}

$('h-cari').addEventListener('input', () => { clearTimeout(hTunda); hTunda = setTimeout(() => { hHal = 1; muatHadir(); }, 300); });
$('h-saring').addEventListener('submit', (e) => e.preventDefault());
$('h-sebelum').onclick = () => { hHal--; muatHadir(); };
$('h-sesudah').onclick = () => { hHal++; muatHadir(); };
$('h-isi').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.href = `/jamaah-isi.html?id=${tr.dataset.id}`; });
$('h-isi').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') location.href = `/jamaah-isi.html?id=${tr.dataset.id}`; });

// CSV untuk Excel Indonesia: pemisah titik koma, BOM UTF-8. Nilai berawalan = + - @ diberi ' agar tidak jadi rumus.
const selCsv = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
$('h-unduh').onclick = async () => {
  const btn = $('h-unduh'); btn.disabled = true; btn.querySelector('.teks').textContent = 'Menyiapkan...';
  try {
    const semua = [];
    for (let dari = 0; ; dari += 1000) {
      const b = await dbKirim('POST', 'rpc/daftar_hadir', { p_kegiatan_id: data.id, p_dari: dari, p_batas: 1000 });
      semua.push(...b);
      if (b.length < 1000) break;
    }
    semua.reverse(); // urut waktu datang
    const tgl = new Date(data.mulai).toLocaleDateString('sv-SE', { timeZone: ZONA });
    const baris = [['No', 'Nomor Anggota', 'Nama', 'Kel/Desa', 'Kecamatan', 'Kab/Kota', 'Tanggal', 'Jam (WIB)', 'Cara']]
      .concat(semua.map((b, i) => [i + 1, b.nomor_anggota, b.nama, b.desa, b.kecamatan, b.kabupaten, tgl, jamWib(b.waktu), CARA_TEKS[b.cara]]));
    const isi = '﻿' + baris.map((r) => r.map(selCsv).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
    a.download = `hadir-${tgl}-${data.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { tanganiGalat(e, hPesan); }
  finally { btn.disabled = false; btn.querySelector('.teks').textContent = 'Unduh CSV'; }
};

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_KEGIATAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    const tugas = [dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama')];
    if (peran === 'koordinator_wilayah') tugas.push(dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`));
    if (id) tugas.push(dbGet(`kegiatan?select=${PILIH}&id=eq.${encodeURIComponent(id)}`));
    const [kec, ...lain] = await Promise.all(tugas);
    if (peran === 'koordinator_wilayah') kecBoleh = new Set(lain.shift().map((w) => w.kecamatan_id));
    $('jenis').innerHTML += Object.entries(JENIS_KEGIATAN).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    // Wilayah: admin pusat & ketua = Pusat + semua kecamatan (per Kab/Kota); koordinator = kecamatannya saja.
    const pilihan = kec.filter((k) => !kecBoleh || kecBoleh.has(k.id));
    const perKab = new Map();
    for (const k of pilihan) { const n = k.kabupaten?.nama || ''; if (!perKab.has(n)) perKab.set(n, []); perKab.get(n).push(k); }
    $('wilayah').innerHTML = (kecBoleh ? '' : '<option value="pusat">Pusat Cukir</option>') +
      [...perKab].sort(([a], [b]) => a.localeCompare(b, 'id')).map(([kab, daftar]) => `<optgroup label="${hurufAman(kab)}">${daftar.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)}</option>`).join('')}</optgroup>`).join('');
    if (id) {
      data = lain[0]?.[0];
      if (!data) { pesan('Kegiatan tidak ditemukan atau akun ini tidak punya izin melihatnya.'); return; }
      tampilLihat();
      if (PERAN_ABSEN.includes(peran)) muatKehadiran();
    } else if (PERAN_KELOLA_KEGIATAN.includes(peran)) {
      if (kecBoleh && !kecBoleh.size) { pesan('Akun koordinator ini belum diberi wilayah. Hubungi admin pusat.'); return; }
      tampilForm();
    } else location.replace('/kegiatan.html');
  } catch (e) { tanganiGalat(e, pesan); }
})();
