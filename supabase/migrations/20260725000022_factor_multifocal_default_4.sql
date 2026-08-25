-- El factor por defecto de multifocal (2) quedaba muy bajo frente a lo que
-- realmente se cobra en el mercado: con costo + el monto de marco absorbido
-- ($25.000), un multifocal con antirreflejo terminaba en ~$103.000 en vez
-- de los ~$180.000 reales. Con factor 4 (mismo que bifocal) da ~$181.000,
-- justo en el rango esperado.
alter table public.tenants alter column factor_multifocal set default 4;
