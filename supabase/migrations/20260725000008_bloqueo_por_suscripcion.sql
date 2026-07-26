-- Cobro con dientes: al vencer la suscripción, la base deja de aceptar
-- escrituras de esa óptica. Bloquearlo solo en la interfaz sería cosmético
-- (cualquiera podría seguir escribiendo llamando a la API directamente).
--
-- Las LECTURAS se mantienen: la óptica siempre puede consultar y exportar
-- sus datos aunque no haya pagado. Los datos son suyos; lo que se corta es
-- la operación diaria.

create or replace function public.suscripcion_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.estado in ('trial', 'activa') and s.fecha_renovacion >= current_date
      from public.suscripciones s
      where s.tenant_id = public.jwt_tenant_id()
    ),
    true -- sin registro de suscripción no bloqueamos: es dato faltante, no impago
  )
$$;

revoke execute on function public.suscripcion_vigente from public, anon;
grant execute on function public.suscripcion_vigente to authenticated, service_role;

-- Tablas de dominio: la policy única "FOR ALL" se reemplaza por lectura
-- libre (dentro del tenant) y escritura condicionada al pago.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sucursales', 'proveedores', 'productos', 'inventario',
    'movimientos_inventario', 'recetas', 'costos_cristales',
    'ordenes_trabajo', 'ventas', 'venta_items', 'pagos_abonos',
    'convenios', 'operativos'
  ] loop
    execute format('drop policy if exists "%s: aislamiento por tenant" on public.%I', t, t);

    execute format(
      'create policy "%s: lectura del propio tenant" on public.%I for select to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id())', t, t);

    execute format(
      'create policy "%s: alta con suscripción vigente" on public.%I for insert to authenticated '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);

    execute format(
      'create policy "%s: edición con suscripción vigente" on public.%I for update to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente()) '
      || 'with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);

    execute format(
      'create policy "%s: borrado con suscripción vigente" on public.%I for delete to authenticated '
      || 'using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())', t, t);
  end loop;
end $$;

-- pacientes trae sus policies por operación desde la migración inicial.
drop policy if exists "pacientes: insert solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: update solo propio tenant" on public.pacientes;
drop policy if exists "pacientes: delete solo propio tenant" on public.pacientes;

create policy "pacientes: alta con suscripción vigente"
  on public.pacientes for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "pacientes: edición con suscripción vigente"
  on public.pacientes for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

create policy "pacientes: borrado con suscripción vigente"
  on public.pacientes for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
