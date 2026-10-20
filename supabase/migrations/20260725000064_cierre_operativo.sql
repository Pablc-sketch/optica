-- Cierre del operativo (20-10-2026): pago a ayudantes como costo del
-- operativo, y gastos globales que se pueden ligar a un operativo (pago a
-- Fides de ese operativo). Aplicado directamente en producción.
alter table public.operativos add column if not exists costo_ayudante bigint not null default 0 check (costo_ayudante >= 0);
alter table public.gastos_globales add column if not exists operativo_id uuid references public.operativos (id);

create or replace function public.caja_global()
returns table (entro_efectivo bigint, entro_digital bigint, entro_debito bigint, entro_credito bigint, salio_efectivo bigint, salio_digital bigint, gastos_operativo bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce((select sum(pa.monto) from pagos_abonos pa join ventas v on v.id = pa.venta_id where not v.anulada and (pa.medio_pago = 'efectivo' or pa.medio_pago is null)), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa join ventas v on v.id = pa.venta_id where not v.anulada and pa.medio_pago is not null and pa.medio_pago <> 'efectivo'), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa join ventas v on v.id = pa.venta_id where not v.anulada and pa.medio_pago = 'debito'), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa join ventas v on v.id = pa.venta_id where not v.anulada and pa.medio_pago = 'credito'), 0)::bigint,
    (coalesce((select sum(monto) from retiros_sueldo where caja = 'efectivo'), 0) + coalesce((select sum(monto) from gastos_globales where caja = 'efectivo'), 0))::bigint,
    (coalesce((select sum(monto) from retiros_sueldo where caja = 'digital'), 0) + coalesce((select sum(monto) from gastos_globales where caja = 'digital'), 0))::bigint,
    coalesce((select sum(costo_transporte + costo_arriendo + costo_viaticos + costo_otros + costo_ayudante) from operativos where coalesce(fecha_fin, fecha) <= (now() at time zone 'America/Santiago')::date), 0)::bigint;
$$;
