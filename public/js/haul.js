// Haul bulan ini & bulan depan (Hijriah). Bahan dari rpc tanggal_ahli_kubur (semua almarhum bertanggal wafat);
// tanggal Hijriah dan perkiraan tanggal Masehi dihitung di browser (Ummul Qura). Bisa dibuka pengurus dan anggota.
const $ = (id) => document.getElementById(id);
let semua = [], pengurus = false, bulanKe = 0, pilihan = [];
const SINGKAT = ['Muharam', 'Safar', 'Rb. Awal', 'Rb. Akhir', 'Jm. Awal', 'Jm. Akhir', 'Rajab', 'Syakban', 'Ramadan', 'Syawal', 'Zulkaidah', 'Zulhijah'];

// Tanggal Masehi di sekitar hari ini -> peta "tahun-bulan-tanggal" Hijriah ke ISO Masehi, dan dua bulan Hijriah yang dibahas.
function siapkanBulan() {
  const peta = new Map(), kini = hariIniWib(), [y, m, d] = kini.split('-').map(Number);
  for (let i = -35; i <= 75; i++) {
    const iso = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10), h = hijriah(iso), k = `${h.y}-${h.m}-${h.d}`;
    if (!peta.has(k)) peta.set(k, iso);
  }
  const h0 = hijriah(kini), h1 = h0.m === 12 ? { m: 1, y: h0.y + 1 } : { m: h0.m + 1, y: h0.y };
  return { peta, kini, bulan: [{ m: h0.m, y: h0.y }, h1] };
}

function gambar() {
  const { peta, kini, bulan } = pilihan, b = bulan[bulanKe];
  const daftar = semua.map((a) => ({ a, h: hijriah(a.tanggal_wafat) }))
    .filter(({ h }) => h.m === b.m && b.y - h.y >= 1)
    .map(({ a, h }) => ({ a, h, ke: b.y - h.y, masehi: peta.get(`${b.y}-${b.m}-${h.d}`) || (h.d === 30 ? peta.get(`${b.y}-${b.m}-29`) : null) }))
    .sort((x, y) => x.h.d - y.h.d || x.a.nama.localeCompare(y.a.nama, 'id'));
  $('ringkas').textContent = `${daftar.length.toLocaleString('id-ID')} haul di bulan ${BULAN_HIJRIAH[b.m - 1]} ${b.y} H`;
  $('daftar').innerHTML = daftar.length ? daftar.map(({ a, h, ke, masehi }) => {
    const lewat = masehi && masehi < kini, hariIni = masehi === kini;
    const isi = `<span class="haul-tgl" aria-hidden="true"><strong>${h.d}</strong>${SINGKAT[b.m - 1]}</span>
      <span class="haul-isi">
        <strong>${hurufAman(a.nama)}${a.bin_binti ? ` <span class="ak-bin">${hurufAman(a.bin_binti)}</span>` : ''}</strong>
        ${hariIni ? '<span><span class="stat stat-aktif">Hari ini</span></span>' : lewat ? '<span class="ket">Sudah lewat</span>' : ''}
        <span class="ket">Haul ke-${ke} · ${h.d} ${BULAN_HIJRIAH[b.m - 1]} ${b.y} H${masehi ? ` · ${tglWib(masehi + 'T12:00:00+07:00')}` : ''}</span>
        <span class="ket"><span class="ak-jenis ak-${a.jenis}">${JENIS_AK[a.jenis]}</span>${a.desa ? ` · ${hurufAman(a.desa)}` : ''} · wafat ${new Date(a.tanggal_wafat + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </span>`;
    return `<li class="haul-item${lewat ? ' haul-lewat' : ''}${hariIni ? ' haul-kini' : ''}">${pengurus ? `<a href="/ahli-kubur-isi.html?kunci=${hurufAman(a.kunci)}">${isi}</a>` : `<div>${isi}</div>`}</li>`;
  }).join('') : `<li class="ket">Tidak ada haul di bulan ${BULAN_HIJRIAH[b.m - 1]} ${b.y} H (dari almarhum yang tanggal wafatnya tercatat).</li>`;
}

document.querySelectorAll('[name=bulan]').forEach((r) => r.addEventListener('change', () => { bulanKe = Number(r.value); gambar(); }));
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p) { location.replace('/beranda.html'); return; }
    pengurus = PERAN_LIHAT_JAMAAH.includes(p.peran);
    if (!pengurus) { $('kembali').href = '/beranda.html'; $('kembali-teks').textContent = 'Beranda'; }
    pilihan = siapkanBulan();
    const [b0, b1] = pilihan.bulan;
    $('b-ini').textContent = `${BULAN_HIJRIAH[b0.m - 1]} ${b0.y} H`;
    $('b-depan').textContent = `${BULAN_HIJRIAH[b1.m - 1]} ${b1.y} H`;
    semua = await dbKirim('POST', 'rpc/tanggal_ahli_kubur', {});
    gambar();
  } catch (e) { $('ringkas').textContent = '–'; tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
