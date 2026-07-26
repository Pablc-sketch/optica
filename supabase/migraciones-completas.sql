-- =============================================================
-- Esquema completo de la webapp de gestión de ópticas.
-- Generado uniendo las 9 migraciones en orden.
-- Pegar en Supabase → SQL Editor y ejecutar una sola vez.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 20260725000001_init_schema.sql
-- ─────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────
-- 20260725000002_dominio_optica.sql
-- ─────────────────────────────────────────────────────────────
-- Dominio completo de la óptica (spec sección 1), modelado con los datos
-- reales del SGO del usuario (Gestión_Óptica_P_P_v2.xlsm):
-- - Montos en CLP como bigint (el peso chileno no usa decimales).
-- - Matriz de costos de cristales: tipo de lente × rango de receta ×
--   tratamiento, con plantilla global cargada desde COSTOS_CRISTALES.
-- - factor_venta_cristales por tenant (el SGO usa costo × 6).
-- - Estados de OT y de pago según el flujo real de la óptica.

-- Helper para las policies: tenant del JWT (inyectado por el auth hook).
create or replace function public.jwt_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
$$;

alter table public.tenants
  add column factor_venta_cristales integer not null default 6;

create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  direccion text,
  created_at timestamptz not null default now()
);

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('laboratorio', 'armazones', 'otro')),
  created_at timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  categoria text not null check (categoria in ('armazon', 'cristal', 'lente_contacto', 'otro')),
  nombre text not null,
  sku text,
  marca text,
  modelo text,
  color text,
  costo bigint not null default 0,
  precio_venta bigint not null default 0,
  proveedor_id uuid references public.proveedores (id),
  created_at timestamptz not null default now()
);

create table public.inventario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sucursal_id uuid not null references public.sucursales (id),
  producto_id uuid not null references public.productos (id),
  stock_actual integer not null default 0,
  stock_minimo integer not null default 0,
  unique (sucursal_id, producto_id)
);

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  producto_id uuid not null references public.productos (id),
  sucursal_id uuid not null references public.sucursales (id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad integer not null,
  referencia text,
  fecha timestamptz not null default now()
);

-- Receta clínica. Valores ópticos con paso de 0.25 dioptrías; eje 0-180.
create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  profesional_id uuid references public.users (id),
  fecha date not null default current_date,
  od_esfera numeric(5,2),
  od_cilindro numeric(5,2),
  od_eje integer check (od_eje between 0 and 180),
  od_add numeric(4,2),
  oi_esfera numeric(5,2),
  oi_cilindro numeric(5,2),
  oi_eje integer check (oi_eje between 0 and 180),
  oi_add numeric(4,2),
  av_od text,
  av_oi text,
  dp numeric(4,1),
  altura numeric(4,1),
  tipo text not null default 'lejos' check (tipo in ('lejos', 'cerca', 'progresivo')),
  notas text,
  created_at timestamptz not null default now()
);

create index idx_recetas_paciente on public.recetas (paciente_id);

-- Matriz de costos de cristales por tenant (el corazón del SGO Excel:
-- hoja COSTOS_CRISTALES, "Costo Editable" por combinación).
create table public.costos_cristales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tipo_lente text not null,
  rango_receta text not null,
  tratamiento text not null,
  costo bigint not null default 0,
  unique (tenant_id, tipo_lente, rango_receta, tratamiento)
);

-- Plantilla global (sin tenant): los 150 valores reales del Excel del
-- usuario. Al hacer onboarding, cada óptica copia esta plantilla a su
-- propia matriz editable en costos_cristales.
create table public.plantilla_costos_cristales (
  tipo_lente text not null,
  rango_receta text not null,
  tratamiento text not null,
  costo bigint not null,
  primary key (tipo_lente, rango_receta, tratamiento)
);

create table public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  folio serial,
  paciente_id uuid not null references public.pacientes (id),
  receta_id uuid references public.recetas (id),
  sucursal_id uuid references public.sucursales (id),
  estado text not null default 'recepcion'
    check (estado in ('recepcion', 'laboratorio', 'montaje', 'listo', 'entregado')),
  armazon_producto_id uuid references public.productos (id),
  tipo_lente text,
  rango_receta text,
  tratamiento text,
  origen_cristal text check (origen_cristal in ('stock', 'laboratorio')),
  proveedor_lab_id uuid references public.proveedores (id),
  costo_laboratorio bigint not null default 0,
  fecha_ingreso timestamptz not null default now(),
  fecha_entrega_estimada date,
  fecha_entrega_real timestamptz,
  notas text
);

create index idx_ot_tenant_estado on public.ordenes_trabajo (tenant_id, estado);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  paciente_id uuid references public.pacientes (id),
  sucursal_id uuid references public.sucursales (id),
  vendedor_id uuid references public.users (id),
  fecha timestamptz not null default now(),
  total bigint not null default 0,
  estado_pago text not null default 'pendiente'
    check (estado_pago in ('pendiente', 'abono_parcial', 'pagada'))
);

create table public.venta_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  venta_id uuid not null references public.ventas (id) on delete cascade,
  producto_id uuid references public.productos (id),
  ot_id uuid references public.ordenes_trabajo (id),
  descripcion text not null,
  cantidad integer not null default 1,
  precio_unitario bigint not null,
  descuento bigint not null default 0,
  check (producto_id is not null or ot_id is not null or descripcion is not null)
);

