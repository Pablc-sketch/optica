-- Pruebas de inscritos, bandeja de WhatsApp y tope del asistente.
-- Solo datos ficticios. Se corren con tests/db/probar.sh sobre una base
-- recién creada por tests/db/rehacer.sh.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema pruebas;
grant usage on schema pruebas to authenticated, anon;
create function pruebas.igual(actual text, esperado text, nombre text) returns void language plpgsql as $$
begin
  if actual is distinct from esperado then
    raise exception 'FALLO % — se esperaba «%» y salió «%»', nombre, esperado, actual;
  end if;
  raise notice 'OK  %', nombre;
end $$;
create function pruebas.falla(sql text, codigo text, nombre text) returns void language plpgsql as $$
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
create function pruebas.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;
grant execute on all functions in schema pruebas to authenticated, anon;

-- Dos ópticas ficticias.
insert into public.tenants (id, nombre_comercial) values
  ('00000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('00000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');
insert into public.suscripciones (tenant_id, estado, fecha_renovacion) values
  ('00000000-0000-0000-0000-00000000000a', 'activa', current_date + 30),
  ('00000000-0000-0000-0000-00000000000b', 'activa', current_date + 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'ventas-a@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@ejemplo.invalid');
insert into public.users (id, tenant_id, nombre, email, rol) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Admin A', 'admin-a@ejemplo.invalid', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'Ventas A', 'ventas-a@ejemplo.invalid', 'ventas'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Admin B', 'admin-b@ejemplo.invalid', 'admin');
insert into public.operativos (id, tenant_id, nombre, fecha, comuna, sectores, estado) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000000a', 'Junta Labrador', '2030-05-10', 'Talagante', 'Labrador, Villa El Rosario', 'planificado'),
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000000b', 'Operativo B', '2030-05-10', 'Maipú', null, 'planificado');

