-- Tahap 2 Langkah 1: Kegiatan & Absensi (modul 4). Keputusan Kang Salman 2026-11-26:
-- jenis Khususiyah/Tawajjuhan, Manaqiban, Haul/Acara akbar, Pengajian/lainnya; absen dipindai petugas
-- (QR KTA lama/baru atau ketik nomor); kegiatan dibuat admin pusat & ketua (semua) atau koordinator
-- (kecamatannya saja); agenda publik tanpa login, daftar hadir rahasia.
-- Kegiatan tidak dihapus (dibatalkan saja). Kehadiran hanya ditulis lewat fungsi catat_hadir / batal_hadir.

create type public.jenis_kegiatan as enum ('khususiyah','manaqiban','haul','pengajian');
create type public.cara_hadir as enum ('qr_baru','qr_lama','ketik');

create table public.kegiatan (
  id           bigint generated always as identity primary key,
  jenis        public.jenis_kegiatan not null,
  nama         text not null check (length(btrim(nama)) between 3 and 120),
  mulai        timestamptz not null,
  selesai      timestamptz,
  tempat       text not null check (length(btrim(tempat)) between 3 and 160),
  kecamatan_id integer references public.kecamatan(id),      -- kosong = kegiatan pusat
  publik       boolean not null default true,                 -- tampil di agenda publik
  dibatalkan   boolean not null default false,
  keterangan   text check (length(keterangan) <= 500),
  dibuat_oleh  uuid,
  dibuat_pada  timestamptz not null default now(),
  diubah_pada  timestamptz not null default now(),
  check (selesai is null or (selesai > mulai and selesai <= mulai + interval '7 days'))
);
create index on public.kegiatan (mulai);
create index on public.kegiatan (kecamatan_id, mulai);

create table public.kehadiran (
  kegiatan_id  bigint not null references public.kegiatan(id),
  jamaah_id    bigint not null references public.jamaah(id),
  waktu        timestamptz not null default now(),
  cara         public.cara_hadir not null,
  dicatat_oleh uuid,
  primary key (kegiatan_id, jamaah_id)
);
create index on public.kehadiran (jamaah_id, waktu desc);   -- riwayat hadir per jamaah

alter table public.kegiatan  enable row level security;
alter table public.kehadiran enable row level security;

-- ===== Fungsi bantu hak akses =====
-- Boleh membuat/mengubah kegiatan di kecamatan ini? (kosong = pusat: hanya admin pusat & ketua)
create function private.boleh_kelola_kegiatan(p_kecamatan_id integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'admin_pusat' then true
    when 'ketua' then true
    when 'koordinator_wilayah' then p_kecamatan_id is not null and exists (
      select 1 from public.pengguna_wilayah w
      where w.user_id = (select auth.uid()) and w.kecamatan_id = p_kecamatan_id)
    else false end, false)
$$;

-- Boleh mencatat/melihat kehadiran kegiatan ini? Admin pusat, ketua, petugas scan: semua kegiatan.
-- Koordinator: kegiatan di kecamatannya.
create function private.boleh_absen(p_kegiatan_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and (
    private.peran_saya() in ('admin_pusat','ketua','petugas_scan')
    or (private.peran_saya() = 'koordinator_wilayah' and exists (
      select 1 from public.kegiatan k
      join public.pengguna_wilayah w on w.kecamatan_id = k.kecamatan_id
      where k.id = p_kegiatan_id and w.user_id = (select auth.uid())))), false)
$$;

revoke all on function private.boleh_kelola_kegiatan(integer) from public, anon;
revoke all on function private.boleh_absen(bigint) from public, anon;
grant execute on function private.boleh_kelola_kegiatan(integer) to authenticated;
grant execute on function private.boleh_absen(bigint) to authenticated;

-- ===== RLS kegiatan =====
-- Dibaca semua yang login; kegiatan tidak publik hanya untuk pengurus (bukan anggota).
create policy baca on public.kegiatan for select to authenticated using (
  publik or coalesce((select private.peran_saya()) <> 'anggota', false));
create policy tambah on public.kegiatan for insert to authenticated
  with check (private.boleh_kelola_kegiatan(kecamatan_id));
create policy ubah on public.kegiatan for update to authenticated
  using (private.boleh_kelola_kegiatan(kecamatan_id))
  with check (private.boleh_kelola_kegiatan(kecamatan_id));
-- Tidak ada policy DELETE: kegiatan dibatalkan, tidak dihapus.

revoke all on public.kegiatan from anon, authenticated;
grant select, insert, update on public.kegiatan to authenticated;

-- ===== RLS kehadiran =====
-- Pengurus yang berhak atas kegiatan itu; anggota hanya riwayat hadirnya sendiri.
create policy baca on public.kehadiran for select to authenticated using (
  jamaah_id = (select private.jamaah_saya()) or private.boleh_absen(kegiatan_id));
revoke all on public.kehadiran from anon, authenticated;
grant select on public.kehadiran to authenticated;           -- menulis hanya lewat fungsi di bawah

