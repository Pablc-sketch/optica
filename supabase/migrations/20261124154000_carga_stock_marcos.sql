create function public.clave_codigo_marco(text)
returns text
language sql immutable strict parallel safe set search_path = ''
as $$
  select regexp_replace(upper(normalize($1, NFD) collate "C"), '[^A-Z0-9]', '', 'g');
$$;

-- El código completo incluye la variante. Los formatos con guiones, espacios o
-- mayúsculas distintas identifican el mismo marco dentro de la óptica.
create unique index productos_armazon_codigo_unico
on public.productos (tenant_id, public.clave_codigo_marco(sku))
where categoria = 'armazon' and sku is not null and public.clave_codigo_marco(sku) <> '';

create table public.cargas_stock_marcos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id),
  modo text not null check (modo in ('entrada', 'conteo')),
  filas jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.cargas_stock_marcos enable row level security;
revoke all on public.cargas_stock_marcos from public, anon, authenticated;
grant select, insert on public.cargas_stock_marcos to authenticated;
create policy cargas_stock_lectura on public.cargas_stock_marcos for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_inventario()));
create policy cargas_stock_alta on public.cargas_stock_marcos for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_inventario()));

create function public.cargar_stock_marcos(p_id uuid, p_sucursal uuid, p_modo text, p_filas jsonb)
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
    select 1 from jsonb_to_recordset(p_filas) as x(codigo text, cantidad numeric)
    where x.codigo is null or x.codigo !~ '^[A-Z0-9 ._/#-]{1,80}$'
      or public.clave_codigo_marco(x.codigo) = '' or x.cantidad is null
      or x.cantidad <> trunc(x.cantidad) or x.cantidad > 24999750
      or x.cantidad < (case p_modo when 'entrada' then 1 else 0 end)
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
    select trim(x.codigo) codigo, public.clave_codigo_marco(x.codigo) clave, x.cantidad
    from jsonb_to_recordset(p_filas) as x(codigo text, cantidad integer)
    order by public.clave_codigo_marco(x.codigo)
  loop
    select p.id into producto from public.productos p
    where p.tenant_id = tenant and p.categoria = 'armazon' and p.sku is not null
      and public.clave_codigo_marco(p.sku) = fila.clave;

    if producto is null then
      insert into public.productos (tenant_id, categoria, nombre, sku)
      values (tenant, 'armazon', fila.codigo, fila.codigo)
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

create function public.buscar_marcos_por_codigo(p_codigos text[])
returns table (codigo text, producto_id uuid)
language sql stable security invoker set search_path = ''
as $$
  select public.clave_codigo_marco(p.sku), p.id
  from public.productos p
  where p.tenant_id = (select public.jwt_tenant_id()) and p.categoria = 'armazon' and p.sku is not null
    and public.clave_codigo_marco(p.sku) <> ''
    and public.clave_codigo_marco(p.sku) = any(p_codigos)
    and (select public.puede_editar_ventas());
$$;

revoke execute on function public.cargar_stock_marcos(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.cargar_stock_marcos(uuid, uuid, text, jsonb) to authenticated;
revoke execute on function public.buscar_marcos_por_codigo(text[]) from public, anon;
grant execute on function public.buscar_marcos_por_codigo(text[]) to authenticated;

-- El registro de la venta ya crea el movimiento de salida. Prepara la fila
-- de la sucursal de la venta, incluso para un código aún sin stock allí.
create function public.preparar_stock_marco_vendido()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.inventario (tenant_id, sucursal_id, producto_id)
  select v.tenant_id, v.sucursal_id, p.id
  from public.ventas v
  join public.productos p on p.id = new.producto_id and p.tenant_id = v.tenant_id
  where v.id = new.venta_id and v.tenant_id = new.tenant_id and v.sucursal_id is not null
    and p.categoria = 'armazon'
  on conflict (sucursal_id, producto_id) do nothing;
  return new;
end;
$$;

create trigger preparar_stock_marco_vendido
after insert on public.venta_items
for each row when (new.producto_id is not null)
execute function public.preparar_stock_marco_vendido();

revoke execute on function public.preparar_stock_marco_vendido() from public, anon, authenticated;
