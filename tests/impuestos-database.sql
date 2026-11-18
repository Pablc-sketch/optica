begin;
do $$
declare u uuid;t uuid;op uuid;p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();g uuid:=gen_random_uuid();caught boolean;antes bigint;despues bigint;v bigint;
begin
  select a.id,a.tenant_id into u,t from public.users a join public.suscripciones s on s.tenant_id=a.tenant_id
  where a.rol='admin' and a.estado='activo' and s.estado in ('trial','activa') and s.fecha_renovacion>=(now() at time zone 'America/Santiago')::date order by a.created_at limit 1;
  select id into op from public.operativos where tenant_id=t limit 1;
  if u is null or op is null then raise exception 'Faltan datos de prueba';end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.impuestos_mensuales(tenant_id,periodo,total_declarado)values(t,'2000-01-01',30000);
  select version into v from public.impuestos_mensuales where tenant_id=t and periodo='2000-01-01';
  update public.impuestos_mensuales set ppm=1000 where tenant_id=t and periodo='2000-01-01' and version=v;
  if not exists(select 1 from public.impuestos_mensuales where tenant_id=t and periodo='2000-01-01' and version=v+1) then raise exception 'Versión incorrecta';end if;
  if (select count(*) from public.impuestos_historial where tenant_id=t and periodo='2000-01-01')<>2 then raise exception 'No conservó historial';end if;
  select coalesce(sum(monto),0) into antes from public.gastos_globales;
  perform public.registrar_pago_sii(p1,'2000-01-01',5000,(now() at time zone 'America/Santiago')::date,'digital',null);
  perform public.registrar_pago_sii(p1,'2000-01-01',5000,(now() at time zone 'America/Santiago')::date,'digital',null);
  select coalesce(sum(monto),0) into despues from public.gastos_globales;
  if despues-antes<>5000 then raise exception 'Duplicó pago al reintentar';end if;
  caught:=false;begin perform public.registrar_pago_sii(p1,'2000-01-01',6000,(now() at time zone 'America/Santiago')::date,'digital',null);exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Aceptó reintento con importe distinto';end if;
  insert into public.gastos_globales(id,tenant_id,fecha,monto,caja,categoria,descripcion)values(g,t,(now() at time zone 'America/Santiago')::date,4000,'digital','otro','PRUEBA REVERSIBLE pago previo SII');
  select coalesce(sum(monto),0) into antes from public.gastos_globales;
  perform public.registrar_pago_sii(p2,'2000-01-01',4000,(now() at time zone 'America/Santiago')::date,'digital',g);
  select coalesce(sum(monto),0) into despues from public.gastos_globales;
  if antes<>despues then raise exception 'Duplicó gasto ya registrado';end if;
  caught:=false;begin insert into public.gastos_asignaciones(id,tenant_id,gasto_id,operativo_id,clave,monto)values(gen_random_uuid(),t,g,op,'marcos',1);exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Reutilizó pago SII como pago marcos';end if;
  caught:=false;begin update public.impuestos_pagos set periodo='2000-02-01' where id=p2;exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Reescribió historial de pago';end if;
  update public.impuestos_pagos set anulado_en=now() where id=p2;
  if not exists(select 1 from public.gastos_globales where id=g and monto=4000) then raise exception 'Borró gasto al desvincular';end if;
  caught:=false;begin insert into public.impuestos_mensuales(tenant_id,periodo)values(gen_random_uuid(),'2000-03-01');exception when others then caught:=true;end;
  if not caught then raise exception 'Permitió óptica ajena';end if;
end $$;
rollback;
select 'OK: deuda mensual, versión, historial, idempotencia, caja, pago existente, separación de costos y aislamiento; todo revertido' as verificacion;
