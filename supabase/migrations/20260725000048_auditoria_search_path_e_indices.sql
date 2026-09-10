-- Auditoría: dos cosas que el linter de Supabase venía marcando y que no
-- cambian nada de lo que se ve en pantalla, pero sí cómo se comporta la
-- base.

-- 1. search_path fijo en las funciones.
--
-- Una función sin search_path resuelve los nombres de tabla según el
-- search_path de quien la llama. Ninguna de estas es SECURITY DEFINER, así
-- que el riesgo hoy es bajo, pero custom_access_token_hook la ejecuta el
-- servicio de autenticación con su propio rol, y ahí sí conviene que
-- "users" signifique siempre public.users y nada más.
--
-- pg_temp va al final a propósito: es el esquema temporal de la sesión y
-- si quedara adelante podría tapar una tabla real con una temporal.
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.aplicar_movimiento_inventario() set search_path = public, pg_temp;
alter function public.puede_ver_clinico() set search_path = public, pg_temp;
alter function public.puede_editar_clinico() set search_path = public, pg_temp;
alter function public.puede_editar_ventas() set search_path = public, pg_temp;
alter function public.puede_editar_inventario() set search_path = public, pg_temp;
alter function public.es_admin() set search_path = public, pg_temp;
alter function public.custom_access_token_hook(jsonb) set search_path = public, pg_temp;
alter function public.recalcular_precios_cristales(text, numeric, bigint) set search_path = public, pg_temp;

-- 2. Índices que faltaban.
--
-- Todas las políticas de RLS filtran por tenant_id y todas las pantallas
-- arman sus totales cruzando venta → items → OT → pagos. Sin índice, cada
-- una de esas consultas recorre la tabla entera. Con 37 ventas no se nota;
-- con dos temporadas de operativos encima sí, y el momento de agregarlos
-- es antes de que moleste, no después.
create index if not exists idx_ventas_tenant_fecha on public.ventas (tenant_id, fecha desc);
create index if not exists idx_ventas_operativo on public.ventas (operativo_id);
create index if not exists idx_ventas_paciente on public.ventas (paciente_id);
create index if not exists idx_venta_items_venta on public.venta_items (venta_id);
create index if not exists idx_venta_items_ot on public.venta_items (ot_id);
create index if not exists idx_venta_items_producto on public.venta_items (producto_id);
create index if not exists idx_venta_items_tenant on public.venta_items (tenant_id);
create index if not exists idx_pagos_abonos_venta on public.pagos_abonos (venta_id);
create index if not exists idx_pagos_abonos_tenant_fecha on public.pagos_abonos (tenant_id, fecha desc);
create index if not exists idx_recetas_operativo on public.recetas (operativo_id);
create index if not exists idx_recetas_paciente on public.recetas (paciente_id);
create index if not exists idx_recetas_tenant on public.recetas (tenant_id);
create index if not exists idx_ot_paciente on public.ordenes_trabajo (paciente_id);
create index if not exists idx_ot_operativo on public.ordenes_trabajo (operativo_id);
create index if not exists idx_ot_receta on public.ordenes_trabajo (receta_id);
create index if not exists idx_operativos_tenant_fecha on public.operativos (tenant_id, fecha desc);
create index if not exists idx_productos_tenant on public.productos (tenant_id);
create index if not exists idx_gastos_globales_tenant_fecha on public.gastos_globales (tenant_id, fecha desc);
create index if not exists idx_retiros_tenant_fecha on public.retiros_sueldo (tenant_id, fecha desc);
create index if not exists idx_retiros_operativo on public.retiros_sueldo (operativo_id);
