-- Lista de precios Fides 2026, transcrita del catálogo oficial que entrega
-- el laboratorio (LISTA_PRECIOS_FIDES_2026.pdf). Todos los valores son
-- POR CRISTAL y SIN IVA, tal como los publica Fides. El costo del par que
-- termina pagando la óptica es (precio_unitario * 2 + montaje) * 1.19.
--
-- Es idempotente: volver a correrla con una lista nueva actualiza los
-- precios que hayan cambiado en vez de duplicar filas.

-- ---------------------------------------------------------------------
-- CRISTALES DE STOCK (cristal ya hecho, se cobra por potencia)
-- ---------------------------------------------------------------------
-- Las 32 columnas de la lista impresa, en orden: 7 de esfera sola, 4 de
-- cilindro solo y 21 combinadas. El valor guardado es el TOPE que cubre la
-- celda: una receta de -3.25 esf / -1.50 cil se cobra en la celda 4/2.
with columnas (idx, esfera_max, cilindro_max) as (values
  (1, 2, 0),
  (2, 4, 0),
  (3, 6, 0),
  (4, 8, 0),
  (5, 10, 0),
  (6, 12, 0),
  (7, 14, 0),
  (8, 0, 2),
  (9, 0, 4),
  (10, 0, 6),
  (11, 0, 8),
  (12, 2, 2),
  (13, 4, 2),
  (14, 6, 2),
  (15, 8, 2),
  (16, 10, 2),
  (17, 12, 2),
  (18, 14, 2),
  (19, 2, 4),
  (20, 4, 4),
  (21, 6, 4),
  (22, 8, 4),
  (23, 10, 4),
  (24, 12, 4),
  (25, 14, 4),
  (26, 2, 6),
  (27, 4, 6),
  (28, 6, 6),
  (29, 8, 6),
  (30, 10, 6),
  (31, 12, 6),
  (32, 14, 6)
),
-- Un array de 32 precios por material, en el mismo orden que "columnas".
-- null = Fides no hace ese cristal en esa potencia.
materiales (material, precios) as (values
  ('CR BLANCO 1.56', array[420,420,600,800,null,null,null,420,1050,1700,null,420,420,600,990,1500,null,null,1000,1000,1200,2500,3000,null,null,1700,1700,2000,3500,null,null,null]::int[]),
  ('CR AR 1.56', array[670,670,940,2100,null,null,null,670,1900,2300,10000,670,670,940,1800,2900,null,null,1850,1850,2100,3200,5000,null,null,2300,2500,2600,5000,null,null,null]::int[]),
  ('CR AR BLUE 1.56', array[1700,1700,2500,null,null,null,null,1700,3500,5900,null,1700,1700,2300,null,null,null,null,3600,3600,3700,null,null,null,null,5900,5900,5900,null,null,null,null]::int[]),
  ('HIDROFOBICO ANTIDESTELLO BL 1.61', array[5900,5900,null,null,null,null,null,5900,8000,10000,null,5900,5900,null,null,null,null,null,8000,8000,null,null,null,null,null,10000,10000,null,null,null,null,null]::int[]),
  ('CR AR FOTO CAFE 1.56', array[2900,2900,4000,null,null,null,null,2900,5800,null,null,2900,2900,4000,null,null,null,null,5900,5900,7500,null,null,null,null,null,null,null,null,null,null,null]::int[]),
  ('CR AR FOTO GRIS 1.56', array[2900,2900,4000,null,null,null,null,2900,5800,10000,null,2900,2900,4000,null,null,null,null,5900,5900,7500,null,null,null,null,10000,11000,12000,null,null,null,null]::int[]),
  ('CR AR FOTO PURPURA 1.56', array[3700,3700,null,null,null,null,null,3700,6500,null,null,3700,3700,null,null,null,null,null,6500,6500,null,null,null,null,null,null,null,null,null,null,null,null]::int[]),
  ('CR AR FOTO VERDE 1.56', array[3700,3700,null,null,null,null,null,3700,6500,null,null,3700,3700,null,null,null,null,null,6500,6500,null,null,null,null,null,null,null,null,null,null,null,null]::int[]),
  ('CR AR FOTO AZUL 1.56', array[3700,3700,null,null,null,null,null,3700,6500,null,null,3700,3700,null,null,null,null,null,6500,6500,null,null,null,null,null,null,null,null,null,null,null,null]::int[]),
  ('CR AR FOTO GRIS BLUE 1.56', array[3700,3700,null,null,null,null,null,3700,6800,12000,null,3700,3700,null,null,null,null,null,6800,6800,null,null,null,null,null,12000,12000,null,null,null,null,null]::int[]),
  ('CR AR 1.67', array[null,null,5900,6900,7900,8900,9900,null,null,null,null,null,null,5900,6900,7900,8900,9900,null,null,6900,7900,8900,10500,12500,null,null,13000,15000,16000,16000,17000]::int[]),
  ('CR AR BLUE 1.67', array[null,null,7900,8900,9900,10900,11900,null,null,null,null,null,null,7900,7900,8500,9400,10500,null,null,8500,9000,10900,12900,13700,null,null,null,null,null,null,null]::int[]),
  ('CR AR FOTO GRIS 1.67', array[null,null,null,8900,10500,12000,14000,null,null,null,null,null,null,null,8900,12000,14000,15000,null,null,null,12000,14000,15000,16000,null,null,null,15000,16000,17000,null]::int[]),
  ('POLI AR 1.59', array[2500,2500,2700,null,null,null,null,2500,5900,8500,null,2500,2500,2900,null,null,null,null,5800,5800,5800,null,null,null,null,8500,8500,8500,null,null,null,null]::int[]),
  ('POLI AR BLUE 1.59', array[4200,4200,4500,null,null,null,null,4200,6900,12000,null,4200,4200,4500,null,null,null,null,6900,6900,7900,null,null,null,null,10000,10000,12000,null,null,null,null]::int[]),
  ('POLI AR FOTO GRIS 1.59', array[9000,9000,null,null,null,null,null,9000,11000,null,null,9000,9000,null,null,null,null,null,11000,11000,null,null,null,null,null,null,null,null,null,null,null,null]::int[])
)
insert into public.lab_precios_stock (diseno, material, esfera_max, cilindro_max, precio_unitario)
select 'MONOFOCAL', m.material, c.esfera_max, c.cilindro_max, m.precios[c.idx]
from materiales m cross join columnas c
where m.precios[c.idx] is not null
on conflict on constraint lab_precios_stock_celda_unica
  do update set precio_unitario = excluded.precio_unitario;

