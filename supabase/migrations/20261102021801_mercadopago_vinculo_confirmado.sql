-- Un voucher identifica una operación, no demuestra por sí solo quién es
-- el paciente. No convertimos coincidencias históricas en identidades confirmadas.
create table public.mercadopago_vinculos (
  tenant_id uuid not null,
  pago_id text not null,
  abono_id uuid not null references public.pagos_abonos(id) on delete restrict,
  venta_id uuid not null references public.ventas(id) on delete restrict,
  paciente_id uuid not null references public.pacientes(id) on delete restrict,
  paciente_nombre text not null,
  paciente_rut text not null check (length(btrim(paciente_rut)) > 0),
  monto bigint not null check (monto > 0),
  medio_pago text not null check (medio_pago in ('debito','credito')),
  fecha_abono timestamptz not null,
  confirmado_por uuid not null references public.users(id),
  confirmado_en timestamptz not null default now(),
  primary key (tenant_id,pago_id),
  unique (abono_id),
  foreign key (tenant_id,pago_id) references public.mercadopago_pagos(tenant_id,pago_id) on delete restrict
);
alter table public.mercadopago_vinculos enable row level security;
revoke all on public.mercadopago_vinculos from public, anon, authenticated, service_role;
grant select on public.mercadopago_vinculos to authenticated;
grant select, insert on public.mercadopago_vinculos to service_role;
create policy mercadopago_vinculos_lectura on public.mercadopago_vinculos for select to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.puede_ver_clinico()));

-- Solo triggers internos con nombres de tabla fijos. No son RPC públicas.
create schema if not exists mercadopago_privado;
revoke all on schema mercadopago_privado from public, anon, authenticated;
create table mercadopago_privado.referencias (
  tenant_id uuid not null references public.tenants(id),
  pago_id text not null check (pago_id ~ '^[0-9]{8,30}$'),
  abono_id uuid not null references public.pagos_abonos(id) on delete cascade deferrable initially deferred,
  primary key (tenant_id,pago_id), unique(abono_id)
);
alter table mercadopago_privado.referencias enable row level security;
revoke all on mercadopago_privado.referencias from public,anon,authenticated;
grant usage on schema mercadopago_privado to service_role;
grant all on mercadopago_privado.referencias to service_role;
-- Las referencias históricas repetidas no se eligen arbitrariamente.
insert into mercadopago_privado.referencias(tenant_id,pago_id,abono_id)
select b.tenant_id,b.numero_voucher,(array_agg(b.id order by b.id))[1]
from public.pagos_abonos b join public.mercadopago_sync s on s.tenant_id=b.tenant_id and s.collector_id is not null
where b.numero_voucher ~ '^[0-9]{8,30}$' group by b.tenant_id,b.numero_voucher having count(*)=1;
create function mercadopago_privado.proteger_abono()
returns trigger language plpgsql security definer set search_path='' as $$
declare vinculada boolean;
begin
  if auth.role()='authenticated' and (auth.uid() is null or public.jwt_tenant_id() is distinct from coalesce(new.tenant_id,old.tenant_id)) then
    raise exception 'Óptica no autorizada' using errcode='42501';
  end if;
  if tg_op <> 'INSERT' then
    select exists(select 1 from public.mercadopago_vinculos where abono_id=old.id) into vinculada;
    if vinculada and tg_op='DELETE' then
      raise exception 'El abono tiene un voucher confirmado y debe conservarse.' using errcode='23514';
    end if;
    if vinculada and (new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
      or new.venta_id is distinct from old.venta_id or new.numero_voucher is distinct from old.numero_voucher
      or new.monto is distinct from old.monto or new.medio_pago is distinct from old.medio_pago
      or new.fecha is distinct from old.fecha) then
      raise exception 'El voucher ya está confirmado para este abono y paciente. No se puede trasladar ni editar; requiere revisar el respaldo original.' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then
    delete from mercadopago_privado.referencias where abono_id=old.id;
    return old;
  end if;
  if tg_op='UPDATE' then
    delete from mercadopago_privado.referencias where abono_id=old.id
      and (tenant_id is distinct from new.tenant_id or pago_id is distinct from new.numero_voucher or old.id is distinct from new.id);
  end if;
  if new.numero_voucher ~ '^[0-9]{8,30}$'
    and exists(select 1 from public.mercadopago_sync where tenant_id=new.tenant_id and collector_id is not null) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.numero_voucher,0));
    if exists(select 1 from public.pagos_abonos where tenant_id=new.tenant_id and numero_voucher=new.numero_voucher and id<>new.id) then
      raise exception 'Esta operación ya está registrada en otro abono. No se puede reutilizar.' using errcode='23505';
    end if;
    -- Esta clave única también protege dos escrituras concurrentes, sin
    -- depender de que ambas vean la última versión de la consulta anterior.
    insert into mercadopago_privado.referencias as r(tenant_id,pago_id,abono_id)
      values(new.tenant_id,new.numero_voucher,new.id)
      on conflict(tenant_id,pago_id) do update set abono_id=excluded.abono_id where r.abono_id=excluded.abono_id;
    if not found then raise exception 'La operación pertenece a otro abono' using errcode='23505'; end if;
  end if;
  return new;
