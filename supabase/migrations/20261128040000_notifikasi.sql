-- Tahap 16 Langkah 1: Notifikasi ke HP (Web Push). Keputusan Kang 2026-11-28:
--   anggota: kegiatan, berita, haul, ziarah; pengurus: + ringkasan pagi tugas, tugas langsung, backup (admin pusat);
--   kegiatan sesuai wilayah; hanya 06.00-21.00 WIB, maks 2 notifikasi per orang per hari.
-- Dua jadwal: pagi 06.00 (kegiatan hari ini, ringkasan tugas, backup bermasalah) dan sore 16.00 (kegiatan besok,
-- berita 24 jam terakhir, ziarah dibuka, haul pekan ini pada Kamis). Kabar digabung jadi satu notifikasi.
-- Isi tanpa nama jamaah sakit/bantuan/ekonomi; berita khusus anggota tanpa judul. Semua tabel tertutup total.

create type public.jenis_notif as enum ('kegiatan', 'berita', 'haul', 'ziarah', 'tugas', 'backup');

-- Satu baris per perangkat (HP/laptop) yang menekan "Aktifkan pemberitahuan".
create table private.langganan_push (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}$'),
  auth        text not null check (auth ~ '^[A-Za-z0-9_-]{10,100}$'),
  dibuat_pada timestamptz not null default now(),
  dipakai_pada timestamptz not null default now()
);
create index langganan_push_user on private.langganan_push (user_id);

-- Jenis yang dimatikan sendiri oleh pemakai (kosong = semua menyala).
create table private.pengaturan_notif (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mati    public.jenis_notif[] not null default '{}' check (cardinality(mati) <= 6)
);

-- Catatan kirim untuk batas 2/hari (tanpa isi pesan). Disimpan 30 hari.
create table private.catatan_notif (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  jenis        public.jenis_notif[] not null,
  dikirim_pada timestamptz not null default now()
);
create index catatan_notif_user on private.catatan_notif (user_id, dikirim_pada desc);
create index catatan_notif_waktu on private.catatan_notif (dikirim_pada);

alter table private.langganan_push enable row level security;   -- tanpa policy: tertutup total
alter table private.pengaturan_notif enable row level security;
alter table private.catatan_notif enable row level security;
revoke all on private.langganan_push, private.pengaturan_notif, private.catatan_notif from public, anon, authenticated;

