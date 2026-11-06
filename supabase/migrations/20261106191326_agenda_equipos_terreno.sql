create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;
create schema if not exists agenda_privada;
revoke all on schema agenda_privada from public, anon, authenticated;

create table public.agenda_recursos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('vendedora','tecnologo','coordinador','kit')),
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  detalle text not null default '' check (length(detalle) <= 250),
  unique (tenant_id,id)
);
create unique index agenda_recursos_nombre on public.agenda_recursos(tenant_id,tipo,lower(btrim(nombre)));

alter table public.operativos add constraint operativos_tenant_id_unique unique (tenant_id,id);
create table public.agenda_turnos (
  operativo_id uuid primary key,
  tenant_id uuid not null,
  vendedora_id uuid not null,
  tecnologo_id uuid not null,
  coordinador_id uuid not null,
  kit_id uuid not null,
  tramo tsrange not null check (not isempty(tramo)),
  activo boolean not null,
  presupuesto jsonb not null default '{}'::jsonb,
  foreign key (tenant_id,operativo_id) references public.operativos(tenant_id,id) on delete cascade,
  foreign key (tenant_id,vendedora_id) references public.agenda_recursos(tenant_id,id),
  foreign key (tenant_id,tecnologo_id) references public.agenda_recursos(tenant_id,id),
  foreign key (tenant_id,coordinador_id) references public.agenda_recursos(tenant_id,id),
  foreign key (tenant_id,kit_id) references public.agenda_recursos(tenant_id,id),
  exclude using gist (vendedora_id with =, tramo with &&) where (activo),
  exclude using gist (tecnologo_id with =, tramo with &&) where (activo),
  exclude using gist (coordinador_id with =, tramo with &&) where (activo),
  exclude using gist (kit_id with =, tramo with &&) where (activo)
);
create index agenda_turnos_tenant on public.agenda_turnos(tenant_id);
create index agenda_turnos_vendedora on public.agenda_turnos(tenant_id,vendedora_id);
create index agenda_turnos_tecnologo on public.agenda_turnos(tenant_id,tecnologo_id);
create index agenda_turnos_coordinador on public.agenda_turnos(tenant_id,coordinador_id);
create index agenda_turnos_kit on public.agenda_turnos(tenant_id,kit_id);

alter table public.agenda_recursos enable row level security;
alter table public.agenda_turnos enable row level security;
revoke all on public.agenda_recursos,public.agenda_turnos from public,anon,authenticated;
grant select on public.agenda_recursos,public.agenda_turnos to authenticated;
grant insert (tipo,nombre,detalle), update (nombre,detalle) on public.agenda_recursos to authenticated;
grant all on public.agenda_recursos,public.agenda_turnos to service_role;
create policy agenda_recursos_leer on public.agenda_recursos for select to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy agenda_recursos_alta on public.agenda_recursos for insert to authenticated
  with check (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy agenda_recursos_editar on public.agenda_recursos for update to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()))
  with check (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy agenda_turnos_leer on public.agenda_turnos for select to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');

create function agenda_privada.tramo(p_fecha date,p_fin date,p_inicio time,p_termino time)
returns tsrange language plpgsql immutable set search_path='' as $$
begin
  if p_fecha is null or p_inicio is null or p_termino is null
    or coalesce(p_fin,p_fecha) < p_fecha or coalesce(p_fin,p_fecha)-p_fecha > 30
    or p_fecha+p_inicio >= coalesce(p_fin,p_fecha)+p_termino then
    raise exception 'El horario de término debe ser posterior al inicio. Máximo 31 días.' using errcode='23514';
  end if;
  return tsrange(p_fecha+p_inicio,coalesce(p_fin,p_fecha)+p_termino,'[)');
end;
$$;

-- Si se cambia el operativo desde el calendario anterior, el bloqueo se actualiza en la misma transacción.
create function agenda_privada.sincronizar_turno() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.agenda_turnos where operativo_id=new.id) then
    update public.agenda_turnos set tramo=agenda_privada.tramo(new.fecha,new.fecha_fin,new.hora_inicio,new.hora_fin),
      activo=new.estado<>'cancelado' where operativo_id=new.id;
  end if;
  return new;
