alter table public.mercadopago_sync add column capacidades jsonb not null default '{}'::jsonb
 check(jsonb_typeof(capacidades)='object' and octet_length(capacidades::text)<=1000);
