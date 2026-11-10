-- Pruebas de reservas, costos, configuración y aislamiento entre ópticas.
-- Solo datos ficticios. Se corren con tests/db/probar.sh sobre una base
-- recién creada por tests/db/rehacer.sh.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Herramientas
-- ---------------------------------------------------------------------
create schema pruebas;
grant usage on schema pruebas to authenticated;

create function pruebas.ok(nombre text) returns void language plpgsql as $$
begin raise notice 'OK  %', nombre; end $$;

create function pruebas.igual(actual text, esperado text, nombre text) returns void language plpgsql as $$
begin
  if actual is distinct from esperado then
    raise exception 'FALLO % — se esperaba «%» y salió «%»', nombre, esperado, actual;
  end if;
  raise notice 'OK  %', nombre;
end $$;

-- Ejecuta sql y exige que falle con ese código y un mensaje que contenga el texto.
create function pruebas.falla(sql text, codigo text, contiene text, nombre text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate <> codigo or position(lower(contiene) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO % — error inesperado [%] %', nombre, sqlstate, sqlerrm;
    end if;
    raise notice 'OK  % → «%»', nombre, sqlerrm;
    return;
  end;
  raise exception 'FALLO % — se esperaba un error y se guardó', nombre;
end $$;
grant execute on all functions in schema pruebas to authenticated;

-- Actuar como un usuario (la base calcula óptica y rol desde users).
create function pruebas.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;

-- ---------------------------------------------------------------------
-- Datos ficticios: dos ópticas nuevas (A y B)
-- ---------------------------------------------------------------------
insert into public.tenants (id, nombre_comercial) values
  ('00000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('00000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');
insert into public.suscripciones (tenant_id, estado, fecha_renovacion) values
  ('00000000-0000-0000-0000-00000000000a', 'activa', current_date + 30),
  ('00000000-0000-0000-0000-00000000000b', 'activa', current_date + 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'ventas-a@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'bodega-a@ejemplo.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@ejemplo.invalid');
insert into public.users (id, tenant_id, nombre, email, rol) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Admin A', 'admin-a@ejemplo.invalid', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'Ventas A', 'ventas-a@ejemplo.invalid', 'ventas'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'Bodega A', 'bodega-a@ejemplo.invalid', 'bodega'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Admin B', 'admin-b@ejemplo.invalid', 'admin');

-- ---------------------------------------------------------------------
-- 1. Configuración por óptica
-- ---------------------------------------------------------------------
select pruebas.igual(
  (select concat_ws('|', precio_consulta, costo_marco_por_par, usa_catalogo_compartido, reparto is null)
     from public.configuracion_optica where tenant_id = '00000000-0000-0000-0000-00000000000a'),
  '0|f|t', 'Óptica nueva parte en blanco: sin consulta, marco $0, sin catálogo compartido ni reparto');
select pruebas.igual(
  (select concat_ws('|', precio_consulta, consulta_descuento, costo_marco_por_par, precio_marco_premium,
          usa_catalogo_compartido, reparto -> 'vendedora' ->> 'clave', jsonb_array_length(reparto -> 'socios'))
     from public.configuracion_optica where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'),
  '5000|total|5000|10000|t|isadora|2', 'Óptica Global conserva sus valores (consulta, marco, premium, catálogo, reparto)');
select pruebas.igual(
  (select abono_minimo_por_tipo::text from public.configuracion_optica where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'),
  '{"Bifocal": 40000, "Monofocal": 10000, "Multifocal": 80000}', 'Óptica Global conserva su abono mínimo por tipo');

-- Una óptica creada desde el registro no hereda el catálogo de Óptica Global.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'nueva@ejemplo.invalid');
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000c1');
select public.crear_optica('Óptica Ficticia C', null, 'Admin C');
reset role;
select pruebas.igual(
  (select count(*)::text from public.costos_cristales c join public.users u on u.tenant_id = c.tenant_id
    where u.id = '00000000-0000-0000-0000-0000000000c1'),
  '0', 'crear_optica ya no copia la plantilla de cristales de Óptica Global');
select pruebas.igual(
  (select concat_ws('|', t.agenda_paralela, c.precio_consulta is null, c.reparto is null)
     from public.users u join public.tenants t on t.id = u.tenant_id
     join public.configuracion_optica c on c.tenant_id = u.tenant_id
    where u.id = '00000000-0000-0000-0000-0000000000c1'),
  't|t|t', 'La óptica nueva admite operativos simultáneos y no trae configuración ajena');

-- El costo de marco queda guardado en cada venta con el valor de su óptica.
insert into public.ventas (id, tenant_id, total) values
  ('00000000-0000-0000-0000-0000000000f1', '7e4b2a1a-8926-4262-92e2-1f0e75951b9a', 48000),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', 48000);
insert into public.venta_items (tenant_id, venta_id, descripcion, cantidad, precio_unitario, cristal_slot) values
  ('7e4b2a1a-8926-4262-92e2-1f0e75951b9a', '00000000-0000-0000-0000-0000000000f1', 'Cristal', 1, 48000, 1),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'Cristal', 1, 48000, 1);
select pruebas.igual(
  (select string_agg(costo_marco::text, ',' order by venta_id) from public.venta_items
    where venta_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')),
  '5000,0', 'Costo de marco por venta: $5.000 en Óptica Global, $0 en la óptica nueva');
update public.configuracion_optica set costo_marco_por_par = 7000 where tenant_id = '00000000-0000-0000-0000-00000000000a';
select pruebas.igual(
  (select costo_marco::text from public.venta_items where venta_id = '00000000-0000-0000-0000-0000000000f2'),
  '0', 'Cambiar el costo de marco no reescribe ventas anteriores');

-- ---------------------------------------------------------------------
-- 2. Personal, equipos y kits (óptica A)
-- ---------------------------------------------------------------------
insert into public.personal (id, tenant_id, nombre, funciones) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000000a', 'Tecnóloga Uno', '{tecnologo}'),
  ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-00000000000a', 'Vendedor Uno', '{vendedor}'),
  ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-00000000000a', 'Coordinadora Uno', '{coordinador}'),
  ('00000000-0000-0000-0000-0000000001a4', '00000000-0000-0000-0000-00000000000a', 'Tecnólogo Dos', '{tecnologo,vendedor}'),
  ('00000000-0000-0000-0000-0000000001a5', '00000000-0000-0000-0000-00000000000a', 'Vendedora Dos', '{vendedor}'),
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000000b', 'Persona de B', '{tecnologo}');
insert into public.equipos (id, tenant_id, nombre, tipo, codigo) values
  ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-00000000000a', 'Autorefractómetro 1', 'autorefractometro', 'AR-001'),
  ('00000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-00000000000a', 'Lensómetro 1', 'lensometro', 'LE-001'),
  ('00000000-0000-0000-0000-0000000002a3', '00000000-0000-0000-0000-00000000000a', 'Maleta de lentes', 'maleta', 'MA-001'),
  ('00000000-0000-0000-0000-0000000002a4', '00000000-0000-0000-0000-00000000000a', 'Autorefractómetro 2', 'autorefractometro', 'AR-002'),
  ('00000000-0000-0000-0000-0000000002a5', '00000000-0000-0000-0000-00000000000a', 'Lensómetro 2', 'lensometro', 'LE-002'),
  ('00000000-0000-0000-0000-0000000002a6', '00000000-0000-0000-0000-00000000000a', 'Maleta de lentes 2', 'maleta', 'MA-002');
insert into public.kits (id, tenant_id, nombre) values
  ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-00000000000a', 'Kit 1'),
  ('00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-00000000000a', 'Kit 2 (comparte maleta con Kit 1)'),
  ('00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-00000000000a', 'Kit 3');
insert into public.kit_equipos (tenant_id, kit_id, equipo_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000002a2'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000002a3'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000002a4'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000002a5'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000002a3'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000002a4'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000002a5'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000002a6');

-- ---------------------------------------------------------------------
-- 3. Operativos y cruces (como administrador de A)
-- ---------------------------------------------------------------------
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000a1');

-- Dos operativos simultáneos con personas y kits distintos: válidos.
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a1", "nombre": "Operativo Norte", "direccion": "Calle Ficticia 1",
  "fecha": "2030-03-10", "fecha_fin": "2030-03-11",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"},
               {"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "vendedor"}],
  "kits": ["00000000-0000-0000-0000-0000000003a1"]}');
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a2", "nombre": "Operativo Sur", "direccion": "Calle Ficticia 2",
  "fecha": "2030-03-11",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a4", "funcion": "tecnologo"},
               {"id": "00000000-0000-0000-0000-0000000001a5", "funcion": "vendedor"},
               {"id": "00000000-0000-0000-0000-0000000001a3", "funcion": "coordinador"}],
  "kits": ["00000000-0000-0000-0000-0000000003a3"]}');
select pruebas.igual((select count(*)::text from public.operativos where id in
  ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2')), '2',
  'Operativos simultáneos con personas y kits distintos se guardan');
select pruebas.igual((select count(*)::text from public.operativo_reservas where operativo_id = '00000000-0000-0000-0000-0000000004a1'), '6',
  'Reservas del operativo: 2 personas + kit + sus 3 equipos');

-- La misma persona en otro operativo que se cruza: rechazado y dice dónde está.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a3", "nombre": "Operativo Choque Persona", "fecha": "2030-03-11",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"}], "kits": []}')$$,
  '23P01', 'Tecnóloga Uno ya está reservado en «Operativo Norte»', 'Misma persona en fechas cruzadas');
