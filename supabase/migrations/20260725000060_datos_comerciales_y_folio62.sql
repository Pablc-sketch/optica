-- Datos: reparación acotada del folio 62 (F01), equivalencia dudosa de
-- stock (F02), laboratorio Fides como proveedor y polarizados por color.
-- Todo restringido a la óptica P&P; no toca la óptica de prueba.

-- ---------------------------------------------------------------------
-- F01. Folio 62: el ítem de venta apunta al cupo 2 de la orden, pero el
-- cristal quedó guardado en el cupo 1 (se vendió solo el "Lente 2" y la
-- orden lo puso en su primer cupo). El costo de ese ítem se contaba $0.
-- Se renumera SOLO ese ítem al cupo 1, que es donde está su cristal, y se
-- deja registro. No cambia lo cobrado ni lo pagado.
-- ---------------------------------------------------------------------
create table if not exists public.reparaciones_datos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  motivo text not null,
  tabla text not null,
  fila_id uuid not null,
  antes jsonb,
  despues jsonb,
  created_at timestamptz not null default now()
);
alter table public.reparaciones_datos enable row level security;
create policy "reparaciones_datos: lectura de admin" on public.reparaciones_datos
  for select to authenticated using (tenant_id = public.jwt_tenant_id() and public.es_admin());

with objetivo as (
  select vi.id, vi.tenant_id, vi.cristal_slot
    from public.venta_items vi
    join public.ordenes_trabajo ot on ot.id = vi.ot_id
   where ot.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
     and ot.folio = 62
     and vi.cristal_slot = 2
     and ot.tipo_lente_2 is null
     and ot.tipo_lente is not null
), registro as (
  insert into public.reparaciones_datos (tenant_id, motivo, tabla, fila_id, antes, despues)
  select tenant_id,
         'F01: ítem del folio 62 apuntaba al cupo 2 vacío; su cristal está en el cupo 1',
         'venta_items', id,
         jsonb_build_object('cristal_slot', cristal_slot), jsonb_build_object('cristal_slot', 1)
    from objetivo
  returning fila_id
)
update public.venta_items set cristal_slot = 1 where id in (select fila_id from registro);

-- Desde ahora la base exige que cada ítem de cristal apunte a un cupo que
-- tenga cristal (lo mismo que ya valida el servidor).
create or replace function public.verificar_cupo_de_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ot_id is not null and new.cristal_slot is not null and not exists (
    select 1 from public.ordenes_trabajo ot
     where ot.id = new.ot_id
       and ((new.cristal_slot = 1 and ot.tipo_lente is not null) or (new.cristal_slot = 2 and ot.tipo_lente_2 is not null))
  ) then
    raise exception 'El ítem apunta al cupo % de la orden, que no tiene cristal', new.cristal_slot using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.verificar_cupo_de_item() from public, anon, authenticated;
create trigger trg_cupo_de_item before insert or update of ot_id, cristal_slot on public.venta_items
  for each row execute function public.verificar_cupo_de_item();

-- ---------------------------------------------------------------------
-- F02. Bifocal y multifocal "Fotocromático Gris Filtro Azul" tomaban de
-- stock FLAT TOP AR FOTO GRIS / MULTIFOCAL AR FOTO GRIS, que en la lista
-- de Fides NO dicen BLUE (la lista distingue "FOTO" de "FOTO ... BLUE").
-- Hasta que Fides confirme que ese cristal trae filtro azul, se pide de
-- laboratorio (ORGANICO FOTOCROMATICO BLUE FILTER), que sí lo trae. El
-- precio de venta no cambia: bifocal/multifocal cobran igual de stock o de
-- laboratorio. Se reversa con un update si Fides lo acredita.
-- ---------------------------------------------------------------------
update public.costos_cristales
   set material_stock = null, costo_stock = null
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento = 'Fotocromático Gris Filtro Azul';
update public.plantilla_costos_cristales
   set material_stock = null
 where tipo_lente in ('Bifocal', 'Multifocal') and tratamiento = 'Fotocromático Gris Filtro Azul';

-- ---------------------------------------------------------------------
-- Fides como laboratorio en Proveedores (no había ninguno registrado, así
-- que las órdenes quedaban sin laboratorio asignado).
-- ---------------------------------------------------------------------
insert into public.proveedores (tenant_id, nombre, tipo)
select '7e4b2a1a-8926-4262-92e2-1f0e75951b9a', 'Fides', 'laboratorio'
 where not exists (
   select 1 from public.proveedores
    where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tipo = 'laboratorio' and lower(nombre) = 'fides'
 );

update public.ordenes_trabajo ot
   set proveedor_lab_id = p.id
  from public.proveedores p
 where ot.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and p.tenant_id = ot.tenant_id and p.tipo = 'laboratorio' and lower(p.nombre) = 'fides'
   and ot.proveedor_lab_id is null
   and ot.estado in ('recepcion', 'laboratorio', 'montaje')
   and (ot.origen_cristal = 'laboratorio' or ot.origen_cristal_2 = 'laboratorio');

-- ---------------------------------------------------------------------
-- Polarizado: solo monofocal, en tres colores. Bifocal/multifocal
-- polarizado no se ofrece (de cerca, adentro, el polarizado oscurece la
-- lectura). Los tres colores cuestan lo mismo en Fides (mismo material,
-- ORGANICO POLARIZADO 1.49 HMC); el color va escrito en el pedido.
-- Ninguna orden usa bifocal/multifocal polarizado (verificado).
-- ---------------------------------------------------------------------
delete from public.costos_cristales
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento like 'Polarizado%';

insert into public.costos_cristales (
  tenant_id, tipo_lente, rango_receta, tratamiento, costo, costo_stock, precio_venta, precio_venta_stock,
  nombre_laboratorio, material_stock, material_laboratorio, diseno_laboratorio, montaje_material,
  diseno_laboratorio_proximo, diseno_proximo_desde)
select c.tenant_id, c.tipo_lente, c.rango_receta, color.tratamiento, c.costo, c.costo_stock, c.precio_venta, c.precio_venta_stock,
       c.nombre_laboratorio, c.material_stock, c.material_laboratorio, c.diseno_laboratorio, c.montaje_material,
       c.diseno_laboratorio_proximo, c.diseno_proximo_desde
  from public.costos_cristales c
 cross join (values ('Polarizado Café'), ('Polarizado Verde Oscuro')) as color (tratamiento)
 where c.tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and c.tipo_lente = 'Monofocal'
   and c.tratamiento = 'Polarizado Gris Oscuro'
on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing;
