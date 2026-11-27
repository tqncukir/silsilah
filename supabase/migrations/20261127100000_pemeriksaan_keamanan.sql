-- Tahap 10 Langkah 1: perbaikan hasil pemeriksaan keamanan database (2026-11-27).
-- Tidak ada data yang diubah atau dihapus.

-- 1. Log perubahan: admin pusat tidak lagi bisa membaca catatan perubahan data rahasia
--    (kondisi ekonomi, jamaah sakit, kunjungan, kebutuhan khusus, bantuan sosial, dan transaksi bisyaroh).
--    Sesuai keputusan Kang: admin pusat hanya angka tanpa nama; nominal bisyaroh hanya ketua & bendahara.
--    Ketua tetap bisa membaca semua log.
create function private.boleh_baca_log(p_tabel text, p_baris_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.peran_saya()
    when 'ketua' then not private.sesi_saya_terbatas()
    when 'admin_pusat' then not private.sesi_saya_terbatas()
      and p_tabel not in ('ekonomi_jamaah', 'sakit', 'kunjungan_sakit', 'kebutuhan_khusus', 'bantuan')
      and not (p_tabel = 'transaksi_kas' and (
        exists (select 1 from public.transaksi_kas t join public.kategori_kas k on k.id = t.kategori_id
                where t.id = p_baris_id and k.rahasia)
        or exists (select 1 from public.log_perubahan l
                   cross join lateral jsonb_array_elements_text(
                     case when jsonb_typeof(l.perubahan -> 'kategori_id') = 'array' then l.perubahan -> 'kategori_id' else '[]'::jsonb end) as kid(v)
                   join public.kategori_kas k on k.id = kid.v::smallint
                   where l.tabel = 'transaksi_kas' and l.baris_id = p_baris_id and k.rahasia)))
    else false end
$$;
revoke all on function private.boleh_baca_log(text, bigint) from public, anon;
grant execute on function private.boleh_baca_log(text, bigint) to authenticated;

drop policy baca on public.log_perubahan;
create policy baca on public.log_perubahan for select to authenticated
  using (private.boleh_baca_log(tabel, baris_id));

-- 2. Nomor Anggota dan tanggal dibuat tidak bisa diubah langsung lewat aplikasi
--    (sebelumnya ketua/koordinator bisa mengganti Nomor Anggota lewat API; KTA bisa jadi tidak berlaku).
create function private.kunci_jamaah() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     (new.nomor_anggota is distinct from old.nomor_anggota or new.dibuat_pada is distinct from old.dibuat_pada) then
    raise exception 'Nomor Anggota tidak bisa diubah.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.kunci_jamaah() from public, anon, authenticated;
create trigger kunci_nomor before update on public.jamaah
  for each row execute function private.kunci_jamaah();

-- 3. Rapikan hak tabel: TRUNCATE/TRIGGER/REFERENCES tidak pernah dipakai aplikasi
--    (TRUNCATE melewati RLS), dan tamu (anon) tidak perlu hak apa pun atas tabel.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.tablename);
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
