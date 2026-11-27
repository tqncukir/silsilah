// Laporan Kas pengurus: pilih kas & tahun (rpc laporan_kas; bisyaroh tergabung kecuali ketua & bendahara), unduh CSV.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let data = null;
const pesan = (t) => { $('pesan').textContent = t; };

async function muat() {
  pesan('');
  const kas = Number($('lp-kas').value), tahun = Number($('lp-tahun').value);
  history.replaceState(null, '', `?kas=${kas}&tahun=${tahun}`);
  $('unduh').disabled = true;
  try {
    data = await dbKirim('POST', 'rpc/laporan_kas', { p_kas_id: kas, p_tahun: tahun });
    isiTahun($('lp-tahun'), data.tahun_ada, tahun);
    gambarLaporan(data);
    $('unduh').disabled = false;
  } catch (e) { tanganiGalat(e, pesan); }
}

// CSV untuk Excel Indonesia: per bulan + per bulan×kategori. Pemisah ;, BOM UTF-8, nilai = + - @ dinetralkan.
const selCsv = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
$('unduh').onclick = () => {
  const d = data, baris = [[`Laporan ${d.kas} tahun ${d.tahun}`], ['Saldo awal 1 Januari', d.saldo_awal], [],
    ['Bulan', 'Masuk', 'Keluar', 'Selisih', 'Saldo akhir bulan'],
    ...barisBulan(d).map((x) => [`${BLN_PENDEK[x.m - 1]} ${d.tahun}`, x.masuk, x.keluar, x.masuk - x.keluar, x.saldo]),
    ['Jumlah', d.masuk, d.keluar, d.masuk - d.keluar, Number(d.saldo_awal) + Number(d.masuk) - Number(d.keluar)], [],
    ['Bulan', 'Masuk/Keluar', 'Kategori', 'Jumlah'],
    ...(d.per_bulan_kategori || []).map((x) => [`${BLN_PENDEK[Number(x.b.slice(5)) - 1]} ${d.tahun}`, ARAH_KAS[x.arah], x.nama, x.jumlah])];
  const isi = '﻿' + baris.map((r) => r.map(selCsv).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
  a.download = `laporan-${d.kas.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${d.tahun}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$('lp-kas').addEventListener('change', muat);
$('lp-tahun').addEventListener('change', muat);
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_LIHAT_KAS.includes(p.peran)) { location.replace('/beranda.html'); return; }
    const kas = await dbKirim('POST', 'rpc/saldo_kas', {});
    if (!kas.length) { pesan('Belum ada kas yang bisa dilihat akun ini. Buka Buku Kas dulu.'); return; }
    let simpan = null; try { simpan = Number(localStorage.getItem('silsilah.kas')); } catch {}
    const minta = Number(q.get('kas'));
    $('lp-kas').innerHTML = kas.map((k) => `<option value="${k.kas_id}">${hurufAman(k.nama)}</option>`).join('');
    $('lp-kas').value = String((kas.find((k) => k.kas_id === minta) || kas.find((k) => k.kas_id === simpan) || kas[0]).kas_id);
    $('lp-kas-label').hidden = kas.length < 2;
    isiTahun($('lp-tahun'), [], Number(q.get('tahun')) || Number(hariIniWib().slice(0, 4)));
    muat();
  } catch (e) { tanganiGalat(e, pesan); }
})();
