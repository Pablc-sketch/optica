create table public.caja_saldos_confirmados (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  saldo bigint not null check (saldo between 0 and 999999999999),
  saldo_registrado bigint not null,
  confirmado_en timestamptz not null default now(),
  confirmado_por uuid not null default auth.uid()
);
create index caja_saldos_confirmados_ultimo
  on public.caja_saldos_confirmados (tenant_id, confirmado_en desc, id);
alter table public.caja_saldos_confirmados enable row level security;
revoke all on public.caja_saldos_confirmados from public, anon, authenticated;
grant select on public.caja_saldos_confirmados to authenticated;
grant insert (id, tenant_id, saldo, saldo_registrado) on public.caja_saldos_confirmados to authenticated;
create policy caja_saldos_confirmados_leer on public.caja_saldos_confirmados for select to authenticated
using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin');
create policy caja_saldos_confirmados_crear on public.caja_saldos_confirmados for insert to authenticated
with check (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin'
  and (select public.suscripcion_vigente()) and confirmado_por = (select auth.uid()));
