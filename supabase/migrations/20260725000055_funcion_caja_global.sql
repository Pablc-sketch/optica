-- La caja global sumada en la base, no en el navegador.
--
-- Traer todos los pagos y sumarlos en el servidor web parecía más simple,
-- pero PostgREST corta en 1.000 filas: el día que haya más de mil pagos, la
-- caja global empezaría a mostrar un número más chico que el real sin decir
-- nada. Un cuadre de plata que se equivoca en silencio es peor que no
-- tenerlo, así que la suma se hace acá, donde no hay tope.
--
-- SECURITY INVOKER (el default) es a propósito: la función corre con los
-- permisos de quien la llama, así que las políticas RLS por tenant siguen
-- aplicando tabla por tabla. Un tenant no puede ver la caja de otro.
create or replace function public.caja_global()
returns table (
  entro_efectivo bigint,
  entro_digital bigint,
  entro_debito bigint,
  entro_credito bigint,
  salio_efectivo bigint,
  salio_digital bigint,
  gastos_operativo bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    -- Un pago sin medio anotado se cuenta como efectivo: es lo que pasa
    -- cuando se cobra rápido y no se alcanza a elegir en la pantalla, y
    -- casi siempre fue plata en la mano.
    coalesce((select sum(pa.monto) from pagos_abonos pa
               join ventas v on v.id = pa.venta_id
              where not v.anulada
                and (pa.medio_pago = 'efectivo' or pa.medio_pago is null)), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa
               join ventas v on v.id = pa.venta_id
              where not v.anulada
                and pa.medio_pago is not null
                and pa.medio_pago <> 'efectivo'), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa
               join ventas v on v.id = pa.venta_id
              where not v.anulada and pa.medio_pago = 'debito'), 0)::bigint,
    coalesce((select sum(pa.monto) from pagos_abonos pa
               join ventas v on v.id = pa.venta_id
              where not v.anulada and pa.medio_pago = 'credito'), 0)::bigint,
    -- Los montos negativos son aportes (alguien puso plata propia): se
    -- suman tal cual y hacen que la salida sea menor, o que la caja suba.
    (coalesce((select sum(monto) from retiros_sueldo where caja = 'efectivo'), 0)
     + coalesce((select sum(monto) from gastos_globales where caja = 'efectivo'), 0))::bigint,
    (coalesce((select sum(monto) from retiros_sueldo where caja = 'digital'), 0)
     + coalesce((select sum(monto) from gastos_globales where caja = 'digital'), 0))::bigint,
    -- Los gastos propios de cada operativo (arriendo de equipos, transporte,
    -- viáticos) no son un movimiento guardado aparte, pero la plata salió
    -- igual, y siempre de la cuenta. Solo cuentan los operativos que ya
    -- pasaron: uno agendado para el mes que viene todavía no gastó nada.
    coalesce((select sum(costo_transporte + costo_arriendo + costo_viaticos + costo_otros)
                from operativos
               where coalesce(fecha_fin, fecha) <= (now() at time zone 'America/Santiago')::date), 0)::bigint;
$$;

comment on function public.caja_global() is
  'Totales de la caja global del tenant que la llama: cuánto entró y salió de efectivo y de la cuenta, desde siempre.';
