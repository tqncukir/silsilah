-- Jenis kelamin: tanda "ditebak dari nama" (Kang 2026-11-28: "semua datanya sudah diperbaiki").
-- Dicek di data asli 2026-11-28: 5.053 tanda tebakan, semuanya SAMA dengan jenis kelamin sekarang, 0 jenis kelamin kosong,
-- 0 tanda "perlu dicek". Tanda tidak hilang karena trigger lama hanya jalan bila nilainya BERUBAH; membenarkan tebakan
-- yang sudah tepat (nilai sama) tidak menghapus tanda.
-- 1) Atas perintah Kang: tanda tebakan dibersihkan (hanya tanda, data jenis kelamin jamaah tidak berubah).
delete from public.jamaah_jk_tebakan;

-- 2) Trigger: setiap kali pengurus menyimpan jenis kelamin (berubah atau tidak), tanda tebakannya hilang.
drop trigger jk_diisi_pengurus on public.jamaah;
create trigger jk_diisi_pengurus after update of jenis_kelamin on public.jamaah
  for each row when (new.jenis_kelamin is not null)
  execute function private.hapus_tanda_jk();
