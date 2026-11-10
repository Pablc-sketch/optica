-- Personal, equipos, kits y reservas por operativo.
--
-- Reglas:
--   * Una persona se registra por sus funciones; no necesita cuenta.
--   * Un equipo físico tiene un código propio (serie, etiqueta).
--   * Un kit agrupa equipos concretos; un equipo puede estar en varios kits.
--   * Ninguna persona, kit ni equipo puede quedar reservado en dos
--     operativos que se cruzan en el tiempo. Lo garantiza una restricción
--     de exclusión: vale también para dos guardados simultáneos.
--   * Editar, cancelar o reasignar un operativo actualiza sus reservas en
--     la misma transacción; si algo choca, no se guarda nada.
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------
create table public.personal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  funciones text[] not null check (
    cardinality(funciones) between 1 and 3
    and funciones <@ array['tecnologo', 'vendedor', 'coordinador']::text[]
  ),
  telefono text check (telefono is null or length(telefono) <= 30),
  -- Opcional: si además usa Lentia.
  usuario_id uuid references public.users(id) on delete set null,
  activo boolean not null default true,
  unique (tenant_id, id)
);
create unique index personal_nombre on public.personal (tenant_id, lower(btrim(nombre))) where activo;

-- ---------------------------------------------------------------------
-- Equipos y kits
-- ---------------------------------------------------------------------
create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  -- autorefractómetro, lensómetro, maleta de lentes, cartilla…
  tipo text not null check (length(btrim(tipo)) between 1 and 60),
  -- Lo que lo identifica físicamente: serie, etiqueta, inventario.
  codigo text not null check (length(btrim(codigo)) between 1 and 60),
  activo boolean not null default true,
  unique (tenant_id, id)
);
create unique index equipos_codigo on public.equipos (tenant_id, lower(btrim(codigo)));

create table public.kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  activo boolean not null default true,
  unique (tenant_id, id)
);
create unique index kits_nombre on public.kits (tenant_id, lower(btrim(nombre))) where activo;

create table public.kit_equipos (
  tenant_id uuid not null default public.jwt_tenant_id(),
  kit_id uuid not null,
  equipo_id uuid not null,
  primary key (kit_id, equipo_id),
  foreign key (tenant_id, kit_id) references public.kits(tenant_id, id) on delete cascade,
  foreign key (tenant_id, equipo_id) references public.equipos(tenant_id, id) on delete restrict
);
create index kit_equipos_equipo on public.kit_equipos (tenant_id, equipo_id);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
-- El tramo de un operativo: días completos si no tiene horario; si lo
-- tiene, desde la hora de inicio del primer día a la de término del último.
create function public.tramo_operativo(p_fecha date, p_fin date, p_inicio time, p_termino time)
returns tsrange language sql immutable set search_path = '' as $$
  select case
    when p_inicio is null or p_termino is null
      or p_fecha + p_inicio >= coalesce(p_fin, p_fecha) + p_termino
      then tsrange(p_fecha::timestamp, (coalesce(p_fin, p_fecha) + 1)::timestamp, '[)')
    else tsrange(p_fecha + p_inicio, coalesce(p_fin, p_fecha) + p_termino, '[)')
  end
$$;

create table public.operativo_reservas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operativo_id uuid not null,
  persona_id uuid,
  funcion text check (funcion in ('tecnologo', 'vendedor', 'coordinador')),
  kit_id uuid,
  -- Un equipo se reserva a través de su kit (kit_id indica cuál).
  equipo_id uuid,
  recurso_id uuid generated always as (coalesce(persona_id, equipo_id, kit_id)) stored,
  tramo tsrange not null check (not isempty(tramo)),
  activo boolean not null default true,
  check (
    (persona_id is not null and funcion is not null and kit_id is null and equipo_id is null)
    or (persona_id is null and funcion is null and kit_id is not null)
  ),
  foreign key (tenant_id, operativo_id) references public.operativos(tenant_id, id) on delete cascade,
  foreign key (tenant_id, persona_id) references public.personal(tenant_id, id),
  foreign key (tenant_id, kit_id) references public.kits(tenant_id, id),
  foreign key (tenant_id, equipo_id) references public.equipos(tenant_id, id),
  -- El corazón: el mismo recurso no puede estar activo en dos tramos que se
  -- crucen. Postgres lo hace cumplir también entre transacciones simultáneas.
  constraint reserva_sin_cruce exclude using gist (tenant_id with =, recurso_id with =, tramo with &&) where (activo)
);
create index operativo_reservas_operativo on public.operativo_reservas (tenant_id, operativo_id);

