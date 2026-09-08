-- La boleta real de Fides (nota de venta 53160) mostró que el costo se
-- estaba calculando con tres supuestos equivocados:
--
--   1. El montaje no es un promedio de $4.000: va de $2.000 (orgánico
--      simple) a $4.500 (multifocal cerrado) según material y diseño.
--   2. El laboratorio hace un descuento por cliente sobre todo el
--      documento, cristales y montaje incluidos.
--   3. Un mismo par puede llevar dos cristales de distinto precio cuando
--      la receta es despareja — eso ya no se resuelve acá sino en
--      src/lib/costo-fides.ts, calculando por ojo contra la lista.

-- Qué fila de la tabla de montaje del laboratorio le corresponde a este
-- cristal cuando sale de stock.
alter table public.costos_cristales
  add column if not exists montaje_material text;

-- Descuento que el laboratorio le hace a esta óptica, en porcentaje sobre
-- la lista. Es por cliente, no por producto.
alter table public.tenants
  add column if not exists descuento_laboratorio_pct numeric(5, 2) not null default 0;

-- Una orden puede llevar dos cristales que no salen del mismo lado: uno
-- de lejos que el laboratorio tiene hecho y uno de cerca que hay que
-- tallar. Antes había un solo origen para los dos, y eso se le informa al
-- paciente (plazo de entrega) además de decidir el costo.
alter table public.ordenes_trabajo
  add column if not exists origen_cristal_2 text
    check (origen_cristal_2 in ('laboratorio', 'stock'));

comment on column public.tenants.descuento_laboratorio_pct is
  'Descuento del laboratorio sobre su lista, en %. Se aplica a cristales y montaje.';
