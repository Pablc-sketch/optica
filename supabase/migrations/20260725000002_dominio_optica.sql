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
