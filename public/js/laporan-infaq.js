// Laporan Infaq publik (tanpa login): rpc kas_publik + laporan_publik dengan kunci publik saja.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const pesan = (t) => { $('pesan').textContent = t; };

async function rpcPublik(fn, isi) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(isi) });
  if (!r.ok) throw new Error('gagal-' + r.status);
  return r.json();
}

async function muat() {
  pesan('');
  const kas = Number($('lp-kas').value) || null, tahun = Number($('lp-tahun').value);
  history.replaceState(null, '', `?${kas ? `kas=${kas}&` : ''}tahun=${tahun}`);
  try {
    const d = await rpcPublik('laporan_publik', { p_kas_id: kas, p_tahun: tahun });
    isiTahun($('lp-tahun'), d.tahun_ada, tahun);
    gambarLaporan(d);
  } catch (e) {
    $('lp-angka').innerHTML = '';
    pesan(e.message === 'Failed to fetch' ? 'Sinyal terputus. Periksa sinyal lalu muat ulang.' : 'Laporan belum bisa dimuat. Coba lagi nanti.');
  }
}

$('lp-kas').addEventListener('change', muat);
$('lp-tahun').addEventListener('change', muat);

(async () => {
  try {
    const kas = await rpcPublik('kas_publik', {});
    $('lp-kas').innerHTML = kas.map((k) => `<option value="${k.id}">${hurufAman(k.nama)}</option>`).join('');
    const minta = Number(q.get('kas'));
    if (kas.some((k) => k.id === minta)) $('lp-kas').value = String(minta);
    $('lp-kas-label').hidden = kas.length < 2;
  } catch { $('lp-kas-label').hidden = true; }
  isiTahun($('lp-tahun'), [], Number(q.get('tahun')) || Number(hariIniWib().slice(0, 4)));
  muat();
})();
