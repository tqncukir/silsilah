-- Fungsi bantu hak akses (di schema private, tidak bisa dipanggil lewat API publik)
create function private.peran_saya() returns public.peran
language sql stable security definer set search_path = '' as $$
  select peran from public.pengguna where user_id = (select auth.uid()) and aktif
$$;

create function private.jamaah_saya() returns bigint
language sql stable security definer set search_path = '' as $$
  select jamaah_id from public.pengguna where user_id = (select auth.uid()) and aktif
$$;

-- boleh melihat/mengelola jamaah ini? (koordinator: hanya kecamatannya)
create function private.boleh_kelola_desa(p_desa_id integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.peran_saya()
    when 'admin_pusat' then true
    when 'ketua' then true
    when 'koordinator_wilayah' then exists (
      select 1 from public.desa d
      join public.pengguna_wilayah w on w.kecamatan_id = d.kecamatan_id
      where d.id = p_desa_id and w.user_id = (select auth.uid()))
    else false end
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ===== RLS aktif untuk semua tabel =====
alter table public.kabupaten        enable row level security;
alter table public.kecamatan        enable row level security;
alter table public.desa             enable row level security;
alter table public.mursyid          enable row level security;
alter table public.jamaah           enable row level security;
alter table public.pengguna         enable row level security;
alter table public.pengguna_wilayah enable row level security;
alter table public.log_perubahan    enable row level security;

-- Tamu (anon) tidak boleh membaca tabel apa pun secara langsung.
revoke all on all tables in schema public from anon;

-- Wilayah & mursyid: dibaca semua yang login; diubah hanya admin pusat
do $$ declare t text; begin
  foreach t in array array['kabupaten','kecamatan','desa','mursyid'] loop
    execute format('create policy baca on public.%I for select to authenticated using (true)', t);
    execute format('create policy kelola on public.%I for all to authenticated
      using ((select private.peran_saya()) = ''admin_pusat'')
      with check ((select private.peran_saya()) = ''admin_pusat'')', t);
  end loop;
end $$;

-- Jamaah: pengurus sesuai wilayah, petugas scan & bendahara baca saja, anggota hanya dirinya
create policy baca on public.jamaah for select to authenticated using (
  (select private.peran_saya()) in ('admin_pusat','ketua','bendahara','petugas_scan')
  or id = (select private.jamaah_saya())
  or private.boleh_kelola_desa(desa_id)
);
create policy tambah on public.jamaah for insert to authenticated
  with check (private.boleh_kelola_desa(desa_id));
create policy ubah on public.jamaah for update to authenticated
  using (private.boleh_kelola_desa(desa_id))
  with check (private.boleh_kelola_desa(desa_id));
-- Tidak ada policy DELETE: jamaah tidak pernah dihapus.
revoke delete on public.jamaah from authenticated;

-- Pengguna: lihat diri sendiri; admin pusat kelola semua
create policy baca on public.pengguna for select to authenticated using (
  user_id = (select auth.uid()) or (select private.peran_saya()) in ('admin_pusat','ketua'));
create policy kelola on public.pengguna for all to authenticated
  using ((select private.peran_saya()) = 'admin_pusat')
  with check ((select private.peran_saya()) = 'admin_pusat');

create policy baca on public.pengguna_wilayah for select to authenticated using (
  user_id = (select auth.uid()) or (select private.peran_saya()) in ('admin_pusat','ketua'));
create policy kelola on public.pengguna_wilayah for all to authenticated
  using ((select private.peran_saya()) = 'admin_pusat')
  with check ((select private.peran_saya()) = 'admin_pusat');

-- Log: hanya admin pusat & ketua yang membaca; ditulis otomatis oleh trigger
create policy baca on public.log_perubahan for select to authenticated
  using ((select private.peran_saya()) in ('admin_pusat','ketua'));
revoke insert, update, delete on public.log_perubahan from authenticated;

-- ===== Trigger: waktu ubah + jejak audit jamaah =====
create function private.catat_jamaah() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if tg_op = 'UPDATE' then
    new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  else
    beda := null;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('jamaah', new.id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_jamaah() from public, anon, authenticated;

create trigger catat before update on public.jamaah
  for each row execute function private.catat_jamaah();
create trigger catat_baru after insert on public.jamaah
  for each row execute function private.catat_jamaah();
