-- Anular una venta: para corregir un error (venta de prueba, cliente
-- equivocado, monto mal cobrado) sin borrar el comprobante — a diferencia
-- de eliminar OT, esto sí se permite aunque ya tenga pagos, porque el caso
-- real es "esto no debió pasar", no "todavía no se cobró nada". La venta
-- queda marcada, no desaparece, y se excluye de los reportes.
alter table public.ventas add column if not exists anulada boolean not null default false;
alter table public.ventas add column if not exists anulada_motivo text;

-- La OT ligada a una venta anulada deja de estar "en curso" en el tablero.
alter table public.ordenes_trabajo drop constraint if exists ordenes_trabajo_estado_check;
alter table public.ordenes_trabajo add constraint ordenes_trabajo_estado_check
  check (estado in ('recepcion', 'laboratorio', 'montaje', 'listo', 'entregado', 'cancelado'));
