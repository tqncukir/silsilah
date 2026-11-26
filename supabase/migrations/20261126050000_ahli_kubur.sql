-- Tahap 3 Langkah 1: Ahli Kubur (modul 5). Keputusan Kang Salman 2026-11-26:
-- isi = jamaah wafat (otomatis dari tabel jamaah) + keluarga jamaah (titipan doa) + masyayikh & mursyid;
-- data: nama, bin/binti, tanggal wafat (Hijriah dihitung di browser), lokasi makam, keluarga penghubung (nama saja, tanpa HP);
-- dilihat pengurus + anggota yang login (tamu tidak). Baris tidak dihapus (sama dengan data lain; hapus = tanya Kang).

create type public.jenis_ahli_kubur as enum ('jamaah','keluarga','masyayikh');

create table public.ahli_kubur (
  id                   bigint generated always as identity primary key,
  jenis                public.jenis_ahli_kubur not null,
  jamaah_id            bigint unique references public.jamaah(id),     -- jenis jamaah: data pokok dari tabel jamaah
  nama                 text check (length(btrim(nama)) between 2 and 120),
  bin_binti            text check (length(bin_binti) <= 120),         -- "bin Fulan" / "binti Fulan"
  tanggal_wafat        date,                                           -- keluarga/masyayikh (jamaah: jamaah.tanggal_wafat)
  makam                text check (length(makam) <= 160),              -- nama pemakaman + desa
  keluarga_penghubung  text check (length(keluarga_penghubung) <= 160),-- nama ahli waris, tanpa nomor HP
  penghubung_jamaah_id bigint references public.jamaah(id),            -- keluarga: jamaah yang menitipkan doa
  hubungan             text check (length(hubungan) <= 40),            -- keluarga: hubungan dengan penghubung (Ayah, Ibu, ...)
  keterangan           text check (length(keterangan) <= 300),
  dibuat_oleh          uuid,
  dibuat_pada          timestamptz not null default now(),
  diubah_pada          timestamptz not null default now(),
  check ((jenis = 'jamaah') = (jamaah_id is not null)),
  check (jenis = 'jamaah' or nama is not null),
  check (jenis <> 'jamaah' or (nama is null and tanggal_wafat is null and penghubung_jamaah_id is null)),
  check (jenis = 'keluarga' or (penghubung_jamaah_id is null and hubungan is null)),
  check (tanggal_wafat is null or tanggal_wafat between '1800-01-01' and current_date + 1)
);
create index on public.ahli_kubur (jenis);
create index on public.ahli_kubur (penghubung_jamaah_id);
create index on public.jamaah (tanggal_wafat) where wafat;                -- daftar & haul jamaah wafat
alter table public.ahli_kubur enable row level security;

-- ===== Hak akses =====
-- Melihat: semua yang punya peran aktif (pengurus mana pun + anggota, termasuk sesi KTA lama). Tamu tidak.
create function private.boleh_lihat_ahli_kubur() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.peran_saya() is not null
$$;

-- Mengubah: masyayikh = admin pusat & ketua; jamaah wafat / keluarga = yang berhak atas desa jamaah itu / penghubungnya
-- (admin pusat, ketua, koordinator kecamatannya). Sesi terbatas tidak boleh.
create function private.boleh_kelola_ahli_kubur(p_jenis public.jenis_ahli_kubur, p_jamaah_id bigint, p_penghubung_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case p_jenis
    when 'masyayikh' then private.peran_saya() in ('admin_pusat','ketua')
    when 'jamaah' then private.boleh_kelola_desa((select desa_id from public.jamaah where id = p_jamaah_id))
    when 'keluarga' then case when p_penghubung_id is null then private.peran_saya() in ('admin_pusat','ketua')
                              else private.boleh_kelola_desa((select desa_id from public.jamaah where id = p_penghubung_id)) end
  end, false)
$$;
revoke all on function private.boleh_lihat_ahli_kubur() from public, anon;
revoke all on function private.boleh_kelola_ahli_kubur(public.jenis_ahli_kubur, bigint, bigint) from public, anon;
grant execute on function private.boleh_lihat_ahli_kubur() to authenticated;
grant execute on function private.boleh_kelola_ahli_kubur(public.jenis_ahli_kubur, bigint, bigint) to authenticated;

create policy baca on public.ahli_kubur for select to authenticated using ((select private.boleh_lihat_ahli_kubur()));
create policy tambah on public.ahli_kubur for insert to authenticated
  with check (private.boleh_kelola_ahli_kubur(jenis, jamaah_id, penghubung_jamaah_id));
create policy ubah on public.ahli_kubur for update to authenticated
  using (private.boleh_kelola_ahli_kubur(jenis, jamaah_id, penghubung_jamaah_id))
  with check (private.boleh_kelola_ahli_kubur(jenis, jamaah_id, penghubung_jamaah_id));
-- Tidak ada policy DELETE.
revoke all on public.ahli_kubur from anon, authenticated;
grant select, insert, update on public.ahli_kubur to authenticated;

-- ===== Penjaga + jejak audit =====
create function private.catat_ahli_kubur() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  if new.jenis = 'jamaah' and not exists (select 1 from public.jamaah where id = new.jamaah_id and wafat) then
    raise exception 'Jamaah ini belum berstatus wafat.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.dibuat_oleh := (select auth.uid()); new.dibuat_pada := now(); new.diubah_pada := now();
  else
    if new.jenis is distinct from old.jenis or new.jamaah_id is distinct from old.jamaah_id then
      raise exception 'Jenis dan jamaah tidak bisa diganti.' using errcode = 'P0001';
    end if;
    new.dibuat_oleh := old.dibuat_oleh; new.dibuat_pada := old.dibuat_pada; new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan) values ('ahli_kubur', new.id, lower(tg_op), beda);
  return new;
