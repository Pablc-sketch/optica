begin; do $$ declare u uuid; t uuid; x uuid := gen_random_uuid(); v bigint; n bigint; caught boolean; begin
select a.id,a.tenant_id into u,t from public.users a join public.suscripciones s on s.tenant_id=a.tenant_id where a.rol='admin' and a.estado='activo' and s.estado in ('trial','activa') and s.fecha_renovacion>=(now() at time zone 'America/Santiago')::date order by a.created_at limit 1;
if u is null then raise exception 'Sin administrador vigente para prueba'; end if;
perform set_config('request.jwt.claim.sub',u::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true); execute 'set local role authenticated';
perform public.revisar_movimiento_financiero('retiros_sueldo',x,0,'crear',jsonb_build_object('persona','isadora','fecha',(now() at time zone 'America/Santiago')::date,'monto',90000,'caja','digital','motivo','PRUEBA REVERSIBLE'),'Prueba reversible');
select revision_version into v from public.retiros_sueldo where id=x and confirmado_por=u and confirmado_en is not null;
if v is null then raise exception 'Falla confirmación'; end if;
perform public.revisar_movimiento_financiero('retiros_sueldo',x,v,'guardar',jsonb_build_object('persona','isadora','fecha',(now() at time zone 'America/Santiago')::date,'monto',110000,'caja','digital','motivo','Pago extra de prueba'),'Corrección reversible');
caught:=false; begin perform public.revisar_movimiento_financiero('retiros_sueldo',x,v,'confirmar','{}','Prueba versión antigua'); exception when raise_exception then caught:=true; end; if not caught then raise exception 'No rechazó versión antigua'; end if;
update public.retiros_sueldo set monto=0 where id=x;
if exists(select 1 from public.retiros_sueldo where id=x and confirmado_en is not null) then raise exception 'No invalidó confirmación al editar'; end if;
select count(*) into n from public.revisiones_financieras where movimiento_id=x; if n<>5 then raise exception 'Historial incompleto: %',n; end if;
perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true); caught:=false;
begin perform public.revisar_movimiento_financiero('retiros_sueldo',x,0,'confirmar','{}','Prueba permisos'); exception when raise_exception then caught:=true; end;
if not caught then raise exception 'No rechazó usuario sin permiso'; end if; end $$; rollback;
select 'OK: alta, pago extra, historial, concurrencia, invalidación y permisos; todo revertido' as verificacion;
