-- Operativos: en vez de una tabla nueva, se reusa sucursales — un operativo
-- es, en la práctica, un punto de atención temporal (colegio, empresa,
-- junta de vecinos) con los mismos usos que ya tiene una sucursal fija
-- (columna sucursal_id en inventario, ventas, ordenes_trabajo). Se agrega
-- 'tipo' para distinguir uno de otro y datos propios del operativo (fecha,
-- contacto) que una sucursal fija no necesita.
alter table public.sucursales
  add column if not exists tipo text not null default 'local' check (tipo in ('local', 'operativo')),
  add column if not exists fecha_operativo date,
  add column if not exists contacto_nombre text,
  add column if not exists contacto_telefono text;

-- La receta queda ligada a dónde se hizo el examen (operativo o local), para
-- poder filtrar reportes y hacer seguimiento de exámenes tomados en terreno
-- que todavía no se convirtieron en venta.
alter table public.recetas
  add column if not exists sucursal_id uuid references public.sucursales (id);
