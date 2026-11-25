-- Data KTP lain (permintaan Kang 2026-11-25). Agama tidak dicatat. NIK tetap TIDAK disimpan.
alter table public.jamaah
  add column jenis_kelamin   text check (jenis_kelamin in ('L', 'P')),
  add column rt_rw           text check (rt_rw ~ '^[0-9]{3}/[0-9]{3}$'),
  add column status_kawin    text check (status_kawin in ('Belum Kawin', 'Kawin', 'Cerai Hidup', 'Cerai Mati')),
  add column kewarganegaraan text not null default 'WNI' check (kewarganegaraan in ('WNI', 'WNA'));

-- Golongan darah = data kesehatan (aturan 5: rahasia). Tabel terpisah, hanya admin pusat & ketua.
create table public.jamaah_goldar (
  jamaah_id  bigint primary key references public.jamaah(id),
  gol_darah  text not null check (gol_darah in ('A', 'B', 'AB', 'O')),
  diubah_pada timestamptz not null default now()
);
alter table public.jamaah_goldar enable row level security;
create policy baca on public.jamaah_goldar for select to authenticated
  using ((select private.peran_saya()) in ('admin_pusat', 'ketua'));
create policy tambah on public.jamaah_goldar for insert to authenticated
  with check ((select private.peran_saya()) in ('admin_pusat', 'ketua'));
create policy ubah on public.jamaah_goldar for update to authenticated
  using ((select private.peran_saya()) in ('admin_pusat', 'ketua'))
  with check ((select private.peran_saya()) in ('admin_pusat', 'ketua'));
create policy hapus on public.jamaah_goldar for delete to authenticated
  using ((select private.peran_saya()) in ('admin_pusat', 'ketua'));
grant select, insert, update, delete on public.jamaah_goldar to authenticated;