select pruebas.igual((select count(*)::text from public.operativos where id = '00000000-0000-0000-0000-0000000004a3'), '0',
  'El operativo rechazado no queda a medias');

-- El mismo kit: rechazado.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a3", "nombre": "Operativo Choque Kit", "fecha": "2030-03-10",
  "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a1"]}')$$,
  '23P01', 'Operativo Norte', 'Mismo kit en fechas cruzadas');

-- Un kit distinto que comparte un equipo (la maleta MA-001): rechazado por el componente.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a3", "nombre": "Operativo Choque Componente", "fecha": "2030-03-10",
  "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a2"]}')$$,
  '23P01', 'MA-001', 'Componente compartido entre dos kits');

-- Mismo kit y persona en fechas que no se cruzan: válido.
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a4", "nombre": "Operativo Abril", "fecha": "2030-04-02",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"}],
  "kits": ["00000000-0000-0000-0000-0000000003a1"]}');
select pruebas.ok('Misma persona y kit en otra fecha se guardan');

-- Horarios: mañana y tarde del mismo día con la misma persona no se cruzan.
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a5", "nombre": "Mañana", "fecha": "2030-05-05",
  "hora_inicio": "09:00", "hora_fin": "13:00",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "vendedor"}], "kits": []}');
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a6", "nombre": "Tarde", "fecha": "2030-05-05",
  "hora_inicio": "14:00", "hora_fin": "18:00",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "vendedor"}], "kits": []}');