create table public.pagos_abonos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  venta_id uuid not null references public.ventas (id) on delete cascade,
  monto bigint not null check (monto > 0),
  medio_pago text not null default 'efectivo'
    check (medio_pago in ('efectivo', 'debito', 'credito', 'transferencia', 'otro')),
  fecha timestamptz not null default now()
);

create table public.convenios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre_empresa text not null,
  condiciones text,
  created_at timestamptz not null default now()
);

-- Operativos en terreno (diferenciador, spec sección 1): costeo del SGO
-- con bono por conductor cuando se usa vehículo propio.
create table public.operativos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  convenio_id uuid references public.convenios (id),
  fecha date not null,
  ubicacion text,
  tecnologo_id uuid references public.users (id),
  pacientes_atendidos integer not null default 0,
  ingreso_total bigint not null default 0,
  costo_laboratorio_total bigint not null default 0,
  bono_conductor bigint not null default 0,
  vehiculo_propio boolean not null default false,
  notas text
);

-- ---------------------------------------------------------------------------
-- RLS: mismo patrón que la migración inicial, en todas las tablas de dominio.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sucursales', 'proveedores', 'productos', 'inventario',
    'movimientos_inventario', 'recetas', 'costos_cristales',
    'ordenes_trabajo', 'ventas', 'venta_items', 'pagos_abonos',
    'convenios', 'operativos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%s: aislamiento por tenant" on public.%I for all to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id()) '
      || 'with check (tenant_id = public.jwt_tenant_id())',
      t, t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- La plantilla global es de solo lectura para cualquier usuario autenticado.
alter table public.plantilla_costos_cristales enable row level security;
create policy "plantilla: lectura global"
  on public.plantilla_costos_cristales for select to authenticated using (true);
grant select on public.plantilla_costos_cristales to authenticated;
grant all on public.plantilla_costos_cristales to service_role;

-- Copia la plantilla a la matriz editable del tenant del usuario que llama
-- (onboarding). El tenant destino sale SIEMPRE del JWT, nunca de un
-- parámetro — mismo principio que el resto del aislamiento (spec 8.1).
create or replace function public.copiar_plantilla_costos()
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.costos_cristales (tenant_id, tipo_lente, rango_receta, tratamiento, costo)
    select public.jwt_tenant_id(), tipo_lente, rango_receta, tratamiento, costo
    from public.plantilla_costos_cristales
    where public.jwt_tenant_id() is not null
    on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing
    returning 1
  )
  select count(*)::integer from ins
$$;

revoke execute on function public.copiar_plantilla_costos from public, anon;
grant execute on function public.copiar_plantilla_costos to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 20260725000003_plantilla_costos.sql
-- ─────────────────────────────────────────────────────────────
-- Plantilla de costos de cristales en CLP.
-- Generado automaticamente desde la hoja COSTOS_CRISTALES de
-- Gestión_Óptica_P_P_v2.xlsm (el SGO real del usuario) el 2026-07-25.
-- 150 combinaciones: tipo de lente x rango de receta x tratamiento.

