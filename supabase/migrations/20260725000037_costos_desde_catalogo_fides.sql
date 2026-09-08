-- Deja los costos de cristales calzados con la lista real de Fides 2026
-- (lab_precios_stock / lab_precios_laboratorio) en vez de las cifras que
-- venían de la plantilla genérica. Primero se escribe la equivalencia
-- entre el nombre interno con que se vende acá y el nombre del catálogo
-- del laboratorio, y después los dos costos se calculan solos desde ahí.
--
-- Solo toca costo y costo_stock: el precio de venta es decisión de la
-- óptica y no se cambia.

update public.costos_cristales c
set material_stock = m.mat_stock,
    material_laboratorio = m.mat_lab,
    diseno_laboratorio = case c.tipo_lente
      when 'Monofocal' then 'MONOFOCAL CONFORT'
      when 'Multifocal' then 'MULTIFOCAL CONFORT'
      -- Fides no hace FLAT TOP en policarbonato blue ni en polarizado; ahí
      -- el bifocal equivalente más barato de su lista es el KRIPTOK.
      when 'Bifocal' then case when exists (
          select 1 from public.lab_precios_laboratorio l
          where l.diseno = 'BIFOCAL FLAT TOP' and l.material = m.mat_lab
            and l.precio_unitario is not null
        ) then 'BIFOCAL FLAT TOP' else 'BIFOCAL KRIPTOK' end
    end
from (values
  ('Monofocal','Orgánico Antirreflejo',            'CR AR 1.56',                  'ORGANICO 1.56 HMC'),
  ('Monofocal','Orgánico Filtro Azul',             'CR AR BLUE 1.56',             'ORGANICO BLUE FILTER 1.56 HMC'),
  ('Monofocal','Fotocromático Café Antirreflejo',  'CR AR FOTO CAFE 1.56',        'ORGANICO FOTOCROMATICO 1.56 HMC'),
  ('Monofocal','Fotocromático Gris Filtro Azul',   'CR AR FOTO GRIS BLUE 1.56',   'ORGANICO FOTOCROMATICO BLUE FILTER 1.56 HMC'),
  ('Monofocal','Policarbonato Filtro Azul',        'POLI AR BLUE 1.59',           'POLICARBONATO BLUE FILTER 1.59 HMC'),
  ('Monofocal','Adelgazado 1.67 Filtro Azul',      'CR AR BLUE 1.67',             'ORGANICO BLUE FILTER 1.67 HMC'),
  ('Monofocal','Polarizado Gris Oscuro',            null,                         'ORGANICO POLARIZADO 1.49 HMC'),
  ('Bifocal','Bifocal Antirreflejo',               'FLAT TOP AR 1.56',            'ORGANICO 1.56 HMC'),
  ('Bifocal','Orgánico Antirreflejo',              'FLAT TOP AR 1.56',            'ORGANICO 1.56 HMC'),
  ('Bifocal','Bifocal Filtro Azul',                'FLAT TOP AR BLUE FILTER 1.56','ORGANICO BLUE FILTER 1.56 HMC'),
  ('Bifocal','Orgánico Filtro Azul',               'FLAT TOP AR BLUE FILTER 1.56','ORGANICO BLUE FILTER 1.56 HMC'),
  ('Bifocal','Fotocromático Café Antirreflejo',     null,                         'ORGANICO FOTOCROMATICO 1.56 HMC'),
  ('Bifocal','Fotocromático Gris Filtro Azul',     'FLAT TOP AR FOTO GRIS 1.56',  'ORGANICO FOTOCROMATICO BLUE FILTER 1.56 HMC'),
  ('Bifocal','Policarbonato Filtro Azul',           null,                         'POLICARBONATO BLUE FILTER 1.59 HMC'),
  ('Bifocal','Polarizado Gris Oscuro',              null,                         'ORGANICO POLARIZADO 1.49 HMC'),
  ('Multifocal','Multifocal Antirreflejo',         'MULTIFOCAL ANTIREFLEJO 1.56', 'ORGANICO 1.56 HMC'),
  ('Multifocal','Orgánico Antirreflejo',           'MULTIFOCAL ANTIREFLEJO 1.56', 'ORGANICO 1.56 HMC'),
  ('Multifocal','Multifocal Filtro Azul',           null,                         'ORGANICO BLUE FILTER 1.56 HMC'),
  ('Multifocal','Orgánico Filtro Azul',             null,                         'ORGANICO BLUE FILTER 1.56 HMC'),
  ('Multifocal','Fotocromático Café Antirreflejo',  null,                         'ORGANICO FOTOCROMATICO 1.56 HMC'),
  ('Multifocal','Fotocromático Gris Filtro Azul',  'MULTIFOCAL AR FOTO GRIS 1.56','ORGANICO FOTOCROMATICO BLUE FILTER 1.56 HMC'),
  ('Multifocal','Policarbonato Filtro Azul',        null,                         'POLICARBONATO BLUE FILTER 1.59 HMC'),
  ('Multifocal','Polarizado Gris Oscuro',           null,                         'ORGANICO POLARIZADO 1.49 HMC')
) as m(tipo_lente, tratamiento, mat_stock, mat_lab)
where c.tipo_lente = m.tipo_lente and c.tratamiento = m.tratamiento;

-- Costo del par = precio unitario del laboratorio × 2 + montaje + IVA.
-- El montaje se toma como $4.000 promedio (la tabla de Fides va de $2.000
-- a $13.000 según material y armazón).
with banda (rango_receta, esf, cil) as (values
  ('±2.00 / ±2.00', 2, 2), ('±4.00 / ±2.00', 4, 2), ('±4.00 / ±4.00', 4, 4),
  ('±6.00 / ±4.00', 6, 4), ('±6.00 / ±6.00', 6, 6)
),
calc as (
  select c.id, b.cil,
    -- Stock: el precio depende de la potencia. El bifocal/multifocal de
    -- stock tiene un rango fijo chico, así que solo aplica a la receta más
    -- simple; más arriba de eso el laboratorio lo talla igual.
    (select s.precio_unitario from public.lab_precios_stock s
      where s.material = c.material_stock
        and (   (s.diseno = 'MONOFOCAL' and s.esfera_max = b.esf and s.cilindro_max = b.cil)
             or (s.diseno <> 'MONOFOCAL' and b.esf = 2 and b.cil = 2))
      limit 1) as u_stock,
    -- Tallado a medida: el precio lo fija el diseño y el material, no la
    -- potencia; lo único que sube es el recargo por cilindro alto.
    (select l.precio_unitario from public.lab_precios_laboratorio l
      where l.diseno = c.diseno_laboratorio and l.material = c.material_laboratorio) as u_lab
  from public.costos_cristales c
  join banda b on b.rango_receta = c.rango_receta
)
update public.costos_cristales c
set costo_stock = round((calc.u_stock * 2 + 4000) * 1.19),
    -- Fides cobra $1.500 por cristal cuando el cilindro pasa de ±4.
    costo = coalesce(
      round(((calc.u_lab + case when calc.cil > 4 then 1500 else 0 end) * 2 + 4000) * 1.19),
      c.costo)
from calc
where calc.id = c.id;