-- Bifocal y multifocal de stock: Fides los publica en una caja aparte, con
-- un precio único dentro de un rango fijo de receta (no por potencia).
insert into public.lab_precios_stock (diseno, material, rango_texto, precio_unitario) values
  ('BIFOCAL', 'FLAT TOP AR 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 2500),
  ('BIFOCAL', 'FLAT TOP AR FOTO GRIS 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 9500),
  ('BIFOCAL', 'FLAT TOP AR BLUE FILTER 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 6000),
  ('BIFOCAL', 'INVISIBLE AR BLUE FILTER 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 7000),
  ('BIFOCAL', 'INVISIBLE AR FOTO GRIS 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 9500),
  ('MULTIFOCAL', 'MULTIFOCAL ANTIREFLEJO 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 8500),
  ('MULTIFOCAL', 'MULTIFOCAL AR FOTO GRIS 1.56', 'Neutros hasta ESF +3.00, ADD +1.00 hasta +3.00', 17000)
on conflict on constraint lab_precios_stock_celda_unica
  do update set precio_unitario = excluded.precio_unitario;

-- ---------------------------------------------------------------------
-- LABORATORIO (cristal tallado a medida, se cobra por diseño x material)
-- ---------------------------------------------------------------------
-- Acá no importa la potencia: el precio lo fija el diseño (MONOFOCAL
-- CONFORT, MULTIFOCAL LIBRATUM, …) cruzado con el material. Los recargos
-- por receta alta van aparte, en lab_precios_recargo.
with materiales (idx, material) as (values
  (1, 'ORGANICO BLANCO 1.56'),
  (2, 'ORGANICO 1.56 HMC'),
  (3, 'ORGANICO BLUE FILTER 1.56 HMC'),
  (4, 'ORGANICO FOTOCROMATICO 1.56 HMC'),
  (5, 'ORGANICO FOTOCROMATICO BLUE FILTER 1.56 HMC'),
  (6, 'POLICARBONATO 1.59 HMC'),
  (7, 'POLICARBONATO BLUE FILTER 1.59 HMC'),
  (8, 'POLICARBONATO FOTOCROMATICO 1.59 HMC'),
  (9, '1.61 ULTRA INPACT FILTRO AZUL AR INFRA ROJO'),
  (10, 'HIDROFOBICO ANTI DESTELLO INFRA ROJO'),
  (11, 'ORGANICO 1.67 HMC'),
  (12, 'ORGANICO BLUE FILTER 1.67 HMC'),
  (13, 'ORGANICO FOTOCROMATICO 1.67 HMC'),
  (14, 'ORGANICO 1.74 HMC'),
  (15, 'ORGANICO POLARIZADO 1.49 HMC'),
  (16, 'POLARIZADO ESPEJADO 1.49 HMC')
),
-- null = Fides no publica precio para esa combinación (no la hace, o hay
-- que consultarla). No es lo mismo que costo cero.
disenos (diseno, precios) as (values
  ('MONOFOCAL CONFORT', array[6000,7500,8000,11000,18000,12000,15000,17500,25000,30000,21000,23000,25000,null,12500,15000]::int[]),
  ('MONOFOCAL PREMIUM', array[8000,10000,16000,18000,20000,13500,17500,20000,28000,35000,23500,25000,22500,null,15000,18000]::int[]),
  ('MONOFOCAL SLIGHT', array[null,null,null,null,null,null,null,null,35000,40000,25000,30000,35000,100000,18000,22000]::int[]),
  ('MONOFOCAL EXTREME', array[null,null,null,null,null,null,null,null,35000,40000,30000,35000,40000,100000,null,null]::int[]),
  ('BIFOCAL FLAT TOP', array[5000,10500,19000,22500,25000,16000,null,40000,null,null,null,null,null,null,null,null]::int[]),
  ('BIFOCAL BLENDERD', array[7500,12000,21000,24500,26000,18000,20500,28000,30000,38000,28500,31000,35000,null,27000,32000]::int[]),
  ('BIFOCAL KRIPTOK', array[7500,12000,21000,24500,26000,18000,20500,28000,30000,38000,28500,31000,35000,null,27000,32000]::int[]),
  ('MULTIFOCAL CONFORT', array[13000,16000,23000,25500,30000,23000,27000,28500,30000,45000,32000,35000,38000,115000,30000,35000]::int[]),
  ('MULTIFOCAL ADVANCE', array[22500,27000,34000,36000,38000,32000,38000,40000,40000,60000,41000,42500,45000,130000,36000,40000]::int[]),
  ('MULTIFOCAL LIBRATUM', array[34000,45000,59000,65000,68000,50000,54000,70000,70000,80000,66000,70000,73000,180500,46000,50000]::int[]),
  ('MULTIFOCAL DRIVE', array[null,16000,22000,26000,28000,21000,24000,29000,30000,40000,30000,34000,35000,100000,28000,33000]::int[]),
  ('MULTIFOCAL OFFICE', array[null,16000,22000,26000,28000,21000,24000,29000,30000,40000,30000,34000,35000,100000,28000,33000]::int[])
)
insert into public.lab_precios_laboratorio (diseno, material, precio_unitario, nota)
select d.diseno, m.material, d.precios[m.idx],
  case
    -- Estas dos columnas salen impresas en rosado con la leyenda
    -- "PRÓXIMAMENTE - CONSULTAR POR STOCK".
    when m.material in ('1.61 ULTRA INPACT FILTRO AZUL AR INFRA ROJO',
                        'HIDROFOBICO ANTI DESTELLO INFRA ROJO')
      then 'Proximamente - consultar por stock'
    -- En SLIGHT y EXTREME el precio de las columnas fotocromáticas queda
    -- tapado en la lista impresa por el sello "SOLO Café/Gris": Fides no
    -- publica cifra ahí, hay que preguntarla.
    when d.diseno in ('MONOFOCAL SLIGHT', 'MONOFOCAL EXTREME')
     and m.material like 'ORGANICO FOTOCROMATICO%1.56 HMC'
      then 'Solo cafe o gris - precio no publicado, consultar'
  end
from disenos d cross join materiales m
on conflict on constraint lab_precios_laboratorio_celda_unica
  do update set precio_unitario = excluded.precio_unitario, nota = excluded.nota;

-- ---------------------------------------------------------------------
-- MONTAJE (dejar el cristal calzado en el armazón)
-- ---------------------------------------------------------------------
with filas (material, codigos, precios) as (values
  ('ORGANICO SIMPLE', array['301','323','345'], array[2000,5000,6000]::int[]),
  ('ORGANICO RANURADO', array['302','324','346'], array[3000,6000,7000]::int[]),
  ('ORGANICO FOTO O BLUE SIMPLE', array['303','325','347'], array[3000,6000,7000]::int[]),
  ('ORGANICO FOTO O BLUE RANURADO', array['304','326','348'], array[4000,7000,8000]::int[]),
  ('ORGANICO FOTO BLUE SIMPLE', array['305','327','349'], array[4000,7000,8000]::int[]),
  ('ORGANICO FOTO BLUE RANURADO', array['306','328','350'], array[5000,8000,9000]::int[]),
  ('ORGANICO 1.67 SIMPLE', array['307','329','351'], array[5000,8000,9000]::int[]),
  ('ORGANICO 1.67 RANURADO', array['308','330','352'], array[6000,9000,10000]::int[]),
  ('ORGANICO 1.67 PERFORADO', array['309','331','353'], array[8000,9000,12000]::int[]),
  ('ORGANICO 1.67 FOTO O BLUE SIMPLE', array['310','332','354'], array[6000,9000,10000]::int[]),
  ('ORGANICO 1.67 FOTO O BLUE RANURADO', array['311','333','355'], array[7000,10000,11000]::int[]),
  ('ORGANICO 1.67 FOTO O BLUE PERFORADO', array['312','334','356'], array[9000,10000,13000]::int[]),
  ('ORGANICO POLARIZADO SIMPLE', array['313','335','357'], array[3000,6000,7000]::int[]),
  ('ORGANICO POLARIZADO RANURADO', array['314','336','358'], array[5000,7000,9000]::int[]),
  ('ORGANICO POLARIZADO ESPEJADO SIMPLE', array['315','337','359'], array[4000,7000,8000]::int[]),
  ('ORGANICO POLARIZADO ESPEJADO RANURADO', array['316','338','360'], array[6000,8000,10000]::int[]),
  ('POLICARBONATO SIMPLE', array['317','339','361'], array[4000,6000,7000]::int[]),
  ('POLICARBONATO RANURADO', array['318','340','362'], array[5000,8000,9000]::int[]),
  ('POLICARBONATO PERFORADO', array['319','341','363'], array[6000,9000,10000]::int[]),
  ('POLICARBONATO FOTO O BLUE SIMPLE', array['320','342','364'], array[5000,7000,9000]::int[]),
  ('POLICARBONATO FOTO O BLUE RANURADO', array['321','343','365'], array[6000,9000,10000]::int[]),
  ('POLICARBONATO FOTO O BLUE PERFORADO', array['322','344','366'], array[9000,10000,12000]::int[])
)
insert into public.lab_precios_montaje (origen, material, diseno, codigo, precio)
select 'stock', f.material, d.diseno, f.codigos[d.idx], f.precios[d.idx]
from filas f
cross join (values (1, 'MONOFOCAL'), (2, 'BIFOCAL'), (3, 'MULTIFOCAL')) as d(idx, diseno)
on conflict on constraint lab_precios_montaje_celda_unica
  do update set precio = excluded.precio, codigo = excluded.codigo;

-- Montaje de los cristales que se mandan a tallar: se cobra por cómo
-- sujeta el armazón, no por el material.
insert into public.lab_precios_montaje (origen, material, diseno, precio) values
  ('laboratorio', 'CERRADO', 'MONOFOCAL', 3000),
  ('laboratorio', 'CERRADO', 'BIFOCAL', 4000),
  ('laboratorio', 'CERRADO', 'MULTIFOCAL', 4500),
  ('laboratorio', 'RANURADO', 'MONOFOCAL', 4000),
  ('laboratorio', 'RANURADO', 'BIFOCAL', 5000),
  ('laboratorio', 'RANURADO', 'MULTIFOCAL', 5500),
  ('laboratorio', 'PERFORADO', 'MONOFOCAL', 6000),
  ('laboratorio', 'PERFORADO', 'BIFOCAL', 7000),
  ('laboratorio', 'PERFORADO', 'MULTIFOCAL', 7500)
on conflict on constraint lab_precios_montaje_celda_unica
  do update set precio = excluded.precio;

-- ---------------------------------------------------------------------
-- OTROS SERVICIOS: recargos que Fides suma cuando la receta lo exige
-- ---------------------------------------------------------------------
insert into public.lab_precios_recargo (categoria, concepto, precio) values
  ('trabajo', 'DESCENTRADOS', 1000),
  ('trabajo', 'CURVA', 1000),
  ('prisma', 'PRISMA HASTA 3', 1900),
  ('prisma', 'PRISMA HASTA 5', 2000),
  ('prisma', 'PRISMA SOBRE 5', 2900),
  ('tenido', 'TENIDO SOLIDO', 3000),
  ('tenido', 'TENIDO DEGRADE', 4000),
  ('cilindro', 'CYL SOBRE +/- 4', 1500),
  ('cilindro', 'CYL SOBRE +/- 6', 3000),
  ('cilindro', 'CYL SOBRE +/- 8', 5000),
  ('esfera', 'ESF SOBRE +/- 10', 3500),
  ('esfera', 'ESF SOBRE +/- 12', 5500),
  ('esfera', 'ESF SOBRE +/- 14', 7000),
  ('esfera', 'ESF SOBRE +/- 16', 8000),
  ('esfera', 'ESF SOBRE +/- 25', 9500)
on conflict on constraint lab_precios_recargo_concepto_unico
  do update set precio = excluded.precio;
