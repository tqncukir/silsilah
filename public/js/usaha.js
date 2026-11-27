// Direktori Usaha Jamaah (rpc daftar_usaha; semua yang login. Selain pencatat hanya usaha yang Buka — dijaga database).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'jenis', 'kabupaten', 'kecamatan', 'status'];
let semuaKec = [], tunda, pencatat = false;

const pesan = (t) => { $('pesan').textContent = t; };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');

function simpanUrl() {
  const p = new URLSearchParams();
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}
function isiKec() {
  const kab = $('kabupaten').value, pilih = $('kecamatan').value;
  $('kecamatan').innerHTML = '<option value="">Semua</option>' + semuaKec.filter((k) => !kab || String(k.kabupaten_id) === kab)
    .map((k) => `<option value="${k.id}">${hurufAman(k.nama)}${kab ? '' : ` (${hurufAman(k.kabupaten?.nama || '')})`}</option>`).join('');
  $('kecamatan').value = [...$('kecamatan').options].some((o) => o.value === pilih) ? pilih : '';
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN, st = $('status').value;
    const baris = await dbKirim('POST', 'rpc/daftar_usaha', {
      p_cari: $('cari').value.trim() || null, p_jenis: $('jenis').value || null,
      p_kab: Number($('kabupaten').value) || null, p_kec: Number($('kecamatan').value) || null,
      p_status: st === 'semua' ? null : st || 'buka', p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    $('ringkas').textContent = `${angka(total)} usaha${st === 'tutup' ? ' tutup' : st === 'semua' ? '' : ' buka'}${$('jenis').value ? ` · ${JENIS_USAHA[$('jenis').value].toLowerCase()}` : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${angka(dari + 1)}–${angka(dari + baris.length)} dari ${angka(total)} · urut wilayah · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((x, i) => {
      const jenis = hurufAman(JENIS_USAHA[x.jenis]);
      return `<tr data-id="${x.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${angka(dari + i + 1)}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
        <td data-l="Nomor">${hurufAman(x.produk || '–')}</td>
        <td class="kol-luas">${hurufAman(x.pemilik)}</td>
        <td data-l="Desa"><span class="hp-saja">${hurufAman(x.pemilik)} · </span>${hurufAman(x.desa)}<span class="hp-saja"> · Kec. ${hurufAman(x.kecamatan)}${x.jam_buka ? ` · ${hurufAman(x.jam_buka)}` : ''}</span></td>
        <td class="kol-luas">${hurufAman(x.kecamatan)}</td>
        <td class="kol-luas">${hurufAman(x.jam_buka || '–')}</td>
        <td data-l="Status">${x.status === 'tutup' ? '<span class="stat stat-tidak">Tutup</span>' : `<span class="stat stat-biasa usaha-jenis">${jenis}</span>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada usaha yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>'
      : pencatat ? 'Belum ada usaha jamaah. Ketuk "Tambah usaha" untuk mulai.' : 'Belum ada usaha jamaah yang dicatat. Punya usaha? Sampaikan ke pengurus agar dicatat.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/usaha-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; isiKec(); halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['jenis', 'kecamatan', 'status']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
$('kabupaten').addEventListener('change', () => { isiKec(); halaman = 1; muat(); });
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
    if (!p) { location.replace('/masuk.html'); return; }
    pencatat = PERAN_CATAT_USAHA.includes(p.peran);
    $('tambah').hidden = !pencatat;
    $('status-isian').hidden = !pencatat;
    $('jenis').innerHTML += Object.entries(JENIS_USAHA).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const [kab, kec] = await Promise.all([dbGet('kabupaten?select=id,nama&order=nama'), dbGet('kecamatan?select=id,nama,kabupaten_id,kabupaten(nama)&order=nama')]);
    semuaKec = kec;
    $('kabupaten').innerHTML += kab.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    for (const k of ['cari', 'jenis', 'kabupaten']) $(k).value = q.get(k) || '';
    isiKec(); $('kecamatan').value = q.get('kecamatan') || '';
    if (pencatat) $('status').value = q.get('status') || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
