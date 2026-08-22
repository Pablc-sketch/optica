-- suscripcion_vigente() comparaba fecha_renovacion contra current_date, que
-- Postgres evalúa en UTC. En la noche en Chile (UTC-3/UTC-4) el reloj de
-- Postgres ya está "un día adelantado", así que el último día de vigencia
-- (o de la prueba gratuita) se cortaba unas horas antes de tiempo: cualquier
-- alta/edición/borrado protegido (crear pacientes, subir el logo, etc.)
-- empezaba a fallar con "row-level security policy" esa tarde/noche aunque
-- la suscripción siguiera vigente en Chile. Mismo patrón que el resto de
-- los bugs de huso horario del proyecto (ver src/lib/fechas.ts) — acá se
-- corrige comparando contra la fecha de Chile, no la de UTC.

create or replace function public.suscripcion_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.estado in ('trial', 'activa')
        and s.fecha_renovacion >= (now() at time zone 'America/Santiago')::date
      from public.suscripciones s
      where s.tenant_id = public.jwt_tenant_id()
    ),
    true -- sin registro de suscripción no bloqueamos: es dato faltante, no impago
  )
$$;
