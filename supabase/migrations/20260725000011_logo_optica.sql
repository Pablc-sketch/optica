-- Logo propio de cada óptica (spec: recetas y documentos impresos con la
-- marca de cada óptica, no un logo genérico compartido por todas).
--
-- Se guarda en Supabase Storage, en un bucket público 'logos' con un
-- archivo por tenant en la ruta {tenant_id}/logo.<ext> — el bucket público
-- sirve las imágenes por URL directa sin pasar por RLS, pero subir/reemplazar/
-- borrar sigue protegido: solo el admin de esa óptica puede tocar su propia
-- carpeta.

alter table public.tenants add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos: el admin de su óptica sube su logo" on storage.objects;
drop policy if exists "logos: el admin de su óptica reemplaza su logo" on storage.objects;
drop policy if exists "logos: el admin de su óptica borra su logo" on storage.objects;

create policy "logos: el admin de su óptica sube su logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.es_admin()
  );

create policy "logos: el admin de su óptica reemplaza su logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.es_admin()
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.es_admin()
  );

create policy "logos: el admin de su óptica borra su logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.es_admin()
  );
