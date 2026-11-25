alter table public.operativos
  add column if not exists archivado_en timestamptz,
  add column if not exists pagos_saldados_en timestamptz;