insert into public.plantilla_costos_cristales (tipo_lente, rango_receta, tratamiento, costo) values
  ('Monofocal', '±2.00 / ±2.00', 'Orgánico Antirreflejo', 2740),
  ('Monofocal', '±2.00 / ±2.00', 'Orgánico Filtro Azul', 6260),
  ('Monofocal', '±2.00 / ±2.00', 'Policarbonato Filtro Azul', 12000),
  ('Monofocal', '±2.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 9500),
  ('Monofocal', '±2.00 / ±2.00', 'Fotocromático Café Antirreflejo', 8280),
  ('Monofocal', '±2.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Monofocal', '±2.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Monofocal', '±2.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Monofocal', '±2.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Monofocal', '±2.00 / ±2.00', 'Polarizado Gris Oscuro', 20500),
  ('Monofocal', '±4.00 / ±2.00', 'Orgánico Antirreflejo', 2740),
  ('Monofocal', '±4.00 / ±2.00', 'Orgánico Filtro Azul', 6260),
  ('Monofocal', '±4.00 / ±2.00', 'Policarbonato Filtro Azul', 12000),
  ('Monofocal', '±4.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 9500),
  ('Monofocal', '±4.00 / ±2.00', 'Fotocromático Café Antirreflejo', 8280),
  ('Monofocal', '±4.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Monofocal', '±4.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Monofocal', '±4.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Monofocal', '±4.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Monofocal', '±4.00 / ±2.00', 'Polarizado Gris Oscuro', 20500),
  ('Monofocal', '±4.00 / ±4.00', 'Orgánico Antirreflejo', 5480),
  ('Monofocal', '±4.00 / ±4.00', 'Orgánico Filtro Azul', 10040),
  ('Monofocal', '±4.00 / ±4.00', 'Policarbonato Filtro Azul', 20000),
  ('Monofocal', '±4.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 32500),
  ('Monofocal', '±4.00 / ±4.00', 'Fotocromático Café Antirreflejo', 14080),
  ('Monofocal', '±4.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Monofocal', '±4.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Monofocal', '±4.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Monofocal', '±4.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Monofocal', '±4.00 / ±4.00', 'Polarizado Gris Oscuro', 20500),
  ('Monofocal', '±6.00 / ±4.00', 'Orgánico Antirreflejo', 5880),
  ('Monofocal', '±6.00 / ±4.00', 'Orgánico Filtro Azul', 10080),
  ('Monofocal', '±6.00 / ±4.00', 'Policarbonato Filtro Azul', 31000),
  ('Monofocal', '±6.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 32500),
  ('Monofocal', '±6.00 / ±4.00', 'Fotocromático Café Antirreflejo', 27500),
  ('Monofocal', '±6.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Monofocal', '±6.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Monofocal', '±6.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Monofocal', '±6.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Monofocal', '±6.00 / ±4.00', 'Polarizado Gris Oscuro', 20500),
  ('Monofocal', '±6.00 / ±6.00', 'Orgánico Antirreflejo', 6680),
  ('Monofocal', '±6.00 / ±6.00', 'Orgánico Filtro Azul', 17900),
  ('Monofocal', '±6.00 / ±6.00', 'Policarbonato Filtro Azul', 35000),
  ('Monofocal', '±6.00 / ±6.00', 'Fotocromático Gris Filtro Azul', 36500),
  ('Monofocal', '±6.00 / ±6.00', 'Fotocromático Café Antirreflejo', 31500),
  ('Monofocal', '±6.00 / ±6.00', 'Bifocal Antirreflejo', 31000),
  ('Monofocal', '±6.00 / ±6.00', 'Bifocal Filtro Azul', 45000),
  ('Monofocal', '±6.00 / ±6.00', 'Multifocal Antirreflejo', 43000),
  ('Monofocal', '±6.00 / ±6.00', 'Multifocal Filtro Azul', 60000),
  ('Monofocal', '±6.00 / ±6.00', 'Polarizado Gris Oscuro', 24500),
  ('Bifocal', '±2.00 / ±2.00', 'Orgánico Antirreflejo', 27000),
  ('Bifocal', '±2.00 / ±2.00', 'Orgánico Filtro Azul', 41000),
  ('Bifocal', '±2.00 / ±2.00', 'Policarbonato Filtro Azul', 39000),
  ('Bifocal', '±2.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 59000),
  ('Bifocal', '±2.00 / ±2.00', 'Fotocromático Café Antirreflejo', 52000),
  ('Bifocal', '±2.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Bifocal', '±2.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Bifocal', '±2.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Bifocal', '±2.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Bifocal', '±2.00 / ±2.00', 'Polarizado Gris Oscuro', 59000),
  ('Bifocal', '±4.00 / ±2.00', 'Orgánico Antirreflejo', 27000),
  ('Bifocal', '±4.00 / ±2.00', 'Orgánico Filtro Azul', 41000),
  ('Bifocal', '±4.00 / ±2.00', 'Policarbonato Filtro Azul', 39000),
  ('Bifocal', '±4.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 59000),
  ('Bifocal', '±4.00 / ±2.00', 'Fotocromático Café Antirreflejo', 52000),
  ('Bifocal', '±4.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Bifocal', '±4.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Bifocal', '±4.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Bifocal', '±4.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Bifocal', '±4.00 / ±2.00', 'Polarizado Gris Oscuro', 59000),
  ('Bifocal', '±4.00 / ±4.00', 'Orgánico Antirreflejo', 27000),
  ('Bifocal', '±4.00 / ±4.00', 'Orgánico Filtro Azul', 41000),
  ('Bifocal', '±4.00 / ±4.00', 'Policarbonato Filtro Azul', 39000),
  ('Bifocal', '±4.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 59000),
  ('Bifocal', '±4.00 / ±4.00', 'Fotocromático Café Antirreflejo', 52000),
  ('Bifocal', '±4.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Bifocal', '±4.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Bifocal', '±4.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Bifocal', '±4.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Bifocal', '±4.00 / ±4.00', 'Polarizado Gris Oscuro', 59000),
  ('Bifocal', '±6.00 / ±4.00', 'Orgánico Antirreflejo', 27000),
  ('Bifocal', '±6.00 / ±4.00', 'Orgánico Filtro Azul', 41000),
  ('Bifocal', '±6.00 / ±4.00', 'Policarbonato Filtro Azul', 39000),
  ('Bifocal', '±6.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 59000),
  ('Bifocal', '±6.00 / ±4.00', 'Fotocromático Café Antirreflejo', 52000),
  ('Bifocal', '±6.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Bifocal', '±6.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Bifocal', '±6.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Bifocal', '±6.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Bifocal', '±6.00 / ±4.00', 'Polarizado Gris Oscuro', 59000),
  ('Bifocal', '±6.00 / ±6.00', 'Orgánico Antirreflejo', 31000),
  ('Bifocal', '±6.00 / ±6.00', 'Orgánico Filtro Azul', 45000),
  ('Bifocal', '±6.00 / ±6.00', 'Policarbonato Filtro Azul', 43000),
  ('Bifocal', '±6.00 / ±6.00', 'Fotocromático Gris Filtro Azul', 63000),
  ('Bifocal', '±6.00 / ±6.00', 'Fotocromático Café Antirreflejo', 56000),
  ('Bifocal', '±6.00 / ±6.00', 'Bifocal Antirreflejo', 31000),
  ('Bifocal', '±6.00 / ±6.00', 'Bifocal Filtro Azul', 45000),
  ('Bifocal', '±6.00 / ±6.00', 'Multifocal Antirreflejo', 43000),
  ('Bifocal', '±6.00 / ±6.00', 'Multifocal Filtro Azul', 60000),
  ('Bifocal', '±6.00 / ±6.00', 'Polarizado Gris Oscuro', 63000),
  ('Multifocal', '±2.00 / ±2.00', 'Orgánico Antirreflejo', 39000),
  ('Multifocal', '±2.00 / ±2.00', 'Orgánico Filtro Azul', 56000),
  ('Multifocal', '±2.00 / ±2.00', 'Policarbonato Filtro Azul', 51000),
  ('Multifocal', '±2.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 62000),
  ('Multifocal', '±2.00 / ±2.00', 'Fotocromático Café Antirreflejo', 58000),
  ('Multifocal', '±2.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Multifocal', '±2.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Multifocal', '±2.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Multifocal', '±2.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Multifocal', '±2.00 / ±2.00', 'Polarizado Gris Oscuro', 66000),
  ('Multifocal', '±4.00 / ±2.00', 'Orgánico Antirreflejo', 39000),
  ('Multifocal', '±4.00 / ±2.00', 'Orgánico Filtro Azul', 56000),
  ('Multifocal', '±4.00 / ±2.00', 'Policarbonato Filtro Azul', 51000),
  ('Multifocal', '±4.00 / ±2.00', 'Fotocromático Gris Filtro Azul', 62000),
  ('Multifocal', '±4.00 / ±2.00', 'Fotocromático Café Antirreflejo', 58000),
  ('Multifocal', '±4.00 / ±2.00', 'Bifocal Antirreflejo', 27000),
  ('Multifocal', '±4.00 / ±2.00', 'Bifocal Filtro Azul', 41000),
  ('Multifocal', '±4.00 / ±2.00', 'Multifocal Antirreflejo', 39000),
  ('Multifocal', '±4.00 / ±2.00', 'Multifocal Filtro Azul', 56000),
  ('Multifocal', '±4.00 / ±2.00', 'Polarizado Gris Oscuro', 66000),
  ('Multifocal', '±4.00 / ±4.00', 'Orgánico Antirreflejo', 39000),
  ('Multifocal', '±4.00 / ±4.00', 'Orgánico Filtro Azul', 56000),
  ('Multifocal', '±4.00 / ±4.00', 'Policarbonato Filtro Azul', 51000),
  ('Multifocal', '±4.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 62000),
  ('Multifocal', '±4.00 / ±4.00', 'Fotocromático Café Antirreflejo', 58000),
  ('Multifocal', '±4.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Multifocal', '±4.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Multifocal', '±4.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Multifocal', '±4.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Multifocal', '±4.00 / ±4.00', 'Polarizado Gris Oscuro', 66000),
  ('Multifocal', '±6.00 / ±4.00', 'Orgánico Antirreflejo', 39000),
  ('Multifocal', '±6.00 / ±4.00', 'Orgánico Filtro Azul', 56000),
  ('Multifocal', '±6.00 / ±4.00', 'Policarbonato Filtro Azul', 51000),
  ('Multifocal', '±6.00 / ±4.00', 'Fotocromático Gris Filtro Azul', 62000),
  ('Multifocal', '±6.00 / ±4.00', 'Fotocromático Café Antirreflejo', 58000),
  ('Multifocal', '±6.00 / ±4.00', 'Bifocal Antirreflejo', 27000),
  ('Multifocal', '±6.00 / ±4.00', 'Bifocal Filtro Azul', 41000),
  ('Multifocal', '±6.00 / ±4.00', 'Multifocal Antirreflejo', 39000),
  ('Multifocal', '±6.00 / ±4.00', 'Multifocal Filtro Azul', 56000),
  ('Multifocal', '±6.00 / ±4.00', 'Polarizado Gris Oscuro', 66000),
  ('Multifocal', '±6.00 / ±6.00', 'Orgánico Antirreflejo', 43000),
  ('Multifocal', '±6.00 / ±6.00', 'Orgánico Filtro Azul', 60000),
  ('Multifocal', '±6.00 / ±6.00', 'Policarbonato Filtro Azul', 55000),
  ('Multifocal', '±6.00 / ±6.00', 'Fotocromático Gris Filtro Azul', 66000),
  ('Multifocal', '±6.00 / ±6.00', 'Fotocromático Café Antirreflejo', 62000),
  ('Multifocal', '±6.00 / ±6.00', 'Bifocal Antirreflejo', 31000),
  ('Multifocal', '±6.00 / ±6.00', 'Bifocal Filtro Azul', 45000),
  ('Multifocal', '±6.00 / ±6.00', 'Multifocal Antirreflejo', 43000),
  ('Multifocal', '±6.00 / ±6.00', 'Multifocal Filtro Azul', 60000),
  ('Multifocal', '±6.00 / ±6.00', 'Polarizado Gris Oscuro', 70000)
on conflict (tipo_lente, rango_receta, tratamiento) do update set costo = excluded.costo;


-- ─────────────────────────────────────────────────────────────
-- 20260725000004_offline_sync.sql
-- ─────────────────────────────────────────────────────────────
-- Soporte offline (spec 8.2): los flujos de terreno (receta, OT, venta)
-- se capturan localmente y sincronizan al volver la señal.
--
-- Diseño:
-- 1. El cliente genera los UUID de las filas al capturar offline y las
--    encola en un outbox local. Al reconectar llama a
--    sync_aplicar_cambios(), que es SECURITY INVOKER: corre con el JWT
--    del usuario, así que TODA la sincronización pasa por las mismas
--    policies de RLS (el aislamiento por tenant no se puede saltar).
-- 2. Inserts idempotentes (on conflict do nothing): reintentar un lote
--    tras un corte a mitad de sync no duplica filas.
-- 3. Updates con concurrencia optimista: el cliente manda el updated_at
--    que vio (base_updated_at). Si el servidor tiene otro, el cambio NO
--    se aplica y vuelve como conflicto con la fila actual del servidor
--    — nadie pisa datos ajenos en silencio (spec 8.2).
-- 4. El stock deja de escribirse a mano: un trigger aplica cada
--    movimiento de inventario, así el mismo camino sirve online y offline.

-- updated_at para concurrencia optimista en las tablas editables offline
alter table public.pacientes add column updated_at timestamptz not null default now();
alter table public.ordenes_trabajo add column updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_pacientes
  before update on public.pacientes
  for each row execute function public.touch_updated_at();

create trigger trg_touch_ordenes_trabajo
  before update on public.ordenes_trabajo
  for each row execute function public.touch_updated_at();

-- El stock se deriva de los movimientos (entrada suma, salida resta,
-- ajuste aplica el delta tal cual).
create or replace function public.aplicar_movimiento_inventario()
returns trigger
language plpgsql
as $$
begin
  update public.inventario
     set stock_actual = stock_actual
       + case new.tipo
           when 'entrada' then new.cantidad
           when 'salida' then -new.cantidad
           else new.cantidad
         end
   where producto_id = new.producto_id
     and sucursal_id = new.sucursal_id;
  return new;
end;
$$;

create trigger trg_movimiento_stock
  after insert on public.movimientos_inventario
  for each row execute function public.aplicar_movimiento_inventario();

-- Cada cambio del lote: { tabla, op: 'insert'|'update', id, datos,
-- base_updated_at? }. Devuelve { aplicados, conflictos, errores }.
create or replace function public.sync_aplicar_cambios(p_cambios jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  cambio jsonb;
  v_tabla text;
  v_op text;
  v_id uuid;
  v_datos jsonb;
  v_base timestamptz;
  v_actual timestamptz;
  v_srv jsonb;
  aplicados jsonb := '[]'::jsonb;
  conflictos jsonb := '[]'::jsonb;
  errores jsonb := '[]'::jsonb;
begin
  for cambio in select * from jsonb_array_elements(coalesce(p_cambios, '[]'::jsonb))
  loop
    begin
      v_tabla := cambio ->> 'tabla';
      v_op := cambio ->> 'op';
      v_id := (cambio ->> 'id')::uuid;
      v_datos := cambio -> 'datos';
      v_base := (cambio ->> 'base_updated_at')::timestamptz;

      if v_op = 'insert' then
        case v_tabla
          when 'pacientes' then
            insert into public.pacientes (id, tenant_id, nombre, rut, telefono, email, fecha_nacimiento, notas, created_at)
            select v_id, (v_datos ->> 'tenant_id')::uuid, v_datos ->> 'nombre', v_datos ->> 'rut',
                   v_datos ->> 'telefono', v_datos ->> 'email', (v_datos ->> 'fecha_nacimiento')::date,
                   v_datos ->> 'notas', coalesce((v_datos ->> 'created_at')::timestamptz, now())
            on conflict (id) do nothing;

          when 'recetas' then
            insert into public.recetas (id, tenant_id, paciente_id, profesional_id, fecha,
              od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add,
              av_od, av_oi, dp, altura, tipo, notas, created_at)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'paciente_id')::uuid,
                   (v_datos ->> 'profesional_id')::uuid, coalesce((v_datos ->> 'fecha')::date, current_date),
                   (v_datos ->> 'od_esfera')::numeric, (v_datos ->> 'od_cilindro')::numeric,
                   (v_datos ->> 'od_eje')::integer, (v_datos ->> 'od_add')::numeric,
                   (v_datos ->> 'oi_esfera')::numeric, (v_datos ->> 'oi_cilindro')::numeric,
                   (v_datos ->> 'oi_eje')::integer, (v_datos ->> 'oi_add')::numeric,
                   v_datos ->> 'av_od', v_datos ->> 'av_oi', (v_datos ->> 'dp')::numeric,
                   (v_datos ->> 'altura')::numeric, coalesce(v_datos ->> 'tipo', 'lejos'),
                   v_datos ->> 'notas', coalesce((v_datos ->> 'created_at')::timestamptz, now())
            on conflict (id) do nothing;

          when 'ordenes_trabajo' then
            insert into public.ordenes_trabajo (id, tenant_id, paciente_id, receta_id, sucursal_id,
              estado, armazon_producto_id, tipo_lente, rango_receta, tratamiento, origen_cristal,
              proveedor_lab_id, costo_laboratorio, fecha_ingreso, fecha_entrega_estimada, notas)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'paciente_id')::uuid,
                   (v_datos ->> 'receta_id')::uuid, (v_datos ->> 'sucursal_id')::uuid,
                   coalesce(v_datos ->> 'estado', 'recepcion'), (v_datos ->> 'armazon_producto_id')::uuid,
                   v_datos ->> 'tipo_lente', v_datos ->> 'rango_receta', v_datos ->> 'tratamiento',
                   v_datos ->> 'origen_cristal', (v_datos ->> 'proveedor_lab_id')::uuid,
                   coalesce((v_datos ->> 'costo_laboratorio')::bigint, 0),
                   coalesce((v_datos ->> 'fecha_ingreso')::timestamptz, now()),
                   (v_datos ->> 'fecha_entrega_estimada')::date, v_datos ->> 'notas'
            on conflict (id) do nothing;

          when 'ventas' then
            insert into public.ventas (id, tenant_id, paciente_id, sucursal_id, vendedor_id, fecha, total, estado_pago)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'paciente_id')::uuid,
                   (v_datos ->> 'sucursal_id')::uuid, (v_datos ->> 'vendedor_id')::uuid,
                   coalesce((v_datos ->> 'fecha')::timestamptz, now()),
                   coalesce((v_datos ->> 'total')::bigint, 0),
                   coalesce(v_datos ->> 'estado_pago', 'pendiente')
            on conflict (id) do nothing;

          when 'venta_items' then
            insert into public.venta_items (id, tenant_id, venta_id, producto_id, ot_id, descripcion, cantidad, precio_unitario, descuento)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'venta_id')::uuid,
                   (v_datos ->> 'producto_id')::uuid, (v_datos ->> 'ot_id')::uuid,
                   v_datos ->> 'descripcion', coalesce((v_datos ->> 'cantidad')::integer, 1),
                   (v_datos ->> 'precio_unitario')::bigint, coalesce((v_datos ->> 'descuento')::bigint, 0)
            on conflict (id) do nothing;

          when 'pagos_abonos' then
            insert into public.pagos_abonos (id, tenant_id, venta_id, monto, medio_pago, fecha)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'venta_id')::uuid,
                   (v_datos ->> 'monto')::bigint, coalesce(v_datos ->> 'medio_pago', 'efectivo'),
                   coalesce((v_datos ->> 'fecha')::timestamptz, now())
            on conflict (id) do nothing;

          when 'movimientos_inventario' then
            insert into public.movimientos_inventario (id, tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia, fecha)
            select v_id, (v_datos ->> 'tenant_id')::uuid, (v_datos ->> 'producto_id')::uuid,
                   (v_datos ->> 'sucursal_id')::uuid, v_datos ->> 'tipo',
                   (v_datos ->> 'cantidad')::integer, v_datos ->> 'referencia',
                   coalesce((v_datos ->> 'fecha')::timestamptz, now())
            on conflict (id) do nothing;

          else
            raise exception 'tabla no permitida para sync: %', v_tabla;
        end case;
        aplicados := aplicados || to_jsonb(v_id::text);

      elsif v_op = 'update' and v_tabla = 'pacientes' then
        select p.updated_at, to_jsonb(p) into v_actual, v_srv from public.pacientes p where p.id = v_id;
        if not found then
          raise exception 'paciente % no existe o sin acceso', v_id;
        end if;
        if v_actual is distinct from v_base then
          conflictos := conflictos || jsonb_build_object('tabla', v_tabla, 'id', v_id, 'servidor', v_srv);
        else
          update public.pacientes set
            nombre = coalesce(v_datos ->> 'nombre', nombre),
            rut = coalesce(v_datos ->> 'rut', rut),
            telefono = coalesce(v_datos ->> 'telefono', telefono),
            email = coalesce(v_datos ->> 'email', email),
            fecha_nacimiento = coalesce((v_datos ->> 'fecha_nacimiento')::date, fecha_nacimiento),
            notas = coalesce(v_datos ->> 'notas', notas)
          where id = v_id;
          aplicados := aplicados || to_jsonb(v_id::text);
        end if;

      elsif v_op = 'update' and v_tabla = 'ordenes_trabajo' then
        select o.updated_at, to_jsonb(o) into v_actual, v_srv from public.ordenes_trabajo o where o.id = v_id;
        if not found then
          raise exception 'OT % no existe o sin acceso', v_id;
        end if;
        if v_actual is distinct from v_base then
          conflictos := conflictos || jsonb_build_object('tabla', v_tabla, 'id', v_id, 'servidor', v_srv);
        else
          update public.ordenes_trabajo set
            estado = coalesce(v_datos ->> 'estado', estado),
            fecha_entrega_estimada = coalesce((v_datos ->> 'fecha_entrega_estimada')::date, fecha_entrega_estimada),
            fecha_entrega_real = coalesce((v_datos ->> 'fecha_entrega_real')::timestamptz, fecha_entrega_real),
            costo_laboratorio = coalesce((v_datos ->> 'costo_laboratorio')::bigint, costo_laboratorio),
            notas = coalesce(v_datos ->> 'notas', notas)
          where id = v_id;
          aplicados := aplicados || to_jsonb(v_id::text);
        end if;

      else
        raise exception 'operación no soportada: % sobre %', v_op, v_tabla;
      end if;

    exception when others then
      errores := errores || jsonb_build_object(
        'tabla', v_tabla, 'id', cambio ->> 'id', 'error', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object('aplicados', aplicados, 'conflictos', conflictos, 'errores', errores);
end;
$$;

revoke execute on function public.sync_aplicar_cambios from public, anon;
grant execute on function public.sync_aplicar_cambios to authenticated, service_role;


-- ─────────────────────────────────────────────────────────────
-- 20260725000005_precio_venta_cristales.sql
-- ─────────────────────────────────────────────────────────────
-- El precio de VENTA de cada cristal es de la óptica y es editable,
-- independiente del costo de laboratorio. El factor del tenant solo se
-- usa para proponer un precio inicial (costo × factor); después la
-- óptica lo ajusta a gusto en la pantalla de Precios.

alter table public.costos_cristales
  add column precio_venta bigint not null default 0;

-- Precio inicial para las matrices ya existentes: costo × factor del tenant.
update public.costos_cristales cc
   set precio_venta = cc.costo * t.factor_venta_cristales
  from public.tenants t
 where t.id = cc.tenant_id;

-- El onboarding también propone el precio inicial con el factor.
create or replace function public.copiar_plantilla_costos()
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.costos_cristales (tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta)
    select public.jwt_tenant_id(), p.tipo_lente, p.rango_receta, p.tratamiento, p.costo,
           p.costo * coalesce(
             (select t.factor_venta_cristales from public.tenants t where t.id = public.jwt_tenant_id()),
             6
           )
    from public.plantilla_costos_cristales p
    where public.jwt_tenant_id() is not null
    on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing
    returning 1
  )
  select count(*)::integer from ins
$$;


-- ─────────────────────────────────────────────────────────────
-- 20260725000006_ficha_clinica_paciente.sql
-- ─────────────────────────────────────────────────────────────
-- Ficha clínica del paciente: antecedentes relevantes para la atención
-- óptica. La diabetes y la hipertensión cambian la conducta clínica
-- (retinopatía, variación refractiva), y el resto condiciona la
-- recomendación de cristales y el seguimiento.

alter table public.pacientes
  add column diabetes boolean not null default false,
  add column hipertension boolean not null default false,
  add column glaucoma boolean not null default false,
  add column cirugia_ocular boolean not null default false,
  add column usa_lentes_contacto boolean not null default false,
  add column alergias text,
  add column medicamentos text,
  add column ocupacion text,
  add column horas_pantalla text,
  add column antecedentes_otros text,
  add column ultima_visita date;

comment on column public.pacientes.horas_pantalla is
  'Exposición diaria a pantallas; orienta la recomendación de filtro azul.';


-- ─────────────────────────────────────────────────────────────
-- 20260725000007_onboarding_suscripciones.sql
-- ─────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────
-- 20260725000008_bloqueo_por_suscripcion.sql
-- ─────────────────────────────────────────────────────────────
-- Cobro con dientes: al vencer la suscripción, la base deja de aceptar
-- escrituras de esa óptica. Bloquearlo solo en la interfaz sería cosmético
-- (cualquiera podría seguir escribiendo llamando a la API directamente).
--
-- Las LECTURAS se mantienen: la óptica siempre puede consultar y exportar
-- sus datos aunque no haya pagado. Los datos son suyos; lo que se corta es
-- la operación diaria.

create or replace function public.suscripcion_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.estado in ('trial', 'activa') and s.fecha_renovacion >= current_date
      from public.suscripciones s
      where s.tenant_id = public.jwt_tenant_id()
    ),
    true -- sin registro de suscripción no bloqueamos: es dato faltante, no impago
  )
$$;

revoke execute on function public.suscripcion_vigente from public, anon;
grant execute on function public.suscripcion_vigente to authenticated, service_role;

-- Tablas de dominio: la policy única "FOR ALL" se reemplaza por lectura
-- libre (dentro del tenant) y escritura condicionada al pago.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sucursales', 'proveedores', 'productos', 'inventario',
    'movimientos_inventario', 'recetas', 'costos_cristales',
    'ordenes_trabajo', 'ventas', 'venta_items', 'pagos_abonos',
    'convenios', 'operativos'
  ] loop
    execute format('drop policy if exists "%s: aislamiento por tenant" on public.%I', t, t);

    execute format(
      'create policy "%s: lectura del propio tenant" on public.%I for select to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id())', t, t);

    execute format(
      'create policy "%s: alta con suscripción vigente" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);

    execute format(
      'create policy "%s: edición con suscripción vigente" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);

    execute format(
      'create policy "%s: borrado con suscripción vigente" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);
  end loop;
end $$;

-- pacientes trae sus policies por operación desde la migración inicial.
drop policy if exists "pacientes: insert solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: update solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: delete solo propio tenant" on public.pacientes;

create policy "pacientes: alta con suscripción vigente"
  on public.pacientes for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "pacientes: edición con suscripción vigente"
  on public.pacientes for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "pacientes: borrado con suscripción vigente"
  on public.pacientes for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());


-- ─────────────────────────────────────────────────────────────
-- 20260725000009_permisos_por_rol.sql
-- ─────────────────────────────────────────────────────────────
-- Permisos por rol (spec sección 2). Hasta ahora cualquier usuario con
-- sesión podía tocar todo dentro de su óptica: bastaba con que el
-- tenant_id coincidiera. Eso alcanza para una óptica de una persona, no
-- para una con vendedores y bodeguero.
--
-- Matriz de la spec:
--   admin    → todo
--   clinico  → pacientes y recetas (lectura/escritura); ventas e inventario solo lectura
--   ventas   → ventas e inventario (lectura/escritura); pacientes y recetas solo lectura
--   bodega   → inventario únicamente; sin acceso a fichas clínicas
--
-- Las fichas clínicas son datos sensibles de salud (Ley 21.719): que
-- bodega no pueda leerlas no es un detalle de comodidad, es el principio
-- de mínimo privilegio que exige la ley.

create or replace function public.jwt_rol()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'rol', '')
$$;

-- Puede ver fichas clínicas (pacientes, recetas): todos menos bodega.
create or replace function public.puede_ver_clinico()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'clinico', 'ventas')
$$;

-- Puede editar fichas clínicas: solo quien atiende.
create or replace function public.puede_editar_clinico()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'clinico') and public.suscripcion_vigente()
$$;

-- Puede editar ventas y cobranza.
create or replace function public.puede_editar_ventas()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'ventas') and public.suscripcion_vigente()
$$;

-- Puede editar inventario y productos.
create or replace function public.puede_editar_inventario()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'ventas', 'bodega') and public.suscripcion_vigente()
$$;

