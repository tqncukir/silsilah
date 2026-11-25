-- Jenis kelamin jamaah lama ditebak dari nama (dan pekerjaan "mengurus rumah tangga"), atas izin Kang Salman 2026-11-25.
-- Tanda tebakan disimpan terpisah. Tanda hilang otomatis saat pengurus mengisi/mengubah jenis kelamin.
create table public.jamaah_jk_tebakan (
  jamaah_id    bigint primary key references public.jamaah(id),
  tebakan      text check (tebakan in ('L', 'P')),
  perlu_dicek  boolean not null,
  dicatat_pada timestamptz not null default now()
);
alter table public.jamaah_jk_tebakan enable row level security;
create policy baca on public.jamaah_jk_tebakan for select to authenticated
  using (exists (select 1 from public.jamaah j where j.id = jamaah_id));
revoke all on public.jamaah_jk_tebakan from anon;
grant select on public.jamaah_jk_tebakan to authenticated;

create function private.hapus_tanda_jk() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.jamaah_jk_tebakan where jamaah_id = new.id;
  return new;
end $$;
revoke all on function private.hapus_tanda_jk() from public, anon, authenticated;
create trigger jk_diisi_pengurus after update of jenis_kelamin on public.jamaah
  for each row when (old.jenis_kelamin is distinct from new.jenis_kelamin)
  execute function private.hapus_tanda_jk();

-- Dashboard: tambah ringkasan jenis kelamin
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