-- ===== Untuk pemakai (yang sudah masuk dan punya peran) =====
create function public.simpan_langganan(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or private.peran_saya() is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  -- perangkat yang sama dipakai akun lain: pindah ke akun yang sedang masuk
  insert into private.langganan_push (user_id, endpoint, p256dh, auth) values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, dipakai_pada = now();
  -- maks 5 perangkat per akun: yang paling lama dibuang
  delete from private.langganan_push where user_id = uid and id not in
    (select id from private.langganan_push where user_id = uid order by dipakai_pada desc limit 5);
end $$;

create function public.hapus_langganan(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from private.langganan_push where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- Pengaturan saya: jenis yang dimatikan, jumlah perangkat aktif, dan apakah jenis khusus pengurus berlaku.
create function public.notif_saya() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); peran public.peran := private.peran_saya();
begin
  if uid is null or peran is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return jsonb_build_object(
    'mati', coalesce((select to_jsonb(mati) from private.pengaturan_notif where user_id = uid), '[]'::jsonb),
    'perangkat', (select count(*) from private.langganan_push where user_id = uid),
    'pengurus', peran <> 'anggota',
    'admin', peran = 'admin_pusat');
end $$;

create function public.atur_notif(p_mati public.jenis_notif[]) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or private.peran_saya() is null then raise exception 'tidak berhak' using errcode = '42501'; end if;
  insert into private.pengaturan_notif (user_id, mati)
  values (uid, coalesce((select array_agg(distinct x) from unnest(p_mati) x), '{}'))
  on conflict (user_id) do update set mati = excluded.mati;
end $$;

revoke all on function public.simpan_langganan(text, text, text), public.hapus_langganan(text),
  public.notif_saya(), public.atur_notif(public.jenis_notif[]) from public, anon;
grant execute on function public.simpan_langganan(text, text, text), public.hapus_langganan(text),
  public.notif_saya(), public.atur_notif(public.jenis_notif[]) to authenticated;

-- ===== Bantu: kecamatan yang "dekat" dengan seorang pemakai (desa jamaahnya + wilayah koordinator) =====
create function private.kecamatan_pemakai(p_uid uuid) returns integer[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select d.kecamatan_id k from public.pengguna p join public.jamaah j on j.id = p.jamaah_id join public.desa d on d.id = j.desa_id
    where p.user_id = p_uid
    union all
    select w.kecamatan_id from public.pengguna_wilayah w where w.user_id = p_uid) x
$$;

-- Jumlah notifikasi biasa (bukan backup saja) yang sudah dikirim hari ini (WIB).
create function private.notif_hari_ini(p_uid uuid, p_sekarang timestamptz) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from private.catatan_notif
  where user_id = p_uid and jenis <> array['backup']::public.jenis_notif[]
    and dikirim_pada >= ((p_sekarang at time zone 'Asia/Jakarta')::date::timestamp at time zone 'Asia/Jakarta')
$$;

revoke all on function private.kecamatan_pemakai(uuid), private.notif_hari_ini(uuid, timestamptz) from public, anon, authenticated;

-- ===== Penyusun (hanya Edge Function notif dengan service role) =====
-- p_slot 'pagi' | 'sore'; p_haul: kalimat haul pekan ini (dihitung Edge Function karena butuh kalender Hijriah),
-- diisi hanya Kamis sore. Hasil: satu baris per perangkat; catatan kirim langsung ditulis.
create function public.notif_susun(p_slot text, p_haul text default null, p_sekarang timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, judul text, isi text, url text)
language plpgsql security definer set search_path = '' as $$
declare
  jam integer := extract(hour from p_sekarang at time zone 'Asia/Jakarta');
  hari date := (p_sekarang at time zone 'Asia/Jakarta')::date;
  target date;
  u record; kec integer[]; mati public.jenis_notif[]; n integer; nama_k text; jam_k text; tempat_k text;
  tl jsonb; total integer; bk record; kab_judul text[]; kab_isi text[]; kab_url text[]; jenis public.jenis_notif[];
  khusus boolean; judul_b text; klaim_asli text := current_setting('request.jwt.claims', true);
begin
  if p_slot not in ('pagi', 'sore') then raise exception 'slot tidak dikenal' using errcode = '22023'; end if;
  if jam < 6 or jam >= 21 then return; end if;              -- di luar 06.00-21.00: tidak ada kiriman
  target := case p_slot when 'pagi' then hari else hari + 1 end;
  if p_slot = 'pagi' then delete from private.catatan_notif c where c.dikirim_pada < p_sekarang - interval '30 days'; end if;

  for u in
    select distinct l.user_id uid, p.peran from private.langganan_push l join public.pengguna p on p.user_id = l.user_id and p.aktif
  loop
    if private.notif_hari_ini(u.uid, p_sekarang) >= 2 then continue; end if;
    kec := private.kecamatan_pemakai(u.uid);
    mati := coalesce((select s.mati from private.pengaturan_notif s where s.user_id = u.uid), '{}');
    kab_judul := '{}'; kab_isi := '{}'; kab_url := '{}'; jenis := '{}';

    -- Kegiatan (publik, sesuai wilayah) hari ini (pagi) / besok (sore)
    if not 'kegiatan' = any(mati) then
      select count(*), min(k.nama), min(to_char(k.mulai at time zone 'Asia/Jakarta', 'HH24.MI')), min(k.tempat)
        into n, nama_k, jam_k, tempat_k
      from (select k.nama, k.mulai, k.tempat from public.kegiatan k
            where k.publik and not k.dibatalkan and (k.mulai at time zone 'Asia/Jakarta')::date = target
              and (k.kecamatan_id is null or k.kecamatan_id = any(kec))
            order by k.mulai limit 20) k;
      if n = 1 then
        kab_judul := kab_judul || (case p_slot when 'pagi' then 'Kegiatan hari ini' else 'Kegiatan besok' end);
        kab_isi := kab_isi || format('%s, %s WIB di %s', nama_k, jam_k, tempat_k);
        kab_url := kab_url || '/agenda.html'::text; jenis := jenis || 'kegiatan'::public.jenis_notif;
      elsif n > 1 then
        kab_judul := kab_judul || (case p_slot when 'pagi' then 'Kegiatan hari ini' else 'Kegiatan besok' end);
        kab_isi := kab_isi || format('%s kegiatan %s. Lihat agenda.', n, case p_slot when 'pagi' then 'hari ini' else 'besok' end);
        kab_url := kab_url || '/agenda.html'::text; jenis := jenis || 'kegiatan'::public.jenis_notif;
      end if;
    end if;

    if p_slot = 'pagi' and u.peran <> 'anggota' then
      -- Ringkasan tugas: memakai public.tindak_lanjut() seolah-olah pemakai itu yang bertanya (hak sama persis)
      if not 'tugas' = any(mati) then
        perform set_config('request.jwt.claims', json_build_object('sub', u.uid)::text, true);
        tl := public.tindak_lanjut();
        perform set_config('request.jwt.claims', coalesce(klaim_asli, ''), true);
        select coalesce(sum(v::integer), 0) into total from jsonb_each_text(tl) e(k, v);
        if total > 0 then
          kab_judul := kab_judul || 'Perlu ditindaklanjuti'::text;
          kab_isi := kab_isi || format('%s hal menunggu Anda. Buka Beranda.', total);
          kab_url := kab_url || '/beranda.html'::text; jenis := jenis || 'tugas'::public.jenis_notif;
        end if;
      end if;
      -- Backup bermasalah (admin pusat): gagal, atau tidak ada catatan baru > 30 jam
      if u.peran = 'admin_pusat' and not 'backup' = any(mati) then
        select c.waktu, c.berhasil into bk from private.catatan_backup c order by c.waktu desc limit 1;
        if found and (not bk.berhasil or bk.waktu < p_sekarang - interval '30 hours') then
          kab_judul := kab_judul || 'Backup perlu dicek'::text;
          kab_isi := kab_isi || (case when not bk.berhasil then 'Backup harian terakhir gagal.' else 'Tidak ada backup baru lebih dari 30 jam.' end);
          kab_url := kab_url || '/backup.html'::text; jenis := jenis || 'backup'::public.jenis_notif;
        end if;
      end if;
    end if;

    if p_slot = 'sore' then
      -- Berita terbit 24 jam terakhir (berita khusus anggota tanpa judul)
      if not 'berita' = any(mati) then
        select count(*), bool_and(b.khusus_anggota), min(b.judul) filter (where not b.khusus_anggota)
          into n, khusus, judul_b
        from public.berita b where b.status = 'terbit' and b.terbit_pada > p_sekarang - interval '24 hours' and b.terbit_pada <= p_sekarang;
        if n = 1 then
          kab_judul := kab_judul || 'Berita baru'::text;
          kab_isi := kab_isi || (case when khusus then 'Ada berita khusus anggota.' else judul_b end);
          kab_url := kab_url || '/berita.html'::text; jenis := jenis || 'berita'::public.jenis_notif;
        elsif n > 1 then
          kab_judul := kab_judul || 'Berita baru'::text;
          kab_isi := kab_isi || format('%s berita baru.', n);
          kab_url := kab_url || '/berita.html'::text; jenis := jenis || 'berita'::public.jenis_notif;
        end if;
      end if;
      -- Ziarah/umroh dibuka 24 jam terakhir (publik, belum berangkat, sesuai wilayah)
      if not 'ziarah' = any(mati) then
        select count(*), min(z.nama) into n, nama_k from public.perjalanan z
        where z.publik and not z.dibatalkan and z.berangkat > p_sekarang
          and z.dibuat_pada > p_sekarang - interval '24 hours' and z.dibuat_pada <= p_sekarang
          and (z.kecamatan_id is null or z.kecamatan_id = any(kec));
        if n >= 1 then
          kab_judul := kab_judul || 'Ziarah/umroh dibuka'::text;
          kab_isi := kab_isi || (case when n = 1 then format('Rombongan %s dibuka. Hubungi pengurus untuk ikut.', nama_k)
                                      else format('%s rombongan dibuka. Hubungi pengurus untuk ikut.', n) end);
          kab_url := kab_url || (case when u.peran = 'anggota' then '/saya.html#ziarah' else '/perjalanan.html' end);
          jenis := jenis || 'ziarah'::public.jenis_notif;
        end if;
      end if;
      -- Haul pekan ini (Kamis sore, kalimat dari Edge Function)
      if nullif(btrim(p_haul), '') is not null and not 'haul' = any(mati) then
        kab_judul := kab_judul || 'Haul pekan ini'::text;
        kab_isi := kab_isi || left(btrim(p_haul), 200);
        kab_url := kab_url || '/haul.html'::text; jenis := jenis || 'haul'::public.jenis_notif;
      end if;
    end if;

    n := cardinality(kab_isi);
    if n = 0 then continue; end if;
    insert into private.catatan_notif (user_id, jenis) values (u.uid, jenis);
    return query
      select l.user_id, l.endpoint, l.p256dh, l.auth,
        case when n = 1 then kab_judul[1] else format('Kabar %s ini (%s)', p_slot, n) end,
        case when n = 1 then kab_isi[1] else (select string_agg('• ' || x, E'\n') from unnest(kab_isi) x) end,
        case when n = 1 then kab_url[1] else '/beranda.html' end
      from private.langganan_push l where l.user_id = u.uid;
  end loop;
end $$;

-- Tugas langsung pengurus (dipanggil pemicu di Langkah 3): berita koordinator diajukan → admin pusat & ketua;
-- bantuan diajukan → ketua. Hanya bila jam 06-21 dan jatah hari itu masih ada (bila tidak, masuk ringkasan pagi).
create function public.notif_tugas(p_jenis text, p_sekarang timestamptz default now())
returns table (user_id uuid, endpoint text, p256dh text, auth text, judul text, isi text, url text)
language plpgsql security definer set search_path = '' as $$
declare
  jam integer := extract(hour from p_sekarang at time zone 'Asia/Jakarta');
  peran_tuju public.peran[]; teks text; alamat text; u record;
begin
  case p_jenis
    when 'berita_diajukan' then peran_tuju := array['admin_pusat', 'ketua']::public.peran[];
      teks := 'Berita baru dari koordinator menunggu persetujuan.'; alamat := '/berita-kelola.html?status=diajukan';
    when 'bantuan_diajukan' then peran_tuju := array['ketua']::public.peran[];
      teks := 'Pengajuan bantuan baru menunggu keputusan.'; alamat := '/bantuan.html?status=diajukan';
    else raise exception 'jenis tidak dikenal' using errcode = '22023';
  end case;
  if jam < 6 or jam >= 21 then return; end if;
  for u in
    select distinct l.user_id uid from private.langganan_push l
    join public.pengguna p on p.user_id = l.user_id and p.aktif and p.peran = any(peran_tuju)
    where not exists (select 1 from private.pengaturan_notif s where s.user_id = l.user_id and 'tugas' = any(s.mati))
  loop
    if private.notif_hari_ini(u.uid, p_sekarang) >= 2 then continue; end if;
    insert into private.catatan_notif (user_id, jenis) values (u.uid, array['tugas']::public.jenis_notif[]);
    return query select l.user_id, l.endpoint, l.p256dh, l.auth, 'Perlu ditindaklanjuti'::text, teks, alamat
      from private.langganan_push l where l.user_id = u.uid;
  end loop;
end $$;

-- Langganan yang sudah mati (layanan push menjawab 404/410): dibuang oleh Edge Function.
create function public.notif_langganan_mati(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from private.langganan_push where endpoint = p_endpoint;
$$;

revoke all on function public.notif_susun(text, text, timestamptz), public.notif_tugas(text, timestamptz),
  public.notif_langganan_mati(text) from public, anon, authenticated;
grant execute on function public.notif_susun(text, text, timestamptz), public.notif_tugas(text, timestamptz),
  public.notif_langganan_mati(text) to service_role;
