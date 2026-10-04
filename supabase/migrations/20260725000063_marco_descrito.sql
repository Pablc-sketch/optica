-- Marco descrito en palabras ("acetato rojo", "metal dorado", "semi al
-- aire negro") en vez de tener que cargar cada marco con su código en el
-- inventario. Va en la orden de trabajo y sale en el pedido de cristales,
-- para que en el laboratorio sepan a qué marco van los cristales.

alter table public.ordenes_trabajo
  add column if not exists marco_descripcion text,
  add column if not exists marco_descripcion_2 text;

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
  v_ots jsonb;
  v_ot jsonb;
  v_ot_ids uuid[] := '{}';
  v_folios integer[] := '{}';
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
    select array_agg(distinct ot.folio order by ot.folio) into v_folios
      from public.venta_items vi join public.ordenes_trabajo ot on ot.id = vi.ot_id
     where vi.venta_id = v_id;
    return jsonb_build_object('venta_id', v_id, 'ot_folio', v_folios[1], 'ot_folios', to_jsonb(coalesce(v_folios, '{}')), 'repetida', true);
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

  -- Una orden de trabajo por cada dos pares ("ots"). "ot" (una sola) se
  -- sigue aceptando por compatibilidad.
  v_ots := case
    when jsonb_typeof(p -> 'ots') = 'array' then p -> 'ots'
    when jsonb_typeof(p -> 'ot') = 'object' then jsonb_build_array(p -> 'ot')
    else '[]'::jsonb
  end;
  if jsonb_array_length(v_ots) > 0 and (p ->> 'paciente_id') is null then
    raise exception 'Una venta con cristales necesita paciente' using errcode = '22023';
  end if;
  for v_ot in select * from jsonb_array_elements(v_ots) loop
    insert into public.ordenes_trabajo (
      tenant_id, paciente_id, receta_id, sucursal_id, operativo_id, estado, fecha_ingreso, fecha_entrega_estimada,
      proveedor_lab_id,
      armazon_producto_id, marco_propio, tipo_lente, rango_receta, tratamiento, origen_cristal,
      diseno_laboratorio, costo_laboratorio, posicion,
      armazon_producto_id_2, marco_propio_2, tipo_lente_2, rango_receta_2, tratamiento_2, origen_cristal_2,
      diseno_laboratorio_2, costo_laboratorio_2, posicion_2,
      marco_descripcion, marco_descripcion_2)
    values (
      v_tenant, (p ->> 'paciente_id')::uuid, (v_ot ->> 'receta_id')::uuid, v_sucursal, (p ->> 'operativo_id')::uuid,
      'recepcion', coalesce((p ->> 'fecha')::timestamptz, now()), (v_ot ->> 'fecha_entrega_estimada')::date,
      (v_ot ->> 'proveedor_lab_id')::uuid,
      (v_ot ->> 'armazon_producto_id')::uuid, coalesce((v_ot ->> 'marco_propio')::boolean, false),
      v_ot ->> 'tipo_lente', v_ot ->> 'rango_receta', v_ot ->> 'tratamiento', v_ot ->> 'origen_cristal',
      v_ot ->> 'diseno_laboratorio', coalesce((v_ot ->> 'costo_laboratorio')::bigint, 0), v_ot ->> 'posicion',
      (v_ot ->> 'armazon_producto_id_2')::uuid, coalesce((v_ot ->> 'marco_propio_2')::boolean, false),
      v_ot ->> 'tipo_lente_2', v_ot ->> 'rango_receta_2', v_ot ->> 'tratamiento_2', v_ot ->> 'origen_cristal_2',
      v_ot ->> 'diseno_laboratorio_2', (v_ot ->> 'costo_laboratorio_2')::bigint, v_ot ->> 'posicion_2',
      nullif(trim(v_ot ->> 'marco_descripcion'), ''), nullif(trim(v_ot ->> 'marco_descripcion_2'), ''))
    returning id, folio into v_ot_id, v_folio;
    v_ot_ids := v_ot_ids || v_ot_id;
    v_folios := v_folios || v_folio;
  end loop;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    v_precio := (v_item ->> 'precio_unitario')::bigint;
    insert into public.venta_items (
      tenant_id, venta_id, producto_id, ot_id, cristal_slot, descripcion, cantidad, precio_unitario, descuento, precio_lista)
    values (
      v_tenant, v_id, (v_item ->> 'producto_id')::uuid,
      case when (v_item ->> 'cristal_slot') is not null
           then v_ot_ids[coalesce((v_item ->> 'ot_index')::integer, 0) + 1] end,
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

  return jsonb_build_object('venta_id', v_id, 'ot_folio', v_folios[1], 'ot_folios', to_jsonb(v_folios), 'repetida', false);
end;
$$;