-- ---------------------------------------------------------------------
-- Costos: presupuesto y gasto real, separados
-- ---------------------------------------------------------------------
create table public.operativo_costos (
  tenant_id uuid not null default public.jwt_tenant_id(),
  operativo_id uuid not null,
  categoria text not null check (categoria in ('viaticos', 'hospedaje', 'transporte', 'arriendo', 'personal', 'equipos', 'otros')),
  -- Lo que se espera gastar. Nunca entra a la utilidad.
  presupuesto bigint not null default 0 check (presupuesto >= 0),
  -- Lo que de verdad se gastó. null = todavía no se sabe.
  real bigint check (real >= 0),
  nota text check (nota is null or length(nota) <= 200),
  primary key (operativo_id, categoria),
  foreign key (tenant_id, operativo_id) references public.operativos(tenant_id, id) on delete cascade
);

-- Totales en el propio operativo, para que todas las pantallas que ya leen
-- operativos los vean sin otra consulta.
alter table public.operativos
  add column costo_detalle_real bigint not null default 0 check (costo_detalle_real >= 0),
  add column presupuesto_total bigint not null default 0 check (presupuesto_total >= 0);

-- Los costos antiguos de Óptica Global viven en columnas del operativo
-- (costo_transporte, costo_arriendo…). Una categoría se registra en un
-- solo lado: si la columna antigua tiene monto, no se acepta además un
-- gasto real en la tabla nueva (y al revés). Así nada se cuenta dos veces.
create function public.columna_costo_antigua(p_categoria text) returns text
language sql immutable set search_path = '' as $$
  select case p_categoria
    when 'transporte' then 'costo_transporte'
    when 'arriendo' then 'costo_arriendo'
    when 'viaticos' then 'costo_viaticos'
    when 'personal' then 'costo_ayudante'
    when 'equipos' then 'costo_equipos'
    when 'otros' then 'costo_otros'
  end
$$;

create function public.verificar_costo_unico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_col text;
  v_monto bigint;
begin
  if tg_table_name = 'operativo_costos' then
    v_col := public.columna_costo_antigua(new.categoria);
    if new.real is not null and v_col is not null then
      execute format('select %I from public.operativos where id = $1', v_col) into v_monto using new.operativo_id;
      if coalesce(v_monto, 0) <> 0 then
        raise exception 'Ese gasto ya está anotado en el operativo (%). Usa un solo lugar.', new.categoria using errcode = '23514';
      end if;
    end if;
  else
    if exists (
      select 1 from public.operativo_costos c
      where c.operativo_id = new.id and c.real is not null and (
        (c.categoria = 'transporte' and new.costo_transporte <> 0)
        or (c.categoria = 'arriendo' and new.costo_arriendo <> 0)
        or (c.categoria = 'viaticos' and new.costo_viaticos <> 0)
        or (c.categoria = 'personal' and new.costo_ayudante <> 0)
        or (c.categoria = 'equipos' and new.costo_equipos <> 0)
        or (c.categoria = 'otros' and new.costo_otros <> 0))
    ) then
      raise exception 'Ese gasto ya está anotado en el detalle de costos. Usa un solo lugar.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger operativo_costos_unico before insert or update on public.operativo_costos
  for each row execute function public.verificar_costo_unico();
create trigger operativos_costo_unico before update of costo_transporte, costo_arriendo, costo_viaticos, costo_ayudante, costo_equipos, costo_otros
  on public.operativos for each row execute function public.verificar_costo_unico();

create function public.totalizar_costos_operativo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_op uuid := coalesce(new.operativo_id, old.operativo_id);
begin
  update public.operativos o set
    costo_detalle_real = coalesce((select sum(c.real) from public.operativo_costos c where c.operativo_id = v_op), 0),
    presupuesto_total = coalesce((select sum(c.presupuesto) from public.operativo_costos c where c.operativo_id = v_op), 0)
  where o.id = v_op;
  return null;
end;
$$;
create trigger operativo_costos_total after insert or update or delete on public.operativo_costos
  for each row execute function public.totalizar_costos_operativo();

-- ---------------------------------------------------------------------
-- Mantener las reservas al día
-- ---------------------------------------------------------------------
-- Cambiar fechas, horario o estado del operativo (desde cualquier
-- pantalla) mueve o libera sus reservas en la misma transacción. Si el
-- nuevo horario choca, el cambio entero se rechaza.
create function public.sincronizar_reservas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.operativo_reservas r set
    tramo = public.tramo_operativo(new.fecha, new.fecha_fin, new.hora_inicio, new.hora_fin),
    activo = new.estado <> 'cancelado'
  where r.operativo_id = new.id;
  return new;
