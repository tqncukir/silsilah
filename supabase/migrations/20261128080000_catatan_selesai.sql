-- Catatan pengecekan data selesai (Kang 2026-11-28): catatan impor tidak hilang walau data jamaahnya sudah diperbaiki.
-- Keputusan Kang: (1) otomatis selesai saat data jamaah disimpan lewat Ubah Data (kolom desa_id ikut dikirim) +
-- tombol "Sudah benar" untuk yang tidak perlu diubah; (2) catatan TIDAK dihapus, hanya ditandai selesai (siapa & kapan).
alter table public.jamaah_cek
  add column selesai_pada timestamptz,
  add column selesai_oleh uuid;
create index jamaah_cek_belum on public.jamaah_cek (catatan) where selesai_pada is null;

-- Otomatis: Ubah Data jamaah (desa_id ada di kiriman) = wilayahnya sudah diperiksa pengurus.
create function private.catatan_selesai_otomatis() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.jamaah_cek set selesai_pada = now(), selesai_oleh = auth.uid()
  where jamaah_id = new.id and selesai_pada is null;
  return new;
end $$;
revoke all on function private.catatan_selesai_otomatis() from public, anon, authenticated;
create trigger catatan_diperiksa after update of desa_id on public.jamaah
  for each row when (auth.uid() is not null)
  execute function private.catatan_selesai_otomatis();

-- Tombol "Sudah benar": admin pusat, ketua, koordinator (hanya wilayahnya). Sesi KTA lama ditolak.
create function public.catatan_selesai(p_jamaah bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_desa integer;
begin
  if private.sesi_saya_terbatas() or coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua', 'koordinator_wilayah') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select j.desa_id into v_desa from public.jamaah j where j.id = p_jamaah;
  if v_desa is null or not private.boleh_kelola_desa(v_desa) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  update public.jamaah_cek set selesai_pada = now(), selesai_oleh = auth.uid()
  where jamaah_id = p_jamaah and selesai_pada is null;
end $$;
revoke all on function public.catatan_selesai(bigint) from public, anon;
grant execute on function public.catatan_selesai(bigint) to authenticated;

-- Dashboard & daftar catatan: hanya catatan yang belum selesai.
create or replace function public.dashboard_pengurus(
  p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare hasil jsonb;
begin
  if coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  with dasar as materialized (
    select j.id, j.umur_daftar, j.pekerjaan, j.tanggal_daftar, j.jenis_kelamin,
           d.id desa_id, d.nama desa, c.id kec_id, c.nama kec, k.id kab_id, k.nama kab, x.catatan
    from public.jamaah j
    join public.desa d on d.id = j.desa_id
    join public.kecamatan c on c.id = d.kecamatan_id
    join public.kabupaten k on k.id = c.kabupaten_id
    left join public.jamaah_cek x on x.jamaah_id = j.id and x.selesai_pada is null
    where (p_kab is null or k.id = p_kab) and (p_kec is null or c.id = p_kec) and (p_desa is null or d.id = p_desa)
      and (p_dari is null or j.tanggal_daftar >= p_dari) and (p_sampai is null or j.tanggal_daftar <= p_sampai)
  )
  select jsonb_build_object(
    'total', (select count(distinct id) from dasar),
    'kabupaten', (select count(distinct kab_id) from dasar),
    'catatan_total', (select count(distinct id) from dasar where catatan is not null),
    'tingkat', case when p_kec is not null or p_desa is not null then 'desa' when p_kab is not null then 'kecamatan' else 'kabupaten' end,
    'sebaran', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'nama', w.nama, 'n', w.n) order by w.n desc, w.nama)
      from (select case when p_kec is not null or p_desa is not null then desa_id when p_kab is not null then kec_id else kab_id end id,
                   case when p_kec is not null or p_desa is not null then desa when p_kab is not null then kec else kab end nama,
                   count(distinct dasar.id) n
            from dasar group by 1, 2) w), '[]'::jsonb),
    'usia', (select jsonb_build_object(
        'u30', count(*) filter (where umur_daftar between 10 and 29),
        'u44', count(*) filter (where umur_daftar between 30 and 44),
        'u59', count(*) filter (where umur_daftar between 45 and 59),
        'u69', count(*) filter (where umur_daftar between 60 and 69),
        'u70', count(*) filter (where umur_daftar between 70 and 110),
        'tidak_valid', count(*) filter (where umur_daftar is null or umur_daftar not between 10 and 110)) from dasar),
    'bulan', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'n', n) order by b)
      from (select to_char(tanggal_daftar, 'YYYY-MM') b, count(distinct id) n from dasar group by 1) m), '[]'::jsonb),
    'catatan', coalesce((select jsonb_agg(jsonb_build_object('catatan', catatan, 'n', n) order by n desc)
      from (select catatan, count(distinct id) n from dasar where catatan is not null group by 1) t), '[]'::jsonb),
    'pekerjaan', coalesce((select jsonb_agg(jsonb_build_object('p', pekerjaan, 'n', n))
      from (select pekerjaan, count(distinct id) n from dasar group by 1) t), '[]'::jsonb),
    'jk', (select jsonb_build_object(
        'l', count(distinct id) filter (where jenis_kelamin = 'L'),
        'p', count(distinct id) filter (where jenis_kelamin = 'P'),
        'kosong', count(distinct id) filter (where jenis_kelamin is null)) from dasar),
    'jk_tebakan', (select count(distinct dasar.id) from dasar join public.jamaah_jk_tebakan t on t.jamaah_id = dasar.id where not t.perlu_dicek),
    'rentang', (select jsonb_build_object('awal', min(tanggal_daftar), 'akhir', max(tanggal_daftar)) from public.jamaah)
  ) into hasil;
  return hasil;
end $$;
revoke all on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) to authenticated;

revoke all on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) to authenticated;

create or replace function public.dashboard_catatan_daftar(
  p_catatan text, p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null)
returns table (id bigint, nomor_anggota bigint, nama text, desa text, kecamatan text, kabupaten text, catatan text)
language sql stable security invoker set search_path = '' as $$
  select j.id, j.nomor_anggota, j.nama, d.nama, c.nama, k.nama, x.catatan
  from public.jamaah_cek x
  join public.jamaah j on j.id = x.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan c on c.id = d.kecamatan_id
  join public.kabupaten k on k.id = c.kabupaten_id
  where x.catatan = p_catatan and x.selesai_pada is null
    and coalesce(private.peran_saya()::text, '') in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah')
    and (p_kab is null or k.id = p_kab) and (p_kec is null or c.id = p_kec) and (p_desa is null or d.id = p_desa)
    and (p_dari is null or j.tanggal_daftar >= p_dari) and (p_sampai is null or j.tanggal_daftar <= p_sampai)
  order by k.nama, c.nama, d.nama, j.nama
  limit 1000
$$;
revoke all on function public.dashboard_catatan_daftar(text, bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_catatan_daftar(text, bigint, bigint, bigint, date, date) to authenticated;
