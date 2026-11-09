-- Mover entre tablas y eliminar registros vacíos en una sola transacción.
-- Conserva RLS y valida al administrador activo; no utiliza service_role.
create function public.agenda_reclasificar(p jsonb)
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
      or length(p->>'direccion')>250 or length(p->>'notas')>2000 then
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
    insert into public.agenda_bloques(id,tenant_id,tipo,nombre,optica,direccion,notas,fecha,fecha_fin,estado)
      values(oid,t,'externo',btrim(p->>'nombre'),btrim(p->>'optica'),nullif(p->>'direccion',''),nullif(p->>'notas',''),
        desde,case when hasta=desde then null else hasta end,estado_nuevo);
  elsif destino='propio' then
    insert into public.operativos(id,tenant_id,nombre,direccion,notas,fecha,fecha_fin,hora_inicio,hora_fin,estado,agenda_confirmado)
      values(oid,t,btrim(p->>'nombre'),nullif(p->>'direccion',''),nullif(p->>'notas',''),desde,
        case when hasta=desde then null else hasta end,inicio,fin,
        case when estado_nuevo='cancelado' then 'cancelado' else 'planificado' end,estado_nuevo='confirmado');
  end if;
  return oid;
end;
$$;
revoke all on function public.agenda_reclasificar(jsonb) from public, anon, service_role;
grant execute on function public.agenda_reclasificar(jsonb) to authenticated;
