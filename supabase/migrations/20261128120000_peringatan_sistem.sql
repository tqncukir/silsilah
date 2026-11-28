-- Tahap 18 Langkah 4: peringatan ke HP Admin Pusat bila sistem bermasalah (keputusan Kang 2026-11-28: "Ya, bila gagal").
-- Pemeriksaan otomatis 2x sehari (06.30 & 16.30 WIB, 30 menit setelah kiriman notifikasi pagi/sore) dicatat di
-- private.catatan_sistem (90 hari). Bila ada masalah: notifikasi "Sistem perlu dicek" ke HP Admin Pusat (lewat Edge Function
-- notif, aksi tugas jenis "sistem"; tidak dihitung dalam batas 2/hari; bisa dimatikan di pengaturan "Masalah sistem").
-- Catatan jujur: bila server notifikasi sendiri yang rusak, peringatan HP tidak bisa sampai; masalahnya tetap tampil di
-- halaman Kesehatan Sistem dan Beranda admin.

create table private.catatan_sistem (
  id      bigint generated always as identity primary key,
  waktu   timestamptz not null default now(),
  masalah text[] not null default '{}' check (cardinality(masalah) <= 30)
);
create index catatan_sistem_waktu on private.catatan_sistem (waktu desc);
alter table private.catatan_sistem enable row level security;  -- tanpa policy: tertutup total
revoke all on private.catatan_sistem from public, anon, authenticated;

-- Pemeriksa otomatis (dipanggil pg_cron sebagai postgres). Mengembalikan daftar masalah.
create function private.cek_sistem() returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  m text[] := '{}'; bk record; j record; r record; n integer; db bigint; foto bigint; t text;
  sudah_backup boolean; kirim boolean := false;
begin
  -- 1. Backup harian
  select c.waktu, c.berhasil into bk from private.catatan_backup c order by c.waktu desc limit 1;
  if not found then m := m || 'Belum ada catatan backup'::text;
  elsif not bk.berhasil then m := m || 'Backup harian terakhir gagal'::text;
  elsif bk.waktu < now() - interval '30 hours' then m := m || 'Tidak ada backup baru lebih dari 30 jam'::text;
  end if;
  -- 2. Jadwal notifikasi pagi & sore
  foreach t in array array['notif-pagi', 'notif-sore'] loop
    select jb.jobid, jb.active into j from cron.job jb where jb.jobname = t;
    if not found then m := m || format('Jadwal notifikasi %s tidak ada', replace(t, 'notif-', '')); continue; end if;
    if not j.active then m := m || format('Jadwal notifikasi %s tidak aktif', replace(t, 'notif-', '')); continue; end if;
    select d.status, d.start_time into r from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1;
    if found and r.status = 'failed' then m := m || format('Jadwal notifikasi %s gagal dijalankan', replace(t, 'notif-', ''));
    elsif found and r.start_time < now() - interval '26 hours' then m := m || format('Jadwal notifikasi %s tidak berjalan lebih dari 1 hari', replace(t, 'notif-', ''));
    end if;
  end loop;
  -- 3. Jawaban server notifikasi (pg_net menyimpan jawaban ±6 jam; satu-satunya panggilan pg_net di sini adalah ke server notifikasi)
  select count(*) into n from net._http_response h
  where h.created > now() - interval '6 hours' and (h.status_code >= 400 or h.timed_out or h.error_msg is not null);
  if n > 0 then m := m || format('%s kiriman ke server notifikasi gagal dalam 6 jam terakhir', n); end if;
  -- 4. Keamanan: tabel public tanpa RLS, fungsi public terbuka untuk tamu selain yang memang publik
  select count(*) into n from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if n > 0 then m := m || format('%s tabel belum dijaga aturan akses', n); end if;
  select count(*) into n from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prokind = 'f'
    and p.prorettype not in ('pg_catalog.trigger'::pg_catalog.regtype, 'pg_catalog.event_trigger'::pg_catalog.regtype)
    and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('agenda_publik', 'baca_berita', 'rls_auto_enable');
  if n > 0 then m := m || format('%s fungsi terbuka untuk tamu', n); end if;
  -- 5. Kapasitas paket gratis (80%)
  db := pg_catalog.pg_database_size(pg_catalog.current_database());
  if db >= 0.8 * 500 * 1024 * 1024 then m := m || 'Database hampir penuh (paket gratis)'::text; end if;
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into foto from storage.objects o where o.bucket_id = 'berita';
  if foto >= 0.8 * 1024 * 1024 * 1024 then m := m || 'Tempat foto hampir penuh (paket gratis)'::text; end if;

  insert into private.catatan_sistem (masalah) values (m);
  delete from private.catatan_sistem where waktu < now() - interval '90 days';

  -- Kirim peringatan bila ada masalah. Masalah backup saja yang sudah diberitahukan pagi ini (notifikasi pagi) tidak dikirim ulang.
  if cardinality(m) > 0 then
    sudah_backup := exists (select 1 from private.catatan_notif c where 'backup' = any(c.jenis)
      and c.dikirim_pada >= ((now() at time zone 'Asia/Jakarta')::date::timestamp at time zone 'Asia/Jakarta'));
    kirim := exists (select 1 from unnest(m) x where not (x like 'Backup%' or x like 'Belum ada catatan backup' or x like 'Tidak ada backup%'))
      or not sudah_backup;
    if kirim then perform private.panggil_notif('{"aksi":"tugas","jenis":"sistem"}'); end if;
  end if;
  return m;
