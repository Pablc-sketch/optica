-- Se conserva el libro histórico. Los conteos son evidencia, no ingresos/gastos.
alter table public.gastos_globales add column monto_estimado boolean not null default false;
alter table public.mercadopago_sync add column error_codigo text check(length(error_codigo)<=80);

-- Una deuda personal se devuelve antes de marcar repartos o ahorro como pagados.
create function public.deuda_personal_pendiente() returns bigint
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(greatest(0,g.monto-coalesce(d.monto,0))),0)::bigint
 from public.gastos_globales g left join lateral
 (select sum(m.monto) as monto from public.caja_movimientos m where m.gasto_id=g.id and m.tenant_id=g.tenant_id and m.tipo='devolucion') d on true
 where g.tenant_id=(select public.jwt_tenant_id()) and g.caja='personal';
$$;
revoke all on function public.deuda_personal_pendiente() from public,anon;
grant execute on function public.deuda_personal_pendiente() to authenticated;

create function public.priorizar_reintegro_personal() returns trigger
language plpgsql security invoker set search_path='' as $$
declare deuda bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||new.tenant_id::text,0));
 if new.monto>0 and (tg_op='INSERT' or new.monto>old.monto or new.tenant_id is distinct from old.tenant_id) then
  select coalesce(sum(greatest(0,g.monto-coalesce(d.monto,0))),0) into deuda
  from public.gastos_globales g left join lateral
   (select sum(m.monto) as monto from public.caja_movimientos m where m.gasto_id=g.id and m.tenant_id=g.tenant_id and m.tipo='devolucion') d on true
  where g.tenant_id=new.tenant_id and g.caja='personal';
  if deuda>0 then raise exception 'Primero devuelve los gastos pagados personalmente. El reparto y el ahorro siguen pendientes.' using errcode='23514'; end if;
 end if;
 return new;
end;
$$;
create trigger priorizar_reintegro_personal before insert or update on public.retiros_sueldo
 for each row execute function public.priorizar_reintegro_personal();
create function public.serializar_caja_personal() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||coalesce(new.tenant_id,old.tenant_id)::text,0));
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger a_serializar_gasto_personal before insert or update or delete on public.gastos_globales
 for each row execute function public.serializar_caja_personal();
create trigger a_serializar_devolucion before insert on public.caja_movimientos
 for each row execute function public.serializar_caja_personal();
revoke all on function public.priorizar_reintegro_personal(),public.serializar_caja_personal() from public,anon;

create table public.mercadopago_cobros (
 id uuid primary key,
 tenant_id uuid not null references public.tenants(id),
 venta_id uuid not null references public.ventas(id),
 actor_id uuid not null references public.users(id),
 monto bigint not null check(monto>0),
 terminal_id text not null check(terminal_id ~ '^[A-Za-z0-9_-]{5,100}$'),
 collector_id text not null check(collector_id ~ '^[0-9]{1,30}$'),
 order_id text unique check(order_id ~ '^ORD[A-Za-z0-9]{5,80}$'),
 pago_id text,
 estado text not null default 'preparada' check(estado in ('preparada','created','at_terminal','action_required','processed','failed','canceled','expired','refunded','revisar')),
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 confirmado_en timestamptz,
 error_codigo text check(length(error_codigo)<=80),
 unique(tenant_id,pago_id)
);
create unique index mercadopago_cobro_activo on public.mercadopago_cobros(venta_id)
 where estado in ('preparada','created','at_terminal','action_required','revisar');
alter table public.mercadopago_cobros enable row level security;
revoke all on public.mercadopago_cobros from public,anon,authenticated;
grant select on public.mercadopago_cobros to authenticated;
grant all on public.mercadopago_cobros to service_role;
create policy mercadopago_cobros_lectura on public.mercadopago_cobros for select to authenticated
 using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol()) in ('admin','ventas'));

-- Solo el servidor invoca estas funciones, después de autenticar al operador
-- y consultar el estado real al proveedor. No se aceptan importes del cliente al confirmar.
create function public.mercadopago_preparar_cobro(p_tenant uuid,p_actor uuid,p_id uuid,p_venta uuid,p_monto bigint,p_terminal text,p_collector text)
returns public.mercadopago_cobros language plpgsql security invoker set search_path='' as $$
declare c public.mercadopago_cobros; v public.ventas; saldo bigint;
begin
 if not exists(select 1 from public.users where id=p_actor and tenant_id=p_tenant and rol in ('admin','ventas') and estado='activo') then raise exception 'Sin permiso'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('point:'||p_venta::text,0));
 select * into c from public.mercadopago_cobros where id=p_id;
 if found then
  if c.tenant_id<>p_tenant or c.venta_id<>p_venta or c.monto<>p_monto or c.terminal_id<>p_terminal or c.collector_id<>p_collector then raise exception 'El intento ya existe con otros datos'; end if;
  return c;
 end if;
 select * into v from public.ventas where id=p_venta and tenant_id=p_tenant for update;
 if not found or v.anulada or v.paciente_id is null then raise exception 'Compra no disponible. Asigna primero un paciente.'; end if;
 select v.total-coalesce(sum(monto),0) into saldo from public.pagos_abonos where venta_id=v.id and tenant_id=p_tenant;
 if p_monto<=0 or p_monto>saldo then raise exception 'El monto supera el saldo de la compra'; end if;
 if not exists(select 1 from public.mercadopago_sync where tenant_id=p_tenant and collector_id=p_collector) then raise exception 'Cuenta no verificada'; end if;
 insert into public.mercadopago_cobros(id,tenant_id,venta_id,actor_id,monto,terminal_id,collector_id)
 values(p_id,p_tenant,p_venta,p_actor,p_monto,p_terminal,p_collector) returning * into c;
 return c;
