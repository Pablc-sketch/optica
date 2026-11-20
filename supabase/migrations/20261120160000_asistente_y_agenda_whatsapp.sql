-- Asistente de IA y agenda de operativos por WhatsApp.
--
-- 1. uso_asistente: tope diario de preguntas por óptica (controla el gasto).
-- 2. Agenda por WhatsApp: cada operativo puede abrir horas (bloques con cupo).
--    Las personas escriben al WhatsApp de la óptica y toman una hora.
--    El webhook trabaja con la llave de servicio, SIEMPRE con la óptica que
--    sale del número de WhatsApp que recibió el mensaje, y solo a través de
--    las funciones de abajo (no tienen permiso los usuarios ni anon).

-- ---------------------------------------------------------------------------
-- 1. Tope diario del asistente
-- ---------------------------------------------------------------------------
create table public.uso_asistente (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  dia date not null,
  preguntas integer not null default 0,
  primary key (tenant_id, dia)
);
alter table public.uso_asistente enable row level security;
create policy uso_asistente_lectura on public.uso_asistente
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

create or replace function public.registrar_pregunta_asistente()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_total integer;
begin
  if v_tenant is null or not public.es_admin() or not public.suscripcion_vigente() then
    return false;
  end if;
  insert into public.uso_asistente as u (tenant_id, dia, preguntas)
  values (v_tenant, (now() at time zone 'America/Santiago')::date, 1)
  on conflict (tenant_id, dia) do update set preguntas = u.preguntas + 1
  returning preguntas into v_total;
  return v_total <= 150;
end;
$$;
revoke all on function public.registrar_pregunta_asistente() from public, anon;
grant execute on function public.registrar_pregunta_asistente() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Agenda por WhatsApp
-- ---------------------------------------------------------------------------
alter table public.operativos
  add column agenda_whatsapp boolean not null default false,
  add column cupos_por_bloque smallint not null default 3 check (cupos_por_bloque between 1 and 50),
  add column minutos_bloque smallint not null default 30 check (minutos_bloque in (10, 15, 20, 30, 45, 60));

-- Número de WhatsApp Business (Meta) de cada óptica. El phone_number_id es
-- único: un número no puede atender a dos ópticas.
create table public.whatsapp_numeros (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  telefono_visible text check (length(telefono_visible) <= 30),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.whatsapp_numeros enable row level security;
-- La óptica ve su número; se registra con la llave de servicio después de
-- comprobar en Meta que Lentia lo puede usar (ver src/lib/actions/whatsapp.ts).
create policy whatsapp_numeros_lectura on public.whatsapp_numeros
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

create table public.citas_operativo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  operativo_id uuid not null,
  fecha date not null,
  hora time not null,
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  estado text not null default 'agendada' check (estado in ('agendada', 'cancelada', 'asistio')),
  origen text not null default 'whatsapp' check (origen in ('whatsapp', 'manual')),
  creado_en timestamptz not null default now(),
  foreign key (tenant_id, operativo_id) references public.operativos (tenant_id, id) on delete cascade
);
create index citas_operativo_bloque on public.citas_operativo (operativo_id, fecha, hora) where estado = 'agendada';
-- Una hora vigente por teléfono y operativo.
create unique index citas_operativo_una_por_telefono on public.citas_operativo (operativo_id, telefono) where estado = 'agendada';
alter table public.citas_operativo enable row level security;
create policy citas_operativo_lectura on public.citas_operativo
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy citas_operativo_edicion on public.citas_operativo
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.suscripcion_vigente()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.suscripcion_vigente()));

-- Estado de cada conversación (en qué paso del menú va la persona) y
-- mensajes ya procesados (Meta reintenta: no hay que agendar dos veces).
-- Solo la llave de servicio: RLS activo y sin policies.
create table public.whatsapp_conversaciones (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  telefono text not null,
  paso text not null,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  primary key (tenant_id, telefono)
);
alter table public.whatsapp_conversaciones enable row level security;
create table public.whatsapp_mensajes_procesados (
  wamid text primary key check (length(wamid) <= 200),
  recibido_en timestamptz not null default now()
);
alter table public.whatsapp_mensajes_procesados enable row level security;

revoke all on public.whatsapp_conversaciones, public.whatsapp_mensajes_procesados from anon, authenticated;
revoke insert, update, delete on public.whatsapp_numeros from anon, authenticated;
revoke all on public.uso_asistente from anon;
revoke insert, delete on public.citas_operativo from anon, authenticated;

