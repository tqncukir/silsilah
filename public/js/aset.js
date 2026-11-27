// Daftar Aset & Wakaf: tab Tanah wakaf / Barang inventaris (tabel tanah_wakaf, barang_inventaris; hak dijaga RLS).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
let jenis = q.get('jenis') === 'barang' ? 'barang' : 'tanah';
const SARING = ['cari', 's1', 's2', 'status'];
let tunda, ringkas = null, bolehCatat = false;

const pesan = (t) => { $('pesan').textContent = t; };
const pilihan = (obj, semua) => `<option value="">${semua}</option>` + Object.entries(obj).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const aman = (t) => encodeURIComponent(t.replace(/[*,()%.:]/g, ' ').trim());
const angka = (n) => Number(n || 0).toLocaleString('id-ID');
// Pil berwarna hanya untuk yang perlu perhatian; selebihnya teks biasa.
const kondisiTeks = (k) => k === 'baik' ? `<span class="stat stat-biasa">Baik</span>` : `<span class="stat ${k === 'rusak' ? 'stat-wafat' : 'stat-tidak'}">${KONDISI_ASET[k]}</span>`;
const sertifikatTeks = (s) => `<span class="stat ${s === 'belum_aiw' ? 'stat-tidak' : 'stat-biasa'}">${SERTIFIKAT_WAKAF[s]}</span>`;
const dilepas = '<span class="stat stat-wafat">Dilepas</span>';

const CFG = {
  tanah: {
    tabel: 'tanah_wakaf', tambah: 'Tambah tanah wakaf', cari: 'Cari nama, wakif, atau alamat',
    s1: ['Sertifikat', SERTIFIKAT_WAKAF, 'Semua', 'status_sertifikat'], s2: ['Peruntukan', PERUNTUKAN_WAKAF, 'Semua', 'peruntukan'],
    pilih: 'id,nama,luas_m2,peruntukan,status_sertifikat,kondisi,status,wakif,desa!inner(nama,kecamatan!inner(nama))',
    kolomCari: ['nama', 'wakif', 'alamat'],
    kepala: '<tr><th scope="col" class="kol-no">No</th><th scope="col">Nama</th><th scope="col">Luas</th><th scope="col">Kel/Desa</th><th scope="col">Kecamatan</th><th scope="col" class="kol-luas">Peruntukan</th><th scope="col" class="kol-luas">Wakif</th><th scope="col" class="kol-tablet">Kondisi</th><th scope="col">Sertifikat</th></tr>',
    kolom: 9,
    baris: (x) => `
      <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
      <td data-l="Nomor" class="angka">${luasTeks(x.luas_m2)}<span class="hp-saja"> · ${PERUNTUKAN_WAKAF[x.peruntukan]}${x.kondisi !== 'baik' ? ` · ${KONDISI_ASET[x.kondisi]}` : ''}</span></td>
      <td data-l="Desa">${hurufAman(x.desa.nama)}<span class="hp-saja"> · Kec. ${hurufAman(x.desa.kecamatan.nama)}</span></td>
      <td data-l="Kecamatan">${hurufAman(x.desa.kecamatan.nama)}</td>
      <td class="kol-luas">${PERUNTUKAN_WAKAF[x.peruntukan]}</td>
      <td class="kol-luas">${hurufAman(x.wakif)}</td>
      <td class="kol-tablet">${kondisiTeks(x.kondisi)}</td>
      <td data-l="Status">${x.status === 'dilepas' ? dilepas : sertifikatTeks(x.status_sertifikat)}</td>`,
    kosong: 'Belum ada tanah wakaf yang dicatat.',
  },
  barang: {
    tabel: 'barang_inventaris', tambah: 'Tambah barang', cari: 'Cari nama barang, lokasi, atau pemegang',
    s1: ['Kategori', KATEGORI_BARANG, 'Semua', 'kategori'], s2: ['Kondisi', KONDISI_ASET, 'Semua', 'kondisi'],
    pilih: 'id,nama,kategori,jumlah,nilai,lokasi_simpan,pemegang,kondisi,status',
    kolomCari: ['nama', 'lokasi_simpan', 'pemegang'],
    kepala: '<tr><th scope="col" class="kol-no">No</th><th scope="col">Nama barang</th><th scope="col">Jumlah</th><th scope="col">Lokasi simpan</th><th scope="col" class="kol-luas">Kategori</th><th scope="col" class="kol-luas">Pemegang</th><th scope="col" class="kol-tablet">Perkiraan nilai</th><th scope="col">Kondisi</th></tr>',
    kolom: 8,
    baris: (x) => `
      <td data-l="Nama" class="tabel-nama">${hurufAman(x.nama)}</td>
      <td data-l="Nomor" class="angka">${angka(x.jumlah)} unit<span class="hp-saja"> · ${KATEGORI_BARANG[x.kategori]}</span></td>
      <td data-l="Desa">${hurufAman(x.lokasi_simpan || '')}<span class="hp-saja">${x.pemegang ? `${x.lokasi_simpan ? ' · ' : ''}dipegang ${hurufAman(x.pemegang)}` : ''}</span></td>
      <td class="kol-luas">${KATEGORI_BARANG[x.kategori]}</td>
      <td class="kol-luas">${hurufAman(x.pemegang || '–')}</td>
      <td class="kol-tablet angka">${x.nilai ? rupiah(x.nilai) : '–'}</td>
      <td data-l="Status">${x.status === 'dilepas' ? dilepas : kondisiTeks(x.kondisi)}</td>`,
    kosong: 'Belum ada barang yang dicatat.',
  },
};

