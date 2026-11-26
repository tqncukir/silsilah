// Kalender sendiri (besar, bahasa Indonesia) menggantikan pemilih tanggal bawaan HP yang kecil dan mengikuti bahasa HP.
// Dipasang otomatis ke semua <input type="date">. Nilai tetap disimpan di input asli (YYYY-MM-DD) sehingga kode halaman
// (baca/isi .value, .min/.max, event input) tidak berubah. Muat setelah supa.js dan sebelum skrip halaman.
(() => {
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const asliValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const dua = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${dua(m + 1)}-${dua(d)}`;
  const hariIni = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const pecah = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null; };
  const teksTgl = (v) => { const p = pecah(v); if (!p) return ''; const t = new Date(Date.UTC(p[0], p[1], p[2])); return `${HARI_PANJANG[t.getUTCDay()]}, ${p[2]} ${BLN[p[1]]} ${p[0]}`; };
  const ikon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

  function pasang(input) {
    if (input.dataset.kalender) return;
    input.dataset.kalender = '1';
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'tgl-tombol';
    tombol.id = `${input.id}-pilih`;
    tombol.setAttribute('aria-haspopup', 'dialog');
    input.after(tombol);
    input.type = 'hidden';
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) label.htmlFor = tombol.id;
    if (input.getAttribute('aria-describedby')) tombol.setAttribute('aria-describedby', input.getAttribute('aria-describedby'));

    const tulis = () => {
      const v = asliValue.get.call(input);
      tombol.innerHTML = `${ikon}<span>${v ? teksTgl(v) : 'Pilih tanggal'}</span>`;
      tombol.classList.toggle('kosong', !v);
    };
    // Kode halaman yang mengisi input.value langsung ikut memperbarui tulisan tombol.
    Object.defineProperty(input, 'value', { configurable: true, get() { return asliValue.get.call(this); }, set(v) { asliValue.set.call(this, v); tulis(); } });
    input.focus = () => tombol.focus();
    // Tanda salah (aria-invalid) dan isi otomatis dari KTP (.otomatis) ikut tampil di tombol.
    new MutationObserver(() => {
      if (input.getAttribute('aria-invalid') === 'true') tombol.setAttribute('aria-invalid', 'true'); else tombol.removeAttribute('aria-invalid');
      tombol.classList.toggle('otomatis', input.classList.contains('otomatis'));
    }).observe(input, { attributes: true, attributeFilter: ['aria-invalid', 'class'] });
    tombol.onclick = () => buka(input, tombol, label?.textContent.replace(/\s*(wajib|rahasia)\s*$/i, '').trim() || 'Pilih tanggal');
    tulis();
  }

  function buka(input, tombol, judul) {
    const min = input.min || '1900-01-01', maks = input.max || `${new Date().getFullYear() + 3}-12-31`;
    const [yMin] = pecah(min), [yMaks] = pecah(maks);
    const awal = pecah(input.value) || pecah(hariIni() < min ? min : hariIni() > maks ? maks : hariIni());
    let y = awal[0], m = awal[1];
    const d = document.createElement('dialog');
    d.className = 'kalender';
    d.setAttribute('aria-label', judul);
    d.innerHTML = `<div class="kal-kepala"><p class="kal-judul">${hurufAman(judul)}</p>
        <button type="button" class="btn btn-kedua btn-pas kal-tutup">Tutup</button></div>
      <div class="kal-arah">
        <button type="button" class="kal-panah" data-geser="-1" aria-label="Bulan sebelumnya"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <label class="sr-only" for="kal-bulan">Bulan</label><select id="kal-bulan">${BLN.map((b, i) => `<option value="${i}">${b}</option>`).join('')}</select>
        <label class="sr-only" for="kal-tahun">Tahun</label><select id="kal-tahun"></select>
        <button type="button" class="kal-panah" data-geser="1" aria-label="Bulan berikutnya"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="kal-hari" aria-hidden="true">${HARI.map((h, i) => `<span${i === 0 ? ' class="kal-minggu"' : ''}>${h}</span>`).join('')}</div>
      <div class="kal-kisi" role="grid"></div>
      <div class="kal-bawah">
        <button type="button" class="tautan kal-kini">Hari ini</button>
        ${input.required ? '' : '<button type="button" class="tautan kal-hapus">Kosongkan</button>'}
      </div>`;
    document.body.append(d);
    const thn = d.querySelector('#kal-tahun');
    for (let t = yMaks; t >= yMin; t--) thn.add(new Option(String(t), String(t)));

    const pilih = (v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      tutup();
    };
    const tutup = () => { d.close(); d.remove(); tombol.focus(); };
    function gambar() {
      d.querySelector('#kal-bulan').value = String(m); thn.value = String(y);
      const pertama = new Date(Date.UTC(y, m, 1)).getUTCDay(), jml = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const kini = hariIni(), dipilih = input.value;
      let html = '<span></span>'.repeat(pertama);
      for (let t = 1; t <= jml; t++) {
        const v = iso(y, m, t), luar = v < min || v > maks;
        const kelas = [v === dipilih && 'kal-pilih', v === kini && 'kal-kini-hari', (pertama + t - 1) % 7 === 0 && 'kal-minggu'].filter(Boolean).join(' ');
        html += `<button type="button" data-v="${v}" class="${kelas}"${luar ? ' disabled' : ''} aria-label="${teksTgl(v)}"${v === dipilih ? ' aria-pressed="true"' : ''}>${t}</button>`;
      }
      d.querySelector('.kal-kisi').innerHTML = html;
      const [py, pm] = pecah(min), [ky, km] = pecah(maks);
      d.querySelector('[data-geser="-1"]').disabled = y < py || (y === py && m <= pm);
      d.querySelector('[data-geser="1"]').disabled = y > ky || (y === ky && m >= km);
      const k = d.querySelector('.kal-kini'); k.hidden = kini < min || kini > maks;
    }
    d.querySelector('.kal-kisi').onclick = (e) => { const b = e.target.closest('button[data-v]'); if (b && !b.disabled) pilih(b.dataset.v); };
    d.querySelector('.kal-kisi').onkeydown = (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const geser = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!geser) return;
      e.preventDefault();
      const [a, bl, t] = pecah(b.dataset.v), baru = new Date(Date.UTC(a, bl, t + geser));
      const v = iso(baru.getUTCFullYear(), baru.getUTCMonth(), baru.getUTCDate());
      if (v < min || v > maks) return;
      if (baru.getUTCMonth() !== m) { y = baru.getUTCFullYear(); m = baru.getUTCMonth(); gambar(); }
      d.querySelector(`[data-v="${v}"]`)?.focus();
    };
    for (const p of d.querySelectorAll('[data-geser]')) p.onclick = () => { m += Number(p.dataset.geser); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } gambar(); };
    d.querySelector('#kal-bulan').onchange = (e) => { m = Number(e.target.value); gambar(); };
    thn.onchange = (e) => { y = Number(e.target.value); gambar(); };
    d.querySelector('.kal-kini').onclick = () => pilih(hariIni());
    const hapus = d.querySelector('.kal-hapus'); if (hapus) hapus.onclick = () => pilih('');
    d.querySelector('.kal-tutup').onclick = tutup;
    d.addEventListener('cancel', (e) => { e.preventDefault(); tutup(); });
    d.addEventListener('click', (e) => { if (e.target === d) tutup(); }); // ketuk di luar kotak
    gambar();
    d.showModal();
    (d.querySelector('.kal-pilih') || d.querySelector('.kal-kini-hari') || d.querySelector('.kal-kisi button:not([disabled])'))?.focus();
  }

  document.querySelectorAll('input[type="date"]').forEach(pasang);
})();
