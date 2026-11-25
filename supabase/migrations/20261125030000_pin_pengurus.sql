-- Langkah 3b: PIN Pengurus 8 angka (rahasia, tidak dicetak di KTA), formulir login sama dengan anggota.
-- PIN KTA (6 angka) membuka akun anggota; PIN Pengurus (8 angka) membuka akun pengurus sesuai perannya.
create table private.pengurus_pin (
  jamaah_id   bigint primary key references public.jamaah(id),
  peran       public.peran not null check (peran <> 'anggota'),
  pin_hash    text not null,
  aktif       boolean not null default true,
  diubah_pada timestamptz not null default now()
);
alter table private.pengurus_pin enable row level security;  -- tanpa policy: tertutup

-- Pasang/ganti PIN Pengurus (8 angka). Dipakai admin pusat.
create function private.set_pin_pengurus(p_jamaah_id bigint, p_peran public.peran, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{8}$' then raise exception 'PIN Pengurus harus 8 angka'; end if;
  insert into private.pengurus_pin (jamaah_id, peran, pin_hash)
  values (p_jamaah_id, p_peran, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (jamaah_id) do update
    set peran = excluded.peran, pin_hash = excluded.pin_hash, aktif = true, diubah_pada = now();
end $$;
revoke all on function private.set_pin_pengurus(bigint, public.peran, text) from public, anon, authenticated;

-- Cek login untuk semua (anggota dan pengurus). Hanya service_role.
-- PIN 6 angka -> mode 'anggota'; PIN 8 angka -> mode 'pengurus' (akun terpisah, peran diselaraskan).
create function public.cek_login(p_nomor bigint, p_desa text, p_pin text, p_ip text)
returns table (status text, mode text, jamaah_id bigint, nama text, peran public.peran, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare j record; kn text := 'n:' || p_nomor; ki text := 'ip:' || coalesce(p_ip, '-'); uid uuid;
begin
  delete from private.login_gagal where waktu < now() - interval '1 day';
  if (select count(*) from private.login_gagal where kunci = kn and waktu > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_gagal where kunci = ki and waktu > now() - interval '15 minutes') >= 20 then
    return query select 'terkunci', null::text, null::bigint, null::text, null::public.peran, null::uuid; return;
  end if;

  if p_pin ~ '^[0-9]{6}$' then
    select ja.id, ja.nama, 'anggota'::public.peran as peran into j
    from public.jamaah ja
    join public.desa d on d.id = ja.desa_id
    join private.jamaah_pin p on p.jamaah_id = ja.id
    where ja.nomor_anggota = p_nomor and not ja.wafat
      and lower(trim(d.nama)) = lower(trim(p_desa))
      and p.pin_hash = extensions.crypt(p_pin, p.pin_hash);
  elsif p_pin ~ '^[0-9]{8}$' then
    select ja.id, ja.nama, p.peran into j
    from public.jamaah ja
    join public.desa d on d.id = ja.desa_id
    join private.pengurus_pin p on p.jamaah_id = ja.id and p.aktif
    where ja.nomor_anggota = p_nomor and not ja.wafat
      and lower(trim(d.nama)) = lower(trim(p_desa))
      and p.pin_hash = extensions.crypt(p_pin, p.pin_hash);
  end if;

  if j.id is null then
    insert into private.login_gagal (kunci) values (kn), (ki);
    return query select 'salah', null::text, null::bigint, null::text, null::public.peran, null::uuid; return;
  end if;
  delete from private.login_gagal where kunci = kn;

  if j.peran = 'anggota' then
    select pg.user_id into uid from public.pengguna pg where pg.jamaah_id = j.id;
    return query select 'ok', 'anggota', j.id, j.nama, j.peran, uid; return;
  end if;

  -- Akun pengurus: email teknis <nomor>@pengurus.silsilah.invalid; peran ikut PIN Pengurus terbaru.
  select u.id into uid from auth.users u where u.email = p_nomor || '@pengurus.silsilah.invalid';
  if uid is not null then
    update public.pengguna pg set peran = j.peran, nama = j.nama where pg.user_id = uid;
  end if;
  return query select 'ok', 'pengurus', j.id, j.nama, j.peran, uid;
end $$;
revoke all on function public.cek_login(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.cek_login(bigint, text, text, text) to service_role;
