// Daftar Bantuan Sosial (rpc daftar_bantuan; nama penerima hanya ketua, bendahara, koordinator wilayahnya — dijaga database).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'status', 'jenis', 'bulan'];
let tunda, peran = '';

const pesan = (t) => { $('pesan').textContent = t; };
const akhirBulan = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const namaBulan = (ym) => new Date(ym + '-15T00:00:00Z').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function simpanUrl() {
  const p = new URLSearchParams();
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

async function muatAngka() {
  try {
    const r = await dbKirim('POST', 'rpc/ringkas_bantuan', {});
    const kotak = (n, label, sub, status) => `<li><button type="button" class="bs-kotak" data-status="${status}"><strong>${Number(n).toLocaleString('id-ID')}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</button></li>`;
    $('angka').innerHTML = kotak(r.diajukan, 'Menunggu persetujuan', peran === 'ketua' ? 'perlu keputusan Anda' : '', 'diajukan')
      + kotak(r.disetujui, 'Siap disalurkan', peran !== 'ketua' && r.disetujui ? 'perlu disalurkan' : '', 'disetujui')
      + kotak(r.disalurkan, 'Sudah disalurkan', `${rupiah(r.nilai_uang)} uang${r.nilai_barang ? ` · ± ${rupiah(r.nilai_barang)} barang` : ''}`, 'disalurkan');
    $('angka').hidden = false;
  } catch {}
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN, b = $('bulan').value;
    const baris = await dbKirim('POST', 'rpc/daftar_bantuan', {
      p_status: $('status').value || null, p_jenis: $('jenis').value || null,
      p_dari: b ? `${b}-01` : null, p_sampai: b ? akhirBulan(b) : null,
      p_cari: $('cari').value.trim() || null, p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} bantuan${$('status').value ? ` · ${STATUS_BANTUAN[$('status').value][0].toLowerCase()}` : ''}${b ? ` · diajukan ${namaBulan(b)}` : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} · yang menunggu di atas · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((x, i) => {
      const [st, kelas] = STATUS_BANTUAN[x.status];
      return `<tr data-id="${x.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}${x.wafat ? ' <span class="ps-kel">(almarhum/ah)</span>' : ''}</td>
        <td data-l="Nomor" class="angka">${x.nomor_anggota}<span class="hp-saja"> · ${tglWib(x.diajukan_pada, { day: 'numeric', month: 'short', year: 'numeric' })}</span></td>
        <td data-l="Desa"><span class="hp-saja">${hurufAman(JENIS_BANTUAN[x.jenis])}: ${hurufAman(teksBantuan(x))} · </span>${hurufAman(x.desa)}<span class="hp-saja"> · Kec. ${hurufAman(x.kecamatan)}</span></td>
        <td data-l="Kecamatan" class="kol-luas">${hurufAman(x.kecamatan)}</td>
        <td class="kol-luas">${hurufAman(JENIS_BANTUAN[x.jenis])}</td>
        <td class="bs-nilai kol-tablet">${hurufAman(teksBantuan(x))}</td>
        <td data-l="Status"><span class="stat ${kelas}">${st}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada bantuan yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : 'Belum ada bantuan. Ketuk "Ajukan bantuan" untuk mulai.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/bantuan-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });
$('angka').addEventListener('click', (e) => { const b = e.target.closest('[data-status]'); if (!b) return; $('status').value = b.dataset.status; halaman = 1; muat(); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['status', 'jenis', 'bulan']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
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
    if (!p || !PERAN_BANTUAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    peran = p.peran;
    $('jenis').innerHTML += Object.entries(JENIS_BANTUAN).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    const [y, m] = hariIniWib().split('-').map(Number);
    for (let i = 0; i < 24; i++) { const ym = new Date(Date.UTC(y, m - 1 - i, 15)).toISOString().slice(0, 7); $('bulan').add(new Option(namaBulan(ym), ym)); }
    for (const k of SARING) $(k).value = q.get(k) || '';
    muatAngka();
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
