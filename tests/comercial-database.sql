-- Pruebas ficticias: aislamiento, cuadrillas, componentes y timbres históricos.
insert into auth.users(id,email) values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','admin-a@ficticia.invalid'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','admin-b@ficticia.invalid'),('cccccccc-cccc-4ccc-cccc-cccccccccccc','clinico-a@ficticia.invalid');
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',false);
set role authenticated;
select set_config('qa.tenant_a',public.crear_optica('Óptica ficticia A',null,'Administración ficticia A')::text,false);
do $$begin
 if not public.es_modelo_comercial() then raise exception 'Nueva óptica no es comercial';end if;
 if exists(select 1 from public.costos_cristales) then raise exception 'Heredó catálogo personalizado';end if;
 if(select precio_consulta from public.tenants where id=public.jwt_tenant_id()) is not null then raise exception 'Heredó precio consulta';end if;
 if not(select agenda_paralela from public.tenants where id=public.jwt_tenant_id()) then raise exception 'Bloqueó cuadrillas simultáneas';end if;
 begin perform public.copiar_plantilla_costos();raise exception 'Aceptó copiar plantilla';exception when check_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}',false);
set role authenticated;
select set_config('qa.tenant_b',public.crear_optica('Óptica ficticia B',null,'Administración ficticia B')::text,false);
insert into public.agenda_recursos(tipo,nombre,rut,titulo_profesional) values('tecnologo','Tecnólogo ajeno','22222222-2','Tecnólogo Médico');
select set_config('qa.tecnologo_b',(select id::text from public.agenda_recursos limit 1),false);
reset role;
insert into public.users(id,tenant_id,nombre,email,rol,rut,titulo_profesional) values('cccccccc-cccc-4ccc-cccc-cccccccccccc',current_setting('qa.tenant_a')::uuid,'Clínico ficticio','clinico-a@ficticia.invalid','clinico','11111111-1','Tecnólogo Médico');
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}',false);
set role authenticated;
insert into public.agenda_recursos(tipo,nombre,rut,titulo_profesional,registro_profesional,usuario_id) values
('tecnologo','Tecnólogo ficticio 1','11111111-1','Tecnólogo Médico','REG-FICTICIO-1','cccccccc-cccc-4ccc-cccc-cccccccccccc'),
('tecnologo','Tecnólogo ficticio 2','33333333-3','Tecnólogo Médico','REG-FICTICIO-2',null),
('vendedora','Venta ficticia 1',null,null,null,null),('vendedora','Venta ficticia 2',null,null,null,null),('coordinador','Coordinación ficticia 1',null,null,null,null),('coordinador','Coordinación ficticia 2',null,null,null,null);
insert into public.agenda_recursos(tipo,nombre) select tipo,'Persona ficticia adicional '||tipo||' '||n from unnest(array['tecnologo','vendedora','coordinador']) tipo cross join generate_series(3,5) n;
do $$begin
 if(select count(*) from public.agenda_recursos where tipo='tecnologo')<>5 or(select count(*) from public.agenda_recursos where tipo='vendedora')<>5 or(select count(*) from public.agenda_recursos where tipo='coordinador')<>5 then raise exception 'Limitó el tamaño del personal';end if;
