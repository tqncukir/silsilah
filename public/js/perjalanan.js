// Daftar Ziarah & Umroh: cari, saring waktu/jenis/wilayah, 10/20/50/100 per halaman. Hak lihat/ubah dijaga RLS.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'waktu', 'jenis', 'wilayah'];
let tunda, hitungPeserta = false;

const pesan = (t) => { $('pesan').textContent = t; };
const wilayahTeks = (k) => k.kecamatan ? `Kec. ${k.kecamatan.nama}, ${k.kecamatan.kabupaten?.nama || ''}` : 'Pusat Cukir';

function simpanUrl() {
  const p = new URLSearchParams();
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

// Akan datang = berangkat hari ini atau sesudahnya, ATAU tanggal pulang belum lewat.
function jalurData() {
  const hari = hariIniWib(), awal = isoWib(hari, '00:00'), w = $('waktu').value;
  const syarat = [];
  if (!w) syarat.push(`or(berangkat.gte.${awal},pulang.gte.${hari})`);
  if (w === 'lewat') syarat.push(`berangkat.lt.${awal}`, `or(pulang.is.null,pulang.lt.${hari})`);
  const cari = $('cari').value.trim().replace(/[*,()."\\:]/g, ' ').trim();
  if (cari) syarat.push(`or(nama.ilike."*${cari}*",tujuan.ilike."*${cari}*",tempat_kumpul.ilike."*${cari}*")`);
  const p = [`select=id,jenis,nama,tujuan,berangkat,pulang,tempat_kumpul,kuota,dibatalkan,kecamatan(nama,kabupaten(nama))${hitungPeserta ? ',peserta_perjalanan(count)' : ''}`,
    w ? 'order=berangkat.desc,id.desc' : 'order=berangkat.asc,id.asc'];
  if (hitungPeserta) p.push('peserta_perjalanan.batal=is.false');
  if (syarat.length) p.push('and=' + encodeURIComponent(`(${syarat.join(',')})`));
  if ($('jenis').value) p.push(`jenis=eq.${$('jenis').value}`);
  const wil = $('wilayah').value;
  if (wil === 'pusat') p.push('kecamatan_id=is.null'); else if (wil) p.push(`kecamatan_id=eq.${encodeURIComponent(wil)}`);
  return 'perjalanan?' + p.join('&');
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
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} perjalanan ${w}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} perjalanan · ${PER_HALAMAN} per halaman`
      : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((k, i) => {
      const [teks, kelas] = statusPerjalanan(k);
      const n = hitungPeserta ? Number(k.peserta_perjalanan?.[0]?.count || 0) : null;
      return `<tr data-id="${k.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nomor" class="angka">${waktuPerjalanan(k)}${n ? ` · <strong>${n.toLocaleString('id-ID')} peserta</strong>` : ''}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(k.nama)}</td>
        <td data-l="Desa"><span class="hp-saja">${hurufAman(JENIS_PERJALANAN[k.jenis] || k.jenis)} · </span>${hurufAman(k.tujuan || '–')}<span class="hp-saja"> · ${hurufAman(wilayahTeks(k))}</span></td>
        <td data-l="Kecamatan">${hurufAman(wilayahTeks(k))}</td>
        <td class="kol-luas">${hurufAman(JENIS_PERJALANAN[k.jenis] || k.jenis)}</td>
        <td data-l="Status"><span class="stat ${kelas}">${teks}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="tabel-kosong">${disaring ? 'Tidak ada perjalanan yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada perjalanan yang akan datang.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/perjalanan-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
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
    if (!p || !PERAN_LIHAT_PERJALANAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    $('tambah').hidden = !PERAN_KELOLA_PERJALANAN.includes(p.peran);
    hitungPeserta = PERAN_PESERTA.includes(p.peran); // jumlah peserta hanya untuk yang berhak melihat peserta (RLS)
    $('jenis').innerHTML += Object.entries(JENIS_PERJALANAN).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const kec = await dbGet('kecamatan?select=id,nama,kabupaten(nama)&order=nama');
    $('wilayah').innerHTML += kec.map((k) => `<option value="${k.id}">Kec. ${hurufAman(k.nama)} (${hurufAman(k.kabupaten?.nama || '')})</option>`).join('');
    for (const k of SARING) $(k).value = q.get(k) || '';
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
