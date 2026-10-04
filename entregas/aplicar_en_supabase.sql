-- Lentia: pegar TODO en Supabase > SQL Editor > Run. Si algo falla, no se aplica nada.
begin;
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
-- Operaciones de dinero y stock en UNA transacción cada una, e idempotentes.
-- Hallazgos A03, A05 y A06 de la auditoría del 2026-10-02.
--
-- Antes la venta se guardaba en cinco pasos sueltos desde el servidor web
-- (venta, OT, ítems, abono, stock): si fallaba el cuarto, los tres
-- primeros quedaban guardados. Dos clics, o un reintento después de un
-- corte, creaban dos ventas. Dos abonos simultáneos podían cobrar dos
-- veces el mismo saldo. Anular una venta editada devolvía el stock de la
-- venta original, no el de la editada.
--
-- Todas estas funciones son SECURITY INVOKER: corren con el usuario que
-- llama, así que las mismas políticas RLS deciden quién puede hacer qué.

-- ---------------------------------------------------------------------
-- Stock neto que salió con una venta, contando sus ediciones. Es lo que
-- hay que devolver al anularla — una sola vez.
-- ---------------------------------------------------------------------
create or replace function public.stock_neto_de_venta(p_venta_id uuid)
returns table (producto_id uuid, sucursal_id uuid, neto bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.producto_id, m.sucursal_id,
         sum(case m.tipo when 'salida' then m.cantidad when 'entrada' then -m.cantidad else 0 end)::bigint
    from public.movimientos_inventario m
   where m.referencia in ('venta:' || p_venta_id, 'edicion_venta:' || p_venta_id)
   group by m.producto_id, m.sucursal_id
$$;

-- ---------------------------------------------------------------------
-- registrar_venta: venta + OT + ítems + abono + salida de stock, todo o
-- nada. La clave de idempotencia es el id de la venta, que genera el
-- cliente: el mismo id dos veces devuelve la venta ya creada sin duplicar
-- nada (doble clic, reintento tras un corte, sincronización offline).
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_id uuid := (p ->> 'venta_id')::uuid;
  v_sucursal uuid := (p ->> 'sucursal_id')::uuid;
  v_ot jsonb := p -> 'ot';
  v_ot_id uuid;
  v_folio integer;
  v_item jsonb;
  v_cantidad integer;
  v_precio bigint;
  v_total bigint := 0;
  v_abono bigint;
  v_estado text;
  v_inv_sucursal uuid;
begin
  if v_tenant is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para registrar ventas' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Falta el identificador de la venta' using errcode = '22023';
  end if;

  -- Dos llamadas con el mismo id esperan una a la otra, y la segunda ve
  -- la venta que creó la primera.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.ventas where id = v_id) then
    select ot.folio into v_folio
      from public.venta_items vi join public.ordenes_trabajo ot on ot.id = vi.ot_id
     where vi.venta_id = v_id limit 1;
    return jsonb_build_object('venta_id', v_id, 'ot_folio', v_folio, 'repetida', true);
  end if;

  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    if (v_item ->> 'cantidad') !~ '^[0-9]+$' or (v_item ->> 'cantidad')::integer <= 0 then
      raise exception 'Cantidad inválida: %', v_item ->> 'cantidad' using errcode = '22023';
    end if;
    if (v_item ->> 'precio_unitario') !~ '^[0-9]+$' then
      raise exception 'Precio inválido: %', v_item ->> 'precio_unitario' using errcode = '22023';
    end if;
    v_total := v_total + (v_item ->> 'cantidad')::integer * (v_item ->> 'precio_unitario')::bigint;
  end loop;

  v_abono := least(greatest(coalesce((p ->> 'abono')::bigint, 0), 0), v_total);
  v_estado := case when v_abono >= v_total then 'pagada' when v_abono > 0 then 'abono_parcial' else 'pendiente' end;

  insert into public.ventas (id, tenant_id, paciente_id, sucursal_id, vendedor_id, fecha, total, estado_pago, operativo_id)
  values (v_id, v_tenant, (p ->> 'paciente_id')::uuid, v_sucursal, auth.uid(),
          coalesce((p ->> 'fecha')::timestamptz, now()), v_total, v_estado, (p ->> 'operativo_id')::uuid);

  if v_ot is not null and jsonb_typeof(v_ot) = 'object' then
    if (p ->> 'paciente_id') is null then
      raise exception 'Una venta con cristales necesita paciente' using errcode = '22023';
    end if;
    insert into public.ordenes_trabajo (
      tenant_id, paciente_id, receta_id, sucursal_id, operativo_id, estado, fecha_ingreso, fecha_entrega_estimada,
      proveedor_lab_id,
      armazon_producto_id, marco_propio, tipo_lente, rango_receta, tratamiento, origen_cristal,
      diseno_laboratorio, costo_laboratorio, posicion,
      armazon_producto_id_2, marco_propio_2, tipo_lente_2, rango_receta_2, tratamiento_2, origen_cristal_2,
      diseno_laboratorio_2, costo_laboratorio_2, posicion_2)
    values (
      v_tenant, (p ->> 'paciente_id')::uuid, (v_ot ->> 'receta_id')::uuid, v_sucursal, (p ->> 'operativo_id')::uuid,
      'recepcion', coalesce((p ->> 'fecha')::timestamptz, now()), (v_ot ->> 'fecha_entrega_estimada')::date,
      (v_ot ->> 'proveedor_lab_id')::uuid,
      (v_ot ->> 'armazon_producto_id')::uuid, coalesce((v_ot ->> 'marco_propio')::boolean, false),
      v_ot ->> 'tipo_lente', v_ot ->> 'rango_receta', v_ot ->> 'tratamiento', v_ot ->> 'origen_cristal',
      v_ot ->> 'diseno_laboratorio', coalesce((v_ot ->> 'costo_laboratorio')::bigint, 0), v_ot ->> 'posicion',
      (v_ot ->> 'armazon_producto_id_2')::uuid, coalesce((v_ot ->> 'marco_propio_2')::boolean, false),
      v_ot ->> 'tipo_lente_2', v_ot ->> 'rango_receta_2', v_ot ->> 'tratamiento_2', v_ot ->> 'origen_cristal_2',
      v_ot ->> 'diseno_laboratorio_2', (v_ot ->> 'costo_laboratorio_2')::bigint, v_ot ->> 'posicion_2')
    returning id, folio into v_ot_id, v_folio;
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    v_precio := (v_item ->> 'precio_unitario')::bigint;
    insert into public.venta_items (
      tenant_id, venta_id, producto_id, ot_id, cristal_slot, descripcion, cantidad, precio_unitario, descuento, precio_lista)
    values (
      v_tenant, v_id, (v_item ->> 'producto_id')::uuid,
      case when (v_item ->> 'cristal_slot') is not null then v_ot_id end,
      (v_item ->> 'cristal_slot')::smallint, coalesce(v_item ->> 'descripcion', ''), v_cantidad, v_precio, 0,
      (v_item ->> 'precio_lista')::bigint);

    -- Salida de stock por producto físico. Sin fila de inventario no se
    -- inventa una (producto sin stock controlado). Con stock en cero la
    -- venta igual se hace — en terreno no se puede frenar una venta porque
    -- el sistema no alcanzó a cargar la reposición — y el inventario queda
    -- en negativo, a la vista, para corregirlo.
    if (v_item ->> 'producto_id') is not null then
      select i.sucursal_id into v_inv_sucursal
        from public.inventario i
       where i.producto_id = (v_item ->> 'producto_id')::uuid
       order by (i.sucursal_id = v_sucursal) desc nulls last
       limit 1;
      if v_inv_sucursal is not null then
        insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
        values (v_tenant, (v_item ->> 'producto_id')::uuid, v_inv_sucursal, 'salida', v_cantidad, 'venta:' || v_id);
      end if;
      v_inv_sucursal := null;
    end if;
  end loop;

  if v_abono > 0 then
    insert into public.pagos_abonos (tenant_id, venta_id, monto, medio_pago, fecha)
    values (v_tenant, v_id, v_abono, coalesce(p ->> 'medio_pago', 'efectivo'), coalesce((p ->> 'fecha')::timestamptz, now()));
  end if;

  return jsonb_build_object('venta_id', v_id, 'ot_folio', v_folio, 'repetida', false);
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_abono: con la venta bloqueada, nunca se cobra más que el
-- saldo, aunque lleguen dos abonos al mismo tiempo. p_id es la clave de
-- idempotencia (lo genera el formulario): repetirlo no cobra dos veces.
-- ---------------------------------------------------------------------
create or replace function public.registrar_abono(p_id uuid, p_venta_id uuid, p_monto bigint, p_medio_pago text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total bigint;
  v_anulada boolean;
  v_pagado bigint;
  v_monto bigint;
begin
  if public.jwt_tenant_id() is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para registrar abonos' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del abono tiene que ser mayor a cero' using errcode = '22023';
  end if;

  select total, anulada into v_total, v_anulada from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_anulada then
    raise exception 'La venta está anulada' using errcode = '22023';
  end if;
  if exists (select 1 from public.pagos_abonos where id = p_id) then
    return jsonb_build_object('aplicado', 0, 'repetido', true);
  end if;

  select coalesce(sum(monto), 0) into v_pagado from public.pagos_abonos where venta_id = p_venta_id;
  v_monto := least(p_monto, greatest(0, v_total - v_pagado));
  if v_monto <= 0 then
    return jsonb_build_object('aplicado', 0, 'repetido', false, 'saldo', 0);
  end if;

  insert into public.pagos_abonos (id, tenant_id, venta_id, monto, medio_pago)
  values (p_id, public.jwt_tenant_id(), p_venta_id, v_monto, coalesce(p_medio_pago, 'efectivo'));

  update public.ventas
     set estado_pago = case when v_pagado + v_monto >= v_total then 'pagada' else 'abono_parcial' end
   where id = p_venta_id;

  return jsonb_build_object('aplicado', v_monto, 'repetido', false, 'saldo', v_total - v_pagado - v_monto);
end;
$$;

-- ---------------------------------------------------------------------
-- anular_venta: devuelve el stock NETO (venta + ediciones) una sola vez,
-- cancela las OT no entregadas y deja registro. Anular dos veces no hace
-- nada la segunda.
-- ---------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta record;
  v_mov record;
begin
  if v_tenant is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para anular ventas' using errcode = '42501';
  end if;

  select id, anulada, total, estado_pago into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_venta.anulada then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;

  for v_mov in select * from public.stock_neto_de_venta(p_venta_id) where neto > 0 loop
    insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
    values (v_tenant, v_mov.producto_id, v_mov.sucursal_id, 'entrada', v_mov.neto, 'anulacion_venta:' || p_venta_id);
  end loop;

  update public.ordenes_trabajo
     set estado = 'cancelado'
   where id in (select ot_id from public.venta_items where venta_id = p_venta_id and ot_id is not null)
     and estado <> 'entregado';

  update public.ventas set anulada = true, anulada_motivo = nullif(trim(p_motivo), '') where id = p_venta_id;

  insert into public.ventas_cambios (tenant_id, venta_id, usuario_id, accion, motivo, antes, despues)
  values (v_tenant, p_venta_id, auth.uid(), 'anulacion', nullif(trim(p_motivo), ''),
          jsonb_build_object('total', v_venta.total, 'estado_pago', v_venta.estado_pago), jsonb_build_object('anulada', true));

  return jsonb_build_object('ok', true, 'repetida', false);
end;
$$;

-- ---------------------------------------------------------------------
-- actualizar_venta: corregir cantidades, precios y descuentos. El stock se
-- ajusta por la diferencia, el total no puede quedar bajo lo ya pagado
-- (eso es una devolución, otro trámite), y queda registro de cómo estaba.
-- p_items: [{id, cantidad, precio_unitario, descuento}]
-- ---------------------------------------------------------------------
create or replace function public.actualizar_venta(p_venta_id uuid, p_items jsonb, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta record;
  v_item jsonb;
  v_actual record;
  v_cantidad integer;
  v_precio bigint;
  v_descuento bigint;
  v_delta integer;
  v_sucursal uuid;
  v_total bigint;
  v_pagado bigint;
  v_antes jsonb;
begin
  if v_tenant is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para editar ventas' using errcode = '42501';
  end if;

  select id, anulada, total into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_venta.anulada then
    raise exception 'Esta venta está anulada, no se puede editar' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'descuento', descuento))
    into v_antes from public.venta_items where venta_id = p_venta_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select id, producto_id, cantidad, precio_unitario, descuento into v_actual
      from public.venta_items where id = (v_item ->> 'id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no es de esta venta', v_item ->> 'id' using errcode = '22023';
    end if;
    if (v_item ->> 'cantidad') !~ '^[0-9]+$' or (v_item ->> 'precio_unitario') !~ '^[0-9]+$'
       or (v_item ->> 'descuento') !~ '^[0-9]+$' then
      raise exception 'Valores inválidos en el ítem %', v_item ->> 'id' using errcode = '22023';
    end if;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    v_precio := (v_item ->> 'precio_unitario')::bigint;
    v_descuento := (v_item ->> 'descuento')::bigint;
    if v_cantidad <= 0 then
      raise exception 'La cantidad tiene que ser al menos 1' using errcode = '22023';
    end if;
    if v_descuento > v_cantidad * v_precio then
      raise exception 'El descuento no puede superar el valor del ítem' using errcode = '22023';
    end if;

    update public.venta_items set cantidad = v_cantidad, precio_unitario = v_precio, descuento = v_descuento
     where id = v_actual.id;

    v_delta := v_cantidad - v_actual.cantidad;
    if v_actual.producto_id is not null and v_delta <> 0 then
      select sucursal_id into v_sucursal from public.movimientos_inventario
       where referencia = 'venta:' || p_venta_id and producto_id = v_actual.producto_id limit 1;
      if v_sucursal is not null then
        insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
        values (v_tenant, v_actual.producto_id, v_sucursal,
                case when v_delta > 0 then 'salida' else 'entrada' end, abs(v_delta), 'edicion_venta:' || p_venta_id);
      end if;
      v_sucursal := null;
    end if;
  end loop;

  select coalesce(sum(cantidad * precio_unitario - descuento), 0) into v_total
    from public.venta_items where venta_id = p_venta_id;
  select coalesce(sum(monto), 0) into v_pagado from public.pagos_abonos where venta_id = p_venta_id;
  if v_total < v_pagado then
    raise exception 'El nuevo total (%) queda bajo lo que ya se pagó (%): eso es una devolución, no una edición', v_total, v_pagado
      using errcode = '22023';
  end if;

  update public.ventas
     set total = v_total,
         estado_pago = case when v_pagado >= v_total then 'pagada' when v_pagado > 0 then 'abono_parcial' else 'pendiente' end
   where id = p_venta_id;

  insert into public.ventas_cambios (tenant_id, venta_id, usuario_id, accion, motivo, antes, despues)
  values (v_tenant, p_venta_id, auth.uid(), 'edicion', nullif(trim(p_motivo), ''),
          jsonb_build_object('total', v_venta.total, 'items', v_antes),
          jsonb_build_object('total', v_total, 'items', p_items));

  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_venta_de_ot: deshacer por completo una venta sin pagos (OT,
-- ítems, venta), devolviendo el stock neto. Con pagos no se borra: se
-- anula.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_venta_de_ot(p_ot_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta_id uuid;
  v_mov record;
begin
  if v_tenant is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para eliminar órdenes' using errcode = '42501';
  end if;

  select venta_id into v_venta_id from public.venta_items where ot_id = p_ot_id limit 1;
  if v_venta_id is null then
    delete from public.ordenes_trabajo where id = p_ot_id;
    return jsonb_build_object('ok', true);
  end if;

  perform 1 from public.ventas where id = v_venta_id for update;
  if exists (select 1 from public.pagos_abonos where venta_id = v_venta_id) then
    raise exception 'La venta de esta orden ya tiene pagos: hay que anularla, no borrarla' using errcode = '22023';
  end if;

  for v_mov in select * from public.stock_neto_de_venta(v_venta_id) where neto > 0 loop
    insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
    values (v_tenant, v_mov.producto_id, v_mov.sucursal_id, 'entrada', v_mov.neto, 'anulacion_ot:' || p_ot_id);
  end loop;

  delete from public.venta_items where venta_id = v_venta_id;
  delete from public.ventas where id = v_venta_id;
  delete from public.ordenes_trabajo where id = p_ot_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.registrar_venta(jsonb) from public, anon;
revoke execute on function public.registrar_abono(uuid, uuid, bigint, text) from public, anon;
revoke execute on function public.anular_venta(uuid, text) from public, anon;
revoke execute on function public.actualizar_venta(uuid, jsonb, text) from public, anon;
revoke execute on function public.eliminar_venta_de_ot(uuid) from public, anon;
revoke execute on function public.stock_neto_de_venta(uuid) from public, anon;
grant execute on function public.registrar_venta(jsonb) to authenticated;
grant execute on function public.registrar_abono(uuid, uuid, bigint, text) to authenticated;
grant execute on function public.anular_venta(uuid, text) to authenticated;
grant execute on function public.actualizar_venta(uuid, jsonb, text) to authenticated;
grant execute on function public.eliminar_venta_de_ot(uuid) to authenticated;
grant execute on function public.stock_neto_de_venta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- La sincronización offline vieja (sync_aplicar_cambios) queda solo para
-- pacientes/recetas: las ventas offline pasan por registrar_venta, igual
-- que las online. Se completan los campos de receta que no guardaba.
-- ---------------------------------------------------------------------
create or replace function public.sync_aplicar_receta(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.recetas (id, tenant_id, paciente_id, profesional_id, fecha,
    od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add,
    av_od, av_oi, dp, altura, tipo, notas, operativo_id,
    sugerencia_tipo_lente, sugerencia_tratamiento, sugerencia_tipo_lente_cerca, sugerencia_tratamiento_cerca)
  values ((p ->> 'id')::uuid, public.jwt_tenant_id(), (p ->> 'paciente_id')::uuid, auth.uid(),
    coalesce((p ->> 'fecha')::date, (now() at time zone 'America/Santiago')::date),
    (p ->> 'od_esfera')::numeric, (p ->> 'od_cilindro')::numeric, (p ->> 'od_eje')::integer, (p ->> 'od_add')::numeric,
    (p ->> 'oi_esfera')::numeric, (p ->> 'oi_cilindro')::numeric, (p ->> 'oi_eje')::integer, (p ->> 'oi_add')::numeric,
    p ->> 'av_od', p ->> 'av_oi', (p ->> 'dp')::numeric, (p ->> 'altura')::numeric,
    coalesce(p ->> 'tipo', 'lejos'), p ->> 'notas', (p ->> 'operativo_id')::uuid,
    p ->> 'sugerencia_tipo_lente', p ->> 'sugerencia_tratamiento',
    p ->> 'sugerencia_tipo_lente_cerca', p ->> 'sugerencia_tratamiento_cerca')
  on conflict (id) do nothing;
  return jsonb_build_object('id', p ->> 'id');
end;
$$;
revoke execute on function public.sync_aplicar_receta(jsonb) from public, anon;
grant execute on function public.sync_aplicar_receta(jsonb) to authenticated;
-- Datos: reparación acotada del folio 62 (F01), equivalencia dudosa de
-- stock (F02), laboratorio Fides como proveedor y polarizados por color.
-- Todo restringido a la óptica P&P; no toca la óptica de prueba.

-- ---------------------------------------------------------------------
-- F01. Folio 62: el ítem de venta apunta al cupo 2 de la orden, pero el
-- cristal quedó guardado en el cupo 1 (se vendió solo el "Lente 2" y la
-- orden lo puso en su primer cupo). El costo de ese ítem se contaba $0.
-- Se renumera SOLO ese ítem al cupo 1, que es donde está su cristal, y se
-- deja registro. No cambia lo cobrado ni lo pagado.
-- ---------------------------------------------------------------------
create table if not exists public.reparaciones_datos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  motivo text not null,
  tabla text not null,
  fila_id uuid not null,
  antes jsonb,
  despues jsonb,
  created_at timestamptz not null default now()
);
alter table public.reparaciones_datos enable row level security;
create policy "reparaciones_datos: lectura de admin" on public.reparaciones_datos
  for select to authenticated using (tenant_id = public.jwt_tenant_id() and public.es_admin());

with objetivo as (
  select vi.id, vi.tenant_id, vi.cristal_slot
    from public.venta_items vi
    join public.ordenes_trabajo ot on ot.id = vi.ot_id
   where ot.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
     and ot.folio = 62
     and vi.cristal_slot = 2
     and ot.tipo_lente_2 is null
     and ot.tipo_lente is not null
), registro as (
  insert into public.reparaciones_datos (tenant_id, motivo, tabla, fila_id, antes, despues)
  select tenant_id,
         'F01: ítem del folio 62 apuntaba al cupo 2 vacío; su cristal está en el cupo 1',
         'venta_items', id,
         jsonb_build_object('cristal_slot', cristal_slot), jsonb_build_object('cristal_slot', 1)
    from objetivo
  returning fila_id
)
update public.venta_items set cristal_slot = 1 where id in (select fila_id from registro);

-- Desde ahora la base exige que cada ítem de cristal apunte a un cupo que
-- tenga cristal (lo mismo que ya valida el servidor).
create or replace function public.verificar_cupo_de_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ot_id is not null and new.cristal_slot is not null and not exists (
    select 1 from public.ordenes_trabajo ot
     where ot.id = new.ot_id
       and ((new.cristal_slot = 1 and ot.tipo_lente is not null) or (new.cristal_slot = 2 and ot.tipo_lente_2 is not null))
  ) then
    raise exception 'El ítem apunta al cupo % de la orden, que no tiene cristal', new.cristal_slot using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.verificar_cupo_de_item() from public, anon, authenticated;
create trigger trg_cupo_de_item before insert or update of ot_id, cristal_slot on public.venta_items
  for each row execute function public.verificar_cupo_de_item();

-- ---------------------------------------------------------------------
-- F02. Bifocal y multifocal "Fotocromático Gris Filtro Azul" tomaban de
-- stock FLAT TOP AR FOTO GRIS / MULTIFOCAL AR FOTO GRIS, que en la lista
-- de Fides NO dicen BLUE (la lista distingue "FOTO" de "FOTO ... BLUE").
-- Hasta que Fides confirme que ese cristal trae filtro azul, se pide de
-- laboratorio (ORGANICO FOTOCROMATICO BLUE FILTER), que sí lo trae. El
-- precio de venta no cambia: bifocal/multifocal cobran igual de stock o de
-- laboratorio. Se reversa con un update si Fides lo acredita.
-- ---------------------------------------------------------------------
update public.costos_cristales
   set material_stock = null, costo_stock = null
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento = 'Fotocromático Gris Filtro Azul';
update public.plantilla_costos_cristales
   set material_stock = null
 where tipo_lente in ('Bifocal', 'Multifocal') and tratamiento = 'Fotocromático Gris Filtro Azul';

-- ---------------------------------------------------------------------
-- Fides como laboratorio en Proveedores (no había ninguno registrado, así
-- que las órdenes quedaban sin laboratorio asignado).
-- ---------------------------------------------------------------------
insert into public.proveedores (tenant_id, nombre, tipo)
select '7e4b2a1a-8926-4262-92e2-1f0e75951b9a', 'Fides', 'laboratorio'
 where not exists (
   select 1 from public.proveedores
    where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo = 'laboratorio' and lower(nombre) = 'fides'
 );

update public.ordenes_trabajo ot
   set proveedor_lab_id = p.id
  from public.proveedores p
 where ot.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and p.tenant_id = ot.tenant_id and p.tipo = 'laboratorio' and lower(p.nombre) = 'fides'
   and ot.proveedor_lab_id is null
   and ot.estado in ('recepcion', 'laboratorio', 'montaje')
   and (ot.origen_cristal = 'laboratorio' or ot.origen_cristal_2 = 'laboratorio');

-- ---------------------------------------------------------------------
-- Polarizado: solo monofocal, en tres colores. Bifocal/multifocal
-- polarizado no se ofrece (de cerca, adentro, el polarizado oscurece la
-- lectura). Los tres colores cuestan lo mismo en Fides (mismo material,
-- ORGANICO POLARIZADO 1.49 HMC); el color va escrito en el pedido.
-- Ninguna orden usa bifocal/multifocal polarizado (verificado).
-- ---------------------------------------------------------------------
delete from public.costos_cristales
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento like 'Polarizado%';

insert into public.costos_cristales (
  tenant_id, tipo_lente, rango_receta, tratamiento, costo, costo_stock, precio_venta, precio_venta_stock,
  nombre_laboratorio, material_stock, material_laboratorio, diseno_laboratorio, montaje_material,
  diseno_laboratorio_proximo, diseno_proximo_desde)
select c.tenant_id, c.tipo_lente, c.rango_receta, color.tratamiento, c.costo, c.costo_stock, c.precio_venta, c.precio_venta_stock,
       c.nombre_laboratorio, c.material_stock, c.material_laboratorio, c.diseno_laboratorio, c.montaje_material,
       c.diseno_laboratorio_proximo, c.diseno_proximo_desde
  from public.costos_cristales c
 cross join (values ('Polarizado Café'), ('Polarizado Verde Oscuro')) as color (tratamiento)
 where c.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and c.tipo_lente = 'Monofocal'
   and c.tratamiento = 'Polarizado Gris Oscuro'
on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing;

commit;
select 'LISTO: cambios aplicados' as resultado;
