-- Una sola orden de trabajo por venta, no una por cristal. Antes, una venta
-- con lejos y cerca por separado creaba DOS filas en ordenes_trabajo con
-- folios distintos — al recibir del laboratorio, el dueño tenía que
-- reconocer por nombre/RUT cuáles dos paquetes iban juntos. Con un segundo
-- "cupo" de cristal en la misma fila, la OT ya es "el pedido completo de
-- este paciente": un folio, un papel, una bolsa.

alter table public.ordenes_trabajo
  add column tipo_lente_2 text,
  add column rango_receta_2 text,
  add column tratamiento_2 text,
  add column costo_laboratorio_2 bigint,
  add column armazon_producto_id_2 uuid references public.productos (id);

comment on column public.ordenes_trabajo.tipo_lente_2 is 'Segundo cristal de la misma OT (ej. lejos y cerca por separado en la misma venta). Null si la OT es de un solo cristal.';

-- Cada ítem de cristal en la venta indica a cuál de los dos cupos de la OT
-- corresponde (1 o 2) — antes esto se resolvía con dos OT distintas
-- (ot_id ya bastaba); ahora ambos cristales comparten el mismo ot_id.
alter table public.venta_items
  add column cristal_slot smallint check (cristal_slot in (1, 2));
