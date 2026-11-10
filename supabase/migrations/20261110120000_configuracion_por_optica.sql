-- Versión comercial: lo particular de cada óptica vive en su configuración,
-- no en el código ni en el nombre comercial.
--
-- Óptica Global conserva exactamente sus valores actuales (se copian a su
-- fila por id, una sola vez). Las ópticas nuevas parten en blanco: sin
-- precios, laboratorio, porcentajes ni personas heredadas.

-- ---------------------------------------------------------------------
-- 1. Configuración del negocio
-- ---------------------------------------------------------------------
create table public.configuracion_optica (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- Consulta / receta cobrada aparte. null = la óptica no la cobra.
  precio_consulta bigint check (precio_consulta >= 0),
  -- Qué pasa con la consulta si el paciente compra lentes:
  --   ninguno: se cobra igual · total: va incluida (no se cobra)
  --   monto: se descuenta consulta_descuento_monto del lente.
  consulta_descuento text not null default 'ninguno' check (consulta_descuento in ('ninguno', 'total', 'monto')),
  consulta_descuento_monto bigint not null default 0 check (consulta_descuento_monto >= 0),
  -- Costo de reponer un marco que no sale del inventario (descrito a mano,
  -- cortesía…). Se guarda en cada venta al momento de vender.
  costo_marco_por_par bigint not null default 0 check (costo_marco_por_par >= 0),
  -- Recargo por marco premium en el punto de venta. null = sin opción premium.
  precio_marco_premium bigint check (precio_marco_premium >= 0),
  -- Abono mínimo fijo por tipo de lente, p. ej. {"Monofocal": 10000}.
  abono_minimo_por_tipo jsonb not null default '{}'::jsonb check (jsonb_typeof(abono_minimo_por_tipo) = 'object'),
  -- Usar la lista de laboratorio compartida (lab_precios_*). Solo la óptica
  -- que la cargó la usa; las nuevas cotizan con sus propias tarifas.
  usa_catalogo_compartido boolean not null default false,
  -- Reparto de la utilidad de un operativo. null = la óptica no reparte
  -- desde Lentia. Forma: {"vendedora": {"clave","nombre"},
  --   "ahorro": {"clave","nombre"}, "socios": [{"clave","nombre","pct"}]}
  -- Los porcentajes de comisión y ahorro siguen guardados en cada
  -- operativo, para no recalcular repartos ya hechos.
  reparto jsonb check (reparto is null or jsonb_typeof(reparto) = 'object'),
  actualizado_en timestamptz not null default now()
);

alter table public.configuracion_optica enable row level security;
revoke all on public.configuracion_optica from public, anon, authenticated;
grant select, update on public.configuracion_optica to authenticated;
grant all on public.configuracion_optica to service_role;

create policy configuracion_lectura on public.configuracion_optica
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()));
create policy configuracion_edicion on public.configuracion_optica
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

-- Toda óptica existente parte neutra…
insert into public.configuracion_optica (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

-- …y Óptica Global recibe exactamente lo que hoy está fijo en el código
-- (consulta.ts, costo-venta.ts, pos.tsx, sueldos.ts).
update public.configuracion_optica set
  precio_consulta = 5000,
  consulta_descuento = 'total',
  costo_marco_por_par = 5000,
  precio_marco_premium = 10000,
  abono_minimo_por_tipo = '{"Monofocal": 10000, "Bifocal": 40000, "Multifocal": 80000}'::jsonb,
  usa_catalogo_compartido = true,
  reparto = '{
    "vendedora": {"clave": "isadora", "nombre": "Isadora"},
    "ahorro": {"clave": "ahorro", "nombre": "Ahorro del negocio"},
    "socios": [
      {"clave": "madre", "nombre": "Mamá", "pct": 50},
      {"clave": "pablo", "nombre": "Pablo", "pct": 50}
    ]
  }'::jsonb
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a';

