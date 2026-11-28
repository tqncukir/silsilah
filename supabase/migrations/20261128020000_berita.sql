-- Tahap 14 Langkah 1: Berita. Keputusan Kang Salman 2026-11-28:
-- admin pusat & ketua menerbitkan langsung; koordinator menulis, tampil setelah disetujui (ketua, juga admin pusat);
-- satu foto sampul per berita; pembaca dipilih per berita (Publik / Khusus anggota);
-- tampil di halaman depan, halaman Berita, dan Beranda setelah login.
-- Berita tidak pernah dihapus: Draf -> Diajukan -> Terbit / Ditolak; Terbit bisa Ditarik dan diterbitkan lagi.
-- Tabel tertutup total (tanpa policy): semua lewat fungsi. Setiap perubahan masuk log_perubahan.

create type public.status_berita as enum ('draf','diajukan','terbit','ditolak','ditarik');

create table public.berita (
  id             bigint generated always as identity primary key,
  judul          text not null check (length(btrim(judul)) between 5 and 120),
  isi            text not null check (length(btrim(isi)) between 20 and 10000 and isi !~ '[0-9]{10,}'),  -- tanpa nomor HP/NIK
  foto           text check (foto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'),
  khusus_anggota boolean not null default false,
  kecamatan_id   integer references public.kecamatan(id),     -- kosong = pusat
  status         public.status_berita not null default 'draf',
  alasan_tolak   text check (length(btrim(alasan_tolak)) between 3 and 200),
  terbit_pada    timestamptz,
  penulis        uuid not null,
  diputus_oleh   uuid,
  dibuat_pada    timestamptz not null default now(),
  diubah_pada    timestamptz not null default now(),
  check ((status = 'ditolak') = (alasan_tolak is not null)),
  check (status not in ('terbit','ditarik') or terbit_pada is not null)
);
create index on public.berita (status, terbit_pada desc);
create index on public.berita (penulis, diubah_pada desc);

alter table public.berita enable row level security;   -- tanpa policy: tertutup total
revoke all on public.berita from anon, authenticated;

-- ===== Jejak audit =====
create function private.catat_berita() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kunci text[];
begin
  new.diubah_pada := now();
  if tg_op = 'UPDATE' then
    new.penulis := old.penulis; new.dibuat_pada := old.dibuat_pada;
    select array_agg(n.key order by n.key) into kunci
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('diubah_pada');
    if kunci is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('berita', new.id,
    case when tg_op = 'INSERT' then 'insert' when new.status is distinct from old.status then new.status::text else 'update' end,
    case when tg_op = 'INSERT' then jsonb_build_object('judul', new.judul, 'status', new.status)
         else jsonb_build_object('kolom', to_jsonb(kunci), 'judul', new.judul,
           'status', jsonb_build_array(old.status, new.status)) end);
  return new;
end $$;
revoke all on function private.catat_berita() from public, anon, authenticated;
create trigger catat before insert or update on public.berita for each row execute function private.catat_berita();

-- ===== Hak =====
create function private.peran_berita() returns text
language sql stable security definer set search_path = '' as $$
  select case when private.sesi_saya_terbatas() then null
    when private.peran_saya() in ('admin_pusat','ketua') then 'pimpinan'
    when private.peran_saya() = 'koordinator_wilayah' then 'koordinator' end
$$;
revoke all on function private.peran_berita() from public, anon;
grant execute on function private.peran_berita() to authenticated;

-- ===== Tempat foto (Supabase Storage) =====
-- Folder publik "berita": file bernama acak (uuid), maks 400 KB, WebP/JPEG. Tidak bisa didaftar isinya.
-- Unggah: pimpinan & koordinator. Hapus: pengunggah sendiri atau pimpinan. Tidak bisa ditimpa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('berita', 'berita', true, 400000, array['image/webp','image/jpeg'])
on conflict (id) do nothing;

create policy berita_unggah on storage.objects for insert to authenticated with check (
  bucket_id = 'berita' and (select private.peran_berita()) is not null
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$');
-- Hapus butuh izin melihat baris: pimpinan semua file berita, koordinator file unggahannya sendiri (tamu tetap lewat alamat publik).
create policy berita_lihat on storage.objects for select to authenticated using (
  bucket_id = 'berita' and ((select private.peran_berita()) = 'pimpinan'
    or ((select private.peran_berita()) = 'koordinator' and owner_id = (select auth.uid())::text)));
create policy berita_hapus on storage.objects for delete to authenticated using (
  bucket_id = 'berita' and ((select private.peran_berita()) = 'pimpinan'
    or ((select private.peran_berita()) = 'koordinator' and owner_id = (select auth.uid())::text)));

-- ===== Tulis / ubah (p_kirim: pimpinan = terbitkan, koordinator = ajukan) =====
create function public.simpan_berita(p_id bigint, p_judul text, p_isi text, p_foto text default null,
  p_khusus_anggota boolean default false, p_kecamatan_id integer default null, p_kirim boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pb text := private.peran_berita(); b public.berita; bid bigint;
  v_jdl text := nullif(btrim(regexp_replace(coalesce(p_judul, ''), '\s+', ' ', 'g')), '');
  v_isi text := nullif(btrim(regexp_replace(coalesce(p_isi, ''), E'[ \\t]+', ' ', 'g')), '');
  ft text := nullif(btrim(coalesce(p_foto, '')), '');
  st public.status_berita;
begin
  if pb is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  v_isi := regexp_replace(v_isi, E'\\n{3,}', E'\n\n', 'g');
  if length(coalesce(v_jdl, '')) < 5 then raise exception 'Judul terlalu pendek (minimal 5 huruf).' using errcode = '22023'; end if;
  if length(v_jdl) > 120 then raise exception 'Judul terlalu panjang (maksimal 120 huruf).' using errcode = '22023'; end if;
  if length(coalesce(v_isi, '')) < 20 then raise exception 'Isi berita terlalu pendek (minimal 20 huruf).' using errcode = '22023'; end if;
  if length(v_isi) > 10000 then raise exception 'Isi berita terlalu panjang (maksimal 10.000 huruf).' using errcode = '22023'; end if;
  if v_jdl ~ '[0-9]{10,}' or v_isi ~ '[0-9]{10,}' then raise exception 'Jangan menulis nomor HP atau NIK di berita.' using errcode = '22023'; end if;
  if ft is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'berita' and o.name = ft) then
    raise exception 'Foto belum terunggah. Coba pilih foto lagi.' using errcode = '22023';
  end if;
  if pb = 'koordinator' and (p_kecamatan_id is null or not private.boleh_kelola_kegiatan(p_kecamatan_id)) then
    raise exception 'Pilih kecamatan wilayah Anda.' using errcode = '42501';
  end if;
  if p_kecamatan_id is not null and not exists (select 1 from public.kecamatan k where k.id = p_kecamatan_id) then
    raise exception 'Kecamatan tidak dikenal.' using errcode = '22023';
  end if;

  if p_id is null then
    st := case when not p_kirim then 'draf' when pb = 'pimpinan' then 'terbit' else 'diajukan' end;
    insert into public.berita (judul, isi, foto, khusus_anggota, kecamatan_id, status, terbit_pada, penulis, diputus_oleh)
    values (v_jdl, v_isi, ft, coalesce(p_khusus_anggota, false), p_kecamatan_id, st,
      case when st = 'terbit' then now() end, (select auth.uid()), case when st = 'terbit' then (select auth.uid()) end)
    returning id into bid;
    return jsonb_build_object('id', bid, 'status', st);
  end if;

  select * into b from public.berita where id = p_id for update;
  if not found then raise exception 'Berita tidak ditemukan.' using errcode = 'P0001'; end if;
  if pb = 'koordinator' and (b.penulis <> (select auth.uid()) or b.status not in ('draf','diajukan','ditolak')) then
    raise exception 'Berita ini tidak bisa Anda ubah lagi.' using errcode = '42501';
  end if;
  st := case
    when b.status in ('terbit','ditarik') then b.status                       -- pimpinan mengubah berita yang sudah terbit/ditarik
    when not p_kirim then (case when b.status = 'diajukan' then 'draf' else b.status end)
    when pb = 'pimpinan' then 'terbit' else 'diajukan' end;
  if st = 'ditolak' then st := 'draf'; end if;                                 -- ditolak lalu diubah = draf lagi
  update public.berita set judul = v_jdl, isi = v_isi, foto = ft, khusus_anggota = coalesce(p_khusus_anggota, false),
    kecamatan_id = p_kecamatan_id, status = st, alasan_tolak = null,
    terbit_pada = case when st = 'terbit' and b.terbit_pada is null then now() else b.terbit_pada end,
    diputus_oleh = case when st = 'terbit' and b.status <> 'terbit' then (select auth.uid()) else b.diputus_oleh end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'status', st, 'foto_lama', case when b.foto is distinct from ft then b.foto end);
end $$;

-- ===== Setujui / tolak berita koordinator (pimpinan) =====
create function public.putuskan_berita(p_id bigint, p_setuju boolean, p_alasan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.berita; als text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if private.peran_berita() is distinct from 'pimpinan' then raise exception 'tidak berhak' using errcode = '42501'; end if;
  select * into b from public.berita where id = p_id for update;
  if not found then raise exception 'Berita tidak ditemukan.' using errcode = 'P0001'; end if;
  if b.status <> 'diajukan' then raise exception 'Berita ini tidak sedang menunggu persetujuan.' using errcode = 'P0001'; end if;
  if not p_setuju and length(coalesce(als, '')) < 3 then raise exception 'Tulis alasan penolakan.' using errcode = '22023'; end if;
  update public.berita set
    status = case when p_setuju then 'terbit'::public.status_berita else 'ditolak' end,
    alasan_tolak = case when p_setuju then null else left(als, 200) end,
    terbit_pada = case when p_setuju then coalesce(terbit_pada, now()) else terbit_pada end,
    diputus_oleh = (select auth.uid())
  where id = p_id;
end $$;

-- ===== Tarik / terbitkan lagi (pimpinan) =====
create function public.tarik_berita(p_id bigint, p_tarik boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.berita;
begin
  if private.peran_berita() is distinct from 'pimpinan' then raise exception 'tidak berhak' using errcode = '42501'; end if;
  select * into b from public.berita where id = p_id for update;
  if not found then raise exception 'Berita tidak ditemukan.' using errcode = 'P0001'; end if;
  if p_tarik and b.status <> 'terbit' then raise exception 'Hanya berita terbit yang bisa ditarik.' using errcode = 'P0001'; end if;
  if not p_tarik and b.status <> 'ditarik' then raise exception 'Berita ini tidak sedang ditarik.' using errcode = 'P0001'; end if;
  update public.berita set status = case when p_tarik then 'ditarik'::public.status_berita else 'terbit' end,
    diputus_oleh = (select auth.uid()) where id = p_id;
end $$;

-- ===== Daftar untuk pengurus (pimpinan: semua; koordinator: tulisannya sendiri) =====
create function public.daftar_berita_kelola(p_status public.status_berita default null, p_cari text default null,
  p_id bigint default null, p_dari integer default 0, p_batas integer default 20)
returns table (id bigint, judul text, isi text, foto text, khusus_anggota boolean, kecamatan_id integer, wilayah text,
  status public.status_berita, alasan_tolak text, terbit_pada timestamptz, diubah_pada timestamptz, punya_saya boolean,
  boleh_ubah boolean, boleh_putus boolean, boleh_tarik boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare pb text := private.peran_berita(); q text := nullif(btrim(coalesce(p_cari, '')), '');
begin
  if pb is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return query
  select b.id, b.judul, case when p_id is null then left(b.isi, 200) else b.isi end, b.foto, b.khusus_anggota, b.kecamatan_id,
    coalesce('Kec. ' || k.nama, 'Pusat'), b.status, b.alasan_tolak, b.terbit_pada, b.diubah_pada,
    b.penulis = (select auth.uid()),
    pb = 'pimpinan' or (b.penulis = (select auth.uid()) and b.status in ('draf','diajukan','ditolak')),
    pb = 'pimpinan' and b.status = 'diajukan',
    pb = 'pimpinan' and b.status in ('terbit','ditarik'),
    count(*) over ()
  from public.berita b left join public.kecamatan k on k.id = b.kecamatan_id
  where (pb = 'pimpinan' or b.penulis = (select auth.uid()))
    and (p_id is null or b.id = p_id)
    and (p_status is null or b.status = p_status)
    and (q is null or b.judul ilike '%' || replace(replace(q, '%', ''), '_', '') || '%')
  order by (b.status = 'diajukan') desc, b.diubah_pada desc
  offset greatest(coalesce(p_dari, 0), 0) limit least(greatest(coalesce(p_batas, 20), 1), 100);
end $$;

-- ===== Baca berita (tamu: publik saja; yang login: publik + khusus anggota) =====
create function public.baca_berita(p_id bigint default null, p_dari integer default 0, p_batas integer default 10)
returns table (id bigint, judul text, isi text, foto text, khusus_anggota boolean, wilayah text, terbit_pada timestamptz, total bigint)
language sql stable security definer set search_path = '' as $$
  select b.id, b.judul, case when p_id is null then left(b.isi, 240) else b.isi end, b.foto, b.khusus_anggota,
    coalesce('Kec. ' || k.nama, 'Pusat'), b.terbit_pada, count(*) over ()
  from public.berita b left join public.kecamatan k on k.id = b.kecamatan_id
  where b.status = 'terbit' and (p_id is null or b.id = p_id)
    and (not b.khusus_anggota or private.peran_saya() is not null)
  order by b.terbit_pada desc, b.id desc
  offset greatest(coalesce(p_dari, 0), 0) limit least(greatest(coalesce(p_batas, 10), 1), 50)
$$;

-- Jumlah berita menunggu persetujuan (ubin Beranda pimpinan)
create function public.berita_menunggu() returns integer
language sql stable security definer set search_path = '' as $$
  select case when private.peran_berita() = 'pimpinan'
    then (select count(*)::integer from public.berita where status = 'diajukan') else 0 end
$$;

revoke all on function public.simpan_berita(bigint, text, text, text, boolean, integer, boolean),
  public.putuskan_berita(bigint, boolean, text), public.tarik_berita(bigint, boolean),
  public.daftar_berita_kelola(public.status_berita, text, bigint, integer, integer),
  public.baca_berita(bigint, integer, integer), public.berita_menunggu() from public, anon;
grant execute on function public.simpan_berita(bigint, text, text, text, boolean, integer, boolean),
  public.putuskan_berita(bigint, boolean, text), public.tarik_berita(bigint, boolean),
  public.daftar_berita_kelola(public.status_berita, text, bigint, integer, integer),
  public.berita_menunggu() to authenticated;
grant execute on function public.baca_berita(bigint, integer, integer) to anon, authenticated;
