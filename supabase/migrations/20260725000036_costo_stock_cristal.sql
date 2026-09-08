-- Hasta ahora costos_cristales guardaba UN costo por combinación, y el
-- selector "stock / laboratorio" del punto de venta no lo tocaba: la misma
-- venta quedaba con el mismo costo saliera de donde saliera el cristal.
-- Pero es justo ahí donde está la plata. Todos los cristales se piden al
-- laboratorio, sí, pero los que ya tiene hechos (stock) los cobra mucho
-- más barato que los que talla a medida — en un Orgánico Antirreflejo la
-- diferencia es de $6.355 a $22.610 el par.
--
-- Se separa entonces en dos columnas: costo (tallado a medida) y
-- costo_stock (ya hecho). costo_stock null = el laboratorio no tiene ese
-- cristal en stock para esa receta, así que aunque se marque "stock" hay
-- que pagarlo como laboratorio.
alter table public.costos_cristales
  add column if not exists costo_stock bigint;

-- De dónde sale cada precio en la lista del laboratorio. Guardarlo acá
-- deja la equivalencia escrita (y editable) en vez de vivir en la cabeza
-- de quien cargó los costos: el nombre interno "Orgánico Filtro Azul" es
-- "CR AR BLUE 1.56" en la lista de stock de Fides y "ORGANICO BLUE FILTER
-- 1.56 HMC" en la de laboratorio.
alter table public.costos_cristales
  add column if not exists material_stock text,
  add column if not exists material_laboratorio text,
  add column if not exists diseno_laboratorio text;

comment on column public.costos_cristales.costo is
  'Costo del par tallado a medida por el laboratorio, con montaje e IVA.';
comment on column public.costos_cristales.costo_stock is
  'Costo del par cuando el laboratorio ya lo tiene hecho. null = no lo tiene en stock para esta receta.';