function simpanUrl() {
  const p = new URLSearchParams();
  if (jenis === 'barang') p.set('jenis', 'barang');
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function tampilAngka() {
  if (!ringkas) return;
  const li = (n, label) => `<li><strong>${n}</strong><span>${label}</span></li>`;
  const t = ringkas.tanah, b = ringkas.barang;
  $('angka').innerHTML = jenis === 'tanah'
    ? li(angka(t.jumlah), 'Tanah wakaf') + li(luasTeks(t.luas_m2), 'Total luas') + li(angka(t.belum_sertifikat), 'Belum bersertifikat') + li(angka(t.perlu_perhatian), 'Perlu perbaikan / rusak')
    : li(angka(b.jenis), `Jenis barang (${angka(b.unit)} unit)`) + li(rupiah(b.nilai), 'Perkiraan nilai') + li(angka(b.perlu_perhatian), 'Perlu perbaikan / rusak') + li(angka(b.dilepas), 'Sudah dilepas');
  $('angka').hidden = false;
}

function pasangTab() {
  const c = CFG[jenis];
  for (const b of document.querySelectorAll('.aset-tab [role=tab]')) {
    const aktif = b.dataset.jenis === jenis;
    b.setAttribute('aria-selected', String(aktif)); b.tabIndex = aktif ? 0 : -1;
  }
  $('isi-aset').setAttribute('aria-labelledby', `tab-${jenis}`);
  $('tambah-teks').textContent = c.tambah;
  $('tambah').href = `/aset-isi.html?jenis=${jenis}`;
  $('cari').placeholder = c.cari; $('cari-label').textContent = c.cari;
  for (const k of ['s1', 's2']) { $(`${k}-label`).textContent = c[k][0]; $(k).innerHTML = pilihan(c[k][1], c[k][2]); }
  $('kepala-tabel').innerHTML = c.kepala;
  tampilAngka();
}

async function muat() {
  simpanUrl();
  pesan('');
  $('ringkas').textContent = 'Memuat...';
  const c = CFG[jenis];
  try {
    const f = [`select=${c.pilih}`, 'order=status,nama'];
    const st = $('status').value;
    if (st !== 'semua') f.push(`status=eq.${st || 'aktif'}`);
    if ($('s1').value) f.push(`${c.s1[3]}=eq.${$('s1').value}`);
    if ($('s2').value) f.push(`${c.s2[3]}=eq.${$('s2').value}`);
    const kata = aman($('cari').value);
    if (kata) f.push(`or=(${c.kolomCari.map((k) => `${k}.ilike.*${kata}*`).join(',')})`);
    const dari = (halaman - 1) * PER_HALAMAN;
    const { baris, total } = await dbHalaman(`${c.tabel}?${f.join('&')}`, dari, dari + PER_HALAMAN - 1);
    const jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    const label = jenis === 'tanah' ? 'tanah wakaf' : 'barang';
    $('ringkas').textContent = `${angka(total)} ${label}${st === 'dilepas' ? ' dilepas' : st === 'semua' ? ' (aktif & dilepas)' : ' aktif'}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${angka(dari + 1)}–${angka(dari + baris.length)} dari ${angka(total)} · urut nama · ${PER_HALAMAN} per halaman` : '';
    $('isi-tabel').innerHTML = baris.length
      ? baris.map((x, i) => `<tr data-id="${x.id}" tabindex="0"><td data-l="No" class="angka kol-no">${angka(dari + i + 1)}</td>${c.baris(x)}</tr>`).join('')
      : `<tr><td colspan="${c.kolom}" class="tabel-kosong">${disaring
        ? 'Tidak ada yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>'
        : `${c.kosong}${bolehCatat ? ` Ketuk "${c.tambah}" untuk mulai.` : ''}`}</td></tr>`;
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

function gantiTab(j) {
  if (j === jenis) return;
  jenis = j; halaman = 1;
  for (const k of SARING) $(k).value = '';
  pasangTab(); muat();
}
const tabList = document.querySelector('.aset-tab');
tabList.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) gantiTab(b.dataset.jenis); });
tabList.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const j = jenis === 'tanah' ? 'barang' : 'tanah'; gantiTab(j); $(`tab-${j}`).focus();
});

const buka = (tr) => { location.href = `/aset-isi.html?jenis=${jenis}&id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['s1', 's2', 'status']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
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
    if (!p || !PERAN_LIHAT_ASET.includes(p.peran)) { location.replace('/beranda.html'); return; }
    bolehCatat = PERAN_CATAT_ASET.includes(p.peran);
    $('tambah').hidden = !bolehCatat;
    pasangTab();
    for (const k of SARING) $(k).value = q.get(k) || '';
    dbKirim('POST', 'rpc/ringkas_aset', {}).then((r) => { ringkas = r; tampilAngka(); }).catch(() => {});
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
