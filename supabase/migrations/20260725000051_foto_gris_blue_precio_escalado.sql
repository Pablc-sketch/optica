-- Vuelve a escalar el precio de Fotocromático Gris Filtro Azul según la
-- receta, en vez del precio parejo de la migración anterior — Pablo pidió
-- explícitamente lo contrario para ESTE tratamiento: "obvio hay que
-- cobrar más caro cuando es de laboratorio... pero si es de stock tiene
-- que ir de acuerdo a su escala, si no vamos a perder una venta buena".
--
-- El costo real (columna costo/costo_stock, calzado con el catálogo de
-- Fides) para este material específico tiene un salto grande y genuino:
-- de stock cuesta $11.138-$17.779 el par; tallado a medida en laboratorio
-- cuesta $41.769-$44.982 — casi el cuádruple. Cobrar lo mismo a los dos
-- (como quedó con el precio parejo) significaba, o cobrar de más a la
-- receta simple, o casi regalar la compleja.
--
-- Con la grilla de stock de este material (hasta esfera 4.00, cilindro
-- 6.00 — verificado contra lab_precios_stock), los rangos ±2/±2, ±4/±2 y
-- ±4/±4 caen SIEMPRE dentro de esa grilla: nunca van a laboratorio, así
-- que se puede cobrar barato con la seguridad de que el margen es real.
-- El rango ±6/±4 cae SIEMPRE fuera de esa grilla (por definición: para
-- clasificar ahí la esfera ya se pasó de 4.00), así que siempre es
-- laboratorio. El rango ±6/±6 mezcla los dos casos (puede ser esfera baja
-- con cilindro alto, que sí es stock — el caso real del folio 50 de
-- Pudahuel — o esfera y cilindro altos, que es laboratorio); se cobra al
-- precio de laboratorio por seguridad, nunca se vende bajo el costo.
update public.costos_cristales
set precio_venta = case rango_receta
  when '±2.00 / ±2.00' then 38000
  when '±4.00 / ±2.00' then 38000
  when '±4.00 / ±4.00' then 55000
  when '±6.00 / ±4.00' then 110000
  when '±6.00 / ±6.00' then 110000
end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal'
  and tratamiento = 'Fotocromático Gris Filtro Azul';
