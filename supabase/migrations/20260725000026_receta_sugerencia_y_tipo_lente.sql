-- "Tipo" de receta pasa a llamarse "Tipo de lente" en la interfaz, y su
-- tercer valor deja de ser "progresivo" (un diseño de lente específico)
-- para ser "lejos_y_cerca": dos lentes monofocales por separado en vez de
-- uno multifocal — es una decisión distinta, no la misma cosa.
alter table public.recetas drop constraint if exists recetas_tipo_check;
alter table public.recetas add constraint recetas_tipo_check
  check (tipo in ('lejos', 'cerca', 'lejos_y_cerca'));
update public.recetas set tipo = 'lejos_y_cerca' where tipo = 'progresivo';

-- Sugerencia del tecnólogo al tomar la receta: qué cristal y tratamiento
-- ya se conversó con el paciente, para que la vendedora lo vea solo al
-- buscarlo por RUT en el punto de venta. Las columnas "_cerca" solo se
-- usan cuando tipo='lejos_y_cerca' (dos sugerencias independientes).
alter table public.recetas
  add column if not exists sugerencia_tipo_lente text,
  add column if not exists sugerencia_tratamiento text,
  add column if not exists sugerencia_tipo_lente_cerca text,
  add column if not exists sugerencia_tratamiento_cerca text,
  add column if not exists observacion_venta text;
