// Laporan kas tahunan bersama (pengurus: laporan_kas). Data: saldo_awal, masuk, keluar,
// bulan [{b, masuk, keluar}], kategori [{arah, nama, jumlah}]. Bisyaroh sudah digabung di database bila perlu.
const BLN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const angkaRp = (n) => Number(n || 0).toLocaleString('id-ID');

// Bulan yang ditampilkan: Januari s.d. Desember; tahun berjalan s.d. bulan ini (WIB).
function barisBulan(d) {
  const kini = hariIniWib(), thKini = Number(kini.slice(0, 4)), sampai = d.tahun < thKini ? 12 : d.tahun > thKini ? 0 : Number(kini.slice(5, 7));
  const ada = new Map(d.bulan.map((x) => [x.b, x]));
  let saldo = Number(d.saldo_awal);
  const hasil = [];
  for (let m = 1; m <= sampai; m++) {
    const b = `${d.tahun}-${String(m).padStart(2, '0')}`, x = ada.get(b) || { masuk: 0, keluar: 0 };
    saldo += Number(x.masuk) - Number(x.keluar);
    hasil.push({ b, m, masuk: Number(x.masuk), keluar: Number(x.keluar), saldo });
  }
  return hasil;
}

function gambarLaporan(d) {
  const $l = (id) => document.getElementById(id);
  const akhir = Number(d.saldo_awal) + Number(d.masuk) - Number(d.keluar);
  const kotak = (n, label, sub) => `<li><strong>${n}</strong><span>${label}</span>${sub ? `<span>${sub}</span>` : ''}</li>`;
  $l('lp-angka').innerHTML = kotak(rupiah(akhir), `Saldo akhir ${d.tahun}`, hurufAman(d.kas)) + kotak(rupiah(d.masuk), 'Total masuk')
    + kotak(rupiah(d.keluar), 'Total keluar') + kotak(rupiah(d.saldo_awal), 'Saldo awal tahun', `per 1 Januari ${d.tahun}`);
  const bln = barisBulan(d);
  $l('lp-bulan').innerHTML = bln.length ? bln.map((x) => `<tr${x.masuk || x.keluar ? '' : ' class="lap-sepi"'}>
      <th scope="row">${BLN_PENDEK[x.m - 1]}</th><td>${angkaRp(x.masuk)}</td><td>${angkaRp(x.keluar)}</td>
      <td class="lap-selisih">${x.masuk - x.keluar < 0 ? '−' : ''}${angkaRp(Math.abs(x.masuk - x.keluar))}</td><td>${x.saldo < 0 ? '−' : ''}${angkaRp(Math.abs(x.saldo))}</td></tr>`).join('')
    : '<tr><td colspan="5" class="lap-kosong">Tahun ini belum berjalan.</td></tr>';
  $l('lp-total').innerHTML = `<tr><th scope="row">Jumlah</th><td>${angkaRp(d.masuk)}</td><td>${angkaRp(d.keluar)}</td>
    <td class="lap-selisih">${d.masuk - d.keluar < 0 ? '−' : ''}${angkaRp(Math.abs(d.masuk - d.keluar))}</td><td>${akhir < 0 ? '−' : ''}${angkaRp(Math.abs(akhir))}</td></tr>`;
  for (const arah of ['masuk', 'keluar']) {
    const daftar = d.kategori.filter((k) => k.arah === arah), total = daftar.reduce((a, k) => a + Number(k.jumlah), 0);
    const el = $l(`lp-${arah}`);
    el.innerHTML = daftar.length ? daftar.map((k, i) => `<li><div class="bt-baris">
        <span class="bt-nama">${hurufAman(k.nama)}</span>
        <span class="bt-nilai">${rupiah(k.jumlah)} <small>(${total ? (Number(k.jumlah) / total * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) : 0}%)</small></span>
        <span class="bt-jalur" aria-hidden="true"><span class="bt-isi" data-i="${i}"></span></span></div></li>`).join('')
      : `<li class="dsb-ket">Belum ada uang ${arah} di tahun ${d.tahun}.</li>`;
    el.querySelectorAll('.bt-isi').forEach((b) => { b.style.width = `${total ? Math.max(Number(daftar[b.dataset.i].jumlah) / total * 100, 1.5) : 0}%`; });
  }
}

// Pilihan tahun: tahun yang punya transaksi + tahun ini, terbaru dulu.
function isiTahun(sel, tahunAda, pilih) {
  const th = new Set([Number(hariIniWib().slice(0, 4)), ...(tahunAda || []).map(Number)]);
  sel.innerHTML = [...th].sort((a, b) => b - a).map((t) => `<option value="${t}">${t}</option>`).join('');
  sel.value = String(pilih);
}
