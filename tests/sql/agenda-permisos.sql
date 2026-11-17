-- Verificación con el rol real de una vendedora. Todas las escrituras se
-- revierten al terminar y solo se crean registros ficticios dentro del bloque.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'role','authenticated')::text from public.users u where u.rol='ventas' and u.estado='activo' order by u.id limit 1),true);
select set_config('lentia.qa_other',coalesce((select o.id::text from public.operativos o where o.tenant_id<>public.jwt_tenant_id() limit 1),gen_random_uuid()::text),true);
set local role authenticated;
do $$
declare
  propio uuid:=gen_random_uuid(); externo uuid:=gen_random_uuid(); libre uuid:=gen_random_uuid();
  t uuid:=public.jwt_tenant_id(); p jsonb; prohibido boolean;
begin
  if public.jwt_rol()<>'ventas' or t is null then raise exception 'Falta cuenta de ventas para verificar'; end if;
  p:=jsonb_build_object('id',propio,'tipo','propio','fecha','2038-04-01','fecha_fin','2038-04-01','nombre','QA calendario temporal','estado','confirmado','hora_inicio','09:00','hora_fin','11:00','comuna','Quilicura','region','Metropolitana','direccion','Sede de prueba');
  perform public.agenda_guardar(p,false);
  perform public.agenda_guardar(p||jsonb_build_object('nombre','QA editado','costo_transporte',999999,'comision_vendedora_pct',90,'tenant_id',gen_random_uuid()),true);
  if not exists(select 1 from public.operativos where id=propio and tenant_id=t and nombre='QA editado' and comuna='Quilicura' and costo_transporte=0 and comision_vendedora_pct=10) then raise exception 'Falló edición limitada'; end if;
  perform public.agenda_guardar(jsonb_build_object('id',externo,'tipo','externo','fecha','2038-04-02','nombre','QA externo temporal','optica','Óptica prueba','estado','pendiente','comuna','Chillán'),false);
  if not exists(select 1 from public.agenda_bloques where id=externo and comuna='Chillán') then raise exception 'Falló lectura de ventas'; end if;
  perform public.agenda_guardar(jsonb_build_object('id',externo,'tipo','externo','fecha','2038-04-02','nombre','QA externo editado','optica','Óptica prueba','estado','confirmado','comuna','Los Ángeles'),true);
  if not exists(select 1 from public.agenda_bloques where id=externo and comuna='Los Ángeles') then raise exception 'Falló edición externa'; end if;
  perform public.agenda_guardar(jsonb_build_object('id',libre,'tipo','disponible','fecha','2038-04-03','fecha_fin','2038-04-04','estado','confirmado'),false);
  perform public.agenda_disponibilidad_borrar(libre,'2038-04-03');
  if exists(select 1 from public.agenda_bloques where id=libre) then raise exception 'Falló disponibilidad'; end if;
  prohibido:=false;
  begin perform public.agenda_guardar(p||jsonb_build_object('id',current_setting('lentia.qa_other')),true); exception when insufficient_privilege then prohibido:=true; end;
  if not prohibido then raise exception 'No bloqueó edición ajena'; end if;
  prohibido:=false;
  begin perform public.agenda_disponibilidad_borrar(externo,'2038-04-02'); exception when insufficient_privilege then prohibido:=true; end;
  if not prohibido then raise exception 'No protegió tipo de bloque'; end if;
  prohibido:=false;
  begin perform public.agenda_reclasificar(jsonb_build_object('id',propio,'origen','propio','destino','eliminar')); exception when insufficient_privilege then prohibido:=true; end;
  if not prohibido then raise exception 'No protegió eliminación de ventas'; end if;
  perform set_config('request.jwt.claims','{}',true);
  prohibido:=false;
  begin perform public.agenda_guardar(p,true); exception when insufficient_privilege then prohibido:=true; end;
  if not prohibido then raise exception 'No bloqueó anónimo'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'role','authenticated')::text from public.users u join public.suscripciones s on s.tenant_id=u.tenant_id where u.rol='admin' and u.estado='activo' and s.estado in ('activa','trial') and s.fecha_renovacion>=(now() at time zone 'America/Santiago')::date order by u.id limit 1),true);
set local role authenticated;
do $$
declare oid uuid:=gen_random_uuid();
begin
  perform public.agenda_guardar(jsonb_build_object('id',oid,'tipo','propio','fecha','2038-04-05','nombre','QA admin temporal','estado','confirmado','comuna','Quilicura','region','Metropolitana'),false);
  perform public.agenda_reclasificar(jsonb_build_object('id',oid,'origen','propio','destino','externo','fecha','2038-04-05','nombre','QA admin externo','estado','confirmado','optica','Óptica QA'));
  if not exists(select 1 from public.agenda_bloques where id=oid and comuna='Quilicura' and region='Metropolitana') then raise exception 'No conservó ubicación al reclasificar'; end if;
  perform public.agenda_reclasificar(jsonb_build_object('id',oid,'origen','externo','destino','eliminar'));
end;
$$;
rollback;
select 'OK: alta, edición propia/externa, ubicación, disponibilidad, aislamiento por óptica, límites de campos y acceso sin sesión. Todo revertido.' as resultado;
