// Poster A4 pemasangan: QR menuju halaman Cara Pasang (dibuat di browser dengan qrcode.js simpanan sendiri).
const qr = qrcode(0, 'H');
qr.addData('https://silsilah.tqncukir.id/pasang.html');
qr.make();
document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
document.getElementById('cetak').addEventListener('click', () => print());
