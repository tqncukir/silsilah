-- Tahap 7 Langkah 1: Aset & Wakaf (modul 14). Keputusan Kang Salman 2026-11-27:
-- dicatat tanah/bangunan wakaf (lengkap dokumen) + barang inventaris; yang mencatat nadzir, ketua, admin pusat;
-- bendahara melihat; peran lain & anggota tidak melihat; tidak ada yang tampil di halaman publik.
-- Aset tidak pernah dihapus: status Aktif / Dilepas (wajib tanggal + alasan). Semua perubahan masuk log_perubahan.
-- Foto & scan dokumen tidak disimpan; cukup nomor dokumen + letak arsip fisik.

create type public.status_sertifikat as enum ('belum_aiw','aiw','proses','sertifikat');
create type public.peruntukan_wakaf as enum ('masjid','pondok','makam','kantor','produktif','lainnya');
create type public.kondisi_aset as enum ('baik','perlu_perbaikan','rusak');
create type public.status_aset as enum ('aktif','dilepas');
create type public.kategori_barang as enum ('elektronik','kendaraan','perabot','ibadah','lainnya');
create type public.cara_perolehan as enum ('beli','hibah');

create table public.tanah_wakaf (
  id                bigint generated always as identity primary key,
  nama              text not null check (length(btrim(nama)) between 2 and 120),     -- mis. "Masjid Al-Ikhlas Cukir"
  desa_id           integer not null references public.desa(id),
  alamat            text check (length(alamat) <= 200),
  luas_m2           numeric(12,2) not null check (luas_m2 > 0 and luas_m2 < 100000000),
  wakif             text not null check (length(btrim(wakif)) between 2 and 120),
  nadzir            text check (length(btrim(nadzir)) between 2 and 120),
  tgl_ikrar         date check (tgl_ikrar between date '1900-01-01' and date '2100-12-31'),
  no_aiw            text check (length(btrim(no_aiw)) between 1 and 60),
  no_sertifikat     text check (length(btrim(no_sertifikat)) between 1 and 60),
  status_sertifikat public.status_sertifikat not null default 'belum_aiw',
  peruntukan        public.peruntukan_wakaf not null,
  kondisi           public.kondisi_aset not null default 'baik',
  letak_arsip       text check (length(letak_arsip) <= 120),                         -- letak dokumen asli
  keterangan        text check (length(keterangan) <= 300 and keterangan !~ '[0-9]{8,}'),  -- tanpa nomor HP/NIK
  status            public.status_aset not null default 'aktif',
  dilepas_tgl       date,
  alasan_lepas      text check (length(btrim(alasan_lepas)) between 3 and 200),
  dibuat_oleh       uuid,
  dibuat_pada       timestamptz not null default now(),
  diubah_pada       timestamptz not null default now(),
  check ((status = 'dilepas') = (dilepas_tgl is not null and alasan_lepas is not null)),
  check (status_sertifikat <> 'sertifikat' or no_sertifikat is not null)
);
create index on public.tanah_wakaf (desa_id);
create index on public.tanah_wakaf (status, nama);

create table public.barang_inventaris (
  id              bigint generated always as identity primary key,
  nama            text not null check (length(btrim(nama)) between 2 and 120),
  kategori        public.kategori_barang not null,
  jumlah          integer not null default 1 check (jumlah between 1 and 99999),
  tahun_perolehan smallint check (tahun_perolehan between 1900 and 2100),
  cara_perolehan  public.cara_perolehan not null default 'beli',
  nilai           bigint check (nilai between 1 and 999999999999),                   -- perkiraan nilai (Rp)
  lokasi_simpan   text check (length(lokasi_simpan) <= 120),
  pemegang        text check (length(btrim(pemegang)) between 2 and 120),
  kondisi         public.kondisi_aset not null default 'baik',
  keterangan      text check (length(keterangan) <= 300 and keterangan !~ '[0-9]{8,}'),
  status          public.status_aset not null default 'aktif',
  dilepas_tgl     date,
  alasan_lepas    text check (length(btrim(alasan_lepas)) between 3 and 200),
  dibuat_oleh     uuid,
  dibuat_pada     timestamptz not null default now(),
  diubah_pada     timestamptz not null default now(),
  check ((status = 'dilepas') = (dilepas_tgl is not null and alasan_lepas is not null))
);
create index on public.barang_inventaris (status, kategori, nama);

-- ===== Hak =====
create function private.boleh_lihat_aset() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas()
    and private.peran_saya() in ('admin_pusat','ketua','bendahara','nadzir'), false)
$$;
create function private.boleh_catat_aset() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas()
    and private.peran_saya() in ('admin_pusat','ketua','nadzir'), false)
$$;
revoke all on function private.boleh_lihat_aset(), private.boleh_catat_aset() from public, anon;
grant execute on function private.boleh_lihat_aset(), private.boleh_catat_aset() to authenticated;

alter table public.tanah_wakaf enable row level security;
alter table public.barang_inventaris enable row level security;

create policy baca on public.tanah_wakaf for select to authenticated using ((select private.boleh_lihat_aset()));
create policy tambah on public.tanah_wakaf for insert to authenticated with check ((select private.boleh_catat_aset()));
create policy ubah on public.tanah_wakaf for update to authenticated
  using ((select private.boleh_catat_aset())) with check ((select private.boleh_catat_aset()));
create policy baca on public.barang_inventaris for select to authenticated using ((select private.boleh_lihat_aset()));
create policy tambah on public.barang_inventaris for insert to authenticated with check ((select private.boleh_catat_aset()));
create policy ubah on public.barang_inventaris for update to authenticated
  using ((select private.boleh_catat_aset())) with check ((select private.boleh_catat_aset()));