select pruebas.ok('Mañana y tarde del mismo día con la misma persona');
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a7", "nombre": "Mediodía", "fecha": "2030-05-05",
  "hora_inicio": "12:00", "hora_fin": "15:00",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "vendedor"}], "kits": []}')$$,
  '23P01', 'Vendedor Uno', 'Horario que se cruza con mañana y tarde');
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a7", "nombre": "Jornada completa", "fecha": "2030-05-05",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "vendedor"}], "kits": []}')$$,
  '23P01', 'Vendedor Uno', 'Jornada completa sobre un día con horarios');

-- Validaciones de entrada.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a7", "nombre": "Función no registrada", "fecha": "2030-06-01",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a2", "funcion": "tecnologo"}], "kits": []}')$$,
  '22023', 'función', 'Persona en una función que no tiene');
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a7", "nombre": "Duplicada", "fecha": "2030-06-01",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a4", "funcion": "tecnologo"},
               {"id": "00000000-0000-0000-0000-0000000001a4", "funcion": "vendedor"}], "kits": []}')$$,
  '22023', 'dos veces', 'La misma persona dos veces en un operativo');
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a7", "nombre": "Fechas al revés", "fecha": "2030-06-05", "fecha_fin": "2030-06-01",
  "personas": [], "kits": []}')$$,
  '22023', 'fecha final', 'Fecha final anterior a la inicial');

