-- WhatsApp Business en coexistencia: sugerencias de inscripción por confirmar.
--
-- El WhatsApp Business de la óptica sigue funcionando en el celular. Meta
-- avisa a Lentia de cada mensaje nuevo; Lentia lo guarda y, si es una
-- inscripción, deja una SUGERENCIA (nombre, teléfono, operativo). Nada entra
-- a la lista para llamar (inscritos_operativo) hasta que el administrador
-- pulsa «Aprobar». Lentia no envía mensajes ni llama. No hay IA en este
-- camino: la detección es con reglas, dentro de Lentia.
--
-- Duplicados: un mensaje repetido por Meta (mismo wamid) no hace nada; un
-- teléfono tiene a lo más una sugerencia pendiente por operativo (y una sin
-- operativo, cuando hay duda); si ese teléfono ya está en la lista de ese
-- operativo, no se vuelve a sugerir.

-- ---------------------------------------------------------------------------
-- Datos del alta oficial de Meta (Embedded Signup). Sin tokens: Lentia no
-- guarda credenciales del negocio; solo los identificadores públicos.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_numeros
  add column if not exists waba_id text check (waba_id ~ '^[0-9]{5,30}$'),
  add column if not exists business_id text check (business_id ~ '^[0-9]{5,30}$'),
  add column if not exists coexistencia boolean not null default false,
  add column if not exists conectado_en timestamptz;

-- ---------------------------------------------------------------------------
-- Sugerencias
-- ---------------------------------------------------------------------------
create table public.whatsapp_sugerencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  -- null = hay duda: el administrador elige entre los candidatos.
  operativo_id uuid,
  candidatos uuid[] not null default '{}' check (cardinality(candidatos) <= 20),
  nombre text check (length(btrim(nombre)) between 1 and 100),
  nombre_origen text check (nombre_origen in ('mensaje', 'perfil')),
  -- La sede, sector o localidad que reconoció Lentia en el mensaje.
  lugar text check (length(lugar) <= 100),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'descartada', 'reemplazada')),
  wamid text not null check (length(wamid) <= 200),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelto_por uuid references public.users (id) on delete set null,
  resuelto_en timestamptz,
  foreign key (tenant_id, operativo_id) references public.operativos (tenant_id, id) on delete cascade,
  foreign key (tenant_id, telefono) references public.whatsapp_chats (tenant_id, telefono) on delete cascade
);
create unique index whatsapp_sugerencias_una_por_operativo on public.whatsapp_sugerencias (tenant_id, telefono, operativo_id)
  where estado = 'pendiente' and operativo_id is not null;
create unique index whatsapp_sugerencias_una_con_duda on public.whatsapp_sugerencias (tenant_id, telefono)
  where estado = 'pendiente' and operativo_id is null;
create index whatsapp_sugerencias_pendientes on public.whatsapp_sugerencias (tenant_id, creado_en) where estado = 'pendiente';

alter table public.whatsapp_sugerencias enable row level security;
create policy whatsapp_sugerencias_lectura on public.whatsapp_sugerencias for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));
create policy whatsapp_sugerencias_resolver on public.whatsapp_sugerencias for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente()))
  with check (tenant_id = (select public.jwt_tenant_id()));
