-- Se reemplaza el diseño anterior (operativo = una sucursal con
-- tipo='operativo') por una tabla propia (ver 20260725000017_operativos.sql):
-- mezclar los dos conceptos en la misma tabla hacía que el selector de
-- sucursal de inventario (que es para stock físico, no para operativos)
-- se llenara de operativos pasados. sucursales vuelve a ser solo para
-- control de stock.
alter table public.sucursales
  drop column if exists tipo,
  drop column if exists fecha_operativo,
  drop column if exists contacto_nombre,
  drop column if exists contacto_telefono;

alter table public.recetas
  drop column if exists sucursal_id;
