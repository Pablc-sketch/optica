-- Operativo como concepto propio (examen en terreno: colegio, empresa,
-- junta de vecinos, etc.), separado de sucursales (que es solo para stock
-- físico). Ya existía una tabla public.operativos en la base, creada fuera
-- de las migraciones de este repo, vacía y sin uso en el código de la app
-- — se reemplaza por este diseño sin pérdida de datos.
drop table if exists public.operativos cascade;

create table public.operativos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  tipo_venue text check (tipo_venue in
    ('condominio', 'junta_vecinos', 'apr', 'colegio', 'sala_cuna', 'supermercado', 'otro')),
  fecha date not null,
  direccion text,
  contacto_nombre text,
  contacto_telefono text,
  estado text not null default 'planificado'
    check (estado in ('planificado', 'realizado', 'cancelado')),
  notas text,
  created_at timestamptz not null default now()
);

alter table public.operativos enable row level security;

-- Mismo patrón de aislamiento por tenant que sucursales/pacientes: lectura
-- libre dentro del tenant, escritura condicionada a suscripción vigente
-- (ver 20260725000008_bloqueo_por_suscripcion.sql).
create policy "operativos: lectura del propio tenant"
  on public.operativos for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "operativos: alta con suscripción vigente"
  on public.operativos for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "operativos: edición con suscripción vigente"
  on public.operativos for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "operativos: borrado con suscripción vigente"
  on public.operativos for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

grant select, insert, update, delete on public.operativos to authenticated;
grant all on public.operativos to service_role;

-- Cada venta / OT / receta puede quedar ligada al operativo donde se
-- originó, para reportes y seguimiento de exámenes sin compra.
alter table public.ventas add column if not exists operativo_id uuid references public.operativos (id);
alter table public.ordenes_trabajo add column if not exists operativo_id uuid references public.operativos (id);
alter table public.recetas add column if not exists operativo_id uuid references public.operativos (id);
