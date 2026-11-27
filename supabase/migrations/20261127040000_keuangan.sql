-- Tahap 5 Langkah 1: Keuangan Yayasan (modul 9). Keputusan Kang Salman 2026-11-27:
-- buku kas masuk-keluar per tanggal & kategori, saldo otomatis; infaq tanpa nama pemberi (jumlah saja);
-- laporan publik ringkasan bulanan tanpa login (tanpa rincian transaksi);
-- pencatat: bendahara (semua kas) + koordinator wilayah (kas kecamatannya). Admin pusat & ketua melihat.
-- Aturan privasi: nominal bisyaroh hanya ketua & bendahara -> kategori "rahasia": barisnya hanya terlihat oleh ketua &
-- bendahara, hanya bendahara yang mencatat; di laporan lain tergabung ke kategori "tampil_sebagai" (Operasional).
-- Transaksi tidak dihapus: salah catat = dibatalkan + alasan (tidak bisa diaktifkan lagi; catat ulang yang benar).

create type public.arah_kas as enum ('masuk','keluar');

create table public.kas (
  id           smallint generated always as identity primary key,
  nama         text not null check (length(btrim(nama)) between 3 and 80),
  kecamatan_id integer unique references public.kecamatan(id),   -- kosong = Kas Pusat
  aktif        boolean not null default true,
  dibuat_pada  timestamptz not null default now()
);
create unique index kas_satu_pusat on public.kas ((kecamatan_id is null)) where kecamatan_id is null;
insert into public.kas (nama) values ('Kas Pusat');

create table public.kategori_kas (
  id             smallint generated always as identity primary key,
  arah           public.arah_kas not null,
  nama           text not null check (length(btrim(nama)) between 2 and 60),
  rahasia        boolean not null default false,
  tampil_sebagai text check (length(tampil_sebagai) <= 60),   -- nama di laporan bagi yang tidak boleh melihat (rahasia)
  urutan         smallint not null default 50,
  aktif          boolean not null default true,
  unique (arah, nama),
  check (not rahasia or tampil_sebagai is not null)
);
insert into public.kategori_kas (arah, nama, urutan, rahasia, tampil_sebagai) values
  ('masuk', 'Infaq kegiatan', 10, false, null), ('masuk', 'Donasi', 20, false, null), ('masuk', 'Sumbangan lain', 30, false, null),
  ('keluar', 'Konsumsi', 10, false, null), ('keluar', 'Transport', 20, false, null), ('keluar', 'Operasional', 30, false, null),
  ('keluar', 'Bantuan sosial', 40, false, null), ('keluar', 'Bisyaroh', 50, true, 'Operasional'), ('keluar', 'Lain-lain', 90, false, null);

create table public.transaksi_kas (
  id           bigint generated always as identity primary key,
  kas_id       smallint not null references public.kas(id),
  kategori_id  smallint not null references public.kategori_kas(id),
  tanggal      date not null check (tanggal between '2000-01-01' and current_date + 31),
  jumlah       bigint not null check (jumlah between 1 and 999999999999),   -- rupiah bulat
  keterangan   text check (length(keterangan) <= 300),
  nomor_bukti  text check (length(nomor_bukti) <= 60),
  dibatalkan   boolean not null default false,
  alasan_batal text check (length(alasan_batal) <= 200),
  dicatat_oleh uuid,
  dicatat_pada timestamptz not null default now(),
  diubah_pada  timestamptz not null default now(),
  check (not dibatalkan or length(btrim(coalesce(alasan_batal, ''))) >= 3)
);
create index on public.transaksi_kas (kas_id, tanggal, id);
create index on public.transaksi_kas (kategori_id);

alter table public.kas           enable row level security;
alter table public.kategori_kas  enable row level security;
alter table public.transaksi_kas enable row level security;

-- ===== Hak akses =====
-- Melihat kas: admin pusat, ketua, bendahara (semua); koordinator (kas kecamatannya). Sesi terbatas tidak.
create function private.boleh_lihat_kas(p_kas_id smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'admin_pusat' then true when 'ketua' then true when 'bendahara' then true
    when 'koordinator_wilayah' then exists (
      select 1 from public.kas k join public.pengguna_wilayah w on w.kecamatan_id = k.kecamatan_id
      where k.id = p_kas_id and w.user_id = (select auth.uid()))
    else false end, false)
