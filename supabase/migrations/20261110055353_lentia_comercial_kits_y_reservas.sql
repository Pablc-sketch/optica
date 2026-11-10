alter table public.tenants alter column agenda_paralela set default true;
alter table public.operativos add column costo_hospedaje bigint not null default 0 check(costo_hospedaje>=0);
create table public.equipos_fisicos(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id),
 nombre text not null check(length(btrim(nombre)) between 1 and 100),tipo text not null check(tipo in('autorefractometro','lensometro','maleta','otro')),
 identificador text not null check(length(btrim(identificador)) between 1 and 100),estado text not null default 'disponible' check(estado in('disponible','mantenimiento','inactivo')),
 unique(tenant_id,id),unique(tenant_id,identificador));
create table public.kit_componentes(tenant_id uuid not null default public.jwt_tenant_id(),kit_id uuid not null,equipo_id uuid not null,
 primary key(kit_id,equipo_id),unique(tenant_id,equipo_id),foreign key(tenant_id,kit_id) references public.agenda_recursos(tenant_id,id),foreign key(tenant_id,equipo_id) references public.equipos_fisicos(tenant_id,id));
create table public.agenda_equipos_reservas(tenant_id uuid not null,operativo_id uuid not null,equipo_id uuid not null,tramo tsrange not null,activo boolean not null,
 primary key(operativo_id,equipo_id),foreign key(tenant_id,operativo_id) references public.operativos(tenant_id,id) on delete cascade,
 foreign key(tenant_id,equipo_id) references public.equipos_fisicos(tenant_id,id),exclude using gist(equipo_id with =,tramo with &&) where(activo));
create index agenda_equipos_tenant on public.agenda_equipos_reservas(tenant_id);
create index kit_componentes_tenant on public.kit_componentes(tenant_id,kit_id);
alter table public.equipos_fisicos enable row level security;alter table public.kit_componentes enable row level security;alter table public.agenda_equipos_reservas enable row level security;
revoke all on public.equipos_fisicos,public.kit_componentes,public.agenda_equipos_reservas from public,anon,authenticated;
grant select,insert,update on public.equipos_fisicos to authenticated;grant select,insert,delete on public.kit_componentes to authenticated;grant select on public.agenda_equipos_reservas to authenticated;
grant all on public.equipos_fisicos,public.kit_componentes,public.agenda_equipos_reservas to service_role;
create policy equipos_leer on public.equipos_fisicos for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy equipos_alta on public.equipos_fisicos for insert to authenticated with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy equipos_editar on public.equipos_fisicos for update to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente())) with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy componentes_leer on public.kit_componentes for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy componentes_alta on public.kit_componentes for insert to authenticated with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy componentes_baja on public.kit_componentes for delete to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy equipos_reservados_leer on public.agenda_equipos_reservas for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');

create or replace function agenda_privada.tramo(p_fecha date,p_fin date,p_inicio time,p_termino time) returns tsrange language plpgsql immutable set search_path='' as $$begin
 if p_fecha is null or coalesce(p_fin,p_fecha)<p_fecha or coalesce(p_fin,p_fecha)-p_fecha>365 or (p_inicio is null)<>(p_termino is null) then raise exception 'Revisa las fechas y completa ambas horas o déjalas vacías.' using errcode='23514';end if;
 if p_inicio is null then return tsrange(p_fecha::timestamp,(coalesce(p_fin,p_fecha)+1)::timestamp,'[)');end if;
 if p_fecha+p_inicio>=coalesce(p_fin,p_fecha)+p_termino then raise exception 'El término debe ser posterior al inicio.' using errcode='23514';end if;
 return tsrange(p_fecha+p_inicio,coalesce(p_fin,p_fecha)+p_termino,'[)');end $$;
create function agenda_privada.proteger_componente() returns trigger language plpgsql security definer set search_path='' as $$declare t uuid;k uuid;begin
 if tg_op='DELETE' then t:=old.tenant_id;k:=old.kit_id;else t:=new.tenant_id;k:=new.kit_id;end if;
 if auth.uid() is not null and(t is distinct from public.jwt_tenant_id() or public.jwt_rol()<>'admin') then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
 if exists(select 1 from public.agenda_turnos where tenant_id=t and kit_id=k and activo and upper(tramo)>(now() at time zone 'America/Santiago')) then raise exception 'El kit tiene reservas vigentes. Reasigna o cancela esos operativos antes de cambiar sus componentes.' using errcode='23514';end if;
 if tg_op='INSERT' and(not exists(select 1 from public.agenda_recursos where tenant_id=t and id=k and tipo='kit' and activo) or not exists(select 1 from public.equipos_fisicos where tenant_id=t and id=new.equipo_id and estado='disponible')) then raise exception 'Selecciona un kit y equipos disponibles de esta óptica.' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;end $$;
