-- Un operativo puede durar varios días (ej. un edificio grande donde se
-- atiende por turnos durante una semana) — antes solo tenía una fecha
-- única, así que no había forma de decir "del 16 al 20 de septiembre".
alter table public.operativos
  add column if not exists fecha_fin date;
