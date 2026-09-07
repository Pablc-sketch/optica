-- Número de voucher que imprime la máquina (Mercado Pago, etc.) al cobrar
-- con tarjeta — se guarda por abono, no por venta, porque una venta puede
-- tener más de un pago (ej. un abono en efectivo y el resto con tarjeta,
-- cada uno con su propio comprobante físico).
alter table public.pagos_abonos
  add column if not exists numero_voucher text;
