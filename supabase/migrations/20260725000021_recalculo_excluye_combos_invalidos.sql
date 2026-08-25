-- La plantilla de costos mezcla nombres de tratamiento con nombres de tipo
-- de lente (ej. una fila tipo_lente='Monofocal' con tratamiento='Multifocal
-- Filtro Azul' — no es un producto real, src/lib/cristales.ts ya lo filtra
-- de toda la interfaz). El recálculo masivo no debe tocar esas filas: al
-- aplicar el factor de Monofocal a un costo que en realidad corresponde a
-- un tratamiento "Multifocal", el precio quedaba absurdamente alto
-- (300.000+) aunque esa fila nunca se muestre en pantalla.
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
    and not (tratamiento like 'Bifocal%' and p_tipo_lente <> 'Bifocal')
    and not (tratamiento like 'Multifocal%' and p_tipo_lente <> 'Multifocal')
$$;
