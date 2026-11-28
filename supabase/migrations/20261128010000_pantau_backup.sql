-- Tahap 12 Langkah 1: Dashboard Pantau Backup, khusus Admin Pusat (2026-11-28).
-- Setiap kali backup harian jalan (berhasil atau gagal), GitHub Actions menulis satu baris lewat
-- private.catat_backup() memakai koneksi database yang sudah ada. Aplikasi hanya membaca lewat
-- public.status_backup(), yang menolak selain admin pusat (sesi penuh). Riwayat disimpan 90 hari.

create table private.catatan_backup (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  berhasil boolean not null,
  gagal_di text check (char_length(gagal_di) <= 100),   -- nama langkah yang gagal
  jumlah_tabel integer check (jumlah_tabel >= 0),
  ukuran_byte bigint check (ukuran_byte >= 0),
  dirapikan integer check (dirapikan >= 0),            -- file lama yang dihapus di Drive
  nama_file text check (nama_file ~ '^silsilah-\d{4}-\d{2}-\d{2}\.7z$'),
  run_url text check (run_url ~ '^https://github\.com/tqncukir/silsilah/actions/runs/\d+$')
);
create index catatan_backup_waktu on private.catatan_backup (waktu desc);
alter table private.catatan_backup enable row level security;  -- tanpa policy: tertutup total
revoke all on private.catatan_backup from public, anon, authenticated;

-- Dipanggil GitHub Actions (peran postgres). Sekaligus menghapus catatan lebih dari 90 hari.
create function private.catat_backup(p_berhasil boolean, p_gagal_di text, p_jumlah_tabel integer,
  p_ukuran_byte bigint, p_dirapikan integer, p_nama_file text, p_run_url text) returns void
language sql security definer set search_path = '' as $$
  delete from private.catatan_backup where waktu < now() - interval '90 days';
  insert into private.catatan_backup (berhasil, gagal_di, jumlah_tabel, ukuran_byte, dirapikan, nama_file, run_url)
  values (p_berhasil, nullif(p_gagal_di, ''), p_jumlah_tabel, p_ukuran_byte, p_dirapikan,
          nullif(p_nama_file, ''), nullif(p_run_url, ''));
$$;
revoke all on function private.catat_backup(boolean, text, integer, bigint, integer, text, text)
  from public, anon, authenticated;

-- Riwayat 90 hari, terbaru dulu. Hanya admin pusat.
create function public.status_backup()
returns table (waktu timestamptz, berhasil boolean, gagal_di text, jumlah_tabel integer,
               ukuran_byte bigint, dirapikan integer, nama_file text, run_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.wajib_admin_pusat();
  return query
    select c.waktu, c.berhasil, c.gagal_di, c.jumlah_tabel, c.ukuran_byte, c.dirapikan, c.nama_file, c.run_url
    from private.catatan_backup c
    where c.waktu >= now() - interval '90 days'
    order by c.waktu desc
    limit 200;
end $$;
revoke all on function public.status_backup() from public, anon;
grant execute on function public.status_backup() to authenticated;
