-- Pruebas de la agenda por WhatsApp y del tope del asistente.
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

-- Operativos ficticios de A: abierto (2 bloques de 30 min, 2 cupos), de 2
-- días, cerrado, pasado y cancelado. Uno de B.
insert into public.operativos (id, tenant_id, nombre, fecha, fecha_fin, hora_inicio, hora_fin, estado, agenda_whatsapp, cupos_por_bloque, minutos_bloque) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000000a', 'Abierto A', '2030-05-10', null, '10:00', '11:00', 'planificado', true, 2, 30),
  ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-00000000000a', 'Dos días A', '2030-05-11', '2030-05-12', '09:00', '10:00', 'planificado', true, 1, 60),
  ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-00000000000a', 'Cerrado A', '2030-05-13', null, '10:00', '11:00', 'planificado', false, 2, 30),
  ('00000000-0000-0000-0000-0000000001a4', '00000000-0000-0000-0000-00000000000a', 'Pasado A', '2020-05-10', null, '10:00', '11:00', 'planificado', true, 2, 30),
  ('00000000-0000-0000-0000-0000000001a5', '00000000-0000-0000-0000-00000000000a', 'Cancelado A', '2030-05-14', null, '10:00', '11:00', 'cancelado', true, 2, 30),
  ('00000000-0000-0000-0000-0000000001a6', '00000000-0000-0000-0000-00000000000a', 'Simultáneo A', '2030-05-15', null, '10:00', '10:30', 'planificado', true, 1, 30),
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000000b', 'Abierto B', '2030-05-10', null, '10:00', '11:00', 'planificado', true, 2, 30);

