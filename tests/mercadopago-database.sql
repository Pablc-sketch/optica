-- Ejecutar SOLO dentro de BEGIN/ROLLBACK. No deja confirmaciones ni cambia caja.
do $$
declare a record; v record; p record; actor uuid; segundo uuid; otro_paciente uuid;
  esperado jsonb; denegado boolean; op text; otro_tenant uuid; run_a uuid:=gen_random_uuid(); run_b uuid:=gen_random_uuid();
begin
  select b.* into a from public.pagos_abonos b join public.mercadopago_pagos m
    on m.tenant_id=b.tenant_id and m.pago_id=b.numero_voucher
    where b.monto=m.monto and b.medio_pago=m.medio_pago and m.estado='approved' and m.monto_devuelto=0
    order by b.fecha desc limit 1;
  if a.id is null then raise exception 'Falta una operación real de referencia'; end if;
  op:=a.numero_voucher;
  select id into otro_tenant from public.tenants where id<>a.tenant_id limit 1;
  insert into public.mercadopago_pagos(tenant_id,pago_id,collector_id,fecha,actualizado_en_proveedor,monto,estado,medio_pago)
    values(otro_tenant,'999999999999999999997','456',now(),now(),100,'approved','debito');
  select * into v from public.ventas where id=a.venta_id;
  select * into p from public.pacientes where id=v.paciente_id;
  select id into actor from public.users where tenant_id=a.tenant_id and rol='admin' and estado='activo' limit 1;
  delete from public.mercadopago_vinculos where tenant_id=a.tenant_id and pago_id=op;
  esperado:=jsonb_build_object('venta_id',v.id,'paciente_id',p.id,'paciente_nombre',p.nombre,'paciente_rut',p.rut,
    'monto',a.monto,'medio_pago',a.medio_pago,'fecha_abono',a.fecha);
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=op and conciliacion='confirmar_paciente') then
    raise exception 'Dio por confirmada una identidad sin cotejo'; end if;
  select b.id into segundo from public.pagos_abonos b where b.tenant_id=a.tenant_id and b.id<>a.id
    and not exists(select 1 from public.mercadopago_vinculos l where l.abono_id=b.id) limit 1;
  denegado:=false;
  begin update public.pagos_abonos set numero_voucher=op where id=segundo;
  exception when unique_violation then denegado:=true; end;
  if not denegado then raise exception 'Reutilizó la operación en otro abono'; end if;
  update public.mercadopago_pagos set fecha=fecha-interval '2 days' where tenant_id=a.tenant_id and pago_id=op;
  denegado:=false;
  begin perform public.mercadopago_confirmar_vinculo(a.tenant_id,actor,op,a.id,esperado);
  exception when check_violation then denegado:=true; end;
  if not denegado then raise exception 'Confirmó un pago de otro día'; end if;
  update public.mercadopago_pagos set fecha=fecha+interval '2 days' where tenant_id=a.tenant_id and pago_id=op;
  denegado:=false;
  begin perform public.mercadopago_confirmar_vinculo(a.tenant_id,actor,op,a.id,esperado||jsonb_build_object('paciente_id',gen_random_uuid()));
  exception when check_violation then denegado:=true; end;
  if not denegado then raise exception 'Aceptó una identidad distinta a la mostrada'; end if;
  denegado:=false;
  begin perform public.mercadopago_confirmar_vinculo(a.tenant_id,gen_random_uuid(),op,a.id,esperado);
  exception when insufficient_privilege then denegado:=true; end;
  if not denegado then raise exception 'Aceptó un actor no autorizado'; end if;
  perform public.mercadopago_confirmar_vinculo(a.tenant_id,actor,op,a.id,esperado);
  perform public.mercadopago_confirmar_vinculo(a.tenant_id,actor,op,a.id,esperado);
  if (select count(*) from public.mercadopago_vinculos where tenant_id=a.tenant_id and pago_id=op)<>1
    or not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=op and conciliacion='vinculado') then
    raise exception 'Confirmación no idempotente o vínculo incorrecto'; end if;
  denegado:=false;
  begin update public.pagos_abonos set numero_voucher='999999999999999999998' where id=a.id;
  exception when check_violation then denegado:=sqlerrm like '%voucher ya está confirmado%'; end;
  if not denegado then raise exception 'Permitió quitar el voucher confirmado'; end if;
  denegado:=false;
  begin update public.pagos_abonos set monto=monto-1 where id=a.id;
  exception when check_violation then denegado:=sqlerrm like '%voucher ya está confirmado%'; end;
  if not denegado then raise exception 'Permitió alterar un abono confirmado'; end if;
  select id into otro_paciente from public.pacientes where tenant_id=a.tenant_id and id<>p.id limit 1;
  denegado:=false;
  begin update public.ventas set paciente_id=otro_paciente where id=v.id;
  exception when check_violation then denegado:=true; end;
  if not denegado then raise exception 'Permitió cambiar el paciente de la compra'; end if;
  denegado:=false;
  begin delete from public.pagos_abonos where id=a.id;
  exception when check_violation then denegado:=true; end;
  if not denegado then raise exception 'Permitió borrar el abono confirmado'; end if;
  update public.pacientes set nombre=nombre||' prueba transaccional' where id=p.id;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=op and conciliacion='identidad_modificada') then
    raise exception 'Mostró como confirmada una identidad editada'; end if;
  update public.pacientes set nombre=p.nombre where id=p.id;
  update public.mercadopago_pagos set estado='refunded',monto_devuelto=monto,actualizado_en_proveedor=now() where tenant_id=a.tenant_id and pago_id=op;
  if not exists(select 1 from public.mercadopago_conciliacion where tenant_id=a.tenant_id and pago_id=op and conciliacion='revisar_pago') then
    raise exception 'No detectó devolución'; end if;
  update public.mercadopago_pagos set estado='approved',monto_devuelto=0,actualizado_en_proveedor=now()-interval '1 day' where tenant_id=a.tenant_id and pago_id=op;
  if not exists(select 1 from public.mercadopago_pagos where tenant_id=a.tenant_id and pago_id=op and estado='refunded') then
    raise exception 'Una respuesta antigua reactivó el pago'; end if;
  update public.mercadopago_sync set bloqueado_hasta=null where tenant_id=a.tenant_id;
  if not public.mercadopago_iniciar_sync(a.tenant_id,run_a) then raise exception 'No adquirió lease'; end if;
  if public.mercadopago_iniciar_sync(a.tenant_id,run_b) then raise exception 'Adquirió dos leases'; end if;
  if public.mercadopago_finalizar_sync(a.tenant_id,run_b,null,now()) then raise exception 'Un proceso ajeno cerró lease'; end if;
