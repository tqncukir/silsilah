-- Tahap 4 Langkah 4: Ziarah & Umroh di Portal Anggota + Dashboard Pengurus.
-- (1) Anggota yang terdaftar di perjalanan (dirinya atau keluarga yang ia daftarkan) boleh membaca perjalanan itu
--     walaupun tidak ditandai tampil untuk anggota. Sesi KTA lama tidak (jamaah_saya kosong).
-- (2) dashboard_perjalanan: angka ringkas, ikut RLS (SECURITY INVOKER): bendahara/admin/ketua semua,
--     koordinator hanya peserta yang boleh ia lihat; petugas scan & anggota tidak mendapat peserta.

create function private.ikut_perjalanan(p_perjalanan_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.peserta_perjalanan s
    where s.perjalanan_id = p_perjalanan_id
      and (s.jamaah_id = private.jamaah_saya() or s.penghubung_jamaah_id = private.jamaah_saya())), false)
$$;
revoke all on function private.ikut_perjalanan(bigint) from public, anon;
grant execute on function private.ikut_perjalanan(bigint) to authenticated;

create policy baca_peserta_sendiri on public.perjalanan for select to authenticated
  using (private.ikut_perjalanan(id));

-- Wilayah = asal peserta (desa jamaah, atau desa penghubung untuk keluarga); periode = tanggal berangkat (WIB).
-- Perjalanan dibatalkan dan peserta yang batal ikut tidak dihitung.
create function public.dashboard_perjalanan(p_kab bigint default null, p_kec bigint default null, p_desa bigint default null,
  p_dari date default null, p_sampai date default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with p as (
    select p.id, p.jenis, p.nama, p.berangkat, p.kuota from public.perjalanan p
    where not p.dibatalkan
      and (p_dari is null or (p.berangkat at time zone 'Asia/Jakarta')::date >= p_dari)
      and (p_sampai is null or (p.berangkat at time zone 'Asia/Jakarta')::date <= p_sampai)),
  s as (
    select s.perjalanan_id, s.jamaah_id, s.lunas from public.peserta_perjalanan s
    join p on p.id = s.perjalanan_id
    left join public.jamaah ja on ja.id = s.jamaah_id
    left join public.jamaah ph on ph.id = s.penghubung_jamaah_id
    join public.desa d on d.id = coalesce(ja.desa_id, ph.desa_id)
    join public.kecamatan kc on kc.id = d.kecamatan_id
    where not s.batal
      and (p_desa is null or d.id = p_desa)
      and (p_kec is null or kc.id = p_kec)
      and (p_kab is null or kc.kabupaten_id = p_kab))
  select jsonb_build_object(
    'perjalanan', (select count(*) from p),
    'peserta', (select count(*) from s),
    'jamaah', (select count(*) from s where jamaah_id is not null),
    'keluarga', (select count(*) from s where jamaah_id is null),
    'lunas', (select count(*) from s where lunas),
    'jenis', coalesce((select jsonb_agg(jsonb_build_object('jenis', jenis, 'perjalanan', np, 'peserta', ns, 'lunas', nl) order by ns desc)
      from (select p.jenis, count(distinct p.id) np, count(s.perjalanan_id) ns, count(*) filter (where s.lunas) nl
            from p left join s on s.perjalanan_id = p.id group by p.jenis) x), '[]'::jsonb),
    'terbaru', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nama', nama, 'berangkat', berangkat, 'kuota', kuota,
        'peserta', ns, 'lunas', nl) order by berangkat desc)
      from (select p.id, p.nama, p.berangkat, p.kuota, count(s.perjalanan_id) ns, count(*) filter (where s.lunas) nl
            from p left join s on s.perjalanan_id = p.id group by p.id, p.nama, p.berangkat, p.kuota
            order by p.berangkat desc limit 5) t), '[]'::jsonb))
$$;
revoke all on function public.dashboard_perjalanan(bigint, bigint, bigint, date, date) from public, anon;
grant execute on function public.dashboard_perjalanan(bigint, bigint, bigint, date, date) to authenticated;