end $$;
insert into public.equipos_fisicos(nombre,tipo,identificador) select tipo||' '||i,tipo,'FICTICIO-'||tipo||'-'||i from unnest(array['autorefractometro','lensometro','maleta']) tipo cross join generate_series(1,2) i;
select public.agenda_kit_guardar(null,'Kit ficticio 1',array(select id from public.equipos_fisicos where identificador like '%-1'));
select public.agenda_kit_guardar(null,'Kit ficticio 2',array(select id from public.equipos_fisicos where identificador like '%-2'));
do $$declare p jsonb;ids1 jsonb;ids2 jsonb;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();k text;bloqueado boolean;begin
 select jsonb_object_agg(tipo,id) into ids1 from public.agenda_recursos where nombre like '%1';
 select jsonb_object_agg(tipo,id) into ids2 from public.agenda_recursos where nombre like '%2';
 p:=jsonb_build_object('id',a,'nombre','Operativo ficticio norte','direccion','Lugar ficticio','fecha','2035-03-10','fecha_fin','2035-03-12','inicio','','fin','','meta',30,'presupuesto',jsonb_build_object('viaticos',10000,'hospedaje',20000,'bencina',15000));
 perform public.agenda_guardar_turno(p||ids1);perform public.agenda_guardar_turno(p||ids1);
 perform public.agenda_guardar_turno(p||ids2||jsonb_build_object('id',b,'nombre','Operativo ficticio sur'));
 foreach k in array array['tecnologo','vendedora','coordinador','kit'] loop
  bloqueado:=false;begin perform public.agenda_guardar_turno(p||ids2||jsonb_build_object('id',c,k,ids1->k));exception when exclusion_violation then bloqueado:=true;end;
  if not bloqueado then raise exception 'No bloqueó recurso duplicado: %',k;end if;
 end loop;
 if exists(select 1 from public.operativos where comision_vendedora_pct<>0 or ahorro_pct<>0) then raise exception 'Heredó reparto personalizado';end if;
 if exists(select 1 from public.operativos where id=c) then raise exception 'Guardado parcial tras cruce';end if;
 if(select count(*) from public.agenda_equipos_reservas where operativo_id in(a,b))<>6 then raise exception 'No reservó componentes físicos';end if;
 update public.operativos set hora_inicio='10:00',hora_fin='12:00' where id=b;
 bloqueado:=false;begin update public.equipos_fisicos set estado='mantenimiento' where identificador='FICTICIO-lensometro-1';exception when check_violation then bloqueado:=true;end;
 if not bloqueado then raise exception 'Retiró equipo reservado';end if;
 bloqueado:=false;begin delete from public.kit_componentes where kit_id=(ids1->>'kit')::uuid;exception when check_violation then bloqueado:=true;end;
 if not bloqueado then raise exception 'Cambió kit reservado';end if;
 update public.operativos set estado='cancelado' where id=a;
 perform public.agenda_guardar_turno(p||ids1||jsonb_build_object('id',c,'nombre','Operativo ficticio reemplazo'));
 bloqueado:=false;begin update public.operativos set estado='planificado' where id=a;exception when exclusion_violation then bloqueado:=true;end;
 if not bloqueado then raise exception 'Reabrió reserva ocupada';end if;
 if exists(select 1 from public.agenda_recursos where tenant_id<>public.jwt_tenant_id()) or exists(select 1 from public.agenda_equipos_reservas where tenant_id<>public.jwt_tenant_id()) then raise exception 'Fuga entre ópticas';end if;
