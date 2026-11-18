-- Costos nuevos separados; los históricos conservan su costo de marco.
alter table public.operativos
  add column costo_hospedaje bigint not null default 0 check (costo_hospedaje >= 0),
  add column costo_comida bigint not null default 0 check (costo_comida >= 0),
  add column costo_peajes bigint not null default 0 check (costo_peajes >= 0),
  add column costo_marco_unitario bigint not null default 5000 check (costo_marco_unitario >= 0);

-- Un gasto ya pagado puede cubrir varios operativos. Esta asignación NO
-- crea una salida de caja ni duplica el costo en la utilidad.
create table public.gastos_asignaciones (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  gasto_id uuid not null references public.gastos_globales(id),
  operativo_id uuid not null references public.operativos(id),
  clave text not null check (clave in ('fides','marcos','costo_equipos','costo_arriendo','costo_transporte','costo_viaticos','costo_hospedaje','costo_comida','costo_peajes','costo_ayudante','costo_otros')),
  monto bigint not null check (monto > 0 and monto <= 9007199254740991),
  creado_por uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references public.users(id)
);
create index on public.gastos_asignaciones(tenant_id,operativo_id);
create index on public.gastos_asignaciones(gasto_id);
create index on public.gastos_asignaciones(creado_por);
create index on public.gastos_asignaciones(anulado_por);
alter table public.gastos_asignaciones enable row level security;
revoke all on public.gastos_asignaciones from public,anon,authenticated;
grant select,insert,update on public.gastos_asignaciones to authenticated;
create policy gastos_asignaciones_leer on public.gastos_asignaciones for select to authenticated
using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy gastos_asignaciones_crear on public.gastos_asignaciones for insert to authenticated
with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy gastos_asignaciones_anular on public.gastos_asignaciones for update to authenticated
using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()))
with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));

create function finanzas_privado.validar_asignacion() returns trigger language plpgsql security invoker set search_path='' as $$
declare g public.gastos_globales; usado bigint;
begin
  if public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true or new.tenant_id is distinct from public.jwt_tenant_id() then raise exception 'Sin permiso'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['anulado_en','anulado_por']) is distinct from (to_jsonb(old)-array['anulado_en','anulado_por']) or old.anulado_en is not null or new.anulado_en is null then raise exception 'Solo puedes deshacer una vinculación activa'; end if;
    new.anulado_en := now(); new.anulado_por := auth.uid(); return new;
  end if;
  new.creado_por := auth.uid(); new.created_at := now(); new.anulado_en := null; new.anulado_por := null;
  select * into g from public.gastos_globales where id=new.gasto_id and tenant_id=new.tenant_id for update;
  if g.id is null then raise exception 'Gasto no disponible'; end if;
  perform 1 from public.operativos where id=new.operativo_id and tenant_id=new.tenant_id for update;
  if not found then raise exception 'Operativo no disponible'; end if;
  if g.descripcion ~ '^(Costo operativo · |Fides · |Marcos · )' then raise exception 'Este pago ya está asociado directamente a un costo'; end if;
  select coalesce(sum(monto),0) into usado from public.gastos_asignaciones where gasto_id=g.id and anulado_en is null;
  if usado+new.monto > g.monto then raise exception 'El gasto no tiene suficiente importe sin vincular. Recarga.'; end if;
  return new;
end;
$$;
revoke all on function finanzas_privado.validar_asignacion() from public,anon,authenticated;
create trigger validar_asignacion before insert or update on public.gastos_asignaciones for each row execute function finanzas_privado.validar_asignacion();

-- Nunca dejar una asignación colgando o convertir el mismo gasto en dos pagos.
create function finanzas_privado.proteger_gasto_asignado() returns trigger language plpgsql security invoker set search_path='' as $$
declare usado bigint;
begin
  select coalesce(sum(monto),0) into usado from public.gastos_asignaciones where gasto_id=old.id and anulado_en is null;
  if usado>0 and (new.monto<usado or new.descripcion ~ '^(Costo operativo · |Fides · |Marcos · )') then raise exception 'Desvincula primero los pagos de este gasto'; end if;
  return new;
end;
$$;
revoke all on function finanzas_privado.proteger_gasto_asignado() from public,anon,authenticated;
create trigger proteger_gasto_asignado before update on public.gastos_globales for each row execute function finanzas_privado.proteger_gasto_asignado();
