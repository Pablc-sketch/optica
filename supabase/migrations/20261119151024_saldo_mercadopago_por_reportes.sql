-- Solo conserva el saldo y el respaldo mínimo; nunca el CSV ni datos del pagador.
create table public.mercadopago_saldos (
 tenant_id uuid primary key references public.tenants(id),
 collector_id text not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','preparando','verificado','error','sin_permiso')),
 tarea_id text,
 solicitado_en timestamptz,
 periodo_desde timestamptz,
 periodo_hasta timestamptz,
 saldo_disponible numeric(20,2),
 saldo_al timestamptz,
 verificado_en timestamptz,
 reporte_id text,
 error_codigo text check(length(error_codigo)<=100),
 bloqueado_hasta timestamptz,
 check((saldo_disponible is null)=(saldo_al is null))
);
alter table public.mercadopago_saldos enable row level security;
revoke all on public.mercadopago_saldos from public,anon,authenticated;
grant select on public.mercadopago_saldos to authenticated;
grant all on public.mercadopago_saldos to service_role;
create policy mercadopago_saldos_lectura on public.mercadopago_saldos for select to authenticated
 using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create function public.mercadopago_reservar_saldo(p_tenant uuid,p_collector text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.mercadopago_sync where tenant_id=p_tenant and collector_id=p_collector) then raise exception 'Cuenta no verificada'; end if;
 insert into public.mercadopago_saldos(tenant_id,collector_id) values(p_tenant,p_collector) on conflict do nothing;
 update public.mercadopago_saldos set bloqueado_hasta=now()+interval '90 seconds'
 where tenant_id=p_tenant and collector_id=p_collector and (bloqueado_hasta is null or bloqueado_hasta<now());
 return found;
end;
$$;
revoke all on function public.mercadopago_reservar_saldo(uuid,text) from public,anon,authenticated;
grant execute on function public.mercadopago_reservar_saldo(uuid,text) to service_role;
notify pgrst,'reload schema';
