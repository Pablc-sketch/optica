-- Onboarding de ópticas nuevas + suscripciones (spec secciones 1 y 3,
-- pantallas 1 y 12; roadmap etapa 3).
--
-- El registro no puede ser un insert directo desde el cliente: cuando un
-- usuario recién creado llama, su JWT todavía no tiene tenant_id (el hook
-- lo inyecta leyendo public.users, que aún no existe para él), así que RLS
-- lo bloquearía todo. Se resuelve con crear_optica(): SECURITY DEFINER,
-- que valida que quien llama esté autenticado y que NO pertenezca ya a una
-- óptica — sin esa validación cualquiera podría fabricarse ópticas o
-- reasignarse de tenant.

create table public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan text not null default 'trial',
  estado text not null default 'trial'
    check (estado in ('trial', 'activa', 'vencida', 'cancelada')),
  fecha_inicio date not null default current_date,
  fecha_renovacion date not null,
  medio_pago text,
  created_at timestamptz not null default now()
);

alter table public.suscripciones enable row level security;

-- La óptica ve su propia suscripción pero no puede modificarla: el estado
-- lo cambia el cobro (service role), nunca el cliente.
create policy "suscripciones: lectura del propio tenant"
  on public.suscripciones for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

grant select on public.suscripciones to authenticated;
grant all on public.suscripciones to service_role;

-- Superadmin: el equipo que vende el producto, no un rol de la óptica.
alter table public.users add column es_superadmin boolean not null default false;

-- Suscripción trial para las ópticas que ya existían antes de esta migración.
insert into public.suscripciones (tenant_id, plan, estado, fecha_renovacion)
select id, 'trial', 'trial', current_date + 30
from public.tenants
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- Registro de una óptica nueva. Lo llama el usuario recién creado en Auth.
-- ---------------------------------------------------------------------------
create or replace function public.crear_optica(
  p_nombre_comercial text,
  p_rut_empresa text default null,
  p_nombre_usuario text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere una sesión iniciada para registrar una óptica';
  end if;

  -- Un usuario pertenece a una sola óptica: sin esto, alguien podría
  -- llamar de nuevo y crearse ópticas indefinidamente.
  if exists (select 1 from public.users where id = v_uid) then
    raise exception 'Este usuario ya pertenece a una óptica';
  end if;

  if coalesce(trim(p_nombre_comercial), '') = '' then
    raise exception 'El nombre de la óptica es obligatorio';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.tenants (nombre_comercial, rut_empresa, plan, estado_suscripcion)
  values (trim(p_nombre_comercial), nullif(trim(p_rut_empresa), ''), 'trial', 'activa')
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, nombre, email, rol)
  values (v_uid, v_tenant_id, coalesce(nullif(trim(p_nombre_usuario), ''), v_email), v_email, 'admin');

  insert into public.sucursales (tenant_id, nombre)
  values (v_tenant_id, 'Casa Matriz');

  insert into public.suscripciones (tenant_id, plan, estado, fecha_renovacion)
  values (v_tenant_id, 'trial', 'trial', current_date + 30);

  -- Matriz de costos de laboratorio lista para editar, con precio de venta
  -- propuesto (costo × factor por defecto del tenant).
  insert into public.costos_cristales (tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta)
  select v_tenant_id, p.tipo_lente, p.rango_receta, p.tratamiento, p.costo, p.costo * 6
  from public.plantilla_costos_cristales p;

  return v_tenant_id;
end;
$$;

revoke execute on function public.crear_optica from public, anon;
grant execute on function public.crear_optica to authenticated;

-- ---------------------------------------------------------------------------
-- Panel superadmin: lista de ópticas cliente con su suscripción.
-- Valida contra public.users (fuente de verdad), no contra el JWT.
-- ---------------------------------------------------------------------------
create or replace function public.listar_opticas()
returns table (
  tenant_id uuid,
  nombre_comercial text,
  rut_empresa text,
  creada timestamptz,
  plan text,
  estado text,
  fecha_renovacion date,
  usuarios bigint,
  pacientes bigint,
  ventas bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.es_superadmin) then
    raise exception 'Solo el equipo de soporte puede ver el panel de ópticas';
  end if;

  return query
  select t.id, t.nombre_comercial, t.rut_empresa, t.created_at,
         s.plan, s.estado, s.fecha_renovacion,
         (select count(*) from public.users u2 where u2.tenant_id = t.id),
         (select count(*) from public.pacientes p where p.tenant_id = t.id),
         (select count(*) from public.ventas v where v.tenant_id = t.id)
  from public.tenants t
  left join public.suscripciones s on s.tenant_id = t.id
  order by t.created_at desc;
end;
$$;

revoke execute on function public.listar_opticas from public, anon;
grant execute on function public.listar_opticas to authenticated;

-- El hook del JWT ahora también expone si el usuario es del equipo de soporte.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_tenant_id uuid;
  user_rol text;
  user_super boolean;
begin
  select tenant_id, rol, es_superadmin
  into user_tenant_id, user_rol, user_super
  from public.users
  where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if user_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
    claims := jsonb_set(claims, '{rol}', to_jsonb(user_rol));
    claims := jsonb_set(claims, '{es_superadmin}', to_jsonb(coalesce(user_super, false)));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;
