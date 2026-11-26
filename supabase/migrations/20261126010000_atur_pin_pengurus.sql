-- Halaman "Atur PIN Pengurus" (permintaan Kang 2026-11-26): admin pusat memasang, mengganti, dan menonaktifkan
-- PIN Pengurus 8 angka tanpa SQL Editor. PIN tidak pernah bisa dibaca (hanya hash). Setiap perubahan dicatat.

-- Hanya admin pusat dengan sesi penuh (bukan sesi terbatas dari QR lama).
create function private.wajib_admin_pusat() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select private.peran_saya()) is distinct from 'admin_pusat' or (select private.sesi_saya_terbatas()) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
end $$;
revoke all on function private.wajib_admin_pusat() from public, anon, authenticated;

-- Akun pengurus yang sedang masuk = <nomor>@pengurus.silsilah.invalid
create function private.nomor_pengurus_saya() returns bigint
language sql stable security definer set search_path = '' as $$
  select nullif(split_part((select auth.jwt()) ->> 'email', '@pengurus.silsilah.invalid', 1), '')::bigint
  where ((select auth.jwt()) ->> 'email') like '%@pengurus.silsilah.invalid'
$$;
revoke all on function private.nomor_pengurus_saya() from public, anon, authenticated;

-- Daftar PIN Pengurus (tanpa PIN).
create function public.daftar_pin_pengurus()
returns table (nomor_anggota bigint, nama text, desa text, peran public.peran, aktif boolean, diubah_pada timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.wajib_admin_pusat();
  return query
    select j.nomor_anggota, j.nama, d.nama, p.peran, p.aktif, p.diubah_pada
    from private.pengurus_pin p
    join public.jamaah j on j.id = p.jamaah_id
    join public.desa d on d.id = j.desa_id
    order by p.aktif desc, j.nama;
end $$;

-- Pasang atau ganti PIN Pengurus (sekaligus mengaktifkan kembali).
create function public.atur_pin_pengurus(p_nomor bigint, p_peran public.peran, p_pin text)
returns text
language plpgsql security definer set search_path = '' as $$
declare j record; uid uuid;
begin
  perform private.wajib_admin_pusat();
  if p_peran is null or p_peran = 'anggota' then raise exception 'Pilih peran pengurus.'; end if;
  if p_pin !~ '^[0-9]{8}$' then raise exception 'PIN Pengurus harus 8 angka.'; end if;
  if p_pin ~ '^([0-9])\1{7}$'
     or p_pin in ('12345678', '23456789', '01234567', '87654321', '98765432', '76543210', '12341234', '11223344', '12121212', '00001111')
  then raise exception 'PIN terlalu mudah ditebak. Pilih angka lain.'; end if;

  select ja.id, ja.nama, ja.aktif, ja.wafat into j from public.jamaah ja where ja.nomor_anggota = p_nomor;
  if j.id is null then raise exception 'Nomor Anggota tidak ditemukan.'; end if;
  if j.wafat or not j.aktif then raise exception 'Jamaah ini wafat atau tidak aktif.'; end if;
  if p_nomor = private.nomor_pengurus_saya() and p_peran <> 'admin_pusat' then
    raise exception 'Peran akun Anda sendiri tidak bisa diturunkan dari sini.';
  end if;

  perform private.set_pin_pengurus(j.id, p_peran, p_pin);

  -- Akun pengurus yang sudah pernah masuk: peran langsung ikut, dan aktif lagi.
  select u.id into uid from auth.users u where u.email = p_nomor || '@pengurus.silsilah.invalid';
  if uid is not null then
    update public.pengguna set peran = p_peran, nama = j.nama, aktif = true where user_id = uid;
  end if;

  insert into public.log_perubahan (tabel, baris_id, aksi, oleh, perubahan)
  values ('pengurus_pin', j.id, 'atur_pin', (select auth.uid()), jsonb_build_object('peran', p_peran));
  return j.nama;
end $$;

-- Nonaktifkan PIN Pengurus: PIN tidak bisa dipakai, dan akun pengurusnya langsung kehilangan hak.
create function public.nonaktifkan_pin_pengurus(p_nomor bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare jid bigint; uid uuid;
begin
  perform private.wajib_admin_pusat();
  if p_nomor = private.nomor_pengurus_saya() then
    raise exception 'PIN akun Anda sendiri tidak bisa dinonaktifkan dari sini.';
  end if;
  select ja.id into jid from public.jamaah ja where ja.nomor_anggota = p_nomor;
  update private.pengurus_pin set aktif = false, diubah_pada = now() where jamaah_id = jid;
  if not found then raise exception 'PIN pengurus untuk nomor ini tidak ada.'; end if;

  select u.id into uid from auth.users u where u.email = p_nomor || '@pengurus.silsilah.invalid';
  if uid is not null then update public.pengguna set aktif = false where user_id = uid; end if;

  insert into public.log_perubahan (tabel, baris_id, aksi, oleh, perubahan)
  values ('pengurus_pin', jid, 'nonaktifkan_pin', (select auth.uid()), '{}'::jsonb);
end $$;

revoke all on function public.daftar_pin_pengurus() from public, anon;
revoke all on function public.atur_pin_pengurus(bigint, public.peran, text) from public, anon;
revoke all on function public.nonaktifkan_pin_pengurus(bigint) from public, anon;
grant execute on function public.daftar_pin_pengurus() to authenticated;
grant execute on function public.atur_pin_pengurus(bigint, public.peran, text) to authenticated;
grant execute on function public.nonaktifkan_pin_pengurus(bigint) to authenticated;