end $$;
revoke all on function private.catat_ahli_kubur() from public, anon, authenticated;
create trigger catat before insert or update on public.ahli_kubur for each row execute function private.catat_ahli_kubur();

-- ===== Daftar gabungan (jamaah wafat + keluarga + masyayikh) =====
-- kunci: 'j<jamaah_id>' untuk jamaah wafat, 'a<id>' untuk keluarga/masyayikh. Wilayah = desa jamaah / desa penghubung.
-- Nomor Anggota hanya untuk pengurus. Hanya kolom yang perlu untuk mendoakan dan menghubungi keluarga (tanpa HP).
create function public.daftar_ahli_kubur(p_cari text default null, p_jenis public.jenis_ahli_kubur default null,
  p_kab bigint default null, p_kec bigint default null, p_dari integer default 0, p_batas integer default 20)
returns table (kunci text, id bigint, jenis public.jenis_ahli_kubur, jamaah_id bigint, nomor_anggota bigint, nama text,
  bin_binti text, tanggal_wafat date, makam text, keluarga_penghubung text, hubungan text, penghubung_nama text,
  desa text, kecamatan text, kecamatan_id integer, kabupaten text, keterangan text, boleh_ubah boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  cari text := nullif(btrim(coalesce(p_cari, '')), '');
  pengurus boolean := coalesce(private.peran_saya() not in ('anggota'), false);
begin
  if not private.boleh_lihat_ahli_kubur() then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  cari := replace(replace(cari, '%', ''), '_', '');
  return query
  with semua as (
    select 'j' || j.id as kunci, a.id, 'jamaah'::public.jenis_ahli_kubur as jenis, j.id as jamaah_id, j.nomor_anggota,
      j.nama, a.bin_binti, j.tanggal_wafat, a.makam, a.keluarga_penghubung, null::text as hubungan, null::text as penghubung_nama,
      d.nama as desa, kc.nama as kecamatan, kc.id as kecamatan_id, kc.kabupaten_id, kb.nama as kabupaten, a.keterangan
    from public.jamaah j
    join public.desa d on d.id = j.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id join public.kabupaten kb on kb.id = kc.kabupaten_id
    left join public.ahli_kubur a on a.jamaah_id = j.id
    where j.wafat
    union all
    select 'a' || a.id, a.id, a.jenis, null, null, a.nama, a.bin_binti, a.tanggal_wafat, a.makam, a.keluarga_penghubung,
      a.hubungan, p.nama, d.nama, kc.nama, kc.id, kc.kabupaten_id, kb.nama, a.keterangan
    from public.ahli_kubur a
    left join public.jamaah p on p.id = a.penghubung_jamaah_id
    left join public.desa d on d.id = p.desa_id left join public.kecamatan kc on kc.id = d.kecamatan_id
    left join public.kabupaten kb on kb.id = kc.kabupaten_id
    where a.jenis <> 'jamaah')
  select s.kunci, s.id, s.jenis, s.jamaah_id, case when pengurus then s.nomor_anggota end, s.nama, s.bin_binti, s.tanggal_wafat,
    s.makam, s.keluarga_penghubung, s.hubungan, s.penghubung_nama, s.desa, s.kecamatan, s.kecamatan_id, s.kabupaten, s.keterangan,
    pengurus and private.boleh_kelola_ahli_kubur(s.jenis, s.jamaah_id,
      (select a2.penghubung_jamaah_id from public.ahli_kubur a2 where a2.id = s.id)),
    count(*) over ()
  from semua s
  where (p_jenis is null or s.jenis = p_jenis)
    and (p_kec is null or s.kecamatan_id = p_kec)
    and (p_kab is null or s.kabupaten_id = p_kab)
    and (cari is null or s.nama ilike '%' || cari || '%' or s.bin_binti ilike '%' || cari || '%'
         or s.penghubung_nama ilike '%' || cari || '%' or s.nomor_anggota::text = cari)
  order by s.tanggal_wafat desc nulls last, s.nama
  offset greatest(coalesce(p_dari, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;
revoke all on function public.daftar_ahli_kubur(text, public.jenis_ahli_kubur, bigint, bigint, integer, integer) from public, anon;
grant execute on function public.daftar_ahli_kubur(text, public.jenis_ahli_kubur, bigint, bigint, integer, integer) to authenticated;

-- Bahan pengingat haul: semua almarhum yang tanggal wafatnya diketahui (kolom ringkas). Hijriah dihitung di browser.
create function public.tanggal_ahli_kubur()
returns table (kunci text, jenis public.jenis_ahli_kubur, nama text, bin_binti text, tanggal_wafat date, desa text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_lihat_ahli_kubur() then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select 'j' || j.id, 'jamaah'::public.jenis_ahli_kubur, j.nama, a.bin_binti, j.tanggal_wafat, d.nama
  from public.jamaah j join public.desa d on d.id = j.desa_id left join public.ahli_kubur a on a.jamaah_id = j.id
  where j.wafat and j.tanggal_wafat is not null
  union all
  select 'a' || a.id, a.jenis, a.nama, a.bin_binti, a.tanggal_wafat, d.nama
  from public.ahli_kubur a left join public.jamaah p on p.id = a.penghubung_jamaah_id left join public.desa d on d.id = p.desa_id
  where a.jenis <> 'jamaah' and a.tanggal_wafat is not null;
end $$;
revoke all on function public.tanggal_ahli_kubur() from public, anon;
grant execute on function public.tanggal_ahli_kubur() to authenticated;
