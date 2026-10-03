-- Seguridad de base: hallazgos A01, A02, A07 y A10 de la auditoría del
-- 2026-10-02 (commit 625999c).

-- ---------------------------------------------------------------------
-- A01. Un usuario desactivado conservaba todos sus permisos.
-- ---------------------------------------------------------------------
-- jwt_tenant_id() y jwt_rol() leen la tabla users en cada consulta (no el
-- token), así que filtrar por estado acá corta el acceso AL TIRO, aunque
-- la persona siga con un token emitido antes de desactivarla: todas las
-- políticas RLS de datos dependen de estas dos funciones.
create or replace function public.jwt_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid() and estado = 'activo'
$$;

create or replace function public.jwt_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol from public.users where id = auth.uid() and estado = 'activo'), '')
$$;

-- El token nuevo de un usuario inactivo ya no lleva óptica ni rol.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
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
   where id = (event ->> 'user_id')::uuid
     and estado = 'activo';

  claims := event -> 'claims';
  if user_tenant_id is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
    claims := jsonb_set(claims, '{rol}', to_jsonb(user_rol));
    claims := jsonb_set(claims, '{es_superadmin}', to_jsonb(coalesce(user_super, false)));
  else
    claims := claims - 'tenant_id' - 'rol' - 'es_superadmin';
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- users y tenants se filtraban por el tenant_id del TOKEN, que sigue vivo
-- hasta que vence. Pasan a la función, que mira el estado actual. Cada
-- persona puede seguir leyendo su propia fila: así la app sabe que la
-- cuenta está desactivada y lo puede decir, en vez de mostrar una pantalla
-- vacía.
drop policy if exists "users: solo usuarios del propio tenant" on public.users;
create policy "users: solo usuarios del propio tenant" on public.users
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id() or id = auth.uid());

drop policy if exists "tenants: solo el propio tenant" on public.tenants;
create policy "tenants: solo el propio tenant" on public.tenants
  for select to authenticated
  using (id = public.jwt_tenant_id());

-- Nunca puede quedar una óptica sin administrador activo — ni por un
-- formulario, ni por la API directa, ni por dos admins desactivándose al
-- mismo tiempo (el bloqueo de la fila del tenant los pone en fila).
create or replace function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quedan int;
begin
  if old.rol = 'admin' and old.estado = 'activo'
     and (tg_op = 'DELETE' or new.rol <> 'admin' or new.estado <> 'activo') then
    perform 1 from public.tenants where id = old.tenant_id for update;
    select count(*) into v_quedan
      from public.users
     where tenant_id = old.tenant_id and rol = 'admin' and estado = 'activo' and id <> old.id;
    if v_quedan = 0 then
      raise exception 'La óptica no puede quedar sin un administrador activo' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_proteger_ultimo_admin on public.users;
create trigger trg_proteger_ultimo_admin
  before update of rol, estado or delete on public.users
  for each row execute function public.proteger_ultimo_admin();

-- ---------------------------------------------------------------------
-- A02. Se podía enlazar una fila de una óptica con datos de otra.
-- ---------------------------------------------------------------------
-- Las FK validan que el ID exista, no que sea de la misma óptica, y RLS no
-- revisa el ID enlazado al insertar. Este trigger compara el tenant de
-- cada fila referenciada con el de la fila que se guarda. Argumentos:
-- pares (columna, tabla). SECURITY DEFINER para ver el tenant real de la
-- fila referenciada aunque RLS la oculte — que es justo el caso a atajar.
create or replace function public.verificar_mismo_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  v_col text;
  v_tabla text;
  v_id uuid;
  v_tenant uuid;
begin
  for i in 0 .. (tg_nargs / 2 - 1) loop
    v_col := tg_argv[i * 2];
    v_tabla := tg_argv[i * 2 + 1];
    execute format('select ($1).%I::uuid', v_col) using new into v_id;
    if v_id is not null then
      execute format('select tenant_id from public.%I where id = $1', v_tabla) using v_id into v_tenant;
      if v_tenant is distinct from new.tenant_id then
        raise exception '% (%) no pertenece a esta óptica', v_tabla, v_id using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.verificar_mismo_tenant() from public, anon, authenticated;

create trigger trg_tenant_ventas before insert or update on public.ventas
  for each row execute function public.verificar_mismo_tenant(
    'paciente_id', 'pacientes', 'sucursal_id', 'sucursales', 'vendedor_id', 'users', 'operativo_id', 'operativos');
create trigger trg_tenant_venta_items before insert or update on public.venta_items
  for each row execute function public.verificar_mismo_tenant(
    'venta_id', 'ventas', 'producto_id', 'productos', 'ot_id', 'ordenes_trabajo');
