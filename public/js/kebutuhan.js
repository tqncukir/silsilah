// Daftar Kebutuhan Khusus (rpc daftar_kebutuhan). Ketua, dokter, koordinator (wilayahnya): semua jamaah atau peserta satu
// perjalanan. Khodim: wajib pilih perjalanan, tanpa Nomor Anggota dan tanpa ubah. Hak dijaga database.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'perjalanan', 'kebutuhan', 'kabupaten', 'kecamatan'];
let semuaKec = [], tunda, khodim = false;

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
  if (khodim && !$('perjalanan').value) {
    $('ringkas').textContent = 'Pilih perjalanan';
    $('isi-tabel').innerHTML = '<tr><td colspan="7" class="tabel-kosong">Pilih perjalanan di atas untuk melihat peserta yang perlu dibantu.</td></tr>';
    $('halaman').hidden = true; $('info-tampil').textContent = '';
    return;
  }
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN;
    const baris = await dbKirim('POST', 'rpc/daftar_kebutuhan', {
      p_perjalanan_id: Number($('perjalanan').value) || null, p_kebutuhan: $('kebutuhan').value || null,
      p_kab: Number($('kabupaten').value) || null, p_kec: Number($('kecamatan').value) || null,
      p_cari: $('cari').value.trim() || null, p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => k !== 'perjalanan' && $(k).value.trim());
    $('saring-ulang').hidden = !(disaring || (!khodim && $('perjalanan').value));
    const pj = $('perjalanan').value ? $('perjalanan').selectedOptions[0].textContent : '';
    $('ringkas').textContent = `${angka(total)} jamaah perlu dibantu${pj ? ` · peserta ${pj}` : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${angka(dari + 1)}–${angka(dari + baris.length)} dari ${angka(total)} · urut wilayah · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((x, i) => `<tr data-id="${x.jamaah_id}"${khodim ? '' : ' tabindex="0"'}>
        <td data-l="No" class="angka kol-no">${angka(dari + i + 1)}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
        <td data-l="Nomor" class="keb-teks">${hurufAman(teksKebutuhan(x.kebutuhan))}${x.keterangan ? `<span class="hp-saja"> · ${hurufAman(x.keterangan)}</span>` : ''}</td>
        <td data-l="Desa">${hurufAman(x.desa)}<span class="hp-saja"> · Kec. ${hurufAman(x.kecamatan)}${x.nomor_anggota ? ` · ${x.nomor_anggota}` : ''}</span></td>
        <td class="kol-luas">${hurufAman(x.kecamatan)}</td>
        <td class="kol-luas angka">${x.nomor_anggota || '–'}</td>
        <td class="kol-luas">${hurufAman(x.keterangan || '–')}</td>
      </tr>`).join('')
      : `<tr><td colspan="7" class="tabel-kosong">${disaring ? 'Tidak ada yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>'
        : $('perjalanan').value ? 'Tidak ada peserta yang tercatat punya kebutuhan khusus.' : 'Belum ada jamaah yang dicatat kebutuhan khususnya.'}</td></tr>`;
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

const buka = (tr) => { if (khodim) return; location.href = `/kebutuhan-isi.html?jamaah=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) if (!(khodim && k === 'perjalanan')) $(k).value = ''; isiKec(); halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['perjalanan', 'kebutuhan', 'kecamatan']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
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
    if (!p || !PERAN_KEBUTUHAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    khodim = p.peran === 'khodim';
    $('tambah').hidden = khodim;
    $('tabel').classList.toggle('baca', khodim);
    if (khodim) {
      $('keterangan-hal').textContent = 'Peserta perjalanan yang perlu dibantu (kursi roda, pendamping, dll.). Pilih perjalanannya.';
      $('perjalanan').options[0].textContent = 'Pilih perjalanan';
      $('cari').placeholder = 'Cari nama';
    }
    $('kebutuhan').innerHTML += Object.entries(KEBUTUHAN_KHUSUS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const [kab, kec, pj] = await Promise.all([dbGet('kabupaten?select=id,nama&order=nama'), dbGet('kecamatan?select=id,nama,kabupaten_id,kabupaten(nama)&order=nama'),
      dbGet('perjalanan?select=id,nama,berangkat&dibatalkan=is.false&order=berangkat.desc&limit=30')]);
    semuaKec = kec;
    $('kabupaten').innerHTML += kab.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    $('perjalanan').innerHTML += pj.map((x) => `<option value="${x.id}">${hurufAman(x.nama)} (${tglWib(x.berangkat, { day: 'numeric', month: 'short', year: 'numeric' })})</option>`).join('');
    for (const k of ['cari', 'perjalanan', 'kebutuhan', 'kabupaten']) $(k).value = q.get(k) || '';
    if ($('perjalanan').value !== (q.get('perjalanan') || '')) $('perjalanan').value = '';
    isiKec(); $('kecamatan').value = q.get('kecamatan') || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