create trigger proteger_componente before insert or delete on public.kit_componentes for each row execute function agenda_privada.proteger_componente();
create function agenda_privada.proteger_disponibilidad() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and new.tenant_id is distinct from public.jwt_tenant_id() then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||new.tenant_id::text,0));
 if new.tipo is distinct from old.tipo and exists(select 1 from public.kit_componentes where tenant_id=new.tenant_id and equipo_id=new.id) then raise exception 'Retira primero el equipo de su kit antes de cambiar su tipo.' using errcode='23514';end if;
 if new.estado<>'disponible' and exists(select 1 from public.agenda_equipos_reservas where tenant_id=new.tenant_id and equipo_id=new.id and activo and upper(tramo)>(now() at time zone 'America/Santiago')) then raise exception 'Este equipo tiene operativos reservados. Reasígnalos antes de retirarlo.' using errcode='23514';end if;
 return new;end $$;
create trigger proteger_disponibilidad before update on public.equipos_fisicos for each row execute function agenda_privada.proteger_disponibilidad();
create function agenda_privada.reservar_componentes() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then delete from public.agenda_equipos_reservas where operativo_id=old.operativo_id and tenant_id=old.tenant_id;return old;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||new.tenant_id::text,0));
 if tg_op='INSERT' then insert into public.agenda_equipos_reservas(tenant_id,operativo_id,equipo_id,tramo,activo) select new.tenant_id,new.operativo_id,equipo_id,new.tramo,new.activo from public.kit_componentes where tenant_id=new.tenant_id and kit_id=new.kit_id;
 else
 if new.activo and exists(select 1 from public.agenda_equipos_reservas r join public.equipos_fisicos e on e.id=r.equipo_id and e.tenant_id=r.tenant_id where r.operativo_id=new.operativo_id and e.estado<>'disponible') then raise exception 'El kit contiene un equipo fuera de servicio.' using errcode='23514';end if;
 update public.agenda_equipos_reservas set tramo=new.tramo,activo=new.activo where operativo_id=new.operativo_id and tenant_id=new.tenant_id;
 end if;return new;end $$;
create trigger reservar_componentes after insert or update or delete on public.agenda_turnos for each row execute function agenda_privada.reservar_componentes();
create function public.agenda_kit_guardar(p_id uuid,p_nombre text,p_equipos uuid[]) returns uuid language plpgsql security invoker set search_path='' as $$declare t uuid:=public.jwt_tenant_id();k uuid;n integer;begin
 if t is null or public.jwt_rol()<>'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso.' using errcode='42501';end if;
 if nullif(btrim(p_nombre),'') is null or length(p_nombre)>100 or coalesce(cardinality(p_equipos),0)<3 or cardinality(p_equipos)>30 then raise exception 'Indica un nombre y al menos autorefractómetro, lensómetro y maleta.' using errcode='23514';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
 select count(distinct tipo) into n from public.equipos_fisicos where tenant_id=t and id=any(p_equipos) and estado='disponible' and tipo in('autorefractometro','lensometro','maleta');
 if n<>3 or(select count(*) from public.equipos_fisicos where tenant_id=t and id=any(p_equipos) and estado='disponible')<>cardinality(p_equipos) then raise exception 'Revisa los componentes: deben estar disponibles e incluir los tres equipos básicos.' using errcode='23514';end if;
 if p_id is null then insert into public.agenda_recursos(tipo,nombre,detalle) values('kit',btrim(p_nombre),'') returning id into k;
 else update public.agenda_recursos set nombre=btrim(p_nombre) where id=p_id and tenant_id=t and tipo='kit' returning id into k;if k is null then raise exception 'Kit no disponible.' using errcode='42501';end if;end if;
 if(select array_agg(equipo_id order by equipo_id) from public.kit_componentes where kit_id=k and tenant_id=t) is distinct from(select array_agg(x order by x) from unnest(p_equipos) x) then
 delete from public.kit_componentes where kit_id=k and tenant_id=t;insert into public.kit_componentes(tenant_id,kit_id,equipo_id) select t,k,x from unnest(p_equipos) x;end if;return k;end $$;
revoke all on function public.agenda_kit_guardar(uuid,text,uuid[]) from public,anon,service_role;grant execute on function public.agenda_kit_guardar(uuid,text,uuid[]) to authenticated;
create function agenda_privada.proteger_recurso_activo() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and new.tenant_id is distinct from public.jwt_tenant_id() then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||new.tenant_id::text,0));
 if not new.activo and exists(select 1 from public.agenda_turnos a where a.tenant_id=new.tenant_id and new.id in(a.tecnologo_id,a.vendedora_id,a.coordinador_id,a.kit_id) and a.activo and upper(a.tramo)>(now() at time zone 'America/Santiago')) then raise exception 'Este recurso tiene operativos reservados. Reasígnalos antes de desactivarlo.' using errcode='23514';end if;return new;end $$;
create trigger proteger_recurso_activo before update of activo on public.agenda_recursos for each row execute function agenda_privada.proteger_recurso_activo();
revoke all on all functions in schema agenda_privada from public,anon,authenticated;

