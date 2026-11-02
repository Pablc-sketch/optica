-- No cambia movimientos anteriores. Un gasto personal no toca las cajas del negocio.
alter table public.operativos add column costo_fides_real bigint check(costo_fides_real >= 0),
  add column costo_fides_nota text check(length(costo_fides_nota)<=250),
  add column costo_fides_actualizado_en timestamptz;
create function public.validar_costo_fides_real() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.costo_fides_real is distinct from old.costo_fides_real or new.costo_fides_nota is distinct from old.costo_fides_nota then
    if public.jwt_rol() <> 'admin' or public.suscripcion_vigente() is not true then raise exception 'Solo administración puede corregir el costo real de Fides'; end if;
    if new.costo_fides_real is null or length(btrim(coalesce(new.costo_fides_nota,'')))=0 then raise exception 'Indica el costo real y el motivo'; end if;
    new.costo_fides_actualizado_en := now();
  end if;
  return new;
end;
$$;
create trigger validar_costo_fides_real before update on public.operativos for each row execute function public.validar_costo_fides_real();
revoke all on function public.validar_costo_fides_real() from public,anon;
alter table public.gastos_globales drop constraint gastos_globales_caja_check;
alter table public.gastos_globales add constraint gastos_globales_caja_check
  check (caja in ('efectivo','digital','personal'));

create table public.caja_movimientos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  fecha date not null,
  tipo text not null check (tipo in ('deposito','retiro','devolucion')),
  monto bigint not null check (monto > 0),
  caja text not null check (caja in ('efectivo','digital')),
  gasto_id uuid references public.gastos_globales(id),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 250),
  created_at timestamptz not null default now(),
  check ((tipo = 'devolucion') = (gasto_id is not null))
);
create index on public.caja_movimientos(tenant_id,fecha);
create index on public.caja_movimientos(gasto_id) where gasto_id is not null;
alter table public.caja_movimientos enable row level security;
create policy caja_movimientos_leer on public.caja_movimientos for select to authenticated
using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin');
create policy caja_movimientos_crear on public.caja_movimientos for insert to authenticated
with check (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin' and (select public.suscripcion_vigente()));
revoke all on public.caja_movimientos from anon, authenticated;
grant select, insert on public.caja_movimientos to authenticated;

-- Serializa reintegros del mismo gasto; un doble envío no permite devolver de más.
create function public.validar_devolucion_caja() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare g public.gastos_globales; devuelto bigint;
begin
  if exists (select 1 from public.caja_movimientos where id=new.id and tenant_id=new.tenant_id) then return null; end if;
  if new.tipo = 'devolucion' then
    select * into g from public.gastos_globales where id = new.gasto_id and tenant_id = new.tenant_id for update;
    if not found or g.caja <> 'personal' then raise exception 'Gasto personal no disponible'; end if;
    select coalesce(sum(monto),0) into devuelto from public.caja_movimientos where gasto_id = g.id and tenant_id = new.tenant_id;
    if new.fecha < g.fecha or new.monto + devuelto > g.monto then raise exception 'Revisa la fecha y el saldo pendiente del gasto personal'; end if;
  end if;
  return new;
end;
$$;
create trigger validar_devolucion_caja before insert on public.caja_movimientos for each row execute function public.validar_devolucion_caja();

create function public.proteger_gasto_devuelto() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.caja_movimientos where gasto_id = old.id and tenant_id = old.tenant_id)
    and (new.monto is distinct from old.monto or new.caja is distinct from old.caja or new.tenant_id is distinct from old.tenant_id or new.fecha is distinct from old.fecha)
  then raise exception 'Este gasto ya tiene devoluciones registradas'; end if;
  return new;
end;
$$;
create trigger proteger_gasto_devuelto before update on public.gastos_globales for each row execute function public.proteger_gasto_devuelto();