end;
$$;
create trigger mercadopago_proteger_abono before insert or update or delete on public.pagos_abonos
for each row execute function mercadopago_privado.proteger_abono();

create function mercadopago_privado.proteger_paciente_venta()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='authenticated' and (auth.uid() is null or public.jwt_tenant_id() is distinct from old.tenant_id) then
    raise exception 'Óptica no autorizada' using errcode='42501';
  end if;
  if (new.paciente_id is distinct from old.paciente_id or new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id)
    and exists(select 1 from public.mercadopago_vinculos where venta_id=old.id) then
    raise exception 'Esta compra tiene un voucher confirmado. No se puede cambiar su paciente.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger mercadopago_proteger_paciente before update of paciente_id,tenant_id,id on public.ventas
for each row execute function mercadopago_privado.proteger_paciente_venta();

-- Evita que una respuesta antigua reactive un pago devuelto o modifique titular.
create function mercadopago_privado.proteger_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.collector_id is distinct from old.collector_id then
    raise exception 'El titular de la operación no puede cambiar' using errcode='23514';
  end if;
  if new.actualizado_en_proveedor < old.actualizado_en_proveedor then return null; end if;
  return new;
end;
$$;
create trigger mercadopago_snapshot_ordenado before update on public.mercadopago_pagos
for each row execute function mercadopago_privado.proteger_snapshot();
revoke all on function mercadopago_privado.proteger_abono(),mercadopago_privado.proteger_paciente_venta(),mercadopago_privado.proteger_snapshot() from public,anon,authenticated;

