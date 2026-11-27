// Lengkapi jenis kelamin jamaah yang belum diisi (permintaan Kang 2026-11-27).
// Sekali ketuk L/P langsung tersimpan (PATCH jamaah); hak ubah dijaga RLS, perubahan tercatat di log_perubahan,
// dan tanda "ditebak/ragu" (jamaah_jk_tebakan) hilang otomatis lewat trigger.
const $ = (id) => document.getElementById(id);
const PER = 20;
const PILIH = 'id,nomor_anggota,nama,pekerjaan,status_kawin,desa(nama,kecamatan(nama))';
let sisa = 0;

const pesan = (t) => { $('pesan').textContent = t; };
const ringkas = () => { $('ringkas').textContent = sisa ? `${sisa.toLocaleString('id-ID')} jamaah belum diisi jenis kelaminnya` : 'Semua jenis kelamin sudah terisi.'; };

async function muat() {
  pesan('');
  $('berikut').hidden = true;
  $('daftar').innerHTML = '<li class="ket">Memuat...</li>';
  try {
    const { baris, total } = await dbHalaman(`jamaah?select=${PILIH}&jenis_kelamin=is.null&order=desa_id.asc,nama.asc`, 0, PER - 1);
    sisa = total; ringkas();
    $('daftar').innerHTML = baris.length ? baris.map((j) => `<li class="jk-isi" data-id="${j.id}">
        <div class="jk-isi-data">
          <a class="jk-isi-nama" href="/jamaah-isi.html?id=${j.id}">${hurufAman(j.nama)}</a>
          <span class="jk-isi-ket2">${j.nomor_anggota} · ${hurufAman(j.desa?.nama || '–')}, Kec. ${hurufAman(j.desa?.kecamatan?.nama || '–')}</span>
          <span class="jk-isi-ket2">${hurufAman(j.pekerjaan || 'Pekerjaan belum diisi')}${j.status_kawin ? ' · ' + hurufAman(j.status_kawin) : ''}</span>
        </div>
        <div class="jk-isi-aksi">
          <button type="button" class="btn btn-kedua" data-jk="L">Laki-laki</button>
          <button type="button" class="btn btn-kedua" data-jk="P">Perempuan</button>
        </div>
      </li>`).join('')
      : '<li class="ket">Tidak ada lagi jamaah yang jenis kelaminnya kosong. Terima kasih.</li>';
    $('berikut').hidden = total <= baris.length;
  } catch (e) {
    $('daftar').innerHTML = '';
    pesan(e.message === 'Failed to fetch' ? 'Sinyal terputus. Muat ulang halaman ini.' : 'Data belum bisa dimuat. Muat ulang halaman ini.');
  }
}

async function simpan(li, jk) {
  const tombol = li.querySelectorAll('button');
  tombol.forEach((b) => { b.disabled = true; });
  pesan('');
  try {
    const hasil = await dbKirim('PATCH', `jamaah?id=eq.${Number(li.dataset.id)}&select=id`, { jenis_kelamin: jk });
    if (!hasil.length) throw new Error('ditolak');
    if (jk) sisa--; else sisa++;
    ringkas();
    li.classList.toggle('jk-isi-selesai', !!jk);
    li.querySelector('.jk-isi-aksi').innerHTML = jk
      ? `<span class="jk-isi-hasil">Tersimpan: ${jk === 'L' ? 'Laki-laki' : 'Perempuan'}</span><button type="button" class="btn btn-kedua btn-pas" data-jk="">Batal</button>`
      : '<button type="button" class="btn btn-kedua" data-jk="L">Laki-laki</button><button type="button" class="btn btn-kedua" data-jk="P">Perempuan</button>';
  } catch (e) {
    tombol.forEach((b) => { b.disabled = false; });
    pesan(e.message === 'Failed to fetch' ? 'Sinyal terputus. Belum tersimpan, coba ketuk lagi.'
      : e.message === 'ditolak' ? 'Akun ini tidak berhak mengubah jamaah tersebut.' : 'Belum tersimpan. Coba ketuk lagi.');
  }
}

$('daftar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-jk]');
  if (b) simpan(b.closest('li'), b.dataset.jk || null);
});
$('berikut').onclick = () => { muat(); window.scrollTo({ top: 0 }); };
$('keluar').onclick = keluar;

(async () => {
  try {
    const p = await profilSaya();
    if (!p || !PERAN_UBAH_JAMAAH.includes(p.peran)) { location.replace('/dashboard.html'); return; }
  } catch (e) { tanganiGalat(e, pesan); return; }
  muat();
})();