$$;
-- Mencatat: bendahara (semua kas), koordinator (kas kecamatannya).
create function private.boleh_tulis_kas(p_kas_id smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and case private.peran_saya()
    when 'bendahara' then exists (select 1 from public.kas where id = p_kas_id and aktif)
    when 'koordinator_wilayah' then exists (
      select 1 from public.kas k join public.pengguna_wilayah w on w.kecamatan_id = k.kecamatan_id
      where k.id = p_kas_id and k.aktif and w.user_id = (select auth.uid()))
    else false end, false)
$$;
-- Kategori rahasia (bisyaroh): lihat = ketua & bendahara; catat = bendahara.
create function private.boleh_rahasia_kas(p_tulis boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not private.sesi_saya_terbatas() and
    private.peran_saya() = any (case when p_tulis then array['bendahara']::public.peran[] else array['ketua','bendahara']::public.peran[] end), false)
$$;
create function private.kategori_rahasia(p_kategori_id smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select rahasia from public.kategori_kas where id = p_kategori_id), false)
$$;
revoke all on function private.boleh_lihat_kas(smallint), private.boleh_tulis_kas(smallint),
  private.boleh_rahasia_kas(boolean), private.kategori_rahasia(smallint) from public, anon;
grant execute on function private.boleh_lihat_kas(smallint), private.boleh_tulis_kas(smallint),
  private.boleh_rahasia_kas(boolean), private.kategori_rahasia(smallint) to authenticated;

-- kas & kategori: dibaca pengurus (bukan anggota); kategori diubah admin pusat, ketua, bendahara. Kas dibuat lewat pastikan_kas.
create policy baca on public.kas for select to authenticated using (
  coalesce((select private.peran_saya()) <> 'anggota', false) and not (select private.sesi_saya_terbatas()));
create policy baca on public.kategori_kas for select to authenticated using (
  coalesce((select private.peran_saya()) <> 'anggota', false) and not (select private.sesi_saya_terbatas()));
create policy tambah on public.kategori_kas for insert to authenticated with check (
  coalesce((select private.peran_saya()) in ('admin_pusat','ketua','bendahara'), false) and not (select private.sesi_saya_terbatas()));
create policy ubah on public.kategori_kas for update to authenticated
  using (coalesce((select private.peran_saya()) in ('admin_pusat','ketua','bendahara'), false) and not (select private.sesi_saya_terbatas()))
  with check (coalesce((select private.peran_saya()) in ('admin_pusat','ketua','bendahara'), false));
revoke all on public.kas, public.kategori_kas from anon, authenticated;
grant select on public.kas to authenticated;
grant select, insert, update on public.kategori_kas to authenticated;

-- transaksi
create policy baca on public.transaksi_kas for select to authenticated using (
  private.boleh_lihat_kas(kas_id) and (not private.kategori_rahasia(kategori_id) or private.boleh_rahasia_kas(false)));
create policy tambah on public.transaksi_kas for insert to authenticated with check (
  private.boleh_tulis_kas(kas_id) and (not private.kategori_rahasia(kategori_id) or private.boleh_rahasia_kas(true)));
create policy ubah on public.transaksi_kas for update to authenticated
  using (private.boleh_tulis_kas(kas_id) and (not private.kategori_rahasia(kategori_id) or private.boleh_rahasia_kas(true)))
  with check (private.boleh_tulis_kas(kas_id) and (not private.kategori_rahasia(kategori_id) or private.boleh_rahasia_kas(true)));
-- Tidak ada policy DELETE.
revoke all on public.transaksi_kas from anon, authenticated;
grant select, insert (kas_id, kategori_id, tanggal, jumlah, keterangan, nomor_bukti),
  update (kategori_id, tanggal, jumlah, keterangan, nomor_bukti, dibatalkan, alasan_batal) on public.transaksi_kas to authenticated;

