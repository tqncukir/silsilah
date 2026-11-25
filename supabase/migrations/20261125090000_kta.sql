-- Langkah 6: KTA Digital.
-- QR KTA baru = kode bertanda tangan (HMAC) dengan kunci KTA_KUNCI yang hanya dipasang admin pusat
-- di rahasia Edge Function. Database hanya menyimpan versi kartu (untuk membatalkan kartu hilang).
create table private.kta (
  jamaah_id    bigint primary key references public.jamaah(id),
  versi        smallint not null default 1 check (versi between 1 and 999),
  dicetak_pada timestamptz,
  diubah_oleh  uuid
);
alter table private.kta enable row level security; -- tanpa policy: tertutup

-- PIN KTA baru (6 angka acak) untuk dicetak di kartu. Hanya ditampilkan sekali; yang disimpan hanya hash.
-- PIN lama otomatis tidak berlaku. Hanya pengurus yang berhak atas desa jamaah itu.
create function public.buat_pin_kta(p_jamaah_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare d integer; pin text;
begin
  select desa_id into d from public.jamaah where id = p_jamaah_id and not wafat;
  if d is null or coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua', 'koordinator_wilayah')
     or not private.boleh_kelola_desa(d) then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  pin := lpad(((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
  perform private.set_pin(p_jamaah_id, pin);
  insert into private.kta (jamaah_id, dicetak_pada, diubah_oleh) values (p_jamaah_id, now(), auth.uid())
  on conflict (jamaah_id) do update set dicetak_pada = now(), diubah_oleh = auth.uid();
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan) values ('kta', p_jamaah_id, 'pin_baru', '{}'::jsonb);
  return pin;
end $$;
revoke all on function public.buat_pin_kta(bigint) from public, anon;
grant execute on function public.buat_pin_kta(bigint) to authenticated;

-- KTA hilang/dicuri: naikkan versi, QR lama langsung tidak berlaku. Hanya admin pusat & ketua.
create function public.ganti_kta(p_jamaah_id bigint) returns smallint
language plpgsql security definer set search_path = '' as $$
declare v smallint;
begin
  if coalesce(private.peran_saya()::text, '') not in ('admin_pusat', 'ketua') then
    raise exception 'tidak berhak' using errcode = '42501';
  end if;
  insert into private.kta (jamaah_id, versi, diubah_oleh) values (p_jamaah_id, 2, auth.uid())
  on conflict (jamaah_id) do update set versi = private.kta.versi + 1, diubah_oleh = auth.uid()
  returning versi into v;
  insert into public.log_perubahan (tabel, baris_id, aksi, perubahan) values ('kta', p_jamaah_id, 'ganti_kartu', jsonb_build_object('versi', v));
  return v;
end $$;
revoke all on function public.ganti_kta(bigint) from public, anon;
grant execute on function public.ganti_kta(bigint) to authenticated;

-- Data untuk cek keaslian KTA. Hanya server (Edge Function kta, service_role).
create function public.kta_info(p_nomor bigint)
returns table (jamaah_id bigint, nama text, desa text, kecamatan text, kabupaten text, aktif boolean, wafat boolean, versi smallint)
language sql stable security definer set search_path = '' as $$
  select j.id, j.nama, d.nama, k.nama, b.nama, j.aktif, j.wafat, coalesce(t.versi, 1::smallint)
  from public.jamaah j
  join public.desa d on d.id = j.desa_id
  join public.kecamatan k on k.id = d.kecamatan_id
  join public.kabupaten b on b.id = k.kabupaten_id
  left join private.kta t on t.jamaah_id = j.id
  where j.nomor_anggota = p_nomor
$$;
revoke all on function public.kta_info(bigint) from public, anon, authenticated;
grant execute on function public.kta_info(bigint) to service_role;

-- Batas cek KTA lama per alamat IP (20 kali per 15 menit). Hanya server.
create function public.boleh_cek_kta(p_ip text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text := 'kta:' || coalesce(p_ip, '-');
begin
  delete from private.login_gagal where waktu < now() - interval '1 day';
  if (select count(*) from private.login_gagal where kunci = k and waktu > now() - interval '15 minutes') >= 20 then
    return false;
  end if;
  insert into private.login_gagal (kunci) values (k);
  return true;
end $$;
revoke all on function public.boleh_cek_kta(text) from public, anon, authenticated;
grant execute on function public.boleh_cek_kta(text) to service_role;
