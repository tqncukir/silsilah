-- Tahap 15 Langkah 1: "Perlu ditindaklanjuti" di Beranda pengurus.
-- Satu fungsi, hanya JUMLAH (tanpa nama), tiap jenis mengikuti hak yang sudah ada:
--   berita_menunggu   pimpinan berita (admin pusat, ketua): berita koordinator yang diajukan
--   berita_ditolak    koordinator: berita tulisannya sendiri yang ditolak (perlu diperbaiki)
--   bantuan_putus     ketua: pengajuan bantuan yang belum diputuskan
--   bantuan_salur     bendahara & koordinator (wilayahnya): bantuan disetujui, belum disalurkan
--   peserta_belum_lunas  yang boleh menandai lunas: peserta aktif perjalanan yang belum berangkat
--   sakit_belum_dijenguk ketua, dokter, koordinator (wilayahnya): sedang sakit, tidak dijenguk 7 hari terakhir
-- Anggota, peran lain, dan sesi KTA lama: objek kosong {}.

create function public.tindak_lanjut() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  peran public.peran := private.peran_saya();
  hari date := (now() at time zone 'Asia/Jakarta')::date;
  hasil jsonb := '{}'::jsonb;
begin
  if peran is null or private.sesi_saya_terbatas() or peran = 'anggota' then
    return hasil;
  end if;

  if private.peran_berita() = 'pimpinan' then
    hasil := hasil || jsonb_build_object('berita_menunggu',
      (select count(*) from public.berita where status = 'diajukan'));
  elsif private.peran_berita() = 'koordinator' then
    hasil := hasil || jsonb_build_object('berita_ditolak',
      (select count(*) from public.berita where status = 'ditolak' and penulis = (select auth.uid())));
  end if;

  if peran = 'ketua' then
    hasil := hasil || jsonb_build_object('bantuan_putus',
      (select count(*) from public.bantuan where status = 'diajukan'));
  end if;
  if peran in ('bendahara', 'koordinator_wilayah') then
    hasil := hasil || jsonb_build_object('bantuan_salur',
      (select count(*) from public.bantuan b where b.status = 'disetujui' and private.boleh_lihat_bantuan(b.jamaah_id)));
  end if;

  hasil := hasil || jsonb_build_object('peserta_belum_lunas',
    (select count(*) from public.peserta_perjalanan s join public.perjalanan p on p.id = s.perjalanan_id
     where not s.batal and not s.lunas and not p.dibatalkan
       and (p.berangkat at time zone 'Asia/Jakarta')::date >= hari
       and private.boleh_lunas(s.perjalanan_id, coalesce(s.jamaah_id, s.penghubung_jamaah_id))));

  if peran in ('ketua', 'dokter', 'koordinator_wilayah') then
    hasil := hasil || jsonb_build_object('sakit_belum_dijenguk',
      (select count(*) from public.sakit k
       where k.status = 'sakit' and k.mulai <= hari - 7
         and not exists (select 1 from public.kunjungan_sakit v where v.sakit_id = k.id and v.tanggal > hari - 7)
         and private.boleh_kesehatan(k.jamaah_id)));
  end if;

  return hasil;
end $$;

revoke all on function public.tindak_lanjut() from public, anon;
grant execute on function public.tindak_lanjut() to authenticated;
