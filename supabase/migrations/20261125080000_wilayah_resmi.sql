-- Daftar wilayah resmi seluruh Indonesia (Kepmendagri No 300.2.2-2138 Tahun 2025):
-- 38 provinsi, 514 kab/kota, 7.285 kecamatan, 83.762 desa/kelurahan.
-- Sumber: github.com/cahyadsn/wilayah (lisensi MIT). Hanya untuk saran isian alamat (keputusan Kang 2026-11-25:
-- saran resmi, tetapi petugas tetap boleh mengetik sendiri).
create table public.wilayah_resmi (
  kode    text primary key check (kode ~ '^[0-9]{2}(\.[0-9]{2}(\.[0-9]{2}(\.[0-9]{4})?)?)?$'),
  nama    text not null,
  tingkat smallint generated always as (array_length(string_to_array(kode, '.'), 1)) stored, -- 1 prov, 2 kab/kota, 3 kec, 4 desa
  induk   text generated always as (nullif(regexp_replace(kode, '\.?[0-9]+$', ''), '')) stored
);
create index on public.wilayah_resmi (tingkat);
create index on public.wilayah_resmi (induk);
alter table public.wilayah_resmi enable row level security;
create policy baca on public.wilayah_resmi for select to authenticated using (true);
grant select on public.wilayah_resmi to authenticated;

-- Isi data: unduh sekali lewat ekstensi http, lalu ekstensi dilepas lagi.
create extension if not exists http with schema extensions;
select extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '120000');
insert into public.wilayah_resmi (kode, nama)
select m[1], replace(m[2], '''''', '''')
from regexp_matches(
  (select content from extensions.http_get('https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql')),
  $r$\('([0-9.]+)','((?:[^']|'')*)'\)$r$, 'g') as m;
drop extension http;