-- ===== Penjaga + jejak audit =====
create function private.catat_transaksi_kas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare beda jsonb; k public.kategori_kas;
begin
  select * into k from public.kategori_kas where id = new.kategori_id;
  if tg_op = 'INSERT' then
    if not k.aktif then raise exception 'Kategori ini sudah tidak dipakai.' using errcode = 'P0001'; end if;
    if new.dibatalkan then raise exception 'Transaksi baru tidak bisa langsung dibatalkan.' using errcode = 'P0001'; end if;
    new.dicatat_oleh := (select auth.uid()); new.dicatat_pada := now(); new.diubah_pada := now();
  else
    if old.dibatalkan then raise exception 'Transaksi yang sudah dibatalkan tidak bisa diubah. Catat ulang yang benar.' using errcode = 'P0001'; end if;
    if new.kas_id is distinct from old.kas_id then raise exception 'Kas tidak bisa diganti.' using errcode = 'P0001'; end if;
    if (select arah from public.kategori_kas where id = old.kategori_id) is distinct from k.arah then
      raise exception 'Masuk/keluar tidak bisa diganti. Batalkan lalu catat ulang.' using errcode = 'P0001';
    end if;
    new.dicatat_oleh := old.dicatat_oleh; new.dicatat_pada := old.dicatat_pada; new.diubah_pada := now();
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into beda
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'diubah_pada';
    if beda is null then return new; end if;
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan)
  values ('transaksi_kas', new.id, case when tg_op = 'UPDATE' and new.dibatalkan then 'batal' else lower(tg_op) end, beda);
  return new;
end $$;
revoke all on function private.catat_transaksi_kas() from public, anon, authenticated;
create trigger catat before insert or update on public.transaksi_kas for each row execute function private.catat_transaksi_kas();

create function private.catat_kategori_kas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.arah is distinct from old.arah or new.rahasia is distinct from old.rahasia) then
    raise exception 'Jenis masuk/keluar dan sifat rahasia kategori tidak bisa diganti.' using errcode = 'P0001';
  end if;
  if new.rahasia and tg_op = 'INSERT' and not private.boleh_rahasia_kas(true) then
    raise exception 'Kategori rahasia hanya bisa dibuat bendahara.' using errcode = '42501';
  end if;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan) values ('kategori_kas', new.id, lower(tg_op), to_jsonb(new));
  return new;
end $$;
revoke all on function private.catat_kategori_kas() from public, anon, authenticated;
create trigger catat after insert or update on public.kategori_kas for each row execute function private.catat_kategori_kas();

-- ===== Kas kecamatan: dibuat saat pertama dipakai =====
-- Bendahara/admin pusat/ketua: kecamatan mana saja; koordinator: kecamatannya. Hasil: id kas.
create function public.pastikan_kas(p_kecamatan_id integer) returns smallint
language plpgsql security definer set search_path = '' as $$
declare kid smallint; nm text;
begin
  if private.sesi_saya_terbatas() or not (
       private.peran_saya() in ('admin_pusat','ketua','bendahara')
       or (private.peran_saya() = 'koordinator_wilayah' and exists (select 1 from public.pengguna_wilayah
            where user_id = (select auth.uid()) and kecamatan_id = p_kecamatan_id))) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  select id into kid from public.kas where kecamatan_id = p_kecamatan_id;
  if found then return kid; end if;
  select 'Kas Kec. ' || nama into nm from public.kecamatan where id = p_kecamatan_id;
  if nm is null then raise exception 'Kecamatan tidak dikenal.' using errcode = 'P0001'; end if;
  insert into public.kas (nama, kecamatan_id) values (nm, p_kecamatan_id) on conflict (kecamatan_id) do nothing returning id into kid;
  if kid is null then select id into kid from public.kas where kecamatan_id = p_kecamatan_id; end if;
  return kid;
end $$;
revoke all on function public.pastikan_kas(integer) from public, anon;
grant execute on function public.pastikan_kas(integer) to authenticated;