revoke all on public.whatsapp_sugerencias from anon, authenticated;
grant select on public.whatsapp_sugerencias to authenticated;
grant update (estado, operativo_id, nombre, resuelto_por, resuelto_en, actualizado_en) on public.whatsapp_sugerencias to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar un mensaje que avisó Meta (solo el webhook, con la llave de
-- servicio). La óptica sale del número que recibió el mensaje. Todo en una
-- transacción: si Meta reenvía el mismo aviso, no se duplica nada.
-- p_sugerencia la calcula Lentia con reglas (operativo, candidatos, nombre,
-- lugar) o es null si el mensaje no es una inscripción.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_mensaje_whatsapp(
  p_phone_number_id text, p_telefono text, p_nombre_perfil text, p_wamid text,
  p_direccion text, p_texto text, p_enviado_en timestamptz, p_sugerencia jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_auto boolean;
  v_n integer;
  v_op uuid;
  v_cands uuid[];
  v_nombre text;
  v_origen text;
  v_lugar text;
  v_nueva boolean;
begin
  select n.tenant_id, n.automatico into v_tenant, v_auto
  from public.whatsapp_numeros n where n.phone_number_id = p_phone_number_id and n.activo;
  if v_tenant is null then return 'sin_numero'; end if;
  if p_telefono is null or p_telefono !~ '^[0-9]{8,15}$' or p_wamid is null or length(p_wamid) > 200
     or p_direccion not in ('entrante', 'saliente') then
    return 'invalido';
  end if;

  insert into public.whatsapp_chats as c (tenant_id, telefono, nombre_perfil, ultimo_mensaje_en, ultimo_entrante_en)
  values (v_tenant, p_telefono, nullif(left(btrim(coalesce(p_nombre_perfil, '')), 100), ''), p_enviado_en,
          case when p_direccion = 'entrante' then p_enviado_en end)
  on conflict (tenant_id, telefono) do update set
    nombre_perfil = coalesce(excluded.nombre_perfil, c.nombre_perfil),
    ultimo_mensaje_en = greatest(c.ultimo_mensaje_en, excluded.ultimo_mensaje_en),
    ultimo_entrante_en = greatest(c.ultimo_entrante_en, excluded.ultimo_entrante_en);

  insert into public.whatsapp_mensajes (tenant_id, telefono, wamid, direccion, texto, enviado_en)
  values (v_tenant, p_telefono, p_wamid, p_direccion, left(coalesce(p_texto, ''), 4000), p_enviado_en)
  on conflict (wamid) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'repetido'; end if;

  if p_direccion <> 'entrante' or p_sugerencia is null or not v_auto then return 'guardado'; end if;

  -- Solo operativos planificados de ESTA óptica.
  v_op := case when (p_sugerencia->>'operativo_id') ~ '^[0-9a-f-]{36}$' then (p_sugerencia->>'operativo_id')::uuid end;
  if v_op is not null and not exists (
    select 1 from public.operativos o where o.id = v_op and o.tenant_id = v_tenant and o.estado = 'planificado'
  ) then
    v_op := null;
  end if;
  select coalesce(array_agg(o.id order by o.fecha, o.id), '{}') into v_cands
  from public.operativos o
  where o.tenant_id = v_tenant and o.estado = 'planificado'
    and o.id::text in (
      select x from jsonb_array_elements_text(coalesce(p_sugerencia->'candidatos', '[]'::jsonb)) x
      where x ~ '^[0-9a-f-]{36}$' limit 20
    );
  v_nombre := nullif(left(btrim(coalesce(p_sugerencia->>'nombre', '')), 100), '');
  v_origen := case when p_sugerencia->>'nombre_origen' in ('mensaje', 'perfil') and v_nombre is not null then p_sugerencia->>'nombre_origen' end;
  v_lugar := nullif(left(btrim(coalesce(p_sugerencia->>'lugar', '')), 100), '');

  if v_op is not null then
    -- Ya está en la lista para llamar de ese operativo: nada que sugerir.
    if exists (select 1 from public.inscritos_operativo i
               where i.operativo_id = v_op and i.telefono = p_telefono and i.estado <> 'cancelado') then
      return 'ya_inscrito';
    end if;
    insert into public.whatsapp_sugerencias as s (tenant_id, telefono, operativo_id, nombre, nombre_origen, lugar, wamid)
    values (v_tenant, p_telefono, v_op, v_nombre, v_origen, v_lugar, p_wamid)
    on conflict (tenant_id, telefono, operativo_id) where estado = 'pendiente' and operativo_id is not null
    do update set
      -- Un nombre dicho en el mensaje vale más que el del perfil.
      nombre = case when s.nombre_origen = 'mensaje' and coalesce(excluded.nombre_origen, '') <> 'mensaje' then s.nombre
                    else coalesce(excluded.nombre, s.nombre) end,
      nombre_origen = case when s.nombre_origen = 'mensaje' and coalesce(excluded.nombre_origen, '') <> 'mensaje' then s.nombre_origen
                           else coalesce(excluded.nombre_origen, s.nombre_origen) end,
      lugar = coalesce(excluded.lugar, s.lugar),
      wamid = excluded.wamid,
      actualizado_en = now()
    returning (xmax = 0) into v_nueva;
    -- La duda anterior de este teléfono queda resuelta por esta sugerencia.
    update public.whatsapp_sugerencias set estado = 'reemplazada', actualizado_en = now()
    where tenant_id = v_tenant and telefono = p_telefono and estado = 'pendiente' and operativo_id is null;
    return case when v_nueva then 'sugerencia' else 'sugerencia_actualizada' end;
  end if;

  -- Hay duda. Si ya hay una sugerencia con operativo para este teléfono, no se agrega otra.
  if exists (select 1 from public.whatsapp_sugerencias s
             where s.tenant_id = v_tenant and s.telefono = p_telefono and s.estado = 'pendiente') then
    update public.whatsapp_sugerencias s set
      nombre = case when s.nombre_origen = 'mensaje' and coalesce(v_origen, '') <> 'mensaje' then s.nombre else coalesce(v_nombre, s.nombre) end,
      nombre_origen = case when s.nombre_origen = 'mensaje' and coalesce(v_origen, '') <> 'mensaje' then s.nombre_origen else coalesce(v_origen, s.nombre_origen) end,
      candidatos = case when s.operativo_id is null and cardinality(v_cands) > 0 then v_cands else s.candidatos end,
      wamid = p_wamid,
      actualizado_en = now()
    where s.tenant_id = v_tenant and s.telefono = p_telefono and s.estado = 'pendiente';
    return 'sugerencia_actualizada';
  end if;
  if cardinality(v_cands) = 0 then return 'guardado'; end if;
  insert into public.whatsapp_sugerencias (tenant_id, telefono, candidatos, nombre, nombre_origen, lugar, wamid)
  values (v_tenant, p_telefono, v_cands, v_nombre, v_origen, v_lugar, p_wamid);
  return 'duda';
end;
$$;
revoke all on function public.registrar_mensaje_whatsapp(text, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_mensaje_whatsapp(text, text, text, text, text, text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- «Aprobar»: pasa la sugerencia a la lista para llamar del operativo elegido.
-- Con la sesión del administrador (RLS); todo o nada.
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_sugerencia_whatsapp(p_sugerencia uuid, p_operativo uuid, p_nombres text[], p_edades integer[] default '{}')
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.whatsapp_sugerencias%rowtype;
  v_nombre text;
  v_edad integer;
  v_total integer := 0;
  v_validos integer := 0;
  v_n integer;
  i integer;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador aprueba inscripciones.' using errcode = '42501';
  end if;
  select * into s from public.whatsapp_sugerencias
  where id = p_sugerencia and tenant_id = public.jwt_tenant_id() for update;
  if not found then raise exception 'La sugerencia no existe.' using errcode = 'P0002'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta sugerencia ya fue resuelta.' using errcode = 'P0001'; end if;
  if p_operativo is null or not exists (
    select 1 from public.operativos o where o.id = p_operativo and o.tenant_id = s.tenant_id and o.estado = 'planificado'
  ) then
    raise exception 'Elige un operativo planificado.' using errcode = 'P0001';
  end if;

  for i in 1 .. coalesce(array_length(p_nombres, 1), 0) loop
    v_nombre := regexp_replace(btrim(coalesce(p_nombres[i], '')), '\s+', ' ', 'g');
    continue when v_nombre = '';
    if length(v_nombre) > 80 then raise exception 'El nombre «%» es demasiado largo.', left(v_nombre, 20) using errcode = 'P0001'; end if;
    v_edad := p_edades[i];
    if v_edad is not null and (v_edad < 0 or v_edad > 120) then raise exception 'Revisa la edad de %.', v_nombre using errcode = 'P0001'; end if;
    v_validos := v_validos + 1;
    insert into public.inscritos_operativo as io (tenant_id, operativo_id, nombre, telefono, edad, estado, origen, sector, creado_por)
    values (s.tenant_id, p_operativo, v_nombre, s.telefono, v_edad, 'inscrito', 'whatsapp', s.lugar, auth.uid())
    on conflict (operativo_id, telefono, nombre_clave) do update set estado = 'inscrito', llego = false, edad = coalesce(excluded.edad, io.edad)
      where io.estado = 'cancelado';
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  if v_validos = 0 then raise exception 'Escribe el nombre de la persona.' using errcode = 'P0001'; end if;

  update public.whatsapp_sugerencias set estado = 'aprobada', operativo_id = p_operativo,
    nombre = regexp_replace(btrim(p_nombres[1]), '\s+', ' ', 'g'), resuelto_por = auth.uid(), resuelto_en = now(), actualizado_en = now()
  where id = s.id;
  -- Otras sugerencias pendientes del mismo teléfono para ese operativo quedan resueltas.
  update public.whatsapp_sugerencias set estado = 'reemplazada', actualizado_en = now()
  where tenant_id = s.tenant_id and telefono = s.telefono and estado = 'pendiente' and id <> s.id
    and (operativo_id = p_operativo or operativo_id is null);
  return v_total;
end;
$$;
revoke all on function public.aprobar_sugerencia_whatsapp(uuid, uuid, text[], integer[]) from public, anon;
grant execute on function public.aprobar_sugerencia_whatsapp(uuid, uuid, text[], integer[]) to authenticated;
