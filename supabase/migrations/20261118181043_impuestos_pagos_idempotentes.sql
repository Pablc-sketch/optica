create or replace function public.registrar_pago_sii(p_id uuid,p_periodo date,p_monto bigint,p_fecha date,p_caja text,p_gasto_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare t uuid:=public.jwt_tenant_id();g uuid;previo public.impuestos_pagos;
begin
  if t is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if p_periodo is null or extract(day from p_periodo)<>1 or p_periodo>(now() at time zone 'America/Santiago')::date or p_monto is null or p_monto<=0 or p_monto>999999999999 or p_fecha is null or p_fecha>(now() at time zone 'America/Santiago')::date or p_caja is null or p_caja not in ('digital','efectivo','personal') then raise exception 'Revisa período, monto, fecha y origen'; end if;
  select * into previo from public.impuestos_pagos where id=p_id and tenant_id=t;
  if previo.id is not null then
    if previo.periodo=p_periodo and previo.anulado_en is null and previo.gasto_id=coalesce(p_gasto_id,p_id)
      and exists(select 1 from public.gastos_globales where id=previo.gasto_id and tenant_id=t and monto=p_monto and fecha=p_fecha and caja=p_caja) then return; end if;
    raise exception 'El registro ya existe. Recarga antes de reintentar';
  end if;
  insert into public.impuestos_mensuales(tenant_id,periodo) values(t,p_periodo) on conflict do nothing;
  if p_gasto_id is null then
    g:=p_id;
    insert into public.gastos_globales(id,tenant_id,fecha,monto,caja,categoria,descripcion,medio_pago)
    values(g,t,p_fecha,p_monto,p_caja,'otro','SII F29 · '||to_char(p_periodo,'YYYY-MM'),case when p_caja='efectivo' then 'efectivo' when p_caja='digital' then 'transferencia' else null end);
  else
    select id into g from public.gastos_globales where id=p_gasto_id and tenant_id=t and monto=p_monto and fecha=p_fecha and caja=p_caja for update;
    if g is null then raise exception 'El gasto cambió. Recarga y revísalo'; end if;
  end if;
  insert into public.impuestos_pagos(id,tenant_id,periodo,gasto_id) values(p_id,t,p_periodo,g);
end;
$$;
-- Historia de cambios de los importes declarados, sin permitir reescribirla.
create table public.impuestos_historial (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  periodo date not null, antes jsonb, despues jsonb not null,
  usuario_id uuid references public.users(id), creado_en timestamptz not null default now()
);
create index on public.impuestos_historial(tenant_id,periodo);
create index on public.impuestos_historial(usuario_id);
alter table public.impuestos_historial enable row level security;
revoke all on public.impuestos_historial from public,anon,authenticated;
grant select on public.impuestos_historial to authenticated;
create policy impuestos_historial_leer on public.impuestos_historial for select to authenticated
using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create function finanzas_privado.auditar_impuesto() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or new.tenant_id is distinct from public.jwt_tenant_id() or public.jwt_rol() is distinct from 'admin' then raise exception 'Sin permiso para registrar revisión'; end if;
  insert into public.impuestos_historial(tenant_id,periodo,antes,despues,usuario_id)
  values(new.tenant_id,new.periodo,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),auth.uid());
  return new;
end;
$$;
revoke all on function finanzas_privado.auditar_impuesto() from public,anon,authenticated;
create trigger auditar_impuesto after insert or update on public.impuestos_mensuales for each row execute function finanzas_privado.auditar_impuesto();
