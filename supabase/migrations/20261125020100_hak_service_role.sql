-- Fungsi login-anggota (service_role) perlu membaca & menambah baris pengguna.
grant select, insert on public.pengguna to service_role;
-- Perbaikan sekali: akun anggota yang terlanjur dibuat tanpa baris pengguna.
insert into public.pengguna (user_id, nama, peran, jamaah_id)
select u.id, j.nama, 'anggota', j.id from auth.users u
join public.jamaah j on u.email = j.nomor_anggota::text || '@anggota.silsilah.invalid'
where not exists (select 1 from public.pengguna p where p.user_id = u.id);
