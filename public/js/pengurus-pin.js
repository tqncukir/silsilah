// Atur PIN Pengurus (khusus admin pusat). Database yang menegakkan hak akses (private.wajib_admin_pusat).
const $ = (id) => document.getElementById(id);
const pesan = (el, t, ok) => { $(el).textContent = t; $(el).className = 'pesan' + (ok ? ' ok' : ''); };
const galat = (e) => e?.detail?.message || (e?.message === 'Failed to fetch' ? 'Sinyal terputus. Coba lagi.' : 'Gagal menyimpan. Coba lagi.');
$('keluar').onclick = keluar;

let nomorSaya = '';
let cariUrut = 0;

// Nama pemilik Nomor Anggota, supaya admin yakin orangnya benar sebelum menyimpan
async function periksaNomor() {
  const n = $('nomor').value;
  const urut = ++cariUrut;
  if (n.length !== 10) { $('ket-nomor').textContent = ''; return null; }
  $('ket-nomor').textContent = 'Mencari...';
  const [j] = await dbGet(`jamaah?select=nama,aktif,wafat,desa(nama)&nomor_anggota=eq.${n}`).catch(() => []);
  if (urut !== cariUrut) return null;
  $('ket-nomor').textContent = !j ? 'Nomor Anggota tidak ditemukan.'
    : j.wafat || !j.aktif ? `${j.nama} (${j.desa?.nama || '-'}): wafat atau tidak aktif.`
    : `${j.nama}, ${j.desa?.nama || '-'}`;
  return j || null;
}
$('nomor').addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '');
  if (v !== e.target.value) e.target.value = v;
  e.target.removeAttribute('aria-invalid');
  periksaNomor();
});
$('pin').addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '');
  if (v !== e.target.value) e.target.value = v;
  e.target.removeAttribute('aria-invalid');
});

$('pindai').onclick = async () => {
  pesan('pesan-form', '');
  const teks = await pindaiQr({ judul: 'Pindai KTA pengurus' });
  if (!teks) return;
  const k = bacaKta(teks);
  if (!k) { pesan('pesan-form', 'QR ini bukan QR KTA TQN Cukir.'); return; }
  $('nomor').value = k.jenis === 'baru' ? k.kode.split('-')[1] : k.nomor;
  periksaNomor();
  $('peran').focus();
};

// PIN acak 8 angka dari pengacak kriptografi browser
$('acak').onclick = () => {
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  $('pin').value = Array.from(a, (x) => x % 10).join('');
  $('pin').removeAttribute('aria-invalid');
};

const salah = (id, t) => { $(id).setAttribute('aria-invalid', 'true'); $(id).focus(); pesan('pesan-form', t); };

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nomor = $('nomor').value, peran = $('peran').value, pin = $('pin').value;
  if (nomor.length !== 10) return salah('nomor', 'Nomor Anggota harus 10 angka.');
  if (!peran) return salah('peran', 'Pilih peran pengurus.');
  if (!/^\d{8}$/.test(pin)) return salah('pin', 'PIN Pengurus harus 8 angka.');
  const b = $('simpan');
  b.disabled = true; b.classList.add('sibuk'); b.querySelector('.teks').textContent = 'Menyimpan...'; pesan('pesan-form', '');
  try {
    const nama = await dbKirim('POST', 'rpc/atur_pin_pengurus', { p_nomor: Number(nomor), p_peran: peran, p_pin: pin });
    $('hasil-nama').textContent = `${nama} (${NAMA_PERAN[peran]})`;
    $('hasil-pin').textContent = `${pin.slice(0, 4)} ${pin.slice(4)}`;
    $('hasil').hidden = false; $('hasil').focus();
    muatDaftar();
  } catch (err) {
    if (err.message === 'belum-masuk' || err.message === 'gagal-401') { location.replace('/masuk.html'); return; }
    pesan('pesan-form', galat(err));
  }
  b.disabled = false; b.classList.remove('sibuk'); b.querySelector('.teks').textContent = 'Simpan PIN';
});

// PIN hanya tampil sekali: setelah dicatat, formulir dikosongkan
$('selesai').onclick = () => {
  $('hasil').hidden = true; $('hasil-pin').textContent = '';
  $('form').reset(); $('ket-nomor').textContent = '';
  pesan('pesan-form', 'PIN tersimpan.', true);
  $('nomor').focus();
};

function tanggal(t) {
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function muatDaftar() {
  const d = await dbKirim('POST', 'rpc/daftar_pin_pengurus', {});
  $('daftar').innerHTML = d.length ? d.map((r) => {
    const saya = String(r.nomor_anggota) === nomorSaya;
    return `<li class="${r.aktif ? '' : 'mati'}">
      <div><strong>${hurufAman(r.nama)}</strong>${saya ? ' <span class="lencana">Anda</span>' : ''}
        <span class="ket">${r.nomor_anggota} · ${hurufAman(r.desa)}</span>
        <span class="ket">${NAMA_PERAN[r.peran] || r.peran} · ${r.aktif ? 'Aktif' : 'Nonaktif'} · diubah ${tanggal(r.diubah_pada)}</span></div>
      <div class="pin-aksi">
        <button type="button" class="tautan" data-ganti="${r.nomor_anggota}" data-peran="${r.peran}">${r.aktif ? 'Ganti PIN' : 'Aktifkan lagi'}</button>
        ${r.aktif && !saya ? `<button type="button" class="tautan tautan-bahaya" data-mati="${r.nomor_anggota}" data-nama="${hurufAman(r.nama)}">Nonaktifkan</button>` : ''}
      </div></li>`;
  }).join('') : '<li class="ket">Belum ada pengurus ber-PIN.</li>';
}

$('daftar').addEventListener('click', async (e) => {
  const g = e.target.closest('[data-ganti]');
  if (g) {
    $('nomor').value = g.dataset.ganti; $('peran').value = g.dataset.peran; $('pin').value = '';
    $('hasil').hidden = true; pesan('pesan-form', '');
    periksaNomor();
    $('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('pin').focus({ preventScroll: true });
    return;
  }
  const m = e.target.closest('[data-mati]');
  if (!m) return;
  if (!confirm(`Nonaktifkan PIN ${m.dataset.nama}? Akun pengurusnya langsung tidak bisa dipakai. Bisa diaktifkan lagi dengan memasang PIN baru.`)) return;
  m.disabled = true;
  try {
    await dbKirim('POST', 'rpc/nonaktifkan_pin_pengurus', { p_nomor: Number(m.dataset.mati) });
    pesan('pesan', `PIN ${m.dataset.nama} dinonaktifkan.`, true);
    muatDaftar();
  } catch (err) {
    m.disabled = false;
    pesan('pesan', galat(err));
  }
});

(async () => {
  try {
    const p = await profilSaya();
    if (!p || p.peran !== 'admin_pusat') { location.replace('/beranda.html'); return; }
    const t = await tokenAktif();
    try { nomorSaya = (JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '').split('@pengurus.')[0]; } catch {}
    await muatDaftar();
    $('isi').hidden = false;
  } catch (e) {
    tanganiGalat(e, (t) => pesan('pesan', t));
  }
})();
