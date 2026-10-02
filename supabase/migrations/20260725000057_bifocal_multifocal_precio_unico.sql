-- Bifocal y Multifocal: un solo precio, salga de stock o de laboratorio.
--
-- Pedido de la óptica (2026-10-02): "si hay un multifocal que está dentro
-- de stock, venderlo al mismo precio que lo vendemos igual, siempre... pero
-- que se ponga solo en stock en el pedido, porque así reducimos costos".
-- El código ya no usa precio_venta_stock para estos dos tipos de lente
-- (lib/precio-venta.ts); acá se limpia el dato para que /precios no muestre
-- un número que nunca se cobra.
--
-- Y la lista de precios que dio la óptica:
--   Bifocal:    antirreflejo 120 · filtro azul 150 · fotocromático 180
--   Multifocal: antirreflejo 180 · filtro azul 200 · fotocromático 220
-- El fotocromático vale lo mismo sea café o gris. El último rango
-- (±6.00 / ±6.00) conserva los $5.000 extra que ya tenía.
--
-- Solo la óptica P&P: costos_cristales es por tenant.

update public.costos_cristales
   set precio_venta_stock = null
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and precio_venta_stock is not null;

-- Multifocal fotocromático: 220 (225 en el rango más exigente), café y gris
-- por igual.
update public.costos_cristales
   set precio_venta = case when rango_receta = '±6.00 / ±6.00' then 225000 else 220000 end
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente = 'Multifocal'
   and tratamiento in ('Fotocromático Café Antirreflejo', 'Fotocromático Gris Filtro Azul');

-- Bifocal fotocromático café: igual que el gris en el rango más exigente.
update public.costos_cristales
   set precio_venta = 185000
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente = 'Bifocal'
   and tratamiento = 'Fotocromático Café Antirreflejo'
   and rango_receta = '±6.00 / ±6.00';
