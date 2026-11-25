alter table public.ordenes_trabajo
  add column marco_codigo text check (char_length(marco_codigo) between 1 and 80),
  add column marco_codigo_2 text check (char_length(marco_codigo_2) between 1 and 80);