-- Solo el admin toca la configuración de la óptica.
create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() = 'admin' and public.suscripcion_vigente()
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'jwt_rol', 'puede_ver_clinico', 'puede_editar_clinico',
    'puede_editar_ventas', 'puede_editar_inventario', 'es_admin'
  ] loop
    execute format('revoke execute on function public.%I from public, anon', f);
    execute format('grant execute on function public.%I to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Fichas clínicas: pacientes y recetas
-- ---------------------------------------------------------------------------
drop policy if exists "pacientes: select solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: alta con suscripción vigente" on public.pacientes;
drop policy if exists "pacientes: edición con suscripción vigente" on public.pacientes;
drop policy if exists "pacientes: borrado con suscripción vigente" on public.pacientes;

create policy "pacientes: lectura clínica"
  on public.pacientes for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico());

create policy "pacientes: alta clínica"
  on public.pacientes for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "pacientes: edición clínica"
  on public.pacientes for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "pacientes: borrado clínico"
  on public.pacientes for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

drop policy if exists "recetas: lectura del propio tenant" on public.recetas;
drop policy if exists "recetas: alta con suscripción vigente" on public.recetas;
drop policy if exists "recetas: edición con suscripción vigente" on public.recetas;
drop policy if exists "recetas: borrado con suscripción vigente" on public.recetas;

