-- Lo que Mercado Pago (o cualquier procesador de tarjeta) descuenta antes
-- de depositar en la cuenta: no es lo mismo lo que se le cobró al
-- paciente que lo que de verdad llega a la cuenta. Se comprobó con la
-- boleta real del operativo de Pudahuel: sin este descuento, "En cuenta"
-- quedaba $1.055 por sobre el saldo real, y ese monto calzó casi exacto
-- con un 2% aplicado SOLO al crédito ($48.000 × 2% = $960 de $1.055) — el
-- débito de Mercado Pago en Chile suele liquidarse sin comisión, la
-- comisión real está en el crédito.
--
-- Van separados por medio porque casi nunca son la misma tasa (débito
-- suele ser gratis o casi, crédito siempre cobra), y editable porque cada
-- óptica puede tener un plan distinto con su procesador.
alter table public.tenants
  add column if not exists comision_debito_pct numeric(5, 2) not null default 0,
  add column if not exists comision_credito_pct numeric(5, 2) not null default 0;

comment on column public.tenants.comision_debito_pct is
  'Comisión que el procesador de tarjeta (ej. Mercado Pago) descuenta sobre los pagos con débito antes de depositar. 0 = no cobra nada por débito.';
comment on column public.tenants.comision_credito_pct is
  'Comisión que el procesador de tarjeta descuenta sobre los pagos con crédito antes de depositar.';

update public.tenants
set comision_credito_pct = 2
where id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a';
