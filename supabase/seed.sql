-- Seed SOLO para desarrollo local (se ejecuta en `supabase db reset`).
-- Crea la óptica demo con su admin y datos de ejemplo tomados del SGO real.
-- Credenciales de desarrollo: demo@optica.cl / demo1234

-- Tenant demo
insert into public.tenants (id, nombre_comercial, rut_empresa, plan)
values ('11111111-1111-1111-1111-111111111111', 'Óptica P&P', '77.123.456-7', 'trial');

-- Usuario auth (patrón estándar de seed local de Supabase)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'demo@optica.cl',
  extensions.crypt('demo1234', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"demo@optica.cl"}',
  'email', '22222222-2222-2222-2222-222222222222', now(), now(), now()
);

insert into public.users (id, tenant_id, nombre, email, rol)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        'Pablo', 'demo@optica.cl', 'admin');

-- Sucursal y proveedor
insert into public.sucursales (id, tenant_id, nombre, direccion)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        'Casa Matriz', 'Av. Principal 123');

insert into public.proveedores (id, tenant_id, nombre, tipo)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
        'Optiland', 'laboratorio');

-- Matriz de costos del tenant demo: copia de la plantilla real
insert into public.costos_cristales (tenant_id, tipo_lente, rango_receta, tratamiento, costo)
select '11111111-1111-1111-1111-111111111111', tipo_lente, rango_receta, tratamiento, costo
from public.plantilla_costos_cristales;

-- Armazones de la hoja INVENTARIO del SGO (marca, modelo, color, costo, precio en CLP)
insert into public.productos (id, tenant_id, categoria, nombre, sku, marca, color, costo, precio_venta) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'armazon', 'Classic Round', 'M-015', 'Optiland', 'Carey', 18000, 45000),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'armazon', 'Square Pro', 'M-023', 'Optiland', 'Negro', 22000, 55000),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'armazon', 'Oval Slim', 'M-042', 'Luxe', 'Negro', 28000, 70000),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'armazon', 'Cat Eye', 'M-055', 'Luxe', 'Rosado', 24000, 60000),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'armazon', 'Rimless Metal', 'M-098', 'Básico', 'Dorado', 15000, 38000),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'armazon', 'Wayfarer', 'M-112', 'Básico', 'Azul', 20000, 50000),
  ('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'armazon', 'Aviator', 'M-134', 'Premium', 'Plata', 35000, 85000),
  ('a0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'armazon', 'Oversized', 'M-156', 'Premium', 'Negro', 32000, 80000);

insert into public.inventario (tenant_id, sucursal_id, producto_id, stock_actual, stock_minimo)
select '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', id,
       case sku when 'M-156' then 3 when 'M-134' then 4 when 'M-023' then 4 else 8 end,
       case when sku in ('M-156', 'M-134', 'M-023') then 4 else 2 end
from public.productos
where tenant_id = '11111111-1111-1111-1111-111111111111';

-- Pacientes de ejemplo (los del SGO)
insert into public.pacientes (id, tenant_id, nombre, rut, telefono) values
  ('b0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'María González López', '16.123.873-4', '+56 9 8765 4321'),
  ('b0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Carlos Muñoz Rivera', '4.323.456-5', '+56 9 7654 3210'),
  ('b0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Ana Pérez Soto', null, '+56 9 6543 2109'),
  ('b0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Luis Rodríguez Vega', null, '+56 9 5432 1098'),
  ('b0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Sofía Martínez Cruz', null, '+56 9 4321 0987');

-- Recetas (hoja LABORATORIO)
insert into public.recetas (id, tenant_id, paciente_id, profesional_id, od_esfera, od_cilindro, od_eje, oi_esfera, oi_cilindro, oi_eje, od_add, oi_add, dp, altura, tipo) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', -1.25, -0.50, 180, -1.00, -0.25, 175, 1.50, 1.50, 63, 20, 'lejos'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', -2.00, -1.00, 90, -1.75, -0.75, 85, 2.00, 2.00, 64, 22, 'progresivo'),
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 0.50, null, null, 0.75, null, null, 1.00, 1.00, 60, 18, 'cerca');

-- OTs en distintos estados para el kanban
insert into public.ordenes_trabajo (tenant_id, paciente_id, receta_id, sucursal_id, estado, armazon_producto_id, tipo_lente, rango_receta, tratamiento, origen_cristal, proveedor_lab_id, costo_laboratorio, fecha_entrega_estimada) values
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'recepcion',   'a0000000-0000-0000-0000-000000000003', 'Monofocal',  '±2.00 / ±2.00', 'Orgánico Antirreflejo',           'laboratorio', '44444444-4444-4444-4444-444444444444', 2740,  current_date + 7),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'laboratorio', 'a0000000-0000-0000-0000-000000000001', 'Multifocal', '±4.00 / ±2.00', 'Fotocromático Gris Filtro Azul',  'laboratorio', '44444444-4444-4444-4444-444444444444', 62000, current_date + 5),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'montaje',     'a0000000-0000-0000-0000-000000000005', 'Monofocal',  '±2.00 / ±2.00', 'Orgánico Filtro Azul',            'stock',       null, 0, current_date + 2),
  ('11111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000004', null, '33333333-3333-3333-3333-333333333333', 'listo',       'a0000000-0000-0000-0000-000000000002', 'Multifocal', '±4.00 / ±4.00', 'Multifocal Antirreflejo',         'laboratorio', '44444444-4444-4444-4444-444444444444', 39000, current_date - 1);

-- Una venta de hoy con abono parcial (para el dashboard)
insert into public.ventas (id, tenant_id, paciente_id, sucursal_id, vendedor_id, fecha, total, estado_pago)
values ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'b0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        '22222222-2222-2222-2222-222222222222', now(), 86440, 'abono_parcial');

insert into public.venta_items (tenant_id, venta_id, producto_id, descripcion, cantidad, precio_unitario) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Armazón Luxe Oval Slim Negro', 1, 70000),
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', null, 'Cristales Monofocal Orgánico Antirreflejo ±2.00/±2.00', 1, 16440);

insert into public.pagos_abonos (tenant_id, venta_id, monto, medio_pago)
values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 50000, 'efectivo');
