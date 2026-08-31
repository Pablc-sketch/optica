-- La plantilla de costos (20260725000003) generó un cruce completo de
-- 3 tipos de lente x 10 tratamientos x 5 rangos, pero 4 de esos
-- "tratamientos" son en realidad nombres de OTRO tipo de lente
-- ("Bifocal Antirreflejo", "Bifocal Filtro Azul", "Multifocal
-- Antirreflejo", "Multifocal Filtro Azul") — combinaciones como
-- Monofocal + "Multifocal Antirreflejo" no son un producto real.
-- src/lib/cristales.ts (tratamientoAplica) y la migración 021 ya las
-- ocultaban/excluían con un parche basado en texto; acá se borran de
-- raíz. Son filas 100% inertes: nunca se muestran en pantalla, nunca se
-- han vendido, nunca se han editado a mano (no aparecen en /precios), así
-- que borrarlas no toca ningún precio real.
--
-- Se limpia tanto la plantilla maestra (para que las ópticas que se
-- registren de ahora en adelante no hereden la basura) como las filas ya
-- copiadas en costos_cristales de las ópticas existentes.
delete from public.plantilla_costos_cristales
where (tratamiento like 'Bifocal%' and tipo_lente <> 'Bifocal')
   or (tratamiento like 'Multifocal%' and tipo_lente <> 'Multifocal');

delete from public.costos_cristales
where (tratamiento like 'Bifocal%' and tipo_lente <> 'Bifocal')
   or (tratamiento like 'Multifocal%' and tipo_lente <> 'Multifocal');

-- Con la basura fuera, el recálculo masivo ya no necesita excluir nada.
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
