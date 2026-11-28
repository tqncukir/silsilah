-- Tahap 16 Langkah 3: jadwal & pemicu notifikasi.
-- Edge Function `notif` dipanggil dari database lewat pg_net dengan "kunci panggil" (rahasia acak buatan Admin Pusat,
-- disimpan di Supabase Vault bernama 'notif_panggil' dan di Edge Function Secrets NOTIF_PANGGIL). Tanpa kunci → tidak dipanggil.
--   pagi 06.00 WIB (23.00 UTC) dan sore 16.00 WIB (09.00 UTC) lewat pg_cron;
--   tugas langsung: berita koordinator diajukan, bantuan diajukan (pemicu tabel).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Catatan uji (jenis kosong) tidak dihitung dalam batas 2/hari.
create or replace function private.notif_hari_ini(p_uid uuid, p_sekarang timestamptz) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from private.catatan_notif
  where user_id = p_uid and cardinality(jenis) > 0 and jenis <> array['backup']::public.jenis_notif[]
    and dikirim_pada >= ((p_sekarang at time zone 'Asia/Jakarta')::date::timestamp at time zone 'Asia/Jakarta')
$$;

-- Bahan "Haul pekan ini" untuk Edge Function (kalender Hijriah dihitung di sana). Sama dengan tanggal_ahli_kubur.
create function public.notif_haul_data() returns table (jenis public.jenis_ahli_kubur, nama text, tanggal_wafat date)
language sql stable security definer set search_path = '' as $$
  select 'jamaah'::public.jenis_ahli_kubur, j.nama, j.tanggal_wafat from public.jamaah j where j.wafat and j.tanggal_wafat is not null
  union all
  select a.jenis, a.nama, a.tanggal_wafat from public.ahli_kubur a where a.jenis <> 'jamaah' and a.tanggal_wafat is not null
$$;

-- Pemberitahuan uji ke perangkat pemakai sendiri (tombol di halaman Notifikasi). Maks 1 per menit; tidak dihitung batas harian.
create function public.notif_uji(p_uid uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text, judul text, isi text, url text)
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.catatan_notif c where c.user_id = p_uid and cardinality(c.jenis) = 0
             and c.dikirim_pada > now() - interval '1 minute') then
    raise exception 'tunggu sebentar' using errcode = 'P0001';
  end if;
  insert into private.catatan_notif (user_id, jenis) values (p_uid, '{}');
  return query select l.user_id, l.endpoint, l.p256dh, l.auth, 'Uji pemberitahuan'::text,
    'Alhamdulillah, pemberitahuan SILSILAH sudah masuk ke perangkat ini.'::text, '/notif.html'::text
  from private.langganan_push l where l.user_id = p_uid;
end $$;

revoke all on function public.notif_haul_data(), public.notif_uji(uuid) from public, anon, authenticated;
grant execute on function public.notif_haul_data(), public.notif_uji(uuid) to service_role;

-- Panggil Edge Function notif (asinkron, terkirim setelah transaksi selesai). Tanpa kunci panggil di Vault: diam saja.
create function private.panggil_notif(p_isi jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare kunci text;
begin
  select s.decrypted_secret into kunci from vault.decrypted_secrets s where s.name = 'notif_panggil' limit 1;
  if kunci is null then return; end if;
  perform net.http_post(
    url := 'https://tuthgclhrzvvlcnpjxiv.supabase.co/functions/v1/notif',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notif-panggil', kunci),
    body := p_isi, timeout_milliseconds := 30000);
end $$;
revoke all on function private.panggil_notif(jsonb) from public, anon, authenticated;

-- Tugas langsung: berita koordinator masuk status "diajukan"; pengajuan bantuan baru.
create function private.notif_berita_diajukan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'diajukan' and (tg_op = 'INSERT' or old.status is distinct from 'diajukan') then
    perform private.panggil_notif('{"aksi":"tugas","jenis":"berita_diajukan"}');
  end if;
  return null;
end $$;
create function private.notif_bantuan_diajukan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'diajukan' then perform private.panggil_notif('{"aksi":"tugas","jenis":"bantuan_diajukan"}'); end if;
  return null;
end $$;
revoke all on function private.notif_berita_diajukan(), private.notif_bantuan_diajukan() from public, anon, authenticated;
create trigger notif_berita after insert or update of status on public.berita
  for each row execute function private.notif_berita_diajukan();
create trigger notif_bantuan after insert on public.bantuan
  for each row execute function private.notif_bantuan_diajukan();

-- Jadwal (UTC): pagi 06.00 WIB = 23.00 UTC, sore 16.00 WIB = 09.00 UTC. Dijadwal ulang dengan aman bila migrasi diulang.
select cron.unschedule(jobid) from cron.job where jobname in ('notif-pagi', 'notif-sore');
select cron.schedule('notif-pagi', '0 23 * * *', $$select private.panggil_notif('{"aksi":"pagi"}')$$);
select cron.schedule('notif-sore', '0 9 * * *', $$select private.panggil_notif('{"aksi":"sore"}')$$);