create or replace function public.agenda_guardar_turno(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  t uuid := public.jwt_tenant_id();
  oid uuid := (p->>'id')::uuid;
  f date := (p->>'fecha')::date;
  ff date := (p->>'fecha_fin')::date;
  hi time := nullif(p->>'inicio','')::time;
  hf time := nullif(p->>'fin','')::time;
  ventana tsrange;
  nombre text := btrim(p->>'nombre');
  dir text := btrim(p->>'direccion');
  meta integer := (p->>'meta')::integer;
  ids uuid[] := array[(p->>'vendedora')::uuid,(p->>'tecnologo')::uuid,(p->>'coordinador')::uuid,(p->>'kit')::uuid];
  tipos text[] := array['vendedora','tecnologo','coordinador','kit'];
  gastos jsonb := p->'presupuesto';
  op public.operativos%rowtype;
  i integer;
  choque record;
begin
  if auth.uid() is null or t is null or public.jwt_rol()<>'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Solo un administrador activo puede organizar equipos' using errcode='42501';
  end if;
  if oid is null or nombre is null or length(nombre) not between 1 and 120 or dir is null
      or length(dir) not between 1 and 220 or meta is null or meta not between 0 and 10000 then
    raise exception 'Revisa nombre, lugar y cantidad de chequeos' using errcode='23514';
  end if;
  ventana := agenda_privada.tramo(f,ff,hi,hf);
  if jsonb_typeof(gastos) is distinct from 'object' or exists (
    select 1 from jsonb_each_text(gastos) g where g.key not in ('bencina','viaticos','hospedaje','arriendo','personal','otros')
      or g.value is null or g.value !~ '^[0-9]{1,9}$'
  ) then raise exception 'Revisa los montos del presupuesto' using errcode='23514'; end if;
  for i in 1..4 loop
    if not exists(select 1 from public.agenda_recursos r where r.tenant_id=t and r.id=ids[i] and r.tipo=tipos[i] and r.activo) then
      raise exception 'Selecciona personal y kit de esta óptica' using errcode='23514';
    end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.'||t::text,0));
  if exists(select 1 from public.tenants where id=t and modelo_operacion='comercial') then
   if(select count(distinct e.tipo) from public.kit_componentes k join public.equipos_fisicos e on e.id=k.equipo_id and e.tenant_id=k.tenant_id where k.tenant_id=t and k.kit_id=ids[4] and e.estado='disponible' and e.tipo in('autorefractometro','lensometro','maleta'))<>3
    or exists(select 1 from public.kit_componentes k join public.equipos_fisicos e on e.id=k.equipo_id and e.tenant_id=k.tenant_id where k.tenant_id=t and k.kit_id=ids[4] and e.estado<>'disponible') then raise exception 'El kit debe incluir autorefractómetro, lensómetro y maleta disponibles.' using errcode='23514';end if;
  end if;
  -- Una transacción por óptica: mensaje con recurso y lugar; las restricciones siguen
  -- cubriendo también cambios de horario que lleguen por el editor anterior.
  select * into op from public.operativos o where o.tenant_id=t and o.id=oid for update;

  if coalesce((p->>'editar')::boolean,false) then
    if op.id is null then raise exception 'Operativo no disponible' using errcode='42501'; end if;
    if op.estado<>'planificado' then raise exception 'Solo se puede editar la agenda de operativos planificados' using errcode='23514'; end if;
  elsif op.id is not null then
    if exists(select 1 from public.agenda_turnos where operativo_id=oid) then return oid; end if;
    raise exception 'Abre el operativo para asignar su equipo' using errcode='23514';
  end if;
  select r.nombre recurso,o.nombre operativo into choque
  from public.agenda_turnos a join public.operativos o on o.id=a.operativo_id
  join public.agenda_recursos r on r.tenant_id=t and r.id=any(ids)
    and r.id in (a.vendedora_id,a.tecnologo_id,a.coordinador_id,a.kit_id)
  where a.tenant_id=t and a.operativo_id<>oid and a.activo and a.tramo && ventana limit 1;
  if found then
    raise exception '% ya está asignado en % en ese horario',choque.recurso,choque.operativo using errcode='23P01';
  end if;
  if op.id is null then
    insert into public.operativos(id,tenant_id,nombre,direccion,fecha,fecha_fin,hora_inicio,hora_fin,meta_examenes)
    values(oid,t,nombre,dir,f,ff,hi,hf,meta);
  else
    -- Actualizar primero las cuatro asignaciones para que el trigger no pruebe el horario nuevo
    -- con el personal antiguo. El bloqueo de la fila del operativo impide carreras.
    delete from public.agenda_turnos where operativo_id=oid and tenant_id=t;
    update public.operativos set nombre=nombre_guardado.nombre,direccion=dir,fecha=f,fecha_fin=ff,hora_inicio=hi,hora_fin=hf,meta_examenes=meta
      from (select btrim(p->>'nombre') nombre) nombre_guardado
      where operativos.id=oid and operativos.tenant_id=t;
  end if;
  insert into public.agenda_turnos(operativo_id,tenant_id,vendedora_id,tecnologo_id,coordinador_id,kit_id,tramo,activo,presupuesto)
  values(oid,t,ids[1],ids[2],ids[3],ids[4],ventana,true,gastos);
  return oid;
end;
$$;
