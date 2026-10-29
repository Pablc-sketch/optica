-- Datos tributarios separados de la operación del medio de pago.
alter table public.ventas
  add column if not exists boleta_folio text check (boleta_folio is null or boleta_folio ~ '^[0-9]{1,20}$'),
  add column if not exists boleta_fecha date,
  add column if not exists ocultar_voucher boolean not null default false;
notify pgrst, 'reload schema';
