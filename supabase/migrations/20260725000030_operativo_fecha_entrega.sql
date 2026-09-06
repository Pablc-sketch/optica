-- Día único en que se vuelve al lugar del operativo a entregar los lentes
-- terminados a todos los que compraron ahí — antes cada venta calculaba su
-- propia fecha estimada (hoy + plazo del laboratorio), así que la gente de
-- un mismo operativo quedaba con fechas de entrega distintas aunque en la
-- práctica se les entrega a todos el mismo día, cuando se vuelve a ir.
alter table public.operativos
  add column if not exists fecha_entrega_estimada date;
