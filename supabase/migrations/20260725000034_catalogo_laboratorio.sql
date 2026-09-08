-- Lista de precios del laboratorio proveedor, guardada tal cual la publica
-- el laboratorio (Fides 2026). Hasta ahora el único costo que conocía la
-- app era costos_cristales: una sola cifra por tipo de lente x rango x
-- tratamiento, cargada a mano. Eso mezcla dos listas que el laboratorio
-- cobra distinto:
--
--   * CRISTALES DE STOCK — el cristal ya está hecho y se cobra según la
--     potencia (esfera, cilindro o la combinación de ambas). Es el barato.
--   * LABORATORIO — el cristal se talla a medida y se cobra según el
--     diseño (MONOFOCAL CONFORT, MULTIFOCAL LIBRATUM, …) por el material
--     (ORGÁNICO 1.56 HMC, POLICARBONATO BLUE FILTER 1.59 HMC, …), sin
--     importar la potencia. Es el caro.
--
-- Con las dos listas acá adentro se puede auditar el costo real de cada
-- venta y saber si el precio de venta deja el margen que corresponde, en
-- vez de confiar en una tabla escrita a mano hace meses.
--
-- Todos los precios son POR CRISTAL y SIN IVA, como los publica el
-- laboratorio. El costo del par que paga la óptica es
--   (precio_unitario * 2 + montaje) * 1.19
--
-- Es data de referencia del proveedor, igual para todas las ópticas que le
-- compren, así que no lleva tenant_id: se lee desde cualquier tenant y solo
-- se escribe con service_role (al cargar una lista nueva).

create table if not exists public.lab_precios_stock (
  id uuid primary key default gen_random_uuid(),
  laboratorio text not null default 'Fides',
  lista text not null default '2026',
  diseno text not null check (diseno in ('MONOFOCAL', 'BIFOCAL', 'MULTIFOCAL')),
  material text not null,
  -- Potencia máxima que cubre esta celda. En la lista de stock el precio
  -- sube por escalones (2, 4, 6, 8, 10, 12, 14): un -3.25 se cobra en el
  -- escalón 4. null = la caja de bifocal/multifocal de stock, que tiene un
  -- rango fijo escrito aparte (ver rango_texto).
  esfera_max numeric(4, 2),
  cilindro_max numeric(4, 2),
  rango_texto text,
  precio_unitario integer not null check (precio_unitario >= 0),
  constraint lab_precios_stock_celda_unica
    unique nulls not distinct (laboratorio, lista, diseno, material, esfera_max, cilindro_max)
);

create table if not exists public.lab_precios_laboratorio (
  id uuid primary key default gen_random_uuid(),
  laboratorio text not null default 'Fides',
  lista text not null default '2026',
  diseno text not null,
  material text not null,
  -- null = el laboratorio no publica precio para esa combinación (no la
  -- hace, o hay que consultarla). No es lo mismo que costo cero.
  precio_unitario integer check (precio_unitario >= 0),
  nota text,
  constraint lab_precios_laboratorio_celda_unica
    unique (laboratorio, lista, diseno, material)
);

-- Montaje: lo que cobra el laboratorio por dejar el cristal calzado en el
-- armazón. Cambia según el material y cómo se sujeta (simple/cerrado,
-- ranurado al aire, perforado al aire).
create table if not exists public.lab_precios_montaje (
  id uuid primary key default gen_random_uuid(),
  laboratorio text not null default 'Fides',
  lista text not null default '2026',
  origen text not null check (origen in ('stock', 'laboratorio')),
  material text not null,
  diseno text not null check (diseno in ('MONOFOCAL', 'BIFOCAL', 'MULTIFOCAL')),
  codigo text,
  precio integer not null check (precio >= 0),
  constraint lab_precios_montaje_celda_unica
    unique (laboratorio, lista, origen, material, diseno)
);

-- Recargos por receta difícil (cilindro o esfera alta, prisma, teñido…).
-- Se suman al precio del cristal cuando corresponde.
create table if not exists public.lab_precios_recargo (
  id uuid primary key default gen_random_uuid(),
  laboratorio text not null default 'Fides',
  lista text not null default '2026',
  categoria text not null,
  concepto text not null,
  precio integer not null check (precio >= 0),
  constraint lab_precios_recargo_concepto_unico
    unique (laboratorio, lista, concepto)
);

alter table public.lab_precios_stock enable row level security;
alter table public.lab_precios_laboratorio enable row level security;
alter table public.lab_precios_montaje enable row level security;
alter table public.lab_precios_recargo enable row level security;

create policy "lab_precios_stock: lectura para cualquier óptica"
  on public.lab_precios_stock for select to authenticated using (true);
create policy "lab_precios_laboratorio: lectura para cualquier óptica"
  on public.lab_precios_laboratorio for select to authenticated using (true);
create policy "lab_precios_montaje: lectura para cualquier óptica"
  on public.lab_precios_montaje for select to authenticated using (true);
create policy "lab_precios_recargo: lectura para cualquier óptica"
  on public.lab_precios_recargo for select to authenticated using (true);

grant select on public.lab_precios_stock to authenticated;
grant select on public.lab_precios_laboratorio to authenticated;
grant select on public.lab_precios_montaje to authenticated;
grant select on public.lab_precios_recargo to authenticated;
grant all on public.lab_precios_stock to service_role;
grant all on public.lab_precios_laboratorio to service_role;
grant all on public.lab_precios_montaje to service_role;
grant all on public.lab_precios_recargo to service_role;
