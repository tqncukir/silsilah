-- Tahap 9 Langkah 1: Kesehatan (modul 7). Keputusan Kang Salman 2026-11-27:
-- dicatat jamaah sakit (sedang sakit/dirawat + kunjungan sampai sembuh) dan kebutuhan khusus (kursi roda, pendamping, dll.);
-- TANPA nama penyakit; dilihat & dicatat ketua, dokter pendamping (semua), koordinator (jamaah wilayahnya);
-- khodim hanya nama + kebutuhan khusus peserta perjalanan; admin pusat angka saja; anggota tidak melihat apa pun.
-- Semua tabel tertutup total (hanya lewat fungsi); tidak ada yang dihapus; perubahan masuk log_perubahan.

create type public.tempat_sakit as enum ('rumah','rawat_inap');
create type public.kondisi_sakit as enum ('ringan','sedang','berat');
create type public.status_sakit as enum ('sakit','sembuh','wafat');
create type public.jenis_kebutuhan as enum ('kursi_roda','alat_jalan','pendamping','tangga','penglihatan','pendengaran','lainnya');

create table public.sakit (
  id          bigint generated always as identity primary key,
  jamaah_id   bigint not null references public.jamaah(id),
  tempat      public.tempat_sakit not null,
  nama_rs     text check (length(btrim(nama_rs)) between 2 and 80 and nama_rs !~ '[0-9]{8,}'),
  kondisi     public.kondisi_sakit not null,
  mulai       date not null check (mulai >= date '2000-01-01'),
  status      public.status_sakit not null default 'sakit',
  selesai     date,
  keterangan  text check (length(keterangan) <= 200 and keterangan !~ '[0-9]{8,}'),
  dicatat_oleh uuid,
  dicatat_pada timestamptz not null default now(),
  diubah_pada  timestamptz not null default now(),
  check ((status = 'sakit') = (selesai is null)),
  check (selesai is null or selesai >= mulai),
  check (tempat = 'rawat_inap' or nama_rs is null)
);
create unique index sakit_satu_aktif on public.sakit (jamaah_id) where status = 'sakit';  -- satu catatan "sedang sakit" per jamaah
create index on public.sakit (status, mulai desc);

create table public.kunjungan_sakit (
  id           bigint generated always as identity primary key,
  sakit_id     bigint not null references public.sakit(id),
  tanggal      date not null,
  penjenguk    text not null check (length(btrim(penjenguk)) between 2 and 120 and penjenguk !~ '[0-9]{8,}'),
  catatan      text check (length(catatan) <= 200 and catatan !~ '[0-9]{8,}'),
  dicatat_oleh uuid,
  dicatat_pada timestamptz not null default now()
);
create index on public.kunjungan_sakit (sakit_id, tanggal desc);

create table public.kebutuhan_khusus (
  jamaah_id   bigint primary key references public.jamaah(id),
  kebutuhan   public.jenis_kebutuhan[] not null default '{}' check (cardinality(kebutuhan) <= 7),
  keterangan  text check (length(keterangan) <= 120 and keterangan !~ '[0-9]{8,}'),
  diubah_oleh uuid,
  diubah_pada timestamptz not null default now()
);
create index on public.kebutuhan_khusus using gin (kebutuhan);

alter table public.sakit enable row level security;
alter table public.kunjungan_sakit enable row level security;
alter table public.kebutuhan_khusus enable row level security;
revoke all on public.sakit, public.kunjungan_sakit, public.kebutuhan_khusus from anon, authenticated;  -- tanpa policy: hanya lewat fungsi

-- ===== Hak =====
-- Lihat & catat: ketua & dokter (semua), koordinator (jamaah wilayahnya). Sesi KTA lama tidak.
create function private.boleh_kesehatan(p_jamaah_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'ketua' then true when 'dokter' then true
    when 'koordinator_wilayah' then private.jamaah_di_wilayah_saya(p_jamaah_id)
    else false end, false)
$$;
revoke all on function private.boleh_kesehatan(bigint) from public, anon;
grant execute on function private.boleh_kesehatan(bigint) to authenticated;