-- Solo el servidor, después de comprobar la sesión del admin y el cotejo
-- explícito del original, puede insertar una asociación inmutable y auditada.
create function public.mercadopago_confirmar_vinculo(p_tenant uuid,p_actor uuid,p_pago text,p_abono uuid,p_esperado jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.pagos_abonos; v public.ventas; p public.pacientes; m public.mercadopago_pagos; l public.mercadopago_vinculos;
begin
  if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and rol='admin' and estado='activo') then
    raise exception 'Administrador no autorizado' using errcode='42501'; end if;
  select * into a from public.pagos_abonos where id=p_abono and tenant_id=p_tenant for update;
  if not found then raise exception 'Abono no disponible' using errcode='23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text || ':' || p_pago,0));
  insert into mercadopago_privado.referencias as r(tenant_id,pago_id,abono_id) values(p_tenant,p_pago,a.id)
    on conflict(tenant_id,pago_id) do update set abono_id=excluded.abono_id where r.abono_id=excluded.abono_id;
  if not found then raise exception 'La operación pertenece a otro abono' using errcode='23514'; end if;
  select * into m from public.mercadopago_pagos where tenant_id=p_tenant and pago_id=p_pago for share;
  if not found then raise exception 'Operación no disponible' using errcode='23514'; end if;
  select * into v from public.ventas where id=a.venta_id and tenant_id=p_tenant for share;
  if not found or v.anulada then raise exception 'Compra no disponible' using errcode='23514'; end if;
  select * into p from public.pacientes where id=v.paciente_id and tenant_id=p_tenant for share;
  if not found or nullif(btrim(p.rut),'') is null then raise exception 'Completa la identidad del paciente antes de confirmar' using errcode='23514'; end if;
  if a.numero_voucher is distinct from p_pago or a.monto<>m.monto or a.medio_pago is distinct from m.medio_pago
    or m.estado<>'approved' or m.monto_devuelto<>0
    or (a.fecha at time zone 'America/Santiago')::date<>(m.fecha at time zone 'America/Santiago')::date
    or (select count(*) from public.pagos_abonos where tenant_id=p_tenant and numero_voucher=p_pago)<>1
    or not exists(select 1 from public.mercadopago_sync where tenant_id=p_tenant and collector_id=m.collector_id) then
    raise exception 'Operación, monto, fecha o medio no coinciden de forma única con el abono' using errcode='23514'; end if;
  if v.id is distinct from (p_esperado->>'venta_id')::uuid or p.id is distinct from (p_esperado->>'paciente_id')::uuid
    or p.nombre is distinct from (p_esperado->>'paciente_nombre') or p.rut is distinct from (p_esperado->>'paciente_rut')
    or a.monto is distinct from (p_esperado->>'monto')::bigint or a.medio_pago is distinct from (p_esperado->>'medio_pago')
    or a.fecha is distinct from (p_esperado->>'fecha_abono')::timestamptz then
    raise exception 'Los datos cambiaron. Recarga y coteja nuevamente el paciente y el original' using errcode='23514'; end if;
  select * into l from public.mercadopago_vinculos where tenant_id=p_tenant and pago_id=p_pago;
  if found then
    if l.abono_id=a.id and l.venta_id=v.id and l.paciente_id=p.id and l.paciente_nombre=p.nombre and l.paciente_rut=p.rut then return true; end if;
    raise exception 'Esta operación ya está confirmada para otro abono o identidad' using errcode='23514';
  end if;
  insert into public.mercadopago_vinculos(tenant_id,pago_id,abono_id,venta_id,paciente_id,paciente_nombre,paciente_rut,monto,medio_pago,fecha_abono,confirmado_por)
    values(p_tenant,p_pago,a.id,v.id,p.id,p.nombre,p.rut,a.monto,a.medio_pago,a.fecha,p_actor);
  return true;
end;
$$;
revoke all on function public.mercadopago_confirmar_vinculo(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mercadopago_confirmar_vinculo(uuid,uuid,text,uuid,jsonb) to service_role;

create or replace view public.mercadopago_conciliacion with (security_invoker=true) as
select m.*, a.id as abono_id,a.venta_id,v.paciente_id,p.nombre as paciente_nombre,
  case
    when l.pago_id is not null and (a.id is null or a.venta_id is distinct from l.venta_id
      or v.paciente_id is distinct from l.paciente_id or p.nombre is distinct from l.paciente_nombre or p.rut is distinct from l.paciente_rut) then 'identidad_modificada'
    when c.cantidad=0 then 'sin_abono'
    when c.cantidad>1 then 'voucher_repetido'
    when v.id is null or v.anulada then 'venta_anulada'
    when m.estado<>'approved' or m.monto_devuelto>0 then 'revisar_pago'
    when m.monto<>a.monto or m.medio_pago is null or m.medio_pago is distinct from a.medio_pago
      or (a.fecha at time zone 'America/Santiago')::date<>(m.fecha at time zone 'America/Santiago')::date then 'diferencia'
    when p.id is null or nullif(btrim(p.rut),'') is null then 'identidad_incompleta'
    when l.pago_id is null then 'confirmar_paciente'
    else 'vinculado'
  end as conciliacion,
  p.rut as paciente_rut,a.fecha as fecha_abono,a.medio_pago as medio_abono,
  l.confirmado_en,l.confirmado_por,l.paciente_nombre as paciente_nombre_confirmado
from public.mercadopago_pagos m
left join public.mercadopago_vinculos l on l.tenant_id=m.tenant_id and l.pago_id=m.pago_id
cross join lateral(select count(*) as cantidad,(array_agg(b.id order by b.id))[1] as id from public.pagos_abonos b
  where b.tenant_id=m.tenant_id and b.numero_voucher=m.pago_id) c
left join public.pagos_abonos a on a.tenant_id=m.tenant_id and a.id=coalesce(l.abono_id,case when c.cantidad=1 then c.id end)
left join public.ventas v on v.id=a.venta_id and v.tenant_id=m.tenant_id
left join public.pacientes p on p.id=v.paciente_id and p.tenant_id=m.tenant_id;
notify pgrst,'reload schema';
