-- Tahap 18 Langkah 1: Kesehatan Sistem (khusus Admin Pusat; keputusan Kang 2026-11-28).
-- Hanya membaca keadaan sistem (tanpa mengubah data jamaah). Satu fungsi pemeriksa + daftar tugas keamanan berkala.

-- ===== Tugas keamanan berkala: Kang menandai setelah mengerjakan, tanggalnya tercatat =====
create table private.tugas_berkala (
  kode         text primary key check (kode ~ '^[a-z_]{2,30}$'),
  judul        text not null check (length(judul) between 5 and 200),
  berkala      text not null check (berkala in ('sekali', 'bulanan', 'tahunan')),
  urutan       smallint not null default 0,
  selesai_pada timestamptz,
  selesai_oleh uuid
);
alter table private.tugas_berkala enable row level security;  -- tanpa policy: hanya lewat fungsi
revoke all on private.tugas_berkala from public, anon, authenticated;
insert into private.tugas_berkala (kode, judul, berkala, urutan) values
  ('dua_langkah', 'Aktifkan verifikasi dua langkah (2FA) di GitHub, Supabase, Cloudflare, dan Google jtccukir2022', 'sekali', 1),
  ('advisors', 'Cek Supabase Advisors (Security): tidak ada temuan baru', 'bulanan', 2),
  ('akses_akun', 'Periksa siapa saja yang memegang akses GitHub, Supabase, dan Cloudflare (hanya akun organisasi)', 'tahunan', 3),
  ('pin_admin', 'Ganti PIN Pengurus Admin Pusat', 'tahunan', 4),
  ('uji_pulih', 'Uji pemulihan backup ke project Supabase kosong (bersama Claude)', 'tahunan', 5);

