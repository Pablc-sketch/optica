-- Sugerencias de inscripción por WhatsApp (coexistencia): mensaje recibido,
-- sugerencia visible, aprobación, lista correcta, duplicados (reenvío de
-- Meta y mismo teléfono + operativo), dos sedes el mismo día, permisos y
-- aislamiento. Solo datos ficticios. Lo corre tests/db/probar.sh.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema pruebas_wsp;
grant usage on schema pruebas_wsp to authenticated, anon, service_role;
create function pruebas_wsp.igual(actual text, esperado text, nombre text) returns void language plpgsql as $$
begin
  if actual is distinct from esperado then
    raise exception 'FALLO % — se esperaba «%» y salió «%»', nombre, esperado, actual;
  end if;
  raise notice 'OK  %', nombre;
end $$;
create function pruebas_wsp.falla(sql text, codigo text, nombre text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate <> codigo then raise exception 'FALLO % — error inesperado [%] %', nombre, sqlstate, sqlerrm; end if;
    raise notice 'OK  % → «%»', nombre, sqlerrm;
    return;
  end;
  raise exception 'FALLO % — se esperaba un error y funcionó', nombre;
end $$;
create function pruebas_wsp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;
-- Lo que hace el webhook (llave de servicio) con un mensaje.
create function pruebas_wsp.llega(wamid text, telefono text, texto text, sugerencia jsonb, numero text default '7000000001')
returns text language sql as $$
  select public.registrar_mensaje_whatsapp(numero, telefono, 'Perfil Ficticio', wamid, 'entrante', texto, now(), sugerencia)
$$;
grant execute on all functions in schema pruebas_wsp to authenticated, anon, service_role;

-- Ópticas ficticias C y D.
insert into public.tenants (id, nombre_comercial) values
  ('00000000-0000-0000-0000-00000000000c', 'Óptica Ficticia C'),
  ('00000000-0000-0000-0000-00000000000d', 'Óptica Ficticia D');
insert into public.suscripciones (tenant_id, estado, fecha_renovacion) values
  ('00000000-0000-0000-0000-00000000000c', 'activa', current_date + 30),
  ('00000000-0000-0000-0000-00000000000d', 'activa', current_date + 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin-c@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000c2', 'ventas-c@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin-d@ejemplo.invalid');
insert into public.users (id, tenant_id, nombre, email, rol) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'Admin C', 'admin-c@ejemplo.invalid', 'admin'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000c', 'Ventas C', 'ventas-c@ejemplo.invalid', 'ventas'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d', 'Admin D', 'admin-d@ejemplo.invalid', 'admin');
-- Dos sedes el MISMO día (Labrador y El Rosario, 10-05-2030) y un operativo de D.
update public.tenants set agenda_paralela = true where id = '00000000-0000-0000-0000-00000000000c';
insert into public.operativos (id, tenant_id, nombre, fecha, comuna, estado) values
  ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-00000000000c', 'Junta de Vecinos Labrador', '2030-05-10', 'Talagante', 'planificado'),
  ('00000000-0000-0000-0000-0000000002c2', '00000000-0000-0000-0000-00000000000c', 'Sede Social El Rosario', '2030-05-10', 'Talagante', 'planificado'),
  ('00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-00000000000d', 'Operativo D', '2030-05-10', 'Maipú', 'planificado');
insert into public.whatsapp_numeros (tenant_id, phone_number_id, coexistencia) values
  ('00000000-0000-0000-0000-00000000000c', '7000000001', true),
  ('00000000-0000-0000-0000-00000000000d', '7000000002', true);

-- ---------------------------------------------------------------------
-- 1. Mensaje recibido → sugerencia
-- ---------------------------------------------------------------------
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c1', '56911110001', 'Me llamo Marta Soto, quiero inscribirme en Labrador',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1", "candidatos": [], "nombre": "Marta Soto", "nombre_origen": "mensaje", "lugar": "labrador"}'),
  'sugerencia', 'Mensaje de inscripción crea una sugerencia');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_mensajes where wamid = 'wamid.c1'), '1', 'El mensaje queda guardado en Lentia');
select pruebas_wsp.igual((select count(*)::text from public.inscritos_operativo where telefono = '56911110001'), '0', 'Antes de aprobar NO está en la lista para llamar');

-- 2. Duplicados
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c1', '56911110001', 'Me llamo Marta Soto, quiero inscribirme en Labrador',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1", "nombre": "Marta Soto", "nombre_origen": "mensaje"}'),
  'repetido', 'Meta reenvía el mismo aviso: no hace nada');
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c2', '56911110001', 'confirmo Labrador por favor',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1", "nombre": "Perfil Ficticio", "nombre_origen": "perfil"}'),
  'sugerencia_actualizada', 'Otro mensaje del mismo teléfono para el mismo operativo actualiza, no duplica');