-- ---------------------------------------------------------------------
-- 1. Horas disponibles
-- ---------------------------------------------------------------------
select pruebas.igual((select string_agg(hora::text || ':' || libres, ',' order by hora) from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1')),
  '10:00:00:2,10:30:00:2', 'Bloques de 30 minutos con su cupo');
select pruebas.igual((select string_agg(fecha::text, ',' order by fecha) from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a2')),
  '2030-05-11,2030-05-12', 'Operativo de dos días ofrece horas ambos días');
select pruebas.igual((select count(*)::text from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a3')), '0', 'Operativo cerrado a WhatsApp no ofrece horas');
select pruebas.igual((select count(*)::text from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a4')), '0', 'Operativo pasado no ofrece horas');
select pruebas.igual((select count(*)::text from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a5')), '0', 'Operativo cancelado no ofrece horas');
select pruebas.igual((select string_agg(nombre, ',' order by fecha) from public.operativos_whatsapp('00000000-0000-0000-0000-00000000000a')),
  'Abierto A,Dos días A,Simultáneo A', 'El menú lista solo operativos abiertos, futuros y de esta óptica');

-- ---------------------------------------------------------------------
-- 2. Agendar: cupo, duplicados, horas inválidas
-- ---------------------------------------------------------------------
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:00', 'Persona Uno', '56900000001'))->>'ok', 'true', 'Agenda una hora');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'Persona Uno', '56900000001'))->>'error', 'duplicada', 'Mismo teléfono no toma dos horas en el operativo');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:00', 'Persona Dos', '56900000002'))->>'ok', 'true', 'Segunda persona en el mismo bloque');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:00', 'Persona Tres', '56900000003'))->>'error', 'sin_cupo', 'Bloque lleno no acepta más');
select pruebas.igual((select string_agg(hora::text || ':' || libres, ',') from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1')),
  '10:30:00:2', 'El bloque lleno deja de ofrecerse');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:15', 'Persona Tres', '56900000003'))->>'error', 'sin_cupo', 'Hora fuera de la grilla se rechaza');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a4', '2020-05-10', '10:00', 'Persona Tres', '56900000003'))->>'error', 'sin_cupo', 'Operativo pasado se rechaza');
select pruebas.falla($$select public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'X', '56900000004')$$, '23514', 'Nombre demasiado corto se rechaza');

-- ---------------------------------------------------------------------
-- 3. Aislamiento: la óptica sale del número que recibió el mensaje
-- ---------------------------------------------------------------------
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'Intruso', '56900000009'))->>'error', 'operativo', 'El número de B no puede agendar en operativos de A');
select pruebas.igual((select count(*)::text from public.horas_whatsapp('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000001a1')), '0', 'B no ve horas de A');
select pruebas.igual((select count(*)::text from public.citas_whatsapp_de('00000000-0000-0000-0000-00000000000b', '56900000001')), '0', 'B no ve las horas que la persona tomó en A');
select pruebas.igual((select count(*)::text from public.citas_whatsapp_de('00000000-0000-0000-0000-00000000000a', '56900000001')), '1', 'La persona ve su hora en A');
select pruebas.igual(public.cancelar_cita_whatsapp('00000000-0000-0000-0000-00000000000b', (select id from public.citas_operativo where telefono = '56900000001'), '56900000001')::text, 'false', 'B no puede anular horas de A');
select pruebas.igual(public.cancelar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', (select id from public.citas_operativo where telefono = '56900000001'), '56900000002')::text, 'false', 'Otro teléfono no puede anular la hora');
select pruebas.igual(public.cancelar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', (select id from public.citas_operativo where telefono = '56900000001'), '56900000001')::text, 'true', 'La persona anula su propia hora');
select pruebas.igual((select string_agg(hora::text || ':' || libres, ',' order by hora) from public.horas_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1')),
  '10:00:00:1,10:30:00:2', 'Al anular, el cupo vuelve a quedar libre');
select pruebas.igual((public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'Persona Uno', '56900000001'))->>'ok', 'true', 'Después de anular puede volver a agendar');
insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000a', '1000000001');
select pruebas.falla($$insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000b', '1000000001')$$, '23505', 'Un número de WhatsApp no puede atender a dos ópticas');

-- ---------------------------------------------------------------------
-- 4. Permisos desde la app (usuarios con sesión y anónimos)
-- ---------------------------------------------------------------------
set role anon;
select pruebas.falla($$select public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'Anónimo', '56900000010')$$, '42501', 'Anónimo no puede agendar directo');
select pruebas.igual((select count(*)::text from public.citas_operativo), '0', 'Anónimo no ve citas');
select pruebas.falla($$select * from public.whatsapp_conversaciones$$, '42501', 'Anónimo no puede leer conversaciones');
reset role;

set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select pruebas.falla($$select public.agendar_cita_whatsapp('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1', '2030-05-10', '10:30', 'Usuario', '56900000011')$$, '42501', 'Un usuario no puede llamar las funciones del webhook');
select pruebas.falla($$select * from public.whatsapp_conversaciones$$, '42501', 'Un usuario no puede leer conversaciones');
select pruebas.falla($$insert into public.citas_operativo (tenant_id, operativo_id, fecha, hora, nombre, telefono) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000001b1', '2030-05-10', '10:00', 'Directo', '56900000012')$$, '42501', 'Nadie inserta citas saltándose el cupo');
select pruebas.falla($$insert into public.whatsapp_numeros (tenant_id, phone_number_id) values ('00000000-0000-0000-0000-00000000000b', '2000000002')$$, '42501', 'Una óptica no se anota un número por su cuenta');
select pruebas.igual((select count(*)::text from public.citas_operativo), '0', 'B no ve citas de A');
select pruebas.igual((select count(*)::text from public.whatsapp_numeros), '0', 'B no ve el número de A');
update public.citas_operativo set estado = 'asistio';
select pruebas.como('00000000-0000-0000-0000-0000000000a2');
select pruebas.igual((select count(*)::text from public.citas_operativo where estado = 'agendada'), '2', 'Ventas de A ve las horas de su óptica (B no las cambió)');
update public.citas_operativo set estado = 'asistio' where telefono = '56900000002';
select pruebas.igual((select estado from public.citas_operativo where telefono = '56900000002'), 'asistio', 'El equipo de A marca quién llegó');

-- ---------------------------------------------------------------------
-- 5. Tope diario del asistente de IA
-- ---------------------------------------------------------------------
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'false', 'Ventas no usa el asistente');
select pruebas.como('00000000-0000-0000-0000-0000000000a1');
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'true', 'El administrador puede preguntar');
reset role;
update public.uso_asistente set preguntas = 150 where tenant_id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'false', 'Pasadas 150 preguntas del día se detiene');
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select pruebas.igual(public.registrar_pregunta_asistente()::text, 'true', 'El tope de A no afecta a B');
select pruebas.igual((select count(*)::text from public.uso_asistente), '1', 'B solo ve su propio uso');
reset role;

do $$ begin raise notice 'OK  FIN: agenda por WhatsApp, permisos, aislamiento y tope del asistente'; end $$;
