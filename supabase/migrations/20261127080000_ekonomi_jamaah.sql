-- Tahap 8 Langkah 1: Ekonomi Jamaah (modul 8). Keputusan Kang Salman 2026-11-27:
-- (1) kondisi ekonomi jamaah (rahasia): tingkat + jumlah tanggungan + tanggal didata, tanpa angka penghasilan;
--     dilihat & didata ketua, bendahara, koordinator (jamaah wilayahnya) = aturan sama dengan Bantuan Sosial;
--     admin pusat & peran lain hanya angka tanpa nama; anggota tidak melihat (termasuk dirinya).
-- (2) direktori usaha jamaah: tampil untuk anggota yang login + pengurus, tanpa nomor HP & tanpa foto;
--     dicatat admin pusat, ketua, koordinator (pemilik di wilayahnya); Buka/Tutup, tidak dihapus.
-- Direktori tidak pernah menampilkan kondisi ekonomi. Semua perubahan masuk log_perubahan.

create type public.tingkat_ekonomi as enum ('mampu','cukup','kurang','sangat_kurang');
create type public.jenis_usaha as enum ('makanan','pertanian','toko','kerajinan','pakaian','herbal','jasa','lainnya');
create type public.status_usaha as enum ('buka','tutup');

-- ===================== Kondisi ekonomi (tertutup total, lewat fungsi) =====================
create table public.ekonomi_jamaah (
  jamaah_id   bigint primary key references public.jamaah(id),
  tingkat     public.tingkat_ekonomi not null,
  tanggungan  smallint not null default 0 check (tanggungan between 0 and 30),
  didata_tgl  date not null check (didata_tgl >= date '2000-01-01'),
  keterangan  text check (length(keterangan) <= 200 and keterangan !~ '[0-9]{8,}'),
  didata_oleh uuid,
  diubah_pada timestamptz not null default now()
);
create index on public.ekonomi_jamaah (tingkat);

alter table public.ekonomi_jamaah enable row level security;
revoke all on public.ekonomi_jamaah from anon, authenticated;   -- tanpa policy & tanpa hak tabel: hanya lewat fungsi