select pruebas_wsp.igual((select count(*)::text || ',' || max(nombre) from public.whatsapp_sugerencias where telefono = '56911110001' and estado = 'pendiente'),
  '1,Marta Soto', 'Una sola sugerencia por teléfono y operativo; conserva el nombre dicho en el mensaje');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_mensajes where telefono = '56911110001'), '2', 'Ambos mensajes distintos quedan en el chat');

-- 3. Dos sedes el mismo día
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c3', '56911110002', 'quiero inscribirme, soy de Talagante',
  '{"operativo_id": null, "candidatos": ["00000000-0000-0000-0000-0000000002c1", "00000000-0000-0000-0000-0000000002c2"], "nombre": "Ana Pérez", "nombre_origen": "perfil", "lugar": "talagante"}'),
  'duda', 'Si no se sabe cuál de las dos sedes, queda pendiente para elegir');
select pruebas_wsp.igual((select cardinality(candidatos)::text from public.whatsapp_sugerencias where telefono = '56911110002' and estado = 'pendiente'), '2', 'La duda ofrece las dos sedes');
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c4', '56911110003', 'quiero hora en El Rosario',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c2", "nombre": "Luis Rojas", "nombre_origen": "perfil", "lugar": "rosario"}'),
  'sugerencia', 'La otra sede del mismo día se reconoce por su nombre');
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c5', '56911110002', 'es en El Rosario',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c2", "nombre": "Ana Pérez", "nombre_origen": "perfil", "lugar": "rosario"}'),
  'sugerencia', 'Cuando aclara la sede, se crea la sugerencia de esa sede');
select pruebas_wsp.igual((select string_agg(estado || ':' || coalesce(operativo_id::text, 'duda'), ',' order by creado_en) from public.whatsapp_sugerencias where telefono = '56911110002'),
  'reemplazada:duda,pendiente:00000000-0000-0000-0000-0000000002c2', 'La duda anterior queda reemplazada (no hay dos pendientes)');

-- 4. Lo que no es de esta óptica o no corresponde
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c6', '56911110004', 'quiero ir',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002d1", "candidatos": ["00000000-0000-0000-0000-0000000002d1"]}'),
  'guardado', 'Un operativo de otra óptica nunca se sugiere');
select pruebas_wsp.igual(public.registrar_mensaje_whatsapp('9999999999', '56911110005', null, 'wamid.c7', 'entrante', 'hola', now(), null), 'sin_numero', 'Un número no conectado no guarda nada');
select pruebas_wsp.igual(public.registrar_mensaje_whatsapp('7000000001', '56911110001', null, 'wamid.c8', 'saliente', 'Te anoto', now(),
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1"}'), 'guardado', 'Las respuestas de la óptica no crean sugerencias');
update public.whatsapp_numeros set automatico = false where phone_number_id = '7000000001';
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c9', '56911110006', 'quiero hora en Labrador', '{"operativo_id": "00000000-0000-0000-0000-0000000002c1"}'),
  'guardado', 'Con las sugerencias apagadas solo se guarda el mensaje');
update public.whatsapp_numeros set automatico = true where phone_number_id = '7000000001';

-- ---------------------------------------------------------------------
-- 5. Permisos: solo el webhook registra; solo el administrador aprueba
-- ---------------------------------------------------------------------
set role authenticated;
select pruebas_wsp.como('00000000-0000-0000-0000-0000000000c2');
select pruebas_wsp.falla($$select pruebas_wsp.llega('wamid.x', '56911110009', 'hola', null)$$, '42501', 'Un usuario no puede inyectar mensajes');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_sugerencias), '0', 'Ventas no ve las sugerencias');
select pruebas_wsp.falla($$select public.aprobar_sugerencia_whatsapp((select id from public.whatsapp_sugerencias limit 1), '00000000-0000-0000-0000-0000000002c1', array['X'])$$, '42501', 'Ventas no puede aprobar');
select pruebas_wsp.como('00000000-0000-0000-0000-0000000000d1');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_sugerencias), '0', 'Otra óptica no ve las sugerencias');
reset role;
-- Id real de una sugerencia de C, para intentar aprobarla desde D.
select set_config('pruebas_wsp.sug_c', (select id::text from public.whatsapp_sugerencias where telefono = '56911110001' and estado = 'pendiente'), false);
set role authenticated;
select pruebas_wsp.como('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  perform public.aprobar_sugerencia_whatsapp(current_setting('pruebas_wsp.sug_c')::uuid, '00000000-0000-0000-0000-0000000002d1', array['X']);
  raise exception 'FALLO Otra óptica no puede aprobar — se aprobó';
exception when sqlstate 'P0002' then raise notice 'OK  Otra óptica no puede aprobar (no encuentra la sugerencia)';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 6. Aprobar → aparece en la lista correcta
-- ---------------------------------------------------------------------
set role authenticated;
select pruebas_wsp.como('00000000-0000-0000-0000-0000000000c1');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_sugerencias where estado = 'pendiente'), '3', 'El administrador ve las sugerencias por confirmar');
select pruebas_wsp.igual(public.aprobar_sugerencia_whatsapp(
  (select id from public.whatsapp_sugerencias where telefono = '56911110001' and estado = 'pendiente'),
  '00000000-0000-0000-0000-0000000002c1', array['Marta Soto'], array[67])::text, '1', 'Aprobar inscribe a la persona');