end;
$$;
create trigger operativos_sincronizar_reservas after update of fecha, fecha_fin, hora_inicio, hora_fin, estado
  on public.operativos for each row execute function public.sincronizar_reservas();

-- Cambiar lo que trae un kit actualiza las reservas de los operativos
-- que todavía no terminan. Si el equipo agregado está ocupado, no se agrega.
create function public.sincronizar_kit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.operativo_reservas (tenant_id, operativo_id, kit_id, equipo_id, tramo, activo)
    select r.tenant_id, r.operativo_id, r.kit_id, new.equipo_id, r.tramo, r.activo
      from public.operativo_reservas r
     where r.kit_id = new.kit_id and r.equipo_id is null and r.activo
       and upper(r.tramo) > (now() at time zone 'America/Santiago');
    return new;
  end if;
  delete from public.operativo_reservas r
   where r.kit_id = old.kit_id and r.equipo_id = old.equipo_id
     and upper(r.tramo) > (now() at time zone 'America/Santiago');
  return old;
end;
$$;
create trigger kit_equipos_sincronizar after insert or delete on public.kit_equipos
  for each row execute function public.sincronizar_kit();

-- ---------------------------------------------------------------------
-- Guardar un operativo con su equipo humano y sus kits
-- ---------------------------------------------------------------------
-- p: {id, nombre, direccion, notas, fecha, fecha_fin, hora_inicio,
--     hora_fin, personas: [{id, funcion}], kits: [id]}
-- Crea o edita. Reemplaza todas las reservas del operativo en una sola
-- transacción. Si algo está ocupado dice qué y en qué operativo.
create function public.guardar_operativo_equipo(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t uuid := public.jwt_tenant_id();
  v_id uuid := (p ->> 'id')::uuid;
  v_nombre text := btrim(p ->> 'nombre');
  v_fecha date := (p ->> 'fecha')::date;
  v_fin date := nullif(p ->> 'fecha_fin', '')::date;
  v_hi time := nullif(p ->> 'hora_inicio', '')::time;
  v_hf time := nullif(p ->> 'hora_fin', '')::time;
  v_tramo tsrange;
  v_estado text;
  v_persona jsonb;
  v_kit uuid;
  v_choque record;
begin
  if t is null or not coalesce(public.es_admin(), false) then
    raise exception 'Solo un administrador puede organizar operativos.' using errcode = '42501';
  end if;
  if v_id is null or v_nombre is null or length(v_nombre) not between 1 and 160 or v_fecha is null then
    raise exception 'Revisa el nombre y la fecha.' using errcode = '22023';
  end if;
  if v_fin is not null and (v_fin < v_fecha or v_fin - v_fecha > 60) then
    raise exception 'La fecha final debe ser igual o posterior a la inicial (máximo 60 días).' using errcode = '22023';
  end if;
  if (v_hi is null) <> (v_hf is null) or (v_hi is not null and v_fin is null and v_hi >= v_hf) then
    raise exception 'Indica hora de inicio y de término, o deja ambas vacías para jornada completa.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p -> 'personas', '[]')) <> 'array' or jsonb_typeof(coalesce(p -> 'kits', '[]')) <> 'array' then
    raise exception 'Revisa el personal y los kits.' using errcode = '22023';
  end if;
  -- Una persona va una sola vez por operativo.
  if (select count(*) <> count(distinct x ->> 'id') from jsonb_array_elements(coalesce(p -> 'personas', '[]')) x) then
    raise exception 'Una misma persona aparece dos veces en el operativo.' using errcode = '22023';
  end if;
  v_tramo := public.tramo_operativo(v_fecha, v_fin, v_hi, v_hf);

  select o.estado into v_estado from public.operativos o where o.id = v_id and o.tenant_id = t for update;
  if v_estado = 'cancelado' then
    raise exception 'El operativo está cancelado.' using errcode = '22023';
  end if;
  -- Primero se sueltan las reservas actuales: si no, al mover la fecha el
  -- trigger arrastraría a personas que justamente se están cambiando.
  delete from public.operativo_reservas r where r.operativo_id = v_id and r.tenant_id = t;
  if v_estado is null then
    insert into public.operativos (id, tenant_id, nombre, direccion, notas, fecha, fecha_fin, hora_inicio, hora_fin)
    values (v_id, t, v_nombre, nullif(btrim(p ->> 'direccion'), ''), nullif(btrim(p ->> 'notas'), ''), v_fecha, v_fin, v_hi, v_hf);
  else
    update public.operativos o set nombre = v_nombre, direccion = nullif(btrim(p ->> 'direccion'), ''),
      notas = nullif(btrim(p ->> 'notas'), ''), fecha = v_fecha, fecha_fin = v_fin, hora_inicio = v_hi, hora_fin = v_hf
     where o.id = v_id and o.tenant_id = t;
  end if;

  begin
    for v_persona in select * from jsonb_array_elements(coalesce(p -> 'personas', '[]')) loop
      if not exists (
        select 1 from public.personal x
         where x.tenant_id = t and x.id = (v_persona ->> 'id')::uuid and x.activo
           and (v_persona ->> 'funcion') = any (x.funciones)
      ) then
        raise exception 'Elige personas activas de esta óptica, en una función que tengan registrada.' using errcode = '22023';
      end if;
      insert into public.operativo_reservas (tenant_id, operativo_id, persona_id, funcion, tramo)
      values (t, v_id, (v_persona ->> 'id')::uuid, v_persona ->> 'funcion', v_tramo);
    end loop;

    for v_kit in select (k #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'kits', '[]')) k loop
      if not exists (select 1 from public.kits k where k.tenant_id = t and k.id = v_kit and k.activo) then
        raise exception 'Elige kits activos de esta óptica.' using errcode = '22023';
      end if;
      insert into public.operativo_reservas (tenant_id, operativo_id, kit_id, tramo) values (t, v_id, v_kit, v_tramo);
      insert into public.operativo_reservas (tenant_id, operativo_id, kit_id, equipo_id, tramo)
      select t, v_id, v_kit, ke.equipo_id, v_tramo
        from public.kit_equipos ke join public.equipos e on e.tenant_id = t and e.id = ke.equipo_id
       where ke.tenant_id = t and ke.kit_id = v_kit and e.activo;
    end loop;
  exception when exclusion_violation then
    -- Las inserciones de este bloque se deshicieron; buscar con qué choca.
    select coalesce(pe.nombre, eq.nombre || ' (' || eq.codigo || ')', ki.nombre) as recurso, o.nombre as operativo
      into v_choque
      from public.operativo_reservas r
      join public.operativos o on o.id = r.operativo_id
      left join public.personal pe on pe.id = r.persona_id
      left join public.equipos eq on eq.id = r.equipo_id
      left join public.kits ki on ki.id = r.kit_id and r.equipo_id is null
     where r.tenant_id = t and r.activo and r.operativo_id <> v_id and r.tramo && v_tramo
       and (r.persona_id in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p -> 'personas', '[]')) x)
         or r.kit_id in (select (k #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'kits', '[]')) k) and r.equipo_id is null
         or r.equipo_id in (
           select ke.equipo_id from public.kit_equipos ke
            where ke.tenant_id = t and ke.kit_id in (select (k #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'kits', '[]')) k)))
     limit 1;
    raise exception '% ya está reservado en «%» en esas fechas.', coalesce(v_choque.recurso, 'Un recurso'), coalesce(v_choque.operativo, 'otro operativo')
      using errcode = '23P01';
  end;
  return v_id;
end;
$$;
revoke execute on function public.guardar_operativo_equipo(jsonb) from public, anon;
grant execute on function public.guardar_operativo_equipo(jsonb) to authenticated;
revoke execute on function public.sincronizar_reservas(), public.sincronizar_kit(), public.verificar_costo_unico(),
  public.totalizar_costos_operativo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
alter table public.personal enable row level security;
alter table public.equipos enable row level security;
alter table public.kits enable row level security;
alter table public.kit_equipos enable row level security;
alter table public.operativo_reservas enable row level security;
alter table public.operativo_costos enable row level security;
revoke all on public.personal, public.equipos, public.kits, public.kit_equipos, public.operativo_reservas, public.operativo_costos
  from public, anon, authenticated;
grant select, insert, update, delete on public.personal, public.equipos, public.kits, public.kit_equipos,
  public.operativo_reservas, public.operativo_costos to authenticated;
grant all on public.personal, public.equipos, public.kits, public.kit_equipos, public.operativo_reservas, public.operativo_costos
  to service_role;

-- Lectura: quien atiende (admin, clínico, ventas) ve el equipo del día.
-- Escritura: solo el administrador.
do $$
declare
  tabla text;
begin
  foreach tabla in array array['personal', 'equipos', 'kits', 'kit_equipos', 'operativo_reservas'] loop
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_ver_clinico()))', tabla || '_lectura', tabla);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))', tabla || '_alta', tabla);
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin())) with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))', tabla || '_edicion', tabla);
    execute format('create policy %I on public.%I for delete to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))', tabla || '_borrado', tabla);
  end loop;
end $$;

-- Los costos son información financiera: solo el administrador.
create policy operativo_costos_admin on public.operativo_costos for all to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

reset search_path;