create function private.catat_ekonomi() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  new.didata_oleh := (select auth.uid());
  new.diubah_pada := now();
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('diubah_pada','didata_oleh');
    if beda is null then return new; end if;
  else
    beda := jsonb_build_object('tingkat', new.tingkat, 'tanggungan', new.tanggungan, 'didata_tgl', new.didata_tgl);
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('ekonomi_jamaah', new.jamaah_id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_ekonomi() from public, anon, authenticated;
create trigger catat before insert or update on public.ekonomi_jamaah for each row execute function private.catat_ekonomi();

-- Simpan (tambah atau ubah). Hak = private.boleh_lihat_bantuan (ketua, bendahara semua; koordinator wilayahnya).
create function public.simpan_ekonomi(p_jamaah_id bigint, p_tingkat public.tingkat_ekonomi, p_tanggungan smallint default 0,
  p_tanggal date default null, p_keterangan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j record; tgl date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  ket text := nullif(btrim(regexp_replace(coalesce(p_keterangan, ''), '\s+', ' ', 'g')), '');
begin
  if private.sesi_saya_terbatas() or coalesce(private.peran_saya() not in ('ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select id, nama, aktif, wafat into j from public.jamaah where id = p_jamaah_id;
  if j.id is null or not private.boleh_lihat_bantuan(j.id) then
    raise exception 'Jamaah tidak ditemukan di wilayah Anda.' using errcode = '42501';
  end if;
  if j.wafat then raise exception '% tercatat wafat. Kondisi ekonomi tidak perlu didata.', j.nama using errcode = 'P0001'; end if;
  if not j.aktif then raise exception '% berstatus tidak aktif.', j.nama using errcode = 'P0001'; end if;
  if p_tingkat is null then raise exception 'Pilih tingkat ekonomi.' using errcode = '22023'; end if;
  if coalesce(p_tanggungan, 0) not between 0 and 30 then raise exception 'Jumlah tanggungan 0 sampai 30.' using errcode = '22023'; end if;
  if tgl > (now() at time zone 'Asia/Jakarta')::date or tgl < date '2000-01-01' then
    raise exception 'Tanggal didata tidak valid.' using errcode = '22023';
  end if;
  if length(coalesce(ket, '')) > 200 then raise exception 'Keterangan maksimal 200 huruf.' using errcode = '22023'; end if;
  if ket ~ '[0-9]{8,}' then raise exception 'Jangan menulis nomor HP atau NIK di keterangan.' using errcode = '22023'; end if;
  -- ubah dulu, tambah bila belum ada (tanpa ON CONFLICT agar log tidak mencatat "insert" palsu)
  update public.ekonomi_jamaah set tingkat = p_tingkat, tanggungan = coalesce(p_tanggungan, 0), didata_tgl = tgl, keterangan = ket
  where jamaah_id = j.id;
  if not found then
    insert into public.ekonomi_jamaah (jamaah_id, tingkat, tanggungan, didata_tgl, keterangan)
    values (j.id, p_tingkat, coalesce(p_tanggungan, 0), tgl, ket);
  end if;
  return jsonb_build_object('jamaah_id', j.id, 'nama', j.nama, 'tingkat', p_tingkat);
end $$;

-- Daftar jamaah aktif & hidup + kondisi ekonomi (nama hanya untuk yang berhak).
-- p_belum = true: hanya yang belum didata. p_belum_dibantu = true: hanya yang belum pernah menerima bantuan disalurkan.
create function public.daftar_ekonomi(p_tingkat public.tingkat_ekonomi default null, p_kab bigint default null, p_kec bigint default null,
  p_desa bigint default null, p_belum boolean default false, p_belum_dibantu boolean default false, p_cari text default null,
  p_jamaah_id bigint default null, p_offset integer default 0, p_batas integer default 20)
returns table (jamaah_id bigint, nomor_anggota bigint, nama text, desa text, kecamatan text, kabupaten text, pekerjaan text,
  tingkat public.tingkat_ekonomi, tanggungan smallint, didata_tgl date, keterangan text, diubah_pada timestamptz,
  dibantu bigint, dibantu_terakhir date, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', ''); peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select j.id, j.nomor_anggota, j.nama, d.nama, kc.nama, kb.nama, j.pekerjaan,
    e.tingkat, e.tanggungan, e.didata_tgl, e.keterangan, e.diubah_pada,
    coalesce(b.n, 0), b.terakhir, count(*) over ()
  from public.jamaah j
  join public.desa d on d.id = j.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  left join public.ekonomi_jamaah e on e.jamaah_id = j.id
  left join lateral (select count(*) n, max(x.disalurkan_tgl) terakhir from public.bantuan x
    where x.jamaah_id = j.id and x.status = 'disalurkan') b on true
  where j.aktif and not j.wafat
    and (peran <> 'koordinator_wilayah' or kc.id in (select w.kecamatan_id from public.pengguna_wilayah w where w.user_id = (select auth.uid())))
    and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab) and (p_desa is null or d.id = p_desa)
    and (p_tingkat is null or e.tingkat = p_tingkat)
    and (not coalesce(p_belum, false) or e.jamaah_id is null)
    and (not coalesce(p_belum_dibantu, false) or coalesce(b.n, 0) = 0)
    and (p_jamaah_id is null or j.id = p_jamaah_id)
    and (cari is null or j.nama ilike '%' || cari || '%' or j.nomor_anggota::text = cari)
  order by e.tingkat desc nulls last, kb.nama, kc.nama, d.nama, j.nama, j.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;

-- Ringkasan tanpa nama: admin pusat, ketua, bendahara (semua), koordinator (wilayahnya). Jamaah aktif & hidup saja.
create function public.ringkas_ekonomi(p_kab bigint default null, p_kec bigint default null, p_desa bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('admin_pusat','ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return (
    with j as (
      select j.id, e.tingkat, e.tanggungan,
        exists (select 1 from public.bantuan x where x.jamaah_id = j.id and x.status = 'disalurkan') dibantu
      from public.jamaah j join public.desa d on d.id = j.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id
      left join public.ekonomi_jamaah e on e.jamaah_id = j.id
      where j.aktif and not j.wafat
        and (peran <> 'koordinator_wilayah' or kc.id in (select w.kecamatan_id from public.pengguna_wilayah w where w.user_id = (select auth.uid())))
        and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab) and (p_desa is null or d.id = p_desa))
    select jsonb_build_object(
      'jamaah', count(*),
      'didata', count(tingkat),
      'belum', count(*) - count(tingkat),
      'mampu', count(*) filter (where tingkat = 'mampu'),
      'cukup', count(*) filter (where tingkat = 'cukup'),
      'kurang', count(*) filter (where tingkat = 'kurang'),
      'sangat_kurang', count(*) filter (where tingkat = 'sangat_kurang'),
      'kurang_belum_dibantu', count(*) filter (where tingkat in ('kurang','sangat_kurang') and not dibantu),
      'rata_tanggungan', round(avg(tanggungan), 1))
    from j);
end $$;

revoke all on function public.simpan_ekonomi(bigint, public.tingkat_ekonomi, smallint, date, text),
  public.daftar_ekonomi(public.tingkat_ekonomi, bigint, bigint, bigint, boolean, boolean, text, bigint, integer, integer),
  public.ringkas_ekonomi(bigint, bigint, bigint) from public, anon;
grant execute on function public.simpan_ekonomi(bigint, public.tingkat_ekonomi, smallint, date, text),
  public.daftar_ekonomi(public.tingkat_ekonomi, bigint, bigint, bigint, boolean, boolean, text, bigint, integer, integer),
  public.ringkas_ekonomi(bigint, bigint, bigint) to authenticated;

-- ===================== Direktori usaha jamaah =====================
create table public.usaha_jamaah (
  id          bigint generated always as identity primary key,
  jamaah_id   bigint not null references public.jamaah(id),         -- pemilik
  nama        text not null check (length(btrim(nama)) between 2 and 80 and nama !~ '[0-9]{8,}'),
  jenis       public.jenis_usaha not null,
  produk      text check (length(produk) <= 300 and produk !~ '[0-9]{8,}'),     -- tanpa nomor HP
  desa_id     integer not null references public.desa(id),          -- lokasi usaha
  alamat      text check (length(alamat) <= 150 and alamat !~ '[0-9]{8,}'),
  jam_buka    text check (length(jam_buka) <= 80 and jam_buka !~ '[0-9]{8,}'),
  status      public.status_usaha not null default 'buka',
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index on public.usaha_jamaah (jamaah_id);
create index on public.usaha_jamaah (desa_id);
create index on public.usaha_jamaah (status, jenis);

-- Mencatat: admin pusat & ketua (semua), koordinator (pemilik jamaah wilayahnya). Sesi KTA lama tidak.
create function private.boleh_catat_usaha(p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'admin_pusat' then true when 'ketua' then true
    when 'koordinator_wilayah' then private.jamaah_di_wilayah_saya(p_jamaah_id)
    else false end, false)
$$;
revoke all on function private.boleh_catat_usaha(bigint) from public, anon;
grant execute on function private.boleh_catat_usaha(bigint) to authenticated;

alter table public.usaha_jamaah enable row level security;
-- Tabel hanya untuk pencatat (baca baris yang boleh ia ubah, tambah, ubah). Semua pemakai lain membaca lewat daftar_usaha().
create policy baca on public.usaha_jamaah for select to authenticated using ((select private.boleh_catat_usaha(jamaah_id)));
create policy tambah on public.usaha_jamaah for insert to authenticated with check ((select private.boleh_catat_usaha(jamaah_id)));
create policy ubah on public.usaha_jamaah for update to authenticated
  using ((select private.boleh_catat_usaha(jamaah_id))) with check ((select private.boleh_catat_usaha(jamaah_id)));
-- Tidak ada policy DELETE: usaha ditandai Tutup, tidak dihapus.
revoke all on public.usaha_jamaah from anon, authenticated;
grant select on public.usaha_jamaah to authenticated;
grant insert (jamaah_id, nama, jenis, produk, desa_id, alamat, jam_buka, status) on public.usaha_jamaah to authenticated;
grant update (nama, jenis, produk, desa_id, alamat, jam_buka, status) on public.usaha_jamaah to authenticated;

create function private.catat_usaha() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb; ok boolean;
begin
  if tg_op = 'INSERT' then
    select aktif and not wafat into ok from public.jamaah where id = new.jamaah_id;
    if not coalesce(ok, false) then raise exception 'Pemilik usaha harus jamaah aktif.' using errcode = 'P0001'; end if;
    new.dibuat_oleh := (select auth.uid());
    new.dibuat_pada := now();
  else
    new.jamaah_id := old.jamaah_id;           -- pemilik tidak bisa diganti
    new.dibuat_oleh := old.dibuat_oleh;
    new.dibuat_pada := old.dibuat_pada;
  end if;
  new.nama := btrim(regexp_replace(new.nama, '\s+', ' ', 'g'));
  new.diubah_pada := now();
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  else
    beda := jsonb_build_object('nama', new.nama, 'jamaah_id', new.jamaah_id, 'jenis', new.jenis);
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('usaha_jamaah', new.id,
    case when tg_op = 'INSERT' then 'insert' when new.status is distinct from old.status then new.status::text else 'update' end, beda);
  return new;
end $$;
revoke all on function private.catat_usaha() from public, anon, authenticated;
create trigger catat before insert or update on public.usaha_jamaah for each row execute function private.catat_usaha();

-- Daftar usaha: semua peran yang login (pengurus + anggota, termasuk sesi KTA lama). Anggota & peran yang tidak
-- mencatat hanya melihat yang Buka dan tanpa Nomor Anggota. Tidak pernah menyertakan kondisi ekonomi.
create function public.daftar_usaha(p_cari text default null, p_jenis public.jenis_usaha default null, p_kab bigint default null,
  p_kec bigint default null, p_status public.status_usaha default 'buka', p_jamaah_id bigint default null, p_id bigint default null,
  p_offset integer default 0, p_batas integer default 20)
returns table (id bigint, nama text, jenis public.jenis_usaha, produk text, alamat text, jam_buka text, status public.status_usaha,
  desa_id integer, desa text, kecamatan text, kabupaten text, jamaah_id bigint, pemilik text, nomor_anggota bigint,
  boleh_ubah boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', '');
  peran public.peran := private.peran_saya(); pencatat boolean;
begin
  if peran is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  pencatat := not private.sesi_saya_terbatas() and peran in ('admin_pusat','ketua','koordinator_wilayah');
  return query
  select u.id, u.nama, u.jenis, u.produk, u.alamat, u.jam_buka, u.status, d.id, d.nama, kc.nama, kb.nama,
    case when pencatat then u.jamaah_id end, j.nama,
    case when pencatat then j.nomor_anggota end,
    pencatat and private.boleh_catat_usaha(u.jamaah_id),
    count(*) over ()
  from public.usaha_jamaah u
  join public.jamaah j on j.id = u.jamaah_id
  join public.desa d on d.id = u.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  where (case when pencatat then p_status is null or u.status = p_status else u.status = 'buka' and not j.wafat end)
    and (p_jenis is null or u.jenis = p_jenis)
    and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)
    and (p_jamaah_id is null or u.jamaah_id = p_jamaah_id) and (p_id is null or u.id = p_id)
    and (cari is null or u.nama ilike '%' || cari || '%' or u.produk ilike '%' || cari || '%' or j.nama ilike '%' || cari || '%')
  order by u.status, kb.nama, kc.nama, d.nama, u.nama, u.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;

-- Ringkasan usaha (Beranda & Dashboard): semua peran yang login; hanya angka.
create function public.ringkas_usaha(p_kab bigint default null, p_kec bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.peran_saya() is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return (
    with u as (
      select u.jenis, u.status, u.jamaah_id from public.usaha_jamaah u
      join public.jamaah j on j.id = u.jamaah_id
      join public.desa d on d.id = u.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id
      where not j.wafat and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab))
    select jsonb_build_object(
      'buka', count(*) filter (where status = 'buka'),
      'tutup', count(*) filter (where status = 'tutup'),
      'pemilik', count(distinct jamaah_id) filter (where status = 'buka'),
      'jenis', coalesce((select jsonb_object_agg(jenis, n) from (
        select jenis::text jenis, count(*) n from u where status = 'buka' group by 1) x), '{}'::jsonb))
    from u);
end $$;

revoke all on function public.daftar_usaha(text, public.jenis_usaha, bigint, bigint, public.status_usaha, bigint, bigint, integer, integer),
  public.ringkas_usaha(bigint, bigint) from public, anon;
grant execute on function public.daftar_usaha(text, public.jenis_usaha, bigint, bigint, public.status_usaha, bigint, bigint, integer, integer),
  public.ringkas_usaha(bigint, bigint) to authenticated;
