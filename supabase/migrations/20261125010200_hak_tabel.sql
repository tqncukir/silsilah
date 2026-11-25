-- Hak dasar tabel untuk pengguna yang login. Batasan baris tetap diatur RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.kabupaten, public.kecamatan, public.desa, public.mursyid,
  public.pengguna, public.pengguna_wilayah to authenticated;
grant select, insert, update on public.jamaah to authenticated;   -- tanpa delete: jamaah tidak dihapus
grant select on public.log_perubahan to authenticated;
grant usage on all sequences in schema public to authenticated;
