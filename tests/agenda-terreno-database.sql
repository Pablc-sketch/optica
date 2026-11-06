-- Ejecutar dentro de BEGIN/ROLLBACK sobre un espacio piloto con suscripción.
do $$
declare t uuid; a uuid; otro uuid; externo uuid;
begin
  select id into t from public.tenants where nombre_comercial in ('Óptica Piloto · DEMO','Visión Herrante') order by created_at limit 1;
  select id into a from public.users where tenant_id=t and rol='admin' and estado='activo' limit 1;
  select id into otro from public.tenants where id<>t limit 1;
  if a is null or otro is null then raise exception 'Falta entorno para verificar aislamiento'; end if;
  update public.tenants set agenda_paralela=true where id=t;
  insert into public.agenda_recursos(tenant_id,tipo,nombre) values(otro,'kit','QA externo') returning id into externo;
  insert into public.agenda_recursos(tenant_id,tipo,nombre)
    select t,tipo,'QA '||tipo||n from unnest(array['vendedora','tecnologo','coordinador','kit']) tipo cross join generate_series(1,2) n;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  perform set_config('agenda_test.externo',externo::text,true);
end $$;
set local role authenticated;
do $$
declare ids1 jsonb; ids2 jsonb; entrada jsonb;
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  k text; bloqueo boolean;
begin
  select jsonb_object_agg(tipo,id) into ids1 from public.agenda_recursos where nombre='QA '||tipo||'1';
  select jsonb_object_agg(tipo,id) into ids2 from public.agenda_recursos where nombre='QA '||tipo||'2';
  if exists(select 1 from public.agenda_recursos where nombre='QA externo') then raise exception 'Fuga de recursos'; end if;
  entrada:=jsonb_build_object('id',a,'nombre','Prueba sede norte','direccion','Norte','fecha','2030-05-02','inicio','09:00','fin','13:00','meta',25,'presupuesto',jsonb_build_object('bencina',10000));
  perform public.agenda_guardar_turno(entrada||ids1);
  perform public.agenda_guardar_turno(entrada||ids1); -- reintento idempotente
  perform public.agenda_guardar_turno(entrada||ids2||jsonb_build_object('id',b,'nombre','Prueba sede sur'));
  foreach k in array array['vendedora','tecnologo','coordinador','kit'] loop
    bloqueo:=false;
    begin
      perform public.agenda_guardar_turno(entrada||ids2||jsonb_build_object('id',c,k,ids1->k));
    exception when exclusion_violation then bloqueo:=true;
    end;
    if not bloqueo then raise exception 'No bloqueó % duplicado',k; end if;
  end loop;
  if exists(select 1 from public.operativos where id=c) then raise exception 'Guardó una jornada parcial'; end if;
  bloqueo:=false;
  begin
    perform public.agenda_guardar_turno(entrada||ids2||jsonb_build_object('id',c,'kit',current_setting('agenda_test.externo')));
  exception when check_violation then bloqueo:=true;
  end;
  if not bloqueo then raise exception 'Aceptó recurso externo'; end if;
  perform public.agenda_guardar_turno(entrada||ids1||jsonb_build_object('id',c,'inicio','13:00','fin','17:00'));
  bloqueo:=false;
  begin update public.operativos set hora_inicio='12:00' where id=c;
  exception when exclusion_violation then bloqueo:=true; end;
  if not bloqueo then raise exception 'El editor anterior pudo crear un choque'; end if;
  update public.operativos set estado='cancelado' where id=a;
  update public.operativos set hora_inicio='12:00' where id=c;
  bloqueo:=false;
  begin update public.operativos set estado='planificado' where id=a;
  exception when exclusion_violation then bloqueo:=true; end;
  if not bloqueo then raise exception 'Pudo reabrir una reserva ocupada'; end if;
  if (select count(*) from public.agenda_turnos where operativo_id in (a,b,c))<>3 then raise exception 'Reservas duplicadas'; end if;
  if has_table_privilege('authenticated','public.agenda_turnos','update') then raise exception 'Permiso de actualización directa'; end if;
end $$;
reset role;
