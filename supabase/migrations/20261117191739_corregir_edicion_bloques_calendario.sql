-- Evita ambigüedad entre la columna y el tipo elegido.
create or replace function agenda_interna.guardar(p jsonb,p_edicion boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  t uuid := agenda_interna.exigir_editor();
  oid uuid := (p->>'id')::uuid;
  tipo_nuevo text := p->>'tipo';
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
  if p_edicion is null or oid is null or tipo_nuevo is null or tipo_nuevo not in ('propio','externo','disponible')
    or desde is null or hasta<desde or hasta-desde>365 or estado_nuevo is null
    or estado_nuevo not in ('pendiente','confirmado','cancelado')
    or (tipo_nuevo<>'disponible' and nombre_nuevo is null)
    or (tipo_nuevo='externo' and optica_nueva is null)
    or length(nombre_nuevo)>160 or length(optica_nueva)>160 or length(direccion_nueva)>250
    or length(comuna_nueva)>80 or length(region_nueva)>100 or length(notas_nuevas)>2000 then
    raise exception 'Revisa el nombre, ubicación, fechas y estado.' using errcode='22023';
  end if;
  if tipo_nuevo='propio' then
    inicio:=nullif(p->>'hora_inicio','')::time;
    fin:=nullif(p->>'hora_fin','')::time;
    if (inicio is null)<>(fin is null) or inicio>=fin then
      raise exception 'Revisa el horario o deja ambas horas vacías.' using errcode='22023';
    end if;
  end if;
  if tipo_nuevo='disponible' then estado_nuevo:='confirmado'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
  if tipo_nuevo='propio' then
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
        where b.id=oid and b.tenant_id=t and b.tipo=tipo_nuevo returning b.id into resultado;
    else
      insert into public.agenda_bloques(id,tenant_id,tipo,nombre,optica,direccion,comuna,region,notas,fecha,fecha_fin,estado)
        values(oid,t,tipo_nuevo,nombre_nuevo,optica_nueva,direccion_nueva,comuna_nueva,region_nueva,notas_nuevas,desde,nullif(hasta,desde),estado_nuevo) returning id into resultado;
    end if;
  end if;
  if resultado is null then raise exception 'El registro cambió o no pertenece a tu óptica. Recarga el calendario.' using errcode='42501'; end if;
  return resultado;
end;
$$;
