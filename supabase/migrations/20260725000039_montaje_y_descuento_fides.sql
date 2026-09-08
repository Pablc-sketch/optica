-- Qué montaje le cobra el laboratorio a cada cristal de stock. Se deduce
-- del material: el orgánico pelado es el más barato, cualquier cosa con
-- fotocromático o filtro azul sube un escalón, el 1.67 y el policarbonato
-- otro. El diseño (monofocal / bifocal / multifocal) lo pone la tabla de
-- montaje, no esta columna.
update public.costos_cristales
set montaje_material = case
  when tratamiento ilike '%1.67%' then 'ORGANICO 1.67 FOTO O BLUE SIMPLE'
  when tratamiento ilike '%policarbonato%' then 'POLICARBONATO FOTO O BLUE SIMPLE'
  when tratamiento ilike '%polarizado%' then 'ORGANICO POLARIZADO SIMPLE'
  when tratamiento ilike '%fotocrom%' or tratamiento ilike '%filtro azul%' then 'ORGANICO FOTO O BLUE SIMPLE'
  else 'ORGANICO SIMPLE'
end
where montaje_material is null;

-- El multifocal que Fides le hace a esta óptica es el ADVANCE, no el
-- CONFORT: así salió en la nota de venta 53160. Son $34.000 el cristal
-- contra $23.000, y cotizarlo con el barato dejaba la venta con un costo
-- que no era.
update public.costos_cristales
set diseno_laboratorio = 'MULTIFOCAL ADVANCE'
where tipo_lente = 'Multifocal' and diseno_laboratorio = 'MULTIFOCAL CONFORT';

-- Recalcular los dos costos con el montaje real de cada material y el
-- descuento del laboratorio, en vez del promedio de $4.000 que se venía
-- usando. Estas cifras son el respaldo del catálogo: el costo que queda
-- guardado en cada venta se calcula por ojo contra la lista
-- (src/lib/costo-fides.ts), que es como cobra el laboratorio.
with banda (rango_receta, esf, cil) as (values
  ('±2.00 / ±2.00', 2, 2), ('±4.00 / ±2.00', 4, 2), ('±4.00 / ±4.00', 4, 4),
  ('±6.00 / ±4.00', 6, 4), ('±6.00 / ±6.00', 6, 6)
),
calc as (
  select c.id, b.cil, coalesce(t.descuento_laboratorio_pct, 0) as desc_pct,
    upper(case c.tipo_lente when 'Monofocal' then 'MONOFOCAL'
          when 'Bifocal' then 'BIFOCAL' else 'MULTIFOCAL' end) as diseno_base,
    -- La celda más barata de las que alcanzan a cubrir la receta, que es
    -- la que despacha el laboratorio.
    (select min(s.precio_unitario) from public.lab_precios_stock s
      where s.material = c.material_stock
        and ((s.diseno = 'MONOFOCAL' and s.esfera_max >= b.esf and s.cilindro_max >= b.cil)
          or (s.diseno <> 'MONOFOCAL' and b.esf <= 2))) as u_stock,
    (select l.precio_unitario from public.lab_precios_laboratorio l
      where l.diseno = c.diseno_laboratorio and l.material = c.material_laboratorio) as u_lab
  from public.costos_cristales c
  join banda b on b.rango_receta = c.rango_receta
  join public.tenants t on t.id = c.tenant_id
),
conmontaje as (
  select calc.*,
    (select m.precio from public.lab_precios_montaje m
      join public.costos_cristales c on c.id = calc.id
      where m.origen = 'stock' and m.material = c.montaje_material and m.diseno = calc.diseno_base) as mont_stock,
    (select m.precio from public.lab_precios_montaje m
      where m.origen = 'laboratorio' and m.material = 'CERRADO' and m.diseno = calc.diseno_base) as mont_lab
  from calc
)
update public.costos_cristales c
set costo_stock = round((x.u_stock * 2 + coalesce(x.mont_stock, 0)) * (1 - x.desc_pct / 100) * 1.19),
    costo = coalesce(
      round(((x.u_lab + case when x.cil > 4 then 1500 else 0 end) * 2 + coalesce(x.mont_lab, 0))
            * (1 - x.desc_pct / 100) * 1.19),
      c.costo)
from conmontaje x
where x.id = c.id;