-- ---------------------------------------------------------------------
-- 4. Edición, reasignación y cancelación
-- ---------------------------------------------------------------------
-- Mover el Operativo Abril al 10 de marzo choca con Norte: no cambia nada.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a4", "nombre": "Operativo Abril", "fecha": "2030-03-10",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"}],
  "kits": ["00000000-0000-0000-0000-0000000003a1"]}')$$,
  '23P01', 'Operativo Norte', 'Editar fechas hacia un cruce');
select pruebas.igual((select fecha::text from public.operativos where id = '00000000-0000-0000-0000-0000000004a4'), '2030-04-02',
  'La edición rechazada deja fecha y reservas como estaban');
select pruebas.igual((select count(*)::text from public.operativo_reservas where operativo_id = '00000000-0000-0000-0000-0000000004a4'), '5',
  'Las reservas del operativo siguen intactas tras el rechazo');

-- Cambiar la fecha desde otra pantalla (UPDATE directo) también mueve o rechaza.
select pruebas.falla($$update public.operativos set fecha = '2030-03-10' where id = '00000000-0000-0000-0000-0000000004a4'$$,
  '23P01', 'reserva_sin_cruce', 'Cambiar fecha desde otra pantalla respeta las reservas');
update public.operativos set fecha = '2030-04-03' where id = '00000000-0000-0000-0000-0000000004a4';
select pruebas.igual((select string_agg(distinct lower(tramo)::date::text, ',') from public.operativo_reservas
  where operativo_id = '00000000-0000-0000-0000-0000000004a4'), '2030-04-03', 'Las reservas siguen a la nueva fecha');

-- Reasignar: Norte cambia Tecnóloga Uno por Tecnólogo Dos… que está en Sur (11/03): choca.
select pruebas.falla($$select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a1", "nombre": "Operativo Norte", "fecha": "2030-03-10", "fecha_fin": "2030-03-11",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a4", "funcion": "tecnologo"}],
  "kits": ["00000000-0000-0000-0000-0000000003a1"]}')$$,
  '23P01', 'Operativo Sur', 'Reasignar a alguien ocupado');
-- Acortar Norte a un día y reasignar: ahora sí, y Tecnóloga Uno queda libre.
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a1", "nombre": "Operativo Norte", "fecha": "2030-03-10",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a4", "funcion": "vendedor"}],
  "kits": ["00000000-0000-0000-0000-0000000003a1"]}');
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a3", "nombre": "Operativo Este", "fecha": "2030-03-10",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"}], "kits": []}');
select pruebas.ok('Reasignar libera a la persona anterior en la misma transacción');

-- Cancelar Norte libera su kit: Operativo Oeste puede usar Kit 2 (comparte la maleta).
update public.operativos set estado = 'cancelado' where id = '00000000-0000-0000-0000-0000000004a1';
select pruebas.igual((select bool_or(activo)::text from public.operativo_reservas where operativo_id = '00000000-0000-0000-0000-0000000004a1'),
  'false', 'Cancelar desactiva todas sus reservas');
select public.guardar_operativo_equipo('{
  "id": "00000000-0000-0000-0000-0000000004a8", "nombre": "Operativo Oeste", "fecha": "2030-03-10",
  "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a2"]}');
select pruebas.ok('Tras cancelar, el componente compartido queda disponible');
-- Reactivar Norte ahora chocaría con Oeste por la maleta: se rechaza.
select pruebas.falla($$update public.operativos set estado = 'planificado' where id = '00000000-0000-0000-0000-0000000004a1'$$,
  '23P01', 'reserva_sin_cruce', 'Reactivar un operativo cancelado respeta las reservas');

