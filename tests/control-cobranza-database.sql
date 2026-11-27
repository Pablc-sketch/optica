begin;

do $$
declare
  optica uuid := gen_random_uuid();
  otra_optica uuid := gen_random_uuid();
  administrador uuid := gen_random_uuid();
  vendedor uuid := gen_random_uuid();
  operativo uuid := gen_random_uuid();
  chequeo uuid := gen_random_uuid();
  otro_chequeo uuid := gen_random_uuid();
  venta uuid := gen_random_uuid();
  abono uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  retiro uuid := gen_random_uuid();
  version_guardada text;
  cambio boolean;
  caja record;
begin
  insert into public.tenants(id,nombre_comercial) values (optica,'Prueba local'),(otra_optica,'Otra óptica local');
  insert into auth.users(id,email) values (administrador,'admin@example.invalid'),(vendedor,'ventas@example.invalid');
  insert into public.users(id,tenant_id,nombre,email,rol)
    values (administrador,optica,'Admin','admin@example.invalid','admin'),(vendedor,optica,'Ventas','ventas@example.invalid','ventas');
  insert into public.suscripciones(tenant_id,fecha_renovacion) values (optica,current_date+10);
  insert into public.chequeos(id,tenant_id,nombre,desde,hasta)
    values (chequeo,optica,'Chequeo local',current_date,current_date),
      (otro_chequeo,otra_optica,'Otro chequeo local',current_date,current_date);
  insert into public.operativos(id,tenant_id,fecha,nombre,chequeo_id)
    values (operativo,optica,current_date,'Operativo local',chequeo);
  insert into public.ventas(id,tenant_id,total,operativo_id) values (venta,optica,10000,operativo);
  insert into public.venta_items(id,tenant_id,venta_id,descripcion,cantidad,precio_unitario)
    values (item,optica,venta,'Prueba local',1,10000);

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',vendedor)::text,true);
  execute 'set local role authenticated';
  perform public.registrar_abono_con_voucher(abono,venta,4000,'efectivo',null);
  perform public.actualizar_venta(venta,jsonb_build_array(jsonb_build_object('id',item,'cantidad',1,
    'precio_unitario',11000,'descuento',0)),'Corrección local');

  cambio := false;
  begin
    perform public.anular_venta(venta,'Prueba local');
  exception when insufficient_privilege then cambio := true;
  end;
  if not cambio then raise exception 'Ventas pudo anular'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',administrador)::text,true);
  perform public.corregir_documento_venta(venta,abono,now(),5000,'efectivo',null,null,null,false);
  if not exists (select 1 from public.cobranza_historial h where h.abono_id=abono
    and h.usuario_id=administrador and h.antes->>'monto'='4000' and h.despues->>'monto'='5000') then
    raise exception 'No quedó registrada la corrección del abono';
  end if;
  if (select total from public.ventas where id=venta) <> 11000 then
    raise exception 'Cambió el total al registrar el abono';
  end if;

  perform public.anular_venta(venta,'Prueba local');
  perform public.anular_venta(venta,'Reintento');
  select * into caja from public.caja_global();
  if caja.entro_efectivo<>5000 or caja.salio_efectivo<>0 or public.devoluciones_venta_pendientes()<>5000 then
    raise exception 'La anulación no conservó el dinero y su obligación de devolución';
  end if;
  perform public.confirmar_devolucion_venta(abono,'Comprobante de prueba');
  perform public.confirmar_devolucion_venta(abono,'Reintento');
  select * into caja from public.caja_global();
  if caja.entro_efectivo<>5000 or caja.salio_efectivo<>5000 or public.devoluciones_venta_pendientes()<>0 then
    raise exception 'La devolución no quedó reflejada una sola vez';
  end if;

  version_guardada := public.version_caja_reparto();
  execute 'reset role';
  execute 'set local role service_role';
  perform public.registrar_pago_reparto(optica,administrador,retiro,null,chequeo,version_guardada,'pablo',1000,'digital');
  perform public.registrar_pago_reparto(optica,administrador,retiro,null,chequeo,version_guardada,'pablo',1000,'digital');
  cambio := false;
  begin
    perform public.registrar_pago_reparto(optica,administrador,gen_random_uuid(),null,chequeo,version_guardada,'pablo',1000,'digital');
  exception when serialization_failure then cambio := true;
  end;
  if not cambio then raise exception 'Registró un segundo pago con la misma versión obsoleta'; end if;
  if not exists (select 1 from public.retiros_sueldo where id=retiro and reparto_verificado
    and confirmado_por=administrador and monto=1000 and chequeo_id=chequeo) then
    raise exception 'El retiro no quedó confirmado y asociado a su chequeo';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  insert into public.retiros_sueldo(id,tenant_id,persona,fecha,monto,caja,es_sueldo)
    values (gen_random_uuid(),optica,'madre',current_date,1800,'digital',true) returning id into retiro;
  cambio := false;
  begin
    perform public.asociar_retiro_historico(retiro,null,otro_chequeo);
  exception when insufficient_privilege then cambio := true;
  end;
  if not cambio then raise exception 'Asoció el retiro a un chequeo de otra óptica'; end if;
  perform public.asociar_retiro_historico(retiro,null,chequeo);
  if not exists(select 1 from public.retiros_sueldo where id=retiro and monto=1800 and chequeo_id=chequeo) then
    raise exception 'La asociación no conservó el importe histórico';
  end if;
end $$;

rollback;
select 'OK: permiso de anulación, cobro normal, corrección auditada, devolución, reintentos y asociación histórica' as verificacion;
