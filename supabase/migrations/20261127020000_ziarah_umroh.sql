-- Tahap 4 Langkah 1: Ziarah & Umroh (modul 10). Keputusan Kang Salman 2026-11-27:
-- ziarah & umroh dicatat bersama sebagai "perjalanan" dengan daftar peserta; peserta = jamaah terdaftar
-- (pindai KTA / ketik Nomor Anggota) + keluarga non-jamaah (nama + jamaah penghubung + hubungan, tanpa HP);
-- uang hanya tanda Lunas/Belum (tanpa rupiah); peserta didaftarkan pengurus, anggota melihat dirinya.
-- Tanpa nomor paspor/KTP. Perjalanan & peserta tidak dihapus (dibatalkan/batal ikut). Peserta hanya ditulis lewat fungsi.

create type public.jenis_perjalanan as enum ('ziarah','umroh');

create table public.perjalanan (
  id            bigint generated always as identity primary key,
  jenis         public.jenis_perjalanan not null,
  nama          text not null check (length(btrim(nama)) between 3 and 120),
  tujuan        text check (length(tujuan) <= 300),                 -- mis. "Makam Walisongo", "Makkah & Madinah"
  berangkat     timestamptz not null,                                -- tanggal + jam kumpul (WIB di tampilan)
  pulang        date,                                                -- kosong = pulang hari itu juga
  tempat_kumpul text check (length(tempat_kumpul) <= 160),
  kuota         smallint check (kuota between 1 and 2000),           -- kosong = tanpa batas
  kecamatan_id  integer references public.kecamatan(id),            -- kosong = perjalanan pusat
  publik        boolean not null default true,                      -- tampil untuk anggota di Portal
  dibatalkan    boolean not null default false,
  keterangan    text check (length(keterangan) <= 500),
  dibuat_oleh   uuid,
  dibuat_pada   timestamptz not null default now(),
  diubah_pada   timestamptz not null default now(),
  check (pulang is null or pulang between (berangkat at time zone 'Asia/Jakarta')::date
                                      and (berangkat at time zone 'Asia/Jakarta')::date + 60)
);
create index on public.perjalanan (berangkat);
create index on public.perjalanan (kecamatan_id, berangkat);

create table public.peserta_perjalanan (
  id                   bigint generated always as identity primary key,
  perjalanan_id        bigint not null references public.perjalanan(id),
  jamaah_id            bigint references public.jamaah(id),          -- peserta jamaah
  nama                 text check (length(btrim(nama)) between 2 and 120),  -- peserta keluarga (bukan jamaah)
  penghubung_jamaah_id bigint references public.jamaah(id),          -- keluarga: jamaah yang mendaftarkan
  hubungan             text check (length(hubungan) <= 40),          -- keluarga: Istri, Anak, Ibu, ...
  lunas                boolean not null default false,
  batal                boolean not null default false,
  ditambah_oleh        uuid,
  ditambah_pada        timestamptz not null default now(),
  diubah_pada          timestamptz not null default now(),
  check ((jamaah_id is null) <> (nama is null)),
  check (jamaah_id is null or (penghubung_jamaah_id is null and hubungan is null)),
  check (nama is null or penghubung_jamaah_id is not null)
);
create unique index on public.peserta_perjalanan (perjalanan_id, jamaah_id) where jamaah_id is not null;
create index on public.peserta_perjalanan (perjalanan_id);
create index on public.peserta_perjalanan (jamaah_id) where jamaah_id is not null;            -- perjalanan saya
create index on public.peserta_perjalanan (penghubung_jamaah_id) where penghubung_jamaah_id is not null;

alter table public.perjalanan         enable row level security;
alter table public.peserta_perjalanan enable row level security;

-- ===== Hak akses =====
-- Membuat/mengubah perjalanan: sama dengan kegiatan (private.boleh_kelola_kegiatan): admin pusat & ketua semua,
-- koordinator hanya kecamatannya (perjalanan pusat tidak).

