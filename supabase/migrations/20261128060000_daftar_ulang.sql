-- Tahap 17 Langkah 1: Daftar ulang KTA lama (keputusan Kang 2026-11-28).
-- Pemegang KTA lama tanpa QR belum ada di data impor; nomornya 10 angka 1165…, sebagian di atas 1165105644.
-- Nomor jamaah baru TETAP melanjutkan 1165105645 dst (keputusan Kang), dengan pengaman:
--   1. nomor otomatis melompati nomor yang sudah dipakai (mis. nomor KTA lama yang sudah didaftarkan ulang);
--   2. pengurus yang berhak menambah jamaah (admin pusat, ketua, koordinator di wilayahnya — sama dengan RLS tambah)
--      boleh mengisi Nomor KTA lama; ditolak bila bukan 1165xxxxxx atau sudah dipakai;
--   3. asal data ditandai: impor (data Excel), baru (Pendaftaran), daftar_ulang (pemegang KTA lama).

create type public.asal_jamaah as enum ('impor', 'baru', 'daftar_ulang');
-- Kolom baru dengan nilai tetap: baris lama langsung "impor" tanpa memicu trigger/log, lalu bawaan jadi "baru".
alter table public.jamaah add column asal public.asal_jamaah not null default 'impor';
alter table public.jamaah alter column asal set default 'baru';
create index jamaah_daftar_ulang on public.jamaah (desa_id) where asal = 'daftar_ulang';

-- Nomor ditentukan trigger (bukan nilai bawaan), supaya nomor ketikan pengurus bisa dibedakan dari nomor otomatis.
alter table public.jamaah alter column nomor_anggota drop default;

-- Bantu (hak pemilik, melihat semua jamaah tanpa RLS): nomor sudah dipakai? / nomor otomatis berikutnya yang bebas.
create function private.nomor_terpakai(p_nomor bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jamaah j where j.nomor_anggota = p_nomor)
$$;
create function private.nomor_bebas_berikut() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  loop                                                       -- lompati nomor yang sudah dipakai
    n := nextval('public.nomor_anggota_seq');
    exit when not exists (select 1 from public.jamaah j where j.nomor_anggota = n);
  end loop;
  return n;
end $$;
revoke all on function private.nomor_terpakai(bigint), private.nomor_bebas_berikut() from public, anon;
grant execute on function private.nomor_terpakai(bigint), private.nomor_bebas_berikut() to authenticated;

-- Trigger berjalan dengan hak PEMANGGIL (bukan pemilik) supaya current_user = peran aplikasi.
create function private.nomor_jamaah() returns trigger
language plpgsql set search_path = '' as $$
declare dari_aplikasi boolean := current_user in ('authenticated', 'anon');
begin
  if new.nomor_anggota is null then
    new.nomor_anggota := private.nomor_bebas_berikut();
    if dari_aplikasi then new.asal := 'baru'; end if;
  elsif dari_aplikasi then                                   -- Nomor KTA lama diketik pengurus
    if new.nomor_anggota not between 1165000000 and 1165999999 then
      raise exception 'Nomor KTA lama harus 10 angka dan diawali 1165.' using errcode = '22023';
    end if;
    if private.nomor_terpakai(new.nomor_anggota) then
      raise exception 'Nomor Anggota % sudah dipakai jamaah lain.', new.nomor_anggota using errcode = '23505';
    end if;
    new.asal := 'daftar_ulang';
  end if;
  return new;
end $$;
revoke all on function private.nomor_jamaah() from public, anon, authenticated;
create trigger nomor_otomatis before insert on public.jamaah
  for each row execute function private.nomor_jamaah();

-- Nomor, tanggal dibuat, dan asal tidak bisa diubah lewat aplikasi.
create or replace function private.kunci_jamaah() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     (new.nomor_anggota is distinct from old.nomor_anggota or new.dibuat_pada is distinct from old.dibuat_pada
      or new.asal is distinct from old.asal) then
    raise exception 'Nomor Anggota tidak bisa diubah.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Cek Nomor KTA lama sebelum menyimpan (Pendaftaran). Hanya yang berhak menambah jamaah.
-- Hasil: tidak_valid | bebas | dipakai (+ id, nama, desa, kecamatan bila jamaah itu boleh dilihat/dikelola penanya)
--        | dipakai_luar (koordinator: jamaah di luar wilayahnya, hanya nama kecamatan).
create function public.cek_nomor_kta_lama(p_nomor bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare peran public.peran := private.peran_saya(); j record;
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('admin_pusat', 'ketua', 'koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  if p_nomor is null or p_nomor not between 1165000000 and 1165999999 then return jsonb_build_object('status', 'tidak_valid'); end if;
  select x.id, x.nama, x.desa_id, x.asal, d.nama desa, k.nama kecamatan into j
  from public.jamaah x join public.desa d on d.id = x.desa_id join public.kecamatan k on k.id = d.kecamatan_id
  where x.nomor_anggota = p_nomor;
  if not found then return jsonb_build_object('status', 'bebas'); end if;
  if private.boleh_kelola_desa(j.desa_id) then
    return jsonb_build_object('status', 'dipakai', 'id', j.id, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan, 'asal', j.asal);
  end if;
  return jsonb_build_object('status', 'dipakai_luar', 'kecamatan', j.kecamatan);
end $$;
revoke all on function public.cek_nomor_kta_lama(bigint) from public, anon;
grant execute on function public.cek_nomor_kta_lama(bigint) to authenticated;
