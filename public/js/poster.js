// Poster A4 pemasangan: QR menuju halaman Cara Pasang (dibuat di browser dengan qrcode.js simpanan sendiri).
const qr = qrcode(0, 'Q');
qr.addData('https://silsilah.tqncukir.id/pasang');
qr.make();
document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
document.getElementById('cetak').addEventListener('click', () => print());
// Di layar kecil poster A4 (210 mm ≈ 794 px) diperkecil pas selebar layar; saat dicetak tetap ukuran asli.
const poster = document.querySelector('.poster');
const pasUkuran = () => { poster.style.zoom = String(Math.min(1, (innerWidth - 16) / 794)); };
pasUkuran(); addEventListener('resize', pasUkuran);
addEventListener('beforeprint', () => { poster.style.zoom = '1'; });
addEventListener('afterprint', pasUkuran);
