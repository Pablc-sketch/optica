create or replace function mercadopago_privado.exigir_tarjeta_verificada() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- La RPC histórica escribe el voucher en el UPDATE siguiente de la misma transacción.
 -- El constraint diferido ya existente impide confirmar una tarjeta sin voucher.
 if tg_op='INSERT' and new.numero_voucher is null then return new; end if;
 if auth.role()='authenticated' and (auth.uid() is null or public.jwt_tenant_id() is distinct from new.tenant_id) then raise exception 'Óptica no autorizada' using errcode='42501'; end if;
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
create or replace function public.mercadopago_aplicar_cobro(p_tenant uuid,p_id uuid,p_pago text)
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
 update public.ventas set estado_pago=case when c.monto>=saldo then 'pagada' else 'abono_parcial' end where id=v.id and tenant_id=p_tenant;
 select * into p from public.pacientes where id=v.paciente_id and tenant_id=p_tenant;
 if found and nullif(btrim(p.rut),'') is not null then
  insert into public.mercadopago_vinculos(tenant_id,pago_id,abono_id,venta_id,paciente_id,paciente_nombre,paciente_rut,monto,medio_pago,fecha_abono,confirmado_por)
  values(p_tenant,m.pago_id,a.id,v.id,p.id,p.nombre,p.rut,a.monto,a.medio_pago,a.fecha,c.actor_id);
 end if;
 update public.mercadopago_cobros set estado='processed',pago_id=m.pago_id,confirmado_en=now(),actualizado_en=now(),error_codigo=null where id=c.id;
 return true;
end;
$$;
