-- Dashboard: jumlah anggota per mursyid (permintaan Kang 2026-11-27).
-- SECURITY INVOKER: ikut RLS jamaah (koordinator hanya kecamatannya), saringan sama dengan dashboard_pengurus.
-- Hasil: [{ id, nama, n }] urut terbanyak; id null = mursyid belum diisi.
create or replace function public.dashboard_mursyid(
  p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua', 'bendahara', 'petugas_scan', 'koordinator_wilayah') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.mursyid_id, 'nama', t.nama, 'n', t.n) order by t.n desc, t.nama)
    from (
      select j.mursyid_id, m.nama, count(*) n
      from public.jamaah j
      join public.desa d on d.id = j.desa_id
      join public.kecamatan c on c.id = d.kecamatan_id
      left join public.mursyid m on m.id = j.mursyid_id
      where (p_kab is null or c.kabupaten_id = p_kab) and (p_kec is null or c.id = p_kec) and (p_desa is null or d.id = p_desa)
        and (p_dari is null or j.tanggal_daftar >= p_dari) and (p_sampai is null or j.tanggal_daftar <= p_sampai)
      group by j.mursyid_id, m.nama
    ) t), '[]'::jsonb);
end $$;

revoke all on function public.dashboard_mursyid(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_mursyid(bigint, bigint, bigint, date, date) to authenticated;