-- ===== Saldo per kas yang boleh dilihat (termasuk bisyaroh di dalam total; rinciannya tidak) =====
create function public.saldo_kas() returns table (kas_id smallint, nama text, kecamatan_id integer, masuk bigint, keluar bigint,
  saldo bigint, boleh_tulis boolean)
language sql stable security definer set search_path = '' as $$
  select k.id, k.nama, k.kecamatan_id,
    coalesce(sum(t.jumlah) filter (where c.arah = 'masuk'), 0)::bigint,
    coalesce(sum(t.jumlah) filter (where c.arah = 'keluar'), 0)::bigint,
    coalesce(sum(case c.arah when 'masuk' then t.jumlah else -t.jumlah end), 0)::bigint,
    private.boleh_tulis_kas(k.id)
  from public.kas k
  left join public.transaksi_kas t on t.kas_id = k.id and not t.dibatalkan
  left join public.kategori_kas c on c.id = t.kategori_id
  where private.boleh_lihat_kas(k.id)
  group by k.id, k.nama, k.kecamatan_id
  order by k.kecamatan_id nulls first, k.nama
$$;
revoke all on function public.saldo_kas() from public, anon;
grant execute on function public.saldo_kas() to authenticated;

-- ===== Daftar transaksi (Buku Kas) =====
-- Baris rahasia hanya untuk ketua & bendahara. Saldo berjalan (dihitung dari semua baris, termasuk rahasia) hanya untuk
-- yang boleh melihat rahasia, agar nominal bisyaroh tidak bisa ditebak dari loncatan saldo.
-- p_status: null = tercatat (tanpa dibatalkan), 'batal' = dibatalkan, 'semua'.
create function public.daftar_transaksi(p_kas_id smallint, p_dari date default null, p_sampai date default null,
  p_arah public.arah_kas default null, p_kategori_id smallint default null, p_cari text default null, p_status text default null,
  p_offset integer default 0, p_batas integer default 20)
returns table (id bigint, tanggal date, arah public.arah_kas, kategori_id smallint, kategori text, rahasia boolean, jumlah bigint,
  keterangan text, nomor_bukti text, dibatalkan boolean, alasan_batal text, saldo_berjalan bigint, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  lihat_rahasia boolean := private.boleh_rahasia_kas(false);
  cari text := replace(replace(nullif(btrim(coalesce(p_cari, '')), ''), '%', ''), '_', '');
begin
  if not private.boleh_lihat_kas(p_kas_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return query
  with semua as (
    select t.*, c.arah, c.nama as kat, c.rahasia,
      sum(case when t.dibatalkan then 0 when c.arah = 'masuk' then t.jumlah else -t.jumlah end)
        over (order by t.tanggal, t.id rows unbounded preceding) as sb
    from public.transaksi_kas t join public.kategori_kas c on c.id = t.kategori_id
    where t.kas_id = p_kas_id)
  select s.id, s.tanggal, s.arah, s.kategori_id, s.kat, s.rahasia, s.jumlah, s.keterangan, s.nomor_bukti, s.dibatalkan, s.alasan_batal,
    case when lihat_rahasia and not s.dibatalkan then s.sb::bigint end, count(*) over ()
  from semua s
  where (lihat_rahasia or not s.rahasia)
    and case coalesce(p_status, '') when 'batal' then s.dibatalkan when 'semua' then true else not s.dibatalkan end
    and (p_dari is null or s.tanggal >= p_dari) and (p_sampai is null or s.tanggal <= p_sampai)
    and (p_arah is null or s.arah = p_arah) and (p_kategori_id is null or s.kategori_id = p_kategori_id)
    and (cari is null or s.keterangan ilike '%' || cari || '%' or s.nomor_bukti ilike '%' || cari || '%')
  order by s.tanggal desc, s.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_batas, 20), 1), 1000);
end $$;
revoke all on function public.daftar_transaksi(smallint, date, date, public.arah_kas, smallint, text, text, integer, integer) from public, anon;
grant execute on function public.daftar_transaksi(smallint, date, date, public.arah_kas, smallint, text, text, integer, integer) to authenticated;