create trigger trg_tenant_pagos before insert or update on public.pagos_abonos
  for each row execute function public.verificar_mismo_tenant('venta_id', 'ventas');
create trigger trg_tenant_recetas before insert or update on public.recetas
  for each row execute function public.verificar_mismo_tenant(
    'paciente_id', 'pacientes', 'profesional_id', 'users', 'operativo_id', 'operativos');
create trigger trg_tenant_ot before insert or update on public.ordenes_trabajo
  for each row execute function public.verificar_mismo_tenant(
    'paciente_id', 'pacientes', 'receta_id', 'recetas', 'sucursal_id', 'sucursales',
    'armazon_producto_id', 'productos', 'armazon_producto_id_2', 'productos',
    'proveedor_lab_id', 'proveedores', 'operativo_id', 'operativos');
create trigger trg_tenant_inventario before insert or update on public.inventario
  for each row execute function public.verificar_mismo_tenant('producto_id', 'productos', 'sucursal_id', 'sucursales');
create trigger trg_tenant_movimientos before insert or update on public.movimientos_inventario
  for each row execute function public.verificar_mismo_tenant('producto_id', 'productos', 'sucursal_id', 'sucursales');
create trigger trg_tenant_productos before insert or update on public.productos
  for each row execute function public.verificar_mismo_tenant('proveedor_id', 'proveedores');
create trigger trg_tenant_contactos before insert or update on public.contactos_operativo
  for each row execute function public.verificar_mismo_tenant('operativo_id', 'operativos');
create trigger trg_tenant_retiros before insert or update on public.retiros_sueldo
  for each row execute function public.verificar_mismo_tenant('operativo_id', 'operativos');

-- La receta de una OT tiene que ser del mismo paciente de la OT.
create or replace function public.verificar_receta_de_ot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receta_id is not null and not exists (
    select 1 from public.recetas r where r.id = new.receta_id and r.paciente_id = new.paciente_id
  ) then
    raise exception 'La receta % no es del paciente de la orden', new.receta_id using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.verificar_receta_de_ot() from public, anon, authenticated;
create trigger trg_receta_de_ot before insert or update of receta_id, paciente_id on public.ordenes_trabajo
  for each row execute function public.verificar_receta_de_ot();

-- ---------------------------------------------------------------------
-- A07. La base aceptaba montos negativos y descuentos imposibles.
-- ---------------------------------------------------------------------
-- Se verificó antes de aplicar: ninguna fila existente viola estas reglas.
-- Los regalos (precio 0) y los ajustes negativos de inventario siguen
-- permitidos.
alter table public.ventas add constraint ventas_total_no_negativo check (total >= 0);
alter table public.venta_items
  add constraint venta_items_cantidad_positiva check (cantidad > 0),
  add constraint venta_items_precio_no_negativo check (precio_unitario >= 0),
  add constraint venta_items_descuento_valido check (descuento >= 0 and descuento <= cantidad * precio_unitario);
alter table public.pagos_abonos add constraint pagos_monto_positivo check (monto > 0);
alter table public.ordenes_trabajo
  add constraint ot_costo_no_negativo check (costo_laboratorio >= 0 and coalesce(costo_laboratorio_2, 0) >= 0);
alter table public.movimientos_inventario
  add constraint movimientos_cantidad_valida check (tipo = 'ajuste' or cantidad > 0);

-- Nunca se cobra más de lo que se debe: respaldo en la base de lo que ya
-- controla la app, para que tampoco se pueda por la API directa ni con dos
-- abonos simultáneos (el bloqueo de la venta los pone en fila).
create or replace function public.verificar_abono_no_excede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_pagado bigint;
begin
  select total into v_total from public.ventas where id = new.venta_id for update;
  select coalesce(sum(monto), 0) into v_pagado
    from public.pagos_abonos where venta_id = new.venta_id and id <> new.id;
  if v_pagado + new.monto > v_total then
    raise exception 'El abono (%) supera el saldo de la venta (%)', new.monto, v_total - v_pagado
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.verificar_abono_no_excede() from public, anon, authenticated;
create trigger trg_abono_no_excede before insert or update of monto, venta_id on public.pagos_abonos
  for each row execute function public.verificar_abono_no_excede();

-- Trazabilidad de los precios a mano: el precio de lista que calculó el
-- sistema al momento de vender, junto al que se cobró. Un descuento o un
-- regalo siguen permitidos; ahora queda a la vista que lo fue.
alter table public.venta_items add column if not exists precio_lista bigint check (precio_lista is null or precio_lista >= 0);

