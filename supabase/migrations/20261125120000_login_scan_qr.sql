-- Login anggota cukup scan QR KTA (keputusan Kang Salman 2026-11-26).
-- QR KTA lama berisi teks biasa (mudah ditiru), jadi sesi dari QR lama = sesi terbatas:
-- tidak bisa membaca baris jamaah lengkap; hanya data yang memang tercetak di kartu lewat kartu_saya().
create table private.sesi_terbatas (
  session_id  uuid primary key,
  dibuat_pada timestamptz not null default now()
);
alter table private.sesi_terbatas enable row level security;  -- tanpa policy: hanya lewat fungsi

create function private.sesi_saya_terbatas() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.sesi_terbatas s
    where s.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid)
$$;

-- Dipanggil fungsi login-anggota (service_role) setelah sesi dari QR lama dibuat.
create function public.tandai_sesi_terbatas(p_session uuid) returns void
language sql security definer set search_path = '' as $$
  insert into private.sesi_terbatas (session_id) values (p_session) on conflict do nothing
$$;
revoke all on function public.tandai_sesi_terbatas(uuid) from public, anon, authenticated;
grant execute on function public.tandai_sesi_terbatas(uuid) to service_role;

-- Sesi terbatas tidak mendapat jamaah_id (RLS jamaah, KTA bertanda tangan, data lengkap tertutup).
create or replace function private.jamaah_saya() returns bigint
language sql stable security definer set search_path = '' as $$
  select jamaah_id from public.pengguna
  where user_id = (select auth.uid()) and aktif and not private.sesi_saya_terbatas()
$$;

-- Data kartu milik anggota yang login (isi sama dengan yang tercetak di KTA). Untuk sesi biasa maupun terbatas.
create function public.kartu_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nomor_anggota', j.nomor_anggota, 'nama', j.nama, 'umur_daftar', j.umur_daftar, 'pekerjaan', j.pekerjaan,
    'tanggal_daftar', j.tanggal_daftar, 'aktif', j.aktif, 'wafat', j.wafat,
    'desa', d.nama, 'kecamatan', c.nama, 'kabupaten', k.nama, 'mursyid', m.nama,
    'terbatas', private.sesi_saya_terbatas())
  from public.pengguna p
  join public.jamaah j on j.id = p.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan c on c.id = d.kecamatan_id
  join public.kabupaten k on k.id = c.kabupaten_id
  left join public.mursyid m on m.id = j.mursyid_id
  where p.user_id = (select auth.uid()) and p.aktif and p.peran = 'anggota'
$$;
revoke all on function public.kartu_saya() from public, anon;
grant execute on function public.kartu_saya() to authenticated;
