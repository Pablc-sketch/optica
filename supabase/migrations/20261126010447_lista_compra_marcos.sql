create table public.lista_compra_marcos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  clave text not null check (clave ~ '^[0-9a-f]{64}$'),
  revision text not null check (revision ~ '^[0-9a-f]{64}$'),
  en_mano integer check (en_mano >= 0),
  comprados integer not null default 0 check (comprados >= 0),
  primary key (tenant_id, clave)
);

alter table public.lista_compra_marcos enable row level security;
revoke all on public.lista_compra_marcos from public, anon, authenticated;
grant select, insert, update on public.lista_compra_marcos to authenticated;

create policy lista_compra_marcos_lectura on public.lista_compra_marcos
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) in ('admin', 'ventas'));

create policy lista_compra_marcos_alta on public.lista_compra_marcos
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()));

create policy lista_compra_marcos_edicion on public.lista_compra_marcos
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_ventas()));
