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
