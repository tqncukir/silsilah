-- Tahap 6 Langkah 1: Bantuan Sosial (modul 6). Keputusan Kang Salman 2026-11-27:
-- bantuan uang + barang (barang: nama + perkiraan nilai); alur diajukan -> disetujui/ditolak (ketua) -> disalurkan;
-- uang yang disalurkan otomatis jadi pengeluaran "Bantuan sosial" di Buku Kas (tanpa nama penerima);
-- nama penerima (data ekonomi, rahasia) hanya ketua, bendahara, koordinator untuk wilayahnya; admin pusat hanya jumlah.
-- Semua penulisan lewat fungsi; tidak ada yang dihapus; perubahan masuk log_perubahan.

create type public.jenis_bantuan as enum ('duka','sakit','sembako','pendidikan','bencana','lainnya');
create type public.bentuk_bantuan as enum ('uang','barang');
create type public.status_bantuan as enum ('diajukan','disetujui','ditolak','disalurkan','dibatalkan');

create table public.bantuan (
  id               bigint generated always as identity primary key,
  jamaah_id        bigint not null references public.jamaah(id),
  jenis            public.jenis_bantuan not null,
  bentuk           public.bentuk_bantuan not null,
  nilai            bigint check (nilai between 1 and 999999999999),     -- uang: jumlah; barang: perkiraan (boleh kosong)
  barang           text check (length(btrim(barang)) between 2 and 120),
  keterangan       text check (length(keterangan) <= 300),
  status           public.status_bantuan not null default 'diajukan',
  diajukan_oleh    uuid,
  diajukan_pada    timestamptz not null default now(),
  diputus_oleh     uuid,
  diputus_pada     timestamptz,
  alasan           text check (length(alasan) <= 200),                   -- alasan ditolak / dibatalkan
  disalurkan_tgl   date,
  kas_id           smallint references public.kas(id),
  transaksi_kas_id bigint references public.transaksi_kas(id),
  disalurkan_oleh  uuid,
  diubah_pada      timestamptz not null default now(),
  check ((bentuk = 'uang' and nilai is not null and barang is null) or (bentuk = 'barang' and barang is not null)),
  check (status <> 'disalurkan' or disalurkan_tgl is not null),
  check (bentuk <> 'uang' or status <> 'disalurkan' or transaksi_kas_id is not null)
);
create index on public.bantuan (jamaah_id);
create index on public.bantuan (status, diajukan_pada desc);

alter table public.bantuan enable row level security;
revoke all on public.bantuan from anon, authenticated;   -- dibaca & ditulis hanya lewat fungsi di bawah (tanpa policy = tertutup)

-- ===== Hak =====
-- Wilayah koordinator (tanpa pengecualian admin, beda dengan boleh_kelola_desa).
create function private.jamaah_di_wilayah_saya(p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jamaah j join public.desa d on d.id = j.desa_id
    join public.pengguna_wilayah w on w.kecamatan_id = d.kecamatan_id
    where j.id = p_jamaah_id and w.user_id = (select auth.uid()))
$$;
-- Melihat nama penerima: ketua & bendahara (semua), koordinator (wilayahnya). Sesi KTA lama tidak.
create function private.boleh_lihat_bantuan(p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'ketua' then true when 'bendahara' then true
    when 'koordinator_wilayah' then private.jamaah_di_wilayah_saya(p_jamaah_id)
    else false end, false)
$$;
revoke all on function private.jamaah_di_wilayah_saya(bigint), private.boleh_lihat_bantuan(bigint) from public, anon;
grant execute on function private.jamaah_di_wilayah_saya(bigint), private.boleh_lihat_bantuan(bigint) to authenticated;

-- ===== Jejak audit =====
create function private.catat_bantuan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb;
begin
  new.diubah_pada := now();
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
  else
    beda := jsonb_build_object('jamaah_id', new.jamaah_id, 'jenis', new.jenis, 'bentuk', new.bentuk, 'nilai', new.nilai);
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('bantuan', new.id, case when tg_op = 'INSERT' then 'insert' else new.status::text end, beda);
  return new;