end $$;
insert into public.pacientes(tenant_id,nombre) values(public.jwt_tenant_id(),'Paciente ficticio');
do $$declare paciente uuid;tech1 uuid;tech2 uuid;r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();snap jsonb;v uuid;prod uuid;lab uuid;bloqueado boolean;begin
 select id into paciente from public.pacientes limit 1;select id into tech1 from public.agenda_recursos where nombre='Tecnólogo ficticio 1';select id into tech2 from public.agenda_recursos where nombre='Tecnólogo ficticio 2';
 insert into public.recetas(id,tenant_id,paciente_id,profesional_id,tecnologo_recurso_id) values(r1,public.jwt_tenant_id(),paciente,auth.uid(),tech1),(r2,public.jwt_tenant_id(),paciente,auth.uid(),tech2);
 select profesional_snapshot into snap from public.recetas where id=r1;
 if snap->>'nombre'<>'Tecnólogo ficticio 1' or(select profesional_snapshot->>'nombre' from public.recetas where id=r2)<>'Tecnólogo ficticio 2' then raise exception 'Timbres mezclados';end if;
 update public.agenda_recursos set nombre='Nombre modificado después' where id=tech1;
 update public.recetas set notas='Corrección de prueba',profesional_snapshot='{"nombre":"Timbre manipulado"}' where id=r1;
 if(select profesional_snapshot from public.recetas where id=r1)<>snap then raise exception 'Cambió timbre histórico';end if;
 bloqueado:=false;begin insert into public.recetas(tenant_id,paciente_id,profesional_id,tecnologo_recurso_id) values(public.jwt_tenant_id(),paciente,auth.uid(),current_setting('qa.tecnologo_b')::uuid);exception when check_violation then bloqueado:=true;end;
 if not bloqueado then raise exception 'Aceptó tecnólogo ajeno';end if;
 update public.recetas set tecnologo_recurso_id=tech2 where id=r1;
 if not exists(select 1 from public.receta_autoria_cambios where receta_id=r1 and antes=snap and actor_id=auth.uid()) then raise exception 'No auditó corrección de timbre';end if;
 insert into public.proveedores(tenant_id,nombre,tipo) values(public.jwt_tenant_id(),'Laboratorio ficticio propio','laboratorio') returning id into lab;
 insert into public.costos_cristales(tenant_id,tipo_lente,rango_receta,tratamiento,costo,precio_venta,proveedor_id) values(public.jwt_tenant_id(),'Monofocal','±8.00 / ±3.00','Tratamiento ficticio',18000,44000,lab);
 if not(select catalogo_propio from public.costos_cristales limit 1) then raise exception 'No activó tarifa propia';end if;
 insert into public.productos(tenant_id,nombre,categoria,costo,precio_venta) values(public.jwt_tenant_id(),'Marco ficticio','armazon',7300,18000) returning id into prod;
 insert into public.ventas(tenant_id,vendedor_id,total) values(public.jwt_tenant_id(),auth.uid(),18000) returning id into v;
 insert into public.venta_items(tenant_id,venta_id,producto_id,descripcion,cantidad,precio_unitario) values(public.jwt_tenant_id(),v,prod,'Marco ficticio',1,18000);
 update public.productos set costo=9900 where id=prod;update public.venta_items set costo_producto_snapshot=1 where venta_id=v;
 if(select costo_producto_snapshot from public.venta_items where venta_id=v)<>7300 or(select costo_marco_snapshot from public.venta_items where venta_id=v)<>0 then raise exception 'Alteró costo histórico o sumó marco implícito';end if;
 update public.tenants set precio_consulta=8500 where id=public.jwt_tenant_id();if(select precio_consulta from public.tenants where id=public.jwt_tenant_id())<>8500 then raise exception 'No guardó consulta propia';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-cccc-cccccccccccc","role":"authenticated"}',false);
set role authenticated;
do $$declare paciente uuid;tech uuid;bloqueado boolean:=false;begin
 select id into paciente from public.pacientes limit 1;select id into tech from public.agenda_recursos where nombre='Tecnólogo ficticio 2';
 begin insert into public.recetas(tenant_id,paciente_id,profesional_id,tecnologo_recurso_id) values(public.jwt_tenant_id(),paciente,auth.uid(),tech);exception when insufficient_privilege then bloqueado:=true;end;
 if not bloqueado then raise exception 'Clínico pudo usar timbre ajeno';end if;
 insert into public.recetas(tenant_id,paciente_id,profesional_id) values(public.jwt_tenant_id(),paciente,auth.uid());
end $$;
reset role;
do $$begin
 if(select modelo_operacion from public.tenants where id='7e4b2a1a-8926-4262-92e2-1f0e75951b9a')<>'personalizado' then raise exception 'Alteró edición existente';end if;
 if not exists(select 1 from public.recetas where paciente_id='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee' and profesional_snapshot->>'nombre'='Autor histórico ficticio') then raise exception 'Perdió autor histórico';end if;
 if not exists(select 1 from public.costos_cristales where tenant_id='7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and costo=21111 and precio_venta=53333 and not catalogo_propio) then raise exception 'Alteró precios personalizados';end if;
 if has_table_privilege('anon','public.equipos_fisicos','select') or has_table_privilege('authenticated','public.agenda_equipos_reservas','update') then raise exception 'Permisos excesivos';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('equipos_fisicos','kit_componentes','agenda_equipos_reservas','receta_autoria_cambios') and not c.relrowsecurity) then raise exception 'Tabla nueva sin RLS';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='agenda_privada' and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'Función privilegiada accesible a anónimo';end if;
end $$;