-- Las ópticas nuevas reciben su fila vacía al crearse.
create function public.crear_configuracion_optica() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.configuracion_optica (tenant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.crear_configuracion_optica() from public, anon, authenticated;
create trigger tenants_configuracion after insert on public.tenants
  for each row execute function public.crear_configuracion_optica();

-- ---------------------------------------------------------------------
-- 2. Personas del reparto: ya no solo isadora/madre/pablo/ahorro
-- ---------------------------------------------------------------------
-- La clave sale de la configuración de cada óptica. Los registros de
-- Óptica Global siguen siendo válidos tal cual.
alter table public.retiros_sueldo drop constraint retiros_sueldo_persona_check;
alter table public.retiros_sueldo add constraint retiros_sueldo_persona_check
  check (persona ~ '^[a-z0-9_]{1,40}$');

-- ---------------------------------------------------------------------
-- 3. Costo de marco guardado en cada venta (historial intacto)
-- ---------------------------------------------------------------------
-- Antes el costo de marco se aplicaba al leer, con una constante. Ahora
-- queda guardado al vender. Las ventas antiguas quedan en null y se leen
-- con el valor de su óptica, que para Óptica Global es el mismo $5.000.
alter table public.venta_items add column costo_marco bigint check (costo_marco >= 0);

create function public.fijar_costo_marco() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cristal_slot is not null and new.costo_marco is null then
    select c.costo_marco_por_par into new.costo_marco
      from public.configuracion_optica c where c.tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.fijar_costo_marco() from public, anon, authenticated;
create trigger venta_items_costo_marco before insert on public.venta_items
  for each row execute function public.fijar_costo_marco();

-- ---------------------------------------------------------------------
-- 4. Tarifas de laboratorio propias de cada óptica
-- ---------------------------------------------------------------------
create table public.tarifas_laboratorio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.jwt_tenant_id() references public.tenants(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  tipo_lente text not null check (length(btrim(tipo_lente)) between 1 and 60),
  tratamiento text not null check (length(btrim(tratamiento)) between 1 and 80),
  -- null = vale para cualquier rango de receta.
  rango_receta text check (rango_receta is null or length(rango_receta) <= 40),
  costo bigint not null check (costo >= 0),
  -- La lista del laboratorio cobra por cristal (unidad) o por par.
  unidad text not null check (unidad in ('unidad', 'par')),
  -- Montaje: incluido en el costo, cobrado aparte (montaje_costo) o no aplica.
  montaje text not null default 'incluido' check (montaje in ('incluido', 'aparte', 'no_aplica')),
  montaje_costo bigint not null default 0 check (montaje_costo >= 0),
  -- IVA: el costo ya lo incluye, o hay que sumarlo.
  iva text not null default 'incluido' check (iva in ('incluido', 'mas_iva')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index tarifas_laboratorio_unica on public.tarifas_laboratorio
  (tenant_id, proveedor_id, lower(tipo_lente), lower(tratamiento), coalesce(rango_receta, '')) where activo;
create trigger trg_tenant_tarifas before insert or update on public.tarifas_laboratorio
  for each row execute function public.verificar_mismo_tenant('proveedor_id', 'proveedores');

alter table public.tarifas_laboratorio enable row level security;
revoke all on public.tarifas_laboratorio from public, anon, authenticated;
grant select, insert, update, delete on public.tarifas_laboratorio to authenticated;
grant all on public.tarifas_laboratorio to service_role;
create policy tarifas_lectura on public.tarifas_laboratorio
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_ver_clinico()));
create policy tarifas_alta on public.tarifas_laboratorio
  for insert to authenticated with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));
create policy tarifas_edicion on public.tarifas_laboratorio
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));
create policy tarifas_borrado on public.tarifas_laboratorio
  for delete to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));

-- ---------------------------------------------------------------------
-- 5. Ópticas nuevas sin el catálogo de Óptica Global
-- ---------------------------------------------------------------------
-- crear_optica copiaba plantilla_costos_cristales (armada con la lista de
-- Fides) con precio = costo × 6. Una óptica nueva ahora parte sin
-- catálogo: carga sus propios precios. copiar_plantilla_costos sigue
-- existiendo solo si la óptica lo pide expresamente.
create or replace function public.crear_optica(p_nombre_comercial text, p_rut_empresa text default null, p_nombre_usuario text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere una sesión iniciada para registrar una óptica';
  end if;
  if exists (select 1 from public.users where id = v_uid) then
    raise exception 'Este usuario ya pertenece a una óptica';
  end if;
  if coalesce(trim(p_nombre_comercial), '') = '' then
    raise exception 'El nombre de la óptica es obligatorio';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.tenants (nombre_comercial, rut_empresa, plan, estado_suscripcion, agenda_paralela)
  values (trim(p_nombre_comercial), nullif(trim(p_rut_empresa), ''), 'trial', 'activa', true)
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, nombre, email, rol)
  values (v_uid, v_tenant_id, coalesce(nullif(trim(p_nombre_usuario), ''), v_email), v_email, 'admin');

  insert into public.sucursales (tenant_id, nombre) values (v_tenant_id, 'Casa Matriz');

  insert into public.suscripciones (tenant_id, plan, estado, fecha_renovacion)
  values (v_tenant_id, 'trial', 'trial', (now() at time zone 'America/Santiago')::date + 30);

  return v_tenant_id;
end;
$function$;

-- Las ópticas nuevas pueden tener operativos simultáneos: lo que no se
-- puede cruzar son las personas y los equipos (ver reservas).
alter table public.tenants alter column agenda_paralela set default true;