-- Registro de cada cambio de dinero sobre una venta ya hecha (edición de
-- montos, anulación): quién, cuándo, por qué, y cómo estaba antes.
create table if not exists public.ventas_cambios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  venta_id uuid not null references public.ventas (id) on delete cascade,
  usuario_id uuid references public.users (id),
  accion text not null check (accion in ('edicion', 'anulacion')),
  motivo text,
  antes jsonb,
  despues jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ventas_cambios_venta on public.ventas_cambios (venta_id);
alter table public.ventas_cambios enable row level security;
create policy "ventas_cambios: lectura del propio tenant" on public.ventas_cambios
  for select to authenticated using (tenant_id = public.jwt_tenant_id());
-- Se escribe solo desde las funciones de venta (SECURITY INVOKER, con RLS):
-- quien puede editar ventas puede dejar su propio registro.
create policy "ventas_cambios: alta con permiso de ventas" on public.ventas_cambios
  for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas() and usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- A10. Una óptica nueva nacía sin el puente al catálogo del laboratorio.
-- ---------------------------------------------------------------------
-- La plantilla solo traía tipo/rango/tratamiento/costo: las migraciones de
-- Fides llenaron material y diseño para las ópticas que ya existían, pero
-- una óptica registrada después quedaba con 110 filas que nunca salen de
-- stock ni calculan el costo real. La plantilla pasa a llevar ese puente
-- (tomado de las equivalencias vigentes, que no dependen de la óptica), y
-- se agrega la fila que faltaba. Los precios NO se copian: cada óptica fija
-- los suyos.
alter table public.plantilla_costos_cristales
  add column if not exists material_stock text,
  add column if not exists material_laboratorio text,
  add column if not exists diseno_laboratorio text,
  add column if not exists montaje_material text;

insert into public.plantilla_costos_cristales (tipo_lente, rango_receta, tratamiento, costo)
select c.tipo_lente, c.rango_receta, c.tratamiento, c.costo
  from public.costos_cristales c
 where c.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and not exists (
     select 1 from public.plantilla_costos_cristales p
      where p.tipo_lente = c.tipo_lente and p.rango_receta = c.rango_receta and p.tratamiento = c.tratamiento
   );

update public.plantilla_costos_cristales p
   set material_stock = c.material_stock,
       material_laboratorio = c.material_laboratorio,
       diseno_laboratorio = c.diseno_laboratorio,
       montaje_material = c.montaje_material
  from public.costos_cristales c
 where c.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and c.tipo_lente = p.tipo_lente and c.rango_receta = p.rango_receta and c.tratamiento = p.tratamiento;

create or replace function public.crear_optica(
  p_nombre_comercial text, p_rut_empresa text default null, p_nombre_usuario text default null)
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
  -- Un usuario pertenece a una sola óptica.
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

  insert into public.sucursales (tenant_id, nombre) values (v_tenant_id, 'Casa Matriz');

  insert into public.suscripciones (tenant_id, plan, estado, fecha_renovacion)
  values (v_tenant_id, 'trial', 'trial', (now() at time zone 'America/Santiago')::date + 30);

  -- Catálogo listo para cotizar: equivalencias con el laboratorio incluidas
  -- y precio de venta propuesto (costo × factor por defecto) para editar.
  insert into public.costos_cristales (
    tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta,
    material_stock, material_laboratorio, diseno_laboratorio, montaje_material)
  select v_tenant_id, p.tipo_lente, p.rango_receta, p.tratamiento, p.costo, p.costo * 6,
         p.material_stock, p.material_laboratorio, p.diseno_laboratorio, p.montaje_material
    from public.plantilla_costos_cristales p;

  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- A10 (bis). Cualquier usuario podía recopiar la plantilla de precios.
-- ---------------------------------------------------------------------
create or replace function public.copiar_plantilla_costos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_n integer;
begin
  if v_tenant is null or public.jwt_rol() <> 'admin' then
    raise exception 'Solo el administrador de la óptica puede cargar la plantilla de precios' using errcode = '42501';
  end if;
  insert into public.costos_cristales (
    tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta,
    material_stock, material_laboratorio, diseno_laboratorio, montaje_material)
  select v_tenant, p.tipo_lente, p.rango_receta, p.tratamiento, p.costo,
         p.costo * coalesce((select t.factor_venta_cristales from public.tenants t where t.id = v_tenant), 6),
         p.material_stock, p.material_laboratorio, p.diseno_laboratorio, p.montaje_material
    from public.plantilla_costos_cristales p
  on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