-- ===== Laporan bulanan satu tahun (bersama untuk pengurus & publik) =====
-- Kategori rahasia digabung ke tampil_sebagai kecuali p_rinci_rahasia. Saldo awal = saldo sebelum 1 Januari tahun itu.
create function private.laporan_tahun(p_kas_id smallint, p_tahun integer, p_rinci_rahasia boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (
    select t.tanggal, t.jumlah, c.arah,
      case when c.rahasia and not p_rinci_rahasia then c.tampil_sebagai else c.nama end as kat
    from public.transaksi_kas t join public.kategori_kas c on c.id = t.kategori_id
    where t.kas_id = p_kas_id and not t.dibatalkan),
  th as (select * from t where extract(year from tanggal) = p_tahun),
  bln as (
    select to_char(tanggal, 'YYYY-MM') as b,
      sum(jumlah) filter (where arah = 'masuk') as masuk, sum(jumlah) filter (where arah = 'keluar') as keluar
    from th group by 1)
  select jsonb_build_object(
    'kas', (select nama from public.kas where id = p_kas_id),
    'tahun', p_tahun,
    'saldo_awal', coalesce((select sum(case arah when 'masuk' then jumlah else -jumlah end) from t
                           where tanggal < make_date(p_tahun, 1, 1)), 0),
    'masuk', coalesce((select sum(jumlah) from th where arah = 'masuk'), 0),
    'keluar', coalesce((select sum(jumlah) from th where arah = 'keluar'), 0),
    'bulan', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'masuk', coalesce(masuk, 0), 'keluar', coalesce(keluar, 0)) order by b) from bln), '[]'::jsonb),
    'kategori', coalesce((select jsonb_agg(jsonb_build_object('arah', arah, 'nama', kat, 'jumlah', n) order by arah, n desc)
                 from (select arah, kat, sum(jumlah) n from th group by arah, kat) x), '[]'::jsonb),
    'per_bulan_kategori', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'arah', arah, 'nama', kat, 'jumlah', n) order by b, arah, n desc)
                 from (select to_char(tanggal, 'YYYY-MM') b, arah, kat, sum(jumlah) n from th group by 1, 2, 3) y), '[]'::jsonb),
    'tahun_ada', coalesce((select jsonb_agg(distinct extract(year from tanggal)::int) from t), '[]'::jsonb))
$$;
revoke all on function private.laporan_tahun(smallint, integer, boolean) from public, anon, authenticated;

create function public.laporan_kas(p_kas_id smallint, p_tahun integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_lihat_kas(p_kas_id) then raise exception 'tidak berhak' using errcode = '42501'; end if;
  return private.laporan_tahun(p_kas_id, p_tahun, private.boleh_rahasia_kas(false));
end $$;
revoke all on function public.laporan_kas(smallint, integer) from public, anon;
grant execute on function public.laporan_kas(smallint, integer) to authenticated;

-- ===== Publik (tanpa login): daftar kas aktif + laporan tahunan per bulan & kategori (rahasia digabung) =====
create function public.kas_publik() returns table (id smallint, nama text)
language sql stable security definer set search_path = '' as $$
  select id, nama from public.kas where aktif order by kecamatan_id nulls first, nama
$$;
create function public.laporan_publik(p_kas_id smallint default null, p_tahun integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare kid smallint := coalesce(p_kas_id, (select id from public.kas where kecamatan_id is null));
begin
  if not exists (select 1 from public.kas where id = kid and aktif) then raise exception 'Kas tidak dikenal.' using errcode = 'P0001'; end if;
  if p_tahun is not null and p_tahun not between 2000 and 2100 then raise exception 'Tahun tidak valid.' using errcode = '22023'; end if;
  return private.laporan_tahun(kid, coalesce(p_tahun, extract(year from (now() at time zone 'Asia/Jakarta'))::int), false)
    - 'per_bulan_kategori';
end $$;
revoke all on function public.kas_publik(), public.laporan_publik(smallint, integer) from public;
grant execute on function public.kas_publik(), public.laporan_publik(smallint, integer) to anon, authenticated;
