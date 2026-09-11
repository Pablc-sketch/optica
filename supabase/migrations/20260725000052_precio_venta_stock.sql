-- costos_cristales ya separaba el COSTO en costo (tallado a medida) y
-- costo_stock (ya hecho) — pero el PRECIO al cliente seguía siendo uno
-- solo (precio_venta). Eso significaba que a una receta simple, que sale
-- barata porque el laboratorio ya la tiene hecha, se le podía terminar
-- cobrando lo mismo que a una que hay que tallar a medida — o al revés,
-- que para no perder el margen en la difícil, se subiera el precio de
-- TODOS por igual (que es justo lo que se corrigió mal en la migración
-- 50: ahí se dejó un solo precio parejo por tratamiento, sin distinguir
-- de dónde salía el cristal).
--
-- Se separa entonces el precio igual que el costo: precio_venta (cuando
-- toca tallarlo en laboratorio) y precio_venta_stock (cuando el
-- laboratorio ya lo tiene hecho). null en precio_venta_stock = ese rango
-- nunca sale de stock para este tratamiento (la receta es demasiado
-- alta), así que no hace falta un precio aparte.
--
-- El punto de venta y la cotización a quien no compró ahora eligen según
-- el ORIGEN REAL calculado receta por receta (el mismo motor que ya
-- decide de dónde sale el cristal, src/lib/costo-fides.ts), no según la
-- categoría ancha de rango — que mezclaba, por ejemplo, "solo cilindro
-- alto sin esfera" (barato, sale de stock) con "esfera y cilindro altos"
-- (caro, va a laboratorio) en el mismo casillero "±6.00 / ±6.00".
alter table public.costos_cristales
  add column if not exists precio_venta_stock bigint;

comment on column public.costos_cristales.precio_venta_stock is
  'Precio al cliente cuando el cristal sale de stock (ya hecho). null = este rango nunca sale de stock para este tratamiento, siempre se cobra precio_venta.';

-- Fotocromático Gris Filtro Azul: se había dejado en $80.000 parejo y
-- después en $38.000-$110.000 por rango, pero en los dos casos mezclando
-- de stock con de laboratorio en el mismo número. Ahora sí separado:
--
--   · ±2.00/±2.00 y ±4.00/±2.00: para este material SIEMPRE sale de
--     stock (esfera y cilindro caben cómodos en la grilla de Fides,
--     hasta esfera 4.00 y cilindro 6.00) — costo real $11.138 el par.
--     Precio de stock $70.000 (margen 84%), que es el piso mínimo que
--     pidió Pablo para este tratamiento. El precio de laboratorio
--     ($115.000) casi no se usa nunca acá, pero queda cargado por si
--     alguna vez el laboratorio se queda sin ese cristal en stock.
--   · ±4.00/±4.00: también siempre de stock, costo $17.779 — precio de
--     stock $90.000 (margen 80%).
--   · ±6.00/±4.00: para clasificar acá la esfera ya se pasó de 4.00, así
--     que SIEMPRE va a laboratorio (nunca hay precio de stock) — costo
--     $41.769, precio $100.000 (margen 58%).
--   · ±6.00/±6.00: mezcla los dos casos. Puede ser esfera baja con
--     cilindro alto (el caso real de Franco Lobos en Pudahuel: sin
--     esfera, solo cilindro 4.50-4.75 — eso SÍ sale de stock, costo real
--     $28.917) o esfera y cilindro altos de verdad (costo $44.982,
--     laboratorio). Con los dos precios separados, cada caso se cobra
--     por lo que de verdad cuesta: $95.000 si sale de stock (margen 70%,
--     el caso de Franco), $110.000 si hay que tallarlo (margen 59%).
update public.costos_cristales
set precio_venta_stock = case rango_receta
    when '±2.00 / ±2.00' then 70000
    when '±4.00 / ±2.00' then 70000
    when '±4.00 / ±4.00' then 90000
    when '±6.00 / ±6.00' then 95000
    else null
  end,
  precio_venta = case rango_receta
    when '±2.00 / ±2.00' then 115000
    when '±4.00 / ±2.00' then 115000
    when '±4.00 / ±4.00' then 115000
    when '±6.00 / ±4.00' then 100000
    when '±6.00 / ±6.00' then 110000
  end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal'
  and tratamiento = 'Fotocromático Gris Filtro Azul';

-- Polarizado: Pablo decidió bajarlo a $70.000 parejo, como punto de
-- partida para competir con el que ya conoce (que usa un laboratorio más
-- barato y monta él mismo, sin pagarle a nadie el montaje). Con el costo
-- real de Fides ($29.988-$33.201, según la receta) el margen queda entre
-- 52.6% y 57.2% — mucho menos que el 68% de antes, pero todavía sano.
-- No tiene precio de stock: este tratamiento nunca sale de stock en
-- Fides (no lo fabrican armado), siempre se talla a medida.
update public.costos_cristales
set precio_venta = 70000
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal'
  and tratamiento = 'Polarizado Gris Oscuro';
