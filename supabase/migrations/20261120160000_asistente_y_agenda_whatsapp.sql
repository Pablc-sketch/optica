-- Asistente de IA, inscritos en operativos y bandeja de WhatsApp.
--
-- 1. uso_asistente: tope diario de consultas a la IA por óptica.
-- 2. inscritos_operativo: personas anotadas en un operativo (nombre,
--    teléfono, edad), desde WhatsApp o a mano.
-- 3. WhatsApp: Lentia NO responde. Recibe copia de los chats del WhatsApp
--    Business de la óptica (Cloud API en coexistencia con la app), la IA
--    propone a qué operativo corresponde cada persona y el administrador
--    confirma. El webhook escribe con la llave de servicio, siempre con la
--    óptica que sale del número que recibió el mensaje.

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
revoke all on public.uso_asistente from anon;
revoke insert, update, delete on public.uso_asistente from authenticated;

-- Suma p_cantidad consultas y dice si todavía están dentro del tope.
create or replace function public.registrar_pregunta_asistente(p_cantidad integer default 1)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_total integer;
begin
  if v_tenant is null or not public.es_admin() or not public.suscripcion_vigente()
     or p_cantidad is null or p_cantidad < 1 or p_cantidad > 20 then
    return false;
  end if;
  insert into public.uso_asistente as u (tenant_id, dia, preguntas)
  values (v_tenant, (now() at time zone 'America/Santiago')::date, p_cantidad)
  on conflict (tenant_id, dia) do update set preguntas = u.preguntas + p_cantidad
  returning preguntas into v_total;
  return v_total <= 200;
end;
$$;
revoke all on function public.registrar_pregunta_asistente(integer) from public, anon;
grant execute on function public.registrar_pregunta_asistente(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Inscritos en operativos
-- ---------------------------------------------------------------------------
-- Sectores, villas o juntas que cubre el operativo: la IA los usa para
-- reconocer a qué operativo corresponde quien escribe («soy de Labrador»).
alter table public.operativos add column sectores text check (length(sectores) <= 500);

create table public.inscritos_operativo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  operativo_id uuid not null,
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  edad smallint check (edad between 0 and 120),
  estado text not null default 'inscrito' check (estado in ('inscrito', 'cancelado', 'asistio')),
  origen text not null default 'manual' check (origen in ('whatsapp', 'manual')),
  creado_por uuid references public.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  foreign key (tenant_id, operativo_id) references public.operativos (tenant_id, id) on delete cascade
);
create index inscritos_operativo_por_operativo on public.inscritos_operativo (operativo_id) where estado <> 'cancelado';
-- Un teléfono no queda dos veces vigente en el mismo operativo.
create unique index inscritos_operativo_un_telefono on public.inscritos_operativo (operativo_id, telefono) where estado <> 'cancelado';
alter table public.inscritos_operativo enable row level security;
create policy inscritos_operativo_lectura on public.inscritos_operativo
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy inscritos_operativo_alta on public.inscritos_operativo
  for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.suscripcion_vigente()));
create policy inscritos_operativo_edicion on public.inscritos_operativo
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.suscripcion_vigente()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.suscripcion_vigente()));
revoke all on public.inscritos_operativo from anon;
revoke delete on public.inscritos_operativo from authenticated;

-- ---------------------------------------------------------------------------
-- 3. WhatsApp
-- ---------------------------------------------------------------------------
-- Número de WhatsApp Business (Meta) de cada óptica. Un número, una óptica.
create table public.whatsapp_numeros (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  telefono_visible text check (length(telefono_visible) <= 30),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.whatsapp_numeros enable row level security;
create policy whatsapp_numeros_lectura on public.whatsapp_numeros
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

-- Un chat por persona. La sugerencia de la IA queda guardada hasta que el
-- administrador inscribe o descarta.
create table public.whatsapp_chats (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  nombre_perfil text check (length(nombre_perfil) <= 100),
  ultimo_mensaje_en timestamptz not null default now(),
  ultimo_entrante_en timestamptz,
  analizado_en timestamptz,
  sugerencia jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'inscrito', 'descartado')),
  primary key (tenant_id, telefono)
);
create index whatsapp_chats_recientes on public.whatsapp_chats (tenant_id, ultimo_mensaje_en desc);
alter table public.whatsapp_chats enable row level security;
create policy whatsapp_chats_lectura on public.whatsapp_chats
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));
create policy whatsapp_chats_edicion on public.whatsapp_chats
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

create table public.whatsapp_mensajes (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  telefono text not null,
  wamid text not null unique check (length(wamid) <= 200),
  direccion text not null check (direccion in ('entrante', 'saliente')),
  texto text not null default '' check (length(texto) <= 4000),
  enviado_en timestamptz not null,
  foreign key (tenant_id, telefono) references public.whatsapp_chats (tenant_id, telefono) on delete cascade
);
create index whatsapp_mensajes_chat on public.whatsapp_mensajes (tenant_id, telefono, enviado_en desc);
create index whatsapp_mensajes_antiguedad on public.whatsapp_mensajes (tenant_id, enviado_en);
alter table public.whatsapp_mensajes enable row level security;
create policy whatsapp_mensajes_lectura on public.whatsapp_mensajes
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

revoke all on public.whatsapp_numeros, public.whatsapp_chats, public.whatsapp_mensajes from anon;
revoke insert, update, delete on public.whatsapp_numeros, public.whatsapp_mensajes from authenticated;
revoke insert, delete on public.whatsapp_chats from authenticated;
-- El administrador solo cambia el estado de un chat (inscrito/descartado) y la sugerencia.
revoke update on public.whatsapp_chats from authenticated;
grant update (estado, sugerencia, analizado_en) on public.whatsapp_chats to authenticated;
