begin;
do $$
declare u uuid; t uuid; op uuid; g uuid := gen_random_uuid(); a uuid := gen_random_uuid(); caught boolean; antes numeric; despues numeric;
begin
  select a.id,a.tenant_id into u,t from public.users a join public.suscripciones s on s.tenant_id=a.tenant_id
  where a.rol='admin' and a.estado='activo' and s.estado in ('trial','activa') and s.fecha_renovacion>=(now() at time zone 'America/Santiago')::date order by a.created_at limit 1;
  select id into op from public.operativos where tenant_id=t limit 1;
  if u is null or op is null then raise exception 'Faltan datos para prueba'; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.gastos_globales(id,tenant_id,fecha,monto,caja,categoria,descripcion)
    values(g,t,(now() at time zone 'America/Santiago')::date,340000,'digital','compra_inventario','PRUEBA REVERSIBLE compra marcos');
  select sum(monto) into antes from public.gastos_globales;
  insert into public.gastos_asignaciones(id,tenant_id,gasto_id,operativo_id,clave,monto) values(a,t,g,op,'marcos',120000);
  select sum(monto) into despues from public.gastos_globales;
  if antes is distinct from despues then raise exception 'Duplicó salida de caja'; end if;
  caught:=false;begin
    insert into public.gastos_asignaciones(id,tenant_id,gasto_id,operativo_id,clave,monto) values(gen_random_uuid(),t,g,op,'marcos',230000);
  exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Permitió sobreasignar la compra'; end if;
  caught:=false;begin update public.gastos_globales set monto=1 where id=g;exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Permitió reducir gasto debajo de asignaciones'; end if;
  caught:=false;begin update public.gastos_asignaciones set monto=1 where id=a;exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Permitió reescribir la historia'; end if;
  update public.gastos_asignaciones set anulado_en=now() where id=a;
  if not exists(select 1 from public.gastos_asignaciones where id=a and anulado_en is not null and anulado_por=u) then raise exception 'No guardó reversión'; end if;
  insert into public.gastos_asignaciones(id,tenant_id,gasto_id,operativo_id,clave,monto) values(gen_random_uuid(),t,g,op,'marcos',340000);
  caught:=false;begin
    insert into public.gastos_asignaciones(id,tenant_id,gasto_id,operativo_id,clave,monto) values(gen_random_uuid(),t,g,gen_random_uuid(),'marcos',1);
  exception when raise_exception then caught:=true;end;
  if not caught then raise exception 'Permitió operativo ajeno o inexistente'; end if;
end $$;
rollback;
select 'OK: asignación parcial, caja sin duplicados, límites, historial, reversión y aislamiento. Todo revertido.' as verificacion;
