-- Cómo se reparte la plata de cada operativo entre quienes trabajan en él:
-- Isadora (vendedora), la mamá (representante legal, también vende) y
-- Pablo (tecnólogo, refracta y sugiere el lente).
--
-- El reparto acordado:
--   1. Isadora se lleva una comisión (hoy: 10% de lo vendido).
--   2. De lo que queda, se aparta un % para ahorro (comprar equipos,
--      arriendo, imprevistos — caja chica del negocio, no de nadie).
--   3. Lo que sobra se divide en dos: mitad para la mamá, mitad para
--      Pablo. Ninguno de los dos tiene comisión aparte — su pago ES esa
--      mitad.
--
-- Van en el operativo (no en un ajuste global del tenant) porque el
-- usuario pidió que sea cambiable operativo por operativo: si más
-- adelante se decide que Isadora gane sobre la utilidad en vez de la
-- venta, o que el % de ahorro suba, los operativos ya realizados no
-- deben recalcularse solos con el ajuste nuevo.
alter table public.operativos
  add column if not exists comision_vendedora_pct numeric(5, 2) not null default 10,
  add column if not exists comision_vendedora_base text not null default 'venta_total'
    check (comision_vendedora_base in ('venta_total', 'utilidad_neta')),
  add column if not exists ahorro_pct numeric(5, 2) not null default 20;

comment on column public.operativos.comision_vendedora_pct is
  'Porcentaje que se lleva la vendedora (Isadora) de este operativo.';
comment on column public.operativos.comision_vendedora_base is
  'Sobre qué se calcula la comisión: venta_total (lo vendido) o utilidad_neta (lo que deja después de costos).';
comment on column public.operativos.ahorro_pct is
  'Porcentaje que se aparta para ahorro (equipos, arriendo, imprevistos) después de pagar la comisión de la vendedora, antes de dividir el resto entre los dueños.';
