-- Langkah 3: PIN anggota (hanya hash), batas salah PIN, admin pusat otomatis.
create extension if not exists pgcrypto with schema extensions;

-- PIN disimpan sebagai hash bcrypt di schema private (tidak terjangkau API).
create table private.jamaah_pin (
  jamaah_id   bigint primary key references public.jamaah(id),
  pin_hash    text not null,
  diubah_pada timestamptz not null default now()
);
alter table private.jamaah_pin enable row level security;  -- tanpa policy: tertutup

-- Catatan percobaan gagal (kunci = 'n:<nomor>' atau 'ip:<alamat>'), dibersihkan otomatis.
create table private.login_gagal (
  id    bigint generated always as identity primary key,
  kunci text not null,
  waktu timestamptz not null default now()
);
create index on private.login_gagal (kunci, waktu);
alter table private.login_gagal enable row level security;

-- Pasang/ganti PIN (6 angka). Dipakai admin (Langkah 6) dan data contoh.
create function private.set_pin(p_jamaah_id bigint, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 angka'; end if;
  insert into private.jamaah_pin (jamaah_id, pin_hash)
  values (p_jamaah_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (jamaah_id) do update set pin_hash = excluded.pin_hash, diubah_pada = now();
end $$;
revoke all on function private.set_pin(bigint, text) from public, anon, authenticated;

-- Cek login anggota. Hanya untuk service_role (fungsi login-anggota di server).
-- Hasil: status 'ok' | 'salah' | 'terkunci'. Pesan ke pengguna selalu sama, tidak membocorkan bagian mana yang salah.
create function public.cek_login_anggota(p_nomor bigint, p_desa text, p_pin text, p_ip text)
returns table (status text, jamaah_id bigint, nama text)
language plpgsql security definer set search_path = '' as $$
declare j record; kn text := 'n:' || p_nomor; ki text := 'ip:' || coalesce(p_ip, '-');
begin
  delete from private.login_gagal where waktu < now() - interval '1 day';
  if (select count(*) from private.login_gagal where kunci = kn and waktu > now() - interval '15 minutes') >= 5
     or (select count(*) from private.login_gagal where kunci = ki and waktu > now() - interval '15 minutes') >= 20 then
    return query select 'terkunci', null::bigint, null::text; return;
  end if;

  select ja.id, ja.nama into j
  from public.jamaah ja
  join public.desa d on d.id = ja.desa_id
  join private.jamaah_pin p on p.jamaah_id = ja.id
  where ja.nomor_anggota = p_nomor and not ja.wafat
    and lower(trim(d.nama)) = lower(trim(p_desa))
    and p.pin_hash = extensions.crypt(p_pin, p.pin_hash);

  if j.id is null then
    insert into private.login_gagal (kunci) values (kn), (ki);
    return query select 'salah', null::bigint, null::text; return;
  end if;

  delete from private.login_gagal where kunci = kn;
  return query select 'ok', j.id, j.nama;
end $$;
revoke all on function public.cek_login_anggota(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.cek_login_anggota(bigint, text, text, text) to service_role;

-- Admin pusat otomatis: akun email organisasi langsung mendapat peran admin_pusat.
create function private.pengguna_baru() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) = 'jtccukir2022@gmail.com' then
    insert into public.pengguna (user_id, nama, peran) values (new.id, 'Admin Pusat', 'admin_pusat')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.pengguna_baru() from public, anon, authenticated;
create trigger pengguna_baru after insert on auth.users
  for each row execute function private.pengguna_baru();
