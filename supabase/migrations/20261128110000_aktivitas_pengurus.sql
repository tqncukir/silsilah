-- Tahap 18 Langkah 3: Aktivitas pengurus (keputusan Kang 2026-11-28: tambah catatan masuk, disimpan 1 tahun).
-- Yang dicatat hanya akun PENGURUS (bukan anggota): kapan masuk dan menu yang dibuka. Perubahan data memakai
-- public.log_perubahan yang sudah ada (disimpan selamanya). Dibaca hanya oleh Admin Pusat.

create table private.catatan_masuk (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  waktu   timestamptz not null default now(),
  jenis   text not null check (jenis in ('masuk', 'buka')),
  halaman text not null check (halaman ~ '^/[a-z0-9-]{0,40}$')
);
create index catatan_masuk_waktu on private.catatan_masuk (waktu);
create index catatan_masuk_akun on private.catatan_masuk (user_id, waktu desc);
create index if not exists log_perubahan_oleh_waktu on public.log_perubahan (oleh, waktu);
alter table private.catatan_masuk enable row level security;  -- tanpa policy: hanya lewat fungsi
revoke all on private.catatan_masuk from public, anon, authenticated;

-- Dipanggil aplikasi: saat masuk ('masuk') dan saat membuka halaman ('buka'). Diam-diam diabaikan untuk anggota,
-- tamu, dan sesi KTA lama. Halaman yang sama dalam 10 menit tidak dicatat dua kali (hemat ruang).
create function public.catat_aktivitas(p_jenis text, p_halaman text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hal text;
begin
  if v_uid is null or private.sesi_saya_terbatas() or coalesce(private.peran_saya()::text, 'anggota') = 'anggota'
     or p_jenis not in ('masuk', 'buka') then
    return;
  end if;
  v_hal := lower(regexp_replace(coalesce(p_halaman, '/'), '\.html$', ''));
  if v_hal !~ '^/[a-z0-9-]{0,40}$' then v_hal := '/lain'; end if;
  if exists (select 1 from private.catatan_masuk c where c.user_id = v_uid and c.jenis = p_jenis
             and (p_jenis = 'masuk' or c.halaman = v_hal)
             and c.waktu > now() - case when p_jenis = 'masuk' then interval '1 minute' else interval '10 minutes' end) then
    return;
  end if;
  insert into private.catatan_masuk (user_id, jenis, halaman) values (v_uid, p_jenis, v_hal);
end $$;
revoke all on function public.catat_aktivitas(text, text) from public, anon;
grant execute on function public.catat_aktivitas(text, text) to authenticated;

-- Bersihkan catatan masuk lebih dari 1 tahun, tiap hari 02.30 WIB.
select cron.schedule('bersih-aktivitas', '30 19 * * *', $$delete from private.catatan_masuk where waktu < now() - interval '1 year'$$);

-- Ringkasan aktivitas pengurus untuk satu periode (Admin Pusat).
-- Lama memakai = perkiraan: jeda antar-kegiatan yang kurang dari 30 menit dijumlahkan (tiap jeda maks 15 menit).
create function public.aktivitas_pengurus(p_dari timestamptz, p_sampai timestamptz, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare hasil jsonb;
begin
  perform private.wajib_admin_pusat();
  if p_dari is null or p_sampai is null or p_sampai <= p_dari or p_sampai - p_dari > interval '370 days' then
    raise exception 'periode tidak valid' using errcode = '22023';
  end if;
  with pengurus as (
    select p.user_id, p.nama, p.peran from public.pengguna p
    where p.peran <> 'anggota' and p.aktif and (p_user is null or p.user_id = p_user)),
  kegiatan as (
    select c.user_id, c.waktu, c.jenis, c.halaman from private.catatan_masuk c
    join pengurus g on g.user_id = c.user_id where c.waktu >= p_dari and c.waktu < p_sampai
    union all
    select l.oleh, l.waktu, 'data', null from public.log_perubahan l
    join pengurus g on g.user_id = l.oleh where l.waktu >= p_dari and l.waktu < p_sampai),
  jeda as (
    select k.user_id, k.waktu - lag(k.waktu) over (partition by k.user_id order by k.waktu) j from kegiatan k),
  lama as (
    select user_id, sum(least(j, interval '15 minutes')) filter (where j < interval '30 minutes') t from jeda group by user_id),
  data as (
    select l.oleh user_id, count(*) filter (where l.aksi = 'insert') tambah, count(*) filter (where l.aksi <> 'insert') ubah
    from public.log_perubahan l join pengurus g on g.user_id = l.oleh
    where l.waktu >= p_dari and l.waktu < p_sampai group by l.oleh),
  menu as (
    select x.user_id, jsonb_agg(jsonb_build_object('h', x.halaman, 'n', x.n) order by x.n desc) halaman
    from (select c.user_id, c.halaman, count(*) n, row_number() over (partition by c.user_id order by count(*) desc, c.halaman) r
          from kegiatan c where c.jenis = 'buka' group by c.user_id, c.halaman) x
    where x.r <= 3 group by x.user_id),
  ringkas as (
    select g.user_id, g.nama, g.peran,
      count(*) filter (where k.jenis = 'masuk') masuk, count(*) filter (where k.jenis = 'buka') buka,
      min(k.waktu) pertama, max(k.waktu) terakhir
    from pengurus g join kegiatan k on k.user_id = g.user_id group by g.user_id, g.nama, g.peran)
  select jsonb_build_object(
    'akun', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'nama', r.nama, 'peran', r.peran,
        'masuk', r.masuk, 'buka', r.buka, 'pertama', r.pertama, 'terakhir', r.terakhir,
        'menit', coalesce(round(extract(epoch from l.t) / 60), 0),
        'tambah', coalesce(d.tambah, 0), 'ubah', coalesce(d.ubah, 0), 'halaman', coalesce(m.halaman, '[]'::jsonb))
        order by r.terakhir desc)
      from ringkas r left join lama l on l.user_id = r.user_id left join data d on d.user_id = r.user_id
      left join menu m on m.user_id = r.user_id), '[]'::jsonb),
    'penting', coalesce((select jsonb_agg(jsonb_build_object('waktu', x.waktu, 'nama', x.nama, 'tabel', x.tabel, 'aksi', x.aksi) order by x.waktu desc)
      from (select l.waktu, g.nama, l.tabel, l.aksi from public.log_perubahan l join pengurus g on g.user_id = l.oleh
            where l.waktu >= p_dari and l.waktu < p_sampai and l.aksi in ('delete', 'batal_hadir', 'atur_pin', 'nonaktifkan_pin', 'atur_wilayah', 'ganti_kartu')
            order by l.waktu desc limit 30) x), '[]'::jsonb),
    'tidak_aktif', (select count(*) from pengurus g where not exists (select 1 from kegiatan k where k.user_id = g.user_id)),
    'pengurus', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'nama', p.nama, 'peran', p.peran) order by p.nama)
      from public.pengguna p where p.peran <> 'anggota' and p.aktif), '[]'::jsonb))
  into hasil;
  return hasil;
end $$;
revoke all on function public.aktivitas_pengurus(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.aktivitas_pengurus(timestamptz, timestamptz, uuid) to authenticated;
