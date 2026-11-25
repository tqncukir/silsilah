// Daftar Data Jamaah: cari, saring, 10/20/50 per halaman. Hak lihat/ubah tetap dijaga RLS di database.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
let semuaDesa = [];
let tunda;

const pesan = (t) => { $('pesan').textContent = t; };
const STATUS = (j) => j.wafat ? ['Wafat', 'wafat'] : j.aktif ? ['Aktif', 'aktif'] : ['Tidak aktif', 'tidak'];

function simpanUrl() {
  const p = new URLSearchParams();
  for (const k of ['cari', 'kecamatan', 'desa', 'status']) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function isiDesa() {
  const kec = $('kecamatan').value, pilih = $('desa').value;
  $('desa').innerHTML = '<option value="">Semua</option>' + semuaDesa
    .filter((d) => !kec || String(d.kecamatan_id) === kec)
    .map((d) => `<option value="${d.id}">${hurufAman(d.nama)}</option>`).join('');
  if ([...$('desa').options].some((o) => o.value === pilih)) $('desa').value = pilih;
}

function jalurData() {
  const p = ['select=id,nomor_anggota,nama,aktif,wafat,alamat,rt_rw,umur_daftar,tanggal_lahir,pekerjaan,tanggal_daftar,mursyid(nama),desa!inner(nama,kecamatan_id,kecamatan(nama,kabupaten(nama)))', 'order=nama.asc,id.asc'];
  const cari = $('cari').value.trim();
  if (/^\d{10}$/.test(cari)) p.push(`nomor_anggota=eq.${cari}`);
  else if (cari) p.push(`nama=ilike.${encodeURIComponent('*' + cari.replace(/[*,()]/g, ' ') + '*')}`);
  if ($('desa').value) p.push(`desa_id=eq.${$('desa').value}`);
  else if ($('kecamatan').value) p.push(`desa.kecamatan_id=eq.${$('kecamatan').value}`);
  const s = $('status').value;
  if (s === 'aktif') p.push('aktif=is.true', 'wafat=is.false');
  if (s === 'tidak') p.push('aktif=is.false', 'wafat=is.false');
  if (s === 'wafat') p.push('wafat=is.true');
  return 'jamaah?' + p.join('&');
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
    const disaring = $('cari').value.trim() || $('kecamatan').value || $('desa').value || $('status').value;
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} jamaah${disaring ? ' cocok dengan saringan' : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} jamaah · ${PER_HALAMAN} orang per halaman`
      : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((j, i) => {
      const [teks, kelas] = STATUS(j);
      return `<tr data-id="${j.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nomor" class="angka"><a href="/jamaah-isi.html?id=${j.id}">${j.nomor_anggota}</a></td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(j.nama)}</td>
        <td data-l="Desa"><span class="hp-saja">${hurufAman([j.alamat, j.rt_rw && 'RT/RW ' + j.rt_rw].filter(Boolean).join(' ') + (j.alamat || j.rt_rw ? ', ' : ''))}</span>${hurufAman(j.desa.nama)}<span class="hp-saja"> · Kec. ${hurufAman(j.desa.kecamatan.nama)} · ${hurufAman(j.desa.kecamatan.kabupaten?.nama || '')}</span></td>
        <td data-l="Kecamatan">${hurufAman(j.desa.kecamatan.nama)}</td>
        <td class="kol-luas">${hurufAman(j.desa.kecamatan.kabupaten?.nama || '–')}</td>
        <td class="kol-luas">${hurufAman(j.alamat || '–')}</td>
        <td class="kol-luas angka">${hurufAman(j.rt_rw || '–')}</td>
        <td class="kol-luas angka">${j.tanggal_lahir ? hitungUmur(j.tanggal_lahir) : (j.umur_daftar ?? '–')}</td>
        <td class="kol-luas">${hurufAman(j.pekerjaan || '–')}</td>
        <td class="kol-luas">${hurufAman(j.mursyid?.nama || '–')}</td>
        <td class="kol-luas angka">${j.tanggal_daftar ? new Date(j.tanggal_daftar + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'}</td>
        <td data-l="Status"><span class="stat stat-${kelas}">${teks}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="13" class="tabel-kosong">Tidak ada jamaah yang cocok.${disaring ? ' <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : ''}</td></tr>`;
    $('hapus-saring')?.addEventListener('click', () => { for (const k of ['cari', 'kecamatan', 'status']) $(k).value = ''; isiDesa(); $('desa').value = ''; halaman = 1; muat(); });
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
  if (tr && !e.target.closest('a')) location.href = `/jamaah-isi.html?id=${tr.dataset.id}`;
});
$('isi-tabel').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && e.key === 'Enter') location.href = `/jamaah-isi.html?id=${tr.dataset.id}`;
});

$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
$('kecamatan').addEventListener('change', () => { isiDesa(); halaman = 1; muat(); });
for (const k of ['desa', 'status']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
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
    if (!p || !PERAN_LIHAT_JAMAAH.includes(p.peran)) { location.replace('/beranda.html'); return; }
    $('tambah').hidden = !PERAN_UBAH_JAMAAH.includes(p.peran);
    const [kec, desa] = await Promise.all([
      dbGet('kecamatan?select=id,nama&order=nama'),
      dbGet('desa?select=id,nama,kecamatan_id&order=nama'),
    ]);
    semuaDesa = desa;
    $('kecamatan').innerHTML += kec.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    $('cari').value = q.get('cari') || '';
    $('kecamatan').value = q.get('kecamatan') || '';
    isiDesa();
    $('desa').value = q.get('desa') || '';
    $('status').value = q.get('status') || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
