create table public.impuestos_mensuales (
  tenant_id uuid not null references public.tenants(id),
  periodo date not null check (extract(day from periodo)=1),
  ventas_afectas bigint check (ventas_afectas between 0 and 999999999999),
  credito_fiscal bigint not null default 0 check (credito_fiscal between 0 and 999999999999),
  ppm bigint not null default 0 check (ppm between 0 and 999999999999),
  otros bigint not null default 0 check (otros between 0 and 999999999999),
  recargos bigint not null default 0 check (recargos between 0 and 999999999999),
  total_declarado bigint check (total_declarado between 0 and 999999999999),
  vence_el date, nota text not null default '' check (length(nota)<=500),
  version bigint not null default 0,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.users(id),
  primary key(tenant_id,periodo)
);
create table public.impuestos_pagos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  periodo date not null,
  gasto_id uuid not null references public.gastos_globales(id),
  creado_en timestamptz not null default now(),
  creado_por uuid references public.users(id),
  anulado_en timestamptz, anulado_por uuid references public.users(id),
  foreign key(tenant_id,periodo) references public.impuestos_mensuales(tenant_id,periodo)
);
create unique index impuestos_pago_gasto_activo on public.impuestos_pagos(gasto_id) where anulado_en is null;
create index on public.impuestos_pagos(tenant_id,periodo);
create index on public.impuestos_pagos(creado_por);
create index on public.impuestos_pagos(anulado_por);
create index on public.impuestos_mensuales(actualizado_por);
alter table public.impuestos_mensuales enable row level security;
alter table public.impuestos_pagos enable row level security;
revoke all on public.impuestos_mensuales,public.impuestos_pagos from public,anon,authenticated;
grant select,insert,update on public.impuestos_mensuales,public.impuestos_pagos to authenticated;
create policy impuestos_meses_leer on public.impuestos_mensuales for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy impuestos_meses_crear on public.impuestos_mensuales for insert to authenticated with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy impuestos_meses_editar on public.impuestos_mensuales for update to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente())) with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy impuestos_pagos_leer on public.impuestos_pagos for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create policy impuestos_pagos_crear on public.impuestos_pagos for insert to authenticated with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));
create policy impuestos_pagos_anular on public.impuestos_pagos for update to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente())) with check(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin' and (select public.suscripcion_vigente()));

create function finanzas_privado.versionar_impuesto() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.tenant_id is distinct from public.jwt_tenant_id() or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if new.periodo>(now() at time zone 'America/Santiago')::date then raise exception 'Período futuro inválido'; end if;
  if tg_op='UPDATE' then
    if new.tenant_id is distinct from old.tenant_id or new.periodo is distinct from old.periodo then raise exception 'Conserva la óptica y el período'; end if;
    new.version:=old.version+1;
  else new.version:=0; end if;
  new.actualizado_en:=now();new.actualizado_por:=auth.uid();return new;
end;
$$;
revoke all on function finanzas_privado.versionar_impuesto() from public,anon,authenticated;
create trigger versionar_impuesto before insert or update on public.impuestos_mensuales for each row execute function finanzas_privado.versionar_impuesto();

create function finanzas_privado.validar_pago_impuesto() returns trigger language plpgsql security invoker set search_path='' as $$
declare g public.gastos_globales;
begin
  if new.tenant_id is distinct from public.jwt_tenant_id() or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['anulado_en','anulado_por']) is distinct from (to_jsonb(old)-array['anulado_en','anulado_por']) or old.anulado_en is not null or new.anulado_en is null then raise exception 'Solo puedes desvincular un pago activo'; end if;
    new.anulado_en:=now();new.anulado_por:=auth.uid();return new;
  end if;
  select * into g from public.gastos_globales where id=new.gasto_id and tenant_id=new.tenant_id for update;
  if g.id is null or g.monto<=0 or g.operativo_id is not null or g.categoria<>'otro' or g.descripcion ~ '^(Costo operativo · |Fides · |Marcos · )' then raise exception 'Elige un gasto general válido de impuestos'; end if;
  if exists(select 1 from public.gastos_asignaciones where gasto_id=g.id and anulado_en is null) then raise exception 'Este gasto ya cubre costos de operativos'; end if;
  new.creado_en:=now();new.creado_por:=auth.uid();new.anulado_en:=null;new.anulado_por:=null;return new;
end;
$$;
revoke all on function finanzas_privado.validar_pago_impuesto() from public,anon,authenticated;
create trigger validar_pago_impuesto before insert or update on public.impuestos_pagos for each row execute function finanzas_privado.validar_pago_impuesto();

create function finanzas_privado.excluir_impuesto_de_costos() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.gastos_globales where id=new.gasto_id for update;
  if exists(select 1 from public.impuestos_pagos where gasto_id=new.gasto_id and anulado_en is null) then raise exception 'Este gasto ya corresponde a un pago al SII'; end if;
  return new;
end;
$$;
revoke all on function finanzas_privado.excluir_impuesto_de_costos() from public,anon,authenticated;
create trigger excluir_impuesto_de_costos before insert on public.gastos_asignaciones for each row execute function finanzas_privado.excluir_impuesto_de_costos();

create function public.registrar_pago_sii(p_id uuid,p_periodo date,p_monto bigint,p_fecha date,p_caja text,p_gasto_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare t uuid:=public.jwt_tenant_id();g uuid;previo public.impuestos_pagos;
begin
  if t is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if p_periodo is null or extract(day from p_periodo)<>1 or p_periodo>(now() at time zone 'America/Santiago')::date or p_monto is null or p_monto<=0 or p_monto>999999999999 or p_fecha is null or p_fecha>(now() at time zone 'America/Santiago')::date or p_caja is null or p_caja not in ('digital','efectivo','personal') then raise exception 'Revisa período, monto, fecha y origen'; end if;
  select * into previo from public.impuestos_pagos where id=p_id and tenant_id=t;
  if previo.id is not null then
    if previo.periodo=p_periodo and previo.anulado_en is null then return; end if;
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
revoke all on function public.registrar_pago_sii(uuid,date,bigint,date,text,uuid) from public,anon;
grant execute on function public.registrar_pago_sii(uuid,date,bigint,date,text,uuid) to authenticated;

create function finanzas_privado.proteger_gasto_impuesto() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.impuestos_pagos where gasto_id=old.id and anulado_en is null)
    and (new.operativo_id is not null or new.categoria<>'otro' or new.descripcion ~ '^(Costo operativo · |Fides · |Marcos · )') then raise exception 'Desvincula primero el pago del SII'; end if;
  return new;
end;
$$;
revoke all on function finanzas_privado.proteger_gasto_impuesto() from public,anon,authenticated;
create trigger proteger_gasto_impuesto before update on public.gastos_globales for each row execute function finanzas_privado.proteger_gasto_impuesto();