end;
$$;
select set_config('request.jwt.claim.sub',(select u.id::text from public.users u join public.mercadopago_vinculos l on l.tenant_id=u.tenant_id
  where u.estado='activo' and u.rol='admin' limit 1),true);
set local role authenticated;
do $$
declare denegado boolean:=false;
begin
  if public.jwt_tenant_id() is null then raise exception 'Falta sesión de prueba'; end if;
  if not exists(select 1 from public.mercadopago_vinculos) then raise exception 'No puede leer su propio vínculo'; end if;
  if exists(select 1 from public.mercadopago_conciliacion where tenant_id<>public.jwt_tenant_id()) then raise exception 'Fuga de otra óptica'; end if;
  begin update public.mercadopago_vinculos set paciente_nombre='falsificado';
  exception when insufficient_privilege then denegado:=true; end;
  if not denegado then raise exception 'El cliente falsifica confirmaciones'; end if;
  denegado:=false;
  begin perform public.mercadopago_confirmar_vinculo(public.jwt_tenant_id(),auth.uid(),'123456789',gen_random_uuid(),'{}');
  exception when insufficient_privilege then denegado:=true; end;
  if not denegado then raise exception 'El cliente confirma sin el servidor'; end if;
end;
$$;
reset role;
set local role service_role;
do $$
declare r record; actor uuid;
begin
  select * into r from public.mercadopago_conciliacion where confirmado_en is not null limit 1;
  select confirmado_por into actor from public.mercadopago_vinculos where tenant_id=r.tenant_id and pago_id=r.pago_id;
  update public.mercadopago_pagos set estado='approved',monto_devuelto=0,actualizado_en_proveedor=now()+interval '1 second'
    where tenant_id=r.tenant_id and pago_id=r.pago_id;
  if not public.mercadopago_confirmar_vinculo(r.tenant_id,actor,r.pago_id,r.abono_id,
    jsonb_build_object('venta_id',r.venta_id,'paciente_id',r.paciente_id,'paciente_nombre',r.paciente_nombre,'paciente_rut',r.paciente_rut,
      'monto',r.monto,'medio_pago',r.medio_abono,'fecha_abono',r.fecha_abono)) then
    raise exception 'El servicio autorizado no puede confirmar'; end if;
  update public.mercadopago_pagos set estado='refunded',monto_devuelto=monto,actualizado_en_proveedor=now()+interval '2 seconds'
    where tenant_id=r.tenant_id and pago_id=r.pago_id;
  -- El pago fue devuelto en la prueba: incluso el proceso de servidor no
  -- puede volver a confirmarlo como aprobado.
  begin
    perform public.mercadopago_confirmar_vinculo(r.tenant_id,actor,r.pago_id,r.abono_id,
      jsonb_build_object('venta_id',r.venta_id,'paciente_id',r.paciente_id,'paciente_nombre',r.paciente_nombre,'paciente_rut',r.paciente_rut,
        'monto',r.monto,'medio_pago',r.medio_abono,'fecha_abono',r.fecha_abono));
    raise exception 'El servidor volvió a confirmar un pago devuelto';
  exception when check_violation then null; end;
end;
$$;
reset role;
