-- Langkah 5 (permintaan Kang): tempat & tanggal lahir; umur saat daftar dihitung otomatis.
alter table public.jamaah
  add column tempat_lahir  text check (length(tempat_lahir) <= 60),
  add column tanggal_lahir date check (tanggal_lahir >= date '1900-01-01');

-- Kalau tanggal lahir diisi, umur saat daftar = selisih tanggal daftar dan tanggal lahir (tahun penuh).
create function private.hitung_umur_daftar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tanggal_lahir is not null then
    new.umur_daftar := extract(year from age(new.tanggal_daftar, new.tanggal_lahir))::smallint;
  end if;
  return new;
end $$;
revoke all on function private.hitung_umur_daftar() from public, anon, authenticated;
create trigger hitung_umur before insert or update of tanggal_lahir, tanggal_daftar, umur_daftar on public.jamaah
  for each row execute function private.hitung_umur_daftar();
