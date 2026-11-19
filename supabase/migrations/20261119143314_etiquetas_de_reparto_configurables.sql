alter table public.tenants add column reparto_etiquetas jsonb not null default '{}'::jsonb check(jsonb_typeof(reparto_etiquetas)='object' and octet_length(reparto_etiquetas::text)<=500);
