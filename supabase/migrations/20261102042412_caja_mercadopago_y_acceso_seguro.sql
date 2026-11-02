-- Saldo no inferido: esta función resume exclusivamente los cobros archivados.
create or replace function public.mercadopago_resumen_caja(p_desde timestamptz, p_hasta timestamptz)
returns table(operaciones bigint, cobros bigint, por_revisar bigint, devuelto bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*),
    coalesce(sum(case when estado = 'approved' then monto - monto_devuelto else 0 end), 0)::bigint,
    count(*) filter(where conciliacion <> 'vinculado'),
    coalesce(sum(monto_devuelto), 0)::bigint
  from public.mercadopago_conciliacion
  where tenant_id = (select public.jwt_tenant_id())
    and (select public.jwt_rol()) = 'admin'
    and (select public.suscripcion_vigente())
    and fecha >= p_desde and fecha <= p_hasta;
$$;
revoke all on function public.mercadopago_resumen_caja(timestamptz,timestamptz) from public, anon;
grant execute on function public.mercadopago_resumen_caja(timestamptz,timestamptz) to authenticated;

-- Sin una suscripción verificada no se permite operar.
create or replace function public.suscripcion_vigente()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.estado in ('trial','activa')
    and s.fecha_renovacion >= (now() at time zone 'America/Santiago')::date
    from public.suscripciones s where s.tenant_id = public.jwt_tenant_id()), false)
$$;
revoke execute on function public.suscripcion_vigente() from public, anon;
grant execute on function public.suscripcion_vigente() to authenticated, service_role;
-- Las políticas autenticadas mantienen acceso; el trigger no necesita un RPC público.
revoke execute on function public.jwt_tenant_id() from public, anon;
grant execute on function public.jwt_tenant_id() to authenticated, service_role;
revoke execute on function public.proteger_ultimo_admin() from public, anon, authenticated;