end $$;
revoke all on function private.cek_sistem() from public, anon, authenticated;

select cron.schedule('cek-sistem', '30 9,23 * * *', $$select private.cek_sistem()$$);

-- notif_tugas: tambah jenis "sistem" (Admin Pusat; dicatat sebagai 'backup' = tidak dihitung batas 2/hari,
-- bisa dimatikan lewat pilihan "Masalah sistem").
create or replace function public.notif_tugas(p_jenis text, p_sekarang timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, judul text, isi text, url text)
language plpgsql security definer set search_path = '' as $$
declare
  jam integer := extract(hour from p_sekarang at time zone 'Asia/Jakarta');
  peran_tuju public.peran[]; teks text; alamat text; u record; judul_n text := 'Perlu ditindaklanjuti';
  jenis_n public.jenis_notif := 'tugas'; ms text[];
begin
  case p_jenis
    when 'berita_diajukan' then peran_tuju := array['admin_pusat', 'ketua']::public.peran[];
      teks := 'Berita baru dari koordinator menunggu persetujuan.'; alamat := '/berita-kelola.html?status=diajukan';
    when 'bantuan_diajukan' then peran_tuju := array['ketua']::public.peran[];
      teks := 'Pengajuan bantuan baru menunggu keputusan.'; alamat := '/bantuan.html?status=diajukan';
    when 'sistem' then peran_tuju := array['admin_pusat']::public.peran[];
      select c.masalah into ms from private.catatan_sistem c where c.waktu > p_sekarang - interval '1 hour' order by c.waktu desc limit 1;
      if ms is null or cardinality(ms) = 0 then return; end if;
      judul_n := 'Sistem perlu dicek'; jenis_n := 'backup'; alamat := '/sistem.html';
      teks := ms[1] || case when cardinality(ms) > 1 then format(' dan %s hal lain.', cardinality(ms) - 1) else '.' end;
    else raise exception 'jenis tidak dikenal' using errcode = '22023';
  end case;
  if jam < 6 or jam >= 21 then return; end if;
  for u in
    select distinct l.user_id uid from private.langganan_push l
    join public.pengguna p on p.user_id = l.user_id and p.aktif and p.peran = any(peran_tuju)
    where not exists (select 1 from private.pengaturan_notif s where s.user_id = l.user_id and jenis_n = any(s.mati))
  loop
    if jenis_n <> 'backup' and private.notif_hari_ini(u.uid, p_sekarang) >= 2 then continue; end if;
    insert into private.catatan_notif (user_id, jenis) values (u.uid, array[jenis_n]);
    return query select l.user_id, l.endpoint, l.p256dh, l.auth, judul_n, teks, alamat
      from private.langganan_push l where l.user_id = u.uid;
  end loop;
end $$;
revoke all on function public.notif_tugas(text, timestamptz) from public, anon, authenticated;
grant execute on function public.notif_tugas(text, timestamptz) to service_role;

-- Kesehatan Sistem: tambah hasil pemeriksaan otomatis terakhir ('cek').
create or replace function public.kesehatan_sistem() returns jsonb
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
    'kapasitas', v_kapasitas, 'keamanan', v_keamanan, 'tugas', v_tugas,
    'cek', (select jsonb_build_object('waktu', c.waktu, 'masalah', to_jsonb(c.masalah)) from private.catatan_sistem c order by c.waktu desc limit 1));
end $$;