-- Cambiar la composición de un kit: agregar un equipo ocupado se rechaza.
reset role;
insert into public.equipos (id, tenant_id, nombre, tipo, codigo) values
  ('00000000-0000-0000-0000-0000000002a7', '00000000-0000-0000-0000-00000000000a', 'Cartilla', 'cartilla', 'CA-001');
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000a1');
insert into public.kit_equipos (tenant_id, kit_id, equipo_id)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000002a7');
select pruebas.igual((select count(*)::text from public.operativo_reservas
  where operativo_id = '00000000-0000-0000-0000-0000000004a2' and equipo_id = '00000000-0000-0000-0000-0000000002a7'), '1',
  'Agregar un equipo a un kit lo reserva en sus operativos futuros');
-- Junio: Kit 1 y Kit 3 el mismo día (no comparten equipos). Meter el
-- autorefractómetro AR-001 (de Kit 1) también en Kit 3 lo dejaría en dos lugares.
select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004aa", "nombre": "Junio A",
  "fecha": "2030-06-10", "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a1"]}');
select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004ab", "nombre": "Junio B",
  "fecha": "2030-06-10", "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a3"]}');
select pruebas.falla($$insert into public.kit_equipos (tenant_id, kit_id, equipo_id)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000003a3', '00000000-0000-0000-0000-0000000002a1')$$,
  '23P01', 'reserva_sin_cruce', 'Agregar a un kit un equipo ocupado en la misma fecha');
select pruebas.igual((select count(*)::text from public.kit_equipos where kit_id = '00000000-0000-0000-0000-0000000003a3'), '4',
  'La composición del kit no cambió tras el rechazo');

-- guardar_kit: cambia nombre y composición juntos, o nada.
select pruebas.falla($$select public.guardar_kit('{"id": "00000000-0000-0000-0000-0000000003a3", "nombre": "Kit 3 renombrado",
  "equipos": ["00000000-0000-0000-0000-0000000002a4", "00000000-0000-0000-0000-0000000002a1"]}')$$,
  '23P01', 'ya está reservado', 'guardar_kit con un equipo ocupado');
select pruebas.igual((select nombre || '|' || (select count(*) from public.kit_equipos where kit_id = k.id)
  from public.kits k where id = '00000000-0000-0000-0000-0000000003a3'), 'Kit 3|4', 'El kit rechazado conserva nombre y composición');
select public.guardar_kit('{"id": "00000000-0000-0000-0000-0000000003a4", "nombre": "Kit nuevo",
  "equipos": ["00000000-0000-0000-0000-0000000002a6"]}');
select pruebas.ok('guardar_kit crea un kit con sus equipos');

-- ---------------------------------------------------------------------
-- 5. Costos: presupuesto y gasto real
-- ---------------------------------------------------------------------
insert into public.operativo_costos (tenant_id, operativo_id, categoria, presupuesto, real) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a2', 'hospedaje', 40000, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a2', 'transporte', 20000, 18000),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a2', 'arriendo', 50000, 50000);
select pruebas.igual((select concat_ws('|', presupuesto_total, costo_detalle_real) from public.operativos
  where id = '00000000-0000-0000-0000-0000000004a2'), '110000|68000',
  'Presupuesto y gasto real se suman por separado (el presupuesto no es gasto)');
select pruebas.falla($$update public.operativos set costo_transporte = 18000 where id = '00000000-0000-0000-0000-0000000004a2'$$,
  '23514', 'un solo lugar', 'No se puede anotar el mismo gasto en la columna antigua y en el detalle');
update public.operativos set costo_viaticos = 9000 where id = '00000000-0000-0000-0000-0000000004a2';
select pruebas.falla($$insert into public.operativo_costos (tenant_id, operativo_id, categoria, real)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a2', 'viaticos', 9000)$$,
  '23514', 'un solo lugar', 'Ni al revés: gasto real en el detalle si ya está en la columna');