-- Mendaftarkan / membatalkan / melihat peserta. p_jamaah_id = jamaah peserta, atau penghubung untuk keluarga.
-- Admin pusat & ketua: semua. Koordinator: perjalanan kecamatannya (peserta dari mana saja)
-- atau perjalanan pusat (hanya jamaah kecamatannya).
create function private.boleh_kelola_peserta(p_perjalanan_id bigint, p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'admin_pusat' then true
    when 'ketua' then true
    when 'koordinator_wilayah' then exists (
        select 1 from public.perjalanan p
        join public.pengguna_wilayah w on w.kecamatan_id = p.kecamatan_id
        where p.id = p_perjalanan_id and w.user_id = (select auth.uid()))
      or (exists (select 1 from public.perjalanan p where p.id = p_perjalanan_id and p.kecamatan_id is null)
          and private.boleh_kelola_desa((select desa_id from public.jamaah where id = p_jamaah_id)))
    else false end, false)
$$;

-- Melihat peserta & mengubah tanda Lunas: yang boleh mengelola peserta itu + bendahara (semua).
create function private.boleh_lunas(p_perjalanan_id bigint, p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and (private.peran_saya() = 'bendahara'
    or private.boleh_kelola_peserta(p_perjalanan_id, p_jamaah_id)), false)
$$;

revoke all on function private.boleh_kelola_peserta(bigint, bigint) from public, anon;
revoke all on function private.boleh_lunas(bigint, bigint) from public, anon;
grant execute on function private.boleh_kelola_peserta(bigint, bigint) to authenticated;
grant execute on function private.boleh_lunas(bigint, bigint) to authenticated;

-- ===== RLS perjalanan =====
create policy baca on public.perjalanan for select to authenticated using (
  publik or coalesce((select private.peran_saya()) <> 'anggota', false));
create policy tambah on public.perjalanan for insert to authenticated
  with check (private.boleh_kelola_kegiatan(kecamatan_id));
create policy ubah on public.perjalanan for update to authenticated
  using (private.boleh_kelola_kegiatan(kecamatan_id))
  with check (private.boleh_kelola_kegiatan(kecamatan_id));
-- Tidak ada policy DELETE.
revoke all on public.perjalanan from anon, authenticated;
grant select, insert, update on public.perjalanan to authenticated;

-- ===== RLS peserta =====
-- Pengurus yang berhak; anggota hanya baris dirinya atau keluarga yang ia daftarkan.
create policy baca on public.peserta_perjalanan for select to authenticated using (
  jamaah_id = (select private.jamaah_saya())
  or penghubung_jamaah_id = (select private.jamaah_saya())
  or private.boleh_lunas(perjalanan_id, coalesce(jamaah_id, penghubung_jamaah_id)));
revoke all on public.peserta_perjalanan from anon, authenticated;
grant select on public.peserta_perjalanan to authenticated;     -- menulis hanya lewat fungsi di bawah