end $$;
revoke all on function private.catat_bantuan() from public, anon, authenticated;
create trigger catat before insert or update on public.bantuan for each row execute function private.catat_bantuan();

-- ===== Ajukan =====
-- Pengaju: ketua, bendahara (jamaah mana saja), koordinator (jamaah wilayahnya). Penerima aktif & hidup;
-- santunan duka boleh untuk jamaah yang sudah wafat (diterima ahli waris).
create function public.ajukan_bantuan(p_nomor bigint, p_jenis public.jenis_bantuan, p_bentuk public.bentuk_bantuan,
  p_nilai bigint default null, p_barang text default null, p_keterangan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j record; bid bigint;
  ket text := nullif(btrim(regexp_replace(coalesce(p_keterangan, ''), '\s+', ' ', 'g')), '');
  brg text := nullif(btrim(regexp_replace(coalesce(p_barang, ''), '\s+', ' ', 'g')), '');
begin
  if private.sesi_saya_terbatas() or coalesce(private.peran_saya() not in ('ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select ja.id, ja.nama, ja.aktif, ja.wafat, d.nama as desa into j
  from public.jamaah ja join public.desa d on d.id = ja.desa_id where ja.nomor_anggota = p_nomor;
  if j.id is null then raise exception 'Nomor Anggota tidak terdaftar.' using errcode = 'P0001'; end if;
  if private.peran_saya() = 'koordinator_wilayah' and not private.jamaah_di_wilayah_saya(j.id) then
    raise exception 'Anda hanya bisa mengajukan bantuan untuk jamaah wilayah Anda.' using errcode = '42501';
  end if;
  if j.wafat and p_jenis <> 'duka' then raise exception '% tercatat wafat. Hanya santunan duka yang bisa diajukan.', j.nama using errcode = 'P0001'; end if;
  if not j.wafat and not j.aktif then raise exception '% berstatus tidak aktif.', j.nama using errcode = 'P0001'; end if;
  if p_bentuk = 'uang' and coalesce(p_nilai, 0) < 1 then raise exception 'Jumlah uang belum diisi.' using errcode = '22023'; end if;
  if p_bentuk = 'barang' and length(coalesce(brg, '')) < 2 then raise exception 'Nama barang belum diisi.' using errcode = '22023'; end if;
  if ket ~ '[0-9]{8,}' then raise exception 'Jangan menulis nomor HP atau NIK di keterangan.' using errcode = '22023'; end if;
  insert into public.bantuan (jamaah_id, jenis, bentuk, nilai, barang, keterangan, diajukan_oleh)
  values (j.id, p_jenis, p_bentuk, p_nilai, case when p_bentuk = 'barang' then brg end, ket, (select auth.uid()))
  returning id into bid;
  return jsonb_build_object('id', bid, 'nama', j.nama, 'desa', j.desa, 'wafat', j.wafat);
end $$;

-- ===== Setujui / tolak (ketua) =====
create function public.putuskan_bantuan(p_id bigint, p_setuju boolean, p_alasan text default null, p_nilai bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bantuan; als text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if private.sesi_saya_terbatas() or private.peran_saya() is distinct from 'ketua' then raise exception 'tidak berhak' using errcode = '42501'; end if;
  select * into b from public.bantuan where id = p_id for update;
  if not found then raise exception 'Bantuan tidak ditemukan.' using errcode = 'P0001'; end if;
  if b.status <> 'diajukan' then raise exception 'Bantuan ini sudah diputuskan (%).', b.status using errcode = 'P0001'; end if;
  if not p_setuju and length(coalesce(als, '')) < 3 then raise exception 'Tulis alasan penolakan.' using errcode = '22023'; end if;
  if p_nilai is not null and (p_nilai < 1 or p_nilai > 999999999999) then raise exception 'Nilai tidak valid.' using errcode = '22023'; end if;
  update public.bantuan set status = case when p_setuju then 'disetujui'::public.status_bantuan else 'ditolak' end,
    diputus_oleh = (select auth.uid()), diputus_pada = now(), alasan = case when p_setuju then null else als end,
    nilai = case when p_setuju and p_nilai is not null then p_nilai else nilai end
  where id = p_id;
end $$;

-- ===== Salurkan =====
-- Bendahara (kas mana saja) atau koordinator (jamaah wilayahnya, kas kecamatannya). Uang: otomatis pengeluaran
-- "Bantuan sosial" di Buku Kas, keterangan tanpa nama penerima.
create function public.salurkan_bantuan(p_id bigint, p_tanggal date, p_kas_id smallint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.bantuan; kat smallint; tid bigint;
begin
  if private.sesi_saya_terbatas() or coalesce(private.peran_saya() not in ('bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select * into b from public.bantuan where id = p_id for update;
  if not found or not private.boleh_lihat_bantuan(b.jamaah_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if b.status <> 'disetujui' then raise exception 'Hanya bantuan yang sudah disetujui ketua yang bisa disalurkan.' using errcode = 'P0001'; end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date or p_tanggal < '2000-01-01' then
    raise exception 'Tanggal disalurkan tidak valid.' using errcode = '22023';
  end if;
  if b.bentuk = 'uang' then
    if p_kas_id is null then raise exception 'Pilih kas sumber uangnya.' using errcode = '22023'; end if;
    if not private.boleh_tulis_kas(p_kas_id) then raise exception 'Akun ini tidak berhak mencatat di kas itu.' using errcode = '42501'; end if;
    select id into kat from public.kategori_kas where arah = 'keluar' and nama = 'Bantuan sosial' and aktif;
    if kat is null then raise exception 'Kategori "Bantuan sosial" di Buku Kas tidak ditemukan.' using errcode = 'P0001'; end if;
    insert into public.transaksi_kas (kas_id, kategori_id, tanggal, jumlah, keterangan)
    values (p_kas_id, kat, p_tanggal, b.nilai, format('Bantuan sosial no. %s (%s)', b.id, b.jenis))
    returning id into tid;
  end if;
  update public.bantuan set status = 'disalurkan', disalurkan_tgl = p_tanggal, kas_id = case when b.bentuk = 'uang' then p_kas_id end,
    transaksi_kas_id = tid, disalurkan_oleh = (select auth.uid())
  where id = p_id;
  return jsonb_build_object('id', p_id, 'transaksi_kas_id', tid);
end $$;

-- ===== Batalkan (sebelum disalurkan) =====
-- Ketua, bendahara, atau koordinator wilayahnya. Wajib alasan.
create function public.batalkan_bantuan(p_id bigint, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bantuan; als text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  select * into b from public.bantuan where id = p_id for update;
  if not found or not private.boleh_lihat_bantuan(b.jamaah_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if b.status not in ('diajukan','disetujui') then raise exception 'Bantuan yang sudah % tidak bisa dibatalkan.', b.status using errcode = 'P0001'; end if;
  if length(coalesce(als, '')) < 3 then raise exception 'Tulis alasan pembatalan.' using errcode = '22023'; end if;
  update public.bantuan set status = 'dibatalkan', alasan = als where id = p_id;
end $$;

-- ===== Daftar (nama penerima hanya untuk yang berhak) =====
create function public.daftar_bantuan(p_status public.status_bantuan default null, p_jenis public.jenis_bantuan default null,
  p_kab bigint default null, p_kec bigint default null, p_dari date default null, p_sampai date default null,
  p_cari text default null, p_jamaah_id bigint default null, p_id bigint default null, p_offset integer default 0, p_batas integer default 20)
returns table (id bigint, jamaah_id bigint, nomor_anggota bigint, nama text, wafat boolean, desa text, kecamatan text, kabupaten text,
  jenis public.jenis_bantuan, bentuk public.bentuk_bantuan, nilai bigint, barang text, keterangan text, status public.status_bantuan,
  diajukan_pada timestamptz, diputus_pada timestamptz, alasan text, disalurkan_tgl date, kas text, transaksi_kas_id bigint,
  boleh_putus boolean, boleh_salur boolean, boleh_batal boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', ''); peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select b.id, j.id, j.nomor_anggota, j.nama, j.wafat, d.nama, kc.nama, kb.nama, b.jenis, b.bentuk, b.nilai, b.barang, b.keterangan, b.status,
    b.diajukan_pada, b.diputus_pada, b.alasan, b.disalurkan_tgl, k.nama, b.transaksi_kas_id,
    peran = 'ketua' and b.status = 'diajukan',
    peran in ('bendahara','koordinator_wilayah') and b.status = 'disetujui',
    b.status in ('diajukan','disetujui'),
    count(*) over ()
  from public.bantuan b
  join public.jamaah j on j.id = b.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  left join public.kas k on k.id = b.kas_id
  where private.boleh_lihat_bantuan(b.jamaah_id)
    and (p_status is null or b.status = p_status) and (p_jenis is null or b.jenis = p_jenis)
    and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)
    and (p_dari is null or (b.diajukan_pada at time zone 'Asia/Jakarta')::date >= p_dari)
    and (p_sampai is null or (b.diajukan_pada at time zone 'Asia/Jakarta')::date <= p_sampai)
    and (p_jamaah_id is null or b.jamaah_id = p_jamaah_id) and (p_id is null or b.id = p_id)
    and (cari is null or j.nama ilike '%' || cari || '%' or j.nomor_anggota::text = cari)
  order by case b.status when 'diajukan' then 0 when 'disetujui' then 1 else 2 end, b.diajukan_pada desc, b.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;

-- ===== Ringkasan jumlah (tanpa nama): admin pusat, ketua, bendahara semua; koordinator wilayahnya =====
-- Periode = tanggal diajukan (WIB); nilai disalurkan = uang + perkiraan barang yang sudah disalurkan.
create function public.ringkas_bantuan(p_kab bigint default null, p_kec bigint default null, p_dari date default null, p_sampai date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('admin_pusat','ketua','bendahara','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return (
    with b as (
      select b.* from public.bantuan b
      join public.jamaah j on j.id = b.jamaah_id join public.desa d on d.id = j.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id
      where (peran <> 'koordinator_wilayah' or private.jamaah_di_wilayah_saya(b.jamaah_id))
        and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)
        and (p_dari is null or (b.diajukan_pada at time zone 'Asia/Jakarta')::date >= p_dari)
        and (p_sampai is null or (b.diajukan_pada at time zone 'Asia/Jakarta')::date <= p_sampai))
    select jsonb_build_object(
      'diajukan', count(*) filter (where status = 'diajukan'),
      'disetujui', count(*) filter (where status = 'disetujui'),
      'disalurkan', count(*) filter (where status = 'disalurkan'),
      'ditolak', count(*) filter (where status = 'ditolak'),
      'penerima', count(distinct jamaah_id) filter (where status = 'disalurkan'),
      'nilai_uang', coalesce(sum(nilai) filter (where status = 'disalurkan' and bentuk = 'uang'), 0),
      'nilai_barang', coalesce(sum(nilai) filter (where status = 'disalurkan' and bentuk = 'barang'), 0),
      'jenis', coalesce((select jsonb_agg(jsonb_build_object('jenis', jenis, 'n', n, 'nilai', v) order by n desc)
        from (select jenis, count(*) n, coalesce(sum(nilai), 0) v from b where status = 'disalurkan' group by jenis) x), '[]'::jsonb))
    from b);
end $$;

revoke all on function public.ajukan_bantuan(bigint, public.jenis_bantuan, public.bentuk_bantuan, bigint, text, text),
  public.putuskan_bantuan(bigint, boolean, text, bigint), public.salurkan_bantuan(bigint, date, smallint),
  public.batalkan_bantuan(bigint, text),
  public.daftar_bantuan(public.status_bantuan, public.jenis_bantuan, bigint, bigint, date, date, text, bigint, bigint, integer, integer),
  public.ringkas_bantuan(bigint, bigint, date, date) from public, anon;
grant execute on function public.ajukan_bantuan(bigint, public.jenis_bantuan, public.bentuk_bantuan, bigint, text, text),
  public.putuskan_bantuan(bigint, boolean, text, bigint), public.salurkan_bantuan(bigint, date, smallint),
  public.batalkan_bantuan(bigint, text),
  public.daftar_bantuan(public.status_bantuan, public.jenis_bantuan, bigint, bigint, date, date, text, bigint, bigint, integer, integer),
  public.ringkas_bantuan(bigint, bigint, date, date) to authenticated;
