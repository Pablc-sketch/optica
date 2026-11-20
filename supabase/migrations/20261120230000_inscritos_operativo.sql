create table public.inscritos_operativo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operativo_id uuid not null,
  nombre text not null check (char_length(trim(nombre)) between 1 and 100),
  telefono text not null check (telefono ~ '^569[0-9]{8}$'),
  nombre_clave text generated always as (lower(trim(nombre))) stored,
  llego boolean not null default false,
  foreign key (tenant_id, operativo_id) references public.operativos (tenant_id,id) on delete restrict,
  unique (operativo_id, telefono, nombre_clave)
);
alter table public.inscritos_operativo enable row level security;
create policy inscritos_lectura on public.inscritos_operativo for select to authenticated
using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() in ('admin','ventas'));
create policy inscritos_alta on public.inscritos_operativo for insert to authenticated
with check (tenant_id = public.jwt_tenant_id() and public.jwt_rol() in ('admin','ventas') and public.suscripcion_vigente());
create policy inscritos_asistencia on public.inscritos_operativo for update to authenticated
using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() in ('admin','ventas') and public.suscripcion_vigente())
with check (tenant_id = public.jwt_tenant_id());
revoke all on public.inscritos_operativo from anon, authenticated;
grant select, insert, update (llego) on public.inscritos_operativo to authenticated;
