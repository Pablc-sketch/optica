-- Multifocal Fotocromático Gris Filtro Azul: saca la opción de stock que
-- había quedado en el rango más bajo.
--
-- Fides sí tiene esa combinación hecha de stock (MULTIFOCAL AR FOTO GRIS
-- 1.56, $17.000 por cristal), pero venderla a $130.000 no corresponde con
-- este tratamiento: es el combo más premium del catálogo (multifocal +
-- fotocromático + filtro azul) y en los otros cuatro rangos de la misma
-- fila ya no hay precio de stock cargado — queda igual que todos:
-- siempre se cotiza al precio de laboratorio ($225.000).
--
-- No se toca lab_precios_stock: el dato del proveedor se queda, por si
-- algún día conviene volver a ofrecerlo; solo se deja de mostrárselo al
-- paciente como opción de venta.
update public.costos_cristales
   set precio_venta_stock = null
 where tipo_lente = 'Multifocal'
   and tratamiento = 'Fotocromático Gris Filtro Azul'
   and rango_receta = '±2.00 / ±2.00'
   and precio_venta_stock is not null;
