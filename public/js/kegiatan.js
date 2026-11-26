// Daftar Kegiatan: cari, saring waktu/jenis/wilayah, 10/20/50/100 per halaman. Hak lihat/ubah dijaga RLS.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'waktu', 'jenis', 'wilayah'];
let tunda, hitungHadir = false;

const pesan = (t) => { $('pesan').textContent = t; };
const wilayahTeks = (k) => k.kecamatan ? `Kec. ${k.kecamatan.nama}, ${k.kecamatan.kabupaten?.nama || ''}` : 'Pusat Cukir';
function jamTeks(k) {
  const s = k.selesai && tglWib(k.selesai) === tglWib(k.mulai) ? `–${jamWib(k.selesai)}` : '';
  return `${jamWib(k.mulai)}${s} WIB`;
}

function simpanUrl() {
  const p = new URLSearchParams();
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function jalurData() {
  const awalHari = encodeURIComponent(isoWib(hariIniWib(), '00:00'));
  const w = $('waktu').value;
  const p = [`select=id,jenis,nama,mulai,selesai,tempat,publik,dibatalkan,kecamatan(nama,kabupaten(nama))${hitungHadir ? ',kehadiran(count)' : ''}`,
    w === 'lewat' || w === 'semua' ? 'order=mulai.desc,id.desc' : 'order=mulai.asc,id.asc'];
  if (!w) p.push(`mulai=gte.${awalHari}`);
  if (w === 'lewat') p.push(`mulai=lt.${awalHari}`);
  const cari = $('cari').value.trim().replace(/[*,()."]/g, ' ').trim();
  if (cari) p.push(`or=(nama.ilike.${encodeURIComponent('*' + cari + '*')},tempat.ilike.${encodeURIComponent('*' + cari + '*')})`);
  if ($('jenis').value) p.push(`jenis=eq.${$('jenis').value}`);
  const wil = $('wilayah').value;
  if (wil === 'pusat') p.push('kecamatan_id=is.null'); else if (wil) p.push(`kecamatan_id=eq.${wil}`);
  return 'kegiatan?' + p.join('&');
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN;
    const { baris, total } = await dbHalaman(jalurData(), dari, dari + PER_HALAMAN - 1);
    const jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    const w = { '': 'akan datang', lewat: 'sudah lewat', semua: 'tercatat' }[$('waktu').value];
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} kegiatan ${w}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} kegiatan · ${PER_HALAMAN} per halaman`
      : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((k, i) => {
      const [teks, kelas] = statusKegiatan(k);
      return `<tr data-id="${k.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nomor" class="angka">${tglWib(k.mulai, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${jamTeks(k)}${hitungHadir && k.kehadiran?.[0]?.count ? ` · <strong>${Number(k.kehadiran[0].count).toLocaleString('id-ID')} hadir</strong>` : ''}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(k.nama)}</td>
        <td data-l="Desa">${hurufAman(k.tempat)}<span class="hp-saja"> · ${hurufAman(wilayahTeks(k))}</span></td>
        <td data-l="Kecamatan">${hurufAman(wilayahTeks(k))}</td>
        <td class="kol-luas">${hurufAman(JENIS_KEGIATAN[k.jenis] || k.jenis)}</td>
        <td data-l="Status"><span class="stat ${kelas}">${teks}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="tabel-kosong">${disaring ? 'Tidak ada kegiatan yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada kegiatan yang akan datang.'}</td></tr>`;
    $('hapus-saring')?.addEventListener('click', hapusSaring);
    $('halaman').hidden = !total;
    $('posisi').innerHTML = `<strong>${halaman}</strong> / ${jmlHal}<span class="sr-only"> halaman</span>`;
    $('sebelum').disabled = halaman <= 1;
    $('sesudah').disabled = halaman >= jmlHal;
  } catch (e) {
    $('ringkas').textContent = '–';
    tanganiGalat(e, pesan);
  }
}

// Seluruh baris bisa diketuk
$('isi-tabel').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && !e.target.closest('a')) location.href = `/kegiatan-isi.html?id=${tr.dataset.id}`;
});
$('isi-tabel').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && e.key === 'Enter' && !e.target.closest('a')) location.href = `/kegiatan-isi.html?id=${tr.dataset.id}`;
});

$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['waktu', 'jenis', 'wilayah']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
$('sebelum').onclick = () => { halaman--; muat(); scrollTo({ top: 0 }); };
$('sesudah').onclick = () => { halaman++; muat(); scrollTo({ top: 0 }); };
$('per-halaman').value = String(PER_HALAMAN);
$('per-halaman').addEventListener('change', (e) => {
  const awal = (halaman - 1) * PER_HALAMAN;
  PER_HALAMAN = Number(e.target.value);
  try { localStorage.setItem('silsilah.perHalaman', PER_HALAMAN); } catch {}
  halaman = Math.floor(awal / PER_HALAMAN) + 1; muat();
});
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_KEGIATAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    $('tambah').hidden = !PERAN_KELOLA_KEGIATAN.includes(p.peran);
    hitungHadir = PERAN_ABSEN.includes(p.peran); // jumlah hadir hanya untuk yang berhak melihat daftar hadir (RLS)
    $('jenis').innerHTML += Object.entries(JENIS_KEGIATAN).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const kec = await dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama');
    $('wilayah').innerHTML += kec.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)} (${hurufAman(k.kabupaten?.nama || '')})</option>`).join('');
    for (const k of SARING) $(k).value = q.get(k) || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
