// Panduan Peran (Tahap 19): panduan sesuai peran akun yang masuk + fitur yang bisa ia buka (BAGIAN_PERAN di panduan-isi.js).
// Isi statis (bukan data database). Bagian berupa <details>: gambar baru dimuat saat bagiannya dibuka.
const $ = (id) => document.getElementById(id);
$('keluar').onclick = keluar;

function bukaBagian(id, gulir = true) {
  const d = $(`pd-${id}`);
  if (!d) return;
  d.open = true;
  if (gulir) d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  d.querySelector('summary').focus({ preventScroll: true });
}

function gambar(peran) {
  const daftar = (BAGIAN_PERAN[peran] || ['pasang', 'kendala']).filter((k) => BAGIAN[k]);
  $('pd-sub').textContent = `Untuk akun ${NAMA_PERAN[peran] || peran}. Ketuk judul untuk membuka atau menutup.`;
  $('pd-daftar-isi').innerHTML = daftar.map((k, i) => `<li><a href="#pd-${k}" data-ke="${k}">${BAGIAN[k].judul}${i === 0 ? ' <span class="pd-anda">Peran Anda</span>' : ''}</a></li>`).join('');
  $('pd-bagian').innerHTML = daftar.map((k, i) => `<details class="panel pd-bagian${i === 0 ? ' pd-utama' : ''}" id="pd-${k}"${i === 0 ? ' open' : ''}>
      <summary><span class="pd-no" aria-hidden="true">${i + 1}</span><span class="pd-judul"><strong>${BAGIAN[k].judul}</strong><span>${BAGIAN[k].sub}</span></span></summary>
      <div class="pd-teks">${BAGIAN[k].isi}</div></details>`).join('');
  // Tautan ke bagian lain: bila bagian itu tidak untuk peran ini, tampil sebagai teks biasa.
  $('pd-bagian').querySelectorAll('a.pd-ke').forEach((a) => {
    if (!daftar.includes(a.dataset.ke)) { const s = document.createElement('span'); s.textContent = a.textContent; a.replaceWith(s); }
    else a.href = `#pd-${a.dataset.ke}`;
  });
  $('pd-daftar').hidden = false; $('pd-catatan').hidden = false;
  const awal = location.hash.replace(/^#pd-/, '');
  if (awal && daftar.includes(awal)) bukaBagian(awal);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-ke]');
  if (!a || !$(`pd-${a.dataset.ke}`)) return;
  e.preventDefault();
  history.replaceState(null, '', `#pd-${a.dataset.ke}`);
  bukaBagian(a.dataset.ke);
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p) { $('pd-sub').textContent = 'Akun ini belum punya peran. Hubungi admin pusat.'; gambar(''); return; }
    gambar(p.peran);
  } catch (e) { tanganiGalat(e, (t) => { $('pesan').textContent = t; }); }
})();
