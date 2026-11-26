-- Tahap 2 Langkah 4: Rekap kehadiran. Daftar hadir lengkap (semua petugas), rekap asal wilayah per kegiatan,
-- dan angka kehadiran untuk Dashboard Pengurus. Hak sama dengan absen: private.boleh_absen(kegiatan).
-- Fungsi SECURITY DEFINER agar nama/desa jamaah luar kecamatan koordinator tetap tampil di daftar hadir kegiatannya
-- (hanya kolom yang perlu untuk absen: nomor, nama, desa, kecamatan, kab/kota).

-- Rekap satu kegiatan: total, per cara, per asal kecamatan jamaah.
create function public.rekap_hadir(p_kegiatan_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_absen(p_kegiatan_id) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return (
    with h as (
      select h.cara, kc.id as kec_id, kc.nama as kec, kb.nama as kab
      from public.kehadiran h
      join public.jamaah j on j.id = h.jamaah_id
      join public.desa d on d.id = j.desa_id
      join public.kecamatan kc on kc.id = d.kecamatan_id
      join public.kabupaten kb on kb.id = kc.kabupaten_id
      where h.kegiatan_id = p_kegiatan_id)
    select jsonb_build_object(
      'total', (select count(*) from h),
      'cara', coalesce((select jsonb_object_agg(cara, n) from (select cara, count(*) n from h group by cara) c), '{}'::jsonb),
      'wilayah', coalesce((select jsonb_agg(jsonb_build_object('kecamatan', kec, 'kabupaten', kab, 'n', n) order by n desc, kec)
                           from (select kec_id, kec, kab, count(*) n from h group by kec_id, kec, kab) w), '[]'::jsonb)));
end $$;
revoke all on function public.rekap_hadir(bigint) from public, anon;
grant execute on function public.rekap_hadir(bigint) to authenticated;

-- Daftar hadir satu kegiatan, terbaru dulu, dengan pencarian nama/nomor dan halaman. total = jumlah yang cocok.
create function public.daftar_hadir(p_kegiatan_id bigint, p_cari text default null,
  p_dari integer default 0, p_batas integer default 20)
returns table (jamaah_id bigint, nomor_anggota bigint, nama text, desa text, kecamatan text, kabupaten text,
  waktu timestamptz, cara public.cara_hadir, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := nullif(btrim(coalesce(p_cari, '')), '');
begin
  if not private.boleh_absen(p_kegiatan_id) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select j.id, j.nomor_anggota, j.nama, d.nama, kc.nama, kb.nama, h.waktu, h.cara, count(*) over ()
  from public.kehadiran h
  join public.jamaah j on j.id = h.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  where h.kegiatan_id = p_kegiatan_id
    and (cari is null or j.nama ilike '%' || replace(replace(cari, '%', ''), '_', '') || '%'
         or j.nomor_anggota::text = cari)
  order by h.waktu desc, j.id
  offset greatest(coalesce(p_dari, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;
revoke all on function public.daftar_hadir(bigint, text, integer, integer) from public, anon;
grant execute on function public.daftar_hadir(bigint, text, integer, integer) to authenticated;

-- Dashboard: kehadiran jamaah di wilayah pilihan pada kegiatan dalam rentang tanggal (tanggal kegiatan, WIB).
-- SECURITY INVOKER: ikut RLS kegiatan & kehadiran (bendahara: kosong; koordinator: kegiatan kecamatannya).
create function public.dashboard_kehadiran(p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with k as (
    select k.id, k.jenis, k.nama, k.mulai from public.kegiatan k
    where not k.dibatalkan
      and (p_dari is null or (k.mulai at time zone 'Asia/Jakarta')::date >= p_dari)
      and (p_sampai is null or (k.mulai at time zone 'Asia/Jakarta')::date <= p_sampai)),
  h as (
    select h.kegiatan_id, h.jamaah_id from public.kehadiran h
    join k on k.id = h.kegiatan_id
    join public.jamaah j on j.id = h.jamaah_id
    join public.desa d on d.id = j.desa_id
    join public.kecamatan kc on kc.id = d.kecamatan_id
    where (p_desa is null or d.id = p_desa)
      and (p_kec is null or kc.id = p_kec)
      and (p_kab is null or kc.kabupaten_id = p_kab))
  select jsonb_build_object(
    'kegiatan', (select count(*) from k),
    'hadir', (select count(*) from h),
    'orang', (select count(distinct jamaah_id) from h),
    'jenis', coalesce((select jsonb_agg(jsonb_build_object('jenis', jenis, 'kegiatan', nk, 'hadir', nh) order by nh desc)
      from (select k.jenis, count(distinct k.id) nk, count(h.jamaah_id) nh
            from k left join h on h.kegiatan_id = k.id group by k.jenis) x), '[]'::jsonb),
    'teratas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nama', nama, 'mulai', mulai, 'hadir', nh) order by nh desc, mulai desc)
      from (select k.id, k.nama, k.mulai, count(h.jamaah_id) nh from k join h on h.kegiatan_id = k.id
            group by k.id, k.nama, k.mulai order by nh desc, k.mulai desc limit 5) t), '[]'::jsonb))
$$;
revoke all on function public.dashboard_kehadiran(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_kehadiran(bigint, bigint, bigint, date, date) to authenticated;