end;
$$;

create function public.mercadopago_aplicar_cobro(p_tenant uuid,p_id uuid,p_pago text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.mercadopago_cobros; m public.mercadopago_pagos; v public.ventas; a public.pagos_abonos; p public.pacientes; saldo bigint;
begin
 select * into c from public.mercadopago_cobros where id=p_id and tenant_id=p_tenant for update;
 if not found or c.order_id is null then raise exception 'Cobro no disponible'; end if;
 select * into a from public.pagos_abonos where id=c.id;
 if found then
  if a.tenant_id=p_tenant and a.venta_id=c.venta_id and a.numero_voucher=p_pago and a.monto=c.monto then return true; end if;
  raise exception 'El intento está asociado a otro abono';
 end if;
 select * into m from public.mercadopago_pagos where tenant_id=p_tenant and pago_id=p_pago for share;
 if not found or m.collector_id<>c.collector_id or m.estado<>'approved' or m.monto_devuelto<>0 or m.monto<>c.monto or m.medio_pago is null then raise exception 'Mercado Pago no confirma este cobro'; end if;
 select * into v from public.ventas where id=c.venta_id and tenant_id=p_tenant for update;
 if not found or v.anulada then raise exception 'Compra no disponible'; end if;
 select v.total-coalesce(sum(monto),0) into saldo from public.pagos_abonos where venta_id=v.id and tenant_id=p_tenant;
 if c.monto>saldo then raise exception 'Saldo modificado: revisar el pago recibido antes de aplicarlo'; end if;
 insert into public.pagos_abonos(id,tenant_id,venta_id,monto,medio_pago,numero_voucher,fecha)
 values(c.id,p_tenant,v.id,m.monto,m.medio_pago,m.pago_id,m.fecha) returning * into a;
 select * into p from public.pacientes where id=v.paciente_id and tenant_id=p_tenant;
 if found and nullif(btrim(p.rut),'') is not null then
  insert into public.mercadopago_vinculos(tenant_id,pago_id,abono_id,venta_id,paciente_id,paciente_nombre,paciente_rut,monto,medio_pago,fecha_abono,confirmado_por)
  values(p_tenant,m.pago_id,a.id,v.id,p.id,p.nombre,p.rut,a.monto,a.medio_pago,a.fecha,c.actor_id);
 end if;
 update public.mercadopago_cobros set estado='processed',pago_id=m.pago_id,confirmado_en=now(),actualizado_en=now(),error_codigo=null where id=c.id;
 return true;
end;
$$;
revoke all on function public.mercadopago_preparar_cobro(uuid,uuid,uuid,uuid,bigint,text,text),public.mercadopago_aplicar_cobro(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mercadopago_preparar_cobro(uuid,uuid,uuid,uuid,bigint,text,text),public.mercadopago_aplicar_cobro(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
-- Un voucher escrito no prueba un pago: los nuevos abonos de tarjeta en una
-- cuenta conectada requieren una operación real previamente consultada.
create function public.exigir_tarjeta_verificada() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.medio_pago in ('debito','credito')
  and exists(select 1 from public.mercadopago_sync where tenant_id=new.tenant_id and collector_id is not null)
  and (tg_op='INSERT' or new.monto is distinct from old.monto or new.numero_voucher is distinct from old.numero_voucher or new.medio_pago is distinct from old.medio_pago or new.venta_id is distinct from old.venta_id) then
  if not exists(select 1 from public.mercadopago_pagos m join public.mercadopago_sync s on s.tenant_id=m.tenant_id and s.collector_id=m.collector_id
   where m.tenant_id=new.tenant_id and m.pago_id=new.numero_voucher and m.estado='approved' and m.monto_devuelto=0 and m.monto=new.monto and m.medio_pago=new.medio_pago) then
   raise exception 'Falta verificar esta operación real con Mercado Pago. No registres un pago solo con el número escrito.' using errcode='23514';
  end if;
 end if;
 return new;
end;
$$;
create trigger exigir_tarjeta_verificada before insert or update on public.pagos_abonos
 for each row execute function public.exigir_tarjeta_verificada();
revoke all on function public.exigir_tarjeta_verificada() from public,anon;
