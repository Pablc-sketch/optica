-- Esquema base multi-tenant + aislamiento por RLS (spec sección 1 y 8.1)
--
-- Regla de seguridad central: tenant_id NUNCA se confía desde el cliente.
-- Viaja como custom claim dentro del JWT (inyectado server-side por el
-- Auth Hook `custom_access_token_hook` al iniciar sesión), y todas las
-- policies de RLS comparan contra ese claim, no contra ningún valor
-- enviado en el body/query/header de la request.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nombre_comercial text not null,
  rut_empresa text,
  plan text not null default 'trial',
  estado_suscripcion text not null default 'activa',
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  email text not null,
  rol text not null default 'ventas' check (rol in ('admin', 'clinico', 'ventas', 'bodega')),
  estado text not null default 'activo',
  created_at timestamptz not null default now()
);

create index idx_users_tenant on public.users (tenant_id);

-- Entidad mínima para validar aislamiento entre tenants (spec sección 8.4, test #1).
-- El resto de las tablas del modelo de datos (recetas, ordenes_trabajo, ventas, etc.)
-- se agregan en migraciones posteriores siguiendo exactamente este mismo patrón de RLS.
create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  rut text,
  telefono text,
  email text,
  fecha_nacimiento date,
  notas text,
  created_at timestamptz not null default now()
);

create index idx_pacientes_tenant on public.pacientes (tenant_id);

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.pacientes enable row level security;

-- Supabase moderno es "secure by default": las tablas nuevas no traen grants
-- de DML. Se otorgan explícitamente; RLS sigue filtrando por tenant encima.
grant select on public.tenants to authenticated;
grant select on public.users to authenticated;
grant select, insert, update, delete on public.pacientes to authenticated;
grant all on public.tenants, public.users, public.pacientes to service_role;

-- ---------------------------------------------------------------------------
-- Auth Hook: inyecta tenant_id y rol como custom claims en el JWT al login.
-- Esto es lo que le permite a las policies de abajo confiar en auth.jwt()
-- en vez de en cualquier dato que mande el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_tenant_id uuid;
  user_rol text;
begin
  select tenant_id, rol
  into user_tenant_id, user_rol
  from public.users
  where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if user_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
    claims := jsonb_set(claims, '{rol}', to_jsonb(user_rol));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.users to supabase_auth_admin;

create policy "auth admin lee tenant_id/rol para el hook"
  on public.users
  as permissive
  for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- Policies de aislamiento por tenant. `auth.jwt() ->> 'tenant_id'` viene del
-- hook de arriba, validado server-side; jamás de un parámetro del cliente.
-- ---------------------------------------------------------------------------
create policy "tenants: solo el propio tenant"
  on public.tenants
  for select
  to authenticated
  using (id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "users: solo usuarios del propio tenant"
  on public.users
  for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "pacientes: select solo propio tenant"
  on public.pacientes
  for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "pacientes: insert solo propio tenant"
  on public.pacientes
  for insert
  to authenticated
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "pacientes: update solo propio tenant"
  on public.pacientes
  for update
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "pacientes: delete solo propio tenant"
  on public.pacientes
  for delete
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