-- El webhook (llave de servicio) guarda chats de cada óptica.
insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000a', '1000000001');
select pruebas.falla($$insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000b', '1000000001')$$, '23505', 'Un número de WhatsApp no puede atender a dos ópticas');
insert into public.whatsapp_chats (tenant_id, telefono, nombre_perfil, ultimo_entrante_en) values
  ('00000000-0000-0000-0000-00000000000a', '56911112222', 'Rosa', now()),
  ('00000000-0000-0000-0000-00000000000b', '56955556666', 'Otro', now());
insert into public.whatsapp_mensajes (tenant_id, telefono, wamid, direccion, texto, enviado_en) values
  ('00000000-0000-0000-0000-00000000000a', '56911112222', 'wamid.1', 'entrante', 'Soy de Labrador', now()),
  ('00000000-0000-0000-0000-00000000000a', '56911112222', 'wamid.2', 'saliente', '¿Nombre y edad?', now()),
  ('00000000-0000-0000-0000-00000000000b', '56955556666', 'wamid.3', 'entrante', 'Hola', now());
select pruebas.falla($$insert into public.whatsapp_mensajes (tenant_id, telefono, wamid, direccion, enviado_en) values ('00000000-0000-0000-0000-00000000000a', '56911112222', 'wamid.1', 'entrante', now())$$, '23505', 'Un aviso repetido de Meta no duplica el mensaje');
select pruebas.falla($$insert into public.whatsapp_mensajes (tenant_id, telefono, wamid, direccion, enviado_en) values ('00000000-0000-0000-0000-00000000000b', '56911112222', 'wamid.9', 'entrante', now())$$, '23503', 'Un mensaje no puede colgar del chat de otra óptica');

-- ---------------------------------------------------------------------
-- Anónimos: nada
-- ---------------------------------------------------------------------
set role anon;
select pruebas.falla($$select * from public.whatsapp_mensajes$$, '42501', 'Anónimo no lee mensajes');
select pruebas.falla($$select * from public.whatsapp_chats$$, '42501', 'Anónimo no lee chats');
select pruebas.falla($$select * from public.inscritos_operativo$$, '42501', 'Anónimo no lee inscritos');
reset role;

-- ---------------------------------------------------------------------
-- Administrador de A
-- ---------------------------------------------------------------------
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000a1');
select pruebas.igual((select string_agg(texto, ' / ' order by wamid) from public.whatsapp_mensajes), 'Soy de Labrador / ¿Nombre y edad?', 'A lee solo sus chats');
select pruebas.igual((select count(*)::text from public.whatsapp_chats), '1', 'A ve solo sus chats');
select pruebas.falla($$insert into public.whatsapp_mensajes (tenant_id, telefono, wamid, direccion, enviado_en) values ('00000000-0000-0000-0000-00000000000a', '56911112222', 'wamid.x', 'entrante', now())$$, '42501', 'Nadie escribe mensajes desde la app (solo el webhook)');
select pruebas.falla($$update public.whatsapp_chats set telefono = '56900000000'$$, '42501', 'No se puede cambiar el teléfono de un chat');
select pruebas.falla($$insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000a', '2000000002')$$, '42501', 'Una óptica no se anota un número por su cuenta');
update public.whatsapp_chats set sugerencia = '{"operativo_id": "00000000-0000-0000-0000-0000000001a1"}', analizado_en = now() where telefono = '56911112222';
select pruebas.igual((select sugerencia->>'operativo_id' from public.whatsapp_chats where telefono = '56911112222'), '00000000-0000-0000-0000-0000000001a1', 'Se guarda la sugerencia de la IA');
update public.whatsapp_chats set estado = 'inscrito' where telefono = '56955556666';
insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono, edad, origen) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', 'Marta Soto', '56911112222', 67, 'whatsapp');
select pruebas.igual((select nombre || ',' || edad from public.inscritos_operativo), 'Marta Soto,67', 'Inscribe con nombre, teléfono y edad');
select pruebas.falla($$insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', 'Marta Soto', '56911112222')$$, '23505', 'El mismo teléfono no queda dos veces en el operativo');
select pruebas.falla($$insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono, edad) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', 'Otra', '56900000001', 150)$$, '23514', 'Edad imposible se rechaza');
select pruebas.falla($$insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001b1', 'Cruce', '56900000002')$$, '23503', 'No se inscribe en un operativo de otra óptica');
select pruebas.falla($$insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000001b1', 'Cruce', '56900000002')$$, '42501', 'No se inscribe a nombre de otra óptica');
update public.inscritos_operativo set estado = 'cancelado';
insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', 'Marta Soto', '56911112222');
select pruebas.igual((select count(*)::text from public.inscritos_operativo), '2', 'Si se quitó, puede volver a inscribirse');
select pruebas.falla($$delete from public.inscritos_operativo$$, '42501', 'Los inscritos no se borran (quedan como cancelados)');

-- Ventas de A: ve e inscribe, pero no lee WhatsApp.
select pruebas.como('00000000-0000-0000-0000-0000000000a2');
select pruebas.igual((select count(*)::text from public.inscritos_operativo where estado <> 'cancelado'), '1', 'Ventas ve los inscritos de su óptica');
insert into public.inscritos_operativo (tenant_id, operativo_id, nombre, telefono, edad) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', 'Juan Pérez', '56900000003', 45);
select pruebas.igual((select count(*)::text from public.whatsapp_mensajes), '0', 'Ventas no lee los chats de WhatsApp');
select pruebas.igual((select count(*)::text from public.whatsapp_chats), '0', 'Ventas no ve la bandeja');

-- Administrador de B: nada de A.
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select pruebas.igual((select count(*)::text from public.inscritos_operativo), '0', 'B no ve inscritos de A');
select pruebas.igual((select string_agg(texto, ',') from public.whatsapp_mensajes), 'Hola', 'B lee solo sus mensajes');
update public.whatsapp_chats set estado = 'descartado' where telefono = '56911112222';
update public.inscritos_operativo set estado = 'asistio';
reset role;
select pruebas.igual((select estado from public.whatsapp_chats where telefono = '56911112222'), 'pendiente', 'B no puede cambiar chats de A');
select pruebas.igual((select estado from public.whatsapp_chats where telefono = '56955556666'), 'pendiente', 'A no pudo cambiar el chat de B');
select pruebas.igual((select count(*)::text from public.inscritos_operativo where estado = 'asistio'), '0', 'B no puede cambiar inscritos de A');

-- ---------------------------------------------------------------------
-- Tope diario del asistente de IA
-- ---------------------------------------------------------------------
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000a2');
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'false', 'Ventas no usa el asistente');
select pruebas.como('00000000-0000-0000-0000-0000000000a1');
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'true', 'El administrador puede preguntar');
select pruebas.igual(public.registrar_pregunta_asistente(8)::text, 'true', 'Revisar 8 chats cuenta 8 consultas');
select pruebas.igual((select preguntas::text from public.uso_asistente), '9', 'Se suman las consultas del día');
select pruebas.igual(public.registrar_pregunta_asistente(50)::text, 'false', 'No se aceptan lotes de más de 20');
reset role;
update public.uso_asistente set preguntas = 200 where tenant_id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'false', 'Pasadas 200 consultas del día se detiene');
select pruebas.falla($$update public.uso_asistente set preguntas = 0$$, '42501', 'El contador no se puede borrar desde la app');
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'true', 'El tope de A no afecta a B');
select pruebas.igual((select count(*)::text from public.uso_asistente), '1', 'B solo ve su propio uso');
reset role;

do $$ begin raise notice 'OK  FIN: inscritos, bandeja de WhatsApp, aislamiento y tope del asistente'; end $$;
