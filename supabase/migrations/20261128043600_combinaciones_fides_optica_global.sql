-- Cada combinación tiene una fila de costo por rango comercial. La
-- receta en venta vuelve a calcular el costo con los dos ojos reales.
-- Solo se incorporan productos con costo vigente en la lista Fides 2026.
with combinaciones (tipo, tratamiento, diseno, material_lab, material_stock, montaje_stock) as (
  values
    ('Monofocal', 'Fotocromático Gris 1.56', 'MONOFOCAL CONFORT', 'ORGANICO FOTOCROMATICO 1.56 HMC', 'CR AR FOTO GRIS 1.56', 'ORGANICO FOTO O BLUE SIMPLE'),
    ('Monofocal', 'Adelgazado 1.67 Antirreflejo', 'MONOFOCAL CONFORT', 'ORGANICO 1.67 HMC', 'CR AR 1.67', 'ORGANICO 1.67 SIMPLE'),
    ('Monofocal', 'Adelgazado 1.67 Fotocromático Gris', 'MONOFOCAL CONFORT', 'ORGANICO FOTOCROMATICO 1.67 HMC', 'CR AR FOTO GRIS 1.67', 'ORGANICO 1.67 FOTO O BLUE SIMPLE'),
    ('Monofocal', 'Adelgazado 1.67 Fotocromático Café Slight', 'MONOFOCAL SLIGHT', 'ORGANICO FOTOCROMATICO 1.67 HMC', null, null),
    ('Monofocal', 'Policarbonato 1.59 Antirreflejo', 'MONOFOCAL CONFORT', 'POLICARBONATO 1.59 HMC', 'POLI AR 1.59', 'POLICARBONATO SIMPLE'),
    ('Monofocal', 'Policarbonato 1.59 Fotocromático Gris', 'MONOFOCAL CONFORT', 'POLICARBONATO FOTOCROMATICO 1.59 HMC', 'POLI AR FOTO GRIS 1.59', 'POLICARBONATO FOTO O BLUE SIMPLE'),
    ('Monofocal', 'Adelgazado 1.74 Antirreflejo Extreme', 'MONOFOCAL EXTREME', 'ORGANICO 1.74 HMC', null, null),
    ('Bifocal', 'Flat Top Policarbonato 1.59 Antirreflejo', 'BIFOCAL FLAT TOP', 'POLICARBONATO 1.59 HMC', null, null),
    ('Bifocal', 'Flat Top Policarbonato 1.59 Fotocromático Gris', 'BIFOCAL FLAT TOP', 'POLICARBONATO FOTOCROMATICO 1.59 HMC', null, null),
    ('Bifocal', 'Blended 1.67 Antirreflejo', 'BIFOCAL BLENDERD', 'ORGANICO 1.67 HMC', null, null),
    ('Bifocal', 'Blended 1.67 Filtro Azul', 'BIFOCAL BLENDERD', 'ORGANICO BLUE FILTER 1.67 HMC', null, null),
    ('Bifocal', 'Blended 1.67 Fotocromático Gris', 'BIFOCAL BLENDERD', 'ORGANICO FOTOCROMATICO 1.67 HMC', null, null),
    ('Multifocal', 'Advance 1.67 Antirreflejo', 'MULTIFOCAL ADVANCE', 'ORGANICO 1.67 HMC', null, null),
    ('Multifocal', 'Advance 1.67 Filtro Azul', 'MULTIFOCAL ADVANCE', 'ORGANICO BLUE FILTER 1.67 HMC', null, null),
    ('Multifocal', 'Advance 1.67 Fotocromático Gris', 'MULTIFOCAL ADVANCE', 'ORGANICO FOTOCROMATICO 1.67 HMC', null, null),
    ('Multifocal', 'Advance Policarbonato 1.59 Antirreflejo', 'MULTIFOCAL ADVANCE', 'POLICARBONATO 1.59 HMC', null, null),
    ('Multifocal', 'Advance Policarbonato 1.59 Filtro Azul', 'MULTIFOCAL ADVANCE', 'POLICARBONATO BLUE FILTER 1.59 HMC', null, null),
    ('Multifocal', 'Advance Policarbonato 1.59 Fotocromático Gris', 'MULTIFOCAL ADVANCE', 'POLICARBONATO FOTOCROMATICO 1.59 HMC', null, null),
    ('Multifocal', 'Advance 1.74 Antirreflejo', 'MULTIFOCAL ADVANCE', 'ORGANICO 1.74 HMC', null, null),
    ('Multifocal', 'Drive 1.56 Antirreflejo', 'MULTIFOCAL DRIVE', 'ORGANICO 1.56 HMC', null, null),
    ('Multifocal', 'Office 1.56 Antirreflejo', 'MULTIFOCAL OFFICE', 'ORGANICO 1.56 HMC', null, null),
    ('Multifocal', 'Libratum 1.56 Antirreflejo', 'MULTIFOCAL LIBRATUM', 'ORGANICO 1.56 HMC', null, null)
),
rangos (rango, esfera, cilindro) as (
  values ('±2.00 / ±2.00', 2, 2), ('±4.00 / ±2.00', 4, 2),
         ('±4.00 / ±4.00', 4, 4), ('±6.00 / ±4.00', 6, 4), ('±6.00 / ±6.00', 6, 6)
),
filas as (
  select t.id as tenant_id, c.*, r.rango,
    round((2 * (lab.precio_unitario + coalesce(recargo.precio, 0)) + m.precio) * factor.valor) as costo,
    round((2 * stock.precio + ms.precio) * factor.valor) as costo_stock
  from combinaciones c
  join public.lab_precios_laboratorio lab
    on lab.laboratorio = 'Fides' and lab.lista = '2026'
    and lab.material = c.material_lab and lab.diseno = c.diseno and lab.precio_unitario > 0
  join public.lab_precios_montaje m
    on m.laboratorio = 'Fides' and m.lista = '2026'
    and m.origen = 'laboratorio' and m.material = 'CERRADO' and m.diseno = upper(c.tipo)
  join public.tenants t on lower(btrim(t.nombre_comercial)) in ('óptica global', 'optica global')
  cross join rangos r
  cross join lateral (select 1.19 * (1 - coalesce(t.descuento_laboratorio_pct, 0) / 100.0) as valor) factor
  left join public.lab_precios_recargo recargo
    on recargo.laboratorio = 'Fides' and recargo.lista = '2026'
    and recargo.categoria = 'cilindro' and recargo.concepto = 'CYL SOBRE +/- 4' and r.cilindro > 4
  left join public.lab_precios_montaje ms
    on ms.laboratorio = 'Fides' and ms.lista = '2026'
    and ms.origen = 'stock' and ms.material = c.montaje_stock and ms.diseno = upper(c.tipo)
  left join lateral (
    select min(s.precio_unitario) as precio
    from public.lab_precios_stock s
    where s.laboratorio = 'Fides' and s.lista = '2026' and s.diseno = upper(c.tipo)
      and s.material = c.material_stock and s.esfera_max >= r.esfera and s.cilindro_max >= r.cilindro
  ) stock on true
)
insert into public.costos_cristales (
  tenant_id, tipo_lente, rango_receta, tratamiento, costo, costo_stock, precio_venta,
  precio_venta_stock, material_stock, material_laboratorio, diseno_laboratorio, montaje_material, exige_tarifa
)
select tenant_id, tipo, rango, tratamiento, costo, costo_stock, 0,
  null, material_stock, material_lab, diseno, montaje_stock, true
from filas
on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing;

-- El tope local también recibe recetas mayores que ±6. Cuando Fides las
-- lista hechas, debe haber una tarifa propia para stock. El precio de
-- tallado ya configurado sigue siendo la referencia para ese origen.
update public.costos_cristales c
set exige_tarifa = true
from public.tenants t
where c.tenant_id = t.id
  and lower(btrim(t.nombre_comercial)) in ('óptica global', 'optica global')
  and c.tipo_lente = 'Monofocal'
  and c.tratamiento = 'Adelgazado 1.67 Filtro Azul'
  and c.rango_receta = '±6.00 / ±6.00'
  and c.material_stock = 'CR AR BLUE 1.67';
