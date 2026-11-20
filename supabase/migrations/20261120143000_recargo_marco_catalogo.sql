alter table public.productos
  add column recargo_marco bigint
  check (recargo_marco is null or (categoria = 'armazon' and recargo_marco between 0 and 99999999));
comment on column public.productos.recargo_marco is
  'Recargo fijo para este marco sobre el precio calculado del par de cristales.';
