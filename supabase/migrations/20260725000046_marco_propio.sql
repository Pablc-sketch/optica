-- Cuando el paciente trae su propio marco para hacerle el lente, no se le
-- entrega ninguno del stock: no hay que descontar inventario ni contar el
-- costo de reposición ($4.000) de un marco que nunca salió de acá. Antes
-- eso quedaba indistinguible de "se le olvidó registrar el marco" — los
-- dos casos dejaban armazon_producto_id en null. Con esta bandera queda
-- explícito, y la planilla del laboratorio y la OT lo imprimen claro en
-- vez de un "—" ambiguo.
alter table public.ordenes_trabajo
  add column if not exists marco_propio boolean not null default false,
  add column if not exists marco_propio_2 boolean not null default false;

comment on column public.ordenes_trabajo.marco_propio is
  'El paciente trajo su propio marco para este cristal — no sale del stock, no se descuenta inventario ni se cuenta el costo de reposición.';
