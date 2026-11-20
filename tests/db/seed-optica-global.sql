-- Óptica ficticia con el MISMO identificador que Óptica Global, porque
-- varias migraciones históricas escriben datos con ese id fijo. Nombre y
-- datos son inventados: aquí no hay ningún paciente ni dato real.
insert into public.tenants (id, nombre_comercial)
values ('7e4b2a1a-8926-4262-92e2-1f0e75951b9a', 'Óptica Ficticia A')
on conflict (id) do nothing;
