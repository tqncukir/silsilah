// Daftar Jamaah Sakit (rpc daftar_sakit; rahasia: ketua, dokter, koordinator wilayahnya — dijaga database).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'status', 'kondisi', 'kabupaten', 'kecamatan'];
let semuaKec = [], tunda;

const pesan = (t) => { $('pesan').textContent = t; };
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
const tglPendek = (d) => d ? tglWib(d + 'T12:00:00+07:00', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const lamaHari = (dari, sampai) => Math.max(0, Math.round((new Date((sampai || hariIniWib()) + 'T00:00:00Z') - new Date(dari + 'T00:00:00Z')) / 864e5));

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
    const r = await dbKirim('POST', 'rpc/ringkas_kesehatan', wilayah());
    const kotak = (n, label, sub, saring) => `<li><button type="button" class="bs-kotak" data-saring="${saring}"><strong>${angka(n)}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</button></li>`;
    $('angka').innerHTML = kotak(r.sakit, 'Sedang sakit', '', 'sakit')
      + kotak(r.berat, 'Kondisi berat', '', 'berat')
      + kotak(r.rawat_inap, 'Rawat inap', '', 'sakit')
      + kotak(r.belum_dijenguk, 'Belum dijenguk', 'dari yang sedang sakit', 'sakit');
    $('angka').hidden = false;
  } catch {}
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN, st = $('status').value;
    const baris = await dbKirim('POST', 'rpc/daftar_sakit', { ...wilayah(),
      p_status: st === 'semua' ? null : st || 'sakit', p_kondisi: $('kondisi').value || null,
      p_cari: $('cari').value.trim() || null, p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    const teksSt = st === 'semua' ? 'catatan sakit' : `jamaah ${(STATUS_SAKIT[st || 'sakit']).toLowerCase()}`;
    $('ringkas').textContent = `${angka(total)} ${teksSt}${$('kondisi').value ? ` · kondisi ${KONDISI_SAKIT[$('kondisi').value][0].toLowerCase()}` : ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${angka(dari + 1)}–${angka(dari + baris.length)} dari ${angka(total)} · sedang sakit & kondisi berat di atas · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length ? baris.map((x, i) => {
      const sakit = x.status === 'sakit', [kt, kelas] = KONDISI_SAKIT[x.kondisi];
      const dirawat = x.tempat === 'rawat_inap' ? `Rawat inap${x.nama_rs ? ` · ${x.nama_rs}` : ''}` : 'Di rumah';
      const mulai = sakit ? `${tglPendek(x.mulai)} · ${lamaHari(x.mulai)} hari` : `${tglPendek(x.mulai)} – ${tglPendek(x.selesai)}`;
      const jenguk = Number(x.kunjungan) ? `${angka(x.kunjungan)} kali · terakhir ${tglPendek(x.kunjungan_terakhir)}` : 'Belum';
      const status = sakit ? `<span class="stat ${kelas}">${kt}</span>` : `<span class="stat stat-biasa${x.status === 'wafat' ? ' eko-belum' : ''}">${STATUS_SAKIT[x.status]}</span>`;
      return `<tr data-id="${x.id}" tabindex="0">
        <td data-l="No" class="angka kol-no">${angka(dari + i + 1)}</td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
        <td data-l="Nomor" class="angka">${x.nomor_anggota}<span class="hp-saja"> · ${hurufAman(dirawat)}</span></td>
        <td data-l="Desa">${hurufAman(x.desa)}<span class="hp-saja"> · Kec. ${hurufAman(x.kecamatan)} · ${sakit ? `sakit sejak ${mulai}` : mulai} · ${Number(x.kunjungan) ? `dijenguk ${angka(x.kunjungan)} kali` : 'belum dijenguk'}</span></td>
        <td data-l="Kecamatan" class="kol-luas">${hurufAman(x.kecamatan)}</td>
        <td class="kol-tablet">${hurufAman(dirawat)}</td>
        <td class="kol-luas">${mulai}</td>
        <td class="kol-luas">${Number(x.kunjungan) || !sakit ? jenguk : '<span class="stat stat-tidak">Belum</span>'}</td>
        <td data-l="Status">${status}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="9" class="tabel-kosong">${disaring ? 'Tidak ada catatan yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>'
      : 'Alhamdulillah, tidak ada jamaah yang tercatat sedang sakit.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/sakit-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });
$('angka').addEventListener('click', (e) => {
  const b = e.target.closest('[data-saring]'); if (!b) return;
  $('status').value = ''; $('kondisi').value = b.dataset.saring === 'berat' ? 'berat' : ''; halaman = 1; muat();
});

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; isiKec(); halaman = 1; muatAngka(); muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['status', 'kondisi']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
$('kabupaten').addEventListener('change', () => { isiKec(); halaman = 1; muatAngka(); muat(); });
$('kecamatan').addEventListener('change', () => { halaman = 1; muatAngka(); muat(); });
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
    if (!p || !PERAN_KESEHATAN.includes(p.peran)) { location.replace('/beranda.html'); return; }
    const [kab, kec] = await Promise.all([dbGet('kabupaten?select=id,nama&order=nama'), dbGet('kecamatan?select=id,nama,kabupaten_id,kabupaten(nama)&order=nama')]);
    semuaKec = kec;
    $('kabupaten').innerHTML += kab.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    for (const k of ['cari', 'status', 'kondisi', 'kabupaten']) $(k).value = q.get(k) || '';
    isiKec(); $('kecamatan').value = q.get('kecamatan') || '';
    muatAngka();
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