-- ===== Jejak audit =====
create function private.catat_kesehatan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb; baris bigint; aksi text := lower(tg_op);
begin
  if tg_table_name = 'sakit' then
    new.diubah_pada := now();
    if tg_op = 'INSERT' then new.dicatat_oleh := (select auth.uid()); new.dicatat_pada := now();
    else new.jamaah_id := old.jamaah_id; new.dicatat_oleh := old.dicatat_oleh; new.dicatat_pada := old.dicatat_pada;
      if new.status is distinct from old.status then aksi := new.status::text; end if; end if;
    baris := new.id;
  elsif tg_table_name = 'kunjungan_sakit' then
    new.dicatat_oleh := (select auth.uid()); new.dicatat_pada := now(); baris := new.id;
  else
    new.diubah_oleh := (select auth.uid()); new.diubah_pada := now(); baris := new.jamaah_id;
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('diubah_pada','diubah_oleh');
    if beda is null then return new; end if;
  else
    beda := to_jsonb(new) - 'dicatat_oleh' - 'dicatat_pada' - 'diubah_oleh' - 'diubah_pada';
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values (tg_table_name, baris, aksi, beda);
  return new;
end $$;
revoke all on function private.catat_kesehatan() from public, anon, authenticated;
create trigger catat before insert or update on public.sakit for each row execute function private.catat_kesehatan();
create trigger catat before insert or update on public.kunjungan_sakit for each row execute function private.catat_kesehatan();
create trigger catat before insert or update on public.kebutuhan_khusus for each row execute function private.catat_kesehatan();

-- ===== Bantu: rapikan teks & periksa =====
create function private.teks_kesehatan(p text, p_maks integer, p_label text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '');
begin
  if length(coalesce(t, '')) > p_maks then raise exception '% maksimal % huruf.', p_label, p_maks using errcode = '22023'; end if;
  if t ~ '[0-9]{8,}' then raise exception 'Jangan menulis nomor HP atau NIK di %.', lower(p_label) using errcode = '22023'; end if;
  return t;
end $$;
revoke all on function private.teks_kesehatan(text, integer, text) from public, anon, authenticated;

