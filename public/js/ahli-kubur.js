// Daftar Ahli Kubur (pengurus): gabungan jamaah wafat + keluarga titipan + masyayikh lewat rpc daftar_ahli_kubur.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'jenis', 'kabupaten', 'kecamatan'];
let semuaKec = [], tunda;

const pesan = (t) => { $('pesan').textContent = t; };
const tglPendek = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';

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
    const dari = (halaman - 1) * PER_HALAMAN;
    const baris = await dbKirim('POST', 'rpc/daftar_ahli_kubur', {
      p_cari: $('cari').value.trim() || null, p_jenis: $('jenis').value || null,
      p_kab: $('kabupaten').value ? Number($('kabupaten').value) : null, p_kec: $('kecamatan').value ? Number($('kecamatan').value) : null,
      p_dari: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0);
    const jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} almarhum/almarhumah${disaring ? ' cocok dengan saringan' : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((a, i) => {
      const asal = a.desa || '';
      return `<tr data-id="${hurufAman(a.kunci)}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(a.nama)}${a.bin_binti ? ` <span class="ak-bin">${hurufAman(a.bin_binti)}</span>` : ''}</td>
        <td data-l="Nomor" class="angka">${a.tanggal_wafat ? `Wafat ${tglPendek(a.tanggal_wafat)} <span class="ak-hij">· ${teksHijriah(a.tanggal_wafat)}</span>` : 'Tanggal wafat belum diketahui'}<span class="hp-saja">${a.makam ? ` · ${hurufAman(a.makam)}` : ''}</span></td>
        <td data-l="Desa">${hurufAman(asal)}${a.kecamatan ? `<span class="hp-saja"> · Kec. ${hurufAman(a.kecamatan)}</span>` : ''}${a.penghubung_nama ? `<span class="hp-saja"> · titipan ${hurufAman(a.penghubung_nama)}</span>` : ''}</td>
        <td data-l="Kecamatan">${hurufAman(a.kecamatan || '–')}</td>
        <td class="kol-luas">${hurufAman(a.makam || '–')}</td>
        <td class="kol-luas">${hurufAman(a.keluarga_penghubung || '–')}${a.penghubung_nama ? `<br><span class="ket">dititipkan ${hurufAman(a.penghubung_nama)}${a.hubungan ? ` (${hurufAman(a.hubungan)})` : ''}</span>` : ''}</td>
        <td data-l="Status"><span class="ak-jenis ak-${a.jenis}">${JENIS_AK[a.jenis]}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada ahli kubur tercatat.'}</td></tr>`;
    $('hapus-saring')?.addEventListener('click', hapusSaring);
    $('halaman').hidden = !total;
    $('posisi').innerHTML = `<strong>${halaman}</strong> / ${jmlHal}<span class="sr-only"> halaman</span>`;
    $('sebelum').disabled = halaman <= 1;
    $('sesudah').disabled = halaman >= jmlHal;
  } catch (e) { $('ringkas').textContent = '–'; tanganiGalat(e, pesan); }
}

const buka = (kunci) => { location.href = `/ahli-kubur-isi.html?kunci=${encodeURIComponent(kunci)}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) buka(tr.dataset.id); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr.dataset.id); });
$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; isiKec(); halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
$('kabupaten').addEventListener('change', () => { isiKec(); halaman = 1; muat(); });
for (const k of ['jenis', 'kecamatan']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
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
    $('tambah').hidden = !PERAN_KELOLA_AK.includes(p.peran);
    $('jenis').innerHTML += Object.entries(JENIS_AK).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const [kab, kec] = await Promise.all([dbGet('kabupaten?select=id,nama&order=nama'), dbGet('kecamatan?select=id,nama,kabupaten_id,kabupaten(nama)&order=nama')]);
    semuaKec = kec;
    $('kabupaten').innerHTML += kab.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    $('cari').value = q.get('cari') || ''; $('jenis').value = q.get('jenis') || ''; $('kabupaten').value = q.get('kabupaten') || '';
    isiKec(); $('kecamatan').value = q.get('kecamatan') || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