-- Horas de un operativo con cupo libre (solo futuras, con 1 hora de margen).
create or replace function public.horas_whatsapp(p_tenant uuid, p_operativo uuid)
returns table (fecha date, hora time, libres integer)
language sql
stable
security definer
set search_path = ''
as $$
  with op as (
    select o.id, o.fecha, coalesce(o.fecha_fin, o.fecha) as fecha_fin, o.hora_inicio, o.hora_fin,
           o.cupos_por_bloque, make_interval(mins => o.minutos_bloque) as paso
    from public.operativos o
    where o.id = p_operativo and o.tenant_id = p_tenant and o.agenda_whatsapp
      and o.estado = 'planificado' and o.hora_inicio is not null and o.hora_fin is not null
      and o.hora_fin > o.hora_inicio
  ), bloques as (
    select d::date as fecha, h::time as hora, op.cupos_por_bloque, op.id
    from op,
      generate_series(op.fecha, op.fecha_fin, interval '1 day') d,
      generate_series(timestamp '2000-01-01' + op.hora_inicio, timestamp '2000-01-01' + op.hora_fin - op.paso, op.paso) h
  )
  select b.fecha, b.hora, (b.cupos_por_bloque - count(c.id))::integer as libres
  from bloques b
  left join public.citas_operativo c
    on c.operativo_id = b.id and c.fecha = b.fecha and c.hora = b.hora and c.estado = 'agendada'
  where b.fecha + b.hora > (now() at time zone 'America/Santiago') + interval '1 hour'
  group by b.fecha, b.hora, b.cupos_por_bloque
  having b.cupos_por_bloque - count(c.id) > 0
  order by b.fecha, b.hora;
$$;

-- Operativos abiertos a WhatsApp que todavía tienen alguna hora libre.
create or replace function public.operativos_whatsapp(p_tenant uuid)
returns table (id uuid, nombre text, fecha date, fecha_fin date, direccion text, comuna text, hora_inicio time, hora_fin time, horas_libres integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.nombre, o.fecha, o.fecha_fin, o.direccion, o.comuna, o.hora_inicio, o.hora_fin,
         (select count(*)::integer from public.horas_whatsapp(p_tenant, o.id)) as horas_libres
  from public.operativos o
  where o.tenant_id = p_tenant and o.agenda_whatsapp and o.estado = 'planificado'
    and coalesce(o.fecha_fin, o.fecha) >= (now() at time zone 'America/Santiago')::date
  order by o.fecha, o.hora_inicio nulls last, o.id
  limit 9;
$$;

-- Toma una hora. Bloquea el operativo mientras cuenta los cupos, así dos
-- personas escribiendo al mismo tiempo no pueden pasarse del cupo.
create or replace function public.agendar_cita_whatsapp(
  p_tenant uuid, p_operativo uuid, p_fecha date, p_hora time, p_nombre text, p_telefono text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.operativos o where o.id = p_operativo and o.tenant_id = p_tenant for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'operativo');
  end if;
  if exists (select 1 from public.citas_operativo c where c.operativo_id = p_operativo and c.telefono = p_telefono and c.estado = 'agendada') then
    return jsonb_build_object('ok', false, 'error', 'duplicada');
  end if;
  if not exists (select 1 from public.horas_whatsapp(p_tenant, p_operativo) h where h.fecha = p_fecha and h.hora = p_hora) then
    return jsonb_build_object('ok', false, 'error', 'sin_cupo');
  end if;
  insert into public.citas_operativo (tenant_id, operativo_id, fecha, hora, nombre, telefono, origen)
  values (p_tenant, p_operativo, p_fecha, p_hora, btrim(p_nombre), p_telefono, 'whatsapp')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Horas vigentes de un teléfono (para que la persona pueda anular).
create or replace function public.citas_whatsapp_de(p_tenant uuid, p_telefono text)
returns table (id uuid, operativo text, fecha date, hora time, direccion text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, o.nombre, c.fecha, c.hora, o.direccion
  from public.citas_operativo c
  join public.operativos o on o.id = c.operativo_id and o.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant and c.telefono = p_telefono and c.estado = 'agendada'
    and c.fecha >= (now() at time zone 'America/Santiago')::date
  order by c.fecha, c.hora
  limit 9;
$$;

create or replace function public.cancelar_cita_whatsapp(p_tenant uuid, p_cita uuid, p_telefono text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with x as (
    update public.citas_operativo set estado = 'cancelada'
    where id = p_cita and tenant_id = p_tenant and telefono = p_telefono and estado = 'agendada'
    returning 1
  )
  select exists (select 1 from x);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.horas_whatsapp(uuid, uuid)',
    'public.operativos_whatsapp(uuid)',
    'public.agendar_cita_whatsapp(uuid, uuid, date, time, text, text)',
    'public.citas_whatsapp_de(uuid, text)',
    'public.cancelar_cita_whatsapp(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
