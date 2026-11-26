// Agenda kegiatan umum (tanpa login): rpc agenda_publik hanya memberi kegiatan publik yang belum lewat dan tidak dibatalkan.
// Butuh supa.js (SB_URL, SB_KEY, tglWib, jamWib, hurufAman, JENIS_KEGIATAN).
async function ambilAgenda(batas = 30) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/agenda_publik`, {
    method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_batas: batas }),
  });
  if (!r.ok) throw new Error('gagal-' + r.status);
  return r.json();
}

// Gambar daftar agenda ke <ol>. kosong = teks bila tidak ada kegiatan.
async function gambarAgenda(ol, batas, kosong = 'Belum ada agenda kegiatan.') {
  ol.innerHTML = '<li class="ket">Memuat agenda...</li>';
  try {
    const daftar = await ambilAgenda(batas);
    ol.innerHTML = daftar.length ? daftar.map((k) => `<li class="agenda-item">
        <span class="agenda-tgl" aria-hidden="true"><strong>${tglWib(k.mulai, { day: 'numeric' })}</strong>${tglWib(k.mulai, { month: 'short' })}</span>
        <span class="agenda-isi">
          <span class="agenda-jenis">${hurufAman(JENIS_KEGIATAN[k.jenis] || k.jenis)}</span>
          <strong>${hurufAman(k.nama)}</strong>
          <span class="ket">${tglWib(k.mulai)} · ${jamWib(k.mulai)}${k.selesai ? `–${jamWib(k.selesai)}` : ''} WIB</span>
          <span class="ket">${hurufAman(k.tempat)} · ${hurufAman(k.wilayah)}</span>
        </span></li>`).join('') : `<li class="ket">${kosong}</li>`;
    return daftar.length;
  } catch (e) {
    ol.innerHTML = `<li class="ket">${e.message === 'Failed to fetch' ? 'Sinyal terputus. Agenda belum bisa dimuat.' : 'Agenda belum bisa dimuat. Coba muat ulang.'}</li>`;
    return 0;
  }
}
