// Baca berita (Tahap 14): tamu hanya berita Publik; yang sudah masuk juga Khusus anggota (dicek di database: baca_berita).
// Butuh supa.js (SB_URL, SB_KEY, sesi, tokenAktif, tglWib, hurufAman, fotoBerita, paragrafBerita).
async function ambilBerita({ id = null, dari = 0, batas = 10 } = {}) {
  const t = sesi.ambil() ? await tokenAktif().catch(() => null) : null;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/baca_berita`, {
    method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ p_id: id, p_dari: dari, p_batas: batas }),
  });
  if (!r.ok) throw new Error('gagal-' + r.status);
  return r.json();
}
const ringkasBerita = (isi) => String(isi || '').replace(/\s+/g, ' ').trim();
const kartuBerita = (b) => `<li><a class="berita-kartu${b.foto ? '' : ' tanpa-foto'}" href="/berita-baca.html?id=${b.id}">
    ${b.foto ? `<img class="berita-kecil" src="${fotoBerita(b.foto)}" alt="" loading="lazy" width="112" height="84">` : ''}
    <span class="berita-teks">
      <span class="berita-meta">${tglWib(b.terbit_pada, { day: 'numeric', month: 'short', year: 'numeric' })} · ${hurufAman(b.wilayah)}${b.khusus_anggota ? ' · <span class="berita-khusus">Khusus anggota</span>' : ''}</span>
      <strong>${hurufAman(b.judul)}</strong>
      <span class="berita-ringkas">${hurufAman(ringkasBerita(b.isi))}</span>
    </span></a></li>`;
// Gambar daftar berita ke <ol>. Hasil: jumlah total berita yang bisa dibaca.
async function gambarBerita(ol, batas, kosong = 'Belum ada berita.') {
  ol.innerHTML = '<li class="ket">Memuat berita...</li>';
  try {
    const daftar = await ambilBerita({ batas });
    ol.innerHTML = daftar.length ? daftar.map(kartuBerita).join('') : `<li class="ket">${kosong}</li>`;
    return Number(daftar[0]?.total || 0);
  } catch (e) {
    ol.innerHTML = `<li class="ket">${e.message === 'Failed to fetch' ? 'Sinyal terputus. Berita belum bisa dimuat.' : 'Berita belum bisa dimuat. Coba muat ulang.'}</li>`;
    return -1;
  }
}