create function public.tandai_tugas(p_kode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.wajib_admin_pusat();
  update private.tugas_berkala set selesai_pada = now(), selesai_oleh = auth.uid() where kode = p_kode;
  if not found then raise exception 'tugas tidak dikenal' using errcode = '22023'; end if;
end $$;
revoke all on function public.tandai_tugas(text) from public, anon;
grant execute on function public.tandai_tugas(text) to authenticated;

-- ===== Pemeriksa kesehatan sistem =====
-- Hasil satu jsonb per kartu: backup, notif, data, akun, kapasitas, keamanan, tugas. Angka saja + sedikit nama pengurus.
create function public.kesehatan_sistem() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_backup jsonb; v_notif jsonb; v_data jsonb; v_akun jsonb; v_kapasitas jsonb; v_keamanan jsonb; v_tugas jsonb;
begin
  perform private.wajib_admin_pusat();

  -- Cadangan harian (rincian di Pantau Backup)
  select jsonb_build_object(
    'terakhir', (select jsonb_build_object('waktu', c.waktu, 'berhasil', c.berhasil, 'gagal_di', c.gagal_di, 'ukuran_byte', c.ukuran_byte)
                 from private.catatan_backup c order by c.waktu desc limit 1),
    'berhasil_30', (select count(*) from private.catatan_backup c where c.berhasil and c.waktu > now() - interval '30 days'),
    'gagal_30', (select count(*) from private.catatan_backup c where not c.berhasil and c.waktu > now() - interval '30 days'),
    'hari', coalesce((select jsonb_agg(jsonb_build_object('tgl', h.tgl, 'hasil', h.hasil) order by h.tgl)
      from (select (c.waktu at time zone 'Asia/Jakarta')::date tgl, case when bool_or(c.berhasil) then 'ok' else 'gagal' end hasil
            from private.catatan_backup c where c.waktu > now() - interval '7 days' group by 1) h), '[]'::jsonb))
  into v_backup;

  -- Notifikasi HP: jadwal pagi/sore (pg_cron) + HP berlangganan
  select jsonb_build_object(
    'jadwal', coalesce((select jsonb_agg(jsonb_build_object('nama', j.jobname, 'aktif', j.active,
        'terakhir', r.start_time, 'status', r.status, 'pesan', left(r.return_message, 200)) order by j.jobname)
      from cron.job j
      left join lateral (select d.start_time, d.status, d.return_message from cron.job_run_details d
                         where d.jobid = j.jobid order by d.start_time desc limit 1) r on true
      where j.jobname in ('notif-pagi', 'notif-sore')), '[]'::jsonb),
    'hp', (select count(*) from private.langganan_push),
    'hp_pengurus', (select count(*) from private.langganan_push l join public.pengguna p on p.user_id = l.user_id where p.peran <> 'anggota'),
    'hp_lama', (select count(*) from private.langganan_push l where l.dipakai_pada < now() - interval '30 days'),
    'terkirim_24j', (select count(*) from private.catatan_notif n where n.dikirim_pada > now() - interval '24 hours'))
  into v_notif;

  -- Kerapian data jamaah: idealnya 0
  select jsonb_build_object(
    'catatan_terbuka', (select count(*) from public.jamaah_cek x where x.selesai_pada is null),
    'umur_kosong', (select count(*) from public.jamaah j where j.umur_daftar is null or j.umur_daftar not between 10 and 110),
    'wafat_aktif', (select count(*) from public.jamaah j where j.wafat and j.aktif),
    'koordinator_tanpa_wilayah', (select count(*) from public.pengguna p where p.peran = 'koordinator_wilayah' and p.aktif
       and not exists (select 1 from public.pengguna_wilayah w where w.user_id = p.user_id)),
    'jk_kosong', (select count(*) from public.jamaah j where j.jenis_kelamin is null))
  into v_data;

  -- Akun & login
  select jsonb_build_object(
    'jamaah_aktif', (select count(*) from public.jamaah j where j.aktif and not j.wafat),
    'anggota_ber_pin', (select count(*) from private.jamaah_pin),
    'anggota_pernah_masuk', (select count(*) from public.pengguna p join auth.users u on u.id = p.user_id
       where p.peran = 'anggota' and u.last_sign_in_at is not null),
    'pengurus_aktif', (select count(*) from public.pengguna p where p.peran <> 'anggota' and p.aktif),
    'masuk_7_hari', (select count(*) from public.pengguna p join auth.users u on u.id = p.user_id
       where p.aktif and u.last_sign_in_at > now() - interval '7 days'),
    'pengurus_lama', coalesce((select jsonb_agg(jsonb_build_object('nama', p.nama, 'peran', p.peran, 'terakhir', u.last_sign_in_at)
        order by u.last_sign_in_at nulls first, p.nama)
      from public.pengguna p join auth.users u on u.id = p.user_id
      where p.peran <> 'anggota' and p.aktif and (u.last_sign_in_at is null or u.last_sign_in_at < now() - interval '30 days')), '[]'::jsonb),
    'terkunci', (select count(*) from (select g.kunci from private.login_gagal g
       where g.kunci like 'n:%' and g.waktu > now() - interval '15 minutes' group by g.kunci having count(*) >= 5) k),
    'gagal_24j', (select count(*) from private.login_gagal g where g.kunci like 'n:%' and g.waktu > now() - interval '24 hours'))
  into v_akun;

  -- Kapasitas paket gratis Supabase (database 500 MB, penyimpanan file 1 GB)
  select jsonb_build_object(
    'db_byte', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'db_batas', 500 * 1024 * 1024,
    'foto_byte', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.bucket_id = 'berita'), 0),
    'foto_jumlah', (select count(*) from storage.objects o where o.bucket_id = 'berita'),
    'foto_batas', 1024 * 1024 * 1024)
  into v_kapasitas;

  -- Keamanan: tabel public tanpa RLS, fungsi public yang bisa dipanggil tamu selain yang memang publik
  select jsonb_build_object(
    'tabel', (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r', 'p')),
    'tabel_tanpa_rls', coalesce((select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), '[]'::jsonb),
    'fungsi_tamu', coalesce((select jsonb_agg(distinct p.proname order by p.proname) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and p.prorettype not in ('pg_catalog.trigger'::pg_catalog.regtype, 'pg_catalog.event_trigger'::pg_catalog.regtype)
         and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
         and p.proname not in ('agenda_publik', 'baca_berita', 'rls_auto_enable')), '[]'::jsonb),
    'fungsi_publik', 2)
  into v_keamanan;

  -- Tugas berkala
  select coalesce(jsonb_agg(jsonb_build_object('kode', t.kode, 'judul', t.judul, 'berkala', t.berkala, 'selesai_pada', t.selesai_pada,
      'perlu', t.selesai_pada is null
        or (t.berkala = 'bulanan' and t.selesai_pada < now() - interval '30 days')
        or (t.berkala = 'tahunan' and t.selesai_pada < now() - interval '365 days')) order by t.urutan), '[]'::jsonb)
  into v_tugas from private.tugas_berkala t;

  return jsonb_build_object('waktu', now(), 'backup', v_backup, 'notif', v_notif, 'data', v_data, 'akun', v_akun,
    'kapasitas', v_kapasitas, 'keamanan', v_keamanan, 'tugas', v_tugas);
end $$;
revoke all on function public.kesehatan_sistem() from public, anon;
grant execute on function public.kesehatan_sistem() to authenticated;
