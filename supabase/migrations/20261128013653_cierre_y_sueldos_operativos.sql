-- El cierre de cobros y sueldos es independiente de los costos saldados.
alter table public.operativos add column cierre_financiero_en timestamptz;

create function cobranza_interna.proteger_cierre_financiero() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user='authenticated' and new.cierre_financiero_en is distinct from old.cierre_financiero_en then
    raise exception 'Usa el cierre de cobros y sueldos' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function cobranza_interna.proteger_cierre_financiero() from public,anon,authenticated;
create trigger proteger_cierre_financiero before update of cierre_financiero_en on public.operativos
  for each row execute function cobranza_interna.proteger_cierre_financiero();


create or replace function public.registrar_pago_reparto(
  p_tenant uuid,p_usuario uuid,p_id uuid,p_operativo uuid,p_chequeo uuid,
  p_version text,p_persona text,p_monto bigint,p_caja text
)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_version text;
  anterior public.retiros_sueldo;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if not exists (select 1 from public.users u where u.id=p_usuario and u.tenant_id=p_tenant
    and u.rol='admin' and u.estado='activo') then
    raise exception 'Pago sin autorización de la óptica' using errcode='42501';
  end if;
  if p_id is null or p_persona is null or p_persona not in ('isadora','madre','pablo')
    or p_caja is null or p_caja not in ('efectivo','digital') or p_monto is null or p_monto<=0
    or (p_operativo is null)=(p_chequeo is null) then
    raise exception 'Revisa la persona, caja, monto y operativo' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||p_tenant::text,0));
  select * into anterior from public.retiros_sueldo where id=p_id;
  if found then
    if anterior.tenant_id=p_tenant and anterior.reparto_verificado and anterior.persona=p_persona
      and anterior.monto=p_monto and anterior.caja=p_caja and anterior.operativo_id is not distinct from p_operativo
      and anterior.chequeo_id is not distinct from p_chequeo then return; end if;
    raise exception 'El identificador del pago ya se usó' using errcode='23505';
  end if;
  select version::text into v_version from cobranza_interna.version_caja where tenant_id=p_tenant;
  if coalesce(v_version,'0') is distinct from p_version then
    raise exception 'La caja cambió. Actualiza el reparto antes de registrar otro pago.' using errcode='40001';
  end if;
  if (p_operativo is not null and not exists (select 1 from public.operativos o
      where o.id=p_operativo and o.tenant_id=p_tenant and o.estado<>'cancelado'))
    or (p_chequeo is not null and not exists (select 1 from public.chequeos c where c.id=p_chequeo and c.tenant_id=p_tenant)) then
    raise exception 'Comprueba el operativo o chequeo del pago' using errcode='42501';
  end if;
  insert into public.retiros_sueldo
    (id,tenant_id,persona,fecha,monto,medio_pago,caja,es_sueldo,motivo,operativo_id,chequeo_id,reparto_verificado,confirmado_en,confirmado_por)
  values (p_id,p_tenant,p_persona,hoy,p_monto,case when p_caja='digital' then 'transferencia' else 'efectivo' end,
    p_caja,true,'Pago de reparto desde Caja',p_operativo,p_chequeo,true,clock_timestamp(),p_usuario);
end;
$$;

create function public.finalizar_sueldos_operativo(p_tenant uuid,p_usuario uuid,p_operativo uuid,p_version text)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_version text;
begin
  if not exists (select 1 from public.users u where u.id=p_usuario and u.tenant_id=p_tenant
    and u.rol='admin' and u.estado='activo') then
    raise exception 'Cierre sin autorización de la óptica' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||p_tenant::text,0));
  select version::text into v_version from cobranza_interna.version_caja where tenant_id=p_tenant;
  if coalesce(v_version,'0') is distinct from p_version then
    raise exception 'La caja cambió. Recarga antes de finalizar.' using errcode='40001';
  end if;
  -- La acción calcula los sueldos sobre esta misma versión. La base también
  -- comprueba que ningún abono pendiente impida finalizar el operativo.
  if exists (
    select 1 from public.ventas v
    where v.tenant_id=p_tenant and v.operativo_id=p_operativo and not v.anulada
      and v.total > coalesce((select sum(a.monto) from public.pagos_abonos a
          where a.tenant_id=p_tenant and a.venta_id=v.id and a.fecha<=now()),0)
  ) then raise exception 'Todavía hay ventas por cobrar en este operativo' using errcode='23514'; end if;
  update public.operativos set cierre_financiero_en=clock_timestamp(),estado='realizado'
    where id=p_operativo and tenant_id=p_tenant and estado<>'cancelado';
  if not found then raise exception 'Operativo no disponible' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.finalizar_sueldos_operativo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalizar_sueldos_operativo(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
