// Daftar Kondisi Ekonomi Jamaah (rpc daftar_ekonomi; rahasia: ketua, bendahara, koordinator wilayahnya — dijaga database).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'tingkat', 'dibantu', 'kabupaten', 'kecamatan'];
let semuaKec = [], tunda;

const pesan = (t) => { $('pesan').textContent = t; };
const tglPendek = (d) => d ? tglWib(d + 'T12:00:00+07:00', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
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
const wilayah = () => ({ p_kab: Number($('kabupaten').value) || null, p_kec: Number($('kecamatan').value) || null });

async function muatAngka() {
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_ekonomi', wilayah());
    const kotak = (n, label, sub, tingkat) => `<li><button type="button" class="bs-kotak" data-tingkat="${tingkat}"><strong>${angka(n)}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</button></li>`;
    $('angka').innerHTML = kotak(r.sangat_kurang, 'Sangat kurang mampu', '', 'sangat_kurang')
      + kotak(r.kurang, 'Kurang mampu', '', 'kurang')
      + kotak(Number(r.cukup) + Number(r.mampu), 'Cukup & mampu', '', 'cukup')
      + kotak(r.belum, 'Belum didata', `dari ${angka(r.jamaah)} jamaah aktif`, 'belum');
    $('angka').hidden = false;
    $('ringkas').dataset.tambah = Number(r.kurang_belum_dibantu)
      ? ` · ${angka(r.kurang_belum_dibantu)} kurang mampu belum pernah dibantu` : '';
  } catch { $('ringkas').dataset.tambah = ''; }
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN, t = $('tingkat').value;
    const baris = await dbKirim('POST', 'rpc/daftar_ekonomi', { ...wilayah(),
      p_tingkat: t && t !== 'belum' ? t : null, p_belum: t === 'belum', p_belum_dibantu: $('dibantu').value === 'belum',
      p_cari: $('cari').value.trim() || null, p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    const teksT = t === 'belum' ? 'belum didata' : t ? TINGKAT_EKONOMI[t][0].toLowerCase() : '';
    $('ringkas').textContent = `${angka(total)} jamaah aktif${teksT ? ` · ${teksT}` : ''}${$('dibantu').value ? ' · belum pernah dibantu' : ''}${disaring ? '' : $('ringkas').dataset.tambah || ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${angka(dari + 1)}–${angka(dari + baris.length)} dari ${angka(total)} · paling kurang mampu di atas · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((x, i) => {
      const [kt, kelas] = x.tingkat ? TINGKAT_EKONOMI[x.tingkat] : ['Belum didata', 'stat-biasa eko-belum'];
      const ktHtml = kt.replace(/^Sangat kurang mampu$/, 'Sangat kurang<span class="eko-panjang"> mampu</span>');
      const bantu = Number(x.dibantu) ? `${angka(x.dibantu)} kali · terakhir ${tglPendek(x.dibantu_terakhir)}` : 'Belum pernah';
      return `<tr data-id="${x.jamaah_id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${angka(dari + i + 1)}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
        <td data-l="Nomor" class="angka">${x.nomor_anggota}<span class="hp-saja">${x.tingkat ? ` · ${angka(x.tanggungan)} tanggungan` : ''}</span></td>
        <td data-l="Desa">${hurufAman(x.desa)}<span class="hp-saja"> · Kec. ${hurufAman(x.kecamatan)} · ${Number(x.dibantu) ? `dibantu ${angka(x.dibantu)} kali` : 'belum pernah dibantu'}</span></td>
        <td data-l="Kecamatan" class="kol-luas">${hurufAman(x.kecamatan)}</td>
        <td class="angka kol-tablet">${x.tingkat ? angka(x.tanggungan) : '–'}</td>
        <td class="kol-luas">${bantu}</td>
        <td data-l="Status"><span class="stat ${kelas}">${ktHtml}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada jamaah yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada jamaah aktif di wilayah ini.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/ekonomi-isi.html?jamaah=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });
$('angka').addEventListener('click', (e) => { const b = e.target.closest('[data-tingkat]'); if (!b) return; $('tingkat').value = b.dataset.tingkat; halaman = 1; muat(); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; isiKec(); halaman = 1; muatAngka().then(muat); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['tingkat', 'dibantu']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
$('kabupaten').addEventListener('change', () => { isiKec(); halaman = 1; muatAngka().then(muat); });
$('kecamatan').addEventListener('change', () => { halaman = 1; muatAngka().then(muat); });
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
    if (!p || !PERAN_EKONOMI.includes(p.peran)) { location.replace('/beranda.html'); return; }
    const [kab, kec] = await Promise.all([dbGet('kabupaten?select=id,nama&order=nama'), dbGet('kecamatan?select=id,nama,kabupaten_id,kabupaten(nama)&order=nama')]);
    semuaKec = kec;
    $('kabupaten').innerHTML += kab.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    for (const k of ['cari', 'tingkat', 'dibantu', 'kabupaten']) $(k).value = q.get(k) || '';
    isiKec(); $('kecamatan').value = q.get('kecamatan') || '';
    await muatAngka();
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
