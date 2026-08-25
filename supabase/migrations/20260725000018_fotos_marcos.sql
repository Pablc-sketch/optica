-- Fotos e identificación de marcos: para reconocer el armazón a simple
-- vista en vez de solo por nombre/SKU, y para distinguir variantes del
-- mismo modelo por su código corto de color (distinto del nombre
-- descriptivo que ya existía en 'color', ej. "Negro brillante" vs "C1").
alter table public.productos
  add column if not exists imagen_url text,
  add column if not exists codigo_color text;

-- Mismo patrón que 'logos' (20260725000011_logo_optica.sql): bucket público
-- con un archivo por producto en {tenant_id}/{producto_id}.<ext>, pero acá
-- puede subir quien carga inventario nuevo día a día — no solo el admin,
-- también bodega (y ventas, que también puede editar inventario según la
-- matriz de permisos de la app).
insert into storage.buckets (id, name, public)
values ('marcos', 'marcos', true)
on conflict (id) do nothing;

drop policy if exists "marcos: quien edita inventario sube la foto" on storage.objects;
drop policy if exists "marcos: quien edita inventario reemplaza la foto" on storage.objects;
drop policy if exists "marcos: quien edita inventario borra la foto" on storage.objects;

create policy "marcos: quien edita inventario sube la foto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marcos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.puede_editar_inventario()
  );

create policy "marcos: quien edita inventario reemplaza la foto"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'marcos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.puede_editar_inventario()
  )
  with check (
    bucket_id = 'marcos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.puede_editar_inventario()
  );

create policy "marcos: quien edita inventario borra la foto"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marcos'
    and (storage.foldername(name))[1] = public.jwt_tenant_id()::text
    and public.puede_editar_inventario()
  );
