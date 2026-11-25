-- Langkah 4: Nomor Anggota otomatis untuk jamaah baru + bersihkan fungsi login lama.
-- Data asli berakhir di 1165105644, jadi jamaah baru mulai 1165105645.
-- (Saat impor data asli, setel ulang: select setval('public.nomor_anggota_seq', (select max(nomor_anggota) from public.jamaah where nomor_anggota < 9990000000));)
create sequence public.nomor_anggota_seq as bigint start 1165105645 minvalue 1000000000 maxvalue 9989999999;
alter table public.jamaah alter column nomor_anggota set default nextval('public.nomor_anggota_seq');
grant usage on sequence public.nomor_anggota_seq to authenticated;

-- Fungsi login lama digantikan public.cek_login (Langkah 3b).
drop function if exists public.cek_login_anggota(bigint, text, text, text);
