-- Langkah 2: wilayah, jamaah, peran pengguna, jejak audit.
-- Privasi: TIDAK ada kolom NIK, nomor HP, foto, status ekonomi, kesehatan.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ===== Wilayah (ternormalisasi) =====
create table public.kabupaten (
  id   smallint generated always as identity primary key,
  nama text not null unique
);
create table public.kecamatan (
  id           integer generated always as identity primary key,
  kabupaten_id smallint not null references public.kabupaten(id),
  nama         text not null,
  unique (kabupaten_id, nama)
);
create table public.desa (
  id           integer generated always as identity primary key,
  kecamatan_id integer not null references public.kecamatan(id),
  nama         text not null,
  unique (kecamatan_id, nama)
);
create index on public.desa (lower(nama));  -- login anggota: cocokkan nama desa

create table public.mursyid (
  id   smallint generated always as identity primary key,
  nama text not null unique
);

-- ===== Jamaah =====
create table public.jamaah (
  id             bigint generated always as identity primary key,
  nomor_anggota  bigint not null unique check (nomor_anggota between 1000000000 and 9999999999),
  nama           text not null check (length(nama) between 2 and 120),
  umur_daftar    smallint check (umur_daftar between 5 and 120), -- umur saat mendaftar
  pekerjaan      text check (length(pekerjaan) <= 60),
  alamat         text check (length(alamat) <= 160),             -- dusun/RT, tanpa nomor HP
  desa_id        integer not null references public.desa(id),
  mursyid_id     smallint references public.mursyid(id),
  tanggal_daftar date not null default current_date,
  aktif          boolean not null default true,
  wafat          boolean not null default false,
  tanggal_wafat  date,
  link_kta_lama  text,
  dibuat_pada    timestamptz not null default now(),
  diubah_pada    timestamptz not null default now(),
  check (wafat or tanggal_wafat is null)
);
create index on public.jamaah (desa_id);
create index on public.jamaah (mursyid_id);
create index on public.jamaah (lower(nama) text_pattern_ops);   -- cari nama (awalan)
create index on public.jamaah (wafat, aktif);

-- ===== Peran pengguna =====
create type public.peran as enum (
  'admin_pusat','ketua','bendahara','nadzir','koordinator_wilayah',
  'petugas_scan','khodim','dokter','anggota'
);
create table public.pengguna (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nama       text not null,
  peran      public.peran not null,
  jamaah_id  bigint unique references public.jamaah(id),  -- untuk peran anggota
  aktif      boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  check (peran <> 'anggota' or jamaah_id is not null)
);
create index on public.pengguna (jamaah_id);

-- wilayah tugas koordinator (per kecamatan)
create table public.pengguna_wilayah (
  user_id      uuid not null references public.pengguna(user_id) on delete cascade,
  kecamatan_id integer not null references public.kecamatan(id),
  primary key (user_id, kecamatan_id)
);
create index on public.pengguna_wilayah (kecamatan_id);

-- ===== Jejak audit (siapa mengubah apa) =====
create table public.log_perubahan (
  id        bigint generated always as identity primary key,
  tabel     text not null,
  baris_id  bigint not null,
  aksi      text not null,
  oleh      uuid default auth.uid(),
  waktu     timestamptz not null default now(),
  perubahan jsonb
);
create index on public.log_perubahan (tabel, baris_id);
create index on public.log_perubahan (waktu);
