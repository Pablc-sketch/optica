-- Cuando la receta es "lejos y cerca por separado" (Monofocal), la OT
-- nunca guardaba si el cristal 1 y el cristal 2 eran para lejos o para
-- cerca — se perdía justo el dato que hace falta para saber qué marco va
-- con cuál. Bifocal/Multifocal no tienen esta distinción, por eso queda
-- nullable.
alter table public.ordenes_trabajo
  add column if not exists posicion text check (posicion in ('lejos', 'cerca')),
  add column if not exists posicion_2 text check (posicion_2 in ('lejos', 'cerca'));
