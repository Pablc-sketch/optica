-- Ejecutar dentro de BEGIN / ROLLBACK como authenticated, con la sesión de
-- un administrador de pruebas. No incluye pacientes, ventas ni otros tenants.
do $$
declare
  t uuid := public.jwt_tenant_id();
  gasto uuid := gen_random_uuid();
  movimiento uuid := gen_random_uuid();
  conteo uuid := gen_random_uuid();
  antes record; despues record;
  v_esperado bigint;
begin
  if t is null or public.jwt_rol() <> 'admin' then raise exception 'Se requiere administrador de pruebas'; end if;
  select * into antes from public.caja_global();
  insert into public.gastos_globales(id,tenant_id,fecha,categoria,descripcion,monto,caja)
    values(gasto,t,current_date,'otro','Prueba transaccional: gasto personal',30000,'personal');
  select * into despues from public.caja_global();
  if despues.salio_efectivo <> antes.salio_efectivo or despues.salio_digital <> antes.salio_digital
    then raise exception 'Un gasto personal alteró las cajas'; end if;
  insert into public.caja_movimientos(id,tenant_id,fecha,tipo,monto,caja,descripcion)
    values(gen_random_uuid(),t,current_date,'deposito',2000,'digital','Prueba: depósito efectivo');
  select * into despues from public.caja_global();
  if despues.salio_efectivo <> antes.salio_efectivo+2000 or despues.salio_digital <> antes.salio_digital-2000
    then raise exception 'Traslado incorrecto'; end if;
  insert into public.caja_movimientos(id,tenant_id,fecha,tipo,monto,caja,descripcion,gasto_id)
    values(movimiento,t,current_date,'devolucion',5000,'digital','Prueba: devolución parcial',gasto);
  -- Reintento con el mismo identificador: no duplica el movimiento.
  insert into public.caja_movimientos(id,tenant_id,fecha,tipo,monto,caja,descripcion,gasto_id)
    values(movimiento,t,current_date,'devolucion',5000,'digital','Prueba: devolución parcial',gasto);
  if (select sum(monto) from public.caja_movimientos where gasto_id=gasto and tenant_id=t) <> 5000
    then raise exception 'Devolución duplicada'; end if;
  begin
    insert into public.caja_movimientos(id,tenant_id,fecha,tipo,monto,caja,descripcion,gasto_id)
      values(gen_random_uuid(),t,current_date,'devolucion',26000,'digital','Prueba: exceso',gasto);
    raise exception 'Se permitió devolver de más';
  exception when raise_exception then
    if sqlerrm <> 'Revisa la fecha y el saldo pendiente del gasto personal' then raise; end if;
  end;
  begin
    update public.gastos_globales set caja='digital' where id=gasto and tenant_id=t;
    raise exception 'Se permitió cambiar la caja de un gasto devuelto';
  exception when raise_exception then
    if sqlerrm <> 'Este gasto ya tiene devoluciones registradas' then raise; end if;
  end;
  begin
    insert into public.caja_movimientos(id,tenant_id,fecha,tipo,monto,caja,descripcion)
      values(gen_random_uuid(),gen_random_uuid(),current_date,'deposito',1,'digital','Prueba: tenant ajeno inexistente');
    raise exception 'Se permitió escribir otro tenant';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.caja_movimientos set monto=1 where id=movimiento;
    raise exception 'Se permitió alterar el historial';
  exception when insufficient_privilege then null;
  end;
  select entro_efectivo-salio_efectivo into v_esperado from public.caja_global();
  perform public.registrar_conteo_caja(conteo,12345,'Prueba: conteo');
  if not exists(select 1 from public.caja_conteos where id=conteo and tenant_id=t and contado=12345 and caja_conteos.esperado=v_esperado)
    then raise exception 'Conteo sin saldo esperado del servidor'; end if;
  select * into despues from public.caja_global();
  if despues.entro_efectivo-despues.salio_efectivo <> v_esperado then raise exception 'El conteo corrigió el saldo sin autorización'; end if;
end;
$$;
