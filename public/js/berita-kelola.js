// Kelola Berita (Tahap 14): pimpinan (admin pusat, ketua) melihat semua; koordinator tulisannya sendiri. Hak dicek di database.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const PER_HALAMAN = 20;
let halaman = Math.max(1, Number(q.get('h')) || 1), tunda;
const pesan = (t) => { $('pesan').textContent = t; };

function simpanUrl() {
  const p = new URLSearchParams();
  if ($('cari').value.trim()) p.set('cari', $('cari').value.trim());
  if ($('status').value) p.set('status', $('status').value);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

async function muat() {
  simpanUrl(); pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN;
    const baris = await dbKirim('POST', 'rpc/daftar_berita_kelola', {
      p_status: $('status').value || null, p_cari: $('cari').value.trim() || null, p_dari: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0);
    const jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = !!($('cari').value.trim() || $('status').value);
    $('saring-ulang').hidden = !disaring;
    const menunggu = baris.filter((b) => b.status === 'diajukan').length;
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} berita${!disaring && menunggu ? ` · ${menunggu} menunggu persetujuan` : ''}`;
    $('info-tampil').textContent = total > PER_HALAMAN ? `Menampilkan ${dari + 1}–${dari + baris.length} dari ${total.toLocaleString('id-ID')} berita` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((b, i) => `<tr data-id="${b.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${dari + i + 1}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(b.judul)}</td>
        <td data-l="Desa">${hurufAman(b.wilayah)}<span class="hp-saja"> · ${b.khusus_anggota ? 'Khusus anggota' : 'Publik'}</span></td>
        <td class="kol-luas">${b.khusus_anggota ? 'Khusus anggota' : 'Publik'}</td>
        <td data-l="Tanggal" class="angka">${tglWib(b.terbit_pada || b.diubah_pada, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td data-l="Status">${statusBeritaHtml(b.status)}</td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="tabel-kosong">${disaring ? 'Tidak ada berita yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada berita. Ketuk <strong>Tulis berita</strong> untuk mulai.'}</td></tr>`;
    $('hapus-saring')?.addEventListener('click', hapusSaring);
    $('halaman').hidden = total <= PER_HALAMAN;
    $('posisi').innerHTML = `<strong>${halaman}</strong> / ${jmlHal}<span class="sr-only"> halaman</span>`;
    $('sebelum').disabled = halaman <= 1;
    $('sesudah').disabled = halaman >= jmlHal;
  } catch (e) { $('ringkas').textContent = '–'; tanganiGalat(e, pesan); }
}

const buka = (tr) => { location.href = `/berita-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });
$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
$('status').addEventListener('change', () => { halaman = 1; muat(); });
function hapusSaring() { $('cari').value = ''; $('status').value = ''; halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
$('sebelum').onclick = () => { halaman--; muat(); scrollTo({ top: 0 }); };
$('sesudah').onclick = () => { halaman++; muat(); scrollTo({ top: 0 }); };
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_BERITA.includes(p.peran)) { location.replace('/beranda.html'); return; }
    $('cari').value = q.get('cari') || '';
    $('status').value = q.get('status') || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
