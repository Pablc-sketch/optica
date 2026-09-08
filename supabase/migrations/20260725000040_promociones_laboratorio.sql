-- Promociones del laboratorio: un descuento sobre una parte de su lista,
-- con fecha de término.
--
-- Existe por un caso concreto. En septiembre de 2026 Fides tiene el
-- MULTIFOCAL ADVANCE (su gama alta) al 50%: queda a $17.000 el cristal
-- contra los $23.000 del CONFORT, que es el básico. Por eso conviene
-- pedir el mejor lente — sale más barato que el corriente. Pero es solo
-- por septiembre: el 1 de octubre vuelve a $34.000 y el mismo multifocal
-- pasa de costar $45.280 el par a $77.648. Sin la fecha guardada acá, ese
-- día la app seguiría cotizando con el precio de la promo y cada
-- multifocal se vendería con $32.000 menos de margen sin que nadie se dé
-- cuenta.
--
-- El descuento de promoción NO se suma al descuento de cliente: manda el
-- mayor de los dos, que es como vino en la nota de venta 53160 (el
-- cristal con 50%, el montaje de esa misma orden con el 10% de siempre).
create table if not exists public.lab_promociones (
  id uuid primary key default gen_random_uuid(),
  laboratorio text not null default 'Fides',
  lista text not null default '2026',
  diseno text not null,
  -- null = todos los materiales de ese diseño.
  material text,
  descuento_pct numeric(5, 2) not null check (descuento_pct > 0 and descuento_pct <= 100),
  desde date not null,
  hasta date not null,
  nota text,
  check (hasta >= desde)
);

alter table public.lab_promociones enable row level security;

create policy "lab_promociones: lectura para cualquier óptica"
  on public.lab_promociones for select to authenticated using (true);

grant select on public.lab_promociones to authenticated;
grant all on public.lab_promociones to service_role;

insert into public.lab_promociones (diseno, material, descuento_pct, desde, hasta, nota)
values ('MULTIFOCAL ADVANCE', null, 50, '2026-09-01', '2026-09-30',
        'Promoción de septiembre: el ADVANCE queda bajo el precio del CONFORT')
on conflict do nothing;