-- ===== Jejak audit + kolom terkunci kegiatan =====
create function private.catat_kegiatan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if tg_op = 'INSERT' then
    new.dibuat_oleh := (select auth.uid());
    new.dibuat_pada := now();
    new.diubah_pada := now();
  else
    new.dibuat_oleh := old.dibuat_oleh;
    new.dibuat_pada := old.dibuat_pada;
    new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('kegiatan', new.id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_kegiatan() from public, anon, authenticated;
create trigger catat before insert or update on public.kegiatan
  for each row execute function private.catat_kegiatan();

-- ===== Catat hadir (dipanggil halaman Absensi) =====
-- p_cara qr_baru wajib membawa p_versi (dari QR "1-<nomor>-<versi>-<tanda>"): kartu yang sudah diganti ditolak.
-- Hasil: hadir | sudah | tidak_dikenal | tidak_aktif | wafat | kartu_diganti (+ nama, desa untuk dicocokkan petugas).
create function public.catat_hadir(p_kegiatan_id bigint, p_nomor bigint, p_cara public.cara_hadir,
  p_versi smallint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.kegiatan;
  j record;
  v smallint;
  n integer;
  w timestamptz;
begin
  select * into k from public.kegiatan where id = p_kegiatan_id;
  if not found or not private.boleh_absen(p_kegiatan_id) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  if k.dibatalkan then
    raise exception 'Kegiatan ini sudah dibatalkan.' using errcode = 'P0001';
  end if;
  -- Di luar waktu kegiatan hanya admin pusat & ketua (untuk melengkapi absen yang terlewat).
  if private.peran_saya() not in ('admin_pusat','ketua')
     and now() not between k.mulai - interval '3 hours' and coalesce(k.selesai, k.mulai) + interval '12 hours' then
    raise exception 'Absen hanya bisa 3 jam sebelum sampai 12 jam sesudah kegiatan.' using errcode = 'P0001';
  end if;
  if p_cara = 'qr_baru' and p_versi is null then
    raise exception 'versi kartu kosong' using errcode = '22023';
  end if;

  select ja.id, ja.nomor_anggota, ja.nama, ja.aktif, ja.wafat, d.nama as desa, kc.nama as kecamatan
    into j
  from public.jamaah ja
  join public.desa d on d.id = ja.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  where ja.nomor_anggota = p_nomor;
  if not found then
    return jsonb_build_object('hasil', 'tidak_dikenal', 'nomor', p_nomor);
  end if;
  if j.wafat or not j.aktif then
    return jsonb_build_object('hasil', case when j.wafat then 'wafat' else 'tidak_aktif' end,
      'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan);
  end if;
  if p_cara = 'qr_baru' then
    select versi into v from private.kta where jamaah_id = j.id;
    if coalesce(v, 1) <> p_versi then
      return jsonb_build_object('hasil', 'kartu_diganti',
        'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan);
    end if;
  end if;

  insert into public.kehadiran (kegiatan_id, jamaah_id, cara, dicatat_oleh)
  values (k.id, j.id, p_cara, (select auth.uid()))
  on conflict do nothing;
  get diagnostics n = row_count;
  select waktu into w from public.kehadiran where kegiatan_id = k.id and jamaah_id = j.id;

  return jsonb_build_object('hasil', case when n = 1 then 'hadir' else 'sudah' end,
    'jamaah_id', j.id, 'nomor', j.nomor_anggota, 'nama', j.nama, 'desa', j.desa, 'kecamatan', j.kecamatan,
    'waktu', w, 'jumlah', (select count(*) from public.kehadiran where kegiatan_id = k.id));
end $$;
revoke all on function public.catat_hadir(bigint, bigint, public.cara_hadir, smallint) from public, anon;
grant execute on function public.catat_hadir(bigint, bigint, public.cara_hadir, smallint) to authenticated;

-- ===== Batal hadir (salah scan) =====
-- Admin pusat & ketua: kapan saja. Petugas/koordinator: hanya yang dicatatnya sendiri, maksimal 1 hari.
-- Setiap pembatalan dicatat di log_perubahan (baris_id = kegiatan).
create function public.batal_hadir(p_kegiatan_id bigint, p_jamaah_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.kehadiran;
begin
  if not private.boleh_absen(p_kegiatan_id) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select * into h from public.kehadiran where kegiatan_id = p_kegiatan_id and jamaah_id = p_jamaah_id;
  if not found then return; end if;
  if private.peran_saya() not in ('admin_pusat','ketua')
     and (h.dicatat_oleh is distinct from (select auth.uid()) or h.waktu < now() - interval '1 day') then
    raise exception 'Hanya bisa membatalkan absen yang Anda catat sendiri hari ini.' using errcode = '42501';
  end if;
  delete from public.kehadiran where kegiatan_id = p_kegiatan_id and jamaah_id = p_jamaah_id;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('kehadiran', p_kegiatan_id, 'batal_hadir',
    jsonb_build_object('jamaah_id', h.jamaah_id, 'waktu', h.waktu, 'cara', h.cara, 'dicatat_oleh', h.dicatat_oleh));
end $$;
revoke all on function public.batal_hadir(bigint, bigint) from public, anon;
grant execute on function public.batal_hadir(bigint, bigint) to authenticated;

-- ===== Agenda publik (tanpa login) =====
-- Hanya kolom umum dari kegiatan publik yang tidak dibatalkan. Tanpa daftar hadir, tanpa pembuat.
create function public.agenda_publik(p_dari date default null, p_batas integer default 30)
returns table (id bigint, jenis public.jenis_kegiatan, nama text, mulai timestamptz, selesai timestamptz,
  tempat text, wilayah text)
language sql stable security definer set search_path = '' as $$
  select k.id, k.jenis, k.nama, k.mulai, k.selesai, k.tempat,
    coalesce(kc.nama || ', ' || kb.nama, 'Pusat Cukir')
  from public.kegiatan k
  left join public.kecamatan kc on kc.id = k.kecamatan_id
  left join public.kabupaten kb on kb.id = kc.kabupaten_id
  where k.publik and not k.dibatalkan
    and coalesce(k.selesai, k.mulai) >= (coalesce(p_dari, (now() at time zone 'Asia/Jakarta')::date)::timestamp
                                        at time zone 'Asia/Jakarta')
  order by k.mulai
  limit least(greatest(coalesce(p_batas, 30), 1), 100)
$$;
revoke all on function public.agenda_publik(date, integer) from public;
grant execute on function public.agenda_publik(date, integer) to anon, authenticated;
