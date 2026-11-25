-- Permintaan Kang 2026-11-25: Desa, Kecamatan, Kabupaten/Kota diketik (jamaah dari banyak kota).
-- Fungsi ini mencari wilayah yang cocok (huruf besar/kecil diabaikan); kalau belum ada, dibuat.
-- Membuat wilayah baru hanya admin pusat & ketua. Koordinator hanya boleh desa di kecamatan tugasnya.
create function private.rapikan_nama(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(initcap(regexp_replace(trim(t), '\s+', ' ', 'g')), '')
$$;

create function public.desa_id_wilayah(p_kabupaten text, p_kecamatan text, p_desa text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  kab text := private.rapikan_nama(regexp_replace(trim(p_kabupaten), '^(kabupaten|kab\.?)\s+', '', 'i'));
  kec text := private.rapikan_nama(regexp_replace(trim(p_kecamatan), '^(kecamatan|kec\.?)\s+', '', 'i'));
  des text := private.rapikan_nama(regexp_replace(trim(p_desa), '^(desa|kelurahan|kel\.?)\s+', '', 'i'));
  peran public.peran := private.peran_saya();
  buat boolean := peran in ('admin_pusat', 'ketua');
  kab_id smallint; kec_id integer; des_id integer;
begin
  if peran is null or peran not in ('admin_pusat', 'ketua', 'koordinator_wilayah') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  if kab is null or kec is null or des is null then raise exception 'wilayah belum lengkap' using errcode = '22023'; end if;
  if length(kab) > 60 or length(kec) > 60 or length(des) > 60 then raise exception 'nama terlalu panjang' using errcode = '22023'; end if;

  select id into kab_id from public.kabupaten where lower(nama) = lower(kab);
  if kab_id is null and buat then insert into public.kabupaten (nama) values (kab) returning id into kab_id; end if;
  if kab_id is not null then
    select id into kec_id from public.kecamatan where kabupaten_id = kab_id and lower(nama) = lower(kec);
    if kec_id is null and buat then insert into public.kecamatan (kabupaten_id, nama) values (kab_id, kec) returning id into kec_id; end if;
  end if;
  if kec_id is not null then
    select id into des_id from public.desa where kecamatan_id = kec_id and lower(nama) = lower(des);
    if des_id is null and buat then insert into public.desa (kecamatan_id, nama) values (kec_id, des) returning id into des_id; end if;
  end if;

  if des_id is null or not private.boleh_kelola_desa(des_id) then
    raise exception 'di luar wilayah tugas' using errcode = '42501';
  end if;
  return des_id;
end $$;
revoke all on function public.desa_id_wilayah(text, text, text) from public, anon;
grant execute on function public.desa_id_wilayah(text, text, text) to authenticated;
revoke all on function private.rapikan_nama(text) from public, anon;
