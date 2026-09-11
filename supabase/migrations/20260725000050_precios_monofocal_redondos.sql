-- Deja los precios de venta de Monofocal en números redondos y parejos
-- por tratamiento, en vez de que suban a saltos según el rango de la
-- receta cuando el costo real casi no se mueve. Solo para el tenant de
-- Pablo (Óptica Lentia): es su decisión de negocio sobre sus propios
-- márgenes, no algo que deba aplicarse a otras ópticas que parten de la
-- misma plantilla de catálogo.
--
-- El costo (columna costo, ya calzada con el catálogo real de Fides desde
-- la migración 20260725000037) prácticamente no cambia entre rangos
-- dentro de un mismo tratamiento — sube como mucho un 10-17% del rango
-- más simple al más complejo. El precio de venta, en cambio, venía
-- multiplicándose por dos o tres: Orgánico Filtro Azul pasaba de $48.000 a
-- $114.923 sin que el lente costara casi nada más. Eso ya causó una venta
-- real a $50.736 por lo mismo que otros pagaron $48.000 — un precio que
-- ni el vendedor ni el cliente podían anticipar.
--
-- Con precio parejo por tratamiento, cualquiera en el mesón puede decir
-- el precio de memoria y no hay sorpresas de un cliente al siguiente.
-- Los siete tratamientos quedan con margen entre 41% y 68% incluso en el
-- rango de receta más caro, así que ninguno pasa a vender con pérdida.
update public.costos_cristales
set precio_venta = case tratamiento
  when 'Orgánico Antirreflejo' then 38000
  when 'Orgánico Filtro Azul' then 48000
  when 'Fotocromático Café Antirreflejo' then 70000
  when 'Fotocromático Gris Filtro Azul' then 80000
  when 'Policarbonato Filtro Azul' then 75000
  when 'Adelgazado 1.67 Filtro Azul' then 110000
  when 'Polarizado Gris Oscuro' then 95000
end
where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and tipo_lente = 'Monofocal'
  and tratamiento in (
    'Orgánico Antirreflejo', 'Orgánico Filtro Azul', 'Fotocromático Café Antirreflejo',
    'Fotocromático Gris Filtro Azul', 'Policarbonato Filtro Azul', 'Adelgazado 1.67 Filtro Azul',
    'Polarizado Gris Oscuro'
  );