-- ---------------------------------------------------------------------
-- 6. Permisos por rol dentro de la misma óptica
-- ---------------------------------------------------------------------
select pruebas.como('00000000-0000-0000-0000-0000000000a2');
select pruebas.igual((select count(*)::text from public.personal), '5', 'Ventas ve el personal de su óptica');
select pruebas.falla($$insert into public.personal (nombre, funciones) values ('Intruso', '{vendedor}')$$,
  '42501', 'row-level security', 'Ventas no puede crear personal');
select pruebas.falla($$select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004a9",
  "nombre": "Por ventas", "fecha": "2030-07-01", "personas": [], "kits": []}')$$,
  '42501', 'administrador', 'Ventas no puede organizar operativos');
select pruebas.igual((select count(*)::text from public.operativo_costos), '0', 'Ventas no ve los costos');
select pruebas.como('00000000-0000-0000-0000-0000000000a3');
select pruebas.igual((select count(*)::text from public.operativo_reservas), '0', 'Bodega no ve reservas ni personal');

-- ---------------------------------------------------------------------
-- 7. Aislamiento entre ópticas (como administrador de B)
-- ---------------------------------------------------------------------
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select pruebas.igual((select count(*)::text from public.personal), '1', 'B solo ve su personal');
select pruebas.igual((select count(*)::text from public.equipos) || '|' || (select count(*) from public.kits) || '|' ||
  (select count(*) from public.operativo_reservas) || '|' || (select count(*) from public.operativo_costos) || '|' ||
  (select count(*) from public.configuracion_optica), '0|0|0|0|1', 'B no ve equipos, kits, reservas, costos ni configuración de A');
select pruebas.falla($$select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004b1",
  "nombre": "B usa persona de A", "fecha": "2030-03-10",
  "personas": [{"id": "00000000-0000-0000-0000-0000000001a1", "funcion": "tecnologo"}], "kits": []}')$$,
  '22023', 'de esta óptica', 'B no puede reservar personal de A cambiando el identificador');
select pruebas.falla($$select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004b1",
  "nombre": "B usa kit de A", "fecha": "2030-03-10", "personas": [], "kits": ["00000000-0000-0000-0000-0000000003a3"]}')$$,
  '22023', 'de esta óptica', 'B no puede reservar un kit de A');
select pruebas.falla($$select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004a2",
  "nombre": "B pisa operativo de A", "fecha": "2031-01-01", "personas": [], "kits": []}')$$,
  '23505', 'duplicate key', 'B no puede editar un operativo de A con su identificador');
update public.operativos set nombre = 'Hackeado' where id = '00000000-0000-0000-0000-0000000004a2';
delete from public.operativo_reservas where operativo_id = '00000000-0000-0000-0000-0000000004a2';
update public.configuracion_optica set precio_consulta = 1 where tenant_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select pruebas.igual((select nombre || '|' || (select count(*) from public.operativo_reservas r where r.operativo_id = o.id)
  from public.operativos o where id = '00000000-0000-0000-0000-0000000004a2'), 'Operativo Sur|8',
  'Las escrituras de B sobre datos de A no afectan nada');
select pruebas.igual((select coalesce(precio_consulta::text, 'null') from public.configuracion_optica
  where tenant_id = '00000000-0000-0000-0000-00000000000a'), 'null', 'B no puede cambiar la configuración de A');
-- B puede usar las mismas fechas que A con sus propios recursos.
set role authenticated;
select pruebas.como('00000000-0000-0000-0000-0000000000b1');
select public.guardar_operativo_equipo('{"id": "00000000-0000-0000-0000-0000000004b2", "nombre": "Operativo de B",
  "fecha": "2030-03-10", "personas": [{"id": "00000000-0000-0000-0000-0000000001b1", "funcion": "tecnologo"}], "kits": []}');
select pruebas.ok('Otra óptica reserva sus propios recursos en las mismas fechas');
reset role;

select pruebas.ok('FIN: todas las pruebas de reservas, costos, configuración y aislamiento');