select pruebas_wsp.igual((select string_agg(nombre || ',' || telefono || ',' || edad || ',' || operativo_id, ';') from public.inscritos_operativo where telefono = '56911110001'),
  'Marta Soto,56911110001,67,00000000-0000-0000-0000-0000000002c1', 'Queda en la lista para llamar de Labrador con nombre, teléfono y edad');
select pruebas_wsp.igual((select count(*)::text from public.inscritos_operativo where operativo_id = '00000000-0000-0000-0000-0000000002c2'), '0', 'No aparece en la lista de la otra sede');
select pruebas_wsp.falla($$select public.aprobar_sugerencia_whatsapp((select id from public.whatsapp_sugerencias where telefono = '56911110001' order by creado_en limit 1), '00000000-0000-0000-0000-0000000002c1', array['Marta Soto'])$$,
  'P0001', 'Aprobar dos veces la misma sugerencia no duplica');
-- Ana: aclaró El Rosario; se aprueba en El Rosario con un familiar más.
select pruebas_wsp.igual(public.aprobar_sugerencia_whatsapp(
  (select id from public.whatsapp_sugerencias where telefono = '56911110002' and estado = 'pendiente'),
  '00000000-0000-0000-0000-0000000002c2', array['Ana Pérez', 'Tomás Pérez'], array[null, 9]::integer[])::text, '2', 'Un mismo WhatsApp puede inscribir a otra persona más al aprobar');
select pruebas_wsp.igual((select string_agg(nombre, ',' order by nombre) from public.inscritos_operativo where operativo_id = '00000000-0000-0000-0000-0000000002c2'),
  'Ana Pérez,Tomás Pérez', 'Ambos quedan en la lista de El Rosario con el teléfono del chat');
-- Luis: descartado.
update public.whatsapp_sugerencias set estado = 'descartada' where telefono = '56911110003' and estado = 'pendiente';
select pruebas_wsp.igual((select count(*)::text from public.inscritos_operativo where telefono = '56911110003'), '0', 'Descartar no inscribe');
reset role;

-- 7. Después de aprobada, el mismo teléfono y operativo no se vuelve a sugerir
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c10', '56911110001', 'me inscribo en Labrador de nuevo',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c1", "nombre": "Marta Soto", "nombre_origen": "mensaje"}'),
  'ya_inscrito', 'Ya está en la lista: no se crea otra sugerencia');
select pruebas_wsp.igual((select count(*)::text from public.whatsapp_sugerencias where telefono = '56911110001' and estado = 'pendiente'), '0', 'Sin sugerencias duplicadas');
-- Pero sí puede pedir la otra sede del mismo día.
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.c11', '56911110001', 'y también en El Rosario',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002c2", "nombre": "Marta Soto", "nombre_origen": "mensaje"}'),
  'sugerencia', 'El mismo teléfono puede pedir otro operativo');

-- 8. Mensajes de la otra óptica quedan en la otra óptica
select pruebas_wsp.igual(pruebas_wsp.llega('wamid.d1', '56911110001', 'quiero ir',
  '{"operativo_id": "00000000-0000-0000-0000-0000000002d1"}', '7000000002'), 'sugerencia', 'El número de D crea sugerencias en D');
select pruebas_wsp.igual((select tenant_id::text from public.whatsapp_sugerencias where wamid = 'wamid.d1'), '00000000-0000-0000-0000-00000000000d', 'La óptica sale del número que recibió el mensaje');

do $$ begin raise notice 'OK  FIN: sugerencias de WhatsApp'; end $$;
