drop trigger exigir_tarjeta_verificada on public.pagos_abonos;
drop function public.exigir_tarjeta_verificada();
create function mercadopago_privado.exigir_tarjeta_verificada() returns trigger
language plpgsql security definer set search_path='' as $$
begin
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
create trigger exigir_tarjeta_verificada before insert or update on public.pagos_abonos
 for each row execute function mercadopago_privado.exigir_tarjeta_verificada();
revoke all on function mercadopago_privado.exigir_tarjeta_verificada() from public,anon,authenticated;
