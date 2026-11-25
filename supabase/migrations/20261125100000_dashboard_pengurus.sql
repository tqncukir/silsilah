-- Dashboard Pengurus: hanya membaca. Agregat dihitung di server dan mengikuti hak akses (RLS) tabel jamaah.
-- 1) Catatan pengecekan dari impor data asli (kolom "cek" file impor). Disimpan terpisah, isian anggota tidak diubah.
create table public.jamaah_cek (
  jamaah_id    bigint primary key references public.jamaah(id),
  catatan      text not null check (length(catatan) between 1 and 200),
  dicatat_pada timestamptz not null default now()
);
alter table public.jamaah_cek enable row level security;
-- Boleh dibaca kalau baris jamaahnya boleh dibaca (RLS jamaah ikut berlaku di subquery).
create policy baca on public.jamaah_cek for select to authenticated
  using (exists (select 1 from public.jamaah j where j.id = jamaah_id));
revoke all on public.jamaah_cek from anon;
grant select on public.jamaah_cek to authenticated;

-- 2) Agregat dashboard. SECURITY INVOKER: hanya menghitung baris yang boleh dilihat akun ini.
create function public.dashboard_pengurus(
  p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare hasil jsonb;
begin
  if coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  with dasar as materialized (
    select j.id, j.umur_daftar, j.pekerjaan, j.tanggal_daftar,
           d.id desa_id, d.nama desa, c.id kec_id, c.nama kec, k.id kab_id, k.nama kab, x.catatan
    from public.jamaah j
    join public.desa d on d.id = j.desa_id
    join public.kecamatan c on c.id = d.kecamatan_id
    join public.kabupaten k on k.id = c.kabupaten_id
    left join public.jamaah_cek x on x.jamaah_id = j.id
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
    'rentang', (select jsonb_build_object('awal', min(tanggal_daftar), 'akhir', max(tanggal_daftar)) from public.jamaah)
  ) into hasil;
  return hasil;
end $$;
revoke all on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_pengurus(bigint, bigint, bigint, date, date) to authenticated;

-- 3) Daftar anggota untuk satu catatan (klik batang Catatan Pengecekan). Juga mengikuti RLS.
create function public.dashboard_catatan_daftar(
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
  where x.catatan = p_catatan
    and coalesce(private.peran_saya()::text, '') in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah')
    and (p_kab is null or k.id = p_kab) and (p_kec is null or c.id = p_kec) and (p_desa is null or d.id = p_desa)
    and (p_dari is null or j.tanggal_daftar >= p_dari) and (p_sampai is null or j.tanggal_daftar <= p_sampai)
  order by k.nama, c.nama, d.nama, j.nama
  limit 1000
$$;
revoke all on function public.dashboard_catatan_daftar(text, bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_catatan_daftar(text, bigint, bigint, bigint, date, date) to authenticated;
