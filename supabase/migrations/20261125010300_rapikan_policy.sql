-- Saran Supabase advisors: satu policy per aksi (lebih cepat), dan tutup fungsi bawaan dari API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

do $$ declare t text; a text; begin
  foreach t in array array['kabupaten','kecamatan','desa','mursyid','pengguna','pengguna_wilayah'] loop
    execute format('drop policy kelola on public.%I', t);
    foreach a in array array['insert','update','delete'] loop
      execute format('create policy %s on public.%I for %s to authenticated %s',
        'admin_' || a, t, a,
        case a when 'insert' then 'with check ((select private.peran_saya()) = ''admin_pusat'')'
               when 'update' then 'using ((select private.peran_saya()) = ''admin_pusat'') with check ((select private.peran_saya()) = ''admin_pusat'')'
               else 'using ((select private.peran_saya()) = ''admin_pusat'')' end);
    end loop;
  end loop;
end $$;