-- ===== Jejak audit + kolom terkunci =====
create function private.catat_perjalanan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if tg_op = 'INSERT' then
    new.dibuat_oleh := (select auth.uid()); new.dibuat_pada := now(); new.diubah_pada := now();
  else
    new.dibuat_oleh := old.dibuat_oleh; new.dibuat_pada := old.dibuat_pada; new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan) values ('perjalanan', new.id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_perjalanan() from public, anon, authenticated;
create trigger catat before insert or update on public.perjalanan
  for each row execute function private.catat_perjalanan();

create function private.catat_peserta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if tg_op = 'INSERT' then
    new.ditambah_oleh := (select auth.uid()); new.ditambah_pada := now(); new.diubah_pada := now();
    beda := jsonb_build_object('perjalanan_id', new.perjalanan_id, 'jamaah_id', new.jamaah_id, 'nama', new.nama,
      'penghubung_jamaah_id', new.penghubung_jamaah_id);
  else
    if new.perjalanan_id is distinct from old.perjalanan_id or new.jamaah_id is distinct from old.jamaah_id
       or new.penghubung_jamaah_id is distinct from old.penghubung_jamaah_id then
      raise exception 'Perjalanan dan peserta tidak bisa diganti.' using errcode = 'P0001';
    end if;
    new.ditambah_oleh := old.ditambah_oleh; new.ditambah_pada := old.ditambah_pada; new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('peserta_perjalanan', new.id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_peserta() from public, anon, authenticated;
create trigger catat before insert or update on public.peserta_perjalanan
  for each row execute function private.catat_peserta();

-- ===== Daftarkan jamaah (pindai KTA / ketik nomor) =====
-- p_versi wajib untuk QR KTA baru (kartu yang sudah diganti ditolak), kosong untuk QR lama / ketik.
-- Hasil: terdaftar | sudah | ikut_lagi | tidak_dikenal | tidak_aktif | wafat | kartu_diganti | penuh
-- (+ nama, desa, kecamatan untuk dicocokkan pengurus).
create function public.daftar_peserta_jamaah(p_perjalanan_id bigint, p_nomor bigint, p_versi smallint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.perjalanan;
  j record;
  s public.peserta_perjalanan;
  v smallint;
  hasil text;
begin
  select * into p from public.perjalanan where id = p_perjalanan_id;
  if not found then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if p.dibatalkan then raise exception 'Perjalanan ini sudah dibatalkan.' using errcode = 'P0001'; end if;

  select ja.id, ja.nomor_anggota, ja.nama, ja.aktif, ja.wafat, d.nama as desa, kc.nama as kecamatan into j
  from public.jamaah ja join public.desa d on d.id = ja.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id
  where ja.nomor_anggota = p_nomor;
  -- Hak diperiksa sebelum data jamaah dikembalikan (koordinator perjalanan pusat: hanya jamaah kecamatannya).
  if j.id is null and not private.sesi_saya_terbatas()
     and private.peran_saya() in ('admin_pusat','ketua','koordinator_wilayah') then
    return jsonb_build_object('hasil', 'tidak_dikenal', 'nomor', p_nomor);
  end if;
  if not private.boleh_kelola_peserta(p.id, j.id) then
    if private.sesi_saya_terbatas() or private.peran_saya() is distinct from 'koordinator_wilayah' then
      raise exception 'tidak berhak' using errcode = '42501';
    end if;
    raise exception 'Anda hanya bisa mendaftarkan jamaah dari kecamatan Anda.' using errcode = '42501';
  end if;
  if j.wafat or not j.aktif then
    return jsonb_build_object('hasil', case when j.wafat then 'wafat' else 'tidak_aktif' end,
      'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan);
  end if;
  if p_versi is not null then
    select versi into v from private.kta where jamaah_id = j.id;
    if coalesce(v, 1) <> p_versi then
      return jsonb_build_object('hasil', 'kartu_diganti',
        'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan);
    end if;
  end if;

  perform 1 from public.perjalanan where id = p.id for update;     -- kuota aman bila dua pengurus bersamaan
  select * into s from public.peserta_perjalanan where perjalanan_id = p.id and jamaah_id = j.id;
  if found and not s.batal then
    hasil := 'sudah';
  elsif p.kuota is not null
        and (select count(*) from public.peserta_perjalanan where perjalanan_id = p.id and not batal) >= p.kuota then
    return jsonb_build_object('hasil', 'penuh', 'kuota', p.kuota,
      'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan);
  elsif found then
    update public.peserta_perjalanan set batal = false where id = s.id;
    hasil := 'ikut_lagi';
  else
    insert into public.peserta_perjalanan (perjalanan_id, jamaah_id) values (p.id, j.id) returning * into s;
    hasil := 'terdaftar';
  end if;

  return jsonb_build_object('hasil', hasil, 'peserta_id', s.id, 'jamaah_id', j.id, 'nomor', j.nomor_anggota,
    'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan,
    'jumlah', (select count(*) from public.peserta_perjalanan where perjalanan_id = p.id and not batal));
end $$;
revoke all on function public.daftar_peserta_jamaah(bigint, bigint, smallint) from public, anon;
grant execute on function public.daftar_peserta_jamaah(bigint, bigint, smallint) to authenticated;

-- ===== Daftarkan keluarga (bukan jamaah) =====
-- Penghubung = Nomor Anggota jamaah yang mendaftarkan. Nama yang berisi angka panjang (nomor HP/NIK) ditolak.
create function public.daftar_peserta_keluarga(p_perjalanan_id bigint, p_nama text, p_nomor_penghubung bigint,
  p_hubungan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.perjalanan;
  pj record;
  nm text := btrim(regexp_replace(coalesce(p_nama, ''), '\s+', ' ', 'g'));
  hb text := nullif(btrim(coalesce(p_hubungan, '')), '');
  sid bigint;
begin
  select * into p from public.perjalanan where id = p_perjalanan_id;
  if not found then raise exception 'tidak berhak' using errcode = '42501'; end if;
  select ja.id, ja.nama, ja.wafat, d.nama as desa into pj
  from public.jamaah ja join public.desa d on d.id = ja.desa_id where ja.nomor_anggota = p_nomor_penghubung;
  if pj.id is null and not private.sesi_saya_terbatas()
     and private.peran_saya() in ('admin_pusat','ketua','koordinator_wilayah') then
    raise exception 'Nomor Anggota penghubung tidak terdaftar.' using errcode = 'P0001';
  end if;
  if not private.boleh_kelola_peserta(p.id, pj.id) then
    if private.sesi_saya_terbatas() or private.peran_saya() is distinct from 'koordinator_wilayah' then
      raise exception 'tidak berhak' using errcode = '42501';
    end if;
    raise exception 'Anda hanya bisa mendaftarkan keluarga jamaah dari kecamatan Anda.' using errcode = '42501';
  end if;
  if p.dibatalkan then raise exception 'Perjalanan ini sudah dibatalkan.' using errcode = 'P0001'; end if;
  if pj.wafat then raise exception 'Jamaah penghubung sudah wafat. Pilih penghubung lain.' using errcode = 'P0001'; end if;
  if length(nm) < 2 or length(nm) > 120 then raise exception 'Nama peserta 2 sampai 120 huruf.' using errcode = '22023'; end if;
  if nm ~ '[0-9]{5,}' or coalesce(hb, '') ~ '[0-9]{5,}' then
    raise exception 'Jangan menulis nomor HP atau NIK.' using errcode = '22023';
  end if;
  if length(hb) > 40 then raise exception 'Hubungan maksimal 40 huruf.' using errcode = '22023'; end if;

  perform 1 from public.perjalanan where id = p.id for update;
  if p.kuota is not null
     and (select count(*) from public.peserta_perjalanan where perjalanan_id = p.id and not batal) >= p.kuota then
    raise exception 'Kuota perjalanan sudah penuh (% orang).', p.kuota using errcode = 'P0001';
  end if;
  if exists (select 1 from public.peserta_perjalanan where perjalanan_id = p.id and not batal
             and penghubung_jamaah_id = pj.id and lower(nama) = lower(nm)) then
    raise exception '% sudah terdaftar di perjalanan ini.', nm using errcode = 'P0001';
  end if;
  insert into public.peserta_perjalanan (perjalanan_id, nama, penghubung_jamaah_id, hubungan)
  values (p.id, nm, pj.id, hb) returning id into sid;
  return jsonb_build_object('hasil', 'terdaftar', 'peserta_id', sid, 'nama', nm, 'penghubung', pj.nama,
    'desa', pj.desa, 'jumlah', (select count(*) from public.peserta_perjalanan where perjalanan_id = p.id and not batal));
end $$;
revoke all on function public.daftar_peserta_keluarga(bigint, text, bigint, text) from public, anon;
grant execute on function public.daftar_peserta_keluarga(bigint, text, bigint, text) to authenticated;

-- ===== Batal ikut / ikut lagi =====
create function public.atur_batal_peserta(p_peserta_id bigint, p_batal boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.peserta_perjalanan; p public.perjalanan;
begin
  select * into s from public.peserta_perjalanan where id = p_peserta_id;
  if not found or not private.boleh_kelola_peserta(s.perjalanan_id, coalesce(s.jamaah_id, s.penghubung_jamaah_id)) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  if s.batal = p_batal then return; end if;
  select * into p from public.perjalanan where id = s.perjalanan_id for update;
  if not p_batal and p.kuota is not null
     and (select count(*) from public.peserta_perjalanan where perjalanan_id = p.id and not batal) >= p.kuota then
    raise exception 'Kuota perjalanan sudah penuh (% orang).', p.kuota using errcode = 'P0001';
  end if;
  update public.peserta_perjalanan set batal = p_batal where id = s.id;
end $$;
revoke all on function public.atur_batal_peserta(bigint, boolean) from public, anon;
grant execute on function public.atur_batal_peserta(bigint, boolean) to authenticated;

-- ===== Tanda Lunas / Belum lunas (tanpa angka rupiah) =====
create function public.atur_lunas(p_peserta_id bigint, p_lunas boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.peserta_perjalanan;
begin
  select * into s from public.peserta_perjalanan where id = p_peserta_id;
  if not found or not private.boleh_lunas(s.perjalanan_id, coalesce(s.jamaah_id, s.penghubung_jamaah_id)) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  update public.peserta_perjalanan set lunas = p_lunas where id = s.id and lunas is distinct from p_lunas;
end $$;
revoke all on function public.atur_lunas(bigint, boolean) from public, anon;
grant execute on function public.atur_lunas(bigint, boolean) to authenticated;

-- ===== Daftar peserta (untuk halaman pengurus & unduh CSV) =====
-- SECURITY DEFINER agar nama jamaah luar kecamatan tetap tampil bagi koordinator perjalanannya;
-- baris disaring dengan boleh_lunas. p_status: null semua aktif, 'lunas', 'belum', 'batal'.
create function public.daftar_peserta(p_perjalanan_id bigint, p_cari text default null, p_status text default null,
  p_dari integer default 0, p_batas integer default 20)
returns table (id bigint, jamaah_id bigint, nomor_anggota bigint, nama text, keluarga boolean, hubungan text,
  penghubung_nomor bigint, penghubung_nama text, desa text, kecamatan text, kabupaten text, lunas boolean, batal boolean,
  ditambah_pada timestamptz, boleh_ubah boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', '');
begin
  if private.sesi_saya_terbatas() or coalesce(private.peran_saya() not in
       ('admin_pusat','ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select s.id, s.jamaah_id, ja.nomor_anggota, coalesce(ja.nama, s.nama), s.jamaah_id is null, s.hubungan,
    ph.nomor_anggota, ph.nama, d.nama, kc.nama, kb.nama, s.lunas, s.batal, s.ditambah_pada,
    private.boleh_kelola_peserta(s.perjalanan_id, coalesce(s.jamaah_id, s.penghubung_jamaah_id)),
    count(*) over ()
  from public.peserta_perjalanan s
  left join public.jamaah ja on ja.id = s.jamaah_id
  left join public.jamaah ph on ph.id = s.penghubung_jamaah_id
  join public.desa d on d.id = coalesce(ja.desa_id, ph.desa_id)
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  where s.perjalanan_id = p_perjalanan_id
    and private.boleh_lunas(s.perjalanan_id, coalesce(s.jamaah_id, s.penghubung_jamaah_id))
    and case p_status when 'batal' then s.batal when 'lunas' then not s.batal and s.lunas
                      when 'belum' then not s.batal and not s.lunas else not s.batal end
    and (cari is null or coalesce(ja.nama, s.nama) ilike '%' || cari || '%' or ph.nama ilike '%' || cari || '%'
         or ja.nomor_anggota::text = cari or ph.nomor_anggota::text = cari)
  order by coalesce(ja.nama, s.nama), s.id
  offset greatest(coalesce(p_dari, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;
revoke all on function public.daftar_peserta(bigint, text, text, integer, integer) from public, anon;
grant execute on function public.daftar_peserta(bigint, text, text, integer, integer) to authenticated;

-- ===== Ringkasan peserta satu perjalanan (yang terlihat oleh pemanggil) =====
create function public.ringkas_peserta(p_perjalanan_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'peserta', count(*) filter (where not batal),
    'jamaah',  count(*) filter (where not batal and jamaah_id is not null),
    'keluarga', count(*) filter (where not batal and jamaah_id is null),
    'lunas',   count(*) filter (where not batal and lunas),
    'batal',   count(*) filter (where batal))
  from public.peserta_perjalanan
  where perjalanan_id = p_perjalanan_id
    and private.boleh_lunas(perjalanan_id, coalesce(jamaah_id, penghubung_jamaah_id))
$$;
revoke all on function public.ringkas_peserta(bigint) from public, anon;
grant execute on function public.ringkas_peserta(bigint) to authenticated;
