-- Tahap 10 Langkah 3 (Kecepatan): aturan baca jamaah & kehadiran dihitung SEKALI per permintaan,
-- bukan sekali per baris. Hak akses TIDAK berubah (isi sama persis dengan boleh_kelola_desa / boleh_absen).
-- Diuji dengan 5.528 jamaah + 151 ribu kehadiran tiruan:
--   dashboard kehadiran admin 10,7 detik -> cepat; daftar jamaah koordinator 0,4 detik -> cepat.

-- Desa yang dikelola koordinator wilayah yang sedang masuk (kosong untuk peran lain).
-- Sama dengan cabang koordinator di private.boleh_kelola_desa.
create or replace function private.desa_kelola_saya()
returns setof integer language sql stable security definer set search_path = '' as $$
  select d.id from public.desa d
  join public.pengguna_wilayah w on w.kecamatan_id = d.kecamatan_id
  where w.user_id = (select auth.uid())
    and private.peran_saya() = 'koordinator_wilayah'
$$;

-- Boleh melihat SEMUA absensi (cabang tanpa wilayah di private.boleh_absen).
create or replace function private.boleh_absen_semua()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas()
    and private.peran_saya() in ('admin_pusat','ketua','petugas_scan'), false)
$$;

-- Kegiatan di kecamatan koordinator yang sedang masuk (cabang koordinator di private.boleh_absen).
create or replace function private.kegiatan_kelola_saya()
returns setof bigint language sql stable security definer set search_path = '' as $$
  select k.id from public.kegiatan k
  join public.pengguna_wilayah w on w.kecamatan_id = k.kecamatan_id
  where w.user_id = (select auth.uid())
    and private.peran_saya() = 'koordinator_wilayah'
    and not private.sesi_saya_terbatas()
$$;

revoke all on function private.desa_kelola_saya() from public, anon;
revoke all on function private.boleh_absen_semua() from public, anon;
revoke all on function private.kegiatan_kelola_saya() from public, anon;
grant execute on function private.desa_kelola_saya() to authenticated;
grant execute on function private.boleh_absen_semua() to authenticated;
grant execute on function private.kegiatan_kelola_saya() to authenticated;

drop policy baca on public.jamaah;
create policy baca on public.jamaah for select to authenticated using (
  (select private.peran_saya()) = any (array['admin_pusat','ketua','bendahara','petugas_scan']::public.peran[])
  or id = (select private.jamaah_saya())
  or desa_id in (select private.desa_kelola_saya()));

drop policy baca on public.kehadiran;
create policy baca on public.kehadiran for select to authenticated using (
  jamaah_id = (select private.jamaah_saya())
  or (select private.boleh_absen_semua())
  or kegiatan_id in (select private.kegiatan_kelola_saya()));
