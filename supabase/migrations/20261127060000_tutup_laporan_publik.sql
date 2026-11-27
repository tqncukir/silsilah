-- Tutup total Laporan Infaq publik (permintaan Kang 2026-11-27: info sensitif).
-- Fungsi tanpa login dihapus; laporan pengurus (laporan_kas) tetap. Tidak ada data yang dihapus.
drop function if exists public.laporan_publik(smallint, integer);
drop function if exists public.kas_publik();
