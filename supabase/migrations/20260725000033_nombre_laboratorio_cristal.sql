-- Cómo se llama este cristal en el catálogo del laboratorio (ej. Fides
-- pide "MULTIFOCAL ANTIREFLEJO 1.56", no "Multifocal Filtro Azul", que es
-- el nombre interno con que se vende acá). Cuando está puesto, la planilla
-- que se manda al laboratorio imprime ESTE nombre, para que no haya que
-- traducirlo por teléfono al hacer el pedido.
alter table public.costos_cristales
  add column if not exists nombre_laboratorio text;