create policy "recetas: lectura clínica"
  on public.recetas for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico());

create policy "recetas: alta clínica"
  on public.recetas for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "recetas: edición clínica"
  on public.recetas for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "recetas: borrado clínico"
  on public.recetas for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

-- ---------------------------------------------------------------------------
-- Ventas, cobranza y órdenes de trabajo
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'venta_items', 'pagos_abonos', 'ordenes_trabajo'] loop
    execute format('drop policy if exists "%s: lectura del propio tenant" on public.%I', t, t);
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    -- Bodega no necesita ver ventas ni el detalle clínico de las OTs.
    execute format(
      'create policy "%s: lectura comercial" on public.%I for select to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico())', t, t);

    execute format(
      'create policy "%s: alta comercial" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);

    execute format(
      'create policy "%s: edición comercial" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);

    execute format(
      'create policy "%s: borrado comercial" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);
  end loop;
end $$;

-- El clínico crea la OT al terminar la atención, aunque no venda.
create policy "ordenes_trabajo: alta clínica"
  on public.ordenes_trabajo for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "ordenes_trabajo: edición clínica"
  on public.ordenes_trabajo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

-- Bodega sí necesita mover las OTs por el taller (montaje, listo).
create policy "ordenes_trabajo: lectura de bodega"
  on public.ordenes_trabajo for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega');

create policy "ordenes_trabajo: avance de bodega"
  on public.ordenes_trabajo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega' and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega' and public.suscripcion_vigente());

-- ---------------------------------------------------------------------------
-- Inventario, productos y proveedores
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['inventario', 'movimientos_inventario', 'productos', 'proveedores'] loop
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    execute format(
      'create policy "%s: alta de inventario" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);

    execute format(
      'create policy "%s: edición de inventario" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);

    execute format(
      'create policy "%s: borrado de inventario" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Configuración de la óptica: solo admin
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sucursales', 'costos_cristales', 'convenios', 'operativos'] loop
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    execute format(
      'create policy "%s: alta de admin" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);

    execute format(
      'create policy "%s: edición de admin" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.es_admin()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);

    execute format(
      'create policy "%s: borrado de admin" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);
  end loop;
end $$;

-- El admin gestiona los usuarios de su óptica. No puede cambiar el
-- tenant_id (lo fija el with check) ni ascender a nadie a superadmin:
-- es_superadmin queda fuera del alcance de cualquier óptica.
create policy "users: alta de admin"
  on public.users for insert to authenticated
  with check (
    tenant_id = public.jwt_tenant_id() and public.es_admin() and es_superadmin = false
  );

create policy "users: edición de admin"
  on public.users for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.es_admin())
  with check (
    tenant_id = public.jwt_tenant_id() and public.es_admin() and es_superadmin = false
  );

grant insert, update on public.users to authenticated;
grant update on public.tenants to authenticated;

create policy "tenants: edición de admin"
  on public.tenants for update to authenticated
  using (id = public.jwt_tenant_id() and public.es_admin())
  with check (id = public.jwt_tenant_id() and public.es_admin());

