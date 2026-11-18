alter table public.tenants add column recargos_marcos jsonb;
alter table public.tenants add constraint tenants_recargos_marcos_validos check (
recargos_marcos is null or case when
jsonb_typeof(recargos_marcos)='object'
and jsonb_typeof(recargos_marcos->'esencial')='number'
and jsonb_typeof(recargos_marcos->'seleccion')='number'
and jsonb_typeof(recargos_marcos->'premium')='number'
then (recargos_marcos->>'esencial')::numeric=0
and (recargos_marcos->>'seleccion')::numeric between 0 and 99999999
and (recargos_marcos->>'premium')::numeric between (recargos_marcos->>'seleccion')::numeric and 99999999
and mod((recargos_marcos->>'seleccion')::numeric,1)=0
and mod((recargos_marcos->>'premium')::numeric,1)=0
else false end);
comment on column public.tenants.recargos_marcos is 'Recargo por línea de marco sobre el precio del par de cristales. NULL conserva la tarifa anterior de la óptica.';
