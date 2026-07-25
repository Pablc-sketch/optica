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
