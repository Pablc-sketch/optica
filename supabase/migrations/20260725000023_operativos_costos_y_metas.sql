-- Costos reales del operativo (transporte, arriendo del espacio, viáticos,
-- otros) para poder mostrar utilidad neta (vendido - costos) en vez de solo
-- lo vendido en bruto — y metas opcionales (examenes/monto) para medir el
-- avance en vivo durante el operativo.
alter table public.operativos
  add column if not exists costo_transporte bigint not null default 0,
  add column if not exists costo_arriendo bigint not null default 0,
  add column if not exists costo_viaticos bigint not null default 0,
  add column if not exists costo_otros bigint not null default 0,
  add column if not exists meta_examenes integer,
  add column if not exists meta_ventas bigint;
