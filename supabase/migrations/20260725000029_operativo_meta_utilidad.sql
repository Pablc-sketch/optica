-- Meta opcional de utilidad neta por operativo, igual que meta_examenes y
-- meta_ventas — para saber si el operativo dejó lo que se esperaba, no solo
-- cuánto se vendió.
alter table public.operativos
  add column if not exists meta_utilidad bigint;
