-- Tahap 17 Langkah 3: pantau daftar ulang KTA lama di Dashboard (keputusan Kang 2026-11-28).
-- Mengikuti RLS (security invoker), sama dengan dashboard_pengurus: koordinator hanya wilayahnya.
-- Hasil: jumlah per asal (impor, baru, daftar_ulang) + sebaran daftar ulang per tingkat berikutnya
-- (tanpa saringan: kabupaten/kota; kabupaten dipilih: kecamatan; kecamatan/desa dipilih: desa), maks 15 teratas.
create function public.dashboard_daftar_ulang(p_kab bigint default null, p_kec bigint default null, p_desa bigint default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with dasar as (
    select j.asal, d.id desa_id, d.nama desa, c.id kec_id, c.nama kec, k.id kab_id, k.nama kab
    from public.jamaah j
    join public.desa d on d.id = j.desa_id
    join public.kecamatan c on c.id = d.kecamatan_id
    join public.kabupaten k on k.id = c.kabupaten_id
    where coalesce(private.peran_saya()::text, '') in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah') and not private.sesi_saya_terbatas()
      and (p_kab is null or k.id = p_kab) and (p_kec is null or c.id = p_kec) and (p_desa is null or d.id = p_desa))
  select jsonb_build_object(
    'impor', count(*) filter (where asal = 'impor'),
    'baru', count(*) filter (where asal = 'baru'),
    'daftar_ulang', count(*) filter (where asal = 'daftar_ulang'),
    'tingkat', case when p_kec is not null or p_desa is not null then 'desa' when p_kab is not null then 'kecamatan' else 'kabupaten' end,
    'sebaran', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'nama', w.nama, 'n', w.n) order by w.n desc, w.nama)
      from (select case when p_kec is not null or p_desa is not null then x.desa_id when p_kab is not null then x.kec_id else x.kab_id end id,
                   case when p_kec is not null or p_desa is not null then x.desa when p_kab is not null then x.kec else x.kab end nama,
                   count(*) n
            from dasar x where x.asal = 'daftar_ulang' group by 1, 2 order by 3 desc, 2 limit 15) w), '[]'::jsonb))
  from dasar
$$;
revoke all on function public.dashboard_daftar_ulang(bigint, bigint, bigint) from public, anon;
grant execute on function public.dashboard_daftar_ulang(bigint, bigint, bigint) to authenticated;
