-- Ubicaciones separadas; los registros existentes mantienen su dirección.
alter table public.operativos add column comuna text check (length(comuna)<=80), add column region text check (length(region)<=100);
alter table public.agenda_bloques add column comuna text check (length(comuna)<=80), add column region text check (length(region)<=100);

-- Lectura compartida solo dentro de la misma óptica y con un rol vigente.
alter policy agenda_bloques_lectura on public.agenda_bloques using (
  tenant_id=(select public.jwt_tenant_id())
  and (select public.jwt_rol()) in ('admin','ventas')
  and (select public.suscripcion_vigente())
);

-- API de coordinación con campos explícitos: no concede permisos nuevos
-- de escritura directa sobre costos, comisiones, metas ni caja.
create function agenda_interna.exigir_editor()
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
  select u.tenant_id into t from public.users u
    where u.id=auth.uid() and u.estado='activo' and u.rol in ('admin','ventas');
  if t is null or t is distinct from public.jwt_tenant_id() or not coalesce(public.suscripcion_vigente(),false) then
    raise exception 'No tienes permiso para editar este calendario.' using errcode='42501';
  end if;
  return t;
end;
$$;
revoke all on function agenda_interna.exigir_editor() from public,anon,authenticated,service_role;

create function agenda_interna.guardar(p jsonb,p_edicion boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  t uuid := agenda_interna.exigir_editor();
  oid uuid := (p->>'id')::uuid;
  tipo text := p->>'tipo';
  desde date := (p->>'fecha')::date;
  hasta date := coalesce(nullif(p->>'fecha_fin','')::date,desde);
  inicio time;
  fin time;
  estado_nuevo text := p->>'estado';
  nombre_nuevo text := nullif(btrim(p->>'nombre'),'');
  optica_nueva text := nullif(btrim(p->>'optica'),'');
  direccion_nueva text := nullif(btrim(p->>'direccion'),'');
  comuna_nueva text := nullif(btrim(p->>'comuna'),'');
  region_nueva text := nullif(btrim(p->>'region'),'');
  notas_nuevas text := nullif(btrim(p->>'notas'),'');
  resultado uuid;
begin
  if p_edicion is null or oid is null or tipo is null or tipo not in ('propio','externo','disponible')
    or desde is null or hasta<desde or hasta-desde>365 or estado_nuevo is null
    or estado_nuevo not in ('pendiente','confirmado','cancelado')
    or (tipo<>'disponible' and nombre_nuevo is null)
    or (tipo='externo' and optica_nueva is null)
    or length(nombre_nuevo)>160 or length(optica_nueva)>160 or length(direccion_nueva)>250
    or length(comuna_nueva)>80 or length(region_nueva)>100 or length(notas_nuevas)>2000 then
    raise exception 'Revisa el nombre, ubicación, fechas y estado.' using errcode='22023';
  end if;
  if tipo='propio' then
    inicio:=nullif(p->>'hora_inicio','')::time;
    fin:=nullif(p->>'hora_fin','')::time;
    if (inicio is null)<>(fin is null) or inicio>=fin then
      raise exception 'Revisa el horario o deja ambas horas vacías.' using errcode='22023';
    end if;
  end if;
  if tipo='disponible' then estado_nuevo:='confirmado'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
  if tipo='propio' then
    if p_edicion then
      update public.operativos set nombre=nombre_nuevo,fecha=desde,fecha_fin=nullif(hasta,desde),
        hora_inicio=inicio,hora_fin=fin,direccion=direccion_nueva,comuna=comuna_nueva,region=region_nueva,notas=notas_nuevas,
        estado=case when estado_nuevo='cancelado' then 'cancelado' else 'planificado' end,agenda_confirmado=estado_nuevo='confirmado'
        where id=oid and tenant_id=t and estado in ('planificado','cancelado') returning id into resultado;
    else
      insert into public.operativos(id,tenant_id,nombre,fecha,fecha_fin,hora_inicio,hora_fin,direccion,comuna,region,notas,estado,agenda_confirmado)
        values(oid,t,nombre_nuevo,desde,nullif(hasta,desde),inicio,fin,direccion_nueva,comuna_nueva,region_nueva,notas_nuevas,
          case when estado_nuevo='cancelado' then 'cancelado' else 'planificado' end,estado_nuevo='confirmado') returning id into resultado;
    end if;
  else
    if p_edicion then
      update public.agenda_bloques as b set nombre=nombre_nuevo,optica=optica_nueva,direccion=direccion_nueva,comuna=comuna_nueva,region=region_nueva,
        notas=notas_nuevas,fecha=desde,fecha_fin=nullif(hasta,desde),estado=estado_nuevo
        where b.id=oid and b.tenant_id=t and b.tipo=guardar.tipo returning b.id into resultado;
    else
      insert into public.agenda_bloques(id,tenant_id,tipo,nombre,optica,direccion,comuna,region,notas,fecha,fecha_fin,estado)
        values(oid,t,tipo,nombre_nuevo,optica_nueva,direccion_nueva,comuna_nueva,region_nueva,notas_nuevas,desde,nullif(hasta,desde),estado_nuevo) returning id into resultado;
    end if;
  end if;
  if resultado is null then raise exception 'El registro cambió o no pertenece a tu óptica. Recarga el calendario.' using errcode='42501'; end if;
  return resultado;
end;
$$;
revoke all on function agenda_interna.guardar(jsonb,boolean) from public,anon,authenticated,service_role;

create function public.agenda_guardar(p jsonb,p_edicion boolean)
returns uuid language sql security invoker set search_path='' as $$ select agenda_interna.guardar(p,p_edicion); $$;
revoke all on function public.agenda_guardar(jsonb,boolean) from public,anon,service_role;
grant usage on schema agenda_interna to authenticated;
grant execute on function agenda_interna.guardar(jsonb,boolean) to authenticated;
grant execute on function public.agenda_guardar(jsonb,boolean) to authenticated;

create function agenda_interna.borrar_disponibilidad(p_id uuid,p_fecha date)
returns boolean language plpgsql security definer set search_path='' as $$
declare t uuid:=agenda_interna.exigir_editor();
begin
  delete from public.agenda_bloques where id=p_id and tenant_id=t and tipo='disponible' and fecha=p_fecha;
  if not found then raise exception 'El bloque cambió. Recarga el calendario.' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function agenda_interna.borrar_disponibilidad(uuid,date) from public,anon,authenticated,service_role;
create function public.agenda_disponibilidad_borrar(p_id uuid,p_fecha date)
returns boolean language sql security invoker set search_path='' as $$ select agenda_interna.borrar_disponibilidad(p_id,p_fecha); $$;
revoke all on function public.agenda_disponibilidad_borrar(uuid,date) from public,anon,service_role;
grant execute on function agenda_interna.borrar_disponibilidad(uuid,date) to authenticated;
grant execute on function public.agenda_disponibilidad_borrar(uuid,date) to authenticated;

-- La reclasificación sigue reservada al administrador y conserva ubicación.
-- Mover entre tablas y eliminar registros vacíos en una sola transacción.
-- Conserva RLS y valida al administrador activo; no utiliza service_role.
create or replace function public.agenda_reclasificar(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t uuid;
  oid uuid := (p->>'id')::uuid;
  origen text := p->>'origen';
  destino text := p->>'destino';
  o public.operativos%rowtype;
  b public.agenda_bloques%rowtype;
  desde date;
  hasta date;
  inicio time;
  fin time;
  estado_nuevo text;
begin
  select u.tenant_id into t from public.users u
    where u.id=auth.uid() and u.rol='admin' and u.estado='activo';
  if t is null or t is distinct from public.jwt_tenant_id() or not coalesce(public.suscripcion_vigente(),false) then
    raise exception 'No tienes permiso para corregir este operativo.' using errcode='42501';
  end if;
  if oid is null or origen is null or destino is null or origen not in ('propio','externo')
    or destino not in ('propio','externo','eliminar') or origen=destino then
    raise exception 'Revisa el tipo del operativo.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
  if origen='propio' then
    select * into o from public.operativos where id=oid and tenant_id=t for update;
    if not found then raise exception 'El registro cambió. Recarga el calendario.'; end if;
    if o.estado='realizado' then raise exception 'Un operativo realizado conserva su historial. Edita sus datos desde su ficha.'; end if;
    -- FOR UPDATE impide que se agreguen referencias mientras se valida y se mueve.
    if exists(select 1 from public.ventas where operativo_id=oid)
      or exists(select 1 from public.recetas where operativo_id=oid)
      or exists(select 1 from public.ordenes_trabajo where operativo_id=oid)
      or exists(select 1 from public.retiros_sueldo where operativo_id=oid)
      or exists(select 1 from public.gastos_globales where operativo_id=oid)
      or exists(select 1 from public.contactos_operativo where operativo_id=oid)
      or exists(select 1 from public.agenda_turnos where operativo_id=oid)
      or o.costo_transporte<>0 or o.costo_arriendo<>0 or o.costo_viaticos<>0 or o.costo_otros<>0
      or o.costo_ayudante<>0 or o.costo_equipos<>0 or coalesce(o.costo_fides_real,0)<>0
      or o.fecha_entrega_estimada is not null or nullif(o.contacto_nombre,'') is not null
      or nullif(o.contacto_telefono,'') is not null then
      raise exception 'Este operativo tiene datos vinculados o gastos. Conserva su ficha; no se puede cambiar de óptica ni eliminar.';
    end if;
  else
    select * into b from public.agenda_bloques where id=oid and tenant_id=t and tipo='externo' for update;
    if not found then raise exception 'El registro cambió. Recarga el calendario.'; end if;
  end if;
  if destino<>'eliminar' then
    desde := (p->>'fecha')::date;
    hasta := coalesce(nullif(p->>'fecha_fin','')::date,desde);
    estado_nuevo := p->>'estado';
    if desde is null or hasta<desde or hasta-desde>365
      or estado_nuevo is null or estado_nuevo not in ('pendiente','confirmado','cancelado')
      or nullif(btrim(p->>'nombre'),'') is null or length(p->>'nombre')>160
      or length(p->>'direccion')>250 or length(p->>'notas')>2000 or length(p->>'comuna')>80 or length(p->>'region')>100 then
      raise exception 'Revisa el nombre, las fechas y el estado.' using errcode='22023';
    end if;
    if destino='externo' and (nullif(btrim(p->>'optica'),'') is null or length(p->>'optica')>160) then
      raise exception 'Indica el nombre de la otra óptica.' using errcode='22023';
    end if;
    if destino='propio' then
      inicio := nullif(p->>'hora_inicio','')::time;
      fin := nullif(p->>'hora_fin','')::time;
      if (inicio is null)<>(fin is null) or inicio>=fin then
        raise exception 'Revisa el horario o deja ambas horas vacías.' using errcode='22023';
      end if;
    end if;
  end if;
  -- Cualquier error del INSERT (incluido un cruce) revierte también este DELETE.
  if origen='propio' then
    delete from public.operativos where id=oid and tenant_id=t;
  else
    delete from public.agenda_bloques where id=oid and tenant_id=t and tipo='externo';
  end if;
  if not found then raise exception 'No se pudo corregir el registro.'; end if;
  if destino='externo' then
    insert into public.agenda_bloques(id,tenant_id,tipo,nombre,optica,direccion,comuna,region,notas,fecha,fecha_fin,estado)
      values(oid,t,'externo',btrim(p->>'nombre'),btrim(p->>'optica'),nullif(p->>'direccion',''),coalesce(nullif(p->>'comuna',''),o.comuna,b.comuna),coalesce(nullif(p->>'region',''),o.region,b.region),nullif(p->>'notas',''),
        desde,case when hasta=desde then null else hasta end,estado_nuevo);
  elsif destino='propio' then
    insert into public.operativos(id,tenant_id,nombre,direccion,comuna,region,notas,fecha,fecha_fin,hora_inicio,hora_fin,estado,agenda_confirmado)
      values(oid,t,btrim(p->>'nombre'),nullif(p->>'direccion',''),coalesce(nullif(p->>'comuna',''),o.comuna,b.comuna),coalesce(nullif(p->>'region',''),o.region,b.region),nullif(p->>'notas',''),desde,
        case when hasta=desde then null else hasta end,inicio,fin,
        case when estado_nuevo='cancelado' then 'cancelado' else 'planificado' end,estado_nuevo='confirmado');
  end if;
  return oid;
end;
$$;
revoke all on function public.agenda_reclasificar(jsonb) from public, anon, service_role;
grant execute on function public.agenda_reclasificar(jsonb) to authenticated;