-- Tidak ada policy DELETE: aset dilepas, tidak dihapus.

revoke all on public.tanah_wakaf, public.barang_inventaris from anon, authenticated;
grant select, insert, update on public.tanah_wakaf, public.barang_inventaris to authenticated;

-- ===== Jejak audit + kolom terkunci =====
create function private.catat_aset() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if tg_op = 'INSERT' then
    new.dibuat_oleh := (select auth.uid());
    new.dibuat_pada := now();
  else
    new.dibuat_oleh := old.dibuat_oleh;
    new.dibuat_pada := old.dibuat_pada;
  end if;
  new.diubah_pada := now();
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  else
    beda := jsonb_build_object('nama', new.nama);
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values (tg_table_name, new.id,
    case when tg_op = 'INSERT' then 'insert'
         when new.status is distinct from old.status then new.status::text else 'update' end, beda);
  return new;
end $$;
revoke all on function private.catat_aset() from public, anon, authenticated;
create trigger catat before insert or update on public.tanah_wakaf for each row execute function private.catat_aset();
create trigger catat before insert or update on public.barang_inventaris for each row execute function private.catat_aset();

-- ===== Lokasi tanah wakaf (diketik, dicari/dibuat seperti Data Jamaah) =====
-- desa_id_wilayah hanya untuk admin/ketua/koordinator; nadzir memakai fungsi ini (hanya untuk mencatat lokasi aset).
create function public.desa_id_aset(p_kabupaten text, p_kecamatan text, p_desa text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  kab text := private.rapikan_nama(regexp_replace(trim(p_kabupaten), '^(kabupaten|kab\.?)\s+', '', 'i'));
  kec text := private.rapikan_nama(regexp_replace(trim(p_kecamatan), '^(kecamatan|kec\.?)\s+', '', 'i'));
  des text := private.rapikan_nama(regexp_replace(trim(p_desa), '^(desa|kelurahan|kel\.?)\s+', '', 'i'));
  kab_id smallint; kec_id integer; des_id integer;
begin
  if not private.boleh_catat_aset() then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if kab is null or kec is null or des is null then raise exception 'wilayah belum lengkap' using errcode = '22023'; end if;
  if length(kab) > 60 or length(kec) > 60 or length(des) > 60 then raise exception 'nama terlalu panjang' using errcode = '22023'; end if;
  select id into kab_id from public.kabupaten where lower(nama) = lower(kab);
  if kab_id is null then insert into public.kabupaten (nama) values (kab) returning id into kab_id; end if;
  select id into kec_id from public.kecamatan where kabupaten_id = kab_id and lower(nama) = lower(kec);
  if kec_id is null then insert into public.kecamatan (kabupaten_id, nama) values (kab_id, kec) returning id into kec_id; end if;
  select id into des_id from public.desa where kecamatan_id = kec_id and lower(nama) = lower(des);
  if des_id is null then insert into public.desa (kecamatan_id, nama) values (kec_id, des) returning id into des_id; end if;
  return des_id;
end $$;
revoke all on function public.desa_id_aset(text, text, text) from public, anon;
grant execute on function public.desa_id_aset(text, text, text) to authenticated;

-- ===== Ringkasan (Beranda & Dashboard) =====
create function public.ringkas_aset() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h jsonb;
begin
  if not private.boleh_lihat_aset() then raise exception 'tidak berhak' using errcode = '42501'; end if;
  select jsonb_build_object(
    'tanah', (select jsonb_build_object(
        'jumlah', count(*) filter (where status = 'aktif'),
        'luas_m2', coalesce(sum(luas_m2) filter (where status = 'aktif'), 0),
        'dilepas', count(*) filter (where status = 'dilepas'),
        'perlu_perhatian', count(*) filter (where status = 'aktif' and kondisi <> 'baik'),
        'belum_sertifikat', count(*) filter (where status = 'aktif' and status_sertifikat <> 'sertifikat'))
      from public.tanah_wakaf),
    'per_sertifikat', (select coalesce(jsonb_object_agg(s, n), '{}') from (
        select status_sertifikat::text s, count(*) n from public.tanah_wakaf where status = 'aktif' group by 1) x),
    'per_peruntukan', (select coalesce(jsonb_object_agg(p, n), '{}') from (
        select peruntukan::text p, count(*) n from public.tanah_wakaf where status = 'aktif' group by 1) x),
    'barang', (select jsonb_build_object(
        'jenis', count(*) filter (where status = 'aktif'),
        'unit', coalesce(sum(jumlah) filter (where status = 'aktif'), 0),
        'nilai', coalesce(sum(nilai) filter (where status = 'aktif'), 0),
        'dilepas', count(*) filter (where status = 'dilepas'),
        'perlu_perhatian', count(*) filter (where status = 'aktif' and kondisi <> 'baik'))
      from public.barang_inventaris),
    'per_kondisi', (select coalesce(jsonb_object_agg(k, n), '{}') from (
        select kondisi::text k, count(*) n from public.barang_inventaris where status = 'aktif' group by 1) x),
    'per_kategori', (select coalesce(jsonb_object_agg(k, n), '{}') from (
        select kategori::text k, count(*) n from public.barang_inventaris where status = 'aktif' group by 1) x)
  ) into h;
  return h;
end $$;
revoke all on function public.ringkas_aset() from public, anon;
grant execute on function public.ringkas_aset() to authenticated;
