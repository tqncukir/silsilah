// Pemindai QR KTA bersama (Cek Keaslian, Masuk, nanti Absensi).
// Kamera dibaca di perangkat; gambar tidak dikirim atau disimpan. Pakai BarcodeDetector bila ada, selain itu jsQR (dimuat saat perlu).
let jsqrSiap = null;
function muatJsqr() {
  return jsqrSiap ??= new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = '/js/jsqr.min.js?v=52'; s.onload = ok; s.onerror = () => { jsqrSiap = null; gagal(new Error('jsqr')); };
    document.head.append(s);
  });
}

// Baca isi QR KTA. Baru: tautan /cek-kta.html#1-<nomor>-<versi>-<tanda>. Lama: "<nomor>  NAMA ALAMAT KEC KOTA".
function bacaKta(teks) {
  const t = String(teks || '').trim();
  const baru = /(?:^|#)(1-\d{10}-\d{1,3}-[A-Za-z0-9_-]{16})\s*$/.exec(t);
  if (baru) return { jenis: 'baru', kode: baru[1] };
  const lama = /^(\d{10})\s+(\S[\s\S]*)$/.exec(t);
  if (lama) return { jenis: 'lama', nomor: lama[1], teks: t };
  return null;
}

// Buka kamera dan tunggu satu QR. Hasil: teks QR, atau null bila ditutup.
// Mode beruntun (Absensi): beruntun(teks) dipanggil tiap QR terbaca dan mengembalikan { teks, kelas } untuk ditampilkan;
// kamera tetap menyala sampai Tutup. QR yang sama diabaikan 4 detik agar kartu yang tertahan tidak dicatat dua kali.
function pindaiQr({ judul = 'Pindai QR di KTA', ket = 'Arahkan kamera ke kotak QR di kartu.', beruntun = null } = {}) {
  return new Promise((selesai) => {
    const d = document.createElement('dialog');
    d.className = 'pindai';
    d.setAttribute('aria-labelledby', 'pindai-judul');
    d.innerHTML = `<div class="pindai-kepala"><h2 id="pindai-judul">${judul}</h2>
        <button type="button" class="btn btn-kedua btn-pas pindai-tutup">Tutup</button></div>
      <div class="pindai-layar"><video playsinline muted></video><span class="pindai-bingkai" aria-hidden="true"></span></div>
      <p class="pindai-ket" role="status">${ket}</p>`;
    document.body.append(d);
    const video = d.querySelector('video'), status = d.querySelector('.pindai-ket');
    let aliran = null, jalan = true, detektor = null, terakhir = '', jedaSampai = 0;
    const kanvas = document.createElement('canvas'), ctx = kanvas.getContext('2d', { willReadFrequently: true });

    const akhiri = (hasil) => {
      if (!jalan) return;
      jalan = false;
      aliran?.getTracks().forEach((t) => t.stop());
      d.close(); d.remove();
      selesai(hasil);
    };
    d.querySelector('.pindai-tutup').onclick = () => akhiri(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); akhiri(null); });

    async function putar() {
      if (!jalan || video.readyState < 2) { if (jalan) setTimeout(putar, 150); return; }
      try {
        let teks = null;
        if (detektor) {
          const k = await detektor.detect(video);
          teks = k[0]?.rawValue || null;
        } else {
          const skala = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          kanvas.width = Math.round(video.videoWidth * skala); kanvas.height = Math.round(video.videoHeight * skala);
          ctx.drawImage(video, 0, 0, kanvas.width, kanvas.height);
          const g = ctx.getImageData(0, 0, kanvas.width, kanvas.height);
          teks = window.jsQR(g.data, g.width, g.height, { inversionAttempts: 'attemptBoth' })?.data || null;
        }
        if (teks && !beruntun) { navigator.vibrate?.(60); akhiri(teks); return; }
        if (teks && !(teks === terakhir && Date.now() < jedaSampai)) {
          terakhir = teks; navigator.vibrate?.(60);
          status.className = 'pindai-ket pindai-hasil'; status.textContent = 'Memeriksa...';
          let h;
          try { h = await beruntun(teks); } catch { h = { teks: 'Gagal memeriksa. Coba pindai lagi.', kelas: 'pindai-galat' }; }
          if (!jalan) return;
          status.textContent = h.teks;
          if (h.kelas) status.classList.add(h.kelas);
          jedaSampai = Date.now() + 4000;
          setTimeout(putar, 900); // beri waktu petugas membaca hasil
          return;
        }
      } catch { /* bingkai berikutnya */ }
      if (jalan) setTimeout(putar, 120);
    }

    d.showModal();
    (async () => {
      try {
        if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
          detektor = new BarcodeDetector({ formats: ['qr_code'] });
        } else await muatJsqr();
        aliran = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!jalan) { aliran.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = aliran;
        await video.play();
        putar();
      } catch (e) {
        status.textContent = e?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Buka pengaturan browser, izinkan kamera untuk situs ini, lalu coba lagi.'
          : 'Kamera tidak bisa dibuka di perangkat ini.';
        status.classList.add('pindai-galat');
      }
    })();
  });
}