end;
$$;
create trigger agenda_sincronizar after update of fecha,fecha_fin,hora_inicio,hora_fin,estado on public.operativos
  for each row execute function agenda_privada.sincronizar_turno();

-- La función conserva el operativo como fuente de fecha y lugar. Las cuatro reservas y el
-- presupuesto se guardan juntos. La exclusión GiST también protege escrituras simultáneas.
create function public.agenda_guardar_turno(p jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  t uuid := public.jwt_tenant_id();
  oid uuid := (p->>'id')::uuid;
  f date := (p->>'fecha')::date;
  ff date := (p->>'fecha_fin')::date;
  hi time := (p->>'inicio')::time;
  hf time := (p->>'fin')::time;
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
    if not exists(select 1 from public.agenda_recursos r where r.tenant_id=t and r.id=ids[i] and r.tipo=tipos[i]) then
      raise exception 'Selecciona personal y kit de esta óptica' using errcode='23514';
    end if;
  end loop;
  -- Una transacción por óptica: mensaje con recurso y lugar; las restricciones siguen
  -- cubriendo también cambios de horario que lleguen por el editor anterior.
  select * into op from public.operativos o where o.tenant_id=t and o.id=oid for update;
  perform pg_advisory_xact_lock(hashtextextended('lentia.agenda.'||t::text,0));
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
revoke execute on function public.agenda_guardar_turno(jsonb) from public,anon;
grant execute on function public.agenda_guardar_turno(jsonb) to authenticated;
revoke execute on all functions in schema agenda_privada from public,anon,authenticated;
alter table public.tenants add column agenda_paralela boolean not null default false;

-- El calendario de una sola cuadrilla conserva su bloqueo. El piloto usa cuatro reservas.
create or replace function agenda_interna.verificar_cruce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_propio boolean := tg_table_name = 'operativos';
  tipo_bloque text := 'externo';
  termino date := greatest(new.fecha, new.fecha_fin);
  desde time := new.hora_inicio;
  hasta time := new.hora_fin;
begin
  -- RLS rechaza la escritura. No leer horarios de otra óptica desde el trigger.
  if auth.uid() is not null and new.tenant_id is distinct from public.jwt_tenant_id() then
    return new;
  end if;
  if not es_propio then
    tipo_bloque := new.tipo;
  end if;
  if new.estado = 'cancelado' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tenant_id is not distinct from old.tenant_id
      and new.fecha is not distinct from old.fecha
      and termino = greatest(old.fecha, old.fecha_fin)
      and old.estado <> 'cancelado' then
      if es_propio then
        if new.hora_inicio is not distinct from old.hora_inicio and new.hora_fin is not distinct from old.hora_fin then
          return new;
        end if;
      elsif new.tipo = old.tipo then
        return new;
      end if;
    end if;
  end if;

  -- Ambas tablas toman el mismo bloqueo antes de leer los horarios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.' || new.tenant_id::text, 0));

  if not es_propio or desde is null or hasta is null or desde >= hasta then
    desde := time '00:00';
    hasta := time '24:00';
  end if;

  if exists (
    select 1 from public.agenda_bloques b
    where b.tenant_id = new.tenant_id and (es_propio or b.id <> new.id)
      and b.tipo = tipo_bloque and b.estado <> 'cancelado'
      and b.fecha <= termino and coalesce(b.fecha_fin, b.fecha) >= new.fecha
  ) or (tipo_bloque = 'externo'
    and (not es_propio or not exists(select 1 from public.tenants t where t.id=new.tenant_id and t.agenda_paralela))
    and exists (
    select 1 from public.operativos o
    where o.tenant_id = new.tenant_id and (not es_propio or o.id <> new.id)
      and o.estado <> 'cancelado'
      and o.fecha <= termino and greatest(o.fecha_fin, o.fecha) >= new.fecha
      and (
        o.hora_inicio is null or o.hora_fin is null or o.hora_inicio >= o.hora_fin
        or (o.hora_inicio < hasta and o.hora_fin > desde)
      )
  )) then
    raise exception 'Cruce en la agenda' using errcode = '23P01';
  end if;

  return new;
end;
$$;

reset search_path;
