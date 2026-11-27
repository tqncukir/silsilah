/**
 * PENERIMA BACKUP SILSILAH di Google Drive akun jtccukir2022@gmail.com
 * Dipasang sekali oleh Kang di script.google.com (lihat PROGRES.md, Tahap 11).
 *
 * - doPost: menerima file backup terkunci (.7z) dari GitHub, menyimpannya di folder
 *   "Backup SILSILAH", lalu merapikan file lama:
 *   simpan 30 backup harian terakhir + 1 backup per bulan selama 12 bulan.
 * - cekHarian: tiap pagi memeriksa; bila tidak ada backup baru > 30 jam, kirim email.
 *
 * Token rahasia disimpan di Script Properties (TOKEN), bukan di file ini.
 */
var NAMA_FOLDER = 'Backup SILSILAH';
var POLA = /^silsilah-(\d{4}-\d{2}-\d{2})\.7z$/;

function folder_() {
  var it = DriveApp.getFoldersByName(NAMA_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER);
}

function jawab_(isi) {
  return ContentService.createTextOutput(JSON.stringify(isi)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    var d = JSON.parse(e.postData.contents);
    if (!token || token.length < 32 || d.token !== token) return jawab_({ ok: false, galat: 'token' });
    if (!POLA.test(d.name || '')) return jawab_({ ok: false, galat: 'nama' });
    var f = folder_();
    var lama = f.getFilesByName(d.name);
    while (lama.hasNext()) lama.next().setTrashed(true); // jalan ulang di hari yang sama: ganti
    var blob = Utilities.newBlob(Utilities.base64Decode(d.data), 'application/x-7z-compressed', d.name);
    var baru = f.createFile(blob);
    var dihapus = rapikan_(f);
    return jawab_({ ok: true, ukuran: baru.getSize(), dihapus: dihapus });
  } catch (err) {
    return jawab_({ ok: false, galat: String(err) });
  }
}

/** Nama file yang dihapus: di luar 30 harian terakhir dan bukan backup pertama tiap bulan (12 bulan). */
function pilihHapus(namaFile) {
  var tgl = namaFile.map(function (n) { var m = POLA.exec(n); return m ? m[1] : null; })
    .filter(Boolean).sort().reverse();
  var simpan = {};
  tgl.slice(0, 30).forEach(function (t) { simpan[t] = 1; });
  var bulan = {};
  tgl.slice().reverse().forEach(function (t) { var b = t.slice(0, 7); if (!bulan[b]) bulan[b] = t; });
  Object.keys(bulan).sort().reverse().slice(0, 12).forEach(function (b) { simpan[bulan[b]] = 1; });
  return tgl.filter(function (t) { return !simpan[t]; }).map(function (t) { return 'silsilah-' + t + '.7z'; });
}

function rapikan_(f) {
  var semua = [], peta = {};
  var it = f.getFiles();
  while (it.hasNext()) { var x = it.next(); semua.push(x.getName()); peta[x.getName()] = x; }
  var hapus = pilihHapus(semua);
  hapus.forEach(function (n) { peta[n].setTrashed(true); });
  return hapus.length;
}

function cekHarian() {
  var it = folder_().getFiles(), terbaru = 0;
  while (it.hasNext()) { var x = it.next(); if (POLA.test(x.getName())) terbaru = Math.max(terbaru, x.getDateCreated().getTime()); }
  if (Date.now() - terbaru > 30 * 3600 * 1000) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'PERHATIAN: backup SILSILAH tidak masuk',
      'Sudah lebih dari 30 jam tidak ada backup baru di folder "' + NAMA_FOLDER + '" Google Drive.\n' +
      'Cek GitHub tqncukir/silsilah > Actions > Backup harian, atau minta Claude memeriksanya.');
  }
}

/** Jalankan SEKALI: buat token rahasia + folder + pemeriksaan tiap pagi jam 07.00 WIB. */
function pasang() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TOKEN')) p.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  folder_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cekHarian') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cekHarian').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Jakarta').create();
  Logger.log('TOKEN (salin ke rahasia GitHub DRIVE_TOKEN): ' + p.getProperty('TOKEN'));
}
