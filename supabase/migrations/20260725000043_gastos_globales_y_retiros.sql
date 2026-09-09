-- Dos cosas que no son costo de un operativo puntual, pero igual salen de
-- la plata del negocio y hay que llevarles la cuenta:
--
--   * gastos_globales — reponer stock (marcos, bandejas, etc.), arriendos
--     fijos, cualquier gasto que no nace de un operativo específico.
--   * retiros_sueldo — plata que Isadora, la mamá o Pablo sacan por
--     adelantado, en efectivo o de la cuenta, contra lo que les
--     corresponde de sueldo. No es un gasto del negocio (esa plata ya era
--     de esa persona, solo se la llevó antes de que se calculara el
--     reparto) — por eso va en una tabla aparte de gastos_globales.
create table public.gastos_globales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  fecha date not null,
  categoria text not null check (categoria in ('compra_inventario', 'arriendo', 'otro')),
  descripcion text not null,
  monto bigint not null check (monto >= 0),
  medio_pago text check (medio_pago in ('efectivo', 'debito', 'credito', 'transferencia')),
  created_at timestamptz not null default now()
);

create table public.retiros_sueldo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  persona text not null check (persona in ('isadora', 'madre', 'pablo')),
  fecha date not null,
  monto bigint not null check (monto >= 0),
  medio_pago text check (medio_pago in ('efectivo', 'debito', 'credito', 'transferencia')),
  motivo text,
  -- Opcional: contra qué operativo se está adelantando este retiro. Sin
  -- operativo = un adelanto general, no contra uno específico.
  operativo_id uuid references public.operativos (id),
  created_at timestamptz not null default now()
);

alter table public.gastos_globales enable row level security;
alter table public.retiros_sueldo enable row level security;

create policy "gastos_globales: lectura del propio tenant"
  on public.gastos_globales for select to authenticated
  using (tenant_id = public.jwt_tenant_id());
create policy "gastos_globales: alta con suscripción vigente"
  on public.gastos_globales for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "gastos_globales: edición con suscripción vigente"
  on public.gastos_globales for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "gastos_globales: borrado con suscripción vigente"
  on public.gastos_globales for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "retiros_sueldo: lectura del propio tenant"
  on public.retiros_sueldo for select to authenticated
  using (tenant_id = public.jwt_tenant_id());
create policy "retiros_sueldo: alta con suscripción vigente"
  on public.retiros_sueldo for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "retiros_sueldo: edición con suscripción vigente"
  on public.retiros_sueldo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "retiros_sueldo: borrado con suscripción vigente"
  on public.retiros_sueldo for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

grant select, insert, update, delete on public.gastos_globales to authenticated;
grant select, insert, update, delete on public.retiros_sueldo to authenticated;
grant all on public.gastos_globales to service_role;
grant all on public.retiros_sueldo to service_role;
