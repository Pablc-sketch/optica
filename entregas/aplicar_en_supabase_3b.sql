-- Lentia, paso 3b: lo que faltó del paso 3 (pares extra en la receta).
begin;
alter table public.recetas add column if not exists sugerencias_extra jsonb not null default '[]'::jsonb;

create or replace function public.eliminar_venta_de_ot(p_ot_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta_id uuid;
  v_ots_venta uuid[];
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

  -- Una venta de varios pares tiene varias órdenes: se van todas juntas.
  select array_agg(distinct ot_id) into v_ots_venta
    from public.venta_items where venta_id = v_venta_id and ot_id is not null;
  delete from public.venta_items where venta_id = v_venta_id;
  delete from public.ventas where id = v_venta_id;
  delete from public.ordenes_trabajo where id = p_ot_id or id = any (coalesce(v_ots_venta, '{}'));
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.eliminar_venta_de_ot(uuid) to authenticated;
commit;
select 'LISTO: paso 3b aplicado' as resultado;
