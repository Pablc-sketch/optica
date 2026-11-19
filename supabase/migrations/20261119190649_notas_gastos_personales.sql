alter table public.gastos_globales
 add column nota text not null default '' check (length(nota)<=1000);
comment on column public.gastos_globales.nota is 'Detalle y contexto del gasto; no altera su importe ni las devoluciones.';
notify pgrst,'reload schema';
