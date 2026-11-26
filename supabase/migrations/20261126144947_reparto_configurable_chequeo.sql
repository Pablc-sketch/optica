alter table public.chequeos
  add column comision_isadora_pct numeric(5,2) not null default 10
    check (comision_isadora_pct between 0 and 100),
  add column reparto_pamela_pct numeric(5,2) not null default 50
    check (reparto_pamela_pct between 0 and 100);
