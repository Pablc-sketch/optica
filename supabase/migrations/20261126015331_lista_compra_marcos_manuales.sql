create table public.lista_compra_marcos_manuales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  codigo text not null check (char_length(btrim(codigo)) between 1 and 80),
  proveedor text not null check (char_length(btrim(proveedor)) between 1 and 80),
  cantidad integer not null check (cantidad > 0),
  comprado boolean not null default false
);

create unique index lista_compra_marcos_manuales_codigo_proveedor
  on public.lista_compra_marcos_manuales
  (tenant_id, lower(btrim(proveedor)), upper(regexp_replace(codigo, '[[:space:]-]+', '', 'g')));

alter table public.lista_compra_marcos_manuales enable row level security;
revoke all on public.lista_compra_marcos_manuales from public, anon, authenticated;
grant select, insert, update, delete on public.lista_compra_marcos_manuales to authenticated;

create policy lista_compra_marcos_manuales_lectura on public.lista_compra_marcos_manuales
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) in ('admin', 'ventas'));

create policy lista_compra_marcos_manuales_alta on public.lista_compra_marcos_manuales
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()));

create policy lista_compra_marcos_manuales_edicion on public.lista_compra_marcos_manuales
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()));

create policy lista_compra_marcos_manuales_baja on public.lista_compra_marcos_manuales
  for delete to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()));
