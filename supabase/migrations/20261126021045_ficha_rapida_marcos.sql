alter table public.productos add column material text check (char_length(material) <= 80);

-- La carga rápida comparte el movimiento y la clave de reintento de la carga masiva.
-- Una entrada de cero registra la ficha y prepara la sucursal para las ventas.
create or replace function public.cargar_stock_marcos(p_id uuid, p_sucursal uuid, p_modo text, p_filas jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  tenant uuid := public.jwt_tenant_id();
  lote public.cargas_stock_marcos%rowtype;
  fila record;
  producto uuid;
  stock integer;
  cambio integer;
  creados integer := 0;
  unidades integer := 0;
  resultado jsonb;
begin
  if tenant is null or public.puede_editar_inventario() is not true then
    raise exception 'Sin permiso para editar inventario' using errcode = '42501';
  end if;
  if p_id is null or p_sucursal is null or p_modo is null or p_modo not in ('entrada', 'conteo')
    or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Carga inválida' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) not between 1 and 250
    or not exists (select 1 from public.sucursales where id = p_sucursal and tenant_id = tenant) then
    raise exception 'Revisa los códigos y la sucursal' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_filas) as x(codigo text, cantidad numeric, marca text, material text,
      color text, modelo text, codigo_color text, proveedor_id uuid)
    where x.codigo is null or x.codigo !~ '^[A-Z0-9 ._/#-]{1,80}$'
      or public.clave_codigo_marco(x.codigo) = '' or x.cantidad is null
      or x.cantidad <> trunc(x.cantidad) or x.cantidad > 24999750
      or x.cantidad < 0
      or char_length(x.marca) > 80 or char_length(x.material) > 80 or char_length(x.color) > 80
      or char_length(x.modelo) > 80 or (x.codigo_color is not null and x.codigo_color !~ '^C[0-9]{1,8}[A-Z]?$')
      or (x.proveedor_id is not null and not exists (
        select 1 from public.proveedores p where p.id = x.proveedor_id and p.tenant_id = tenant
      ))
  ) or (select sum(x.cantidad) from jsonb_to_recordset(p_filas) as x(cantidad numeric)) > 24999750 or exists (
    select 1 from jsonb_to_recordset(p_filas) as x(codigo text)
    group by public.clave_codigo_marco(x.codigo) having count(*) > 1
  ) then
    raise exception 'Revisa códigos repetidos o cantidades inválidas' using errcode = '22023';
  end if;

  -- Los reintentos del mismo formulario recuperan su resultado completo.
  perform pg_advisory_xact_lock(hashtextextended('carga-marcos:' || p_id::text, 0));
  select * into lote from public.cargas_stock_marcos where id = p_id and tenant_id = tenant;
  if found then
    if lote.sucursal_id is distinct from p_sucursal or lote.modo is distinct from p_modo or lote.filas is distinct from p_filas then
      raise exception 'Ya se procesó una carga con otra lista' using errcode = '23505';
    end if;
    return lote.resultado;
  end if;

  for fila in
    select trim(x.codigo) codigo, public.clave_codigo_marco(x.codigo) clave, x.cantidad,
      nullif(trim(x.marca), '') marca, nullif(trim(x.material), '') material,
      nullif(trim(x.color), '') color, nullif(trim(x.modelo), '') modelo,
      x.codigo_color, x.proveedor_id
    from jsonb_to_recordset(p_filas) as x(codigo text, cantidad integer, marca text, material text,
      color text, modelo text, codigo_color text, proveedor_id uuid)
    order by public.clave_codigo_marco(x.codigo)
  loop
    select p.id into producto from public.productos p
    where p.tenant_id = tenant and p.categoria = 'armazon' and p.sku is not null
      and public.clave_codigo_marco(p.sku) = fila.clave;

    if producto is null then
      insert into public.productos (tenant_id, categoria, nombre, sku, marca, material, color, modelo, codigo_color, proveedor_id)
      values (tenant, 'armazon', fila.codigo, fila.codigo, fila.marca, fila.material, fila.color, fila.modelo, fila.codigo_color, fila.proveedor_id)
      on conflict (tenant_id, public.clave_codigo_marco(sku))
        where categoria = 'armazon' and sku is not null and public.clave_codigo_marco(sku) <> ''
      do nothing returning id into producto;

      if producto is not null then
        creados := creados + 1;
      else
        select p.id into strict producto from public.productos p
        where p.tenant_id = tenant and p.categoria = 'armazon' and p.sku is not null
          and public.clave_codigo_marco(p.sku) = fila.clave;
      end if;
    end if;

    update public.productos p set
      marca = coalesce(p.marca, fila.marca),
      material = coalesce(p.material, fila.material),
      color = coalesce(p.color, fila.color),
      modelo = coalesce(p.modelo, fila.modelo),
      codigo_color = coalesce(p.codigo_color, fila.codigo_color),
      proveedor_id = coalesce(p.proveedor_id, fila.proveedor_id)
    where p.id = producto and p.tenant_id = tenant
      and ((p.marca is null and fila.marca is not null) or (p.material is null and fila.material is not null)
        or (p.color is null and fila.color is not null) or (p.modelo is null and fila.modelo is not null)
        or (p.codigo_color is null and fila.codigo_color is not null) or (p.proveedor_id is null and fila.proveedor_id is not null));

    insert into public.inventario (tenant_id, sucursal_id, producto_id)
    values (tenant, p_sucursal, producto) on conflict (sucursal_id, producto_id) do nothing;

    select i.stock_actual into strict stock from public.inventario i
    where i.tenant_id = tenant and i.sucursal_id = p_sucursal and i.producto_id = producto
    for update;

    cambio := case p_modo when 'entrada' then fila.cantidad else fila.cantidad - stock end;
    if cambio <> 0 then
      insert into public.movimientos_inventario (tenant_id, sucursal_id, producto_id, tipo, cantidad, referencia)
      values (tenant, p_sucursal, producto, case p_modo when 'entrada' then 'entrada' else 'ajuste' end, cambio,
        case p_modo when 'entrada' then 'Ingreso de marcos' else 'Conteo físico · ' || fila.cantidad::text || ' unidades' end);
    end if;
    unidades := unidades + fila.cantidad;
  end loop;

  resultado := jsonb_build_object('creados', creados, 'codigos', jsonb_array_length(p_filas), 'unidades', unidades);
  insert into public.cargas_stock_marcos (id, tenant_id, sucursal_id, modo, filas, resultado)
  values (p_id, tenant, p_sucursal, p_modo, p_filas, resultado);
  return resultado;
end;
$$;
