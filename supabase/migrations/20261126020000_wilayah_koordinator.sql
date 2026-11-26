-- Wilayah tugas Koordinator Wilayah dari halaman Atur PIN Pengurus (perintah Kang 2026-11-26).
-- Akun pengurus baru dibuat saat pertama masuk, jadi kecamatan disimpan per jamaah di private.pengurus_wilayah,
-- lalu diselaraskan ke public.pengguna_wilayah (yang dipakai RLS) sekarang atau saat akunnya dibuat.

create table private.pengurus_wilayah (
  jamaah_id    bigint  not null references private.pengurus_pin(jamaah_id) on delete cascade,
  kecamatan_id integer not null references public.kecamatan(id),
  primary key (jamaah_id, kecamatan_id)
);
create index on private.pengurus_wilayah (kecamatan_id);
alter table private.pengurus_wilayah enable row level security;  -- tanpa policy: tertutup

-- Salin wilayah satu pengurus ke akunnya (kalau akun sudah ada). Bukan koordinator = wilayah dikosongkan.
create function private.selaraskan_wilayah_pengurus(p_jamaah_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select u.id into uid
  from public.jamaah j
  join auth.users u on u.email = j.nomor_anggota || '@pengurus.silsilah.invalid'
  join public.pengguna pg on pg.user_id = u.id
  where j.id = p_jamaah_id;
  if uid is null then return; end if;
  delete from public.pengguna_wilayah where user_id = uid;
  insert into public.pengguna_wilayah (user_id, kecamatan_id)
  select uid, w.kecamatan_id
  from private.pengurus_wilayah w
  join private.pengurus_pin p on p.jamaah_id = w.jamaah_id and p.peran = 'koordinator_wilayah'
  where w.jamaah_id = p_jamaah_id;
end $$;
revoke all on function private.selaraskan_wilayah_pengurus(bigint) from public, anon, authenticated;

-- Akun pengurus dibuat (pertama masuk) atau perannya berubah: wilayah ikut.
create function private.wilayah_ikut_akun() returns trigger
language plpgsql security definer set search_path = '' as $$
declare jid bigint;
begin
  select j.id into jid
  from auth.users u
  join public.jamaah j on u.email = j.nomor_anggota || '@pengurus.silsilah.invalid'
  where u.id = new.user_id;
  if jid is not null then perform private.selaraskan_wilayah_pengurus(jid); end if;
  return null;
end $$;
revoke all on function private.wilayah_ikut_akun() from public, anon, authenticated;
create trigger wilayah_akun_baru after insert on public.pengguna
  for each row when (new.peran <> 'anggota') execute function private.wilayah_ikut_akun();
create trigger wilayah_ganti_peran after update of peran on public.pengguna
  for each row when (new.peran is distinct from old.peran and new.peran <> 'anggota') execute function private.wilayah_ikut_akun();

-- Simpan daftar kecamatan koordinator (dipakai dua fungsi di bawah).
create function private.simpan_wilayah_pengurus(p_jamaah_id bigint, p_kecamatan integer[]) returns integer[]
language plpgsql security definer set search_path = '' as $$
declare k integer[];
begin
  select coalesce(array_agg(distinct x order by x), '{}') into k from unnest(p_kecamatan) x where x is not null;
  if cardinality(k) = 0 then raise exception 'Pilih minimal satu kecamatan untuk Koordinator Wilayah.'; end if;
  if (select count(*) from public.kecamatan where id = any(k)) <> cardinality(k) then
    raise exception 'Ada kecamatan yang tidak dikenal. Muat ulang halaman lalu coba lagi.';
  end if;
  delete from private.pengurus_wilayah where jamaah_id = p_jamaah_id;
  insert into private.pengurus_wilayah (jamaah_id, kecamatan_id) select p_jamaah_id, unnest(k);
  return k;
end $$;
revoke all on function private.simpan_wilayah_pengurus(bigint, integer[]) from public, anon, authenticated;

-- Pasang/ganti PIN, sekarang dengan kecamatan untuk Koordinator Wilayah.
drop function public.atur_pin_pengurus(bigint, public.peran, text);
create function public.atur_pin_pengurus(p_nomor bigint, p_peran public.peran, p_pin text, p_kecamatan integer[] default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare j record; uid uuid; k integer[];
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
  if p_peran = 'koordinator_wilayah' then
    k := private.simpan_wilayah_pengurus(j.id, p_kecamatan);
  else
    delete from private.pengurus_wilayah where jamaah_id = j.id;
  end if;

  -- Akun pengurus yang sudah pernah masuk: peran langsung ikut, aktif lagi, wilayah diselaraskan.
  select u.id into uid from auth.users u where u.email = p_nomor || '@pengurus.silsilah.invalid';
  if uid is not null then
    update public.pengguna set peran = p_peran, nama = j.nama, aktif = true where user_id = uid;
  end if;
  perform private.selaraskan_wilayah_pengurus(j.id);

  insert into public.log_perubahan (tabel, baris_id, aksi, oleh, perubahan)
  values ('pengurus_pin', j.id, 'atur_pin', (select auth.uid()),
          jsonb_build_object('peran', p_peran) || case when k is null then '{}'::jsonb else jsonb_build_object('kecamatan', k) end);
  return j.nama;
end $$;

-- Ubah wilayah Koordinator Wilayah tanpa mengganti PIN.
create function public.atur_wilayah_pengurus(p_nomor bigint, p_kecamatan integer[])
returns text
language plpgsql security definer set search_path = '' as $$
declare jid bigint; nm text; k integer[];
begin
  perform private.wajib_admin_pusat();
  select ja.id, ja.nama into jid, nm
  from public.jamaah ja
  join private.pengurus_pin p on p.jamaah_id = ja.id and p.aktif and p.peran = 'koordinator_wilayah'
  where ja.nomor_anggota = p_nomor;
  if jid is null then raise exception 'Nomor ini bukan Koordinator Wilayah yang aktif.'; end if;
  k := private.simpan_wilayah_pengurus(jid, p_kecamatan);
  perform private.selaraskan_wilayah_pengurus(jid);
  insert into public.log_perubahan (tabel, baris_id, aksi, oleh, perubahan)
  values ('pengurus_pin', jid, 'atur_wilayah', (select auth.uid()), jsonb_build_object('kecamatan', k));
  return nm;
end $$;

-- Daftar PIN Pengurus, sekarang dengan wilayah koordinator.
drop function public.daftar_pin_pengurus();
create function public.daftar_pin_pengurus()
returns table (nomor_anggota bigint, nama text, desa text, peran public.peran, aktif boolean, diubah_pada timestamptz,
               kecamatan_id integer[], wilayah text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.wajib_admin_pusat();
  return query
    select j.nomor_anggota, j.nama, d.nama, p.peran, p.aktif, p.diubah_pada,
           coalesce(array_agg(w.kecamatan_id order by k.nama) filter (where w.kecamatan_id is not null), '{}'),
           string_agg(k.nama, ', ' order by k.nama)
    from private.pengurus_pin p
    join public.jamaah j on j.id = p.jamaah_id
    join public.desa d on d.id = j.desa_id
    left join private.pengurus_wilayah w on w.jamaah_id = p.jamaah_id
    left join public.kecamatan k on k.id = w.kecamatan_id
    group by j.nomor_anggota, j.nama, d.nama, p.peran, p.aktif, p.diubah_pada
    order by p.aktif desc, j.nama;
end $$;

revoke all on function public.daftar_pin_pengurus() from public, anon;
revoke all on function public.atur_pin_pengurus(bigint, public.peran, text, integer[]) from public, anon;
revoke all on function public.atur_wilayah_pengurus(bigint, integer[]) from public, anon;
grant execute on function public.daftar_pin_pengurus() to authenticated;
grant execute on function public.atur_pin_pengurus(bigint, public.peran, text, integer[]) to authenticated;
grant execute on function public.atur_wilayah_pengurus(bigint, integer[]) to authenticated;
