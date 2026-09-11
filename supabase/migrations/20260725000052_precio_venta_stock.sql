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

-- Mismo criterio para el resto de Monofocal: precio de stock y precio de
-- laboratorio separados, escalando con el costo real de cada rango en
-- vez de un número parejo.
--
-- Se revisó la grilla real de Fides (lab_precios_stock) para cada
-- material:
--   · CR AR 1.56 (Orgánico AR) y CR AR BLUE 1.56 (Orgánico Filtro Azul):
--     cubren de sobra hasta esfera 6 y cilindro 6 — los cinco rangos
--     salen SIEMPRE de stock, nunca van a laboratorio en la práctica.
--   · POLI AR BLUE 1.59 (Policarbonato Filtro Azul): igual, cubre hasta
--     esfera 6 / cilindro 6 — los cinco rangos siempre de stock.
--   · CR AR BLUE 1.67 (Adelgazado 1.67 Filtro Azul): el cilindro de esta
--     grilla tope a 4.00 para CUALQUIER esfera — el rango ±6.00/±6.00
--     (que necesita cilindro hasta 6) queda siempre fuera, siempre va a
--     laboratorio. Acá no hay caso mixto como el de Franco Lobos: la
--     grilla entera de este material no llega a cilindro 6, así que no
--     hay ninguna receta de ese rango que caiga en stock por casualidad.
update public.costos_cristales
set precio_venta_stock = case rango_receta
    when '±2.00 / ±2.00' then 38000
    when '±4.00 / ±2.00' then 38000
    when '±4.00 / ±4.00' then 42000
    when '±6.00 / ±4.00' then 45000
    when '±6.00 / ±6.00' then 48000
  end,
  precio_venta = case rango_receta
    when '±6.00 / ±6.00' then 58000
    else 55000
  end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal' and tratamiento = 'Orgánico Antirreflejo';

update public.costos_cristales
set precio_venta_stock = case rango_receta
    when '±2.00 / ±2.00' then 48000
    when '±4.00 / ±2.00' then 48000
    when '±4.00 / ±4.00' then 55000
    when '±6.00 / ±4.00' then 58000
    when '±6.00 / ±6.00' then 65000
  end,
  precio_venta = case rango_receta
    when '±6.00 / ±6.00' then 72000
    else 68000
  end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal' and tratamiento = 'Orgánico Filtro Azul';

update public.costos_cristales
set precio_venta_stock = case rango_receta
    when '±2.00 / ±2.00' then 75000
    when '±4.00 / ±2.00' then 75000
    when '±4.00 / ±4.00' then 85000
    when '±6.00 / ±4.00' then 90000
    when '±6.00 / ±6.00' then 105000
  end,
  precio_venta = case rango_receta
    when '±6.00 / ±6.00' then 120000
    else 115000
  end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal' and tratamiento = 'Policarbonato Filtro Azul';

-- Adelgazado 1.67 Filtro Azul: el rango ±6.00/±6.00 no tiene precio de
-- stock (siempre laboratorio para este material, ver nota arriba).
update public.costos_cristales
set precio_venta_stock = case rango_receta
    when '±2.00 / ±2.00' then 95000
    when '±4.00 / ±2.00' then 95000
    when '±4.00 / ±4.00' then 100000
    when '±6.00 / ±4.00' then 100000
    else null
  end,
  precio_venta = case rango_receta
    when '±6.00 / ±6.00' then 150000
    else 135000
  end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal' and tratamiento = 'Adelgazado 1.67 Filtro Azul';

-- Confirmado: para Fotocromático Gris Filtro Azul la grilla de stock de
-- Fides (CR AR FOTO GRIS BLUE 1.56) topa en esfera 4.00 — cualquier
-- esfera mayor a 4 siempre va a laboratorio. Ya quedaba así arriba; este
-- comentario deja constancia de que se volvió a verificar contra la
-- grilla real.

-- BIFOCAL y MULTIFOCAL: acá el stock del laboratorio no sigue una grilla
-- de potencias como el resto — es una caja aparte con un rango fijo muy
-- chico (recetas prácticamente neutras). En la práctica eso significa que
-- SOLO el rango más simple (±2.00/±2.00) puede llegar a salir de stock;
-- el resto SIEMPRE va a laboratorio, sin ningún caso mixto como el del
-- Fotocromático Gris Blue en Monofocal. Se separa el precio de stock
-- únicamente en ese primer rango, para los tratamientos que sí tienen
-- material de stock asignado (Antirreflejo y, donde existe, Fotocromático
-- Gris Filtro Azul); el resto de los rangos se deja en el precio de
-- laboratorio que ya tenían, con un ajuste menor en ±6.00/±6.00 para
-- reflejar su costo algo mayor.
--
-- Los tratamientos que en Bifocal/Multifocal NUNCA tienen material de
-- stock (Fotocromático Café, Polarizado, Policarbonato Filtro Azul,
-- Multifocal/Orgánico Filtro Azul) no se tocan: ya tenían un solo precio
-- razonable y no hay nada que separar.
update public.costos_cristales
set precio_venta_stock = case when rango_receta = '±2.00 / ±2.00' then 60000 end,
    precio_venta = case when rango_receta = '±6.00 / ±6.00' then 125000 else 120000 end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo_lente = 'Bifocal'
  and tratamiento in ('Bifocal Antirreflejo', 'Orgánico Antirreflejo');

update public.costos_cristales
set precio_venta_stock = case when rango_receta = '±2.00 / ±2.00' then 75000 end,
    precio_venta = case when rango_receta = '±6.00 / ±6.00' then 155000 else 150000 end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo_lente = 'Bifocal'
  and tratamiento in ('Bifocal Filtro Azul', 'Orgánico Filtro Azul');

update public.costos_cristales
set precio_venta_stock = case when rango_receta = '±2.00 / ±2.00' then 95000 end,
    precio_venta = case when rango_receta = '±6.00 / ±6.00' then 185000 else 180000 end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo_lente = 'Bifocal'
  and tratamiento = 'Fotocromático Gris Filtro Azul';

update public.costos_cristales
set precio_venta_stock = case when rango_receta = '±2.00 / ±2.00' then 105000 end,
    precio_venta = case when rango_receta = '±6.00 / ±6.00' then 185000 else 180000 end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo_lente = 'Multifocal'
  and tratamiento in ('Multifocal Antirreflejo', 'Orgánico Antirreflejo');

update public.costos_cristales
set precio_venta_stock = case when rango_receta = '±2.00 / ±2.00' then 130000 end,
    precio_venta = case when rango_receta = '±6.00 / ±6.00' then 230000 else 225000 end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo_lente = 'Multifocal'
  and tratamiento = 'Fotocromático Gris Filtro Azul';