-- ===== Catat & ubah sakit =====
create function public.catat_sakit(p_jamaah_id bigint, p_tempat public.tempat_sakit, p_kondisi public.kondisi_sakit,
  p_mulai date, p_nama_rs text default null, p_keterangan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j record; sid bigint; rs text := private.teks_kesehatan(p_nama_rs, 80, 'Nama rumah sakit');
  ket text := private.teks_kesehatan(p_keterangan, 200, 'Keterangan');
begin
  select id, nama, aktif, wafat into j from public.jamaah where id = p_jamaah_id;
  if j.id is null or not private.boleh_kesehatan(j.id) then raise exception 'Jamaah tidak ditemukan di wilayah Anda.' using errcode = '42501'; end if;
  if j.wafat then raise exception '% tercatat wafat.', j.nama using errcode = 'P0001'; end if;
  if not j.aktif then raise exception '% berstatus tidak aktif.', j.nama using errcode = 'P0001'; end if;
  if p_tempat is null or p_kondisi is null then raise exception 'Pilih tempat dirawat dan kondisi.' using errcode = '22023'; end if;
  if p_mulai is null or p_mulai > (now() at time zone 'Asia/Jakarta')::date or p_mulai < date '2000-01-01' then
    raise exception 'Tanggal mulai sakit tidak valid.' using errcode = '22023';
  end if;
  if exists (select 1 from public.sakit where jamaah_id = j.id and status = 'sakit') then
    raise exception '% sudah tercatat sedang sakit. Buka catatan itu untuk mengubah.', j.nama using errcode = 'P0001';
  end if;
  insert into public.sakit (jamaah_id, tempat, nama_rs, kondisi, mulai, keterangan)
  values (j.id, p_tempat, case when p_tempat = 'rawat_inap' then rs end, p_kondisi, p_mulai, ket)
  returning id into sid;
  return jsonb_build_object('id', sid, 'nama', j.nama);
end $$;

create function public.ubah_sakit(p_id bigint, p_tempat public.tempat_sakit, p_kondisi public.kondisi_sakit,
  p_mulai date, p_nama_rs text default null, p_keterangan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sakit; rs text := private.teks_kesehatan(p_nama_rs, 80, 'Nama rumah sakit');
  ket text := private.teks_kesehatan(p_keterangan, 200, 'Keterangan');
begin
  select * into s from public.sakit where id = p_id for update;
  if not found or not private.boleh_kesehatan(s.jamaah_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if p_tempat is null or p_kondisi is null then raise exception 'Pilih tempat dirawat dan kondisi.' using errcode = '22023'; end if;
  if p_mulai is null or p_mulai > (now() at time zone 'Asia/Jakarta')::date or p_mulai < date '2000-01-01' or p_mulai > coalesce(s.selesai, p_mulai) then
    raise exception 'Tanggal mulai sakit tidak valid.' using errcode = '22023';
  end if;
  update public.sakit set tempat = p_tempat, nama_rs = case when p_tempat = 'rawat_inap' then rs end, kondisi = p_kondisi,
    mulai = p_mulai, keterangan = ket where id = p_id;
end $$;

-- Ganti status: sembuh / wafat (wajib tanggal), atau kembali "sedang sakit" bila salah tandai.
-- Wafat di sini tidak mengubah status jamaah; ubah di Data Jamaah.
create function public.atur_status_sakit(p_id bigint, p_status public.status_sakit, p_tanggal date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sakit;
begin
  select * into s from public.sakit where id = p_id for update;
  if not found or not private.boleh_kesehatan(s.jamaah_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if p_status = 'sakit' then
    if exists (select 1 from public.sakit where jamaah_id = s.jamaah_id and status = 'sakit' and id <> p_id) then
      raise exception 'Jamaah ini sudah punya catatan sedang sakit yang lain.' using errcode = 'P0001';
    end if;
    update public.sakit set status = 'sakit', selesai = null where id = p_id;
    return;
  end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date or p_tanggal < s.mulai then
    raise exception 'Tanggal % tidak valid (tidak boleh sebelum mulai sakit atau hari depan).', case when p_status = 'wafat' then 'wafat' else 'sembuh' end using errcode = '22023';
  end if;
  update public.sakit set status = p_status, selesai = p_tanggal where id = p_id;
end $$;

create function public.catat_kunjungan(p_sakit_id bigint, p_tanggal date, p_penjenguk text, p_catatan text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare s public.sakit; kid bigint; pj text := private.teks_kesehatan(p_penjenguk, 120, 'Nama penjenguk');
  ct text := private.teks_kesehatan(p_catatan, 200, 'Catatan');
begin
  select * into s from public.sakit where id = p_sakit_id;
  if not found or not private.boleh_kesehatan(s.jamaah_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  if length(coalesce(pj, '')) < 2 then raise exception 'Tulis siapa yang menjenguk.' using errcode = '22023'; end if;
  if p_tanggal is null or p_tanggal > (now() at time zone 'Asia/Jakarta')::date or p_tanggal < s.mulai then
    raise exception 'Tanggal kunjungan tidak valid (tidak boleh sebelum mulai sakit atau hari depan).' using errcode = '22023';
  end if;
  insert into public.kunjungan_sakit (sakit_id, tanggal, penjenguk, catatan) values (p_sakit_id, p_tanggal, pj, ct) returning id into kid;
  return kid;
end $$;

-- ===== Daftar sakit (nama hanya untuk yang berhak) =====
create function public.daftar_sakit(p_status public.status_sakit default null, p_kondisi public.kondisi_sakit default null,
  p_kab bigint default null, p_kec bigint default null, p_cari text default null, p_jamaah_id bigint default null,
  p_id bigint default null, p_offset integer default 0, p_batas integer default 20)
returns table (id bigint, jamaah_id bigint, nomor_anggota bigint, nama text, desa text, kecamatan text, kabupaten text,
  tempat public.tempat_sakit, nama_rs text, kondisi public.kondisi_sakit, mulai date, status public.status_sakit, selesai date,
  keterangan text, kunjungan bigint, kunjungan_terakhir date, kebutuhan public.jenis_kebutuhan[], total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', ''); peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('ketua','dokter','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select s.id, j.id, j.nomor_anggota, j.nama, d.nama, kc.nama, kb.nama, s.tempat, s.nama_rs, s.kondisi, s.mulai, s.status, s.selesai,
    s.keterangan, coalesce(k.n, 0), k.terakhir, kk.kebutuhan, count(*) over ()
  from public.sakit s
  join public.jamaah j on j.id = s.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  left join lateral (select count(*) n, max(x.tanggal) terakhir from public.kunjungan_sakit x where x.sakit_id = s.id) k on true
  left join public.kebutuhan_khusus kk on kk.jamaah_id = j.id
  where (peran <> 'koordinator_wilayah' or kc.id in (select w.kecamatan_id from public.pengguna_wilayah w where w.user_id = (select auth.uid())))
    and (p_status is null or s.status = p_status) and (p_kondisi is null or s.kondisi = p_kondisi)
    and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)
    and (p_jamaah_id is null or s.jamaah_id = p_jamaah_id) and (p_id is null or s.id = p_id)
    and (cari is null or j.nama ilike '%' || cari || '%' or j.nomor_anggota::text = cari)
  order by (s.status = 'sakit') desc, s.kondisi desc, coalesce(s.selesai, s.mulai) desc, s.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;

create function public.daftar_kunjungan(p_sakit_id bigint)
returns table (id bigint, tanggal date, penjenguk text, catatan text, dicatat_pada timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare jid bigint;
begin
  select s.jamaah_id into jid from public.sakit s where s.id = p_sakit_id;
  if jid is null or not private.boleh_kesehatan(jid) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return query select k.id, k.tanggal, k.penjenguk, k.catatan, k.dicatat_pada from public.kunjungan_sakit k
    where k.sakit_id = p_sakit_id order by k.tanggal desc, k.id desc limit 200;
end $$;

-- ===== Kebutuhan khusus =====
create function public.simpan_kebutuhan(p_jamaah_id bigint, p_kebutuhan public.jenis_kebutuhan[], p_keterangan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare j record; ket text := private.teks_kesehatan(p_keterangan, 120, 'Keterangan');
  kb public.jenis_kebutuhan[] := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_kebutuhan, '{}')) x);
begin
  select id, nama, wafat into j from public.jamaah where id = p_jamaah_id;
  if j.id is null or not private.boleh_kesehatan(j.id) then raise exception 'Jamaah tidak ditemukan di wilayah Anda.' using errcode = '42501'; end if;
  if j.wafat then raise exception '% tercatat wafat.', j.nama using errcode = 'P0001'; end if;
  if 'lainnya' = any(kb) and length(coalesce(ket, '')) < 3 then raise exception 'Tulis keterangan untuk kebutuhan "Lainnya".' using errcode = '22023'; end if;
  update public.kebutuhan_khusus set kebutuhan = kb, keterangan = ket where jamaah_id = j.id;
  if not found then
    if cardinality(kb) = 0 and ket is null then return; end if;
    insert into public.kebutuhan_khusus (jamaah_id, kebutuhan, keterangan) values (j.id, kb, ket);
  end if;
end $$;

-- Daftar jamaah dengan kebutuhan khusus. Tanpa p_perjalanan_id: ketua, dokter (semua), koordinator (wilayahnya).
-- Dengan p_perjalanan_id: peserta jamaah perjalanan itu (belum batal) — ketua, dokter, khodim (semua peserta),
-- koordinator (peserta dari wilayahnya). Tidak pernah menyertakan catatan sakit.
create function public.daftar_kebutuhan(p_kebutuhan public.jenis_kebutuhan default null, p_kab bigint default null, p_kec bigint default null,
  p_cari text default null, p_jamaah_id bigint default null, p_perjalanan_id bigint default null, p_offset integer default 0, p_batas integer default 20)
returns table (jamaah_id bigint, nomor_anggota bigint, nama text, desa text, kecamatan text, kabupaten text,
  kebutuhan public.jenis_kebutuhan[], keterangan text, diubah_pada timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', ''); peran public.peran := private.peran_saya();
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('ketua','dokter','koordinator_wilayah','khodim'), true)
     or (peran = 'khodim' and p_perjalanan_id is null) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return query
  select j.id, case when peran = 'khodim' then null else j.nomor_anggota end, j.nama, d.nama, kc.nama, kb.nama,
    k.kebutuhan, k.keterangan, k.diubah_pada, count(*) over ()
  from public.kebutuhan_khusus k
  join public.jamaah j on j.id = k.jamaah_id
  join public.desa d on d.id = j.desa_id
  join public.kecamatan kc on kc.id = d.kecamatan_id
  join public.kabupaten kb on kb.id = kc.kabupaten_id
  where (cardinality(k.kebutuhan) > 0 or p_jamaah_id is not null) and not j.wafat
    and (peran = 'khodim' or private.boleh_kesehatan(j.id))
    and (p_perjalanan_id is null or exists (select 1 from public.peserta_perjalanan pp
         where pp.perjalanan_id = p_perjalanan_id and pp.jamaah_id = j.id and not pp.batal))
    and (p_kebutuhan is null or p_kebutuhan = any(k.kebutuhan))
    and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)
    and (p_jamaah_id is null or j.id = p_jamaah_id)
    and (cari is null or j.nama ilike '%' || cari || '%' or (peran <> 'khodim' and j.nomor_anggota::text = cari))
  order by kb.nama, kc.nama, d.nama, j.nama, j.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;

-- ===== Ringkasan tanpa nama: admin pusat, ketua, dokter (semua); koordinator (wilayahnya) =====
create function public.ringkas_kesehatan(p_kab bigint default null, p_kec bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare peran public.peran := private.peran_saya(); kini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if private.sesi_saya_terbatas() or coalesce(peran not in ('admin_pusat','ketua','dokter','koordinator_wilayah'), true) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  return (
    with w as (
      select j.id from public.jamaah j join public.desa d on d.id = j.desa_id join public.kecamatan kc on kc.id = d.kecamatan_id
      where (peran <> 'koordinator_wilayah' or kc.id in (select x.kecamatan_id from public.pengguna_wilayah x where x.user_id = (select auth.uid())))
        and (p_kec is null or kc.id = p_kec) and (p_kab is null or kc.kabupaten_id = p_kab)),
    s as (select s.* from public.sakit s join w on w.id = s.jamaah_id),
    k as (select k.* from public.kebutuhan_khusus k join w on w.id = k.jamaah_id join public.jamaah j on j.id = k.jamaah_id
          where not j.wafat and cardinality(k.kebutuhan) > 0)
    select jsonb_build_object(
      'sakit', (select count(*) from s where status = 'sakit'),
      'rawat_inap', (select count(*) from s where status = 'sakit' and tempat = 'rawat_inap'),
      'berat', (select count(*) from s where status = 'sakit' and kondisi = 'berat'),
      'belum_dijenguk', (select count(*) from s where status = 'sakit' and not exists (select 1 from public.kunjungan_sakit x where x.sakit_id = s.id)),
      'sembuh_30', (select count(*) from s where status = 'sembuh' and selesai >= kini - 30),
      'kunjungan_30', (select count(*) from public.kunjungan_sakit x join s on s.id = x.sakit_id where x.tanggal >= kini - 30),
      'kebutuhan', (select count(*) from k),
      'per_kebutuhan', coalesce((select jsonb_object_agg(t, n) from (select t::text, count(*) n from k, unnest(k.kebutuhan) t group by t) x), '{}'::jsonb)));
end $$;

revoke all on function public.catat_sakit(bigint, public.tempat_sakit, public.kondisi_sakit, date, text, text),
  public.ubah_sakit(bigint, public.tempat_sakit, public.kondisi_sakit, date, text, text),
  public.atur_status_sakit(bigint, public.status_sakit, date), public.catat_kunjungan(bigint, date, text, text),
  public.daftar_sakit(public.status_sakit, public.kondisi_sakit, bigint, bigint, text, bigint, bigint, integer, integer),
  public.daftar_kunjungan(bigint), public.simpan_kebutuhan(bigint, public.jenis_kebutuhan[], text),
  public.daftar_kebutuhan(public.jenis_kebutuhan, bigint, bigint, text, bigint, bigint, integer, integer),
  public.ringkas_kesehatan(bigint, bigint) from public, anon;
grant execute on function public.catat_sakit(bigint, public.tempat_sakit, public.kondisi_sakit, date, text, text),
  public.ubah_sakit(bigint, public.tempat_sakit, public.kondisi_sakit, date, text, text),
  public.atur_status_sakit(bigint, public.status_sakit, date), public.catat_kunjungan(bigint, date, text, text),
  public.daftar_sakit(public.status_sakit, public.kondisi_sakit, bigint, bigint, text, bigint, bigint, integer, integer),
  public.daftar_kunjungan(bigint), public.simpan_kebutuhan(bigint, public.jenis_kebutuhan[], text),
  public.daftar_kebutuhan(public.jenis_kebutuhan, bigint, bigint, text, bigint, bigint, integer, integer),
  public.ringkas_kesehatan(bigint, bigint) to authenticated;
