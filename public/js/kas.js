// Buku Kas: pilih kas, angka ringkas, daftar transaksi (rpc daftar_transaksi), saring bulan/arah/kategori/status.
// Hak lihat & catat dijaga di database; saldo berjalan hanya dikirim untuk ketua & bendahara (bisyaroh rahasia).
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const UKURAN = [10, 20, 50, 100];
let PER_HALAMAN = (() => { let n = Number(q.get('n')); try { n ||= Number(localStorage.getItem('silsilah.perHalaman')); } catch {} return UKURAN.includes(n) ? n : 20; })();
let halaman = Math.max(1, Number(q.get('h')) || 1);
const SARING = ['cari', 'bulan', 'arah', 'kategori', 'status'];
let tunda, daftarKas = [], kasId = null;

const pesan = (t) => { $('pesan').textContent = t; };
const kasIni = () => daftarKas.find((k) => k.kas_id === kasId);
const akhirBulan = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const namaBulan = (ym) => new Date(ym + '-15T00:00:00Z').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function simpanUrl() {
  const p = new URLSearchParams();
  if (kasId && daftarKas.length > 1) p.set('kas', kasId);
  for (const k of SARING) if ($(k).value.trim()) p.set(k, $(k).value.trim());
  if (PER_HALAMAN !== 20) p.set('n', PER_HALAMAN);
  if (halaman > 1) p.set('h', halaman);
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

function gambarAngka() {
  const k = kasIni();
  $('angka').hidden = !k;
  if (!k) return;
  const kotak = (n, label, sub) => `<li><strong>${n}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</li>`;
  $('angka').innerHTML = kotak(rupiah(k.saldo), 'Saldo', hurufAman(k.nama)) + kotak(rupiah(k.masuk), 'Total masuk') + kotak(rupiah(k.keluar), 'Total keluar');
  $('tambah').hidden = !k.boleh_tulis;
  $('tambah').href = `/kas-isi.html?kas=${k.kas_id}`;
}

async function muat() {
  simpanUrl();
  pesan('');
  if (!kasId) return;
  $('ringkas').textContent = 'Memuat...';
  try {
    const dari = (halaman - 1) * PER_HALAMAN, b = $('bulan').value;
    const baris = await dbKirim('POST', 'rpc/daftar_transaksi', {
      p_kas_id: kasId, p_dari: b ? `${b}-01` : null, p_sampai: b ? akhirBulan(b) : null,
      p_arah: $('arah').value || null, p_kategori_id: $('kategori').value ? Number($('kategori').value) : null,
      p_cari: $('cari').value.trim() || null, p_status: $('status').value || null, p_offset: dari, p_batas: PER_HALAMAN });
    const total = Number(baris[0]?.total || 0), jmlHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
    if (halaman > jmlHal && total) { halaman = jmlHal; return muat(); }
    const disaring = SARING.some((k) => $(k).value.trim());
    $('saring-ulang').hidden = !disaring;
    $('ringkas').textContent = `${total.toLocaleString('id-ID')} transaksi${$('status').value === 'batal' ? ' dibatalkan' : ''}${b ? ` · ${namaBulan(b)}` : ''} · ${kasIni()?.nama || ''}`;
    $('info-tampil').textContent = total
      ? `Menampilkan nomor ${(dari + 1).toLocaleString('id-ID')}–${(dari + baris.length).toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} · terbaru di atas · ${PER_HALAMAN} per halaman` : '';
    const adaSaldo = baris.some((t) => t.saldo_berjalan !== null);
    $('kol-saldo').hidden = !adaSaldo;
    $('isi-tabel').innerHTML = baris.length ? baris.map((t, i) => {
      const masuk = t.arah === 'masuk';
      const jml = `${masuk ? '+' : '−'}${rupiah(t.jumlah)}`;
      return `<tr data-id="${t.id}" tabindex="0"${t.dibatalkan ? ' class="kas-batal"' : ''}>
        <td data-l="No" class="angka kol-no">${(dari + i + 1).toLocaleString('id-ID')}</td>
        <td data-l="Nomor" class="angka">${tglWib(t.tanggal + 'T12:00:00+07:00', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}<span class="hp-saja">${t.nomor_bukti ? ` · No. ${hurufAman(t.nomor_bukti)}` : ''}</span></td>
        <td data-l="Nama" class="tabel-nama">${hurufAman(t.kategori)}${t.rahasia ? ' <span class="kas-rahasia">rahasia</span>' : ''}</td>
        <td data-l="Desa">${t.dibatalkan ? `<span class="stat stat-wafat">Dibatalkan</span> ${hurufAman(t.alasan_batal || '')}` : hurufAman(t.keterangan || '–')}</td>
        <td class="kol-luas">${hurufAman(t.nomor_bukti || '–')}</td>
        <td${masuk ? ' data-l="Status"' : ''} class="angka-kanan kas-masuk${masuk ? '' : ' kas-kosong'}">${masuk ? jml : ''}</td>
        <td${masuk ? '' : ' data-l="Status"'} class="angka-kanan kas-keluar${masuk ? ' kas-kosong' : ''}">${masuk ? '' : jml}</td>
        <td class="angka-kanan kol-saldo"${adaSaldo ? '' : ' hidden'}>${t.saldo_berjalan !== null ? rupiah(t.saldo_berjalan) : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="tabel-kosong">${disaring ? 'Tidak ada transaksi yang cocok. <button type="button" class="tautan" id="hapus-saring">Hapus saringan</button>' : kasIni()?.boleh_tulis ? 'Belum ada transaksi. Ketuk "Catat transaksi" untuk mulai.' : 'Belum ada transaksi.'}</td></tr>`;
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

const buka = (tr) => { location.href = `/kas-isi.html?id=${tr.dataset.id}`; };
$('isi-tabel').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a,button')) buka(tr); });
$('isi-tabel').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') buka(tr); });

$('saring').addEventListener('submit', (e) => e.preventDefault());
$('cari').addEventListener('input', () => { clearTimeout(tunda); tunda = setTimeout(() => { halaman = 1; muat(); }, 300); });
function hapusSaring() { for (const k of SARING) $(k).value = ''; halaman = 1; muat(); }
$('saring-ulang').onclick = hapusSaring;
for (const k of ['bulan', 'arah', 'kategori', 'status']) $(k).addEventListener('change', () => { halaman = 1; muat(); });
$('kas').addEventListener('change', () => {
  kasId = Number($('kas').value); halaman = 1;
  try { localStorage.setItem('silsilah.kas', kasId); } catch {}
  gambarAngka(); muat();
});
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
    if (!p || !PERAN_LIHAT_KAS.includes(p.peran)) { location.replace('/beranda.html'); return; }
    // Koordinator: kas kecamatannya dibuat otomatis saat pertama membuka Buku Kas.
    if (p.peran === 'koordinator_wilayah') {
      const wil = await dbGet(`pengguna_wilayah?select=kecamatan_id&user_id=eq.${await idSaya()}`);
      if (!wil.length) { pesan('Akun koordinator ini belum diberi wilayah. Hubungi admin pusat.'); $('ringkas').textContent = '–'; return; }
      await Promise.all(wil.map((w) => dbKirim('POST', 'rpc/pastikan_kas', { p_kecamatan_id: w.kecamatan_id })));
    }
    const [kas, kat] = await Promise.all([dbKirim('POST', 'rpc/saldo_kas', {}), dbGet('kategori_kas?select=id,arah,nama,rahasia&order=arah,urutan,nama')]);
    daftarKas = kas;
    if (!kas.length) { pesan('Belum ada kas yang bisa dilihat akun ini.'); $('ringkas').textContent = '–'; return; }
    let simpan = null; try { simpan = Number(localStorage.getItem('silsilah.kas')); } catch {}
    const minta = Number(q.get('kas'));
    kasId = (kas.find((k) => k.kas_id === minta) || kas.find((k) => k.kas_id === simpan) || kas[0]).kas_id;
    $('kas').innerHTML = kas.map((k) => `<option value="${k.kas_id}">${hurufAman(k.nama)}</option>`).join('');
    $('kas').value = String(kasId);
    $('kas-pilih-baris').hidden = kas.length < 2;
    // Bulan: 24 bulan terakhir (WIB)
    const [y, m] = hariIniWib().split('-').map(Number);
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 15)), ym = d.toISOString().slice(0, 7);
      $('bulan').add(new Option(namaBulan(ym), ym));
    }
    $('kategori').innerHTML += kat.filter((c) => !c.rahasia || ['ketua', 'bendahara'].includes(p.peran)).map((c) => `<option value="${c.id}">${ARAH_KAS[c.arah]}: ${hurufAman(c.nama)}</option>`).join('');
    for (const k of SARING) $(k).value = q.get(k) || '';
    gambarAngka();
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
