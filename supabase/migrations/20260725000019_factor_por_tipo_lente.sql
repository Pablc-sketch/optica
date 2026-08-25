-- Factor de venta por tipo de lente en vez de uno solo global: un
-- monofocal, un bifocal y un multifocal no se venden con el mismo margen
-- relativo en la práctica real de la óptica. factor_venta_cristales se deja
-- tal cual (no romper lo que ya lo usa como respaldo en el POS); estas tres
-- son las nuevas y de acá en adelante mandan ellas para el recálculo.
alter table public.tenants
  add column if not exists factor_monofocal numeric not null default 6,
  add column if not exists factor_bifocal numeric not null default 4,
  add column if not exists factor_multifocal numeric not null default 2;

-- Recalcula el precio de venta de todas las filas de un tipo de lente de una
-- sola pasada (un UPDATE, no fila por fila desde la aplicación).
-- security invoker + RLS de costos_cristales: solo toca las filas del
-- propio tenant, igual que actualizarCostoCristal.
create or replace function public.recalcular_precios_cristales(
  p_tipo_lente text,
  p_factor numeric,
  p_monto_marco bigint
)
returns void
language sql
as $$
  update public.costos_cristales
  set precio_venta = round(costo * p_factor) + p_monto_marco
  where tenant_id = public.jwt_tenant_id()
    and tipo_lente = p_tipo_lente
$$;

revoke execute on function public.recalcular_precios_cristales from public, anon;
grant execute on function public.recalcular_precios_cristales to authenticated;
