-- Se ejecuta dentro de BEGIN/ROLLBACK; no deja datos artificiales ni cambia caja.
do $$
declare a record; segundo uuid; otro uuid;
begin
  select b.* into a from public.pagos_abonos b join public.ventas v on v.id=b.venta_id
    where b.medio_pago in ('debito','credito') and b.numero_voucher ~ '^[0-9]{8,30}$'
      and not v.anulada order by b.fecha desc limit 1;
  if a.id is null then raise exception 'Falta abono de referencia para la prueba'; end if;
  delete from public.mercadopago_pagos where tenant_id=a.tenant_id and pago_id=a.numero_voucher;
  insert into public.mercadopago_pagos(tenant_id,pago_id,collector_id,fecha,actualizado_en_proveedor,monto,estado,medio_pago)
    values(a.tenant_id,a.numero_voucher,'123',now(),now(),a.monto,'approved',a.medio_pago);
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=a.numero_voucher and abono_id=a.id and conciliacion='vinculado') then
    raise exception 'No vincula un abono exacto'; end if;
  update public.mercadopago_pagos set monto=monto+1 where tenant_id=a.tenant_id and pago_id=a.numero_voucher;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=a.numero_voucher and conciliacion='diferencia') then
    raise exception 'Aceptó monto diferente'; end if;
  update public.mercadopago_pagos set monto=a.monto, monto_devuelto=1 where tenant_id=a.tenant_id and pago_id=a.numero_voucher;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=a.numero_voucher and conciliacion='revisar_pago') then
    raise exception 'No detecta devolución parcial'; end if;
  update public.mercadopago_pagos set monto_devuelto=0 where tenant_id=a.tenant_id and pago_id=a.numero_voucher;
  select id into segundo from public.pagos_abonos where tenant_id=a.tenant_id and id<>a.id limit 1;
  update public.pagos_abonos set numero_voucher=a.numero_voucher where id=segundo;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=a.numero_voucher and abono_id is null and conciliacion='voucher_repetido') then
    raise exception 'Asocia un voucher repetido'; end if;
  update public.pagos_abonos set numero_voucher='999999999999999999999' where id=segundo;
  update public.pagos_abonos set numero_voucher='999999999999999999998' where id=a.id;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=a.numero_voucher and abono_id is null and conciliacion='sin_abono') then
    raise exception 'Conservó una relación obsoleta'; end if;
  select id into otro from public.tenants where id<>a.tenant_id limit 1;
  insert into public.mercadopago_pagos(tenant_id,pago_id,collector_id,fecha,actualizado_en_proveedor,monto,estado,medio_pago)
    values(otro,a.numero_voucher,'456',now(),now(),a.monto,'approved',a.medio_pago);
end;
$$;
-- Usuario real activo de la óptica solo para comprobar políticas, sin cambiarlo.
select set_config('request.jwt.claim.sub', (select u.id::text from public.users u
  join public.pagos_abonos a on a.tenant_id=u.tenant_id
  where u.estado='activo' and u.rol='admin' and a.numero_voucher='999999999999999999998' limit 1), true);
set local role authenticated;
do $$
declare denegado boolean := false;
begin
  if public.jwt_tenant_id() is null or public.jwt_rol()<>'admin' then raise exception 'No se estableció el usuario de prueba'; end if;
  if not exists(select 1 from public.mercadopago_pagos) then raise exception 'La lectura autorizada no devuelve datos'; end if;
  if exists(select 1 from public.mercadopago_pagos where tenant_id<>public.jwt_tenant_id()) then raise exception 'Fuga de otra óptica'; end if;
  if exists(select 1 from public.mercadopago_conciliacion where tenant_id<>public.jwt_tenant_id()) then raise exception 'Fuga en vista'; end if;
  begin
    update public.mercadopago_pagos set monto=1;
  exception when insufficient_privilege then denegado:=true;
  end;
  if not denegado then raise exception 'El usuario puede falsificar operaciones'; end if;
  denegado:=false;
  begin
    perform public.mercadopago_iniciar_sync(public.jwt_tenant_id(),gen_random_uuid());
  exception when insufficient_privilege then denegado:=true;
  end;
  if not denegado then raise exception 'El usuario puede iniciar una ejecución privilegiada'; end if;
end;
$$;
reset role;
