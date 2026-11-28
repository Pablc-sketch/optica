-- Los nuevos cristales se pueden cotizar de forma manual hasta que la
-- óptica configure sus tarifas. Los catálogos existentes siguen usando
-- su regla de precio de respaldo.
alter table public.costos_cristales
  add column if not exists exige_tarifa boolean not null default false;
