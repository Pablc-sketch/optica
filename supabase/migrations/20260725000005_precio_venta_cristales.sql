-- El precio de VENTA de cada cristal es de la óptica y es editable,
-- independiente del costo de laboratorio. El factor del tenant solo se
-- usa para proponer un precio inicial (costo × factor); después la
-- óptica lo ajusta a gusto en la pantalla de Precios.

alter table public.costos_cristales
  add column precio_venta bigint not null default 0;

-- Precio inicial para las matrices ya existentes: costo × factor del tenant.
update public.costos_cristales cc
   set precio_venta = cc.costo * t.factor_venta_cristales
  from public.tenants t
 where t.id = cc.tenant_id;

-- El onboarding también propone el precio inicial con el factor.
create or replace function public.copiar_plantilla_costos()
returns integer
language sql
security definer
set search_path = public
as $$
  with ins as (
    insert into public.costos_cristales (tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta)
    select public.jwt_tenant_id(), p.tipo_lente, p.rango_receta, p.tratamiento, p.costo,
           p.costo * coalesce(
             (select t.factor_venta_cristales from public.tenants t where t.id = public.jwt_tenant_id()),
             6
           )
    from public.plantilla_costos_cristales p
    where public.jwt_tenant_id() is not null
    on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing
    returning 1
  )
  select count(*)::integer from ins
$$;