create or replace function public.caja_global()
returns table(entro_efectivo bigint, entro_digital bigint, entro_debito bigint, entro_credito bigint, salio_efectivo bigint, salio_digital bigint, gastos_operativo bigint)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and not v.anulada and (pa.medio_pago='efectivo' or pa.medio_pago is null)),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and not v.anulada and pa.medio_pago is not null and pa.medio_pago<>'efectivo'),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and not v.anulada and pa.medio_pago='debito'),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and not v.anulada and pa.medio_pago='credito'),0)::bigint,
    (coalesce((select sum(monto) from public.retiros_sueldo where tenant_id=(select public.jwt_tenant_id()) and caja='efectivo'),0) + coalesce((select sum(monto) from public.gastos_globales where tenant_id=(select public.jwt_tenant_id()) and caja='efectivo'),0)
      + coalesce((select sum(case when tipo='deposito' then monto when tipo='retiro' then -monto when caja='efectivo' then monto else 0 end) from public.caja_movimientos where tenant_id=(select public.jwt_tenant_id())),0))::bigint,
    (coalesce((select sum(monto) from public.retiros_sueldo where tenant_id=(select public.jwt_tenant_id()) and caja='digital'),0) + coalesce((select sum(monto) from public.gastos_globales where tenant_id=(select public.jwt_tenant_id()) and caja='digital'),0)
      + coalesce((select sum(case when tipo='deposito' then -monto when tipo='retiro' then monto when caja='digital' then monto else 0 end) from public.caja_movimientos where tenant_id=(select public.jwt_tenant_id())),0))::bigint,
    coalesce((select sum(costo_transporte+costo_arriendo+costo_viaticos+costo_otros+costo_ayudante+costo_equipos) from public.operativos where tenant_id=(select public.jwt_tenant_id()) and coalesce(fecha_fin,fecha)<=(now() at time zone 'America/Santiago')::date),0)::bigint;
$$;

create table public.caja_conteos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  contado bigint not null check(contado>=0),
  esperado bigint not null,
  nota text not null default '' check(length(nota)<=250),
  created_at timestamptz not null default now()
);
create index on public.caja_conteos(tenant_id,created_at desc);
alter table public.caja_conteos enable row level security;
create policy caja_conteos_leer on public.caja_conteos for select to authenticated
using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy caja_conteos_crear on public.caja_conteos for insert to authenticated
with check (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
-- El saldo esperado y la hora siempre salen del servidor, incluso por la API directa.
create function public.preparar_conteo_caja() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select entro_efectivo-salio_efectivo into new.esperado from public.caja_global();
  new.created_at := now();
  return new;
end;
$$;
create trigger preparar_conteo_caja before insert on public.caja_conteos for each row execute function public.preparar_conteo_caja();
revoke all on public.caja_conteos from anon,authenticated;
grant select,insert on public.caja_conteos to authenticated;
create function public.registrar_conteo_caja(p_id uuid,p_contado bigint,p_nota text) returns void
language plpgsql security invoker set search_path = '' as $$
declare esperado bigint;
begin
  if public.jwt_rol() <> 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  select entro_efectivo-salio_efectivo into esperado from public.caja_global();
  insert into public.caja_conteos(id,tenant_id,contado,esperado,nota)
    values(p_id,public.jwt_tenant_id(),p_contado,esperado,p_nota) on conflict(id) do nothing;
end;
$$;
revoke all on function public.registrar_conteo_caja(uuid,bigint,text) from public,anon;
grant execute on function public.registrar_conteo_caja(uuid,bigint,text) to authenticated;
revoke all on function public.validar_devolucion_caja(), public.proteger_gasto_devuelto() from public,anon;
revoke all on function public.preparar_conteo_caja() from public,anon;
-- Los gastos personales y sus devoluciones quedan reservados al administrador.
create policy gastos_personales_admin on public.gastos_globales as restrictive for all to authenticated
using (caja <> 'personal' or (select public.jwt_rol())='admin')
with check (caja <> 'personal' or (select public.jwt_rol())='admin');
