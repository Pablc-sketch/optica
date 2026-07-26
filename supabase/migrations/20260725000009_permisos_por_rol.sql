-- Permisos por rol (spec sección 2). Hasta ahora cualquier usuario con
-- sesión podía tocar todo dentro de su óptica: bastaba con que el
-- tenant_id coincidiera. Eso alcanza para una óptica de una persona, no
-- para una con vendedores y bodeguero.
--
-- Matriz de la spec:
--   admin    → todo
--   clinico  → pacientes y recetas (lectura/escritura); ventas e inventario solo lectura
--   ventas   → ventas e inventario (lectura/escritura); pacientes y recetas solo lectura
--   bodega   → inventario únicamente; sin acceso a fichas clínicas
--
-- Las fichas clínicas son datos sensibles de salud (Ley 21.719): que
-- bodega no pueda leerlas no es un detalle de comodidad, es el principio
-- de mínimo privilegio que exige la ley.

create or replace function public.jwt_rol()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'rol', '')
$$;

-- Puede ver fichas clínicas (pacientes, recetas): todos menos bodega.
create or replace function public.puede_ver_clinico()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'clinico', 'ventas')
$$;

-- Puede editar fichas clínicas: solo quien atiende.
create or replace function public.puede_editar_clinico()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'clinico') and public.suscripcion_vigente()
$$;

-- Puede editar ventas y cobranza.
create or replace function public.puede_editar_ventas()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'ventas') and public.suscripcion_vigente()
$$;

-- Puede editar inventario y productos.
create or replace function public.puede_editar_inventario()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() in ('admin', 'ventas', 'bodega') and public.suscripcion_vigente()
$$;

-- Solo el admin toca la configuración de la óptica.
create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_rol() = 'admin' and public.suscripcion_vigente()
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'jwt_rol', 'puede_ver_clinico', 'puede_editar_clinico',
    'puede_editar_ventas', 'puede_editar_inventario', 'es_admin'
  ] loop
    execute format('revoke execute on function public.%I from public, anon', f);
    execute format('grant execute on function public.%I to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Fichas clínicas: pacientes y recetas
-- ---------------------------------------------------------------------------
drop policy if exists "pacientes: select solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: alta con suscripción vigente" on public.pacientes;
drop policy if exists "pacientes: edición con suscripción vigente" on public.pacientes;
drop policy if exists "pacientes: borrado con suscripción vigente" on public.pacientes;

create policy "pacientes: lectura clínica"
  on public.pacientes for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico());

create policy "pacientes: alta clínica"
  on public.pacientes for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "pacientes: edición clínica"
  on public.pacientes for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "pacientes: borrado clínico"
  on public.pacientes for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

drop policy if exists "recetas: lectura del propio tenant" on public.recetas;
drop policy if exists "recetas: alta con suscripción vigente" on public.recetas;
drop policy if exists "recetas: edición con suscripción vigente" on public.recetas;
drop policy if exists "recetas: borrado con suscripción vigente" on public.recetas;

create policy "recetas: lectura clínica"
  on public.recetas for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico());

create policy "recetas: alta clínica"
  on public.recetas for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "recetas: edición clínica"
  on public.recetas for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "recetas: borrado clínico"
  on public.recetas for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

-- ---------------------------------------------------------------------------
-- Ventas, cobranza y órdenes de trabajo
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'venta_items', 'pagos_abonos', 'ordenes_trabajo'] loop
    execute format('drop policy if exists "%s: lectura del propio tenant" on public.%I', t, t);
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    -- Bodega no necesita ver ventas ni el detalle clínico de las OTs.
    execute format(
      'create policy "%s: lectura comercial" on public.%I for select to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_ver_clinico())', t, t);

    execute format(
      'create policy "%s: alta comercial" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);

    execute format(
      'create policy "%s: edición comercial" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);

    execute format(
      'create policy "%s: borrado comercial" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_ventas())', t, t);
  end loop;
end $$;

-- El clínico crea la OT al terminar la atención, aunque no venda.
create policy "ordenes_trabajo: alta clínica"
  on public.ordenes_trabajo for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

create policy "ordenes_trabajo: edición clínica"
  on public.ordenes_trabajo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico())
  with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_clinico());

-- Bodega sí necesita mover las OTs por el taller (montaje, listo).
create policy "ordenes_trabajo: lectura de bodega"
  on public.ordenes_trabajo for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega');

create policy "ordenes_trabajo: avance de bodega"
  on public.ordenes_trabajo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega' and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_rol() = 'bodega' and public.suscripcion_vigente());

-- ---------------------------------------------------------------------------
-- Inventario, productos y proveedores
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['inventario', 'movimientos_inventario', 'productos', 'proveedores'] loop
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    execute format(
      'create policy "%s: alta de inventario" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);

    execute format(
      'create policy "%s: edición de inventario" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);

    execute format(
      'create policy "%s: borrado de inventario" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.puede_editar_inventario())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Configuración de la óptica: solo admin
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sucursales', 'costos_cristales', 'convenios', 'operativos'] loop
    execute format('drop policy if exists "%s: alta con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: edición con suscripción vigente" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrado con suscripción vigente" on public.%I', t, t);

    execute format(
      'create policy "%s: alta de admin" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);

    execute format(
      'create policy "%s: edición de admin" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.es_admin()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);

    execute format(
      'create policy "%s: borrado de admin" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.es_admin())', t, t);
  end loop;
end $$;

-- El admin gestiona los usuarios de su óptica. No puede cambiar el
-- tenant_id (lo fija el with check) ni ascender a nadie a superadmin:
-- es_superadmin queda fuera del alcance de cualquier óptica.
create policy "users: alta de admin"
  on public.users for insert to authenticated
  with check (
    tenant_id = public.jwt_tenant_id() and public.es_admin() and es_superadmin = false
  );

create policy "users: edición de admin"
  on public.users for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.es_admin())
  with check (
    tenant_id = public.jwt_tenant_id() and public.es_admin() and es_superadmin = false
  );

grant insert, update on public.users to authenticated;
grant update on public.tenants to authenticated;

create policy "tenants: edición de admin"
  on public.tenants for update to authenticated
  using (id = public.jwt_tenant_id() and public.es_admin())
  with check (id = public.jwt_tenant_id() and public.es_admin());
