-- Pruebas ficticias aisladas: todas las filas se revierten al terminar.
begin;
do $$
declare t uuid; a uuid; ajeno uuid;
begin
  select id into t from public.tenants where nombre_comercial='Visión Herrante' limit 1;
  select id into a from public.users where tenant_id=t and rol='admin' and estado='activo' limit 1;
  if a is null then raise exception 'Falta administrador piloto'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  select id into ajeno from public.operativos where tenant_id<>t limit 1;
  perform set_config('agenda_qa.ajeno',coalesce(ajeno::text,''),true);
end $$;
set local role authenticated;
do $$
declare t uuid:=public.jwt_tenant_id(); oid uuid:=gen_random_uuid(); bloqueo uuid:=gen_random_uuid(); p jsonb; fallo boolean;
begin
  if not public.suscripcion_vigente() then raise exception 'Falta suscripción piloto'; end if;
  insert into public.operativos(id,tenant_id,nombre,fecha,fecha_fin)
    values(oid,t,'QA reclasificación','2037-11-18','2037-11-22');
  p:=jsonb_build_object('id',oid,'origen','propio','destino','externo','nombre','QA reclasificación',
    'optica','Óptica ficticia','fecha','2037-11-18','fecha_fin','2037-11-22','estado','pendiente');
  perform public.agenda_reclasificar(p);
  if exists(select 1 from public.operativos where id=oid) or not exists(select 1 from public.agenda_bloques where id=oid and tipo='externo') then
    raise exception 'No convirtió a externo'; end if;
  perform public.agenda_reclasificar(p||jsonb_build_object('origen','externo','destino','propio'));
  if not exists(select 1 from public.operativos where id=oid and hora_inicio is null and hora_fin is null) then
    raise exception 'No convirtió a propio sin horas'; end if;
  insert into public.contactos_operativo(tenant_id,operativo_id,nombre) values(t,oid,'Contacto ficticio');
  fallo:=false;
  begin perform public.agenda_reclasificar(p); exception when raise_exception then fallo:=true; end;
  if not fallo or not exists(select 1 from public.operativos where id=oid) then raise exception 'No protegió los datos vinculados'; end if;
  delete from public.contactos_operativo where operativo_id=oid;
  -- Un cruce debe revertir el borrado del original.
  insert into public.agenda_bloques(id,tenant_id,tipo,nombre,optica,fecha,fecha_fin)
    values(bloqueo,t,'externo','QA bloqueo','Óptica ficticia','2037-12-01','2037-12-02');
  fallo:=false;
  begin perform public.agenda_reclasificar(p||jsonb_build_object('fecha','2037-12-01','fecha_fin','2037-12-02'));
  exception when exclusion_violation then fallo:=true; end;
  if not fallo or not exists(select 1 from public.operativos where id=oid) then raise exception 'Conversión parcial tras un cruce'; end if;
  perform public.agenda_reclasificar(p);
  perform public.agenda_reclasificar(jsonb_build_object('id',oid,'origen','externo','destino','eliminar'));
  if exists(select 1 from public.agenda_bloques where id=oid) then raise exception 'No eliminó externo'; end if;
  insert into public.operativos(id,tenant_id,nombre,fecha) values(oid,t,'QA eliminar propio','2037-11-18');
  perform public.agenda_reclasificar(jsonb_build_object('id',oid,'origen','propio','destino','eliminar'));
  if exists(select 1 from public.operativos where id=oid) then raise exception 'No eliminó propio'; end if;
  if nullif(current_setting('agenda_qa.ajeno'),'') is not null then
    fallo:=false;
    begin perform public.agenda_reclasificar(jsonb_build_object('id',current_setting('agenda_qa.ajeno'),'origen','propio','destino','eliminar'));
    exception when raise_exception then fallo:=true; end;
    if not fallo then raise exception 'Permitió modificar otro tenant'; end if;
  end if;
end $$;
reset role;
select not p.prosecdef as respeta_rls,not has_function_privilege('anon',p.oid,'EXECUTE') as anon_bloqueado
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='agenda_reclasificar';
rollback;
